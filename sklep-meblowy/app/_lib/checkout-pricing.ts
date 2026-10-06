// Autorytatywna cena sztuki w /api/checkout (spec 2026-10-06). Czysta — bez
// Supabase, żeby dało się ją przetestować bez składania zamówień w żywej bazie.
// Z klienta bierzemy tylko WYBÓR (variantValues); ceny wyłącznie z danych
// produktu i ze stałej CARRY_IN_PRICE.
import type { Product } from "./types";
import { hasVariants, isVariantSelectionComplete, sumValueSurcharges } from "./variants";
import { effectivePrice } from "./pricing";
import { CARRY_IN_KEY, carryInSurcharge, hasCarryIn } from "./carry-in";

export type CheckoutItemPrice =
  | { ok: true; unitPrice: number; variantValues: Record<string, string> | null }
  | { ok: false; reason: "variant_incomplete" };

export function priceCheckoutItem(
  product: Product,
  rawValues: Record<string, string> | null | undefined
): CheckoutItemPrice {
  const raw = rawValues ?? {};
  // Meble robione na zamówienie — walidujemy tylko kompletność wyboru
  // wariantu (nie stany magazynowe).
  if (hasVariants(product) && !isVariantSelectionComplete(product, raw)) {
    return { ok: false, reason: "variant_incomplete" };
  }

  // Do zamówienia trafiają tylko znane klucze: opcje produktu + wniesienie
  // (wyłącznie z wartością "Tak"). Wcześniej przy produkcie z wariantami szło
  // wszystko, co przysłała przeglądarka.
  const options = product.variants?.options ?? [];
  const values: Record<string, string> = {};
  for (const opt of options) {
    const v = raw[opt.name];
    if (typeof v === "string" && v) values[opt.name] = v;
  }
  if (hasCarryIn(raw)) values[CARRY_IN_KEY] = raw[CARRY_IN_KEY];

  // Dopłaty wariantu wchodzą do ceny regularnej i promocyjnej (jak dotąd);
  // wniesienie dochodzi PO effectivePrice, więc promocja go nie obniża.
  const surcharge = sumValueSurcharges(options, values);
  const regular = Number(product.price) + surcharge;
  const sale = product.sale_price != null ? Number(product.sale_price) + surcharge : null;
  const unitPrice = effectivePrice(regular, sale) + carryInSurcharge(values);

  return {
    ok: true,
    unitPrice,
    variantValues: Object.keys(values).length > 0 ? values : null,
  };
}
