import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "./supabase/server";
import { getCategories } from "./categories";
import { buildSearchOrFilter, rankByNameMatch } from "./search-filter";
import { sizeLabelOf } from "./size-groups";
import { localizeProduct, buildLocalizedFacets } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Category, Product } from "./types";
import { deriveFabricFamilies, productMatchesFabric } from "./fabric-filter";
import { getAllFabrics } from "./fabrics";
import {
  collectFeatureKeySuggestions,
  collectFeatureValueSuggestions,
} from "./product-features";
import {
  collectVariantImageSuggestions,
  type VariantImageGroup,
} from "./variant-image-suggestions";
import {
  productMatchesOptionFilters,
  productMatchesDimensions,
  hasActiveDimensionRanges,
  collectOptionFacets,
  collectDimensionBounds,
  localizeOptionFacets,
  type DimensionRanges,
  type OptionFacetGroup,
  type DimensionBounds,
} from "./option-filter";

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
  // Filtr tkanin (?tkanina=). Wartości: rodziny tkanin z katalogu fabrics
  // (dopasowywane do opcji wariantów) ∪ legacy wartości kolumny material.
  materials?: string[];
  // Filtry opcji wariantów (?opcja_<slug>=w1,w2): slug → wybrane wartości.
  // Parsowane w sklep/page.tsx przez parseOptionFilterParams.
  optionFilters?: Record<string, string[]>;
  // Zakresy wymiarów w cm (?szer_od= / ?szer_do= / gl / wys).
  dimensionRanges?: DimensionRanges;
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
    optionFilters,
    dimensionRanges,
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

  // Sanityzacja + budowa filtra .or() w search-filter.ts (escape składni
  // .or() i wildcardów ILIKE). null = po sanityzacji nic nie zostało.
  // DE szuka po name_de/description_de (bez fallbacku — patrz search-filter).
  const searchOrFilter =
    search && search.trim() ? buildSearchOrFilter(search, locale) : null;
  if (searchOrFilter) query = query.or(searchOrFilter);
  // Aktywne wyszukiwanie zmienia tryb paginacji: ranking (nazwa > opis)
  // wymaga całego zestawu dopasowań naraz, więc paginujemy w JS (patrz niżej).
  const searchActive = searchOrFilter !== null;

  if (typeof priceMin === "number") query = query.gte("price", priceMin);
  if (typeof priceMax === "number") query = query.lte("price", priceMax);

  if (inStockOnly) query = query.gt("stock", 0);

  if (colors?.length) query = query.in("color", colors);

  // Filtry liczone w JS (tkanina / opcje wariantów / wymiary) — nie da się ich
  // wyrazić w .in() na kolumnie (prawda żyje w JSONB variants/dimensions), więc
  // liczymy pasujące id w JS (skala: dziesiątki produktów; RLS i tak ogranicza
  // odczyt do aktywnych) i zawężamy główne zapytanie przez .in("id", ids).
  // Paginacja/sort/AND z pozostałymi filtrami zostają w DB.
  const optionFiltersActive = Object.values(optionFilters ?? {}).some(
    (v) => v.length > 0
  );
  const dimensionsActive = hasActiveDimensionRanges(dimensionRanges ?? {});
  if (materials?.length || optionFiltersActive || dimensionsActive) {
    const [{ data: jsFilterRows }, fabrics] = await Promise.all([
      // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym wzroście katalogu PostgREST utnie wiersze i filtr/facety po cichu zgubią produkty — wtedy zdenormalizować rodziny do kolumny.
      supabase.from("products").select("id, variants, material, dimensions"),
      materials?.length ? getAllFabrics() : Promise.resolve([]),
    ]);
    const familyNames = fabrics.map((f) => f.name);
    const ids = (
      (jsFilterRows ?? []) as {
        id: string;
        variants: Product["variants"];
        material: string | null;
        dimensions: Product["dimensions"];
      }[]
    )
      .filter(
        (r) =>
          (!materials?.length ||
            productMatchesFabric(r.variants, r.material, materials, familyNames)) &&
          (!optionFiltersActive ||
            productMatchesOptionFilters(r.variants, optionFilters!)) &&
          (!dimensionsActive ||
            productMatchesDimensions(r.dimensions, dimensionRanges!))
      )
      .map((r) => r.id);
    if (ids.length === 0) {
      return { products: [], total: 0, pages: 0 };
    }
    query = query.in("id", ids);
  }

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

  // Wyszukiwanie: pobieramy CAŁY zestaw dopasowań (name+description, z sortem
  // z DB), rankujemy w JS (trafienia w nazwie przed trafieniami tylko w opisie
  // — np. „materac" wypycha materace nad łóżka kontynentalne, które mają
  // „materac" w opisie) i dopiero wtedy paginujemy. PostgREST .order() nie
  // wyrazi rankingu warunkowego (brak CASE), a katalog to ~dziesiątki pozycji
  // (dopasowania to podzbiór) — koszt pobrania wszystkich naraz pomijalny.
  // Przeglądanie bez frazy (częsty przypadek) zostaje paginowane w DB niżej.
  if (searchActive) {
    const { data, error } = await query;
    if (error) throw error;
    const ranked = rankByNameMatch(
      (data ?? []) as Product[],
      search!,
      // DE dopasowuje name_de bez fallbacku do PL — spójnie z buildSearchOrFilter.
      (p) =>
        locale === "de"
          ? (p as { name_de?: string | null }).name_de ?? ""
          : p.name
    );
    const start = (safePage - 1) * safeLimit;
    return {
      products: ranked
        .slice(start, start + safeLimit)
        .map((p) => localizeProduct(p, locale)),
      total: ranked.length,
      pages: Math.ceil(ranked.length / safeLimit),
    };
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

export const FACETS_CACHE_TAG = "facets";

// Inwalidacja cache facetów — wołana w akcjach admina mutujących produkty
// (kolor/materiał/warianty/aktywność) i katalog tkanin. Wzorzec jak
// invalidateFabricsCache (fabrics.ts).
export function invalidateFacetsCache(): void {
  revalidateTag(FACETS_CACHE_TAG, "max");
}

// Surowe, locale-NIEZALEŻNE źródło facetów, cachowane (tag + 300 s siatka
// bezpieczeństwa na edycje bezpośrednio w DB). Wcześniej każdy klik filtra
// robił 2 pełne skany products (w tym ciężki JSON variants) — to był główny
// niecachowany koszt renderu /sklep.
//
// ⚠️ Wewnątrz unstable_cache nie wolno używać cookies() → products czytamy
// CZYSTYM klientem anon (RLS widzi dokładnie to co gość: tylko is_active —
// przy okazji facety przestają zawierać dane produktów ukrytych, gdy ogląda
// je zalogowany admin). fabrics ma RLS admin-only → createAdminClient
// (wzorzec fetchAllFabrics, działa w unstable_cache).
const getFacetSource = unstable_cache(
  async (): Promise<{
    colorRows: { value: string | null; value_de: string | null }[];
    fabricFacetRows: { value: string | null; value_de: string | null }[];
    optionGroups: OptionFacetGroup[];
    dimensionBounds: DimensionBounds;
  }> => {
    const anon = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const admin = await createAdminClient();
    const [{ data: colorsData }, { data: fabricSourceData }, { data: fabricsData }] =
      await Promise.all([
        anon.from("products").select("color, color_de").not("color", "is", null),
        // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym
        // wzroście katalogu PostgREST utnie wiersze i facety po cichu zgubią
        // produkty — wtedy zdenormalizować rodziny do kolumny.
        anon.from("products").select("variants, material, material_de, dimensions"),
        admin
          .from("fabrics")
          .select("name, name_de")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

    const colorRows = (
      (colorsData ?? []) as { color: string | null; color_de: string | null }[]
    ).map((r) => ({ value: r.color, value_de: r.color_de }));

    // Facet „Tkanina" = rodziny tkanin UŻYTE w widocznych produktach (value =
    // nazwa PL z katalogu, label DE = fabrics.name_de) ∪ legacy wartości kolumny
    // material (label DE = material_de). Dedupe po PL value robi
    // buildLocalizedFacets (rodzina z name_de wygrywa etykietę nad legacy).
    const fabricRows = (fabricSourceData ?? []) as {
      variants: Product["variants"];
      material: string | null;
      material_de: string | null;
      dimensions: Product["dimensions"];
    }[];
    const fabrics = (fabricsData ?? []) as { name: string; name_de: string | null }[];
    const familyNames = fabrics.map((f) => f.name);
    const usedFamilies = new Set<string>();
    for (const row of fabricRows) {
      for (const fam of deriveFabricFamilies(row.variants, familyNames)) {
        usedFamilies.add(fam);
      }
    }
    const fabricFacetRows = [
      ...fabrics
        .filter((f) => usedFamilies.has(f.name))
        .map((f) => ({ value: f.name as string | null, value_de: f.name_de })),
      ...fabricRows
        .filter((r) => r.material)
        .map((r) => ({ value: r.material, value_de: r.material_de })),
    ];

    // Facety opcji wariantów (filterable=true) + granice wymiarów — z tych
    // samych wierszy co facet tkanin (jeden skan, ten sam cache).
    const optionGroups = collectOptionFacets(fabricRows);
    const dimensionBounds = collectDimensionBounds(fabricRows);

    return { colorRows, fabricFacetRows, optionGroups, dimensionBounds };
  },
  ["facet-source-v2"],
  { tags: [FACETS_CACHE_TAG], revalidate: 300 }
);

// Pobiera facety filtrów na /sklep. Wartości cachowane (getFacetSource);
// lokalizacja/sortowanie per request (tania, czysta buildLocalizedFacets).
// Decyzja historyczna: nie ograniczamy facets do bieżącego search/category
// (pełna paleta zawsze; pusta lista po kliknięciu jest akceptowana).
export async function getFilterFacets(locale: Locale = DEFAULT_LOCALE) {
  const { colorRows, fabricFacetRows, optionGroups, dimensionBounds } =
    await getFacetSource();
  return {
    colors: buildLocalizedFacets(colorRows, locale),
    materials: buildLocalizedFacets(fabricFacetRows, locale),
    options: localizeOptionFacets(optionGroups, locale),
    dimensions: dimensionBounds,
  };
}

// Sugestie parametrów dla edytora produktu — z kolumn `features` WSZYSTKICH
// produktów (też ukrytych, stąd admin client): keys = nazwy (∪ SEED_FEATURE_KEYS),
// valuesByKey = nazwa (trim+lowercase) → użyte wartości. Błąd zapytania →
// puste (edytor działa, tylko bez podpowiedzi). Typ zwrotki inline — bez
// export type (gotcha Turbopack w plikach akcji; tu nie ma "use server",
// ale konsument i tak potrzebuje tylko destrukturyzacji).
export async function getFeatureSuggestionsAdmin(): Promise<{
  keys: string[];
  valuesByKey: Record<string, string[]>;
}> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from("products").select("features");
  if (error) return { keys: [], valuesByKey: {} };
  const lists = (data ?? []).map((r) => (r as { features: unknown }).features);
  return {
    keys: collectFeatureKeySuggestions(lists),
    valuesByKey: collectFeatureValueSuggestions(lists),
  };
}

// Podpowiedzi zdjęć dla wybieraka „+ Wybierz z wgranych" w edytorze produktu —
// zdjęcia przypisane do wartości opcji wariantów WSZYSTKICH produktów (też
// ukrytych, stąd admin client), bez opcji „Tkanina" (filtr w czystej funkcji).
// Błąd zapytania → pusta lista: edytor działa dalej, tylko bez wybieraka.
export async function getVariantImageSuggestionsAdmin(): Promise<
  VariantImageGroup[]
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from("products").select("name, variants");
  if (error) return [];
  return collectVariantImageSuggestions(
    (data ?? []) as { name: unknown; variants: unknown }[]
  );
}
