// Source of truth dla kategorii i grup — tabele category_groups + categories
// w Supabase. Edytowane przez admin panel `/admin/kategorie` (od krok-14).
//
// Wszystkie helpery są ASYNC. W Server Components dane cache'ujemy per-request
// przez React `cache()`. Mutacje (admin) revalidują tag `categories` żeby Navbar
// i menu odświeżyły się natychmiast.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeCategory, localizeCategoryGroup } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { GROUP_LABEL_DE, CATEGORY_LABEL_DE } from "./de-content-maps";

// Lokalizacja etykiety DE: najpierw kolumna `label_de` z DB (gdy admin uzupełni),
// w przeciwnym razie ręczna mapa po slug (de-content-maps), na końcu fallback PL.
function deGroup(g: Section, locale: Locale): Section {
  const r = localizeCategoryGroup(g, locale);
  if (locale === "de" && !(g.label_de && g.label_de.trim())) {
    const de = GROUP_LABEL_DE[g.slug];
    if (de) return { ...r, label: de };
  }
  return r;
}

function deCat(c: CategoryDef, locale: Locale): CategoryDef {
  const r = localizeCategory(c, locale);
  if (locale === "de" && !(c.label_de && c.label_de.trim())) {
    const de = CATEGORY_LABEL_DE[c.slug];
    if (de) return { ...r, label: de };
  }
  return r;
}

// Tag używany przez `unstable_cache` i `revalidateTag` po mutacjach z admina.
export const CATEGORIES_CACHE_TAG = "categories";

// ============================================================
// Typy — bez literal unions, bo slugi są dynamiczne (z DB)
// ============================================================

export type Section = {
  id: string;
  slug: string;
  label: string;
  // Tłumaczenie DE etykiety (null = brak → fallback do PL przy odczycie DE).
  // Surowe pole z DB; publiczne API podmienia `label` na nie wg locale.
  label_de: string | null;
  sort_order: number;
  active: boolean;
};

export type CategoryDef = {
  id: string;
  slug: string;
  label: string;
  label_de: string | null;
  group_id: string;
  group_slug: string;
  baselinkerCategoryId: number | null;
  // Slugi kategorii do cross-sell (np. dla "lozko-tapicerowane" może być
  // ["materace"] — wtedy w koszyku z łóżkiem polecamy materace).
  crossSellCategories: string[];
  sort_order: number;
  active: boolean;
};

// Backward-compat alias — kategoria reprezentowana po prostu jako slug (string).
export type CategorySlug = string;
export type SectionSlug = string;

// ============================================================
// Niskopoziomowy fetch z DB (cache'owany cross-request, tagged)
// ============================================================

type CategoriesData = {
  groups: Section[];
  categories: CategoryDef[];
};

// `unstable_cache` cache'uje cross-request — admin po mutacji wywoła
// `revalidateTag(CATEGORIES_CACHE_TAG)` żeby wymusić refresh.
//
// UWAGA: używamy `createAdminClient()` (service role, bez cookies), bo Next 16
// zabrania użycia dynamic data sources (cookies/headers) wewnątrz `unstable_cache`.
// Kategorie są danymi publicznymi (RLS: public read), więc bypass RLS przez
// admin client jest tu bezpieczny.
const fetchCategoriesData = unstable_cache(
  async (): Promise<CategoriesData> => {
    const supabase = await createAdminClient();

    const [{ data: groups }, { data: categories }] = await Promise.all([
      supabase
        .from("category_groups")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("categories")
        .select("*, group:category_groups(slug)")
        .order("sort_order", { ascending: true }),
    ]);

    return {
      groups: ((groups ?? []) as Array<{
        id: string;
        slug: string;
        label: string;
        label_de: string | null;
        sort_order: number;
        active: boolean;
      }>).map((g) => ({
        id: g.id,
        slug: g.slug,
        label: g.label,
        label_de: g.label_de ?? null,
        sort_order: g.sort_order,
        active: g.active,
      })),
      categories: ((categories ?? []) as Array<{
        id: string;
        slug: string;
        label: string;
        label_de: string | null;
        group_id: string;
        baselinker_category_id: number | null;
        cross_sell_categories: string[] | null;
        sort_order: number;
        active: boolean;
        group: { slug: string } | null;
      }>).map((c) => ({
        id: c.id,
        slug: c.slug,
        label: c.label,
        label_de: c.label_de ?? null,
        group_id: c.group_id,
        group_slug: c.group?.slug ?? "",
        baselinkerCategoryId: c.baselinker_category_id,
        crossSellCategories: c.cross_sell_categories ?? [],
        sort_order: c.sort_order,
        active: c.active,
      })),
    };
  },
  ["categories-all"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: 300 }
);

// React `cache()` dedupliuje wywołania w tym samym renderze — kilka komponentów
// pobiera tę samą strukturę bez wielokrotnego trafienia DB.
const getData = cache(fetchCategoriesData);

// ============================================================
// Public API (async)
// ============================================================

// UWAGA architektura cache: `getData()` (unstable_cache) trzyma SUROWE wiersze
// PL+_de — locale NIE wchodzi do klucza cache (jeden cache dla obu języków).
// Lokalizacja (`localizeCategory`/`localizeCategoryGroup`) dzieje się tu, w
// publicznym API, które dostaje `locale` jako parametr od strony/RSC. Dzięki
// temu nie wołamy `getLocale()`/`headers()` wewnątrz cached funkcji (zakazane
// w Next 16) i nie dublujemy cache PL/DE.
export async function getSections(
  locale: Locale = DEFAULT_LOCALE
): Promise<Section[]> {
  const data = await getData();
  return data.groups
    .filter((g) => g.active)
    .map((g) => deGroup(g, locale));
}

export async function getCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const data = await getData();
  return data.categories
    .filter((c) => c.active)
    .map((c) => deCat(c, locale));
}

export async function getAllCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  // Bez filtra `active` — używane w admin UI (domyślnie PL). deCat tłumaczy
  // tylko gdy locale='de', więc admin (PL) dostaje surowe etykiety jak dotąd.
  const data = await getData();
  return data.categories.map((c) => deCat(c, locale));
}

export async function getAllSections(
  locale: Locale = DEFAULT_LOCALE
): Promise<Section[]> {
  const data = await getData();
  return data.groups.map((g) => deGroup(g, locale));
}

export async function getCategory(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef | undefined> {
  if (!slug) return undefined;
  const data = await getData();
  const found = data.categories.find((c) => c.slug === slug);
  return found ? deCat(found, locale) : undefined;
}

export async function getCategoryLabel(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<string | undefined> {
  return (await getCategory(slug, locale))?.label;
}

export async function getSection(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<Section | undefined> {
  if (!slug) return undefined;
  const data = await getData();
  const found = data.groups.find((g) => g.slug === slug);
  return found ? deGroup(found, locale) : undefined;
}

export async function getCategoriesBySection(
  sectionSlug: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const data = await getData();
  return data.categories
    .filter((c) => c.active && c.group_slug === sectionSlug)
    .map((c) => deCat(c, locale));
}

export async function getCategoryByBaselinkerId(
  blCategoryId: number
): Promise<CategoryDef | undefined> {
  const data = await getData();
  return data.categories.find((c) => c.baselinkerCategoryId === blCategoryId);
}

export async function isCategorySlug(
  value: string | undefined | null
): Promise<boolean> {
  if (!value) return false;
  const data = await getData();
  return data.categories.some((c) => c.slug === value);
}

// ============================================================
// Helpery dla admina (mutacje)
// ============================================================

// Wywoływać po INSERT/UPDATE/DELETE w admin UI — wymusza refetch DB
// na kolejnym renderze (sklep, navbar, footer odświeżają się).
// Profile "max" = natychmiastowa inwalidacja (Next 16 wymaga 2. argumentu).
export function invalidateCategoriesCache() {
  revalidateTag(CATEGORIES_CACHE_TAG, "max");
}
