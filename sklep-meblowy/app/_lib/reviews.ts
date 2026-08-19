import { createClient, createAdminClient } from "./supabase/server";
import { localizeReview } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { ProductRating, ProductReview } from "./types";
import {
  selectHomepageReviews,
  HOMEPAGE_REVIEW_MIN_RATING,
  HOMEPAGE_REVIEWS_LIMIT,
} from "./reviews-display";

// Imię pod opinią. Dla konta pochodzi z profiles.full_name, dla gościa
// z pola, które sam wpisał — te dwa źródła nigdy nie występują naraz
// (warunek product_reviews_autor_jeden w migracji 76).
export function authorNameOf(
  review: Pick<ProductReview, "user_id" | "guest_name">,
  profileName: string | null | undefined
): string | null {
  if (review.user_id === null) return review.guest_name ?? null;
  return profileName ?? null;
}

// Pobiera recenzje dla produktu (najnowsze pierwsze) razem z imieniem autora.
// locale==='de' → treść (comment) z comment_de z fallbackiem PL. Imię autora
// nie jest tłumaczone.
export async function getReviewsForProduct(
  productId: string,
  limit = 50,
  locale: Locale = DEFAULT_LOCALE
): Promise<ProductReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Dociągnij imiona z profili. Service-role (admin) celowo — profiles ma RLS
  // using(auth.uid()=id), więc zwykły klient widziałby TYLKO profil aktualnego
  // usera i każda CUDZA opinia gubiła imię (fallback "Klient"). Eksponujemy
  // WYŁĄCZNIE full_name (autor zgadza się pokazać je jako podpis pod opinią).
  const userIds = Array.from(
    new Set(
      (data as ProductReview[])
        .map((r) => r.user_id)
        .filter((id): id is string => id !== null)
    )
  );
  if (userIds.length === 0) {
    return (data as ProductReview[]).map((r) => ({
      ...localizeReview(r, locale),
      author_name: authorNameOf(r, null),
      // Dopóki migracja 79 nie jest zaaplikowana, `select("*")` NIE zwraca
      // kolumny `photos` i pole jest `undefined` — a komponenty na niej mapują.
      // Normalizacja siedzi w warstwie danych, bo to jedyne miejsce, które wie,
      // że wiersz przyszedł z bazy. To ta sama zasada, co fail-soft przy
      // migracji 76 (patrz komentarz nad getHomepageReviews).
      photos: Array.isArray(r.photos) ? r.photos : [],
    }));
  }

  const admin = await createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);

  const nameMap = new Map<string, string | null>(
    ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ])
  );

  return (data as ProductReview[]).map((r) => ({
    ...localizeReview(r, locale),
    author_name: authorNameOf(r, nameMap.get(r.user_id ?? "")),
    // Dopóki migracja 79 nie jest zaaplikowana, `select("*")` NIE zwraca
    // kolumny `photos` i pole jest `undefined` — a komponenty na niej mapują.
    // Normalizacja siedzi w warstwie danych, bo to jedyne miejsce, które wie,
    // że wiersz przyszedł z bazy. To ta sama zasada, co fail-soft przy
    // migracji 76 (patrz komentarz nad getHomepageReviews).
    photos: Array.isArray(r.photos) ? r.photos : [],
  }));
}

export async function getProductRating(productId: string): Promise<ProductRating> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "approved");

  if (error || !data || data.length === 0) {
    return { average: 0, count: 0 };
  }
  const ratings = (data as { rating: number }[]).map((r) => r.rating);
  const sum = ratings.reduce((a, b) => a + b, 0);
  return {
    average: Math.round((sum / ratings.length) * 10) / 10,
    count: ratings.length,
  };
}

// Zbiorczy lookup — dla list produktów (np. sklep, home) żebyśmy nie robili
// N+1 zapytań o oceny każdej karty.
export async function getRatingsForProducts(
  productIds: string[]
): Promise<Map<string, ProductRating>> {
  const result = new Map<string, ProductRating>();
  if (productIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from("product_reviews")
    .select("product_id, rating")
    .in("product_id", productIds)
    .eq("status", "approved");

  const rows = (data ?? []) as { product_id: string; rating: number }[];
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const arr = grouped.get(row.product_id) ?? [];
    arr.push(row.rating);
    grouped.set(row.product_id, arr);
  }
  for (const id of productIds) {
    const ratings = grouped.get(id) ?? [];
    if (ratings.length === 0) {
      result.set(id, { average: 0, count: 0 });
      continue;
    }
    const sum = ratings.reduce((a, b) => a + b, 0);
    result.set(id, {
      average: Math.round((sum / ratings.length) * 10) / 10,
      count: ratings.length,
    });
  }
  return result;
}

// Sprawdza czy aktualnie zalogowany user może dodać opinię o produkcie:
// - musi być zalogowany
// - musi mieć przynajmniej jedno zamówienie zawierające ten produkt, które
//   liczy się jako zweryfikowany zakup (patrz warunek niżej — inny dla
//   online/cod)
// - nie może mieć jeszcze wystawionej opinii (unique constraint)
// Zwraca istniejącą opinię (jeśli user ją już dał), żeby móc ją edytować.
export async function getReviewStatus(productId: string): Promise<{
  canReview: boolean;
  reason?: "not_logged_in" | "not_purchased";
  existingReview?: ProductReview;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { canReview: false, reason: "not_logged_in" };

  // Czy ma zamówienie z tym produktem?
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("order_id, product_id, orders!inner(user_id, status, payment_method)")
    .eq("product_id", productId)
    .eq("orders.user_id", user.id);

  // Zamówienia COD dostają status "processing" ZANIM klient zapłaci (płatność
  // przy odbiorze) — w przeciwieństwie do "online", gdzie "processing" to już
  // opłacone. Dla COD zweryfikowany zakup liczy się dopiero od "shipped"
  // (towar faktycznie wysłany), inaczej każdy mógłby wystawić darmowe
  // zamówienie COD i od razu dostać "zweryfikowaną" opinię.
  const hasVerifiedPurchase = (
    (orderItems ?? []) as unknown as { orders: { status: string; payment_method: string } }[]
  ).some(
    ({ orders: o }) =>
      (o.payment_method === "online" &&
        ["paid", "processing", "shipped", "delivered"].includes(o.status)) ||
      (o.payment_method === "cod" && ["shipped", "delivered"].includes(o.status))
  );

  if (!hasVerifiedPurchase) {
    return { canReview: false, reason: "not_purchased" };
  }

  // Czy już wystawił opinię?
  const { data: existing } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    canReview: true,
    existingReview: (existing as ProductReview | null) ?? undefined,
  };
}

// Opinia pokazywana publicznie poza kartą produktu (home, /opinie) — musi
// nieść nazwę ocenianego produktu, żeby dało się do niego wrócić.
// ⚠️ Bez `slug`: tabela products NIE MA takiej kolumny — link to /produkt/<id>.
// ⚠️ Bez `guest_email`: patrz komentarz w withAuthorsAndProduct — typ o nazwie
// PublicReview nie może obiecywać adresu e-mail klienta.
export type PublicReview = Omit<ProductReview, "guest_email"> & {
  product_name: string | null;
};

// Ile opinii wchodzi na /opinie. Przy dzisiejszej skali (0 opinii, 10 zamówień)
// to sufit bezpieczeństwa, nie stronicowanie — stronicowanie dopiszemy, gdy
// będzie co stronicować.
export const REVIEWS_PAGE_LIMIT = 200;

// Dociąga imiona autorów i tłumaczy treść. Profile czytamy klientem
// administracyjnym: profiles ma RLS using(auth.uid() = id), więc zwykły klient
// widziałby WYŁĄCZNIE własny profil i każda cudza opinia gubiłaby podpis.
// Eksponujemy tylko full_name (autor zgadza się na podpis pod opinią).
async function withAuthorsAndProduct(
  rows: (ProductReview & { products?: { name: string | null } | null })[],
  locale: Locale
): Promise<PublicReview[]> {
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => id !== null))
  );
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const admin = await createAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      nameMap.set(p.id, p.full_name);
    }
  }
  // ⚠️ NIE rozsypuj tu całego wiersza (`...r`). Dwie właściwości wypadają
  // celowo:
  // - `guest_email` — `select("*")` je pobiera, a to jest kształt danych dla
  //   home i /opinie. Slider na home jest interaktywny, więc gdyby PublicReview
  //   trafiło do komponentu klienckiego, e-maile gości wylądowałyby w payloadzie
  //   RSC, czyli w źródle strony. Pokazywanie pełnego e-maila obok podpisu
  //   skróconego przez anonymizeAuthor do „Anna K." niweczyłoby tamten zabieg.
  // - `products` — surowy obiekt joina; komponenty mają patrzeć wyłącznie na
  //   `product_name`, a spread nie podlega kontroli nadmiarowych właściwości,
  //   więc TS by tego nie złapał.
  // `comment_de` zostaje w `rest` (przychodzi z `select("*")`) — localizeReview
  // go potrzebuje, inaczej cicho gaśnie tłumaczenie treści opinii na DE.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `_guestEmail` jest wiązane WYŁĄCZNIE po to, żeby wypadło z `rest` (reguła nie ma tu ignoreRestSiblings)
  return rows.map(({ products, guest_email: _guestEmail, ...rest }) => ({
    ...localizeReview(rest, locale),
    author_name: authorNameOf(rest, nameMap.get(rest.user_id ?? "")),
    product_name: products?.name ?? null,
    // Dopóki migracja 79 nie jest zaaplikowana, `select("*")` NIE zwraca
    // kolumny `photos` i pole jest `undefined` — a komponenty na niej mapują.
    // Normalizacja siedzi w warstwie danych, bo to jedyne miejsce, które wie,
    // że wiersz przyszedł z bazy. To ta sama zasada, co fail-soft przy
    // migracji 76 (patrz komentarz nad getHomepageReviews).
    photos: Array.isArray(rest.photos) ? rest.photos : [],
  }));
}

// Opinie na slider strony głównej. Zapytanie odsiewa zgrubnie (status, ocena,
// wykluczenie), ostateczna bramka to selectHomepageReviews — długości treści
// nie da się wyrazić filtrem PostgREST.
//
// Nadpobranie ×3: zapytanie nie wie o progu 30 znaków, więc gdyby wzięło
// dokładnie 12 wierszy, każda krótka opinia zmniejszałaby slider poniżej
// limitu, mimo że w bazie stoją dobre opinie tuż za nią.
//
// ⚠️ FAIL-SOFT jest tu wymogiem, nie ostrożnością: dopóki migracja 76 nie jest
// zaaplikowana, kolumny `status` i `homepage_excluded` NIE ISTNIEJĄ i PostgREST
// zwraca błąd. Pusta tablica = sekcja się nie renderuje = strona główna
// wygląda jak dziś. Rzucenie stąd wyjątkiem wywala CAŁĄ stronę główną.
export async function getHomepageReviews(
  locale: Locale = DEFAULT_LOCALE
): Promise<PublicReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*, products(name)")
    .eq("status", "approved")
    .eq("homepage_excluded", false)
    .gte("rating", HOMEPAGE_REVIEW_MIN_RATING)
    .order("created_at", { ascending: false })
    .limit(HOMEPAGE_REVIEWS_LIMIT * 3);
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];
  return withAuthorsAndProduct(selectHomepageReviews(rows), locale);
}

// Wszystkie zatwierdzone opinie na /opinie — BEZ filtra oceny i BEZ progu
// długości. Dyrektywa Omnibus zabrania publikowania wyłącznie opinii
// pozytywnych, więc jedyny filtr to moderacja (spam i obelgi).
export async function getAllApprovedReviews(
  locale: Locale = DEFAULT_LOCALE
): Promise<PublicReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*, products(name)")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_LIMIT);
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];
  return withAuthorsAndProduct(rows, locale);
}
