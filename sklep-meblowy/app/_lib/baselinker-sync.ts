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
  type BLVariant,
} from "./baselinker";
import { getCategoryByBaselinkerId } from "./categories";
import type {
  Product,
  ProductDimensions,
  ProductVariants,
  ProductVariant,
} from "./types";

export type SyncSkippedProduct = {
  id: string;
  name: string;
  reason: string;
};

export type SyncInventoryResult = {
  inventory_id: number;
  inventory_name: string;
  total_in_bl: number;
  inserted: number;
  updated: number;
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

function pickFirstImage(images: BLInventoryProduct["images"]): string[] {
  if (!images) return [];
  const values = Object.values(images).filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  return values;
}

function getFeature(
  features: BLInventoryProduct["features"],
  name: string
): string | null {
  if (!features) return null;
  const f = features.find(
    (x) => x.name?.toLowerCase().trim() === name.toLowerCase().trim()
  );
  return f?.value ?? null;
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

// Longest common prefix (case-sensitive) — pomocnicze do parsera wariantów.
function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let p = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(p)) {
      p = p.slice(0, -1);
      if (!p) return "";
    }
  }
  return p;
}

// Najmniejszy próg długości prefixu żeby uznać że "warto stripować".
// Krótsze prefixy → fallback: pełne nazwy jako wartości.
const PREFIX_THRESHOLD = 5;

// Mapper: BL variants (Record<string, BLVariant>) → ProductVariants (nasz format).
// Zwraca null gdy BL nie ma wariantów albo dane są niepoprawne.
//
// BL daje płaską listę wariantów po nazwach (bez strukturalnych atrybutów),
// więc generujemy zawsze JEDNĄ opcję (domyślnie "Wariant"). Wartości to
// fragment nazwy który się różni między wariantami.
function parseVariantsFromBl(
  blVariants: Record<string, BLVariant> | undefined,
  defaultPriceGroup: number,
  mainPrice: number
): ProductVariants | null {
  if (!blVariants) return null;
  const entries = Object.entries(blVariants);
  if (entries.length === 0) return null;

  const names = entries.map(([, v]) => (v.name ?? "").trim());
  if (names.some((n) => !n)) return null; // bezpieczny fallback

  // Znajdź wspólny prefix i strip-uj go z nazw, jeśli dostatecznie długi.
  const prefix = commonPrefix(names);
  const useStripped = prefix.length >= PREFIX_THRESHOLD;
  const rawValues = useStripped
    ? names.map((n) => n.slice(prefix.length).trim())
    : names.map((n) => n.trim());

  // Dedup wartości — czasem BL ma duplikaty
  const seen = new Set<string>();
  const valuesUnique: string[] = [];
  for (const v of rawValues) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    valuesUnique.push(v);
  }
  if (valuesUnique.length === 0) return null;

  const optionName = "Wariant";

  const combinations: ProductVariant[] = entries.map(([, v], idx) => {
    const variantPrice =
      v.prices?.[String(defaultPriceGroup)] ??
      Object.values(v.prices ?? {}).find((p) => typeof p === "number" && p > 0) ??
      mainPrice;
    const stock = Object.values(v.stock ?? {}).reduce(
      (s, q) => s + (typeof q === "number" ? q : 0),
      0
    );
    const value = rawValues[idx];
    return {
      values: { [optionName]: value },
      stock,
      price_modifier: variantPrice - mainPrice,
    };
  });

  return {
    options: [{ name: optionName, values: valuesUnique }],
    combinations,
  };
}

async function mapBlToProduct(
  blId: string,
  bl: BLInventoryProduct,
  defaultPriceGroup: number
): Promise<
  | { ok: true; product: ProductInsert }
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

  const description = bl.text_fields?.description ?? "";

  const product: ProductInsert = {
    name: name.trim(),
    description: description.trim(),
    price,
    category: cat.slug,
    images: pickFirstImage(bl.images),
    stock: 0, // meble na zamówienie — nieużywane
    color: getFeature(bl.features, "Kolor"),
    material: getFeature(bl.features, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(bl.features, "Konstrukcja"),
    delivery_time: getFeature(bl.features, "Czas realizacji"),
    warranty: getFeature(bl.features, "Gwarancja"),
    variants: parseVariantsFromBl(bl.variants, defaultPriceGroup, price),
    baselinker_id: blId,
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
        skipped: [],
      };

      for (const [blId, bl] of Object.entries(products)) {
        // DEBUG — info o wariantach z BL i o tym co parser zwrócił.
        // Do usunięcia gdy potwierdzimy że sync wariantów działa.
        const blVariantsInfo = bl.variants
          ? `${Object.keys(bl.variants).length} BL variants`
          : "no variants";
        const mapped = await mapBlToProduct(blId, bl, defaultPriceGroup);
        if (mapped.ok) {
          const parsedInfo = mapped.product.variants
            ? `parsed ${mapped.product.variants.combinations.length} variants`
            : "parsed null";
          console.log(
            `[BL sync] ${blId} "${bl.text_fields?.name ?? "?"}" — ${blVariantsInfo} — ${parsedInfo}`
          );
        }

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
          .select("id, created_at, variants")
          .single();

        // DEBUG — co Supabase rzeczywiście zapisał w kolumnie variants
        if (!error && data) {
          const dbVariants = (data as { variants: unknown }).variants;
          console.log(
            `[BL sync upsert] ${blId} db_variants=${JSON.stringify(dbVariants)?.slice(0, 200)}`
          );
        }

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
        if (isNew) result.inserted += 1;
        else result.updated += 1;
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
