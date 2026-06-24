// Server-side: po każdym zapisie ceny dopisuje zmianę ceny efektywnej do
// price_history i denormalizuje wyliczone omnibus_price na produkt/kombinację.
// Czysta logika (computePriceUpdates) jest w pricing.ts; tu tylko IO.
import { createAdminClient } from "./supabase/server";
import { variantKey } from "./variants";
import { computePriceUpdates, type PriceUnit } from "./pricing";
import type { Product, ProductVariants } from "./types";

export async function recordPriceHistory(productId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("id, price, sale_price, variants")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return;
  const product = data as Pick<Product, "id" | "price" | "sale_price" | "variants">;
  const variants = product.variants as ProductVariants | null;
  const basePrice = Number(product.price);

  const units: PriceUnit[] = [];
  if (!variants || variants.combinations.length === 0) {
    units.push({ variant_key: null, regular: basePrice, sale: product.sale_price });
  } else {
    for (const c of variants.combinations) {
      units.push({
        variant_key: variantKey(c.values),
        regular: basePrice + (c.price_modifier ?? 0),
        sale: c.sale_price ?? null,
      });
    }
  }

  const { data: histRows } = await supabase
    .from("price_history")
    .select("variant_key, effective_price, recorded_at")
    .eq("product_id", productId);
  const history = ((histRows ?? []) as {
    variant_key: string | null;
    effective_price: number | string;
    recorded_at: string;
  }[]).map((r) => ({
    variant_key: r.variant_key,
    effective_price: Number(r.effective_price),
    recorded_at: r.recorded_at,
  }));

  const now = new Date().toISOString();
  const plan = computePriceUpdates(units, history, now);
  if (plan.inserts.length === 0) return;

  // Denormalizacja omnibus na produkt/kombinacje.
  const omniByKey = new Map(plan.omnibus.map((o) => [o.variant_key, o.value]));
  const update: Record<string, unknown> = {};
  if (omniByKey.has(null)) update.omnibus_price = omniByKey.get(null);
  if (variants && variants.combinations.length > 0) {
    const nextCombos = variants.combinations.map((c) => {
      const k = variantKey(c.values);
      if (!omniByKey.has(k)) return c;
      const v = omniByKey.get(k);
      // number → ustaw; null → wyczyść (undefined znika przy serializacji JSON do kolumny).
      return v == null ? { ...c, omnibus_price: undefined } : { ...c, omnibus_price: v };
    });
    update.variants = { ...variants, combinations: nextCombos };
  }

  // Denormalizacja omnibus PRZED insertem historii — retry jest samonaprawialny
  // (insert-ok/update-fail przy odwrotnej kolejności zostawiałby omnibus trwale stary).
  if (Object.keys(update).length > 0) {
    const { error: updErr } = await supabase
      .from("products")
      .update(update as never)
      .eq("id", productId);
    if (updErr) throw new Error(`omnibus update failed: ${updErr.message}`);
  }

  const { error: insErr } = await supabase.from("price_history").insert(
    plan.inserts.map((i) => ({
      product_id: productId,
      variant_key: i.variant_key,
      effective_price: i.effective_price,
      recorded_at: now,
    })) as never
  );
  if (insErr) throw new Error(`price_history insert failed: ${insErr.message}`);
}
