// Helpery do tabeli home_slides — slajdy hero na stronie głównej.
// Edytowane przez admin panel `/admin/slider` (od krok-15).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { HeroSlide } from "../_components/layout/HomeHeroSlider";
import type { Locale } from "./i18n";
import { HOME_TEXT_DE, mapDe } from "./de-content-maps";

// Tłumaczy treść slajdu na DE: priorytet kolumna _de (z panelu /admin/slider),
// potem statyczna mapa HOME_TEXT_DE (treść sprzed migracji 30), na końcu PL.
export function localizeSlide(slide: HeroSlide, locale: Locale): HeroSlide {
  if (locale !== "de") return slide;
  // pick: _de z panelu → mapa → oryginał PL.
  const pick = (deCol: string | null | undefined, pl: string | null | undefined) =>
    deCol && deCol.trim() ? deCol : mapDe(HOME_TEXT_DE, pl);
  const pickReq = (deCol: string | null | undefined, pl: string) =>
    deCol && deCol.trim() ? deCol : mapDe(HOME_TEXT_DE, pl) ?? pl;
  return {
    ...slide,
    eyebrow: pick(slide.eyebrowDe, slide.eyebrow),
    title: pickReq(slide.titleDe, slide.title),
    highlightedWord: pick(slide.highlightedWordDe, slide.highlightedWord),
    subtitle: pick(slide.subtitleDe, slide.subtitle),
    imageAlt: pickReq(slide.imageAltDe, slide.imageAlt),
    ctaPrimary: slide.ctaPrimary
      ? { ...slide.ctaPrimary, label: pickReq(slide.ctaPrimaryLabelDe, slide.ctaPrimary.label) }
      : slide.ctaPrimary,
    ctaSecondary: slide.ctaSecondary
      ? { ...slide.ctaSecondary, label: pickReq(slide.ctaSecondaryLabelDe, slide.ctaSecondary.label) }
      : slide.ctaSecondary,
  };
}

export const SLIDES_CACHE_TAG = "home-slides";

// Surowy rekord z DB — przed mapowaniem na HeroSlide
export type SlideRow = {
  id: string;
  image_url: string | null;
  image_alt: string;
  eyebrow: string | null;
  title: string;
  highlighted_word: string | null;
  subtitle: string | null;
  cta_primary_label: string | null;
  cta_primary_href: string | null;
  cta_secondary_label: string | null;
  cta_secondary_href: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Kolumny _de (migracja 30). Opcjonalne — przed migracją absent/undefined.
  eyebrow_de?: string | null;
  title_de?: string | null;
  highlighted_word_de?: string | null;
  subtitle_de?: string | null;
  image_alt_de?: string | null;
  cta_primary_label_de?: string | null;
  cta_secondary_label_de?: string | null;
};

function rowToSlide(row: SlideRow): HeroSlide {
  return {
    id: row.id,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    eyebrow: row.eyebrow,
    title: row.title,
    highlightedWord: row.highlighted_word,
    subtitle: row.subtitle,
    ctaPrimary:
      row.cta_primary_href && row.cta_primary_label
        ? { label: row.cta_primary_label, href: row.cta_primary_href }
        : null,
    ctaSecondary:
      row.cta_secondary_href && row.cta_secondary_label
        ? { label: row.cta_secondary_label, href: row.cta_secondary_href }
        : null,
    // Tłumaczenia DE niesione obok PL — używa ich localizeSlide na /de.
    eyebrowDe: row.eyebrow_de,
    titleDe: row.title_de,
    highlightedWordDe: row.highlighted_word_de,
    subtitleDe: row.subtitle_de,
    imageAltDe: row.image_alt_de,
    ctaPrimaryLabelDe: row.cta_primary_label_de,
    ctaSecondaryLabelDe: row.cta_secondary_label_de,
  };
}

// ============================================================
// Public read: tylko aktywne i w zakresie dat (do wyświetlenia na stronie głównej)
// ============================================================
// Cross-request cache przez unstable_cache — admin po mutacji wywołuje
// invalidateSlidesCache() żeby wymusić refresh.
const fetchActiveSlides = unstable_cache(
  async (): Promise<HeroSlide[]> => {
    const supabase = await createAdminClient();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("home_slides")
      .select("*")
      .eq("active", true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("sort_order", { ascending: true });

    if (error || !data) return [];
    return (data as SlideRow[]).map(rowToSlide);
  },
  ["home-slides-active"],
  { tags: [SLIDES_CACHE_TAG], revalidate: 60 }
);

export const getActiveSlides = cache(fetchActiveSlides);

// ============================================================
// Admin read: WSZYSTKIE slajdy (też ukryte i poza datami) — do edycji
// ============================================================
export async function getAllSlides(): Promise<SlideRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("home_slides")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as SlideRow[];
}

// ============================================================
// Inwalidacja cache po mutacji w admin
// ============================================================
export function invalidateSlidesCache() {
  revalidateTag(SLIDES_CACHE_TAG, "max");
}

// ============================================================
// Domyślny slajd-fallback gdy DB pusta — żeby strona główna miała hero
// nawet zanim admin doda swoje slajdy.
// ============================================================
export const DEFAULT_FALLBACK_SLIDE: HeroSlide = {
  id: "fallback",
  imageUrl: null,
  imageAlt: "",
  eyebrow: "Mollien",
  title: "Meble, które opowiadają historię",
  highlightedWord: "opowiadają",
  subtitle:
    "Odkryj kolekcję mebli premium, stworzonych z myślą o ludziach, którzy cenią piękno, trwałość i niepowtarzalny styl.",
  ctaPrimary: { label: "Przeglądaj kolekcję", href: "/sklep" },
  ctaSecondary: null,
};
