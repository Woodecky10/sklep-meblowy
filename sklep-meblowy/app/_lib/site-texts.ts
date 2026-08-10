// Krótkie teksty globalne (slogan TopBaru, tagline stopki) — tabela
// site_texts (migracja 50), edycja w /admin/strona-glowna. Fallback na
// słownik i18n przekazywany przez wołającego (TopBar/Footer).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Locale } from "./i18n";

export const SITE_TEXT_KEYS = ["topbar_slogan", "footer_tagline", "home_about"] as const;
export type SiteTextKey = (typeof SITE_TEXT_KEYS)[number];

// Limit znaków per klucz. Slogany to jedna linijka, ale `home_about` trzyma
// sformatowany HTML z edytora WYSIWYG — sam markup zjada tam sporo miejsca.
const DEFAULT_MAX_LEN = 500;
const MAX_LEN: Partial<Record<SiteTextKey, number>> = { home_about: 20000 };

export function siteTextMaxLen(key: SiteTextKey): number {
  return MAX_LEN[key] ?? DEFAULT_MAX_LEN;
}

export type SiteTextsMap = Record<
  string,
  { value: string | null; value_de: string | null }
>;

// Wybór wartości: DE → value_de → value → fallback; PL → value → fallback.
export function siteText(
  map: SiteTextsMap,
  key: SiteTextKey,
  locale: Locale,
  fallback: string
): string {
  const row = map[key];
  if (!row) return fallback;
  const val =
    locale === "de" && row.value_de && row.value_de.trim()
      ? row.value_de
      : row.value;
  return val && val.trim() ? val : fallback;
}

export const SITE_TEXTS_CACHE_TAG = "site-texts";

const fetchSiteTexts = unstable_cache(
  async (): Promise<SiteTextsMap> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("site_texts")
      .select("key, value, value_de");
    if (error || !data) return {};
    const map: SiteTextsMap = {};
    for (const row of data as { key: string; value: string | null; value_de: string | null }[]) {
      map[row.key] = { value: row.value, value_de: row.value_de };
    }
    return map;
  },
  ["site-texts"],
  { tags: [SITE_TEXTS_CACHE_TAG], revalidate: 60 }
);

export const getSiteTexts = cache(fetchSiteTexts);

// Admin: świeży odczyt bez cache (formularz musi widzieć zapis po refresh).
export async function getAllSiteTexts(): Promise<SiteTextsMap> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("site_texts").select("key, value, value_de");
  const map: SiteTextsMap = {};
  for (const row of (data ?? []) as { key: string; value: string | null; value_de: string | null }[]) {
    map[row.key] = { value: row.value, value_de: row.value_de };
  }
  return map;
}

export function invalidateSiteTextsCache() {
  revalidateTag(SITE_TEXTS_CACHE_TAG, "max");
}
