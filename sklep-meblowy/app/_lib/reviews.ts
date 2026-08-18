import { createClient, createAdminClient } from "./supabase/server";
import { localizeReview } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { ProductRating, ProductReview } from "./types";

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
