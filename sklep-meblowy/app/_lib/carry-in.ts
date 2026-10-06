// Wniesienie mebli (spec 2026-10-06) — usługa dokładana do KAŻDEGO produktu
// w kodzie, nie w danych. Czysta logika: używa jej klient (strona produktu,
// konfigurator zestawu, koszyk) i serwer (/api/checkout).
//
// Żyje w tym samym słowniku co wybrane wartości wariantu (variantValues), ale
// NIE jest opcją wariantu: product.variants się nie zmienia, a funkcje
// iterujące po opcjach produktu (isVariantSelectionComplete,
// sumValueSurcharges, VariantSelector) ten klucz ignorują. Dzięki temu
// koszyk, zapis zamówienia, panel i maile pokazują go bez zmian.
//
// ⚠️ CARRY_IN_KEY to KLUCZ ZAPISU (koszyki w localStorage, zamówienia), nie
// napis — zmiana tekstu odbierze wniesienie koszykom zapisanym wcześniej.
// Napis przy polu na stronie produktu jest w słownikach (product.carryInLabel).
export const CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";
export const CARRY_IN_VALUE = "Tak";
export const CARRY_IN_PRICE = 250;

export function hasCarryIn(values?: Record<string, string> | null): boolean {
  return values?.[CARRY_IN_KEY] === CARRY_IN_VALUE;
}

// Dopłata za sztukę: CARRY_IN_PRICE albo 0.
export function carryInSurcharge(values?: Record<string, string> | null): number {
  return hasCarryIn(values) ? CARRY_IN_PRICE : 0;
}

// Brak klucza = brak usługi — odznaczenie usuwa klucz, nigdy nie zapisuje "Nie"
// (inaczej ten sam mebel bez wniesienia miałby dwa różne klucze w koszyku).
export function setCarryIn(
  values: Record<string, string>,
  on: boolean
): Record<string, string> {
  const next = { ...values };
  if (on) next[CARRY_IN_KEY] = CARRY_IN_VALUE;
  else delete next[CARRY_IN_KEY];
  return next;
}

// Podstawa rabatów (zestaw, kod rabatowy, próg kodu): cena sztuki BEZ
// wniesienia × ilość. Wniesienie zawsze kosztuje pełne CARRY_IN_PRICE
// (decyzja właściciela 2026-10-06).
export function discountableSubtotal(
  unitPrice: number,
  quantity: number,
  values?: Record<string, string> | null
): number {
  return (unitPrice - carryInSurcharge(values)) * quantity;
}
