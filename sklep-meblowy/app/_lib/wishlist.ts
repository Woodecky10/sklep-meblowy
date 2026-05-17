import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Product } from "./types";

// Zwraca Set z product_id ulubionych zalogowanego usera. Pusty Set
// gdy niezalogowany albo wishlist jest pusta — komponenty mogą bezpiecznie
// zrobić `wishlistIds.has(product.id)` bez null-checków.
//
// Cache na duration jednego requestu (React.cache) — wywołane wielokrotnie
// w jednym SSR (np. Navbar liczy count + ProductCard sprawdza ids) zwraca
// ten sam wynik bez double-query.
export const getUserWishlistIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from("wishlists")
    .select("product_id")
    .eq("user_id", user.id);

  if (error || !data) return new Set();
  return new Set(data.map((r) => (r as { product_id: string }).product_id));
});

export async function getWishlistCount(): Promise<number> {
  const ids = await getUserWishlistIds();
  return ids.size;
}

// Lista pełnych produktów z wishlist — używana na stronie /ulubione.
// Sortowanie: najnowsze pierwsze (zgodnie z idx_wishlists_user).
export async function getWishlistProducts(): Promise<Product[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("wishlists")
    .select("created_at, product:products(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data
    .map((r) => (r as unknown as { product: Product | null }).product)
    .filter((p): p is Product => p !== null);
}
