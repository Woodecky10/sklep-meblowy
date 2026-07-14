"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { isHexColor } from "@/app/_lib/color-utils";
import {
  DEFAULT_THEME_SETTINGS,
  isFontPairKey,
  isThemePresetKey,
} from "@/app/_lib/theme";
import { invalidateThemeCache } from "@/app/_lib/theme-settings";
import type { ActionResult } from "@/app/_lib/types";

const OVERRIDE_KEYS = ["navy", "gold", "cream"];

// Motyw renderuje się w root layoucie na każdej stronie → po zapisie
// revalidacja całego layoutu (jak przy kursie EUR).
function revalidateTheme() {
  invalidateThemeCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/wyglad");
}

export async function updateThemeSettings(input: {
  preset: string;
  overrides: Record<string, string>;
  fontPair: string;
}): Promise<ActionResult> {
  await requireAdmin();

  if (!isThemePresetKey(input.preset)) {
    return { ok: false, error: "Nieznany motyw" };
  }
  if (!isFontPairKey(input.fontPair)) {
    return { ok: false, error: "Nieznana para fontów" };
  }
  // Odrzucamy (nie „cicho czyścimy") złe dane — to bug UI, nie decyzja usera.
  for (const [key, val] of Object.entries(input.overrides ?? {})) {
    if (!OVERRIDE_KEYS.includes(key)) {
      return { ok: false, error: `Nieznany kolor: ${key}` };
    }
    if (!isHexColor(val)) {
      return { ok: false, error: `Nieprawidłowy kolor (#rrggbb): ${val}` };
    }
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      theme_preset: input.preset,
      theme_overrides: input.overrides ?? {},
      font_pair: input.fontPair,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTheme();
  return { ok: true, message: "Wygląd zapisany — zmiany są już na sklepie" };
}

export async function resetThemeSettings(): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({
      theme_preset: DEFAULT_THEME_SETTINGS.preset,
      theme_overrides: {},
      font_pair: DEFAULT_THEME_SETTINGS.fontPair,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTheme();
  return { ok: true, message: "Przywrócono domyślny wygląd" };
}
