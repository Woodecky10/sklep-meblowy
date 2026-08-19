import { NextResponse, after, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { revalidatePath } from "next/cache";
import { poluDlaNowegoZapisu } from "@/app/_lib/reviews-moderation";
import { notifyAdminNewReview } from "@/app/_lib/mail/review-notify";
import {
  MAX_REVIEW_PHOTOS,
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
const ZDJETA_ZE_STRONY = {
  pl: "Ta opinia została zdjęta ze strony przez sklep i nie można jej edytować.",
  de: "Diese Bewertung wurde vom Shop von der Seite entfernt und kann nicht mehr bearbeitet werden.",
} as const;

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
                `Maksymalnie ${MAX_REVIEW_PHOTOS} zdjęcia`,
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
  const { data: istniejaca } = await supabase
    .from("product_reviews")
    .select("status")
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .maybeSingle();
  if ((istniejaca as { status: string } | null)?.status === "rejected") {
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
    console.error("review upsert error:", error);
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
    console.error("review delete error:", error);
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
  // Ścieżkę w buckecie liczy reviewPhotoPath, czyli ta sama bramka prefiksu
  // i nazwy pliku, która pilnuje zapisu — klient administracyjny omija RLS,
  // więc nie może dostać ścieżki spoza katalogu `opinie/`.
  //
  // `photos` bywa `undefined`, dopóki migracja 79 nie jest zaaplikowana.
  const doUsuniecia = (Array.isArray(wiersz?.photos) ? wiersz.photos : [])
    .map((u) => reviewPhotoPath(u, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""))
    .filter((p): p is string => p !== null);
  if (usuniete !== null && usuniete.length > 0 && doUsuniecia.length > 0) {
    // ⚠️ Błąd sprzątania NIE może wywalić odpowiedzi: opinia jest już
    // skasowana i to jest wynik, który klient ma zobaczyć. Nieusunięty plik
    // jest brzydki, ale odwracalny; błąd 500 po udanym kasowaniu kazałby
    // klientowi klikać jeszcze raz w opinię, której już nie ma.
    try {
      const admin = await createAdminClient();
      const { error: bladStorage } = await admin.storage
        .from("products")
        .remove(doUsuniecia);
      if (bladStorage) {
        console.error("[opinie] nie udało się usunąć plików zdjęć:", bladStorage.message);
      }
    } catch (e) {
      console.error("[opinie] wyjątek przy usuwaniu plików zdjęć:", e);
    }
  }

  // Usunięcie opinii zmienia to, co widać na tych ścieżkach — tak samo jak nowa
  // opinia czy edycja. Odśwież komplet.
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
