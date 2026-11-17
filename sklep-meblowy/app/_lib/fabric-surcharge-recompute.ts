import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { invalidateFacetsCache } from "@/app/_lib/products";
import { rebuildFabricValuePrices, type FabricLite } from "@/app/_lib/variants";
import {
  effectiveGroupSurcharges,
  parseSurchargeByCode,
  resolveFabricSizing,
  type FabricSize,
} from "@/app/_lib/fabric-sizes";
import type { ProductVariants } from "@/app/_lib/types";

// Ile zapisów produktów leci równolegle w jednej porcji. Zamienia setki
// sekwencyjnych round-tripów na kilka równoległych porcji, zdejmując ryzyko
// timeoutu funkcji serverless przy zmianie grupy dotykającej wielu produktów.
const PRODUCT_WRITE_CONCURRENCY = 20;

export type RecomputeProductRow = {
  id: string;
  variants: ProductVariants | null;
  category: string;
  fabric_size_id?: string | null;
  fabric_surcharges?: unknown;
};

// Czysta część (bez I/O): dla każdego produktu rozstrzyga źródło dopłat
// (własne → rozmiar produktu → rozmiar kategorii → globalne grup) i przelicza
// value_prices opcji „Tkanina". Zwraca tylko produkty faktycznie zmienione.
export function planFabricSurchargeUpdates(input: {
  products: RecomputeProductRow[];
  fabrics: FabricLite[];
  groups: { id: string; code: string; surcharge: number }[];
  categories: { slug: string; defaultFabricSizeId?: string | null }[];
  sizes: FabricSize[];
}): { id: string; variants: ProductVariants }[] {
  const changed: { id: string; variants: ProductVariants }[] = [];
  for (const p of input.products) {
    const sizing = resolveFabricSizing(p, input.categories, input.sizes);
    const surcharges = effectiveGroupSurcharges(input.groups, sizing.surcharges);
    const res = rebuildFabricValuePrices(p.variants, input.fabrics, surcharges);
    if (res && res.changed) changed.push({ id: p.id, variants: res.variants });
  }
  return changed;
}

// Propagacja dopłat: przelicza value_prices opcji „Tkanina" we WSZYSTKICH
// produktach (albo tylko w `productIds`) wg aktualnego katalogu, rozmiaru do
// dopłat produktu/kategorii i korekty. Zapisuje tylko faktycznie zmienione,
// w porcjach po PRODUCT_WRITE_CONCURRENCY równolegle. Wołane po każdej zmianie
// tkaniny/grupy/rozmiaru — bez diffowania co się zmieniło (tanio i zawsze
// poprawnie; skala sklepu: setki produktów). Czyta bazę wprost, nie przez
// cache — bywa wołana tuż po zapisie. Błąd któregokolwiek odczytu = brak zapisu.
export async function recomputeFabricSurcharges(
  opts?: { productIds?: string[] }
): Promise<{ updated: number }> {
  const supabase = await createAdminClient();

  let productsQuery = supabase
    .from("products")
    .select("id, variants, category, fabric_size_id, fabric_surcharges")
    .not("variants", "is", null);
  if (opts?.productIds) productsQuery = productsQuery.in("id", opts.productIds);

  const [fabricsRes, groupsRes, sizesRes, categoriesRes, productsRes] = await Promise.all([
    supabase.from("fabrics").select("name, colors, price, group_id"),
    supabase.from("fabric_groups").select("id, code, surcharge"),
    supabase.from("fabric_sizes").select("*"),
    supabase.from("categories").select("slug, default_fabric_size_id"),
    productsQuery,
  ]);
  const failed = [
    ["fabrics", fabricsRes.error],
    ["fabric_groups", groupsRes.error],
    ["fabric_sizes", sizesRes.error],
    ["categories", categoriesRes.error],
    ["products", productsRes.error],
  ].find(([, error]) => error);
  if (failed) {
    console.error(
      `[recomputeFabricSurcharges] odczyt ${failed[0]} nie powiódł się:`,
      (failed[1] as { message?: string }).message
    );
    return { updated: 0 };
  }

  const sizes = ((sizesRes.data ?? []) as FabricSize[]).map((s) => ({
    ...s,
    surcharges: parseSurchargeByCode(s.surcharges) ?? {},
  }));
  const categories = (
    (categoriesRes.data ?? []) as { slug: string; default_fabric_size_id: string | null }[]
  ).map((c) => ({ slug: c.slug, defaultFabricSizeId: c.default_fabric_size_id ?? null }));

  const changed = planFabricSurchargeUpdates({
    products: (productsRes.data ?? []) as RecomputeProductRow[],
    fabrics: (fabricsRes.data ?? []) as FabricLite[],
    groups: (groupsRes.data ?? []) as { id: string; code: string; surcharge: number }[],
    categories,
    sizes,
  });

  const updated = await writeProductVariants(changed, "recomputeFabricSurcharges");
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}

// Zapis wsadowy variants z ograniczoną współbieżnością. Błąd per produkt jest
// logowany i pomijany (licznik liczy tylko udane) — częściowy fail nie wywala
// całej akcji ani nie fałszuje liczby. Wspólne dla propagacji dopłat i dla
// usuwania tkaniny z produktów.
export async function writeProductVariants(
  changed: { id: string; variants: ProductVariants }[],
  logTag: string
): Promise<number> {
  const supabase = await createAdminClient();
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
            console.error(`[${logTag}] update ${c.id}:`, error.message);
            return false;
          }
          revalidatePath(`/produkt/${c.id}`);
          return true;
        } catch (e) {
          // Sieciowy/nieoczekiwany błąd pojedynczego zapisu nie może wywalić
          // całej porcji — logujemy i pomijamy (jak przy błędzie zapytania).
          console.error(`[${logTag}] update ${c.id} threw:`, e);
          return false;
        }
      })
    );
    updated += results.filter(Boolean).length;
  }
  return updated;
}
