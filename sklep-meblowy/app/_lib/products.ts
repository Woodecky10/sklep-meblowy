import { createClient } from "./supabase/server";
import type { Category, Product } from "./types";

export type ProductFilters = {
  category?: Category;
  sort?: "price_asc" | "price_desc" | "newest";
  page?: number;
  limit?: number;
  search?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  colors?: string[];
  materials?: string[];
};

export async function getProducts(filters: ProductFilters = {}) {
  const supabase = await createClient();
  const {
    category,
    sort = "newest",
    page = 1,
    limit = 12,
    search,
    priceMin,
    priceMax,
    inStockOnly,
    colors,
    materials,
  } = filters;

  let query = supabase.from("products").select("*", { count: "exact" });

  if (category) query = query.eq("category", category);

  if (search && search.trim()) {
    const term = search.trim().replace(/[%_]/g, "\\$&");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  if (typeof priceMin === "number") query = query.gte("price", priceMin);
  if (typeof priceMax === "number") query = query.lte("price", priceMax);

  if (inStockOnly) query = query.gt("stock", 0);

  if (colors?.length) query = query.in("color", colors);
  if (materials?.length) query = query.in("material", materials);

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

// Pobiera unikalne wartości color/material — użyte do dynamicznego budowania filtrów.
// Facets respektują obecne search (q) i kategorię, żeby pokazywać tylko
// opcje obecne w faktycznym widoku (np. "sofa" w q pokaże tylko kolory sof).
// Color/material filters z URL NIE są stosowane — żeby user mógł je toggle'ować
// niezależnie i widzieć pełen zakres opcji w bieżącym zawężeniu.
export async function getFilterFacets(
  filters: { search?: string; category?: Category } = {}
) {
  const supabase = await createClient();
  const term = filters.search?.trim()
    ? filters.search.trim().replace(/[%_]/g, "\\$&")
    : null;

  let colorsQuery = supabase.from("products").select("color").not("color", "is", null);
  let materialsQuery = supabase
    .from("products")
    .select("material")
    .not("material", "is", null);

  if (filters.category) {
    colorsQuery = colorsQuery.eq("category", filters.category);
    materialsQuery = materialsQuery.eq("category", filters.category);
  }
  if (term) {
    colorsQuery = colorsQuery.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    materialsQuery = materialsQuery.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const [{ data: colorsData }, { data: materialsData }] = await Promise.all([
    colorsQuery,
    materialsQuery,
  ]);

  const colors = Array.from(
    new Set((colorsData ?? []).map((r) => (r as { color: string }).color))
  ).sort();
  const materials = Array.from(
    new Set((materialsData ?? []).map((r) => (r as { material: string }).material))
  ).sort();

  return { colors, materials };
}
