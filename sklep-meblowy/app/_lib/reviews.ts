import { createClient } from "./supabase/server";
import type { ProductRating, ProductReview } from "./types";

// Pobiera recenzje dla produktu (najnowsze pierwsze) razem z imieniem autora.
// Zwykłe join przez Supabase — RLS na profiles ogranicza select, ale full_name
// możemy pokazać (to dane, które klient sam podał przy rejestracji/zamówieniu).
export async function getReviewsForProduct(
  productId: string,
  limit = 50
): Promise<ProductReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Dociągnij imiona z profili
  const userIds = Array.from(new Set((data as ProductReview[]).map((r) => r.user_id)));
  if (userIds.length === 0) return data as ProductReview[];

  const { data: profiles } = await supabase
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
    ...r,
    author_name: nameMap.get(r.user_id) ?? null,
  }));
}

export async function getProductRating(productId: string): Promise<ProductRating> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId);

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
    .in("product_id", productIds);

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
// - musi mieć przynajmniej jedno zamówienie zawierające ten produkt ze statusem
//   paid/processing/shipped/delivered
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
    .select("order_id, product_id, orders!inner(user_id, status)")
    .eq("product_id", productId)
    .eq("orders.user_id", user.id)
    .in("orders.status", ["paid", "processing", "shipped", "delivered"])
    .limit(1);

  if (!orderItems || orderItems.length === 0) {
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
