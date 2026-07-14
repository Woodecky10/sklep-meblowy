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

// ── Lokalizacja ──────────────────────────────────────────────────────────
export type BannerLayout = "left" | "right" | "background";
export type LocalizedBannerContent = {
  heading: string | null;
  body: string | null;
  image_url: string | null;
  layout: BannerLayout;
  cta_label: string | null;
  cta_href: string | null;
};
export type LocalizedGalleryContent = {
  heading: string | null;
  images: { url: string; alt: string | null }[];
};
export type LocalizedProductsContent = {
  heading: string | null;
  source: "manual" | "collection" | "category";
  product_ids: string[];
  collection_slug: string | null;
  category_slug: string | null;
  limit: number;
};
export type LocalizedFaqContent = {
  heading: string | null;
  items: { question: string; answer: string }[];
};
export type LocalizedReviewsContent = {
  heading: string | null;
  items: { quote: string; author: string | null }[];
};
export type LocalizedSystemBlock = {
  id: string;
  visible: boolean;
  type: SystemBlockType;
  heading: string | null;
  subheading: string | null;
};
export type LocalizedContentBlock = { id: string; visible: boolean } & (
  | { type: "banner"; content: LocalizedBannerContent }
  | { type: "gallery"; content: LocalizedGalleryContent }
  | { type: "products"; content: LocalizedProductsContent }
  | { type: "faq"; content: LocalizedFaqContent }
  | { type: "reviews"; content: LocalizedReviewsContent }
);
export type LocalizedBlock = LocalizedSystemBlock | LocalizedContentBlock;

// Bezpieczne czytanie z jsonb: string niepusty albo null.
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

// DE per pole z fallbackiem PL (idiom repo; NIE ?? na całości).
function pickLoc(content: Record<string, unknown>, field: string, locale: Locale): string | null {
  const deVal = s(content[`${field}_de`]);
  return locale === "de" && deVal ? deVal : s(content[field]);
}

function clampLimit(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 4;
  return Math.min(12, Math.max(1, n));
}

export function localizeBlock(row: PageBlockRow, locale: Locale): LocalizedBlock | null {
  const c = row.content ?? {};
  const base = { id: row.id, visible: row.visible };
  if (isSystemBlockType(row.block_type)) {
    return {
      ...base,
      type: row.block_type,
      heading: pickLoc(c, "heading", locale),
      subheading: pickLoc(c, "subheading", locale),
    };
  }
  switch (row.block_type) {
    case "banner": {
      const rawLayout = c.layout;
      const layout: BannerLayout =
        rawLayout === "right" || rawLayout === "background" ? rawLayout : "left";
      return {
        ...base,
        type: "banner",
        content: {
          heading: pickLoc(c, "heading", locale),
          body: pickLoc(c, "body", locale),
          image_url: s(c.image_url),
          layout,
          cta_label: pickLoc(c, "cta_label", locale),
          cta_href: s(c.cta_href),
        },
      };
    }
    case "gallery": {
      const images = (Array.isArray(c.images) ? c.images : [])
        .map((img) => {
          if (typeof img !== "object" || img === null) return null;
          const o = img as Record<string, unknown>;
          const url = s(o.url);
          return url ? { url, alt: s(o.alt) } : null;
        })
        .filter((x): x is { url: string; alt: string | null } => x !== null);
      return { ...base, type: "gallery", content: { heading: pickLoc(c, "heading", locale), images } };
    }
    case "products": {
      const source =
        c.source === "collection" || c.source === "category" ? c.source : "manual";
      const product_ids = (Array.isArray(c.product_ids) ? c.product_ids : []).filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      return {
        ...base,
        type: "products",
        content: {
          heading: pickLoc(c, "heading", locale),
          source,
          product_ids,
          collection_slug: s(c.collection_slug),
          category_slug: s(c.category_slug),
          limit: clampLimit(c.limit),
        },
      };
    }
    case "faq": {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const o = it as Record<string, unknown>;
          const question = pickLoc(o, "question", locale);
          const answer = pickLoc(o, "answer", locale);
          return question && answer ? { question, answer } : null;
        })
        .filter((x): x is { question: string; answer: string } => x !== null);
      return { ...base, type: "faq", content: { heading: pickLoc(c, "heading", locale), items } };
    }
    case "reviews": {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const o = it as Record<string, unknown>;
          const quote = pickLoc(o, "quote", locale);
          return quote ? { quote, author: s(o.author) } : null;
        })
        .filter((x): x is { quote: string; author: string | null } => x !== null);
      return { ...base, type: "reviews", content: { heading: pickLoc(c, "heading", locale), items } };
    }
    default:
      return null; // nieznany typ — fail-open (kompatybilność w przód)
  }
}

// ── Walidacja treści (server actions) ────────────────────────────────────
// Normalizuje treść z formularza admina do czystego jsonb: trim, obcięcia,
// puste pola pomijane (bez kluczy-śmieci), itemy bez kompletu pól odpadają.
// Komunikaty PO POLSKU — widzi je administratorka w toaście.
type ValidationResult =
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; error: string };

const MAX_SHORT = 200;   // nagłówki, etykiety, autorzy
const MAX_LONG = 2000;   // body, odpowiedzi, cytaty
const MAX_IMAGES = 24;
const MAX_ITEMS = 20;
const MAX_PRODUCTS = 12;

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}
function isSafeHref(href: string): boolean {
  return href.startsWith("/") || href.startsWith("https://");
}
// Para PL+DE → obiekt tylko z istniejącymi kluczami.
function locPair(o: Record<string, unknown>, field: string, max: number) {
  const out: Record<string, string> = {};
  const plV = cleanStr(o[field], max);
  const deV = cleanStr(o[`${field}_de`], max);
  if (plV) out[field] = plV;
  if (deV) out[`${field}_de`] = deV;
  return out;
}

export function validateBlockContent(
  type: ContentBlockType,
  raw: unknown
): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Nieprawidłowa treść sekcji" };
  }
  const o = raw as Record<string, unknown>;
  switch (type) {
    case "banner": {
      const heading = cleanStr(o.heading, MAX_SHORT);
      if (!heading) return { ok: false, error: "Nagłówek jest wymagany" };
      const layout = o.layout ?? "left";
      if (layout !== "left" && layout !== "right" && layout !== "background") {
        return { ok: false, error: "Nieprawidłowy układ banera" };
      }
      const ctaLabel = cleanStr(o.cta_label, MAX_SHORT);
      const ctaLabelDe = cleanStr(o.cta_label_de, MAX_SHORT);
      const ctaHref = cleanStr(o.cta_href, 500);
      if ((ctaLabel || ctaLabelDe) && !ctaHref) {
        return { ok: false, error: "Przycisk ma etykietę, ale brakuje linku" };
      }
      if (ctaHref && !isSafeHref(ctaHref)) {
        return { ok: false, error: "Link przycisku musi zaczynać się od / albo https://" };
      }
      if (ctaHref && !ctaLabel) {
        return { ok: false, error: "Przycisk ma link, ale brakuje etykiety" };
      }
      const imageUrl = cleanStr(o.image_url, 1000);
      if (imageUrl && !isSafeHref(imageUrl)) {
        return { ok: false, error: "Adres zdjęcia musi zaczynać się od / albo https://" };
      }
      const headingPair = locPair(o, "heading", MAX_SHORT);
      return {
        ok: true,
        content: {
          heading,
          ...(headingPair.heading_de ? { heading_de: headingPair.heading_de } : {}),
          ...locPair(o, "body", MAX_LONG),
          ...(imageUrl ? { image_url: imageUrl } : {}),
          layout,
          ...(ctaLabel ? { cta_label: ctaLabel } : {}),
          ...(ctaLabelDe ? { cta_label_de: ctaLabelDe } : {}),
          ...(ctaHref ? { cta_href: ctaHref } : {}),
        },
      };
    }
    case "gallery": {
      const rawImages = Array.isArray(o.images) ? o.images : [];
      const images = rawImages
        .map((img) => {
          if (typeof img !== "object" || img === null) return null;
          const io = img as Record<string, unknown>;
          const url = cleanStr(io.url, 1000);
          if (!url || !isSafeHref(url)) return null;
          const alt = cleanStr(io.alt, MAX_SHORT);
          return { url, ...(alt ? { alt } : {}) };
        })
        .filter((x): x is { url: string; alt?: string } => x !== null);
      if (images.length === 0) return { ok: false, error: "Dodaj przynajmniej jedno zdjęcie" };
      if (images.length > MAX_IMAGES) {
        return { ok: false, error: `Maksymalnie ${MAX_IMAGES} zdjęć w galerii` };
      }
      return { ok: true, content: { ...locPair(o, "heading", MAX_SHORT), images } };
    }
    case "products": {
      const source =
        o.source === "collection" || o.source === "category" ? o.source : "manual";
      const content: Record<string, unknown> = {
        ...locPair(o, "heading", MAX_SHORT),
        source,
        limit: clampLimit(o.limit),
      };
      if (source === "manual") {
        const ids = (Array.isArray(o.product_ids) ? o.product_ids : [])
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .slice(0, MAX_PRODUCTS);
        if (ids.length === 0) return { ok: false, error: "Wybierz przynajmniej jeden produkt" };
        content.product_ids = ids;
      } else if (source === "collection") {
        const slug = cleanStr(o.collection_slug, MAX_SHORT);
        if (!slug) return { ok: false, error: "Wybierz kolekcję" };
        content.collection_slug = slug;
      } else {
        const slug = cleanStr(o.category_slug, MAX_SHORT);
        if (!slug) return { ok: false, error: "Wybierz kategorię" };
        content.category_slug = slug;
      }
      return { ok: true, content };
    }
    case "faq":
    case "reviews": {
      const isFaq = type === "faq";
      const rawItems = Array.isArray(o.items) ? o.items : [];
      const items = rawItems
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const io = it as Record<string, unknown>;
          if (isFaq) {
            const q = locPair(io, "question", MAX_SHORT);
            const a = locPair(io, "answer", MAX_LONG);
            return q.question && a.answer ? { ...q, ...a } : null;
          }
          const quote = locPair(io, "quote", MAX_LONG);
          const author = cleanStr(io.author, MAX_SHORT);
          return quote.quote ? { ...quote, ...(author ? { author } : {}) } : null;
        })
        .filter((x): x is Record<string, string> => x !== null);
      if (items.length === 0) {
        return {
          ok: false,
          error: isFaq ? "Dodaj przynajmniej jedno pytanie z odpowiedzią" : "Dodaj przynajmniej jedną opinię",
        };
      }
      if (items.length > MAX_ITEMS) {
        return { ok: false, error: `Maksymalnie ${MAX_ITEMS} pozycji` };
      }
      return { ok: true, content: { ...locPair(o, "heading", MAX_SHORT), items } };
    }
  }
}
