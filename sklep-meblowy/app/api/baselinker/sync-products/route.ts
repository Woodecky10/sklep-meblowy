import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/app/_lib/supabase/server";
import {
  BaseLinkerError,
  getInventories,
  getInventoryProductsList,
  getInventoryProductsData,
  type BLInventoryProduct,
} from "@/app/_lib/baselinker";
import { getCategoryByBaselinkerId } from "@/app/_lib/categories";
import type { Product, ProductDimensions } from "@/app/_lib/types";

// ============================================================
// POST /api/baselinker/sync-products
// ============================================================
// Sync produktów BaseLinker → Supabase. Ten endpoint:
// - jest zabezpieczony sekretem (?key=ENV.BASELINKER_SYNC_SECRET)
// - pobiera wszystkie produkty z każdego inventory w BL
// - upsertuje je w tabeli products (klucz: baselinker_id)
// - pomija produkty bez kategorii lub bez ceny (loguje warning)
// - NIE usuwa istniejących produktów (bezpieczne dla danych Supabase)

type SyncResult = {
  inventory_id: number;
  inventory_name: string;
  total_in_bl: number;
  inserted: number;
  updated: number;
  skipped: { id: string; name: string; reason: string }[];
};

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

function buildDimensions(
  bl: BLInventoryProduct
): ProductDimensions | null {
  const w = Number(bl.width ?? 0);
  const h = Number(bl.height ?? 0);
  // BL używa `length` jako głębokość mebla — nasz schema ma `depth`
  const d = Number(bl.length ?? 0);
  if (!w && !h && !d) return null;
  return { width: w, depth: d, height: h };
}

function defaultPrice(
  bl: BLInventoryProduct,
  defaultPriceGroup: number
): number {
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

function mapBlToProduct(
  blId: string,
  bl: BLInventoryProduct,
  defaultPriceGroup: number
):
  | { ok: true; product: ProductInsert }
  | { ok: false; reason: string } {
  const name = bl.text_fields?.name ?? "";
  if (!name.trim()) return { ok: false, reason: "brak nazwy" };

  const blCategoryId = Number(bl.category_id ?? 0);
  if (!blCategoryId) return { ok: false, reason: "brak kategorii w BL" };

  const cat = getCategoryByBaselinkerId(blCategoryId);
  if (!cat) {
    return {
      ok: false,
      reason: `kategoria BL ${blCategoryId} nie zmapowana w categories.ts`,
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
    variants: null,
    baselinker_id: blId,
  };

  return { ok: true, product };
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const expected = process.env.BASELINKER_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "BASELINKER_SYNC_SECRET nie jest ustawiony w env" },
      { status: 500 }
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Nieprawidłowy klucz" }, { status: 401 });
  }

  try {
    const supabase = await createAdminClient();
    const inventories = await getInventories();
    if (inventories.length === 0) {
      return NextResponse.json({
        ok: true,
        warning: "Brak magazynów (Inventory) w BaseLinker",
        results: [],
      });
    }

    const results: SyncResult[] = [];

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

      // Default price group (jeśli typ to ma pole price_groups, ale fallback do 0)
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

      const result: SyncResult = {
        inventory_id: inv.inventory_id,
        inventory_name: inv.name,
        total_in_bl: allIds.length,
        inserted: 0,
        updated: 0,
        skipped: [],
      };

      // Mapowanie + upsert per produkt
      for (const [blId, bl] of Object.entries(products)) {
        const mapped = mapBlToProduct(blId, bl, defaultPriceGroup);
        if (!mapped.ok) {
          result.skipped.push({
            id: blId,
            name: bl.text_fields?.name ?? "(brak nazwy)",
            reason: mapped.reason,
          });
          continue;
        }

        // Upsert po baselinker_id (kolumna ma UNIQUE z migracji 07)
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

        // Czy to insert czy update? Jeśli created_at jest "świeży" (< 5s)
        // to insert. Heurystyka — alternatywnie można zapytać przed upsertem.
        const isNew =
          data &&
          new Date(data.created_at).getTime() > Date.now() - 5000;
        if (isNew) result.inserted += 1;
        else result.updated += 1;
      }

      results.push(result);
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    if (err instanceof BaseLinkerError) {
      return NextResponse.json(
        {
          ok: false,
          where: "BaseLinker API",
          method: err.method,
          code: err.errorCode,
          message: err.message,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Nieznany błąd" },
      { status: 500 }
    );
  }
}
