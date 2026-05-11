// Helpery do tabeli featured_products — polecane produkty na home.
// Edytowane przez admin panel /admin/polecane.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Product } from "./types";

export const FEATURED_CACHE_TAG = "featured-products";

export type FeaturedRow = {
  id: string;
  product_id: string;
  badge: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FeaturedItem = {
  id: string;
  product: Product;
  badge: string | null;
  sort_order: number;
};

// ============================================================
// Public read: featured + JOIN do products, sortowane
// ============================================================
// Manualny "JOIN" (osobne query do products) bo Supabase JS robi to
// łatwiej i bardziej przewidywalnie niż embedded select z FK.
const fetchFeaturedItems = unstable_cache(
  async (): Promise<FeaturedItem[]> => {
    const supabase = await createAdminClient();

    const { data: rows, error } = await supabase
      .from("featured_products")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error || !rows || rows.length === 0) return [];

    const featured = rows as FeaturedRow[];
    const productIds = featured.map((f) => f.product_id);

    const { data: products } = await supabase
      .from("products")
      .select("*")
      .in("id", productIds);

    const byId = new Map<string, Product>(
      ((products ?? []) as Product[]).map((p) => [p.id, p])
    );

    return featured
      .map((f): FeaturedItem | null => {
        const product = byId.get(f.product_id);
        if (!product) return null; // produkt usunięty (ON DELETE CASCADE powinno to złapać, ale safety)
        return { id: f.id, product, badge: f.badge, sort_order: f.sort_order };
      })
      .filter((x): x is FeaturedItem => x !== null);
  },
  ["featured-products"],
  { tags: [FEATURED_CACHE_TAG], revalidate: 60 }
);

export const getFeaturedItems = cache(fetchFeaturedItems);

// ============================================================
// Admin read: surowy fetch + JOIN, bez cache
// ============================================================
export async function getAllFeaturedAdmin(): Promise<FeaturedItem[]> {
  const supabase = await createAdminClient();
  const { data: rows } = await supabase
    .from("featured_products")
    .select("*")
    .order("sort_order", { ascending: true });

  if (!rows || rows.length === 0) return [];

  const featured = rows as FeaturedRow[];
  const productIds = featured.map((f) => f.product_id);
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds);

  const byId = new Map<string, Product>(
    ((products ?? []) as Product[]).map((p) => [p.id, p])
  );

  return featured
    .map((f): FeaturedItem | null => {
      const product = byId.get(f.product_id);
      if (!product) return null;
      return { id: f.id, product, badge: f.badge, sort_order: f.sort_order };
    })
    .filter((x): x is FeaturedItem => x !== null);
}

// ============================================================
// Lista produktów dostępnych do dodania (te których jeszcze nie ma w featured)
// ============================================================
export async function getAvailableProductsForFeatured(): Promise<Product[]> {
  const supabase = await createAdminClient();

  const { data: featured } = await supabase
    .from("featured_products")
    .select("product_id");
  const usedIds = new Set<string>(
    ((featured ?? []) as { product_id: string }[]).map((f) => f.product_id)
  );

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  return ((products ?? []) as Product[]).filter((p) => !usedIds.has(p.id));
}

// ============================================================
// Dla home: featured z DB, fallback do 4 najnowszych gdy puste
// ============================================================
// Zwraca jednolity kształt { product, badge } dla home page.
export async function getFeaturedOrFallback(): Promise<
  Array<{ product: Product; badge: string | null }>
> {
  const items = await getFeaturedItems();
  if (items.length > 0) {
    return items.map((it) => ({ product: it.product, badge: it.badge }));
  }

  // Fallback: 4 najnowsze produkty bez badge
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(4);

  return ((data ?? []) as Product[]).map((product) => ({ product, badge: null }));
}

// ============================================================
// Inwalidacja cache
// ============================================================
export function invalidateFeaturedCache() {
  revalidateTag(FEATURED_CACHE_TAG, "max");
}
