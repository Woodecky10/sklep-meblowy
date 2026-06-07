import { createClient } from "./supabase/server";
import { getCategories } from "./categories";
import type { Category, Product } from "./types";

export type ProductFilters = {
  category?: Category;
  // Sort:
  //   "alphabetic" (default) — nazwa A-Z, z numerycznym matchingiem dla
  //     pozycji typu "Łóżko 120x200" przed "Łóżko 140x200"
  //   "newest" — od najnowszych w katalogu (data dodania)
  //   "price_asc" / "price_desc" — cena rosnąco/malejąco
  sort?: "alphabetic" | "price_asc" | "price_desc" | "newest";
  page?: number;
  limit?: number;
  search?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  colors?: string[];
  materials?: string[];
  // Slug kolekcji — filtruje produkty należące do konkretnej kolekcji
  // (np. ?kolekcja=lisbon w URL).
  collectionSlug?: string;
  // Slug sekcji (grupy kategorii) — np. "naroznik" pokaże WSZYSTKIE produkty
  // z naroznik-l + naroznik-u. Używane gdy user kliknie na sam HEADER
  // sekcji w Navbarze (?sekcja=naroznik), zamiast wybierać konkretną
  // sub-kategorię. Gdy oba `category` i `sectionSlug` są ustawione,
  // `category` wygrywa (bardziej szczegółowy filtr).
  sectionSlug?: string;
};

export async function getProducts(filters: ProductFilters = {}) {
  const supabase = await createClient();
  const {
    category,
    sort = "alphabetic",
    page = 1,
    limit = 12,
    search,
    priceMin,
    priceMax,
    inStockOnly,
    colors,
    materials,
    collectionSlug,
    sectionSlug,
  } = filters;

  let query = supabase.from("products").select("*", { count: "exact" });

  if (category) {
    query = query.eq("category", category);
  } else if (sectionSlug) {
    // Filtr po sekcji = pokaż wszystkie produkty których kategoria należy
    // do tej sekcji. Robione przez lookup wszystkich kategorii z
    // group_slug = sectionSlug + .in("category", [slugs]).
    const allCats = await getCategories();
    const sectionCategorySlugs = allCats
      .filter((c) => c.group_slug === sectionSlug)
      .map((c) => c.slug);
    if (sectionCategorySlugs.length === 0) {
      // Brak kategorii w tej sekcji → zwracamy puste wyniki
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("category", sectionCategorySlugs);
    }
  }

  // Filter po kolekcji — najpierw lookup collection.id po slug, potem in()
  if (collectionSlug) {
    const { data: coll } = await supabase
      .from("collections")
      .select("id")
      .eq("slug", collectionSlug)
      .maybeSingle();
    if (coll) {
      query = query.eq("collection_id", (coll as { id: string }).id);
    } else {
      // Brak takiej kolekcji — zwracamy puste wyniki
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  if (search && search.trim()) {
    const term = search.trim().replace(/[%_]/g, "\\$&");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  if (typeof priceMin === "number") query = query.gte("price", priceMin);
  if (typeof priceMax === "number") query = query.lte("price", priceMax);

  if (inStockOnly) query = query.gt("stock", 0);

  if (colors?.length) query = query.in("color", colors);
  if (materials?.length) query = query.in("material", materials);

  if (sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else if (sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else {
    // Alfabetycznie (default): A-Z po nazwie. Postgres używa domyślnego
    // collate bazy — dla pl_PL.UTF-8 daje polski porządek alfabetyczny
    // (Ą po A, Ć po C itd.) plus cyfry zachowują kolejność numeryczną
    // jeśli nazwa zaczyna się od liczby ("120 łóżko" przed "140 łóżko").
    // Secondary sort po created_at — żeby produkty z identyczną nazwą
    // miały deterministyczną kolejność.
    query = query
      .order("name", { ascending: true })
      .order("created_at", { ascending: false });
  }

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

// ============================================================
// Cross-sell: produkty z kategorii powiązanych z koszykiem
// ============================================================
// Bierze unikalne slugi kategorii produktów w koszyku, dla każdej szuka
// jej `cross_sell_categories` (np. lozko-tapicerowane → ['materace']),
// łączy je w jeden set i pobiera produkty z tych kategorii (max limit).
// Excluduje produkty już w koszyku.
export async function getCrossSellProducts(
  cartCategorySlugs: string[],
  excludeProductIds: string[] = [],
  limit = 4
): Promise<Product[]> {
  if (cartCategorySlugs.length === 0) return [];

  const supabase = await createClient();

  // Wczytaj cross_sell_categories dla wszystkich kategorii w koszyku
  const { data: cats } = await supabase
    .from("categories")
    .select("slug, cross_sell_categories")
    .in("slug", cartCategorySlugs);

  const targetSlugs = new Set<string>();
  for (const c of (cats ?? []) as {
    slug: string;
    cross_sell_categories: string[] | null;
  }[]) {
    for (const s of c.cross_sell_categories ?? []) {
      // Nie polecamy kategorii już w koszyku (to nie cross-sell, to same-sell)
      if (!cartCategorySlugs.includes(s)) targetSlugs.add(s);
    }
  }
  if (targetSlugs.size === 0) return [];

  let query = supabase
    .from("products")
    .select("*")
    .in("category", Array.from(targetSlugs))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeProductIds.length > 0) {
    query = query.not("id", "in", `(${excludeProductIds.join(",")})`);
  }

  const { data } = await query;
  return (data ?? []) as Product[];
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

// Pobiera unikalne wartości color/material z CAŁEJ bazy produktów — użyte
// do budowania filtrów na /sklep.
//
// Decyzja: nie ograniczamy facets do bieżącego search/category. User
// zgłaszał że "tylko beżowy" pojawiał się w filtrze, bo poprzednia wersja
// kaskadowała — w wybranej kategorii istniał tylko 1 kolor, więc filtr
// pokazywał ten 1 kolor. Lepiej zawsze pokazać pełną paletę: klient widzi
// co jest dostępne w sklepie ogólnie, może kliknąć "biały" i zobaczyć
// czy taki kolor jest w wybranej kategorii.
//
// Jeśli kolor nie ma żadnego produktu spełniającego pozostałe filtry —
// kliknięcie zwróci pustą listę i user wyczyści filtry sam.
export async function getFilterFacets() {
  const supabase = await createClient();

  const [
    { data: colorsData },
    { data: materialsData },
  ] = await Promise.all([
    supabase.from("products").select("color").not("color", "is", null),
    supabase.from("products").select("material").not("material", "is", null),
  ]);

  const colors = Array.from(
    new Set(
      (colorsData ?? [])
        .map((r) => (r as { color: string | null }).color?.trim() ?? "")
        .filter((c) => c.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "pl"));

  const materials = Array.from(
    new Set(
      (materialsData ?? [])
        .map((r) => (r as { material: string | null }).material?.trim() ?? "")
        .filter((m) => m.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "pl"));

  return { colors, materials };
}
