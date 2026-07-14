// System bloków stron (spec 2026-07-14, krok B) — tabela page_blocks,
// migracja 52. Zastępuje home-sections.ts. Bloki SYSTEMOWE = dotychczasowe
// sekcje home (nieusuwalne, dedykowane case'y w page.tsx); bloki TREŚCIOWE =
// klocki dodawane przez admina (rejestr CONTENT_BLOCK_DEFS, render w
// app/_components/blocks/). Defaulty w kodzie odtwarzają dzisiejszy wygląd
// 1:1 (fail-open: brak tabeli/wierszy → strona jak dziś).

import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";

export const SYSTEM_BLOCK_TYPES = [
  "hero",
  "tiles",
  "featured",
  "trust_bar",
  "collections",
] as const;
export type SystemBlockType = (typeof SYSTEM_BLOCK_TYPES)[number];

export const CONTENT_BLOCK_TYPES = [
  "banner",
  "gallery",
  "products",
  "faq",
  "reviews",
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export type BlockType = SystemBlockType | ContentBlockType;

export function isSystemBlockType(v: string): v is SystemBlockType {
  return (SYSTEM_BLOCK_TYPES as readonly string[]).includes(v);
}
export function isContentBlockType(v: string): v is ContentBlockType {
  return (CONTENT_BLOCK_TYPES as readonly string[]).includes(v);
}

export type PageBlockRow = {
  id: string;
  page_id: string | null;
  block_type: string;
  sort_order: number;
  visible: boolean;
  content: Record<string, unknown>;
};

// Rejestr typów treściowych — nazwy/opisy dla galerii „Dodaj sekcję"
// (panel admina jest PL-only). defaultContent() zwraca ŚWIEŻY obiekt —
// nowy blok startuje jako ukryty z tą treścią.
export const CONTENT_BLOCK_DEFS: Record<
  ContentBlockType,
  { name: string; description: string; defaultContent: () => Record<string, unknown> }
> = {
  banner: {
    name: "Tekst + zdjęcie",
    description:
      "Nagłówek, akapit tekstu i zdjęcie (po lewej, prawej albo jako tło), opcjonalny przycisk z linkiem.",
    defaultContent: () => ({ heading: "", body: "", image_url: null, layout: "left" }),
  },
  gallery: {
    name: "Galeria zdjęć",
    description: "Siatka zdjęć (np. inspiracje, realizacje) z opcjonalnym nagłówkiem.",
    defaultContent: () => ({ heading: "", images: [] }),
  },
  products: {
    name: "Sekcja produktowa",
    description:
      "Wybrane produkty, kolekcja albo kategoria — siatka kafelków jak 'Polecane'.",
    defaultContent: () => ({ heading: "", source: "manual", product_ids: [], limit: 4 }),
  },
  faq: {
    name: "Pytania i odpowiedzi (FAQ)",
    description: "Rozwijana lista pytanie–odpowiedź.",
    defaultContent: () => ({ heading: "", items: [] }),
  },
  reviews: {
    name: "Opinie klientów",
    description: "Cytaty klientów z podpisem, w kartach obok siebie.",
    defaultContent: () => ({ heading: "", items: [] }),
  },
};

// Defaulty systemowe = dzisiejszy wygląd 1:1 (te same wartości co seed
// migracji 49 → przeniesione do page_blocks migracją 52). Id syntetyczne
// "system:<typ>" — realne uuid mają tylko wiersze z DB; akcje admina na
// syntetycznym id zwrócą błąd (stan możliwy tylko przed migracją 52).
export const DEFAULT_HOME_BLOCKS: PageBlockRow[] = [
  { id: "system:hero", page_id: null, block_type: "hero", sort_order: 0, visible: true, content: {} },
  { id: "system:tiles", page_id: null, block_type: "tiles", sort_order: 1, visible: true, content: { heading: pl.home.collectionsHeading, heading_de: de.home?.collectionsHeading ?? pl.home.collectionsHeading, subheading: pl.home.collectionsEyebrow, subheading_de: de.home?.collectionsEyebrow ?? pl.home.collectionsEyebrow } },
  { id: "system:featured", page_id: null, block_type: "featured", sort_order: 2, visible: true, content: { heading: pl.home.featuredHeading, heading_de: de.home?.featuredHeading ?? pl.home.featuredHeading } },
  { id: "system:trust_bar", page_id: null, block_type: "trust_bar", sort_order: 3, visible: true, content: { heading: pl.trustBar.heading, heading_de: de.trustBar?.heading ?? pl.trustBar.heading, subheading: pl.trustBar.eyebrow, subheading_de: de.trustBar?.eyebrow ?? pl.trustBar.eyebrow } },
  { id: "system:collections", page_id: null, block_type: "collections", sort_order: 4, visible: true, content: { heading: pl.home.seriesHeading, heading_de: de.home?.seriesHeading ?? pl.home.seriesHeading, subheading: pl.home.seriesEyebrow, subheading_de: de.home?.seriesEyebrow ?? pl.home.seriesEyebrow } },
];

// Scala wiersze z DB z gwarancjami: null (błąd) → defaulty; nieznane typy
// odpadają; każdy z 5 bloków systemowych obecny (brakujący → default,
// nieusuwalność odporna także na ręczne grzebanie w DB); wiersz z DB jest
// prawdą (content NIE jest głęboko scalany z defaultem — brak klucza
// nagłówka = świadomie wyczyszczone). Sort po sort_order, tie-break po id.
export function mergeHomeBlocks(rows: PageBlockRow[] | null): PageBlockRow[] {
  if (rows === null) return DEFAULT_HOME_BLOCKS.map((b) => ({ ...b }));
  const known = rows.filter(
    (r) => r && (isSystemBlockType(r.block_type) || isContentBlockType(r.block_type))
  );
  if (known.length === 0) return DEFAULT_HOME_BLOCKS.map((b) => ({ ...b }));
  const presentSystem = new Set(
    known.map((r) => r.block_type).filter(isSystemBlockType)
  );
  const missingDefaults = DEFAULT_HOME_BLOCKS.filter(
    (d) => !presentSystem.has(d.block_type as SystemBlockType)
  ).map((b) => ({ ...b }));
  return [...known, ...missingDefaults].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
}
