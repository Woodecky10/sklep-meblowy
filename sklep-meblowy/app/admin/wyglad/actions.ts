"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { isHexColor } from "@/app/_lib/color-utils";
import { MAX_IMAGE_BYTES, OG_IMAGE_MIME, validateImageUpload } from "@/app/_lib/image-upload";
import {
  getOgImageUrlUncached,
  invalidateOgImageCache,
} from "@/app/_lib/og-image-settings";
import {
  DEFAULT_THEME_SETTINGS,
  isFontPairKey,
  isThemePresetKey,
  OVERRIDE_KEYS,
} from "@/app/_lib/theme";
import { invalidateThemeCache } from "@/app/_lib/theme-settings";
import type { ActionResult } from "@/app/_lib/types";

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
    if (!(OVERRIDE_KEYS as readonly string[]).includes(key)) {
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
      theme_overrides: DEFAULT_THEME_SETTINGS.overrides,
      font_pair: DEFAULT_THEME_SETTINGS.fontPair,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTheme();
  return { ok: true, message: "Przywrócono domyślny wygląd" };
}

// ============================================================
// Zdjęcie kafelka udostępnień (og:image)
// ============================================================
// Widoczne po wklejeniu linku na Facebooku/WhatsAppie. Rysuje je app/og/route.tsx.

const OG_BUCKET = "home-slides";
// Własny prefiks w istniejącym buckecie. Ma znaczenie przy KASOWANIU: usuwamy
// wyłącznie pliki spod tego prefiksu, żeby podmiana kafelka nigdy nie skasowała
// zdjęcia slajdu — a `og_image_url` może wskazywać na cudzy obiekt (np. gdy
// ktoś wpisze do bazy adres zdjęcia ze slidera).
const OG_PREFIX = "og/";

function revalidateOgImage() {
  invalidateOgImageCache();
  revalidatePath("/og");
  revalidatePath("/admin/wyglad");
}

// Ścieżka w buckecie TYLKO dla naszych własnych plików kafelka. `null` = nie
// nasz plik → zostawiamy go w spokoju.
function extractOwnOgPath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${OG_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length);
  return path.startsWith(OG_PREFIX) ? path : null;
}

async function deleteOwnOgImage(url: string | null): Promise<void> {
  const path = extractOwnOgPath(url);
  if (!path) return;
  const supabase = await createAdminClient();
  await supabase.storage.from(OG_BUCKET).remove([path]);
}

export async function updateOgImage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  // Panel konwertuje plik do JPEG jeszcze w przeglądarce; ta walidacja jest
  // drugą bramką — Satori wywala się na WebP/AVIF, a taki plik zgasiłby
  // og:image na WSZYSTKICH stronach sklepu.
  const valid = validateImageUpload(formData.get("image"), MAX_IMAGE_BYTES, OG_IMAGE_MIME);
  if (!valid.ok) return { ok: false, error: valid.error };

  const previousUrl = await getOgImageUrlUncached();
  const path = `${OG_PREFIX}${Date.now()}-${randomUUID()}.${valid.ext}`;

  const supabase = await createAdminClient();
  const { error: uploadErr } = await supabase.storage
    .from(OG_BUCKET)
    .upload(path, valid.file, {
      contentType: valid.contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) return { ok: false, error: `Upload nieudany: ${uploadErr.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(OG_BUCKET).getPublicUrl(path);

  const { error } = await supabase
    .from("store_settings")
    .update({ og_image_url: publicUrl, updated_at: new Date().toISOString() } as never)
    .eq("id", true);
  if (error) {
    // Cofnij upload, żeby nie zostawiać sieroty w storage.
    await supabase.storage.from(OG_BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }

  // Dopiero po udanym zapisie — inaczej awaria UPDATE zostawiłaby nas bez
  // starego i bez nowego zdjęcia.
  await deleteOwnOgImage(previousUrl);

  revalidateOgImage();
  return {
    ok: true,
    message: "Zdjęcie zapisane. Facebook trzyma podgląd w pamięci — odśwież go w Sharing Debuggerze.",
  };
}

export async function removeOgImage(): Promise<ActionResult> {
  await requireAdmin();

  const previousUrl = await getOgImageUrlUncached();

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ og_image_url: null, updated_at: new Date().toISOString() } as never)
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  await deleteOwnOgImage(previousUrl);

  revalidateOgImage();
  return { ok: true, message: "Zdjęcie usunięte — kafelek wróci do zdjęcia z pierwszego slajdu" };
}
