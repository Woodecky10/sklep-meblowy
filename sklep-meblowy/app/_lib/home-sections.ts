// Sekcje strony głównej — kolejność, widoczność i nagłówki edytowane w
// /admin/strona-glowna (tabela home_sections, migracja 49). Defaulty w kodzie
// odtwarzają dzisiejszy wygląd 1:1 (i są jednocześnie seedem migracji).

import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import type { PlShape } from "./dictionaries/pl";
import { de } from "./dictionaries/de";

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
const deFull = de as PlShape;
export const DEFAULT_HOME_SECTIONS: HomeSectionRow[] = [
  { key: "hero", sort_order: 0, visible: true, heading: null, heading_de: null, subheading: null, subheading_de: null },
  { key: "tiles", sort_order: 1, visible: true, heading: pl.home.collectionsHeading, heading_de: deFull.home.collectionsHeading, subheading: pl.home.collectionsEyebrow, subheading_de: deFull.home.collectionsEyebrow },
  { key: "featured", sort_order: 2, visible: true, heading: pl.home.featuredHeading, heading_de: deFull.home.featuredHeading, subheading: null, subheading_de: null },
  { key: "trust_bar", sort_order: 3, visible: true, heading: pl.trustBar.heading, heading_de: deFull.trustBar.heading, subheading: pl.trustBar.eyebrow, subheading_de: deFull.trustBar.eyebrow },
  { key: "collections", sort_order: 4, visible: true, heading: pl.home.seriesHeading, heading_de: deFull.home.seriesHeading, subheading: pl.home.seriesEyebrow, subheading_de: deFull.home.seriesEyebrow },
];

// Scala wiersze z bazy z defaultami: nieznane klucze ignoruje, brakujące
// sekcje uzupełnia defaultem, sortuje po sort_order. Pusta baza → defaulty.
export function mergeHomeSections(
  rows: HomeSectionRow[] | null | undefined
): HomeSectionRow[] {
  const byKey = new Map<HomeSectionKey, HomeSectionRow>(
    DEFAULT_HOME_SECTIONS.map((s) => [s.key, s])
  );
  for (const row of rows ?? []) {
    if (row && isHomeSectionKey(row.key)) {
      byKey.set(row.key, { ...byKey.get(row.key)!, ...row });
    }
  }
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
