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
import { isTrustIconKey } from "@/app/_components/ui/trust-icons";
import { invalidateTrustItemsCache } from "@/app/_lib/trust-items";
import { invalidateSiteTextsCache, SITE_TEXT_KEYS } from "@/app/_lib/site-texts";

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

// ── Pasek zaufania — pozycje ────────────────────────────────────────────

function readTrustItemFields(formData: FormData) {
  const icon = sanitize(formData.get("icon"), 50);
  const label = sanitize(formData.get("label"), 200);
  return {
    icon,
    label,
    label_de: emptyToNull(sanitize(formData.get("label_de"), 200)),
    subline: emptyToNull(sanitize(formData.get("subline"), 200)),
    subline_de: emptyToNull(sanitize(formData.get("subline_de"), 200)),
    active: formData.get("active") === "1",
  };
}

export async function createTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const fields = readTrustItemFields(formData);
  if (!isTrustIconKey(fields.icon)) return { ok: false, error: "Wybierz ikonę z listy" };
  if (!fields.label) return { ok: false, error: "Etykieta jest wymagana" };

  const supabase = await createAdminClient();
  // Nowa pozycja na końcu.
  const { data: maxRow } = await supabase
    .from("trust_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("trust_items")
    .insert({ ...fields, sort_order: nextOrder } as never);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: `Pozycja "${fields.label}" dodana` };
}

export async function updateTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id pozycji" };
  const fields = readTrustItemFields(formData);
  if (!isTrustIconKey(fields.icon)) return { ok: false, error: "Wybierz ikonę z listy" };
  if (!fields.label) return { ok: false, error: "Etykieta jest wymagana" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("trust_items")
    .update({ ...fields, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Pozycja zaktualizowana" };
}

export async function deleteTrustItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id pozycji" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("trust_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Pozycja usunięta" };
}

export async function toggleTrustItemActive(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("trust_items")
    .update({ active, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: active ? "Pozycja włączona" : "Pozycja ukryta" };
}

export async function reorderTrustItems(ids: string[]): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
    return { ok: false, error: "Nieprawidłowa lista pozycji" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_trust_items", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateTrustItemsCache();
  revalidateHome();
  return { ok: true, message: "Kolejność zapisana" };
}

// ── Teksty ogólne (TopBar / stopka) ─────────────────────────────────────
export async function updateSiteTexts(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const rows = SITE_TEXT_KEYS.map((key) => ({
    key,
    value: emptyToNull(sanitize(formData.get(key), 500)),
    value_de: emptyToNull(sanitize(formData.get(`${key}_de`), 500)),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("site_texts")
    .upsert(rows as never[], { onConflict: "key" });
  if (error) return { ok: false, error: error.message };

  invalidateSiteTextsCache();
  revalidateHome();
  return { ok: true, message: "Teksty zapisane" };
}
