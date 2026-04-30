// Source of truth dla kategorii i grup — tabele category_groups + categories
// w Supabase. Edytowane przez admin panel `/admin/kategorie` (od krok-14).
//
// Wszystkie helpery są ASYNC. W Server Components dane cache'ujemy per-request
// przez React `cache()`. Mutacje (admin) revalidują tag `categories` żeby Navbar
// i menu odświeżyły się natychmiast.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";

// Tag używany przez `unstable_cache` i `revalidateTag` po mutacjach z admina.
export const CATEGORIES_CACHE_TAG = "categories";

// ============================================================
// Typy — bez literal unions, bo slugi są dynamiczne (z DB)
// ============================================================

export type Section = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export type CategoryDef = {
  id: string;
  slug: string;
  label: string;
  group_id: string;
  group_slug: string;
  baselinkerCategoryId: number | null;
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
        sort_order: number;
        active: boolean;
      }>),
      categories: ((categories ?? []) as Array<{
        id: string;
        slug: string;
        label: string;
        group_id: string;
        baselinker_category_id: number | null;
        sort_order: number;
        active: boolean;
        group: { slug: string } | null;
      }>).map((c) => ({
        id: c.id,
        slug: c.slug,
        label: c.label,
        group_id: c.group_id,
        group_slug: c.group?.slug ?? "",
        baselinkerCategoryId: c.baselinker_category_id,
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

export async function getSections(): Promise<Section[]> {
  const data = await getData();
  return data.groups.filter((g) => g.active);
}

export async function getCategories(): Promise<CategoryDef[]> {
  const data = await getData();
  return data.categories.filter((c) => c.active);
}

export async function getAllCategories(): Promise<CategoryDef[]> {
  // Bez filtra `active` — używane w admin UI.
  const data = await getData();
  return data.categories;
}

export async function getAllSections(): Promise<Section[]> {
  const data = await getData();
  return data.groups;
}

export async function getCategory(
  slug: string | undefined | null
): Promise<CategoryDef | undefined> {
  if (!slug) return undefined;
  const data = await getData();
  return data.categories.find((c) => c.slug === slug);
}

export async function getCategoryLabel(
  slug: string | undefined | null
): Promise<string | undefined> {
  return (await getCategory(slug))?.label;
}

export async function getSection(
  slug: string | undefined | null
): Promise<Section | undefined> {
  if (!slug) return undefined;
  const data = await getData();
  return data.groups.find((g) => g.slug === slug);
}

export async function getCategoriesBySection(
  sectionSlug: string
): Promise<CategoryDef[]> {
  const data = await getData();
  return data.categories.filter(
    (c) => c.active && c.group_slug === sectionSlug
  );
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
