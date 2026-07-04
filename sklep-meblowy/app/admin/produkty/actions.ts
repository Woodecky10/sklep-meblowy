"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { buildNewProductPayload } from "@/app/_lib/new-product";
import { recordPriceHistory } from "@/app/_lib/price-history";
import { findInvalidVariantSale } from "@/app/_lib/pricing";
import { formatVariantLabel, applyValuePricing } from "@/app/_lib/variants";
import { sanitizeSectionsHtml, sanitizeProductHtml } from "@/app/_lib/product-html";
import { buildGroupKey, pickGroupKey } from "@/app/_lib/size-groups";
import {
  applyCornerSideSelection,
  hasCornerSideOption,
  CORNER_SIDE_DEFAULT_CATEGORY,
} from "@/app/_lib/corner-side";
import type {
  ActionResult,
  ProductDescriptionSection,
  ProductDimensions,
  ProductVariants,
} from "@/app/_lib/types";

// Uwaga: NIE re-eksportujemy tu ActionResult. To plik "use server" — pod
// Turbopackiem `export type { X }` bywa kompilowany do runtime'owego
// `export { X }` bez bindingu → "ReferenceError: ActionResult is not defined"
// przy ewaluacji modułu akcji. Konsumenci importują typ z @/app/_lib/types.

const STORAGE_BUCKET = "products";

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

  // Allowlist formatów (raster) — SVG/inne odrzucone (stored XSS). Rozszerzenie
  // i contentType z walidatora (z mime, nie z nazwy pliku).
  const valid = validateImageUpload(formData.get("image"));
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
// URL-e zewnętrzne (Unsplash, z importu) ignorujemy (no-op).
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

  // Cena promocyjna (Omnibus). Puste = brak. Jeśli ustawiona, musi być < cena regularna.
  const salePriceRaw = parseNumber(formData.get("sale_price"));
  if (salePriceRaw !== null) {
    if (salePriceRaw < 0) return { ok: false, error: "Cena promocyjna nie może być ujemna" };
    if (salePriceRaw >= price)
      return { ok: false, error: "Cena promocyjna musi być niższa od ceny regularnej" };
  }

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

  // UWAGA: pole `description` celowo pomijane w updates — opis nie jest
  // synchronizowany z importem (mapBlToProduct go nie ustawia). Opis edytuje się
  // przez sekcje w DescriptionSectionsEditor, nie przez to pole.
  const supabase = await createAdminClient();

  // Defense-in-depth: ignoruj product-level sale_price gdy produkt ma warianty.
  // UI wyłącza to pole dla produktów z wariantami, ale crafted POST mógłby go ustawić
  // → karta by reklamowała obniżkę, której checkout nie honoruje (variant promo ≠
  // product-level promo). Dla variant-produktów bezwarunkowo null.
  const { data: existing } = await supabase
    .from("products")
    .select("variants")
    .eq("id", id)
    .maybeSingle();
  const productHasVariants =
    !!(existing as { variants?: { combinations?: unknown[] } } | null)
      ?.variants?.combinations?.length;
  const salePriceToSave = productHasVariants ? null : salePriceRaw;

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
    sale_price: salePriceToSave,
  };

  const { error } = await supabase
    .from("products")
    .update(updates as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await recordPriceHistory(id);
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

  const supabase = await createAdminClient();

  // Wariant faktycznie zapisywany (z serwerowo przeliczonymi modyfikatorami).
  let variantsToSave: ProductVariants | null = variants;

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
      if (opt.value_prices !== undefined) {
        if (typeof opt.value_prices !== "object" || opt.value_prices === null) {
          return { ok: false, error: "Nieprawidłowa struktura dopłat wartości" };
        }
        for (const p of Object.values(opt.value_prices)) {
          if (typeof p !== "number" || !Number.isFinite(p)) {
            return { ok: false, error: "Dopłata wartości musi być liczbą" };
          }
        }
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
      if (c.sale_price !== undefined && c.sale_price !== null) {
        if (typeof c.sale_price !== "number" || c.sale_price < 0) {
          return { ok: false, error: "Cena promocyjna kombinacji musi być liczbą ≥ 0" };
        }
      }
    }

    // Cena promocyjna kombinacji musi być < jej ceny regularnej (base + modyfikator).
    // Cena bazowa nie jest w payloadzie wariantów (zapisywana osobno przez
    // updateProductBasics) — pobieramy zapisaną wartość z DB (autorytet).
    const { data: baseRow } = await supabase
      .from("products")
      .select("price")
      .eq("id", productId)
      .maybeSingle();
    if (!baseRow) return { ok: false, error: "Produkt nie istnieje" };
    const basePrice = Number((baseRow as { price: number | string }).price);

    // Serwerowo przelicz price_modifier z dopłat per wartość (nie ufamy
    // klientowi). Gdy produkt nie używa dopłat — kombinacje bez zmian.
    const combinations = applyValuePricing(variants.options, variants.combinations);
    variantsToSave = { ...variants, combinations };

    // Cena regularna kombinacji nie może zejść < 0 (ujemne dopłaty).
    const negative = combinations.find((c) => basePrice + (c.price_modifier ?? 0) < 0);
    if (negative) {
      return {
        ok: false,
        error: `Cena kombinacji „${formatVariantLabel(
          negative.values
        )}" wychodzi poniżej zera — popraw dopłaty.`,
      };
    }

    const invalid = findInvalidVariantSale(combinations, basePrice);
    if (invalid) {
      return {
        ok: false,
        error: `Cena promocyjna kombinacji „${formatVariantLabel(
          invalid.values
        )}" (${invalid.sale} zł) musi być niższa od jej ceny regularnej (${invalid.regular} zł).`,
      };
    }
  }

  const { error } = await supabase
    .from("products")
    .update({ variants: variantsToSave } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  await recordPriceHistory(productId);
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
// fizycznie. URL-e zewnętrzne (Unsplash itp.) zostają w sieci
// — nie nasze, nie nasz problem. Czyścimy też zdjęcia variantów.
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
// (które przychodzą z importu i są read-only z poziomu sklepu).
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

  const clean = sanitizeSectionsHtml(sections);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ description_sections: clean } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  return { ok: true, message: "Zapisano sekcje opisu" };
}

// ============================================================
// updateProductDescription — pojedynczy opis produktu (PL)
// ============================================================
// Opis renderuje sie na karcie jako fallback TYLKO gdy produkt nie ma sekcji.
// Ma wlasny zapis (jak zdjecia/sekcje/warianty); updateProductBasics go pomija.
export async function updateProductDescription(
  productId: string,
  html: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!productId) return { ok: false, error: "Brak id produktu" };
  if (typeof html !== "string") return { ok: false, error: "Opis musi być tekstem" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ description: sanitizeProductHtml(html) } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano opis produktu" };
}

// ============================================================
// saveProductDe — ręczny zapis tłumaczenia DE produktu
// ============================================================
// Admin wpisuje ręcznie pola _de (nazwa/opis/kolor/materiał/sekcje).
// Zapis czyści needs_translation (admin ma kontrolę) i stempluje translated_at.
// Sekcje opisu DE (description_sections_de) zapisywane tylko gdy przekazane.
export async function saveProductDe(
  id: string,
  fields: {
    name_de: string;
    description_de: string;
    color_de: string | null;
    material_de: string | null;
    description_sections_de?: unknown;
  }
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Brak id produktu" };

  const updates: Record<string, unknown> = {
    name_de: sanitize(fields.name_de, 300),
    description_de: sanitizeProductHtml(fields.description_de ?? ""),
    color_de: emptyToNull(sanitize(fields.color_de ?? "", 100)),
    material_de: emptyToNull(sanitize(fields.material_de ?? "", 100)),
    needs_translation: false,
    translated_at: new Date().toISOString(),
  };
  // Sekcje DE — zapisujemy tylko gdy explicit przekazane (inaczej nie ruszamy).
  if (fields.description_sections_de !== undefined) {
    updates.description_sections_de = Array.isArray(fields.description_sections_de)
      ? sanitizeSectionsHtml(
          fields.description_sections_de as ProductDescriptionSection[]
        )
      : fields.description_sections_de;
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update(updates as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${id}`);
  revalidatePath(`/produkt/${id}`);
  return { ok: true, message: "Zapisano tłumaczenie DE" };
}

// ============================================================
// Tworzenie nowego produktu (natywne)
// ============================================================
// Minimalny szkic (nazwa/cena/kategoria). Resztę admin uzupełnia w edytorze
// /admin/produkty/[id]. Zwraca productId do redirectu po stronie klienta.
export async function createProduct(
  formData: FormData
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const built = buildNewProductPayload({
    name: formData.get("name"),
    price: formData.get("price"),
    category: formData.get("category"),
  });
  if (!built.ok) return { ok: false, error: built.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .insert(built.payload as never)
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Nie udało się utworzyć produktu",
    };
  }

  await recordPriceHistory((data as { id: string }).id);
  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  return { ok: true, productId: (data as { id: string }).id };
}

// ============================================================
// Grupy rozmiarów — łączenie osobnych produktów tego samego mebla
// ============================================================

// Rewaliduje strony wszystkich podanych produktów + listing sklepu.
function revalidateProducts(ids: string[]): void {
  for (const id of ids) {
    revalidatePath(`/admin/produkty/${id}`);
    revalidatePath(`/produkt/${id}`);
  }
  revalidatePath("/sklep");
}

// id-ki wszystkich produktów w danej grupie (admin client — także nieaktywne).
async function sizeGroupMemberIds(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  key: string
): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("size_group", key);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// Wyszukiwarka produktów do dołączenia (po nazwie). Wyklucza bieżący produkt.
// Zwraca size_group/size_label, by UI wiedziało o ew. scaleniu grup.
export async function searchProductsForSizeGroup(
  currentId: string,
  query: string
): Promise<ActionResult> {
  await requireAdmin();
  const q = sanitize(query, 100);
  if (q.length < 2) return { ok: true, data: { results: [] } };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, size_group, size_label")
    .ilike("name", `%${q}%`)
    .neq("id", sanitize(currentId))
    .limit(10);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { results: data ?? [] } };
}

// Łączy target z grupą bieżącego produktu (pełne scalenie obu grup).
export async function linkSizeSibling(
  currentId: string,
  targetId: string
): Promise<ActionResult> {
  await requireAdmin();
  const cid = sanitize(currentId);
  const tid = sanitize(targetId);
  if (!cid || !tid) return { ok: false, error: "Brak id produktu" };
  if (cid === tid) return { ok: false, error: "Nie można połączyć produktu ze sobą" };

  const supabase = await createAdminClient();
  const { data: rows, error: readErr } = await supabase
    .from("products")
    .select("id, name, size_group")
    .in("id", [cid, tid]);
  if (readErr) return { ok: false, error: readErr.message };
  type Row = { id: string; name: string; size_group: string | null };
  const current = ((rows ?? []) as Row[]).find((r) => r.id === cid);
  const target = ((rows ?? []) as Row[]).find((r) => r.id === tid);
  if (!current || !target) return { ok: false, error: "Produkt nie istnieje" };

  // Wspólny klucz. Nowy generujemy TYLKO gdy OBIE grupy są puste — inaczej
  // pickGroupKey i tak wybierze istniejący, a zapytanie o kolizję byłoby
  // zmarnowane. Nowy klucz: slug z nazwy + krótki sufiks, z regeneracją przy
  // mało prawdopodobnej kolizji.
  let key: string;
  if (current.size_group || target.size_group) {
    key = pickGroupKey(current.size_group, target.size_group, "");
  } else {
    let newKey = buildGroupKey(current.name, randomUUID().slice(0, 4));
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from("products")
        .select("id")
        .eq("size_group", newKey)
        .limit(1);
      if (!clash?.length) break;
      newKey = buildGroupKey(current.name, randomUUID().slice(0, 4));
    }
    key = newKey;
  }

  // Do rewalidacji i przepisania: bieżący, target + wszyscy członkowie OBU grup.
  // Zbieramy członków obu grup bezwarunkowo (także grupy wygrywającej klucz) —
  // ich lista rodzeństwa się zmienia, więc ich strony muszą być rewalidowane.
  // Zapis klucza na członkach, którzy już go mają, to nieszkodliwy no-op.
  const affected = new Set<string>([cid, tid]);
  for (const gk of [current.size_group, target.size_group]) {
    if (gk) {
      for (const id of await sizeGroupMemberIds(supabase, gk)) affected.add(id);
    }
  }

  const ids = Array.from(affected);
  const { error: updErr } = await supabase
    .from("products")
    .update({ size_group: key } as never)
    .in("id", ids);
  if (updErr) return { ok: false, error: updErr.message };

  revalidateProducts(ids);
  return { ok: true, message: "Połączono rozmiary" };
}

// Odłącza produkt od grupy; jeśli zostaje 1 członek — czyści też jego klucz.
export async function unlinkSizeSibling(productId: string): Promise<ActionResult> {
  await requireAdmin();
  const pid = sanitize(productId);
  if (!pid) return { ok: false, error: "Brak id produktu" };

  const supabase = await createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("products")
    .select("size_group")
    .eq("id", pid)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const key = (row as { size_group: string | null } | null)?.size_group ?? null;

  // Produkt nie był w żadnej grupie — nic do odłączenia (bez zbędnego UPDATE).
  if (!key) return { ok: true, message: "Odłączono rozmiar" };

  const affected = new Set<string>([pid]);
  const { error: clearErr } = await supabase
    .from("products")
    .update({ size_group: null } as never)
    .eq("id", pid);
  if (clearErr) return { ok: false, error: clearErr.message };

  const remaining = await sizeGroupMemberIds(supabase, key);
  if (remaining.length === 1) {
    // Grupa jednoelementowa nie ma sensu — czyścimy ostatniego członka.
    const { error: cleanupErr } = await supabase
      .from("products")
      .update({ size_group: null } as never)
      .eq("id", remaining[0]);
    if (cleanupErr) return { ok: false, error: cleanupErr.message };
  }
  for (const id of remaining) affected.add(id);

  revalidateProducts(Array.from(affected));
  return { ok: true, message: "Odłączono rozmiar" };
}

// Zapis etykiety rozmiaru pojedynczego produktu.
export async function updateSizeLabel(
  productId: string,
  label: string
): Promise<ActionResult> {
  await requireAdmin();
  const pid = sanitize(productId);
  if (!pid) return { ok: false, error: "Brak id produktu" };
  const value = emptyToNull(sanitize(label, 100));
  const supabase = await createAdminClient();
  // Etykieta produktu jest renderowana w selektorze rozmiaru na stronie KAŻDEGO
  // rodzeństwa (buildSizeOptions), nie tylko edytowanego produktu — więc
  // rewalidujemy całą grupę, spójnie z link/unlinkSizeSibling.
  const { data: row, error: readErr } = await supabase
    .from("products")
    .select("size_group")
    .eq("id", pid)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const { error } = await supabase
    .from("products")
    .update({ size_label: value } as never)
    .eq("id", pid);
  if (error) return { ok: false, error: error.message };
  const key = (row as { size_group: string | null } | null)?.size_group ?? null;
  const ids = key ? await sizeGroupMemberIds(supabase, key) : [pid];
  revalidateProducts(ids.length ? ids : [pid]);
  return { ok: true, message: "Zapisano etykietę" };
}

// ============================================================
// enableCornerSideForCategory — JEDNORAZOWY backfill wyboru strony
// ============================================================
// Włącza opcję "Strona" (Lewostronny/Prawostronny) wszystkim produktom
// kategorii naroznik-l (decyzja: cała kategoria ON, opt-out per produkt).
// Idempotentna: produkty z JAKĄKOLWIEK opcją side-like (także ręczną
// "STRONA"/"STRONA MEBLA") są pomijane — ręczne warianty nietknięte.
// Po potwierdzonym wykonaniu na produkcji usunąć przycisk
// EnableCornerSideButton (ponowne kliknięcie nadpisałoby opt-outy).
export async function enableCornerSideForCategory(): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, variants")
    .eq("category", CORNER_SIDE_DEFAULT_CATEGORY);

  if (error) return { ok: false, error: error.message };

  type Row = { id: string; variants: ProductVariants | null };
  const rows = (data ?? []) as Row[];

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (hasCornerSideOption(row.variants)) {
      skipped++;
      continue;
    }
    const next = applyCornerSideSelection(row.variants, true);
    const { error: upErr } = await supabase
      .from("products")
      .update({ variants: next } as never)
      .eq("id", row.id);
    if (upErr) {
      return {
        ok: false,
        error: `Błąd przy produkcie ${row.id} (zaktualizowano wcześniej: ${updated}): ${upErr.message}`,
      };
    }
    updated++;
    revalidatePath(`/admin/produkty/${row.id}`);
    revalidatePath(`/produkt/${row.id}`);
    // recordPriceHistory może rzucić (RPC) — degradujemy do czytelnego błędu
    // z licznikiem częściowego postępu zamiast crasha error-boundary.
    // Warianty tego produktu są już zapisane; ponowne uruchomienie pominie go
    // (idempotencja), a historia cen dopisze się przy kolejnym zapisie cen.
    try {
      await recordPriceHistory(row.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: `Zapisano warianty (zaktualizowano: ${updated}, pominięto: ${skipped}), ale historia cen produktu ${row.id} nie zapisała się: ${message}`,
      };
    }
  }

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  return {
    ok: true,
    message: `Włączono wybór strony: ${updated}, pominięto (już mają): ${skipped}, razem: ${rows.length}`,
  };
}
