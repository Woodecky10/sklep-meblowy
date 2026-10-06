import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getOrderById, getProfilesByIds } from "@/app/_lib/orders";
import { orderEditFingerprint } from "@/app/_lib/order-edit";
import { orderItemDisplayName } from "@/app/_lib/order-items";
import type { EditorProduct, EditorRow } from "../../_components/OrderItemsEditor";
import EditOrderForm from "./EditOrderForm";
import type { Order, OrderItem } from "@/app/_lib/types";

export const metadata = { title: "Edytuj zamówienie" };

// Edycja zamówienia (spec 2026-10-06). Lista produktów jak w „Dodaj
// zamówienie" (aktywne, filtrowane w przeglądarce) + produkty z pozycji
// zamówienia, nawet nieaktywne — ich warianty są potrzebne w edytorze.
export default async function AdminEditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  let order: (Order & { items: OrderItem[] }) | null = null;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  const supabase = await createAdminClient();
  const { data: active, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, sale_price, images, variants")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (productsError) {
    console.error("[admin] lista produktów do edycji zamówienia nieudana:", productsError.message);
  }
  const products = new Map<string, EditorProduct>(
    ((active ?? []) as EditorProduct[]).map((p) => [p.id, p])
  );
  for (const it of order.items ?? []) {
    if (it.product && !products.has(it.product.id)) {
      const p = it.product;
      products.set(p.id, {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        sale_price: p.sale_price,
        images: p.images,
        variants: p.variants,
      });
    }
  }

  const accountEmail = order.user_id
    ? (await getProfilesByIds([order.user_id]))[order.user_id]?.email ?? null
    : null;

  const rows: EditorRow[] = (order.items ?? []).map((it, i) => ({
    key: i + 1,
    id: it.id,
    product_id: it.product_id,
    name: orderItemDisplayName(it, "Produkt"),
    price: String(Number(it.price)),
    quantity: String(it.quantity),
    notes: it.notes ?? "",
    variant_values: it.variant_values,
    bundle_label: it.bundle_label,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/admin/zamowienia/${order.id}`}
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Wróć do zamówienia
        </Link>
      </div>
      <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
        Edytuj zamówienie #{order.order_number}
      </h1>
      {productsError && (
        <p className="text-sm text-red-600" role="alert">
          Nie udało się pobrać listy produktów — odśwież stronę.
        </p>
      )}
      <EditOrderForm
        orderId={order.id}
        fingerprint={orderEditFingerprint(Number(order.total), order.items ?? [], order.status)}
        currency={order.currency}
        total={Number(order.total)}
        // Tylko zamówienia, które Przelewy24 faktycznie rozliczyły — zamówienie
        // z Allegro/OLX opłacone w źródle też ma payment_method "online".
        paidOnline={order.payment_provider === "p24" && order.status !== "pending"}
        // Zamówienie ze sklepu czekające na P24: webhook porównuje kwotę z sumą.
        pendingOnline={
          order.payment_method === "online" && !order.source && order.status === "pending"
        }
        guestEmail={order.user_id === null ? order.guest_email ?? "" : null}
        allowNoEmail={order.user_id === null && !!order.source}
        accountEmail={accountEmail}
        address={order.shipping_address}
        bundleDiscount={Number(order.bundle_discount ?? 0)}
        promoDiscount={Number(order.promo_discount ?? 0)}
        products={[...products.values()]}
        initialRows={rows}
      />
    </div>
  );
}
