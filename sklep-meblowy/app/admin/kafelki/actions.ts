"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { invalidateTilesCache } from "@/app/_lib/home-tiles";

const STORAGE_BUCKET = "home-tiles";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// ============================================================
// Helpers
// ============================================================

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// ============================================================
// Upload zdjęcia
// ============================================================
async function uploadImageIfPresent(
  formData: FormData
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, url: null };
  }
  // Allowlist formatów (raster) — SVG/inne odrzucone (stored XSS).
  const valid = validateImageUpload(file);
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `${Date.now()}-${randomUUID()}.${valid.ext}`;

  const supabase = await createAdminClient();
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, valid.file, {
      contentType: valid.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) return { ok: false, error: `Upload nieudany: ${uploadErr.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return { ok: true, url: publicUrl };
}

function extractStoragePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteStorageImage(url: string | null): Promise<void> {
  const path = extractStoragePath(url);
  if (!path) return;
  const supabase = await createAdminClient();
  await supabase.storage.from(STORAGE_BUCKET).remove([path]);
}

// ============================================================
// CREATE
// ============================================================
export async function createTile(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Etykieta jest wymagana" };

  const href = sanitize(formData.get("href"), 500);
  if (!href) return { ok: false, error: "Link jest wymagany" };

  const upload = await uploadImageIfPresent(formData);
  if (!upload.ok) return upload;

  const supabase = await createAdminClient();

  // Nowy kafelek ląduje na końcu
  const { data: maxRow } = await supabase
    .from("home_tiles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("home_tiles").insert({
    image_url: upload.url,
    image_alt: sanitize(formData.get("image_alt"), 200),
    label,
    description: emptyToNull(sanitize(formData.get("description"), 500)),
    href,
    sort_order: nextOrder,
    active: formData.get("active") === "1",
  } as never);

  if (error) {
    if (upload.url) await deleteStorageImage(upload.url);
    return { ok: false, error: error.message };
  }

  invalidateTilesCache();
  revalidatePath("/admin/kafelki");
  revalidatePath("/");
  return { ok: true, message: `Kafelek "${label}" dodany` };
}

// ============================================================
// UPDATE
// ============================================================
export async function updateTile(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id kafelka" };

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Etykieta jest wymagana" };

  const href = sanitize(formData.get("href"), 500);
  if (!href) return { ok: false, error: "Link jest wymagany" };

  const supabase = await createAdminClient();

  const { data: current } = await supabase
    .from("home_tiles")
    .select("image_url")
    .eq("id", id)
    .single();
  const currentImageUrl = (current as { image_url: string | null } | null)?.image_url ?? null;

  const upload = await uploadImageIfPresent(formData);
  if (!upload.ok) return upload;

  const updates: Record<string, unknown> = {
    image_alt: sanitize(formData.get("image_alt"), 200),
    label,
    description: emptyToNull(sanitize(formData.get("description"), 500)),
    href,
    active: formData.get("active") === "1",
  };

  if (upload.url) updates.image_url = upload.url;

  const { error } = await supabase
    .from("home_tiles")
    .update(updates as never)
    .eq("id", id);

  if (error) {
    if (upload.url) await deleteStorageImage(upload.url);
    return { ok: false, error: error.message };
  }

  if (upload.url && currentImageUrl) {
    await deleteStorageImage(currentImageUrl);
  }

  invalidateTilesCache();
  revalidatePath("/admin/kafelki");
  revalidatePath("/");
  return { ok: true, message: "Kafelek zaktualizowany" };
}

// ============================================================
// DELETE
// ============================================================
export async function deleteTile(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id kafelka" };

  const supabase = await createAdminClient();

  const { data: row } = await supabase
    .from("home_tiles")
    .select("image_url, label")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("home_tiles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (row) {
    await deleteStorageImage((row as { image_url: string | null }).image_url);
  }

  invalidateTilesCache();
  revalidatePath("/admin/kafelki");
  revalidatePath("/");
  return {
    ok: true,
    message: `Kafelek "${(row as { label?: string } | null)?.label ?? "?"}" usunięty`,
  };
}

// ============================================================
// REORDER (drag-and-drop)
// ============================================================
export async function reorderTiles(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }

  const supabase = await createAdminClient();

  for (const { id, sort_order } of order) {
    if (!id) continue;
    const { error } = await supabase
      .from("home_tiles")
      .update({ sort_order } as never)
      .eq("id", id);
    if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };
  }

  invalidateTilesCache();
  revalidatePath("/admin/kafelki");
  revalidatePath("/");
  return { ok: true, message: "Kolejność zapisana" };
}

// ============================================================
// TOGGLE ACTIVE
// ============================================================
export async function toggleTileActive(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_tiles")
    .update({ active } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateTilesCache();
  revalidatePath("/admin/kafelki");
  revalidatePath("/");
  return { ok: true, message: active ? "Kafelek włączony" : "Kafelek ukryty" };
}
