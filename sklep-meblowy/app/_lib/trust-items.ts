// Pozycje paska zaufania (tabela trust_items, migracja 50) — edytowane
// w /admin/strona-glowna, renderowane w TrustBar (home / karta produktu /
// stopka). Fallback: null z fetcha (błąd/brak tabeli) → dzisiejsze 4 pozycje
// ze słowników; pusta lista (celowe usunięcie w adminie) → pusty pasek.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";
import { isTrustIconKey, type TrustIconKey } from "../_components/ui/trust-icons";

export type TrustItemRow = {
  id: string;
  icon: string;
  label: string;
  label_de: string | null;
  subline: string | null;
  subline_de: string | null;
  sort_order: number;
  active: boolean;
};

export type LocalizedTrustItem = {
  id: string;
  icon: TrustIconKey;
  label: string;
  subline: string | null;
};

function defaultTrustItems(locale: Locale): LocalizedTrustItem[] {
  // Brak klucza DE → fallback PL per pole (świadomie, zamiast asercji `!` —
  // de jest DeepPartial i pole może legalnie zniknąć).
  const p = pl.trustBar;
  const d = locale === "de" ? de.trustBar : undefined;
  return [
    { id: "default-producer", icon: "medal-pl", label: d?.producer ?? p.producer, subline: null },
    { id: "default-quality", icon: "shield-check", label: d?.quality ?? p.quality, subline: null },
    { id: "default-delivery", icon: "truck-free", label: d?.delivery ?? p.delivery, subline: d?.deliveryScope ?? p.deliveryScope },
    { id: "default-warranty", icon: "warranty-2y", label: d?.warranty ?? p.warranty, subline: null },
  ];
}

export function prepareTrustItems(
  rows: TrustItemRow[] | null,
  locale: Locale
): LocalizedTrustItem[] {
  if (rows === null) return defaultTrustItems(locale);
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return rows
    .filter((r) => r.active && isTrustIconKey(r.icon))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      id: r.id,
      icon: r.icon as TrustIconKey,
      label: pick(r.label_de, r.label) ?? r.label,
      subline: pick(r.subline_de, r.subline),
    }));
}

export const TRUST_ITEMS_CACHE_TAG = "trust-items";

// Cache'ujemy SUROWE wiersze (wszystkie, też nieaktywne — filtruje
// prepareTrustItems per locale). null = błąd odczytu → sygnał fallbacku.
const fetchTrustItems = unstable_cache(
  async (): Promise<TrustItemRow[] | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("trust_items")
      .select("id, icon, label, label_de, subline, subline_de, sort_order, active")
      .order("sort_order", { ascending: true });
    if (error || !data) return null;
    return data as TrustItemRow[];
  },
  ["trust-items"],
  { tags: [TRUST_ITEMS_CACHE_TAG], revalidate: 60 }
);

export const getTrustItems = cache(fetchTrustItems);

// Admin: świeży odczyt bez cache.
export async function getAllTrustItems(): Promise<TrustItemRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("trust_items")
    .select("id, icon, label, label_de, subline, subline_de, sort_order, active")
    .order("sort_order", { ascending: true });
  return (data ?? []) as TrustItemRow[];
}

export function invalidateTrustItemsCache() {
  revalidateTag(TRUST_ITEMS_CACHE_TAG, "max");
}
