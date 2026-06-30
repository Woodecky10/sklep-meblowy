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
  const setOmnibus = omniByKey.has(null); // poziom produktu (brak wariantów)
  const omnibusValue = setOmnibus ? (omniByKey.get(null) ?? null) : null;

  let variantsPayload: ProductVariants | null = null;
  if (variants && variants.combinations.length > 0) {
    const nextCombos = variants.combinations.map((c) => {
      const k = variantKey(c.values);
      if (!omniByKey.has(k)) return c;
      const v = omniByKey.get(k);
      // number → ustaw; null → wyczyść (undefined znika przy serializacji JSON do kolumny).
      return v == null ? { ...c, omnibus_price: undefined } : { ...c, omnibus_price: v };
    });
    variantsPayload = { ...variants, combinations: nextCombos };
  }

  // Denormalizacja omnibus + insert historii w JEDNEJ transakcji (RPC, migr. 39).
  // Wcześniej były to 2 osobne zapisy — pad między nimi zostawiał omnibus
  // wskazujący na cenę bez wiersza w historii (ryzyko integralności Omnibus).
  const { error } = await supabase.rpc("apply_price_changes", {
    p_product_id: productId,
    p_set_omnibus: setOmnibus,
    p_omnibus_price: omnibusValue,
    p_variants: variantsPayload,
    p_rows: plan.inserts.map((i) => ({
      variant_key: i.variant_key,
      effective_price: i.effective_price,
      recorded_at: now,
    })),
  });
  if (error) throw new Error(`apply_price_changes failed: ${error.message}`);
}
