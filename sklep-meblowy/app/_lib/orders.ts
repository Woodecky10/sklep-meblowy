import { createClient } from "./supabase/server";
import type { Address, Order, OrderItem } from "./types";

export async function createOrder(
  userId: string,
  items: { product_id: string; quantity: number; price: number }[],
  total: number,
  shippingAddress: Address
) {
  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({ user_id: userId, total, shipping_address: shippingAddress })
    .select()
    .single();

  if (orderErr || !order) throw orderErr ?? new Error("Failed to create order");

  const { error: itemsErr } = await supabase.from("order_items").insert(
    items.map((item) => ({ ...item, order_id: order.id }))
  );

  if (itemsErr) throw itemsErr;

  return order as Order;
}

export async function getUserOrders(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*))`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as (Order & { items: OrderItem[] })[];
}

export async function updateOrderPayment(
  orderId: string,
  paymentIntentId: string
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ stripe_payment_intent: paymentIntentId, status: "paid" })
    .eq("id", orderId);

  if (error) throw error;
}
