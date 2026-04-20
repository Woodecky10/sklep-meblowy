import { createClient } from "./supabase/server";
import type { Category, Product } from "./types";

export type ProductFilters = {
  category?: Category;
  sort?: "price_asc" | "price_desc" | "newest";
  page?: number;
  limit?: number;
};

export async function getProducts(filters: ProductFilters = {}) {
  const supabase = await createClient();
  const { category, sort = "newest", page = 1, limit = 12 } = filters;

  let query = supabase.from("products").select("*", { count: "exact" });

  if (category) query = query.eq("category", category);

  if (sort === "price_asc") query = query.order("price", { ascending: true });
  else if (sort === "price_desc") query = query.order("price", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    products: (data ?? []) as Product[],
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
  };
}

export async function getProduct(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Product;
}

export async function getFeaturedProducts(limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Product[];
}

export async function getRelatedProducts(productId: string, category: Category, limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .neq("id", productId)
    .limit(limit);

  return (data ?? []) as Product[];
}
