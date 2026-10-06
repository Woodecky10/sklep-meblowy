// Wniesienie mebli (spec 2026-10-06, aktualizacja: raz na zamówienie).
// Czysta logika bez Reacta i Supabase — używa jej serwer (/api/checkout),
// koszyk (CartContext — migracja), checkout, „Zamów ponownie" i analityka.
//
// Wniesienie wybiera się w checkoucie i zapisuje jako pozycję zamówienia
// SPOZA KATALOGU (product_id = null, custom_name — mechanizm migracji 82),
// więc panel, maile i konto klienta pokazują je bez zmian.
export const CARRY_IN_PRICE = 250;

// Nazwa pozycji zamówienia — KLUCZ ZAPISU: po niej „Zamów ponownie"
// i analityka rozpoznają wiersz wniesienia. Nie zmieniać.
export const CARRY_IN_LINE_NAME = "Wniesienie mebli do 4. piętra";

// Klucz z wersji „za sztukę" (PR #185) — wyłącznie do migracji koszyków
// zapisanych w przeglądarkach (CartContext).
export const LEGACY_ITEM_CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";

export type CarryInOrderLine = {
  product_id: null;
  custom_name: string;
  quantity: 1;
  price: number;
  variant_values: null;
  notes: null;
};

export function carryInOrderLine(): CarryInOrderLine {
  return {
    product_id: null,
    custom_name: CARRY_IN_LINE_NAME,
    quantity: 1,
    price: CARRY_IN_PRICE,
    variant_values: null,
    notes: null,
  };
}

export function isCarryInLine(item: {
  product_id?: string | null;
  custom_name?: string | null;
}): boolean {
  return item.product_id == null && item.custom_name === CARRY_IN_LINE_NAME;
}

// Serwer (/api/checkout): dopisuje pozycję i kwotę TYLKO przy requested ===
// true — body to dowolny JSON z przeglądarki. Wołane PO rabatach, więc kod
// rabatowy i rabat zestawu nie obejmują wniesienia (decyzja właściciela).
export function applyCarryIn<T>(
  items: T[],
  totalAfterDiscounts: number,
  requested: unknown
): { items: (T | CarryInOrderLine)[]; total: number } {
  if (requested !== true) return { items, total: totalAfterDiscounts };
  return {
    items: [...items, carryInOrderLine()],
    total: totalAfterDiscounts + CARRY_IN_PRICE,
  };
}
