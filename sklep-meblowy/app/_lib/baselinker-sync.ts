// Reużywalna logika sync produktów BaseLinker → Supabase.
// Wywoływana z:
//  - /api/baselinker/sync-products (cron / external trigger po sekrecie)
//  - server action `syncProductsAction` w admin panelu (po requireAdmin)

import { createAdminClient } from "./supabase/server";
import {
  BaseLinkerError,
  getInventories,
  getInventoryProductsList,
  getInventoryProductsData,
  type BLInventoryProduct,
} from "./baselinker";
import { getCategoryByBaselinkerId } from "./categories";
import type { Product, ProductDimensions } from "./types";

export type SyncSkippedProduct = {
  id: string;
  name: string;
  reason: string;
};

// Pojedynczy produkt który został dodany/zaktualizowany — id z BL + nazwa
// (dla podglądu w admin panelu).
export type SyncedProduct = {
  id: string;
  name: string;
};


export type SyncInventoryResult = {
  inventory_id: number;
  inventory_name: string;
  total_in_bl: number;
  inserted: number;
  updated: number;
  // Listy nazw dodanych i zaktualizowanych produktów (do podglądu w panelu).
  // Stare logi z DB nie miały tych pól — UI musi traktować undefined jak [].
  inserted_products?: SyncedProduct[];
  updated_products?: SyncedProduct[];
  skipped: SyncSkippedProduct[];
};

export type SyncTotals = {
  total_in_bl: number;
  inserted: number;
  updated: number;
  skipped_count: number;
};

export type SyncOutcome =
  | { ok: true; results: SyncInventoryResult[]; totals: SyncTotals; warning?: string }
  | { ok: false; error: string; where?: "BaseLinker API" | "internal"; code?: string };

// ============================================================
// Mappery: BL inventory product → schema products (Supabase)
// ============================================================

export function pickFirstImage(images: BLInventoryProduct["images"]): string[] {
  if (!images) return [];
  // Obiekt {1,2,3} → sortuj klucze numerycznie (stabilna kolejność galerii
  // między syncami). Tablica → bez zmian.
  const ordered = Array.isArray(images)
    ? images
    : Object.keys(images)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (images as Record<string, string>)[k]);
  return ordered.filter((v): v is string => typeof v === "string" && v.length > 0);
}

// Tolerancja źródła cech: audyt pokazał, że cechy realnie siedzą pod
// text_fields.features (a kod czytał top-level bl.features). Chroni Kolor/
// Materiał/Konstrukcję/Specyfikację przed cichym wyzerowaniem.
export function resolveBlFeatures(bl: BLInventoryProduct): BLInventoryProduct["features"] {
  return (bl.text_fields?.features as BLInventoryProduct["features"]) ?? bl.features;
}

function getFeature(
  features: BLInventoryProduct["features"],
  name: string
): string | null {
  if (!features) return null;
  const target = name.toLowerCase().trim();

  // Format 1 (aktualny BL): Record<string, string> — {"Kolor": "Brązowy"}
  if (!Array.isArray(features)) {
    for (const [k, v] of Object.entries(features)) {
      if (typeof v === "string" && k.toLowerCase().trim() === target) {
        return v;
      }
    }
    return null;
  }

  // Format 2 (legacy): array {name, value}[]
  const f = features.find(
    (x) => x.name?.toLowerCase().trim() === target
  );
  return f?.value ?? null;
}

// Blacklist cech specyficznych dla Allegro (które admin musi wypełnić w BL
// dla aukcji ale nie mają sensu w sklepie). Filtrowane case-insensitive.
// Powód: koleżanka prowadzi sprzedaż na Allegro przez BL, więc te cechy
// regularnie pojawiają się w BL features i bez filtra leciałyby na Mollien.pl.
const ALLEGRO_JUNK_KEYS = new Set(
  [
    "stan",
    "faktura",
    "faktura vat",
    "numer aukcji",
    "numer oferty",
    "czas wysyłki",
    "czas wysylki",
    "forma płatności",
    "forma platnosci",
    "sprzedawca",
    "kraj pochodzenia produktu",
    "gwarancja sprzedawcy",
  ].map((s) => s.toLowerCase())
);

function isAllegroJunkKey(key: string): boolean {
  return ALLEGRO_JUNK_KEYS.has(key.toLowerCase().trim());
}

// Zbiera WSZYSTKIE cechy z BL jako array {key, value} — zachowuje kolejność
// którą admin ustawił w BL. Filtruje puste wartości + allegro-junk (Stan,
// Faktura VAT, Numer aukcji, etc. — te które koleżanka wypełnia dla
// publikacji na Allegro a nie mają sensu w sklepie).
function extractAllFeatures(
  features: BLInventoryProduct["features"]
): { key: string; value: string }[] {
  if (!features) return [];

  // Format 1 (aktualny BL): Record<string, string>
  if (!Array.isArray(features)) {
    const out: { key: string; value: string }[] = [];
    for (const [k, v] of Object.entries(features)) {
      if (
        typeof k === "string" &&
        k.trim().length > 0 &&
        typeof v === "string" &&
        v.trim().length > 0 &&
        !isAllegroJunkKey(k)
      ) {
        out.push({ key: k.trim(), value: v.trim() });
      }
    }
    return out;
  }

  // Format 2 (legacy): array {name, value}[]
  return features
    .filter(
      (f) =>
        typeof f.name === "string" &&
        f.name.trim().length > 0 &&
        typeof f.value === "string" &&
        f.value.trim().length > 0 &&
        !isAllegroJunkKey(f.name)
    )
    .map((f) => ({ key: f.name.trim(), value: f.value.trim() }));
}

function buildDimensions(bl: BLInventoryProduct): ProductDimensions | null {
  const w = Number(bl.width ?? 0);
  const h = Number(bl.height ?? 0);
  // BL używa `length` jako głębokość mebla — nasz schema ma `depth`
  const d = Number(bl.length ?? 0);
  if (!w && !h && !d) return null;
  return { width: w, depth: d, height: h };
}

function defaultPrice(bl: BLInventoryProduct, defaultPriceGroup: number): number {
  if (!bl.prices) return 0;
  const direct = bl.prices[String(defaultPriceGroup)];
  if (typeof direct === "number" && direct > 0) return direct;
  // fallback: pierwsza dodatnia cena z dowolnej grupy
  const any = Object.values(bl.prices).find(
    (v) => typeof v === "number" && v > 0
  );
  return typeof any === "number" ? any : 0;
}

type ProductInsert = Omit<Product, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

// Sync ustawia tylko te pola. variants/description_sections/description są
// zarządzane ręcznie w panelu (DescriptionSectionsEditor/VariantsEditor) —
// pominięcie ich w upsert: UPDATE nie nadpisuje (preserve), INSERT → default DB.
type SyncProductFields = Omit<
  ProductInsert,
  "variants" | "description_sections" | "description"
>;

async function mapBlToProduct(
  blId: string,
  bl: BLInventoryProduct,
  defaultPriceGroup: number
): Promise<
  | { ok: true; product: SyncProductFields }
  | { ok: false; reason: string }
> {
  const name = bl.text_fields?.name ?? "";
  if (!name.trim()) return { ok: false, reason: "brak nazwy" };

  const blCategoryId = Number(bl.category_id ?? 0);
  if (!blCategoryId) return { ok: false, reason: "brak kategorii w BL" };

  const cat = await getCategoryByBaselinkerId(blCategoryId);
  if (!cat) {
    return {
      ok: false,
      reason: `kategoria BL ${blCategoryId} nie zmapowana — dodaj mapowanie w admin panelu /admin/kategorie`,
    };
  }

  const price = defaultPrice(bl, defaultPriceGroup);
  if (!price) return { ok: false, reason: "brak ceny lub cena = 0" };

  const blFeatures = resolveBlFeatures(bl);

  // Sync ustawia tylko pola „twarde" z BL (nazwa, cena, kategoria, zdjęcia,
  // cechy). description/description_sections/variants są pominięte celowo —
  // zarządza nimi admin ręcznie w panelu. Pominięcie ich w upsert sprawia, że
  // UPDATE nie nadpisuje istniejących wartości (preserve), a INSERT dostaje
  // default DB (description '', description_sections '[]', variants null).
  const product: SyncProductFields = {
    name: name.trim(),
    price,
    category: cat.slug,
    images: pickFirstImage(bl.images),
    stock: 0, // meble na zamówienie — nieużywane
    color: getFeature(blFeatures, "Kolor"),
    material: getFeature(blFeatures, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(blFeatures, "Konstrukcja"),
    delivery_time: getFeature(blFeatures, "Czas realizacji"),
    warranty: getFeature(blFeatures, "Gwarancja"),
    // WSZYSTKIE cechy z BL — Allegro template parametry w pełnym zestawie.
    // Wyświetlane na karcie produktu w "Szczegóły produktu" z deduplikacją
    // względem dedykowanych kolumn (Kolor/Materiał/itd. już mają swoje miejsca).
    features: extractAllFeatures(blFeatures),
    // Nowy/wrócony produkt domyślnie widoczny. Warunkowe utrzymanie ręcznego
    // ukrycia (deactivation_source='manual') ustawiane w pętli sync (późniejszy task).
    is_active: true,
    deactivation_source: null,
    baselinker_id: blId,
    // Kolekcję przypisuje admin ręcznie w /admin/kolekcje — sync nie ustawia.
    collection_id: null,
  };

  return { ok: true, product };
}

// ============================================================
// Główna funkcja sync — pull z BL → upsert do Supabase
// ============================================================

export async function syncProductsFromBaseLinker(): Promise<SyncOutcome> {
  try {
    const supabase = await createAdminClient();
    const inventories = await getInventories();

    if (inventories.length === 0) {
      return {
        ok: true,
        results: [],
        totals: { total_in_bl: 0, inserted: 0, updated: 0, skipped_count: 0 },
        warning: "Brak magazynów (Inventory) w BaseLinker",
      };
    }

    const results: SyncInventoryResult[] = [];

    for (const inv of inventories) {
      // BL paginuje listę produktów po 1000 — pobierajmy wszystkie strony
      const allIds: string[] = [];
      let page = 1;
      while (true) {
        const list = await getInventoryProductsList(inv.inventory_id, page);
        const ids = Object.keys(list.products ?? {});
        if (ids.length === 0) break;
        allIds.push(...ids);
        if (ids.length < 1000) break;
        page += 1;
      }

      const defaultPriceGroup =
        (inv as unknown as { default_price_group?: number; price_group_id?: number })
          .default_price_group ??
        (inv as unknown as { price_group_id?: number }).price_group_id ??
        0;

      // Pełne dane (chunkowane po 1000)
      const products: Record<string, BLInventoryProduct> = {};
      for (let i = 0; i < allIds.length; i += 1000) {
        const chunk = allIds.slice(i, i + 1000);
        const data = await getInventoryProductsData(inv.inventory_id, chunk);
        Object.assign(products, data.products ?? {});
      }

      const result: SyncInventoryResult = {
        inventory_id: inv.inventory_id,
        inventory_name: inv.name,
        total_in_bl: allIds.length,
        inserted: 0,
        updated: 0,
        inserted_products: [],
        updated_products: [],
        skipped: [],
      };

      for (const [blId, bl] of Object.entries(products)) {
        const mapped = await mapBlToProduct(blId, bl, defaultPriceGroup);

        if (!mapped.ok) {
          result.skipped.push({
            id: blId,
            name: bl.text_fields?.name ?? "(brak nazwy)",
            reason: mapped.reason,
          });
          continue;
        }

        const { data, error } = await supabase
          .from("products")
          .upsert(mapped.product as never, { onConflict: "baselinker_id" })
          .select("id, created_at")
          .single();

        if (error) {
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason: `błąd zapisu: ${error.message}`,
          });
          continue;
        }

        // Heurystyka insert vs update — created_at "świeże" (< 5s) = insert
        const isNew =
          data && new Date(data.created_at).getTime() > Date.now() - 5000;
        const synced: SyncedProduct = { id: blId, name: mapped.product.name };
        if (isNew) {
          result.inserted += 1;
          result.inserted_products!.push(synced);
        } else {
          result.updated += 1;
          result.updated_products!.push(synced);
        }
      }

      results.push(result);
    }

    const totals: SyncTotals = results.reduce(
      (acc, r) => ({
        total_in_bl: acc.total_in_bl + r.total_in_bl,
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
        skipped_count: acc.skipped_count + r.skipped.length,
      }),
      { total_in_bl: 0, inserted: 0, updated: 0, skipped_count: 0 }
    );

    return { ok: true, results, totals };
  } catch (err) {
    if (err instanceof BaseLinkerError) {
      return {
        ok: false,
        error: err.message,
        where: "BaseLinker API",
        code: err.errorCode,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nieznany błąd",
      where: "internal",
    };
  }
}

// ============================================================
// Pomocnicze: zapis logu do tabeli baselinker_sync_log
// ============================================================

export async function logSyncOutcome(
  outcome: SyncOutcome,
  durationMs: number,
  triggeredBy: string | null
): Promise<void> {
  const supabase = await createAdminClient();

  if (outcome.ok) {
    const status: "success" | "partial" =
      outcome.totals.skipped_count > 0 ? "partial" : "success";

    await supabase.from("baselinker_sync_log").insert({
      triggered_by: triggeredBy,
      duration_ms: durationMs,
      status,
      total_in_bl: outcome.totals.total_in_bl,
      inserted: outcome.totals.inserted,
      updated: outcome.totals.updated,
      skipped_count: outcome.totals.skipped_count,
      results: outcome.results as unknown as Record<string, unknown>,
      error_message: null,
    } as never);
  } else {
    await supabase.from("baselinker_sync_log").insert({
      triggered_by: triggeredBy,
      duration_ms: durationMs,
      status: "error",
      total_in_bl: 0,
      inserted: 0,
      updated: 0,
      skipped_count: 0,
      results: null,
      error_message: outcome.error,
    } as never);
  }
}
