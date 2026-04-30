// Helpery do tabeli home_slides — slajdy hero na stronie głównej.
// Edytowane przez admin panel `/admin/slider` (od krok-15).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { HeroSlide } from "../_components/layout/HomeHeroSlider";

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
