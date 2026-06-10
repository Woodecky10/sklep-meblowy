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
};

export async function createOrder({
  userId,
  guestEmail,
  items,
  total,
  shippingAddress,
  promoCodeId,
  promoDiscount,
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
