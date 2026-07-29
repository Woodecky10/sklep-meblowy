// Podstrony (spec 2026-07-14, krok C) — CZYSTY moduł: slug, walidacja,
// lokalizacja metadanych. Zero importów server-only (formularze admina
// używają slugifyTitle/validatePageSlug na żywo w kliencie) — fetch żyje
// w pages-server.ts (lekcja kroku B: split pure/server).

import type { Locale } from "./i18n";

// Wszystkie istniejące segmenty top-level (trasy statyczne mają pierwszeństwo
// nad app/[slug], ale rezerwacja chroni przed dezorientacją: strona o slugu
// "sklep" nigdy by się nie wyrenderowała). "de" = prefiks locale w proxy.
export const RESERVED_SLUGS: Set<string> = new Set([
  "admin",
  "api",
  "auth",
  "checkout",
  "de",
  "dostawa",
  // Feed produktowy dla Google Merchant Center (app/feed.xml/route.ts).
  "feed.xml",
  "konto",
  "kontakt",
  "koszyk",
  "logowanie",
  "o-nas",
  // Brandowy obrazek og:image 1200×630 (app/og/route.tsx).
  "og",
  "produkt",
  "prywatnosc",
  "regulamin",
  "rejestracja",
  "reset-hasla",
  "sklep",
  "tkaniny",
  "ulubione",
  "zapomnialem-hasla",
  "zestaw",
  "zwroty",
]);

// Kebab-case bez wiodących/końcowych/podwójnych myślników — ta sama semantyka
// co check-constraint pages_slug_format w migracji 53.
export const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PAGE_SLUG_MAX = 80;

// "Pielęgnacja mebli" → "pielegnacja-mebli". ł nie rozkłada się przez NFD —
// ręcznie (wzorzec optionParamSlug z option-filter.ts).
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PAGE_SLUG_MAX)
    .replace(/-+$/g, "");
}

// Komunikaty PO POLSKU — widzi je administratorka w toaście.
export function validatePageSlug(
  slug: string
): { ok: true } | { ok: false; error: string } {
  if (!slug) return { ok: false, error: "Adres strony jest wymagany" };
  if (slug.length > PAGE_SLUG_MAX) {
    return { ok: false, error: `Adres może mieć najwyżej ${PAGE_SLUG_MAX} znaków` };
  }
  if (!PAGE_SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "Adres może zawierać tylko małe litery, cyfry i pojedyncze myślniki",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Ten adres jest zajęty przez istniejącą stronę sklepu" };
  }
  return { ok: true };
}

export type PageRow = {
  id: string;
  slug: string;
  title: string;
  title_de: string | null;
  seo_description: string | null;
  seo_description_de: string | null;
  published: boolean;
  updated_at: string;
};

// DE per pole z fallbackiem PL (idiom repo).
export function localizePageMeta(
  row: PageRow,
  locale: Locale
): { title: string; seoDescription: string | null } {
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return {
    title: pick(row.title_de, row.title) ?? row.title,
    seoDescription: pick(row.seo_description_de, row.seo_description),
  };
}

// Steruje hreflang/sitemap: strona "ma DE", gdy admin świadomie przetłumaczył tytuł.
export function pageHasDe(row: PageRow): boolean {
  return !!row.title_de && row.title_de.trim().length > 0;
}

// Kto widzi stronę: opublikowaną każdy, szkic tylko admin (podgląd).
export function canViewPage(published: boolean, isAdminViewer: boolean): boolean {
  return published || isAdminViewer;
}