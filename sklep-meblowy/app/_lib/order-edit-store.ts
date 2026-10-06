// Adapter Supabase dla applyOrderEdit (order-edit-apply.ts). Każda operacja
// na pozycjach filtruje też po order_id — id pozycji z innego zamówienia
// niczego nie zmieni, nawet gdyby przeszło walidację.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderEditStore } from "./order-edit-apply";

export function makeOrderEditStore(supabase: SupabaseClient, orderId: string): OrderEditStore {
  return {
    async insertItems(rows) {
      const { error } = await supabase.from("order_items").insert(rows as never[]);
      return error ? error.message : null;
    },
    async updateItem(id, patch) {
      const { error } = await supabase
        .from("order_items")
        .update(patch as never)
        .eq("id", id)
        .eq("order_id", orderId);
      return error ? error.message : null;
    },
    async deleteItems(ids) {
      const { error } = await supabase
        .from("order_items")
        .delete()
        .in("id", ids)
        .eq("order_id", orderId);
      return error ? error.message : null;
    },
    async readItems() {
      const { data, error } = await supabase
        .from("order_items")
        .select("price, quantity")
        .eq("order_id", orderId);
      if (error) return { error: error.message };
      return {
        items: ((data ?? []) as { price: number | string; quantity: number }[]).map((r) => ({
          price: Number(r.price),
          quantity: r.quantity,
        })),
      };
    },
    async updateOrder(patch) {
      const { error } = await supabase.from("orders").update(patch as never).eq("id", orderId);
      return error ? error.message : null;
    },
  };
}
