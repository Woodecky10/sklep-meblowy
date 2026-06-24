import { createAdminClient } from "./supabase/server";
import type { Address, Order, OrderItem, OrderStatus } from "./types";

type CreateOrderInput = {
  userId: string | null;
  guestEmail: string | null;
  items: {
    product_id: string;
    quantity: number;
    price: number;
    variant_values?: Record<string, string> | null;
    notes?: string | null;
  }[];
  total: number;
  shippingAddress: Address;
  promoCodeId?: string | null;
  promoDiscount?: number;
  currency: "pln" | "eur";
  fxRate: number | null;
};

export async function createOrder({
  userId,
  guestEmail,
  items,
  total,
  shippingAddress,
  promoCodeId,
  promoDiscount,
  currency,
  fxRate,
}: CreateOrderInput) {
  // Service role — pomijamy RLS, walidacja jest w API route (ceny, stock, auth)
  const supabase = await createAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      guest_email: guestEmail,
      total,
      shipping_address: shippingAddress as unknown as Record<string, unknown>,
      promo_code_id: promoCodeId ?? null,
      promo_discount: promoDiscount ?? 0,
      currency,
      fx_rate: fxRate,
    } as never)
    .select()
    .single();

  if (orderErr || !order) throw orderErr ?? new Error("Failed to create order");

  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(
      items.map((item) => ({ ...item, order_id: (order as unknown as Order).id })) as never[]
    );

  if (itemsErr) throw itemsErr;

  return order as unknown as Order;
}

// Admin client (service role) zamiast user-scoped: RLS na products
// (is_active=true) ukrywałby KUPIONE produkty, które admin/sync później
// ukrył (normalny flow dla mebli na zamówienie) — historia pokazywałaby
// "Produkt" bez nazwy/zdjęcia. promo_codes nie ma polityki odczytu dla
// klienta, więc embed kodu też wymagał service role. Ownership wymusza
// filtr .eq("user_id", userId) — userId pochodzi z sesji wołającego.
export async function getUserOrders(userId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*)), promo_code:promo_codes(code)`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as (Order & { items: OrderItem[] })[];
}

export async function markOrderPaid(
  orderId: string,
  paymentIntentId: string
): Promise<boolean> {
  const supabase = await createAdminClient();
  // CAS: aktualizuj TYLKO przy przejściu pending→paid. Zwraca true, jeśli TO
  // wywołanie faktycznie przestawiło status — czyli wygrało wyścig równoległych
  // duplikatów webhooka Stripe. Caller używa tego do JEDNOKROTNEGO incrementu
  // used_count (bez tego dwa duplikaty liczyłyby ten sam kod podwójnie).
  const { data, error } = await supabase
    .from("orders")
    .update({ stripe_payment_intent: paymentIntentId, status: "paid" } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getOrderById(orderId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*)), promo_code:promo_codes(code)`)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data as unknown as Order & { items: OrderItem[] };
}

// Przepnij status z BL (sync statusów). CAS na odczytanym statusie — nie
// nadpisujemy równoległej zmiany (np. webhook pending→paid). Zwraca true gdy
// faktycznie zmienił.
export async function applyBlStatus(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: toStatus } as never)
    .eq("id", orderId)
    .eq("status", fromStatus)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

const ADMIN_ORDERS_PAGE_SIZE = 30;

export type AdminOrderRow = Order & { items: { quantity: number }[] };

// Lista zamówień dla panelu admina — filtr statusu, szukajka (numer / e-mail
// gościa / nazwisko z adresu), paginacja po dacie malejąco. `items` to tylko
// ilości (do policzenia liczby pozycji) — szczegóły ładuje getOrderById.
export async function getAdminOrders({
  status,
  search,
  page = 1,
}: {
  status?: OrderStatus | "all";
  search?: string;
  page?: number;
}): Promise<{ orders: AdminOrderRow[]; total: number; pages: number; page: number }> {
  const supabase = await createAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const from = (safePage - 1) * ADMIN_ORDERS_PAGE_SIZE;
  const to = from + ADMIN_ORDERS_PAGE_SIZE - 1;

  let query = supabase
    .from("orders")
    .select("*, items:order_items(quantity)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const term = search?.trim();
  if (term) {
    const numeric = term.replace(/^#/, "");
    if (/^\d+$/.test(numeric)) {
      query = query.eq("order_number", Number(numeric));
    } else {
      // Usuwamy znaki łamiące składnię filtra `or` PostgREST.
      const esc = term.replace(/[%,()*]/g, " ").trim();
      query = query.or(
        `guest_email.ilike.%${esc}%,shipping_address->>fullname.ilike.%${esc}%`
      );
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const orders = (data ?? []) as unknown as AdminOrderRow[];
  const total = count ?? 0;
  return {
    orders,
    total,
    pages: Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE)),
    page: safePage,
  };
}

// Mapa profili (email + nazwisko) po id usera — do wyświetlenia klienta na liście.
export async function getProfilesByIds(
  ids: string[]
): Promise<Record<string, { email: string; full_name: string | null }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, { email: string; full_name: string | null }> = {};
  for (const p of (data ?? []) as { id: string; email: string; full_name: string | null }[]) {
    map[p.id] = { email: p.email, full_name: p.full_name };
  }
  return map;
}
