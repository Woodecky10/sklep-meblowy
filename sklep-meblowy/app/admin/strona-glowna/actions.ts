"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type { ActionResult } from "@/app/_lib/types";
import { isTrustIconKey } from "@/app/_components/ui/trust-icons";
import { invalidateTrustItemsCache } from "@/app/_lib/trust-items";
import { invalidateSiteTextsCache, SITE_TEXT_KEYS } from "@/app/_lib/site-texts";
import {
  isContentBlockType,
  SYSTEM_BLOCK_TYPES,
  CONTENT_BLOCK_DEFS,
  validateBlockContent,
} from "@/app/_lib/blocks";
import { invalidatePageBlocksCache } from "@/app/_lib/blocks-server";

function sanitize(input: unknown, max = 300): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Wspólne dla wszystkich mutacji: inwalidacja cache + revalidacja ścieżek.
// Home żyje na "/" i "/de" (rewrite w proxy) → revalidatePath("/", "layout").
function revalidateHome() {
  invalidatePageBlocksCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/strona-glowna");
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

// ============================================================
// Bloki strony głównej (page_blocks, migracja 52)
// ============================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Id syntetyczne ("system:hero") ma tylko stan sprzed migracji 52.
function requireBlockId(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}
const NO_ROW_ERROR =
  "Sekcja nie ma jeszcze wpisu w bazie (migracja 52 nie została uruchomiona)";

export async function updateSystemBlockHeadings(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  // System content = wyłącznie nagłówki; zapis w całości (brak klucza po
  // wyczyszczeniu pola = świadomie puste — semantyka undefined-vs-null z kroku 1).
  const content: Record<string, string> = {};
  for (const field of ["heading", "heading_de", "subheading", "subheading_de"]) {
    const v = emptyToNull(sanitize(formData.get(field)));
    if (v !== null) content[field] = v;
  }
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .update({ content, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .in("block_type", [...SYSTEM_BLOCK_TYPES])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono sekcji" };
  revalidateHome();
  return { ok: true, message: "Zapisano nagłówki" };
}

export async function addContentBlock(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const type = formData.get("type");
  if (typeof type !== "string" || !isContentBlockType(type)) {
    return { ok: false, error: "Nieznany typ sekcji" };
  }
  const supabase = await createAdminClient();
  const { data: maxRows } = await supabase
    .from("page_blocks")
    .select("sort_order")
    .is("page_id", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder =
    ((maxRows?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("page_blocks").insert({
    page_id: null,
    block_type: type,
    sort_order: nextOrder,
    visible: false, // nowa sekcja ukryta — koleżanka wypełnia treść i włącza
    content: CONTENT_BLOCK_DEFS[type].defaultContent(),
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidateHome();
  return {
    ok: true,
    message: `Dodano sekcję „${CONTENT_BLOCK_DEFS[type].name}" (ukryta) — uzupełnij treść i włącz widoczność`,
  };
}

export async function updateContentBlock(
  id: string,
  rawContent: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const blockId = requireBlockId(id);
  if (!blockId) return { ok: false, error: NO_ROW_ERROR };
  const supabase = await createAdminClient();
  const { data: row, error: readError } = await supabase
    .from("page_blocks")
    .select("block_type")
    .eq("id", blockId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const blockType = (row as { block_type: string } | null)?.block_type;
  if (!blockType || !isContentBlockType(blockType)) {
    return { ok: false, error: "Nie znaleziono sekcji do edycji" };
  }
  const valid = validateBlockContent(blockType, rawContent);
  if (!valid.ok) return { ok: false, error: valid.error };
  const { error } = await supabase
    .from("page_blocks")
    .update({ content: valid.content, updated_at: new Date().toISOString() } as never)
    .eq("id", blockId);
  if (error) return { ok: false, error: error.message };
  revalidateHome();
  return { ok: true, message: "Zapisano treść sekcji" };
}

export async function deleteContentBlock(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  const supabase = await createAdminClient();
  // Guard w zapytaniu: systemowych nie da się usunąć nawet spreparowanym requestem.
  const { data, error } = await supabase
    .from("page_blocks")
    .delete()
    .eq("id", id)
    .not("block_type", "in", `(${[...SYSTEM_BLOCK_TYPES].join(",")})`)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Nie znaleziono sekcji (systemowych nie można usuwać)" };
  }
  revalidateHome();
  return { ok: true, message: "Usunięto sekcję" };
}

export async function togglePageBlockVisible(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  const visible = formData.get("visible") === "1";
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .update({ visible, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono sekcji" };
  revalidateHome();
  return { ok: true, message: visible ? "Sekcja widoczna" : "Sekcja ukryta" };
}

export async function reorderPageBlocks(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return { ok: false, error: "Nieprawidłowa kolejność sekcji" };
  }
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_page_blocks", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };
  revalidateHome();
  return { ok: true, message: "Zmieniono kolejność" };
}
