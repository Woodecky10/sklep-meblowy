import { createClient, createAdminClient } from "./supabase/server";
import { getCategories } from "./categories";
import { buildSearchOrFilter } from "./search-filter";
import { sizeLabelOf } from "./size-groups";
import { localizeProduct, buildLocalizedFacets } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Category, Product } from "./types";

// Górny limit rozmiaru strony — broni przed ?limit=999999 (kosztowny request).
export const PRODUCTS_PAGE_LIMIT_MAX = 100;

// Bezpieczna normalizacja paginacji. URL-owe ?strona=abc dawało Number()=NaN,
// a destrukturyzacja `page = 1` łapie tylko undefined (nie NaN/0/ujemne) →
// from=(NaN-1)*limit=NaN → query.range(NaN,NaN) → błąd PostgREST → 500 na /sklep.
export function clampPage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

export function clampLimit(value: number | undefined, fallback = 12): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.min(Math.floor(value), PRODUCTS_PAGE_LIMIT_MAX);
}

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
  // Język odczytu — gdy "de", pola tekstowe (name/description/color/material/
  // sekcje) wracają zlokalizowane (z fallbackiem PL), a wyszukiwanie szuka po
  // kolumnach _de. Domyślnie PL (admin/cron/legacy callerzy działają bez zmian).
  locale?: Locale;
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
    locale = DEFAULT_LOCALE,
  } = filters;

  // Normalizacja paginacji — chroni przed NaN/0/ujemnymi (patrz clampPage).
  const safePage = clampPage(page);
  const safeLimit = clampLimit(limit);

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
    // Sanityzacja + budowa filtra .or() w search-filter.ts (escape składni
    // .or() i wildcardów ILIKE). null = po sanityzacji nic nie zostało.
    // DE szuka po name_de/description_de (bez fallbacku — patrz search-filter).
    const orFilter = buildSearchOrFilter(search, locale);
    if (orFilter) query = query.or(orFilter);
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

  const from = (safePage - 1) * safeLimit;
  query = query.range(from, from + safeLimit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    products: ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale)),
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / safeLimit),
  };
}

export async function getProduct(id: string, locale: Locale = DEFAULT_LOCALE) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return localizeProduct(data as Product, locale);
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
  limit = 4,
  locale: Locale = DEFAULT_LOCALE
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
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

export async function getFeaturedProducts(
  limit = 4,
  locale: Locale = DEFAULT_LOCALE
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

export async function getRelatedProducts(
  productId: string,
  category: Category,
  limit = 4,
  locale: Locale = DEFAULT_LOCALE
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("category", category)
    .neq("id", productId)
    .limit(limit);

  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

// ============================================================
// Rodzeństwo rozmiarowe — produkty z tym samym size_group
// ============================================================
// Używane przez selektor rozmiaru na karcie produktu. Anon client (createClient)
// respektuje RLS is_active, więc ukryte produkty nie pojawią się w selektorze.
// Zawiera też bieżący produkt — buildSizeOptions (size-groups.ts) go oznacza.
export async function getSizeSiblings(
  sizeGroup: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("size_group", sizeGroup);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

// Członek grupy rozmiarów w widoku admina.
export type SizeGroupMember = { id: string; name: string; size_label: string | null };

// Członkowie grupy dla panelu admina. Admin client — pokazuje też produkty
// nieaktywne (admin musi widzieć całą grupę). Sort naturalny po etykiecie
// (numeric, pl) jak na sklepie; fallback do nazwy.
export async function getSizeGroupMembersAdmin(
  sizeGroup: string
): Promise<SizeGroupMember[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, size_label")
    .eq("size_group", sizeGroup);
  const rows = (data ?? []) as SizeGroupMember[];
  // Sort naturalny po etykiecie (fallback do nazwy) — ta sama semantyka co
  // selektor na sklepie (sizeLabelOf), więc kolejność jest spójna.
  return rows.sort((a, b) =>
    sizeLabelOf(a).localeCompare(sizeLabelOf(b), "pl", { numeric: true })
  );
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
export async function getFilterFacets(locale: Locale = DEFAULT_LOCALE) {
  const supabase = await createClient();

  // Każdy facet niesie KANONICZNĄ wartość PL (`value`) + zlokalizowany `label`.
  // Dedupe robimy po PL value, więc kliknięcie zawsze wysyła ?kolor=<PL> i
  // pasuje do `.in("color", ...)` w getProducts (predykat dalej PL — patrz
  // niżej). DE produkty pokażą niemiecką etykietę (label), ale filtrują po PL.
  // Selektujemy obie kolumny i składamy { value, label } w JS przez
  // buildLocalizedFacets (czysty, testowalny helper).
  const [
    { data: colorsData },
    { data: materialsData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("color, color_de")
      .not("color", "is", null),
    supabase
      .from("products")
      .select("material, material_de")
      .not("material", "is", null),
  ]);

  const colors = buildLocalizedFacets(
    ((colorsData ?? []) as { color: string | null; color_de: string | null }[]).map(
      (r) => ({ value: r.color, value_de: r.color_de })
    ),
    locale
  );

  const materials = buildLocalizedFacets(
    (
      (materialsData ?? []) as {
        material: string | null;
        material_de: string | null;
      }[]
    ).map((r) => ({ value: r.material, value_de: r.material_de })),
    locale
  );

  return { colors, materials };
}
