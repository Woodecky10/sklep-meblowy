// Zdarzenia e-commerce GA4 — budowanie ładunków. Moduł CZYSTY (bez server-only):
// importuje go komponent kliencki, strona serwerowa i test.
//
// Bliźniak app/_lib/meta-pixel.ts — te same momenty w lejku, inny format. Meta
// i GA4 celowo NIE dzielą jednego ładunku: różnią się nazwami pól (`contents`
// vs `items`, `id` vs `item_id`) i tym, co jest obowiązkowe. Wspólne jest to,
// co jest regułą SKLEPU, nie regułą dostawcy — patrz importy z order-events.ts.
//
// ⚠️ Nazwa produktu jest tu obowiązkowa, w przeciwieństwie do Meta. GA4 raportuje
// pozycje po `item_name` (raport „Wyświetlone produkty"); z samym `item_id`
// właścicielka zobaczy listę UUID-ów zamiast nazw mebli.
//
// ⚠️ Te zdarzenia wiszą na zgodzie ANALITYCZNEJ (bramka w ga-client.ts), a pixel
// Meta na MARKETINGOWEJ. To dwie różne grupy użytkowników, więc liczby w GA4
// i w Menedżerze reklam nie będą identyczne — i tak ma być.

import { roundMoney, toIsoCurrency, CATALOG_CURRENCY } from "@/app/_lib/order-events";

export type GaLineItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
};

export type GaItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
};

export type GaEventPayload = {
  currency: string;
  value: number;
  items: GaItem[];
};

export type GaPurchasePayload = GaEventPayload & { transaction_id: string };

export type GaLeadPayload = {
  currency: string;
  value: number;
};

/**
 * Pozycje w formacie `items` z GA4.
 *
 * Scalanie po identyfikatorze produktu jak w buildContents dla Meta: sofa
 * zamówiona w dwóch tkaninach to dwa wiersze order_items, ale JEDEN produkt
 * w katalogu. Bez scalania raport pokazuje dwie pozycje o tej samej nazwie.
 */
export function buildGaItems(items: GaLineItem[]): GaItem[] {
  const merged = new Map<string, { name: string; quantity: number; price: number }>();

  for (const item of items) {
    // product_id ma FK ON DELETE SET NULL: po skasowaniu produktu z katalogu
    // stara pozycja zostaje bez id (a join po nazwę zwraca null). Lepiej wysłać
    // zdarzenie bez tej pozycji niż z pustym item_id.
    if (!item.productId) continue;
    const current = merged.get(item.productId);
    if (current) current.quantity += item.quantity;
    else merged.set(item.productId, {
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    });
  }

  return [...merged.entries()].map(([id, { name, quantity, price }]) => ({
    item_id: id,
    item_name: name,
    price: roundMoney(price),
    quantity,
  }));
}

/**
 * Ładunek zdarzeń koszykowych (view_item, add_to_cart, begin_checkout).
 *
 * `value` można nadpisać — begin_checkout ma pokazywać kwotę PO rabacie, a nie
 * sumę cen katalogowych.
 */
export function buildGaCartPayload(items: GaLineItem[], value?: number): GaEventPayload {
  const gaItems = buildGaItems(items);
  // ⚠️ `value ?? suma`, NIE `value || suma`: koszyk w całości pokryty rabatem
  // ma wysłać 0, a nie po cichu pełną cenę katalogową.
  const resolved =
    value ?? gaItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return { currency: CATALOG_CURRENCY, value: roundMoney(resolved), items: gaItems };
}

/**
 * Ładunek zdarzenia `purchase`.
 *
 * ⚠️ `transaction_id` jest KLUCZOWY — to po nim GA4 deduplikuje sprzedaż. Bez
 * niego odświeżenie strony podziękowania (albo powrót na nią z linku w mailu)
 * liczy to samo zamówienie drugi raz i zawyża przychód.
 *
 * ⚠️ `value` to kwota zamówienia z bazy, NIE suma pozycji. Suma pozycji nie zna
 * rabatów ani dostawy.
 */
export function buildGaPurchasePayload(order: {
  orderId: string;
  total: number;
  currency: string;
  items: GaLineItem[];
}): GaPurchasePayload {
  return {
    transaction_id: order.orderId,
    currency: toIsoCurrency(order.currency),
    value: roundMoney(order.total),
    items: buildGaItems(order.items),
  };
}

/**
 * Ładunek zdarzenia `generate_lead` (zamówienie próbek).
 *
 * Bez `items` celowo — próbka nie jest sprzedażą mebla i nie ma trafiać do
 * raportów produktowych. Ta sama zasada co przy `Lead` w pixelu Meta.
 */
export function buildGaLeadPayload(value: number): GaLeadPayload {
  return { currency: CATALOG_CURRENCY, value: roundMoney(value) };
}
