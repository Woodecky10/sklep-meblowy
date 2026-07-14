// Sekcje strony głównej — kolejność, widoczność i nagłówki edytowane w
// /admin/strona-glowna (tabela home_sections, migracja 49). Defaulty w kodzie
// odtwarzają dzisiejszy wygląd 1:1 (i są jednocześnie seedem migracji).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";
import { createAdminClient } from "./supabase/server";

export const HOME_SECTION_KEYS = [
  "hero",
  "tiles",
  "featured",
  "trust_bar",
  "collections",
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export function isHomeSectionKey(v: string): v is HomeSectionKey {
  return (HOME_SECTION_KEYS as readonly string[]).includes(v);
}

export type HomeSectionRow = {
  key: HomeSectionKey;
  sort_order: number;
  visible: boolean;
  heading: string | null;
  heading_de: string | null;
  subheading: string | null;
  subheading_de: string | null;
};

export type LocalizedHomeSection = {
  key: HomeSectionKey;
  visible: boolean;
  heading: string | null;
  subheading: string | null;
};

// Nagłówki domyślne ze słowników — jedno źródło prawdy z dotychczasowym UI.
// Brak klucza DE → fallback PL (świadomie, zamiast castu całego słownika).
export const DEFAULT_HOME_SECTIONS: HomeSectionRow[] = [
  { key: "hero", sort_order: 0, visible: true, heading: null, heading_de: null, subheading: null, subheading_de: null },
  { key: "tiles", sort_order: 1, visible: true, heading: pl.home.collectionsHeading, heading_de: de.home?.collectionsHeading ?? pl.home.collectionsHeading, subheading: pl.home.collectionsEyebrow, subheading_de: de.home?.collectionsEyebrow ?? pl.home.collectionsEyebrow },
  { key: "featured", sort_order: 2, visible: true, heading: pl.home.featuredHeading, heading_de: de.home?.featuredHeading ?? pl.home.featuredHeading, subheading: null, subheading_de: null },
  { key: "trust_bar", sort_order: 3, visible: true, heading: pl.trustBar.heading, heading_de: de.trustBar?.heading ?? pl.trustBar.heading, subheading: pl.trustBar.eyebrow, subheading_de: de.trustBar?.eyebrow ?? pl.trustBar.eyebrow },
  { key: "collections", sort_order: 4, visible: true, heading: pl.home.seriesHeading, heading_de: de.home?.seriesHeading ?? pl.home.seriesHeading, subheading: pl.home.seriesEyebrow, subheading_de: de.home?.seriesEyebrow ?? pl.home.seriesEyebrow },
];

// Scala wiersze z bazy z defaultami: nieznane klucze ignoruje, brakujące
// sekcje uzupełnia defaultem, sortuje po sort_order. Pusta baza → defaulty.
export function mergeHomeSections(
  rows: HomeSectionRow[] | null | undefined
): HomeSectionRow[] {
  const byKey = new Map<HomeSectionKey, HomeSectionRow>(
    DEFAULT_HOME_SECTIONS.map((s) => [s.key, { ...s }])
  );
  for (const row of rows ?? []) {
    if (row && isHomeSectionKey(row.key)) {
      byKey.set(row.key, { ...byKey.get(row.key)!, ...row });
    }
  }
  // Sortowanie po sort_order, w razie remisu — alfabetycznie po kluczu (gwarancja determinizmu).
  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key));
}

// DE: kolumna _de, pusty string/null → fallback PL (wzorzec localizeSlide).
export function localizeHomeSection(
  s: HomeSectionRow,
  locale: Locale
): LocalizedHomeSection {
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return {
    key: s.key,
    visible: s.visible,
    heading: pick(s.heading_de, s.heading),
    subheading: pick(s.subheading_de, s.subheading),
  };
}

export const HOME_SECTIONS_CACHE_TAG = "home-sections";

// Cross-request cache (wzorzec slides.ts). Wewnątrz unstable_cache nie wolno
// używać cookies() — createAdminClient (service-role) jest bez cookies, OK.
// Błąd/pusta tabela → mergeHomeSections zwraca defaulty → strona wygląda jak
// dziś (fail-open, sklep nigdy nie pada przez brak konfiguracji).
const fetchHomeSections = unstable_cache(
  async (): Promise<HomeSectionRow[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("home_sections")
      .select("key, sort_order, visible, heading, heading_de, subheading, subheading_de")
      .order("sort_order", { ascending: true });
    if (error || !data) return mergeHomeSections(null);
    return mergeHomeSections(data as HomeSectionRow[]);
  },
  ["home-sections"],
  { tags: [HOME_SECTIONS_CACHE_TAG], revalidate: 60 }
);

export const getHomeSections = cache(fetchHomeSections);

// Admin: świeży odczyt bez cache (po mutacji router.refresh() ma widzieć zmiany).
export async function getAllHomeSections(): Promise<HomeSectionRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("home_sections")
    .select("key, sort_order, visible, heading, heading_de, subheading, subheading_de")
    .order("sort_order", { ascending: true });
  return mergeHomeSections((data ?? []) as HomeSectionRow[]);
}

export function invalidateHomeSectionsCache() {
  revalidateTag(HOME_SECTIONS_CACHE_TAG, "max");
}
