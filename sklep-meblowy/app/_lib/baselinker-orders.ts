import { createAdminClient } from "./supabase/server";
import {
  addOrder,
  type BLAddOrderInput,
  type BLOrderProduct,
} from "./baselinker";
import { formatVariantLabel } from "./variants";
import type { Order, OrderItem, Product } from "./types";

// ============================================================
// Push zamówienia z Mollien → BaseLinker
// ============================================================
// Wywoływane z webhooka Stripe po markOrderPaid. Mapuje nasze order_items
// + product (z baselinker_id) na format BL addOrder. Zapisuje BL order_id
// w orders.baselinker_order_id, żebyśmy mogli synchronizować statusy.
//
// Wymaga zmiennej środowiskowej BASELINKER_DEFAULT_STATUS_ID — id statusu
// BL na który mają trafiać nowe zamówienia (np. „Nowe – opłacone").
// Listę statusów uzyskujesz z GET /api/baselinker/test → order_statuses[].

const DEFAULT_TAX_RATE = 23;
const ORDER_SOURCE_NAME = "Mollien (sklep mollien.pl)";

type OrderWithItems = Order & {
  items: (OrderItem & { product?: Product | null })[];
  // Pola z DB, nie eksportowane explicite w Order — dodajemy tutaj.
  baselinker_order_id?: string | null;
};

// Czyść tylko to, co czyta mapowanie — pozwala testować bez pełnego Product/OrderItem.
export type BlOrderSourceItem = {
  product?: { name?: string | null; baselinker_id?: string | null; weight?: number | null } | null;
  variant_values?: Record<string, string> | null;
  notes?: string | null;
  price: number;
  quantity: number;
};

// Pozycje zamówienia → format BL. Klient mógł dopisać uwagi (item.notes) —
// dołączamy do `attributes` obok wariantu. Gdy był rabat (promo_discount > 0),
// doklejamy ujemną pozycję „Rabat", żeby suma zamówienia w BL = kwota faktycznie
// zapłacona przez klienta (rabat stosowany na poziomie zamówienia, nie per-pozycja).
// Bez tego BL pokazywał pełną cenę → błędne faktury/zwroty (K1).
export function buildBlOrderProducts(
  items: BlOrderSourceItem[],
  promoDiscount: number
): BLOrderProduct[] {
  const products: BLOrderProduct[] = items.map((item) => {
    const p = item.product;
    const baseName = p?.name ?? "Produkt";
    const variantLabel = item.variant_values
      ? formatVariantLabel(item.variant_values)
      : "";
    const itemNotes = item.notes?.trim() ?? "";
    const variantSuffix = variantLabel ? ` — ${variantLabel}` : "";
    const attributes = [variantLabel, itemNotes ? `Uwagi: ${itemNotes}` : ""]
      .filter(Boolean)
      .join(" | ");
    return {
      product_id: p?.baselinker_id ?? undefined,
      name: baseName + variantSuffix,
      attributes: attributes || undefined,
      price_brutto: Number(item.price),
      tax_rate: DEFAULT_TAX_RATE,
      quantity: item.quantity,
      weight: p?.weight ?? undefined,
    };
  });

  if (promoDiscount > 0) {
    products.push({
      name: "Rabat",
      price_brutto: -promoDiscount,
      tax_rate: DEFAULT_TAX_RATE,
      quantity: 1,
    });
  }

  return products;
}

export async function pushOrderToBaseLinker(orderId: string): Promise<{
  baselinker_order_id: number | null;
  reason?: string;
}> {
  const statusIdRaw = process.env.BASELINKER_DEFAULT_STATUS_ID;
  if (!statusIdRaw) {
    return {
      baselinker_order_id: null,
      reason: "BASELINKER_DEFAULT_STATUS_ID nie ustawiony",
    };
  }
  const statusId = Number(statusIdRaw);
  if (!Number.isFinite(statusId) || statusId <= 0) {
    return {
      baselinker_order_id: null,
      reason: "BASELINKER_DEFAULT_STATUS_ID jest nieprawidłowy",
    };
  }

  const supabase = await createAdminClient();

  // Pobierz pełne zamówienie z items i produktami
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*, items:order_items(*, product:products(*))")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return {
      baselinker_order_id: null,
      reason: `nie znaleziono zamówienia ${orderId}`,
    };
  }

  const o = order as unknown as OrderWithItems;

  // Idempotencja — jeśli już push'owaliśmy, nie rób tego ponownie
  if (o.baselinker_order_id) {
    return {
      baselinker_order_id: Number(o.baselinker_order_id),
      reason: "już wcześniej zsynchronizowane",
    };
  }

  // Email klienta — guest_email albo z auth.users dla zalogowanego
  let email = o.guest_email ?? "";
  if (!email && o.user_id) {
    const { data: userData } = await supabase.auth.admin.getUserById(o.user_id);
    email = userData?.user?.email ?? "";
  }
  if (!email) {
    return {
      baselinker_order_id: null,
      reason: "brak emaila klienta — nie mogę utworzyć zamówienia w BL",
    };
  }

  const address = o.shipping_address ?? {};
  const fullname =
    (address.fullname ?? "").trim() ||
    "Klient (dane do uzupełnienia)";

  // Pozycje + ujemna linia „Rabat" gdy był promo_discount (K1).
  const products = buildBlOrderProducts(o.items, Number(o.promo_discount ?? 0));

  const input: BLAddOrderInput = {
    order_status_id: statusId,
    date_add: Math.floor(new Date(o.created_at).getTime() / 1000),
    currency: "PLN",
    payment_method: "Stripe",
    payment_method_cod: 0,
    paid: 1,
    email,
    phone: address.phone,
    delivery_method: "Kurier",
    // Dostawa NIE jest wliczana do `total` (checkout: koszt mebli ustala admin
    // po zamówieniu i dolicza w BL osobno) → tu zawsze 0.
    delivery_price: 0,
    delivery_fullname: fullname,
    delivery_address: address.street,
    delivery_postcode: address.postal_code,
    delivery_city: address.city,
    delivery_country_code: address.country === "Polska" ? "PL" : address.country,
    extra_field_1: ORDER_SOURCE_NAME,
    extra_field_2: o.stripe_payment_intent ?? undefined,
    products,
  };

  const result = await addOrder(input);

  // Zapisz BL order_id w naszym zamówieniu
  await supabase
    .from("orders")
    .update({ baselinker_order_id: String(result.order_id) } as never)
    .eq("id", orderId);

  return { baselinker_order_id: result.order_id };
}
