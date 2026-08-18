import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "./supabase/server";
import { getAllCategories } from "./categories";
import { resolveCategoryFilter, expandCrossSellTargets } from "./category-tree";
import {
  searchKeyTokenGroups,
  rankByNameMatch,
  applyTokenGroup,
} from "./search-filter";
import { applyTypoCorrection } from "./search-correction";
import { getCatalogVocabulary } from "./search-vocabulary-server";
import { sizeLabelOf } from "./size-groups";
import { FACETS_CACHE_TAG } from "./cache-tags";
import { localizeProduct } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { pickSizeMatched, type SizeCandidate } from "./sleep-size";
import type { Category, Product } from "./types";
import {
  productMatchesFeatureFilters,
  collectFeatureFacets,
  localizeFeatureFacets,
  type FeatureFacetGroup,
} from "./feature-filter";
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
  // Filtry opcji wariantów (?opcja_<slug>=w1,w2): slug → wybrane wartości.
  // Parsowane w sklep/page.tsx przez parseOptionFilterParams.
  optionFilters?: Record<string, string[]>;
  // Filtry parametrów produktu (?cecha_<slug>=w1|w2): slug → wybrane wartości.
  // Parsowane w sklep/page.tsx przez parseFeatureFilterParams.
  featureFilters?: Record<string, string[]>;
  // Zakresy wymiarów w cm (?szer_od= / ?szer_do= / gl / wys).
  dimensionRanges?: DimensionRanges;
  // Slug kolekcji — filtruje produkty należące do konkretnej kolekcji
  // (np. ?kolekcja=lisbon w URL).
  collectionSlug?: string;
  // Ustawia produkty w kolejności zadanej przez admina (collection_sort_order,
  // migracja 75) zamiast sortowania z `sort`. O TYM, KIEDY to wolno włączyć,
  // NIE decyduje ten moduł — decyduje `usesCollectionOrder` z collection-order.ts,
  // wołane w app/sklep/page.tsx. Gdyby regułę powtórzyć tutaj, dwa miejsca
  // orzekałyby o tym samym i cicho by się rozjechały.
  useCollectionOrder?: boolean;
  // Legacy alias `?sekcja=` — od migracji 68 sekcje i kategorie to jedno drzewo,
  // więc ten parametr rozwiązuje się dokładnie tak samo jak `category`.
  // Zostaje dla zaindeksowanych i zabookmarkowanych linków. Gdy oba są
  // ustawione, `category` wygrywa (patrz resolveCategoryFilter).
  sectionSlug?: string;
  // Język odczytu — gdy "de", pola tekstowe (name/description/color/material/
  // sekcje) wracają zlokalizowane (z fallbackiem PL), a wyszukiwanie szuka po
  // kolumnach _de. Domyślnie PL (admin/cron/legacy callerzy działają bez zmian).
  locale?: Locale;
  // ⚠️ POLE WEWNĘTRZNE — nie ustawiać z zewnątrz. Blokuje fallback korekty
  // literówek na POWTÓRZONYM zapytaniu: getProducts woła samo siebie
  // z poprawioną frazą, a bez tej flagi poprawiona fraza mogłaby zostać
  // poprawiona ponownie, i tak w kółko, na PUBLICZNYM /sklep. Głębokość
  // rekurencji: dokładnie 1.
  skipTypoCorrection?: boolean;
};

// Strona wyników wyszukiwania/listingu. Pola korekty są OPCJONALNE, żeby nie
// łamać konsumentów, którzy o niej nic nie wiedzą.
export type ProductsPage = {
  products: Product[];
  total: number;
  pages: number;
  // Fraza KLIENTA — obecna ⇔ jego fraza dała zero, a poprawiona coś znalazła.
  correctedFrom?: string;
  // ⚠️ Fraza użyta w zapytaniu, ale obecna TYLKO wtedy, gdy wolno ją pokazać
  // klientowi — patrz canShowCorrection w search-correction.ts. Brak tego pola
  // przy obecnym `correctedFrom` znaczy: korekta zaszła, ale zdanie ma jej
  // nie cytować (nigdy nie pokazujemy rdzenia typu „lozk").
  correctedTo?: string;
};

export async function getProducts(
  filters: ProductFilters = {}
): Promise<ProductsPage> {
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
    optionFilters,
    featureFilters,
    dimensionRanges,
    collectionSlug,
    useCollectionOrder,
    sectionSlug,
    locale = DEFAULT_LOCALE,
    skipTypoCorrection,
  } = filters;

  // Normalizacja paginacji — chroni przed NaN/0/ujemnymi (patrz clampPage).
  const safePage = clampPage(page);
  const safeLimit = clampLimit(limit);

  let query = supabase.from("products").select("*", { count: "exact" });

  // Jeden filtr dla całego drzewa: węzeł pokazuje produkty z siebie ORAZ z całego
  // poddrzewa. Wcześniej były dwie gałęzie (dokładny `category` i lookup po
  // `group_slug`), bo model miał dokładnie dwa poziomy.
  //
  // getAllCategories(), NIE getCategories(): ukryta podkategoria nie ma chować
  // swoich produktów przed listingiem rodzica (patrz Global Constraints).
  const categoryFilter = resolveCategoryFilter(await getAllCategories(), {
    kategoria: category,
    sekcja: sectionSlug,
  });

  if (categoryFilter) {
    if (categoryFilter.slugs.length === 0) {
      // Nieznany slug → pusty listing, nie „wszystkie produkty".
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("category", categoryFilter.slugs);
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

  // Wyszukiwanie odporne na spacje/kolejność ORAZ na ogonki i odmianę: frazę
  // tniemy na słowa, każde składamy do ASCII i obcinamy końcówkę, a na koniec
  // rozszerzamy o synonimy ze słownika — jedno słowo daje więc GRUPĘ
  // alternatywnych rdzeni (searchKeyTokenGroups; „kanapa" → „kanap" LUB „sof",
  // patrz search-vocabulary.ts). Każda grupa idzie do zapytania przez
  // applyTokenGroup i dopasowuje się do kolumny search_key_fold (odspacjowana,
  // bez tagów, znaki złożone); DE → search_key_fold_de.
  //
  // Grupy są ANDowane między sobą (każde słowo frazy musi wystąpić, niezależnie
  // od kolejności), a alternatywy wewnątrz grupy ORowane (słowo może wystąpić
  // w którejkolwiek postaci). Składnia siedzi w applyTokenGroup: grupa
  // jednoelementowa to zwykłe .ilike(), grupa z synonimami .or().
  const searchGroups = searchKeyTokenGroups(search ?? "");
  const searchActive = searchGroups.length > 0;
  if (searchActive) {
    const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
    for (const group of searchGroups) {
      query = applyTokenGroup(query, keyCol, group);
    }
  }
  // Aktywne wyszukiwanie zmienia tryb paginacji: ranking (nazwa > opis)
  // wymaga całego zestawu dopasowań naraz, więc paginujemy w JS (patrz niżej).

  if (typeof priceMin === "number") query = query.gte("price", priceMin);
  if (typeof priceMax === "number") query = query.lte("price", priceMax);

  if (inStockOnly) query = query.gt("stock", 0);

  // Filtry liczone w JS (opcje wariantów / parametry / wymiary) — nie da się ich
  // wyrazić w .in() na kolumnie (prawda żyje w JSONB variants/features/
  // dimensions), więc liczymy pasujące id w JS (skala: dziesiątki produktów;
  // RLS i tak ogranicza odczyt do aktywnych) i zawężamy główne zapytanie przez
  // .in("id", ids). Paginacja/sort/AND z pozostałymi filtrami zostają w DB.
  const optionFiltersActive = Object.values(optionFilters ?? {}).some(
    (v) => v.length > 0
  );
  const featureFiltersActive = Object.values(featureFilters ?? {}).some(
    (v) => v.length > 0
  );
  const dimensionsActive = hasActiveDimensionRanges(dimensionRanges ?? {});
  if (optionFiltersActive || featureFiltersActive || dimensionsActive) {
    // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym wzroście katalogu PostgREST utnie wiersze i filtr/facety po cichu zgubią produkty — wtedy zdenormalizować rodziny do kolumny.
    const { data: jsFilterRows } = await supabase
      .from("products")
      .select("id, variants, features, dimensions");
    const ids = (
      (jsFilterRows ?? []) as {
        id: string;
        variants: Product["variants"];
        features: unknown;
        dimensions: Product["dimensions"];
      }[]
    )
      .filter(
        (r) =>
          (!optionFiltersActive ||
            productMatchesOptionFilters(r.variants, optionFilters!)) &&
          (!featureFiltersActive ||
            productMatchesFeatureFilters(r.features, featureFilters!)) &&
          (!dimensionsActive ||
            productMatchesDimensions(r.dimensions, dimensionRanges!))
      )
      .map((r) => r.id);
    if (ids.length === 0) {
      return { products: [], total: 0, pages: 0 };
    }
    query = query.in("id", ids);
  }

  if (useCollectionOrder) {
    // Kolejność ułożona przeciąganiem w /admin/kolekcje. Stoi PRZED `sort`,
    // bo jest domyślną kolejnością widoku kolekcji — wywołujący włącza ją
    // wyłącznie wtedy, gdy klient nie poprosił o inne uporządkowanie
    // (patrz usesCollectionOrder). Nazwa jako rozstrzygnięcie remisów: świeżo
    // dodany produkt ma 0, jak pierwszy w kolekcji, dopóki admin nie przeciągnie.
    query = query
      .order("collection_sort_order", { ascending: true })
      .order("name", { ascending: true });
  } else if (sort === "price_asc") {
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
      // DE dopasowuje name_de bez fallbacku do PL — spójnie z filtrem wyżej,
      // który przy locale „de" pyta o kolumnę search_key_fold_de.
      (p) =>
        locale === "de"
          ? (p as { name_de?: string | null }).name_de ?? ""
          : p.name
    );
    const start = (safePage - 1) * safeLimit;
    const found = {
      products: ranked
        .slice(start, start + safeLimit)
        .map((p) => localizeProduct(p, locale)),
      total: ranked.length,
      pages: Math.ceil(ranked.length / safeLimit),
    };
    // Powtórzone zapytanie kończy się tutaj — druga korekta byłaby drugim
    // poziomem rekurencji (patrz skipTypoCorrection).
    if (skipTypoCorrection) return found;

    // Fallback literówkowy. ⚠️ Odpala się WYŁĄCZNIE przy zerowym wyniku —
    // pilnuje tego applyTypoCorrection, któremu podajemy `total === 0`, a NIE
    // `products.length === 0`: na stronie 2. wyszukiwania lista bywa pusta,
    // choć fraza coś znalazła, i korekta nie ma prawa się wtedy odpalić.
    const { result, correctedFrom, correctedTo } = await applyTypoCorrection({
      search: search!,
      initial: found,
      isEmpty: (r) => r.total === 0,
      // Rzuca przy błędzie bazy — łapie to applyTypoCorrection i zachowuje się
      // dokładnie jak dziś, czyli bez korekty.
      loadVocabulary: () => getCatalogVocabulary(locale),
      rerun: (phrase) =>
        getProducts({ ...filters, search: phrase, skipTypoCorrection: true }),
    });
    // Bez korekty oddajemy dokładnie dzisiejszy kształt — bez pól korekty.
    if (correctedFrom === undefined) return result;
    return { ...result, correctedFrom, correctedTo };
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
// Slugi kategorii docelowych cross-sellu dla podanych kategorii źródłowych.
// Kolejność z bazy (cross_sell_categories to text[]) jest znacząca — steruje
// sortem karuzeli w getSizeMatchedCrossSell (realne materace przed topperami).
// Zaznaczenie węzła w panelu (np. korzenia „materace") ma znaczyć ten węzeł
// I CAŁE jego poddrzewo — tak samo jak listing kategorii (resolveCategoryFilter).
// Rozwinięcie i filtr same-sell (pomija sloty już obecne w źródle, także te,
// które wracają jako potomek po rozwinięciu) żyją w expandCrossSellTargets.
//
// getAllCategories(), NIE getCategories(): cross-sell świadomie ignoruje
// `active` — ukrycie kategorii nie wycofuje towaru ze sprzedaży (patrz
// Global Constraints).
async function resolveCrossSellTargets(
  sourceCategorySlugs: string[]
): Promise<string[]> {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("slug, cross_sell_categories")
    .in("slug", sourceCategorySlugs);

  const rawTargets: string[] = [];
  for (const c of (cats ?? []) as {
    slug: string;
    cross_sell_categories: string[] | null;
  }[]) {
    for (const s of c.cross_sell_categories ?? []) {
      if (!rawTargets.includes(s)) rawTargets.push(s);
    }
  }

  const nodes = await getAllCategories();
  return expandCrossSellTargets(nodes, rawTargets, sourceCategorySlugs);
}

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

  const targetSlugs = await resolveCrossSellTargets(cartCategorySlugs);
  if (targetSlugs.length === 0) return [];

  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select("*")
    .in("category", targetSlugs)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeProductIds.length > 0) {
    query = query.not("id", "in", `(${excludeProductIds.join(",")})`);
  }

  const { data } = await query;
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

// Cross-sell dopasowany rozmiarem spania — dla łóżka pokazuje materace w jego
// rozmiarze. Dwa zapytania zamiast jednego świadomie: wiersz produktu niesie
// ciężkie `variants` z listami tkanin, więc select("*") po całych kategoriach
// materacy to megabajty transferu przy każdym renderze, z czego ~90% do
// odrzucenia. Najpierw wąski scan kandydatów, potem pełne wiersze tylko dla
// wybranych ID.
// sizeMatched=false → wołający ma pokazać zwykłą kopię „Polecane …" zamiast
// nagłówka z rozmiarem. Filtr is_active zapewnia RLS (jak w pozostałych
// publicznych zapytaniach).
// `sleepSizes` to LISTA, bo w koszyku mogą leżeć dwa łóżka o różnych
// rozmiarach — wtedy pokazujemy materace pasujące do któregokolwiek z nich.
// Karta produktu podaje jeden rozmiar (albo pustą listę, gdy mebel go nie ma).
export async function getSizeMatchedCrossSell(
  categorySlugs: string[],
  sleepSizes: string[],
  excludeProductIds: string[] = [],
  limit = 12,
  locale: Locale = DEFAULT_LOCALE
): Promise<{ products: Product[]; sizeMatched: boolean }> {
  const targetSlugs = await resolveCrossSellTargets(categorySlugs);
  if (targetSlugs.length === 0) return { products: [], sizeMatched: false };

  if (sleepSizes.length > 0) {
    const supabase = await createClient();
    const { data: candidates } = await supabase
      .from("products")
      .select("id, category, name, size_label, price, sale_price")
      .in("category", targetSlugs)
      // Scan świadomie szerszy niż limit wyświetlania — dzieje się PRZED
      // filtrowaniem po rozmiarze, więc musi objąć więcej niż finalnie pokazane `limit` sztuk.
      .limit(500);

    const ids = pickSizeMatched(
      (candidates ?? []) as SizeCandidate[],
      sleepSizes,
      targetSlugs
    )
      .filter((p) => !excludeProductIds.includes(p.id))
      .slice(0, limit)
      .map((p) => p.id);

    if (ids.length > 0) {
      const { data: full } = await supabase.from("products").select("*").in("id", ids);
      // `in` nie gwarantuje kolejności — odtwarzamy sort z pickSizeMatched.
      const byId = new Map(((full ?? []) as Product[]).map((p) => [p.id, p]));
      const products = ids
        .map((id) => byId.get(id))
        .filter((p): p is Product => p !== undefined)
        .map((p) => localizeProduct(p, locale));
      // Wcześnie zwracamy tylko gdy faktycznie mamy produkty do pokazania —
      // pusty wynik (np. `full` null po błędzie zapytania, albo wszystkie ID
      // nie znalezione) ma spaść do fallbacku niżej, żeby sekcja nie znikła.
      if (products.length > 0) {
        return { products, sizeMatched: true };
      }
    }
  }

  // Brak rozmiaru albo zero dopasowań → dotychczasowe zachowanie, żeby sekcja
  // nie zniknęła: 4 najnowsze produkty z kategorii docelowych.
  const products = await getCrossSellProducts(categorySlugs, excludeProductIds, 4, locale);
  return { products, sizeMatched: false };
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

// Stała mieszka w module-liściu cache-tags.ts (zero importów), żeby moduł
// potrzebujący samego stringa nie musiał wciągać całego products.ts. Re-eksport
// zostaje tutaj, żeby ścieżka importu `@/app/_lib/products` nadal działała
// i żeby nie ruszać żadnego z 15 miejsc wołających invalidateFacetsCache.
export { FACETS_CACHE_TAG };

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
// je zalogowany admin).
const getFacetSource = unstable_cache(
  async (): Promise<{
    optionGroups: OptionFacetGroup[];
    featureGroups: FeatureFacetGroup[];
    dimensionBounds: DimensionBounds;
  }> => {
    const anon = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym
    // wzroście katalogu PostgREST utnie wiersze i facety po cichu zgubią
    // produkty — wtedy zdenormalizować rodziny do kolumny.
    const { data: sourceData } = await anon
      .from("products")
      .select("variants, features, dimensions");

    const rows = (sourceData ?? []) as {
      variants: Product["variants"];
      features: unknown;
      dimensions: Product["dimensions"];
    }[];

    // Facety opcji wariantów (filterable=true), parametrów produktu (features)
    // i granice wymiarów — z tych samych wierszy (jeden skan, ten sam cache).
    const optionGroups = collectOptionFacets(rows);
    const featureGroups = collectFeatureFacets(rows);
    const dimensionBounds = collectDimensionBounds(rows);

    return { optionGroups, featureGroups, dimensionBounds };
  },
  ["facet-source-v3"],
  { tags: [FACETS_CACHE_TAG], revalidate: 300 }
);

// Pobiera facety filtrów na /sklep. Wartości cachowane (getFacetSource);
// lokalizacja/sortowanie per request (tania, czysta localizeOptionFacets).
// Decyzja historyczna: nie ograniczamy facets do bieżącego search/category
// (pełna paleta zawsze; pusta lista po kliknięciu jest akceptowana).
export async function getFilterFacets(locale: Locale = DEFAULT_LOCALE) {
  const { optionGroups, featureGroups, dimensionBounds } = await getFacetSource();
  return {
    options: localizeOptionFacets(optionGroups, locale),
    dimensions: dimensionBounds,
    features: localizeFeatureFacets(featureGroups, locale),
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
  // .order("name") NIE jest kosmetyką zapytania: podpis miniatury („wartość ·
  // produkt") i casing nagłówka grupy biorą się z PIERWSZEGO wystąpienia URL-a
  // przy dedupe. Bez ORDER BY PostgREST nie gwarantuje kolejności wierszy, więc
  // dowolny UPDATE mógłby bez powodu przestawić podpisy w wybieraku.
  const { data, error } = await supabase
    .from("products")
    .select("name, variants")
    .order("name");
  if (error) return [];
  return collectVariantImageSuggestions(
    (data ?? []) as { name: unknown; variants: unknown }[]
  );
}
