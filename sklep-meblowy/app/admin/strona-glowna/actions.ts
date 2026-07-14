"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  HOME_SECTION_KEYS,
  isHomeSectionKey,
  invalidateHomeSectionsCache,
} from "@/app/_lib/home-sections";
import type { ActionResult } from "@/app/_lib/types";

function sanitize(input: unknown, max = 300): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Wspólne dla wszystkich mutacji: inwalidacja cache + revalidacja ścieżek.
// Home żyje na "/" i "/de" (rewrite w proxy) → revalidatePath("/", "layout").
function revalidateHome() {
  invalidateHomeSectionsCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/strona-glowna");
}

// ── Nagłówki sekcji (PL+DE) ─────────────────────────────────────────────
export async function updateHomeSection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const key = sanitize(formData.get("key"));
  if (!isHomeSectionKey(key)) return { ok: false, error: "Nieznana sekcja" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_sections")
    .update({
      heading: emptyToNull(sanitize(formData.get("heading"))),
      heading_de: emptyToNull(sanitize(formData.get("heading_de"))),
      subheading: emptyToNull(sanitize(formData.get("subheading"))),
      subheading_de: emptyToNull(sanitize(formData.get("subheading_de"))),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("key", key);

  if (error) return { ok: false, error: error.message };

  revalidateHome();
  return { ok: true, message: "Nagłówki sekcji zapisane" };
}

// ── Widoczność sekcji ───────────────────────────────────────────────────
export async function toggleHomeSectionVisible(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const key = sanitize(formData.get("key"));
  if (!isHomeSectionKey(key)) return { ok: false, error: "Nieznana sekcja" };
  const visible = formData.get("visible") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_sections")
    .update({ visible, updated_at: new Date().toISOString() } as never)
    .eq("key", key);

  if (error) return { ok: false, error: error.message };

  revalidateHome();
  return { ok: true, message: visible ? "Sekcja widoczna" : "Sekcja ukryta" };
}

// ── Kolejność sekcji (atomowo przez RPC z migracji 49) ─────────────────
export async function reorderHomeSections(keys: string[]): Promise<ActionResult> {
  await requireAdmin();

  // Walidacja: dokładnie komplet znanych kluczy, bez duplikatów.
  if (
    !Array.isArray(keys) ||
    keys.length !== HOME_SECTION_KEYS.length ||
    new Set(keys).size !== keys.length ||
    !keys.every(isHomeSectionKey)
  ) {
    return { ok: false, error: "Nieprawidłowa lista sekcji" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_home_sections", { p_keys: keys });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  revalidateHome();
  return { ok: true, message: "Kolejność zapisana" };
}
