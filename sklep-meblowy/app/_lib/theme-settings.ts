import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  type ThemeSettings,
} from "./theme";

export const THEME_CACHE_TAG = "theme";

// Wybór motywu zmienia się WYŁĄCZNIE w /admin/wyglad (tam revalidateTag).
// Wewnątrz unstable_cache nie wolno używać cookies() → czysty klient anon
// (store_settings ma publiczny odczyt RLS). Rzucamy przy błędzie, żeby cache
// nie zapamiętał wartości awaryjnej — fallback jest per wywołanie niżej.
const fetchThemeSettings = unstable_cache(
  async (): Promise<ThemeSettings> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("theme_preset, theme_overrides, font_pair")
      .eq("id", true)
      .single();
    if (error) throw error;
    return normalizeThemeSettings(data);
  },
  ["theme-settings"],
  { tags: [THEME_CACHE_TAG], revalidate: 300 }
);

export async function getThemeSettings(): Promise<ThemeSettings> {
  try {
    return await fetchThemeSettings();
  } catch (err) {
    console.error("[theme-settings] getThemeSettings failed, using defaults", err);
    return DEFAULT_THEME_SETTINGS;
  }
}

// Admin: świeży odczyt bez cache (formularz po zapisie ma widzieć stan z DB).
export async function getThemeSettingsUncached(): Promise<ThemeSettings> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("theme_preset, theme_overrides, font_pair")
    .eq("id", true)
    .maybeSingle();
  // Loguj realny błąd zapytania — inaczej brak kolumn / błąd RLS jest
  // nieodróżnialny od „nic jeszcze nie zapisano" (spójnie z getThemeSettings).
  if (error) {
    console.error("[theme-settings] getThemeSettingsUncached failed, using defaults", error);
  }
  return normalizeThemeSettings(data);
}

export function invalidateThemeCache() {
  revalidateTag(THEME_CACHE_TAG, "max");
}
