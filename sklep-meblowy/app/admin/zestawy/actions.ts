"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateBundlesCache } from "@/app/_lib/bundles-server";
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import { validateReorderIds } from "@/app/_lib/bundle-order";
import { validateImageUpload } from "@/app/_lib/image-upload";
import {
  BUNDLE_IMAGE_BUCKET,
  BUNDLE_IMAGE_PREFIX,
  bundleImageStoragePath,
} from "@/app/_lib/bundle-image";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

const MAX_RICH = 20000;
// Sanityzuje HTML z edytora, obcina do limitu, zwraca null gdy po usunięciu
// tagów nie ma treści (np. puste <p></p>).
function cleanRich(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const html = sanitizeRichHtml(input).slice(0, MAX_RICH);
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  return text.length > 0 ? html : null;
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Wspólna walidacja pól formularza zestawu. Zwraca błąd (string) albo dane.
function parseBundleForm(formData: FormData, productIds: string[]):
  | { ok: true; name: string; nameDe: string | null; description: string | null;
      descriptionDe: string | null; discountType: "percent" | "amount";
      discountValue: number; isActive: boolean }
  | { ok: false; error: string } {
  const name = sanitize(formData.get("name"), 200);
  if (!name) return { ok: false, error: "Nazwa zestawu jest wymagana" };
  if (productIds.length < 2)
    return { ok: false, error: "Zestaw musi zawierać co najmniej 2 produkty" };
  if (new Set(productIds).size !== productIds.length)
    return { ok: false, error: "Produkty w zestawie nie mogą się powtarzać" };

  const discountType = sanitize(formData.get("discount_type"), 10);
  if (discountType !== "percent" && discountType !== "amount")
    return { ok: false, error: "Wybierz typ rabatu (% lub zł)" };

  const discountValue = Number(formData.get("discount_value"));
  if (!Number.isFinite(discountValue) || discountValue <= 0)
    return { ok: false, error: "Wartość rabatu musi być większa od zera" };
  if (discountType === "percent" && (discountValue < 1 || discountValue > 90))
    return { ok: false, error: "Rabat procentowy musi być w zakresie 1–90%" };

  return {
    ok: true,
    name,
    nameDe: emptyToNull(sanitize(formData.get("name_de"), 200)),
    description: cleanRich(formData.get("description")),
    descriptionDe: cleanRich(formData.get("description_de")),
    discountType,
    discountValue,
    isActive: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

// ============================================================
// Własne zdjęcie zestawu (migracja 85)
// ============================================================
// Formularz wysyła `image` (plik już skompresowany w przeglądarce) albo
// `remove_image=1`. Brak obu = zdjęcie bez zmian. Plik ląduje w buckecie
// zdjęć produktów, folder zestawy/ (bundle-image.ts).
async function uploadBundleImage(
  formData: FormData
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: true, url: null };
  // Allowlista formatów (raster) — SVG odrzucony (stored XSS), jak w kafelkach.
  const valid = validateImageUpload(file);
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `${BUNDLE_IMAGE_PREFIX}${Date.now()}-${randomUUID()}.${valid.ext}`;
  const supabase = await createAdminClient();
  const { error } = await supabase.storage.from(BUNDLE_IMAGE_BUCKET).upload(path, valid.file, {
    contentType: valid.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { ok: false, error: `Nie udało się wgrać zdjęcia: ${error.message}` };
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUNDLE_IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// Kasuje plik zestawu ze storage. Cudzych plików (zdjęcia produktów, adresy
// zewnętrzne) nie rusza — bundleImageStoragePath zwraca dla nich null. Błąd
// kasowania tylko zostawia sierotę w storage, zapisu nie psuje.
async function deleteBundleImageFile(url: string | null | undefined): Promise<void> {
  const path = bundleImageStoragePath(url);
  if (!path) return;
  const supabase = await createAdminClient();
  await supabase.storage.from(BUNDLE_IMAGE_BUCKET).remove([path]);
}

// Obecny adres zdjęcia prosto z bazy (nie z formularza — klient mógłby podać
// cudzy). Przed migracją 85 kolumny nie ma: zapytanie daje błąd → null.
async function currentBundleImage(id: string): Promise<string | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("bundles").select("image_url").eq("id", id).maybeSingle();
  return (data as { image_url?: string | null } | null)?.image_url ?? null;
}

function invalidateAll() {
  invalidateBundlesCache();
  // Boxy zestawów siedzą na kartach produktów i stronach /zestaw/* — pełny
  // revalidate jak przy publikacji menu/podstron (prostota > chirurgia).
  revalidatePath("/", "layout");
  revalidatePath("/admin/zestawy");
}

export async function createBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const slugInput = sanitize(formData.get("slug"), 80);
  const slug = slugInput ? toSlug(slugInput) : toSlug(parsed.name);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować adresu (slug)" };

  const upload = await uploadBundleImage(formData);
  if (!upload.ok) return upload;

  const supabase = await createAdminClient();
  // Nowy zestaw na KONIEC listy (migracja 83) — jak createCollection.
  const { data: maxRow } = await supabase
    .from("bundles")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from("bundles")
    .insert({
      slug,
      sort_order: nextOrder,
      name: parsed.name,
      name_de: parsed.nameDe,
      description: parsed.description,
      description_de: parsed.descriptionDe,
      discount_type: parsed.discountType,
      discount_value: parsed.discountValue,
      is_active: parsed.isActive,
      // Klucz tylko przy wgranym zdjęciu — insert bez zdjęcia działa też
      // przed migracją 85.
      ...(upload.url ? { image_url: upload.url } : {}),
    } as never)
    .select("id")
    .single();

  if (error) {
    await deleteBundleImageFile(upload.url);
    if (error.code === "23505")
      return { ok: false, error: `Zestaw o adresie "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  // Skład w drugim kroku przez RPC. Gdy padnie — zestaw istnieje bez składu,
  // jest NIEWIDOCZNY dla klientów (< 2 składników) i da się naprawić edycją.
  const { error: itemsErr } = await supabase.rpc("save_bundle", {
    p_id: (data as { id: string }).id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (itemsErr)
    return { ok: false, error: `Zestaw utworzony, ale skład się nie zapisał — otwórz go i zapisz ponownie (${itemsErr.message})` };

  invalidateAll();
  return { ok: true, message: `Zestaw "${parsed.name}" utworzony` };
}

export async function saveBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const upload = await uploadBundleImage(formData);
  if (!upload.ok) return upload;
  const removeImage = formData.get("remove_image") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("save_bundle", {
    p_id: id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (error) {
    await deleteBundleImageFile(upload.url);
    return { ok: false, error: error.message };
  }

  // Zdjęcie osobnym UPDATE-em (save_bundle z migracji 55 go nie zna). Stary
  // plik kasujemy dopiero PO udanym zapisie nowego adresu.
  if (upload.url || removeImage) {
    const previous = await currentBundleImage(id);
    const { error: imgErr } = await supabase
      .from("bundles")
      .update({ image_url: upload.url } as never)
      .eq("id", id);
    if (imgErr) {
      await deleteBundleImageFile(upload.url);
      invalidateAll();
      return { ok: false, error: `Zestaw zapisany, ale zdjęcie nie: ${imgErr.message}` };
    }
    if (previous && previous !== upload.url) await deleteBundleImageFile(previous);
  }

  invalidateAll();
  return { ok: true, message: "Zestaw zapisany" };
}

export async function deleteBundle(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const image = await currentBundleImage(id);
  const supabase = await createAdminClient();
  const { error } = await supabase.from("bundles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await deleteBundleImageFile(image);

  invalidateAll();
  return { ok: true, message: "Zestaw usunięty" };
}

// ============================================================
// Kolejność zestawów (migracja 83) — przeciąganie w /admin/zestawy
// ============================================================
// Atomowy reorder przez RPC reorder_bundles — pętla UPDATE po jednym wierszu
// przy padzie w połowie zostawia zestawy z pomieszanymi numerami (jak
// reorderCollections). Walidacja id: bundle-order.ts (odrzuca całość, gdy
// choć jedno id jest puste, nie-UUID albo powtórzone).
export async function reorderBundles(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();
  const v = validateReorderIds(order);
  if (!v.ok) return v;

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_bundles", { p_ids: v.ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateAll();
  return { ok: true, message: "Kolejność zapisana" };
}
