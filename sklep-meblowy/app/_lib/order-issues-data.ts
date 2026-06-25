// Server-owa warstwa danych order_issues (panel admina). Czyste helpery w order-issues.ts.
import { createAdminClient } from "./supabase/server";
import type { OrderIssue } from "./order-issues";

export type AdminOrderIssue = OrderIssue & {
  order_number: number | null;
  order_status: string | null;
  item_name: string | null;
};

type Row = OrderIssue & {
  order: { order_number: number | null; status: string | null } | null;
  item: { product: { name: string } | null } | null;
};

// Lista wszystkich zgłoszeń, najnowsze pierwsze, z kontekstem zamówienia + nazwą pozycji.
export async function getAllOrderIssues(): Promise<AdminOrderIssue[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("order_issues")
    .select(
      `*, order:orders(order_number, status), item:order_items(product:products(name))`
    )
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    order_id: r.order_id,
    order_item_id: r.order_item_id,
    category: r.category,
    message: r.message,
    photos: r.photos ?? [],
    status: r.status,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    created_at: r.created_at,
    updated_at: r.updated_at,
    order_number: r.order?.order_number ?? null,
    order_status: r.order?.status ?? null,
    item_name: r.item?.product?.name ?? null,
  }));
}

// Liczba nowych zgłoszeń (badge w nawigacji admina).
export async function getNewOrderIssuesCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count } = await supabase
    .from("order_issues")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return count ?? 0;
}
