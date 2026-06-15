"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { invalidateSlidesCache } from "@/app/_lib/slides";

const STORAGE_BUCKET = "home-slides";

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

function parseDateTimeLocal(input: unknown): string | null {
  // <input type="datetime-local"> zwraca "YYYY-MM-DDTHH:mm" bez timezone.
  // Traktujemy jako lokalną strefę → konwersja do ISO.
  const v = sanitize(input);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ============================================================
// Upload zdjęcia do Supabase Storage
// ============================================================
// Wywoływane z formularza w admin UI z FormData zawierającym `image: File`.
// Zwraca publiczny URL (bucket jest public).
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

// Wyodrębnij ścieżkę pliku z URL Supabase żeby dało się go usunąć ze storage
// po zmianie zdjęcia / usunięciu slajdu. Format URL:
//   https://<projekt>.supabase.co/storage/v1/object/public/home-slides/<path>
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
export async function createSlide(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };

  const upload = await uploadImageIfPresent(formData);
  if (!upload.ok) return upload;

  const supabase = await createAdminClient();

  // Nowy slajd ląduje na końcu (max sort_order + 1)
  const { data: maxRow } = await supabase
    .from("home_slides")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("home_slides").insert({
    image_url: upload.url,
    image_alt: sanitize(formData.get("image_alt"), 200),
    image_alt_de: emptyToNull(sanitize(formData.get("image_alt_de"), 200)),
    eyebrow: emptyToNull(sanitize(formData.get("eyebrow"), 100)),
    eyebrow_de: emptyToNull(sanitize(formData.get("eyebrow_de"), 100)),
    title,
    title_de: emptyToNull(sanitize(formData.get("title_de"), 200)),
    highlighted_word: emptyToNull(sanitize(formData.get("highlighted_word"), 100)),
    highlighted_word_de: emptyToNull(sanitize(formData.get("highlighted_word_de"), 100)),
    subtitle: emptyToNull(sanitize(formData.get("subtitle"), 500)),
    subtitle_de: emptyToNull(sanitize(formData.get("subtitle_de"), 500)),
    cta_primary_label: emptyToNull(sanitize(formData.get("cta_primary_label"), 100)),
    cta_primary_label_de: emptyToNull(sanitize(formData.get("cta_primary_label_de"), 100)),
    cta_primary_href: emptyToNull(sanitize(formData.get("cta_primary_href"), 500)),
    cta_secondary_label: emptyToNull(sanitize(formData.get("cta_secondary_label"), 100)),
    cta_secondary_label_de: emptyToNull(sanitize(formData.get("cta_secondary_label_de"), 100)),
    cta_secondary_href: emptyToNull(sanitize(formData.get("cta_secondary_href"), 500)),
    starts_at: parseDateTimeLocal(formData.get("starts_at")),
    ends_at: parseDateTimeLocal(formData.get("ends_at")),
    sort_order: nextOrder,
    active: formData.get("active") === "1",
  } as never);

  if (error) {
    // Cofnij upload jeśli insert padł
    if (upload.url) await deleteStorageImage(upload.url);
    return { ok: false, error: error.message };
  }

  invalidateSlidesCache();
  revalidatePath("/admin/slider");
  revalidatePath("/");
  return { ok: true, message: `Slajd "${title}" dodany` };
}

// ============================================================
// UPDATE
// ============================================================
export async function updateSlide(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id slajdu" };

  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };

  const supabase = await createAdminClient();

  // Pobierz obecny image_url żeby ewentualnie usunąć stare zdjęcie po zmianie
  const { data: current } = await supabase
    .from("home_slides")
    .select("image_url")
    .eq("id", id)
    .single();
  const currentImageUrl = (current as { image_url: string | null } | null)?.image_url ?? null;

  const upload = await uploadImageIfPresent(formData);
  if (!upload.ok) return upload;

  // Build update object
  const updates: Record<string, unknown> = {
    image_alt: sanitize(formData.get("image_alt"), 200),
    image_alt_de: emptyToNull(sanitize(formData.get("image_alt_de"), 200)),
    eyebrow: emptyToNull(sanitize(formData.get("eyebrow"), 100)),
    eyebrow_de: emptyToNull(sanitize(formData.get("eyebrow_de"), 100)),
    title,
    title_de: emptyToNull(sanitize(formData.get("title_de"), 200)),
    highlighted_word: emptyToNull(sanitize(formData.get("highlighted_word"), 100)),
    highlighted_word_de: emptyToNull(sanitize(formData.get("highlighted_word_de"), 100)),
    subtitle: emptyToNull(sanitize(formData.get("subtitle"), 500)),
    subtitle_de: emptyToNull(sanitize(formData.get("subtitle_de"), 500)),
    cta_primary_label: emptyToNull(sanitize(formData.get("cta_primary_label"), 100)),
    cta_primary_label_de: emptyToNull(sanitize(formData.get("cta_primary_label_de"), 100)),
    cta_primary_href: emptyToNull(sanitize(formData.get("cta_primary_href"), 500)),
    cta_secondary_label: emptyToNull(sanitize(formData.get("cta_secondary_label"), 100)),
    cta_secondary_label_de: emptyToNull(sanitize(formData.get("cta_secondary_label_de"), 100)),
    cta_secondary_href: emptyToNull(sanitize(formData.get("cta_secondary_href"), 500)),
    starts_at: parseDateTimeLocal(formData.get("starts_at")),
    ends_at: parseDateTimeLocal(formData.get("ends_at")),
    active: formData.get("active") === "1",
  };

  // Tylko podmień image_url jeśli wgrano nowe (inaczej zostawiamy stare)
  if (upload.url) updates.image_url = upload.url;

  const { error } = await supabase
    .from("home_slides")
    .update(updates as never)
    .eq("id", id);

  if (error) {
    if (upload.url) await deleteStorageImage(upload.url);
    return { ok: false, error: error.message };
  }

  // Stare zdjęcie usuń dopiero po udanym update
  if (upload.url && currentImageUrl) {
    await deleteStorageImage(currentImageUrl);
  }

  invalidateSlidesCache();
  revalidatePath("/admin/slider");
  revalidatePath("/");
  return { ok: true, message: "Slajd zaktualizowany" };
}

// ============================================================
// DELETE
// ============================================================
export async function deleteSlide(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id slajdu" };

  const supabase = await createAdminClient();

  // Pobierz image_url żeby też wyczyścić storage
  const { data: row } = await supabase
    .from("home_slides")
    .select("image_url, title")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("home_slides").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  if (row) {
    await deleteStorageImage((row as { image_url: string | null }).image_url);
  }

  invalidateSlidesCache();
  revalidatePath("/admin/slider");
  revalidatePath("/");
  return {
    ok: true,
    message: `Slajd "${(row as { title?: string } | null)?.title ?? "?"}" usunięty`,
  };
}

// ============================================================
// REORDER (drag-and-drop)
// ============================================================
// Klient wysyła listę {id, sort_order} — robimy batch update.
export async function reorderSlides(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }

  const supabase = await createAdminClient();

  // Atomowy reorder w jednej transakcji (RPC) — koniec częściowej niespójności
  // przy padzie w połowie pętli (audyt LOW #17).
  const { error } = await supabase.rpc("reorder_home_slides", {
    p_ids: order.map((o) => o.id).filter(Boolean),
  });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateSlidesCache();
  revalidatePath("/admin/slider");
  revalidatePath("/");
  return { ok: true, message: "Kolejność zapisana" };
}

// ============================================================
// TOGGLE ACTIVE (szybkie pokaż/ukryj bez wchodzenia w edytor)
// ============================================================
export async function toggleSlideActive(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_slides")
    .update({ active } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateSlidesCache();
  revalidatePath("/admin/slider");
  revalidatePath("/");
  return { ok: true, message: active ? "Slajd włączony" : "Slajd ukryty" };
}
