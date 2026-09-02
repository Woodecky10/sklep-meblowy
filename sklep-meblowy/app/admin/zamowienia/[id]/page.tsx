import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getOrderById, getProfilesByIds } from "@/app/_lib/orders";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
import { adminStatusLabel, nextStatuses } from "@/app/_lib/order-status";
import { formatOrderAmount } from "@/app/_lib/money";
import { formatVariantLabel } from "@/app/_lib/variants";
import { Card } from "@/app/admin/_shared";
import OrderControls from "./OrderControls";
import type { Order, OrderItem } from "@/app/_lib/types";

export const metadata = { title: "Zamówienie — Admin" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  let order: (Order & { items: OrderItem[] }) | null = null;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  const profiles = order.user_id ? await getProfilesByIds([order.user_id]) : {};
  const customer = orderCustomerDisplay(
    order,
    order.user_id ? profiles[order.user_id] ?? null : null
  );

  const items = order.items ?? [];
  const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const promoDiscount = Number(order.promo_discount ?? 0);
  const bundleDiscount = Number(order.bundle_discount ?? 0);
  const s = adminStatusLabel(order.status, order.source);
  const addr = order.shipping_address;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/zamowienia" className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors">
          ← Wszystkie zamówienia
        </Link>
      </div>

      {/* Nagłówek + status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
            Zamówienie #{order.order_number}
          </h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {new Date(order.created_at).toLocaleString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {order.source && (
            <p className="text-xs text-[var(--muted)] mt-1">
              Źródło: <span className="font-semibold text-[var(--fg)]">{order.source}</span>{" "}
              (zamówienie spoza sklepu)
            </p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start ${s.className}`}>
          {s.label}
        </span>
        {order.payment_method === "cod" && (
          <span
            title="Płatność przy odbiorze — kurier pobiera gotówkę"
            className="px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start text-yellow-800 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300"
          >
            Pobranie
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lewa kolumna: pozycje + podsumowanie + klient + adres + płatność */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Pozycje</h3>
            <div className="flex flex-col gap-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 border-b border-[var(--border)] last:border-0 pb-4 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/produkt/${item.product_id}`}
                      className="font-semibold text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
                    >
                      {item.product?.name ?? "Produkt"}
                    </Link>
                    {item.bundle_label && (
                      <span className="text-xs text-[var(--color-gold-text)]"> (zestaw: {item.bundle_label})</span>
                    )}
                    {item.variant_values && (
                      <p className="text-xs text-[var(--color-gold)] mt-0.5">
                        {formatVariantLabel(item.variant_values, "pl")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-1.5 text-xs text-[var(--muted)] whitespace-pre-wrap">
                        Uwagi: {item.notes}
                      </p>
                    )}
                    <p className="text-sm text-[var(--muted)] mt-1">
                      {item.quantity} × {formatOrderAmount(Number(item.price), order.currency)}
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--fg)] whitespace-nowrap">
                    {formatOrderAmount(Number(item.price) * item.quantity, order.currency)}
                  </p>
                </div>
              ))}
            </div>

            <dl className="border-t border-[var(--border)] mt-4 pt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-[var(--muted)]">
                <dt>Produkty</dt>
                <dd>{formatOrderAmount(subtotal, order.currency)}</dd>
              </div>
              {bundleDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>Rabat za zestaw</dt>
                  <dd>−{formatOrderAmount(bundleDiscount, order.currency)}</dd>
                </div>
              )}
              {promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>
                    Rabat
                    {order.promo_code?.code && (
                      <span className="ml-1 font-mono text-xs">({order.promo_code.code})</span>
                    )}
                  </dt>
                  <dd>−{formatOrderAmount(promoDiscount, order.currency)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 font-bold text-base text-[var(--fg)]">
                <dt>
                  {order.payment_method === "cod"
                    ? "Do pobrania"
                    : order.source
                      ? `Zapłacono (${order.source})`
                      : "Zapłacono"}
                </dt>
                <dd>{formatOrderAmount(Number(order.total), order.currency)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Klient</h3>
            <p className="text-sm text-[var(--fg)]">{customer.name ?? "—"}</p>
            {customer.email && <p className="text-sm text-[var(--muted)]">{customer.email}</p>}
            <p className="text-xs text-[var(--muted)] mt-1">
              {order.source
                ? `Zamówienie zewnętrzne — ${order.source}`
                : customer.isGuest
                  ? "Zamówienie gościa"
                  : "Konto zarejestrowane"}
            </p>
            {addr?.phone && <p className="text-sm text-[var(--muted)] mt-2">tel. {addr.phone}</p>}
          </Card>

          {addr && (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Adres dostawy</h3>
              <address className="not-italic text-sm text-[var(--fg)] leading-relaxed">
                {addr.fullname && <>{addr.fullname}<br /></>}
                {addr.street}<br />
                {addr.postal_code} {addr.city}<br />
                {addr.country}
              </address>
            </Card>
          )}

          {/* Karty "Płatność" wzajemnie wykluczone: COD nie ma referencji
              płatności online, ale gdyby dane kiedyś się rozjechały, admin
              ma zobaczyć JEDNĄ kartę właściwą dla metody płatności. */}
          {order.payment_method === "cod" ? (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Płatność</h3>
              <p className="text-sm text-[var(--fg)]">
                Za pobraniem — kurier pobiera{" "}
                <span className="font-semibold">
                  {formatOrderAmount(Number(order.total), order.currency)}
                </span>{" "}
                przy dostawie.
              </p>
            </Card>
          ) : order.payment_ref ? (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Płatność</h3>
              <p className="text-xs text-[var(--muted)]">
                Referencja P24 (zwroty w panelu Przelewy24):
              </p>
              <p className="font-mono text-sm text-[var(--fg)] break-all">
                {order.payment_ref}
              </p>
            </Card>
          ) : null}
        </div>

        {/* Prawa kolumna: kontrolki admina */}
        <div className="lg:col-span-1">
          <OrderControls
            orderId={order.id}
            orderNumber={order.order_number}
            allowedStatuses={nextStatuses(order.status)}
            carrier={order.carrier}
            trackingNumber={order.tracking_number}
            deliveryCost={order.delivery_cost}
            deliveryPaid={order.delivery_paid}
            adminNote={order.admin_note}
          />
        </div>
      </div>
    </div>
  );
}
