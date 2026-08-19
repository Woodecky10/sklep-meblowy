import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { revalidatePath } from "next/cache";
import { poluDlaNowegoZapisu } from "@/app/_lib/reviews-moderation";
import { notifyAdminNewReview } from "@/app/_lib/mail/review-notify";

type Body = {
  productId: string;
  rating: number;
  comment?: string;
};

// Walidacja productId jako UUID — bez tego błędny id leciał do PostgREST,
// który zwracał error.message ujawniający schemat DB klientowi (audyt LOW).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      {
        error: tr(
          "Ta opinia została zdjęta ze strony przez sklep i nie można jej edytować.",
          "Diese Bewertung wurde vom Shop von der Seite entfernt und kann nicht mehr bearbeitet werden."
        ),
      },
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

  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", user.id);

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

  // Usunięcie opinii zmienia to, co widać na tych ścieżkach — tak samo jak nowa
  // opinia czy edycja. Odśwież komplet.
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
