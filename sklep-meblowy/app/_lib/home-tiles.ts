// Helpery do tabeli home_tiles — kafelki "Znajdź swój styl" na stronie głównej.
// Edytowane przez admin panel `/admin/kafelki`.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Locale } from "./i18n";
import { HOME_TEXT_DE, mapDe } from "./de-content-maps";

export const TILES_CACHE_TAG = "home-tiles";

// Surowy rekord z DB
export type TileRow = {
  id: string;
  image_url: string | null;
  image_alt: string;
  label: string;
  description: string | null;
  href: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Kolumny _de (migracja 30). Opcjonalne — przed migracją absent/undefined.
  label_de?: string | null;
  description_de?: string | null;
  image_alt_de?: string | null;
};

// ============================================================
// Public read: tylko aktywne, sortowane (do wyświetlenia na stronie głównej)
// ============================================================
const fetchActiveTiles = unstable_cache(
  async (): Promise<TileRow[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("home_tiles")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error || !data) return [];
    return data as TileRow[];
  },
  ["home-tiles-active"],
  { tags: [TILES_CACHE_TAG], revalidate: 60 }
);

export const getActiveTiles = cache(fetchActiveTiles);

// Tłumaczy kafelek na DE: priorytet kolumna _de (z panelu), potem statyczna mapa
// HOME_TEXT_DE (treść sprzed migracji 30), na końcu fallback do PL.
export function localizeTile(tile: TileRow, locale: Locale): TileRow {
  if (locale !== "de") return tile;
  const pick = (de: string | null | undefined, pl: string) =>
    de && de.trim() ? de : mapDe(HOME_TEXT_DE, pl) ?? pl;
  return {
    ...tile,
    label: pick(tile.label_de, tile.label),
    description:
      tile.description_de && tile.description_de.trim()
        ? tile.description_de
        : mapDe(HOME_TEXT_DE, tile.description) ?? null,
    image_alt: pick(tile.image_alt_de, tile.image_alt),
  };
}

// ============================================================
// Admin read: WSZYSTKIE kafelki — do edycji
// ============================================================
export async function getAllTiles(): Promise<TileRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("home_tiles")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as TileRow[];
}

// ============================================================
// Inwalidacja cache po mutacji w admin
// ============================================================
export function invalidateTilesCache() {
  revalidateTag(TILES_CACHE_TAG, "max");
}

// ============================================================
// Fallback dla pustej DB (gdy admin jeszcze nic nie dodał) —
// żeby home miało kafelki nawet przed migracją seedem.
// ============================================================
export const DEFAULT_FALLBACK_TILES: TileRow[] = [
  {
    id: "fallback-1",
    image_url: null,
    image_alt: "",
    label: "Sofy 3-osobowe",
    description: "Komfort i elegancja w każdym salonie",
    href: "/sklep?kategoria=sofa-3-osobowa",
    sort_order: 0,
    active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-2",
    image_url: null,
    image_alt: "",
    label: "Łóżka tapicerowane",
    description: "Sypialnia marzeń, sen doskonały",
    href: "/sklep?kategoria=lozko-tapicerowane",
    sort_order: 1,
    active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-3",
    image_url: null,
    image_alt: "",
    label: "Fotele",
    description: "Twój kąt relaksu i inspiracji",
    href: "/sklep?kategoria=fotele",
    sort_order: 2,
    active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: "fallback-4",
    image_url: null,
    image_alt: "",
    label: "Pufy",
    description: "Styl i wszechstronność w jednym",
    href: "/sklep?kategoria=pufy",
    sort_order: 3,
    active: true,
    created_at: "",
    updated_at: "",
  },
];
