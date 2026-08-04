// Source of truth dla kategorii — tabela `categories` w Supabase, od migracji 68
// jedno DRZEWO (kolumna parent_id). Edytowane w /admin/kategorie.
//
// Ten plik to WYŁĄCZNIE I/O + cache + lokalizacja. Cała logika drzewa
// (poddrzewa, ścieżki, projekcje menu i selectów) żyje w category-tree.ts,
// który jest czysty i testowalny bez bazy.
//
// Wszystkie helpery są ASYNC. W Server Components dane cache'ujemy per-request
// przez React `cache()`. Mutacje (admin) revalidują tag `categories`, żeby
// Navbar, stopka i filtry odświeżyły się natychmiast.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeCategory } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { CATEGORY_LABEL_DE } from "./de-content-maps";
import { effectiveActive, type CategoryNode } from "./category-tree";

// Kategoria = węzeł drzewa. Alias trzymamy, bo `CategoryDef` jest zaimportowane
// w kilkunastu miejscach, a nazwa nadal opisuje to samo pojęcie.
export type CategoryDef = CategoryNode;

// Lokalizacja etykiety DE: najpierw kolumna `label_de` z DB (gdy admin uzupełni),
// w przeciwnym razie ręczna mapa po slug (de-content-maps), na końcu fallback PL.
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

// `unstable_cache` cache'uje cross-request — admin po mutacji wywoła
// `revalidateTag(CATEGORIES_CACHE_TAG)` żeby wymusić refresh.
//
// UWAGA: używamy `createAdminClient()` (service role, bez cookies), bo Next 16
// zabrania użycia dynamic data sources (cookies/headers) wewnątrz `unstable_cache`.
// Kategorie są danymi publicznymi (RLS: public read), więc bypass RLS przez
// admin client jest tu bezpieczny.
const fetchCategoriesData = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    const supabase = await createAdminClient();

    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    return ((data ?? []) as Array<{
      id: string;
      slug: string;
      label: string;
      label_de: string | null;
      parent_id: string | null;
      cross_sell_categories: string[] | null;
      sort_order: number;
      active: boolean;
    }>).map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label,
      label_de: c.label_de ?? null,
      parent_id: c.parent_id ?? null,
      crossSellCategories: c.cross_sell_categories ?? [],
      sort_order: c.sort_order,
      active: c.active,
    }));
  },
  ["categories-tree"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: 300 }
);

// React `cache()` deduplikuje wywołania w tym samym renderze — kilka komponentów
// pobiera tę samą strukturę bez wielokrotnego trafienia DB.
const getData = cache(fetchCategoriesData);

// ============================================================
// Public API (async)
// ============================================================

// UWAGA architektura cache: `getData()` (unstable_cache) trzyma SUROWE wiersze
// PL+_de — locale NIE wchodzi do klucza cache (jeden cache dla obu języków).
// Lokalizacja dzieje się tu, w publicznym API, które dostaje `locale` od strony.

// Nawigacja, stopka, filtry, sitemap. Filtruje EFEKTYWNĄ widoczność: ukrycie
// węzła chowa całe jego poddrzewo. Zwykłe `.filter(c => c.active)` zostawiałoby
// dzieci ukrytego rodzica w pasku jako pozycje najwyższego poziomu.
export async function getCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const nodes = await getData();
  const visible = effectiveActive(nodes);
  return nodes.filter((c) => visible.has(c.slug)).map((c) => deCat(c, locale));
}

// Panel admina ORAZ filtrowanie listingu: bez filtra widoczności. Ukryta
// kategoria nie znika z listingu swojego rodzica — widoczność dotyczy
// nawigacji, nie dostępności produktu (patrz Global Constraints).
export async function getAllCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const nodes = await getData();
  return nodes.map((c) => deCat(c, locale));
}

export async function getCategory(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef | undefined> {
  if (!slug) return undefined;
  const nodes = await getData();
  const found = nodes.find((c) => c.slug === slug);
  return found ? deCat(found, locale) : undefined;
}

export async function getCategoryLabel(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<string | undefined> {
  return (await getCategory(slug, locale))?.label;
}

export async function isCategorySlug(
  value: string | undefined | null
): Promise<boolean> {
  if (!value) return false;
  const nodes = await getData();
  return nodes.some((c) => c.slug === value);
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
