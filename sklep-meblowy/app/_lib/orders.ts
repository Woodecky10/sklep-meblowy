import { createAdminClient, createClient } from "./supabase/server";
import type { Address, Order, OrderItem } from "./types";

type CreateOrderInput = {
  userId: string | null;
  guestEmail: string | null;
  items: { product_id: string; quantity: number; price: number }[];
  total: number;
  shippingAddress: Address;
};

export async function createOrder({
  userId,
  guestEmail,
  items,
  total,
  shippingAddress,
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

export async function getUserOrders(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*))`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as (Order & { items: OrderItem[] })[];
}

export async function markOrderPaid(
  orderId: string,
  paymentIntentId: string
) {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ stripe_payment_intent: paymentIntentId, status: "paid" } as never)
    .eq("id", orderId);

  if (error) throw error;
}

export async function getOrderById(orderId: string) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*))`)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data as unknown as Order & { items: OrderItem[] };
}
