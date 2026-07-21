"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateFabricsCache, invalidateFabricGroupsCache } from "@/app/_lib/fabrics";
import { invalidateFacetsCache } from "@/app/_lib/products";
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import { fabricSlug } from "@/app/_lib/fabric-slug";
import {
  buildGroupSurchargeMap,
  rebuildFabricValuePrices,
  type FabricLite,
} from "@/app/_lib/variants";
import type { ProductVariants } from "@/app/_lib/types";
import { parseProductionPhotos } from "@/app/_lib/fabric-production-photos";
import type { FabricProductionPhoto } from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseSort(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// Wiersze koloru z JSON (`[{code, image}]`) → uporządkowane kody + mapa zdjęć.
// Kody: trim, dedupe, zachowana kolejność. image tylko gdy to URL http(s).
function parseColorRows(input: unknown): {
  colors: string[];
  color_images: Record<string, string>;
} {
  const colors: string[] = [];
  const color_images: Record<string, string> = {};
  if (typeof input !== "string") return { colors, color_images };
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return { colors, color_images };
  }
  if (!Array.isArray(rows)) return { colors, color_images };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { code?: unknown; image?: unknown };
    const code = typeof rec.code === "string" ? rec.code.trim().slice(0, 60) : "";
    if (!code || seen.has(code)) continue;
    seen.add(code);
    colors.push(code);
    const image = typeof rec.image === "string" ? rec.image.trim() : "";
    if (/^https?:\/\//.test(image)) color_images[code] = image;
  }
  return { colors, color_images };
}

// Dopłata: pusta/NaN/ujemna → 0; inaczej liczba z 2 miejscami.
function parsePrice(input: unknown): number {
  if (typeof input !== "string" || input.trim() === "") return 0;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

// Opis z RichTextEditor: sanityzacja server-side; pusty → null.
function parseRichHtml(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = sanitizeRichHtml(input).trim();
  return clean === "" ? null : clean;
}

// Walidacja serwerowa product_id w zdjęciach z produkcji: jedno zapytanie
// in(); nieznane id → null (zdjęcie zostaje, link nie). Zwraca nową tablicę
// (bez mutacji wejścia); przy błędzie zapytania zwraca zdjęcia bez zmian, żeby
// przejściowy błąd DB nie wyzerował wszystkich istniejących linków.
async function validatePhotoProducts(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  photos: FabricProductionPhoto[]
): Promise<FabricProductionPhoto[]> {
  const ids = [...new Set(photos.map((p) => p.product_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return photos;
  const { data, error } = await supabase.from("products").select("id").in("id", ids);
  if (error) return photos;
  const known = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return photos.map((p) =>
    p.product_id && !known.has(p.product_id) ? { ...p, product_id: null } : p
  );
}

// Ile zapisów produktów leci równolegle w jednej porcji. Zamienia setki
// sekwencyjnych round-tripów na kilka równoległych porcji, zdejmując ryzyko
// timeoutu funkcji serverless przy zmianie grupy dotykającej wielu produktów.
const PRODUCT_WRITE_CONCURRENCY = 20;

// Propagacja dopłat: przelicza value_prices opcji „Tkanina" we WSZYSTKICH
// produktach wg aktualnego katalogu (grupa + korekta). Zapisuje tylko
// faktycznie zmienione, w porcjach po PRODUCT_WRITE_CONCURRENCY równolegle.
// Wołane po każdej zmianie tkaniny/grupy — bez diffowania co się zmieniło
// (tanio i zawsze poprawnie; skala sklepu: setki produktów).
async function recomputeFabricSurchargesOnProducts(): Promise<{ updated: number }> {
  const supabase = await createAdminClient();
  const [{ data: fabricRows }, { data: groupRows }, { data: productRows }] = await Promise.all([
    supabase.from("fabrics").select("name, colors, price, group_id"),
    supabase.from("fabric_groups").select("id, surcharge"),
    supabase.from("products").select("id, variants").not("variants", "is", null),
  ]);
  const fabrics = (fabricRows ?? []) as FabricLite[];
  const surcharges = buildGroupSurchargeMap(
    (groupRows ?? []) as { id: string; surcharge: number }[]
  );

  // Faza 1 (czysta, bez I/O): policz produkty, które faktycznie się zmieniają.
  const changed: { id: string; variants: ProductVariants }[] = [];
  for (const row of productRows ?? []) {
    const p = row as { id: string; variants: ProductVariants | null };
    const res = rebuildFabricValuePrices(p.variants, fabrics, surcharges);
    if (res && res.changed) changed.push({ id: p.id, variants: res.variants });
  }

  // Faza 2: zapis wsadowy z ograniczoną współbieżnością. Błąd per produkt jest
  // logowany i pomijany (licznik liczy tylko udane) — częściowy fail nie wywala
  // całej akcji ani nie fałszuje liczby.
  let updated = 0;
  for (let i = 0; i < changed.length; i += PRODUCT_WRITE_CONCURRENCY) {
    const batch = changed.slice(i, i + PRODUCT_WRITE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const { error } = await supabase
            .from("products")
            .update({ variants: c.variants } as never)
            .eq("id", c.id);
          if (error) {
            console.error(`[recomputeFabricSurcharges] update ${c.id}:`, error.message);
            return false;
          }
          revalidatePath(`/produkt/${c.id}`);
          return true;
        } catch (e) {
          // Sieciowy/nieoczekiwany błąd pojedynczego zapisu nie może wywalić
          // całej porcji — logujemy i pomijamy (jak przy błędzie zapytania).
          console.error(`[recomputeFabricSurcharges] update ${c.id} threw:`, e);
          return false;
        }
      })
    );
    updated += results.filter(Boolean).length;
  }
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}

export async function createFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));
  const groupId = sanitize(formData.get("group_id"));
  if (!groupId) return { ok: false, error: "Wybierz grupę cenową" };
  const description = parseRichHtml(formData.get("description"));
  const descriptionDe = parseRichHtml(formData.get("description_de"));
  const rawPhotos = parseProductionPhotos(formData.get("production_photos_json"));

  const supabase = await createAdminClient();
  const productionPhotos = await validatePhotoProducts(supabase, rawPhotos);
  const { data: slugRows } = await supabase.from("fabrics").select("slug");
  const taken = new Set(
    ((slugRows ?? []) as { slug: string | null }[]).map((r) => r.slug ?? "")
  );
  const slug = fabricSlug(name, taken);

  const { error, data } = await supabase
    .from("fabrics")
    .insert({
      name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category,
      group_id: groupId, slug, description, description_de: descriptionDe,
      production_photos: productionPhotos,
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: `Tkanina "${name}" dodana`, data };
}

export async function updateFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));
  const groupId = sanitize(formData.get("group_id"));
  if (!groupId) return { ok: false, error: "Wybierz grupę cenową" };
  const description = parseRichHtml(formData.get("description"));
  const descriptionDe = parseRichHtml(formData.get("description_de"));
  const rawPhotos = parseProductionPhotos(formData.get("production_photos_json"));

  const supabase = await createAdminClient();
  const productionPhotos = await validatePhotoProducts(supabase, rawPhotos);
  const { error } = await supabase
    .from("fabrics")
    .update({
      name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category,
      group_id: groupId, description, description_de: descriptionDe,
      production_photos: productionPhotos,
    } as never)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: "Tkanina zapisana" };
}

// Usunięcie z katalogu NIE rusza produktów, które już mają tę tkaninę w wariancie
// (wartość zostaje zapisana w products.variants). Znika tylko z listy do wyboru
// i z mapy DE (jej wartość zacznie renderować się jako PL).
export async function deleteFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("fabrics").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: "Tkanina usunięta" };
}

// Edycja grupy cenowej (nazwy + kwota). Kod (code) i liczba grup są stałe — v1
// bez dodawania/usuwania. Po zapisie przelicza dopłaty we wszystkich produktach.
export async function updateFabricGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id grupy" };
  const name = sanitize(formData.get("name"), 100);
  if (!name) return { ok: false, error: "Nazwa grupy jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de"), 100));
  const surcharge = parsePrice(formData.get("surcharge"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabric_groups")
    .update({ name, name_de: nameDe, surcharge } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { updated } = await recomputeFabricSurchargesOnProducts();
  invalidateFabricGroupsCache();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: `Grupa zapisana — przeliczono ${updated} produkt(ów)` };
}
