// Autorytatywna cena sztuki w /api/checkout (spec 2026-10-06). Czysta — bez
// Supabase, żeby dało się ją przetestować bez składania zamówień w żywej bazie.
// Z klienta bierzemy tylko WYBÓR (variantValues); ceny wyłącznie z danych
// produktu. Wniesienie liczy się raz na zamówienie w /api/checkout (applyCarryIn),
// nie tutaj.
import type { Product } from "./types";
import { hasVariants, isVariantSelectionComplete, sumValueSurcharges } from "./variants";
import { effectivePrice } from "./pricing";

export type CheckoutItemPrice =
  | { ok: true; unitPrice: number; variantValues: Record<string, string> | null }
  | { ok: false; reason: "variant_incomplete" };

export function priceCheckoutItem(
  product: Product,
  rawValues: Record<string, string> | null | undefined
): CheckoutItemPrice {
  const raw = rawValues ?? {};
  // Do zamówienia trafiają tylko znane klucze — opcje produktu. Wcześniej przy
  // produkcie z wariantami szło wszystko, co przysłała przeglądarka (m.in. klucz
  // wniesienia z wersji "za sztukę").
  const options = product.variants?.options ?? [];
  const values: Record<string, string> = {};
  for (const opt of options) {
    const v = raw[opt.name];
    if (typeof v === "string" && v) values[opt.name] = v;
  }
  // Meble robione na zamówienie — walidujemy tylko kompletność wyboru
  // wariantu (nie stany magazynowe). Sprawdzamy już PO przefiltrowaniu, żeby
  // wartość nie-tekstowa z przeglądarki nie zaliczała opcji.
  if (hasVariants(product) && !isVariantSelectionComplete(product, values)) {
    return { ok: false, reason: "variant_incomplete" };
  }

  // Dopłaty wariantu wchodzą do ceny regularnej i promocyjnej (jak dotąd).
  const surcharge = sumValueSurcharges(options, values);
  const regular = Number(product.price) + surcharge;
  const sale = product.sale_price != null ? Number(product.sale_price) + surcharge : null;
  const unitPrice = effectivePrice(regular, sale);

  return {
    ok: true,
    unitPrice,
    variantValues: Object.keys(values).length > 0 ? values : null,
  };
}
