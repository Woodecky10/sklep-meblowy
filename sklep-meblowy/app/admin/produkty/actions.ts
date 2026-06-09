"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type {
  ProductDescriptionSection,
  ProductDimensions,
  ProductVariants,
} from "@/app/_lib/types";

const STORAGE_BUCKET = "products";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

// ============================================================
// Helpers
// ============================================================

function sanitize(input: unknown, max = 1000): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseNumber(input: unknown, fallback: number | null = null): number | null {
  if (typeof input === "string" && input.trim() !== "") {
    const normalized = input.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof input === "number" && Number.isFinite(input)) return input;
  return fallback;
}

function parseInteger(input: unknown, fallback = 0): number {
  const n = parseNumber(input, fallback);
  return n === null ? fallback : Math.trunc(n);
}

// ============================================================
// Upload zdjęcia do bucket "products"
// ============================================================
// Wywoływane z formularza w admin UI z FormData zawierającym `image: File`.
// Zwraca publiczny URL (bucket jest public).
export async function uploadProductImage(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Brak pliku" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Plik musi być obrazem (jpg, png, webp itp.)" };
  }
  // Limit 8 MB — zdjęcia produktów typowo do 2 MB, 8 daje spory zapas.
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, error: "Zdjęcie jest za duże (max 8 MB)" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${Date.now()}-${randomUUID()}.${ext}`;

  const supabase = await createAdminClient();
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) return { ok: false, error: `Upload nieudany: ${uploadErr.message}` };

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return { ok: true, data: { url: publicUrl } };
}

// Wyodrębnij ścieżkę pliku z URL Supabase Storage żeby dało się go usunąć.
// Format: https://<projekt>.supabase.co/storage/v1/object/public/products/<path>
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

// Usuń zdjęcie ze storage — tylko jeśli URL należy do naszego bucketa.
// URL-e zewnętrzne (Unsplash, BL) ignorujemy (no-op).
export async function deleteProductImage(url: string): Promise<ActionResult> {
  await requireAdmin();
  if (!url) return { ok: false, error: "Brak URL" };
  await deleteStorageImage(url);
  return { ok: true };
}

// ============================================================
// updateProductBasics — aktualizacja podstawowych pól produktu
// ============================================================
// Zapisuje pola spoza variants/images: nazwa, opis, cena, kategoria,
// stock, color, material, dimensions, weight, construction, delivery_time, warranty.
// Globalna galeria (images) i variants — osobne actions niżej.
export async function updateProductBasics(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id produktu" };

  const name = sanitize(formData.get("name"), 300);
  if (!name) return { ok: false, error: "Nazwa jest wymagana" };

  const price = parseNumber(formData.get("price"));
  if (price === null || price < 0) return { ok: false, error: "Cena musi być nieujemna" };

  const category = sanitize(formData.get("category"), 100);
  if (!category) return { ok: false, error: "Kategoria jest wymagana" };

  // dimensions: pola width/depth/height jako osobne inputy
  const width = parseNumber(formData.get("dim_width"));
  const depth = parseNumber(formData.get("dim_depth"));
  const height = parseNumber(formData.get("dim_height"));
  let dimensions: ProductDimensions | null = null;
  if (width !== null && depth !== null && height !== null) {
    dimensions = { width, depth, height };
  }

  // UWAGA: pole `description` celowo pomijane w updates — opis jest single
  // source of truth z BaseLinkera (sklejone Opis 1-5 w mapBlToProduct).
  // Admin nie edytuje opisu — robi to inna osoba w panelu BL.
  const updates: Record<string, unknown> = {
    name,
    price,
    category,
    stock: parseInteger(formData.get("stock"), 0),
    color: emptyToNull(sanitize(formData.get("color"), 100)),
    material: emptyToNull(sanitize(formData.get("material"), 100)),
    dimensions,
    weight: parseNumber(formData.get("weight")),
    construction: emptyToNull(sanitize(formData.get("construction"), 1000)),
    delivery_time: emptyToNull(sanitize(formData.get("delivery_time"), 100)),
    warranty: emptyToNull(sanitize(formData.get("warranty"), 100)),
  };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update(updates as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${id}`);
  revalidatePath(`/produkt/${id}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano podstawowe dane" };
}

// ============================================================
// updateProductImages — globalna galeria produktu
// ============================================================
// Klient buduje pełną listę URL-i w stanie React (po uploadzie / usunięciu /
// reorderze przez strzałki ↑↓) i wysyła całą jako JSON. Action zapisuje 1:1.
export async function updateProductImages(
  productId: string,
  images: string[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!productId) return { ok: false, error: "Brak id produktu" };
  if (!Array.isArray(images)) return { ok: false, error: "Lista zdjęć musi być tablicą" };

  // Walidacja URL: każdy element musi być stringiem
  const clean = images.filter((x) => typeof x === "string" && x.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ images: clean } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano zdjęcia produktu" };
}

// ============================================================
// updateProductVariants — pełna struktura wariantów
// ============================================================
// Klient buduje cały obiekt ProductVariants i wysyła jako JSON.
// Action waliduje strukturę i zapisuje. Pole variants może być null
// (produkt bez wariantów).
export async function updateProductVariants(
  productId: string,
  variants: ProductVariants | null
): Promise<ActionResult> {
  await requireAdmin();

  if (!productId) return { ok: false, error: "Brak id produktu" };

  // Walidacja: jeśli niepusty, sprawdź strukturę
  if (variants !== null) {
    if (
      typeof variants !== "object" ||
      !Array.isArray(variants.options) ||
      !Array.isArray(variants.combinations)
    ) {
      return { ok: false, error: "Nieprawidłowa struktura wariantów" };
    }
    for (const opt of variants.options) {
      if (typeof opt.name !== "string" || !Array.isArray(opt.values)) {
        return { ok: false, error: "Nieprawidłowa struktura opcji wariantu" };
      }
    }
    for (const c of variants.combinations) {
      if (typeof c.values !== "object" || c.values === null) {
        return { ok: false, error: "Nieprawidłowa struktura kombinacji" };
      }
      if (typeof c.stock !== "number") {
        return { ok: false, error: "Stock kombinacji musi być liczbą" };
      }
      if (c.images !== undefined && !Array.isArray(c.images)) {
        return { ok: false, error: "Zdjęcia kombinacji muszą być tablicą" };
      }
    }
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ variants } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano warianty" };
}

// ============================================================
// deleteProduct — usuwa produkt z DB + storage cleanup
// ============================================================
// Blokuje usuwanie produktu, który jest w aktywnych zamówieniach (FK
// order_items.product_id ma ON DELETE RESTRICT — historię zamówień
// chronimy). Pozostałe powiązania (reviews, wishlists, featured_products)
// są CASCADE, inquiries SET NULL — usuną się automatycznie.
//
// Storage cleanup: tylko URL-e w naszym bucket "products" są usuwane
// fizycznie. URL-e zewnętrzne (BaseLinker, Unsplash) zostają w sieci
// — nie nasze, nie nasz problem. Czyścimy też zdjęcia variantów.
//
// UWAGA: nie usuwa produktu z BaseLinkera. BL to osobne źródło prawdy —
// koleżanka usuwa produkt w panelu BL niezależnie. Tu czyścimy tylko
// kopię w naszej bazie.
export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id produktu" };

  const supabase = await createAdminClient();

  // 1. Pobierz dane produktu (images + variants) zanim usuniemy
  const { data: product, error: fetchErr } = await supabase
    .from("products")
    .select("name, images, variants")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!product) return { ok: false, error: "Produkt nie istnieje" };

  // 2. Sprawdź czy istnieją order_items wskazujące na ten produkt.
  // FK jest RESTRICT, więc delete tak czy tak by się wywalił — ale lepiej
  // dać jasny komunikat zamiast wpadać na error 23503 z Postgresa.
  const { count: orderCount, error: orderErr } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if (orderErr) return { ok: false, error: orderErr.message };
  if ((orderCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Nie można usunąć — produkt jest w ${orderCount} zamówieni${
        orderCount === 1 ? "u" : "ach"
      }. Historia zamówień musi zostać. Możesz tylko ustawić stock=0, żeby ukryć produkt ze sklepu.`,
    };
  }

  // 3. Usuń wiersz — reviews/wishlists/featured CASCADE'ują, inquiries
  // SET NULL'ują automatycznie (zob. supabase/migrations).
  const productRow = product as {
    name: string;
    images: string[] | null;
    variants: { combinations: { images?: string[] | null }[] } | null;
  };

  const { error: deleteErr } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (deleteErr) return { ok: false, error: deleteErr.message };

  // 4. Posprzątaj storage — best effort, nie blokujemy sukcesu jeśli się
  // nie uda (zdjęcie sierota w bucket'cie to mniejszy problem niż wisząca
  // operacja). Zbieramy URL-e z globalnej galerii + każdej kombinacji.
  const allImageUrls: string[] = [];
  if (Array.isArray(productRow.images)) {
    allImageUrls.push(...productRow.images.filter((u): u is string => typeof u === "string"));
  }
  if (productRow.variants?.combinations) {
    for (const c of productRow.variants.combinations) {
      if (Array.isArray(c.images)) {
        allImageUrls.push(...c.images.filter((u): u is string => typeof u === "string"));
      }
    }
  }
  await Promise.all(allImageUrls.map((url) => deleteStorageImage(url)));

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  revalidatePath(`/produkt/${id}`);

  return { ok: true, message: `Produkt "${productRow.name}" usunięty` };
}

// ============================================================
// setProductActive — ręczne ukrycie/przywrócenie produktu
// ============================================================
// Ukrycie → is_active=false, deactivation_source='manual'
// (sync BaseLinker NIE reaktywuje produktów ukrytych ręcznie).
// Przywrócenie → is_active=true, deactivation_source=null.
export async function setProductActive(
  productId: string,
  active: boolean
): Promise<ActionResult> {
  await requireAdmin();
  if (!productId) return { ok: false, error: "Brak id produktu" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({
      is_active: active,
      deactivation_source: active ? null : "manual",
    } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  revalidatePath("/");
  return { ok: true, message: active ? "Produkt przywrócony" : "Produkt ukryty" };
}

// ============================================================
// updateProductDescriptionSections — zapisuje sekcje opisu
// ============================================================
// Admin może dodawać/usuwać/przesuwać image sekcje między text sekcjami
// (które przychodzą z BL i są read-only z poziomu sklepu).
// Walidacja: każda sekcja musi mieć poprawne pola dla swojego kind.
export async function updateProductDescriptionSections(
  productId: string,
  sections: ProductDescriptionSection[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!productId) return { ok: false, error: "Brak id produktu" };
  if (!Array.isArray(sections)) {
    return { ok: false, error: "Sekcje muszą być tablicą" };
  }

  // Walidacja każdej sekcji
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s || typeof s !== "object") {
      return { ok: false, error: `Sekcja ${i + 1}: nieprawidłowy obiekt` };
    }
    if (s.kind === "text") {
      if (typeof s.title !== "string" || s.title.trim().length === 0) {
        return { ok: false, error: `Sekcja ${i + 1}: brak tytułu text sekcji` };
      }
      if (typeof s.body !== "string") {
        return { ok: false, error: `Sekcja ${i + 1}: body text sekcji musi być stringiem` };
      }
      // Admin overrides — opcjonalne, ale jeśli są, muszą być stringami / boolem
      if (
        s.admin_title !== undefined &&
        s.admin_title !== null &&
        typeof s.admin_title !== "string"
      ) {
        return {
          ok: false,
          error: `Sekcja ${i + 1}: admin_title musi być stringiem`,
        };
      }
      if (
        s.admin_body !== undefined &&
        s.admin_body !== null &&
        typeof s.admin_body !== "string"
      ) {
        return {
          ok: false,
          error: `Sekcja ${i + 1}: admin_body musi być stringiem`,
        };
      }
      if (s.hidden !== undefined && typeof s.hidden !== "boolean") {
        return {
          ok: false,
          error: `Sekcja ${i + 1}: hidden musi być true/false`,
        };
      }
      if (
        s.admin_custom !== undefined &&
        typeof s.admin_custom !== "boolean"
      ) {
        return {
          ok: false,
          error: `Sekcja ${i + 1}: admin_custom musi być true/false`,
        };
      }
    } else if (s.kind === "image") {
      if (typeof s.image_url !== "string" || s.image_url.trim().length === 0) {
        return { ok: false, error: `Sekcja ${i + 1}: brak URL obrazu` };
      }
      if (typeof s.image_alt !== "string") {
        return { ok: false, error: `Sekcja ${i + 1}: alt obrazu musi być stringiem` };
      }
    } else {
      return { ok: false, error: `Sekcja ${i + 1}: nieznany kind` };
    }
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ description_sections: sections } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  return { ok: true, message: "Zapisano sekcje opisu" };
}
