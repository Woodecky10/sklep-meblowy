import { NextResponse, after, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { revalidatePath } from "next/cache";
import { poluDlaNowegoZapisu } from "@/app/_lib/reviews-moderation";
import { notifyAdminNewReview } from "@/app/_lib/mail/review-notify";
import {
  MAX_REVIEW_PHOTOS,
  odmianaZdjec,
  reviewPhotoPath,
  validateReviewPhotos,
} from "@/app/_lib/reviews-photos";

type Body = {
  productId: string;
  rating: number;
  comment?: string;
  // `unknown`, nie `string[]` — to jest payload z internetu, a nie obietnica.
  // Rozstrzyga validateReviewPhotos.
  photos?: unknown;
};

// Walidacja productId jako UUID — bez tego błędny id leciał do PostgREST,
// który zwracał error.message ujawniający schemat DB klientowi (audyt LOW).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Komunikat o opinii ZDJĘTEJ ze strony — jedna stała dla OBU odmów: edycji
// (POST, polityka „reviews: update własne" z migracji 78) i usunięcia (DELETE,
// polityka „reviews: delete własne" z migracji 80). Wspólna stała, a nie dwa
// osobne literały, bo to jest opis JEDNEGO stanu opinii i klient ma poznać
// prawdziwą przyczynę odmowy w obu ścieżkach tak samo.
//
// ⚠️ Zdanie wymienia OBIE zablokowane czynności celowo. Sama prawdziwa
// przyczyna nie wystarcza: komunikat mówiący wyłącznie „nie można edytować"
// pokazany komuś, kto właśnie kliknął „Usuń opinię", nazywa niewłaściwy
// skutek — klient nie dowiaduje się, że kasowanie też jest zablokowane,
// i klika drugi raz. Dopisując tu kolejną ścieżkę, dopisz ją do zdania.
const ZDJETA_ZE_STRONY = {
  pl: "Ta opinia została zdjęta ze strony przez sklep i nie można jej już edytować ani usunąć.",
  de: "Diese Bewertung wurde vom Shop von der Seite entfernt und kann nicht mehr bearbeitet oder gelöscht werden.",
} as const;

// Kasuje z Storage pliki zdjęć, które przestały być używane — po usunięciu
// opinii (DELETE) i po edycji, która zdjęła zdjęcie z opinii (POST).
//
// ⚠️ SEDNO TEJ FUNKCJI: obecność URL-a w wierszu NIE JEST dowodem, że autor
// tego wiersza wgrał ten plik. Walidacja zapisu sprawdza prefiks i kształt
// nazwy — nigdy autorstwo. Zweryfikowany kupujący może skopiować publiczny
// adres CUDZEGO zdjęcia prosto ze strony głównej, wysłać go w `photos` swojej
// opinii (przejdzie walidację), a potem skasować własną opinię. Bez poniższego
// sprawdzenia service role usunąłby wtedy plik CUDZEJ, opublikowanej opinii —
// zostawiając na stronie głównej, /opinie i karcie produktu trwale zepsute
// zdjęcie, nie do odzyskania. Samo POKAZANIE cudzego zdjęcia było możliwe
// wcześniej; ZNISZCZENIE go pojawiło się razem ze sprzątaniem plików.
//
// Dlatego: kasujemy wyłącznie te pliki, do których nie odwołuje się już ŻADNA
// inna opinia. `pomijanyReviewId` wyłącza z pytania wiersz, którego dotyczy
// operacja (przy edycji wiersz nadal istnieje).
//
// Reguła awaryjna jest asymetryczna i celowo ostrożna: gdy NIE WIEMY (błąd
// zapytania), NIE kasujemy. Osierocony plik jest odwracalny, skasowane cudze
// zdjęcie nie jest. Nic tutaj nie może też wywalić odpowiedzi dla klienta —
// jego opinia jest już zapisana albo skasowana i to jest wynik, który ma
// zobaczyć — więc całość jest w try/catch, a błędy idą wyłącznie do logu.
async function usunNieuzywaneZdjecia(
  urle: string[],
  pomijanyReviewId: string | null
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    // Mapa url -> ścieżka w buckecie. reviewPhotoPath to ta sama bramka
    // prefiksu i nazwy pliku, która pilnuje zapisu, więc do `remove` nie
    // trafi ścieżka spoza katalogu `opinie/`. Set na wejściu: ta sama opinia
    // mogła nieść ten sam URL dwa razy tylko w danych sprzed deduplikacji.
    const sciezki = new Map<string, string>();
    for (const url of new Set(urle)) {
      const sciezka = reviewPhotoPath(url, supabaseUrl);
      if (sciezka) sciezki.set(url, sciezka);
    }
    if (sciezki.size === 0) return;

    const admin = await createAdminClient();
    const doUsuniecia: string[] = [];
    for (const [url, sciezka] of sciezki) {
      // `.contains` na kolumnie text[] (operator `cs` w PostgREST) — pytamy
      // o FILTR po `photos`, a nie o `select("photos")`, więc nie łamie to
      // zasady fail-soft. Dopóki migracja 79 nie jest zaaplikowana, kolumny
      // nie ma i zapytanie zwróci błąd — wtedy (patrz niżej) NIE kasujemy,
      // co jest właściwym zachowaniem, a nie regresją.
      //
      // ⚠️ supabase-js skleja tu literał tablicy BEZ cytowania (`cs.{<url>}`),
      // więc URL nie może zawierać `,` `{` `}` `"` `\` ani spacji. Trzyma to
      // isOwnReviewPhotoUrl: nazwa pliku przechodzi wzorzec [A-Za-z0-9._-],
      // a prefiks jest stały. Gdyby ktoś ROZLUŹNIŁ tamten wzorzec, to
      // zapytanie zaczęłoby po cichu nie znajdować wierszy — czyli mylnie
      // uznawać cudze zdjęcie za nieużywane i je kasować. Jedno pytanie na
      // URL (a nie wszystkie naraz) usuwa przy okazji problem przecinka.
      let zapytanie = admin
        .from("product_reviews")
        .select("id")
        .contains("photos", [url])
        .limit(1);
      if (pomijanyReviewId) zapytanie = zapytanie.neq("id", pomijanyReviewId);
      const { data, error } = await zapytanie;
      if (error) {
        console.error("[opinie] nie sprawdzono, czy zdjęcie jest jeszcze używane:", {
          code: error.code,
          message: error.message,
        });
        continue;
      }
      if ((data ?? []).length === 0) doUsuniecia.push(sciezka);
    }
    if (doUsuniecia.length === 0) return;

    const { error: bladStorage } = await admin.storage
      .from("products")
      .remove(doUsuniecia);
    if (bladStorage) {
      console.error("[opinie] nie udało się usunąć plików zdjęć:", bladStorage.message);
    }
  } catch (e) {
    console.error("[opinie] wyjątek przy sprzątaniu plików zdjęć:", e);
  }
}

export async function POST(request: NextRequest) {
  // locale z query (?locale=de) — czytelne ZANIM sparsujemy body, więc działa
  // też dla błędu parsowania JSON. x-locale z proxy byłby tu zawsze "pl"
  // (fetch do /api/reviews nie ma prefiksu /de).
  const locale =
    new URL(request.url).searchParams.get("locale") === "de" ? "de" : "pl";
  const tr = (pl: string, de: string) => (locale === "de" ? de : pl);
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: tr("Nieprawidłowy JSON", "Ungültiges JSON") },
      { status: 400 }
    );
  }
  const { productId, rating, comment } = body;

  if (!productId || typeof rating !== "number") {
    return NextResponse.json(
      { error: tr("Brak wymaganych pól", "Pflichtfelder fehlen") },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(productId)) {
    return NextResponse.json(
      { error: tr("Nieprawidłowy productId", "Ungültige Produkt-ID") },
      { status: 400 }
    );
  }
  const ratingInt = Math.round(rating);
  if (ratingInt < 1 || ratingInt > 5) {
    return NextResponse.json(
      {
        error: tr(
          "Ocena musi być w zakresie 1–5",
          "Die Bewertung muss zwischen 1 und 5 liegen"
        ),
      },
      { status: 400 }
    );
  }

  // Bramka druga z trzech (widżet, tutaj, `check` w migracji 79) — i trzeba
  // wiedzieć, czego BRONI, a czego nie:
  //
  // - Ta walidacja broni ŚCIEŻKI APLIKACYJNEJ. NIE jest bramką nie do
  //   ominięcia: klucz anon jest jawny w paczce przeglądarki, a sesja siedzi
  //   w ciasteczku, więc bezpośredni upsert przez PostgREST omija tę trasę
  //   w całości (dokładnie ten sam argument stoi za politykami z migracji
  //   76 i 78 — patrz uzasadnienie W2 w 78).
  // - Jedyną bramką nie do ominięcia jest `check` z migracji 79 — ale pilnuje
  //   WYŁĄCZNIE liczby zdjęć, nie ich pochodzenia.
  // - Przed „dowolnym obrazkiem z internetu" ostatecznie ratuje
  //   `images.remotePatterns` w next.config.ts: renderują się wyłącznie nasz
  //   host Supabase i images.unsplash.com, więc obcy URL wstawiony z pominięciem
  //   tej trasy skończy jako zepsuta ikonka, a nie jako obraz na stronie.
  //
  // Prefiks (i wzorzec nazwy pliku — patrz isOwnReviewPhotoUrl) i tak jest tu
  // wymogiem: opinia ląduje na stronie głównej sklepu.
  const zdjecia = validateReviewPhotos(
    body.photos,
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
  if (!zdjecia.ok) {
    return NextResponse.json(
      {
        error:
          zdjecia.error === "count"
            ? tr(
                `Maksymalnie ${MAX_REVIEW_PHOTOS} ${odmianaZdjec(MAX_REVIEW_PHOTOS)}`,
                `Maximal ${MAX_REVIEW_PHOTOS} Fotos`
              )
            : tr("Nieprawidłowe zdjęcie", "Ungültiges Foto"),
      },
      { status: 400 }
    );
  }

  const trimmedComment =
    typeof comment === "string" ? comment.trim().slice(0, 2000) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") },
      { status: 401 }
    );
  }

  // Migracja 78 blokuje UPDATE opinii `rejected` (polityka „reviews: update
  // własne", warunek `status <> 'rejected'` w `using`) — to jedyny mechanizm,
  // który chroni decyzję Julii o zdjęciu opinii ze strony przed cofnięciem jej
  // przez autora. Sprawdzamy to jawnie PRZED upsertem, żeby zwrócić prawdziwy
  // komunikat: bez tego klient dostałby ten sam błąd, co przy braku zakupu
  // ("weryfikujemy zakupy klientów"), mimo że zakup ma i problemem jest
  // wyłącznie to, że jego opinia została zdjęta. Polityka „autor widzi swoje"
  // przepuszcza odczyt własnego wiersza niezależnie od statusu.
  //
  // ⚠️ `select("*")`, a NIE `select("status, photos")`: dopóki migracja 79 nie
  // jest zaaplikowana, kolumny `photos` NIE MA i nazwanie jej wprost sprawia,
  // że PostgREST odrzuca CAŁE zapytanie — pre-check przestałby działać. Przy
  // `*` brakująca kolumna to po prostu `undefined`. `photos` z tego samego
  // odczytu służy niżej do sprzątania plików zdjętych z opinii przy edycji.
  const { data: istniejaca } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .maybeSingle();
  const wiersz = istniejaca as { status: string; photos?: string[] } | null;
  // `photos` sprzed zapisu — po udanym upsercie porównamy je z nową listą
  // i sprzątniemy pliki, które z opinii wypadły. `undefined` przed migracją 79.
  const zdjeciaPrzedZapisem = Array.isArray(wiersz?.photos) ? wiersz.photos : [];
  if (wiersz?.status === "rejected") {
    return NextResponse.json(
      { error: tr(ZDJETA_ZE_STRONY.pl, ZDJETA_ZE_STRONY.de) },
      { status: 403 }
    );
  }

  // Upsert po (product_id, user_id) — edycja dotychczasowej opinii albo nowa.
  // RLS zadba o weryfikację zakupu (polityka reviews: insert po zakupie).
  const { data, error } = await supabase
    .from("product_reviews")
    .upsert(
      {
        product_id: productId,
        user_id: user.id,
        rating: ratingInt,
        comment: trimmedComment || null,
        // Zapisujemy PEŁNĄ listę, także pustą — edycja opinii jest wymianą
        // stanu, nie doklejaniem. Formularz prefillowuje listę z istniejącej
        // opinii, więc pusta lista tutaj znaczy „klient skasował zdjęcia",
        // a nie „klient nic nie przysłał" (ten drugi przypadek odsiewa
        // validateReviewPhotos, zwracając [] wyłącznie dla braku pola).
        photos: zdjecia.value,
        // Każdy zapis (nowa opinia I edycja) publikuje się od razu i wraca
        // Julii przed oczy: moderated_at znów jest puste, więc opinia ląduje
        // w „nowe — do przejrzenia". Bez zerowania stempla podmiana treści po
        // przejrzeniu przechodziłaby niezauważona.
        ...poluDlaNowegoZapisu(),
      } as never,
      { onConflict: "product_id,user_id" }
    )
    .select()
    .single();

  if (error) {
    // Typowy błąd: 403 z RLS gdy user nie ma zamówienia tego produktu.
    // error.message NIE trafia do klienta (wyciekał schemat DB) — log na serwerze.
    // Logujemy WYŁĄCZNIE code+message, nigdy całego obiektu: `error.details`
    // od PostgREST dla tej tabeli potrafi nieść adres e-mail klienta (konflikt
    // uniq_review_guest brzmi „Key (product_id, lower(guest_email))=(…, jan@x.pl)
    // already exists.") i wsadziłby go do logów hostingu. Ta sama zasada i to
    // samo uzasadnienie co w app/opinia/[token]/actions.ts.
    console.error("review upsert error:", { code: error.code, message: error.message });
    return NextResponse.json(
      {
        error: tr(
          "Nie możesz dodać opinii — weryfikujemy zakupy klientów.",
          "Sie können keine Bewertung abgeben — wir prüfen die Käufe der Kunden."
        ),
      },
      { status: 403 }
    );
  }

  // Zdjęcia, które klientka zdjęła z opinii tą edycją: były w wierszu przed
  // zapisem, nie ma ich w nowej liście. To jest ta sama sprawa, co sprzątanie
  // przy usunięciu opinii — a nawet WAŻNIEJSZA, bo to jest właśnie ścieżka,
  // którą idzie ktoś, kto opublikował zdjęcie i chce je wycofać: bez tego
  // „usunęłam zdjęcie" znaczyło tylko „zniknęło ze strony", a plik zostawał
  // pod publicznym adresem NA ZAWSZE. Adres był w HTML-u strony głównej,
  // /opinie i karty produktu, więc mają go crawlery i cache optymalizatora.
  //
  // Wiersz nadal istnieje, więc wykluczamy go z pytania „czy ktoś jeszcze
  // tego używa" — inaczej opinia zawsze blokowałaby sprzątanie sama sobie.
  const zdjeteZOpinii = zdjeciaPrzedZapisem.filter(
    (url) => !zdjecia.value.includes(url)
  );
  if (zdjeteZOpinii.length > 0) {
    await usunNieuzywaneZdjecia(zdjeteZOpinii, data.id as string);
  }

  // Mail do właścicielki PO udanym zapisie, przez after(): wysyłka nie może
  // opóźnić ani zepsuć odpowiedzi dla klienta, który opinię zapisał poprawnie
  // (ten sam wzorzec i uzasadnienie co w app/admin/zamowienia/actions.ts).
  // Leci też przy edycji — upsert nie rozróżnia nowej opinii od zmiany, a edycja
  // wraca właścicielce przed oczy równie mocno, jak zupełnie nowa opinia.
  after(() => notifyAdminNewReview(data.id));

  // Opinia publikuje się od razu — odśwież WSZYSTKIE ścieżki, gdzie się pojawia.
  // Karta produktu i /sklep biorą ją do średniej ocen; / ma slider opinii;
  // /opinie listuje wszystkie zatwierdzone (Omnibus). Bez tego byłaby widoczna
  // tylko dlatego, że inne ścieżki czytają ciasteczka (niezamierzona zależność).
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");

  return NextResponse.json({ review: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") === "de" ? "de" : "pl";
  const tr = (pl: string, de: string) => (locale === "de" ? de : pl);
  const productId = searchParams.get("productId");
  if (!productId || !UUID_RE.test(productId)) {
    return NextResponse.json(
      { error: tr("Nieprawidłowy productId", "Ungültige Produkt-ID") },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") },
      { status: 401 }
    );
  }

  // Ten sam jawny pre-check, co w POST — z tą samą przyczyną i tym samym
  // komunikatem. Migracja 80 domyka politykę „reviews: delete własne"
  // warunkiem `status <> 'rejected'`: bez niej autor kasował opinię zdjętą
  // ze strony i pisał ją od nowa z tymi samymi zdjęciami (pliki zostają
  // w Storage), czyli w kółko cofał decyzję właścicielki.
  //
  // Pre-check jest tu KONIECZNY, a nie kosmetyczny: odmowa RLS przy DELETE
  // NIE jest błędem PostgREST — Postgres po prostu nie widzi wiersza i kasuje
  // ZERO wierszy, więc bez tego sprawdzenia klient dostałby `{ ok: true }`
  // i odświeżoną stronę, na której opinia dalej stoi. Fałszywe „udało się"
  // jest gorsze niż nieprecyzyjny błąd.
  //
  // ⚠️ `select("*")`, a NIE `select("status, photos")`: dopóki migracja 79 nie
  // jest zaaplikowana, kolumny `photos` NIE MA i nazwanie jej wprost sprawia,
  // że PostgREST odrzuca CAŁE zapytanie — pre-check przestałby działać, a
  // usuwanie opinii zdjętej ze strony znów by przechodziło. Przy `*` brakująca
  // kolumna to po prostu `undefined` (stąd normalizacja niżej).
  const { data: istniejaca } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .maybeSingle();
  const wiersz = istniejaca as { status: string; photos?: string[] } | null;
  if (wiersz?.status === "rejected") {
    return NextResponse.json(
      { error: tr(ZDJETA_ZE_STRONY.pl, ZDJETA_ZE_STRONY.de) },
      { status: 403 }
    );
  }

  // `.select("id")` — potrzebujemy wiedzieć, czy DELETE naprawdę skasował
  // wiersz. Patrz wyżej: brak uprawnienia to zero skasowanych wierszy, a nie
  // błąd. Bez tego sprzątanie plików niżej mogłoby usunąć zdjęcia opinii,
  // która WCIĄŻ wisi na stronie (np. gdyby Julia zdjęła ją między odczytem
  // a kasowaniem). Kolumna `id` istnieje od migracji 06, więc nazwanie jej
  // jest bezpieczne także przed migracją 79.
  const { data: usuniete, error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    // error.message nie trafia do klienta (wyciek schematu DB) — log serwerowy.
    // Tylko code+message, nigdy cały obiekt — `error.details` dla tej tabeli
    // potrafi nieść adres e-mail klienta (patrz komentarz przy upsercie wyżej).
    console.error("review delete error:", { code: error.code, message: error.message });
    return NextResponse.json(
      {
        error: tr(
          "Nie udało się usunąć opinii",
          "Die Bewertung konnte nicht gelöscht werden"
        ),
      },
      { status: 500 }
    );
  }

  // Wiersz BYŁ przy odczycie, a nie skasował się ani jeden — to nie jest
  // „nie było czego kasować", tylko odmowa RLS (patrz wyżej: odmowa nie jest
  // błędem). Po migracji 80 jedyną przyczyną odmowy dla własnej opinii jest
  // `status = 'rejected'`, więc komunikat jest ten sam, co w pre-checku.
  // Domyka wyścig: Julia mogła zdjąć opinię ze strony MIĘDZY odczytem
  // a kasowaniem. Bez tego klient dostałby `{ ok: true }` i odświeżoną
  // stronę, na której jego opinia dalej stoi — czyli kłamstwo zamiast odmowy.
  if (wiersz !== null && (usuniete?.length ?? 0) === 0) {
    return NextResponse.json(
      { error: tr(ZDJETA_ZE_STRONY.pl, ZDJETA_ZE_STRONY.de) },
      { status: 403 }
    );
  }

  // Sprzątanie plików ze Storage po UDANYM skasowaniu opinii. To NIE jest ten
  // sam dług, co „pliki osierocone" (pliki, których nigdy nie dołączono do
  // żadnej opinii): tu chodzi o zdjęcia, które BYŁY publiczne — ich adresy
  // stały w HTML-u strony głównej, /opinie i karty produktu, więc mają je
  // crawlery i cache optymalizatora obrazów. Bez tego kroku klientka, która
  // usuwa swoją opinię, nie ma jak wycofać zdjęcia z internetu.
  //
  // ⚠️ Robimy to WYŁĄCZNIE tutaj, przy usunięciu opinii przez autora.
  // „Zdejmij ze strony" w panelu jest ODWRACALNE (jest „Przywróć na witrynę"),
  // więc kasowanie plików rozbiłoby przywracanie.
  //
  // Kasujemy tylko wtedy, gdy wiersz NAPRAWDĘ zniknął (patrz `.select("id")`
  // wyżej) i tylko te pliki, których nie trzyma już żadna inna opinia —
  // usunNieuzywaneZdjecia tłumaczy, dlaczego to drugie jest konieczne.
  // Wiersza już nie ma, więc nie ma czego wykluczać z tamtego pytania.
  //
  // `photos` bywa `undefined`, dopóki migracja 79 nie jest zaaplikowana.
  if (usuniete !== null && usuniete.length > 0) {
    await usunNieuzywaneZdjecia(
      Array.isArray(wiersz?.photos) ? wiersz.photos : [],
      null
    );
  }

  // Usunięcie opinii zmienia to, co widać na tych ścieżkach — tak samo jak nowa
  // opinia czy edycja. Odśwież komplet.
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
