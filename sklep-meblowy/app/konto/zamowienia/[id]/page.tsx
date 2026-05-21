import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import type { Order, OrderItem } from "@/app/_lib/types";
import ReorderButton from "@/app/_components/ui/ReorderButton";
import CancelOrderButton from "../CancelOrderButton";

export const metadata = { title: "Szczegóły zamówienia — Mollien" };

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekuje na płatność", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*)), promo_code:promo_codes(code)`)
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (error || !data) notFound();

  const order = data as unknown as Order & { items: OrderItem[] };
  const status = statusLabels[order.status] ?? statusLabels.pending;
  const subtotal = (order.items ?? []).reduce(
    (s, i) => s + Number(i.price) * i.quantity,
    0
  );
  const promoDiscount = Number(order.promo_discount ?? 0);
  // total = subtotal - promo_discount + shipping  =>  shipping = total - subtotal + promo_discount
  const shipping = Number(order.total) - subtotal + promoDiscount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/konto/zamowienia"
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Wszystkie zamówienia
        </Link>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="font-mono text-sm text-[var(--muted)] mb-1">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {new Date(order.created_at).toLocaleDateString("pl-PL", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-6">
          {(order.items ?? []).map((item) => {
            const variantEntries = item.variant_values
              ? Object.entries(item.variant_values)
              : [];
            return (
              <div key={item.id} className="flex gap-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
                  {item.product?.images?.[0] && (
                    <Image
                      src={item.product.images[0]}
                      alt={item.product.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--fg)] truncate">
                    {item.product?.name ?? "Produkt"}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.quantity} × {Number(item.price).toLocaleString("pl-PL")} zł
                  </p>
                  {variantEntries.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {variantEntries.map(([name, value]) => (
                        <li
                          key={name}
                          className="text-xs text-[var(--muted)]"
                        >
                          <span className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                            {name}:
                          </span>{" "}
                          <span className="text-[var(--fg)]">{value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.notes && (
                    <p className="mt-2 text-xs text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                      <span className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)] block mb-0.5">
                        Uwagi
                      </span>
                      {item.notes}
                    </p>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--fg)] whitespace-nowrap">
                  {(Number(item.price) * item.quantity).toLocaleString("pl-PL")} zł
                </p>
              </div>
            );
          })}
        </div>

        <dl className="border-t border-[var(--border)] mt-6 pt-6 flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-[var(--muted)]">
            <dt>Produkty</dt>
            <dd>{subtotal.toLocaleString("pl-PL")} zł</dd>
          </div>
          {promoDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>
                Kupon
                {order.promo_code?.code && (
                  <span className="ml-1 font-mono text-xs">
                    ({order.promo_code.code})
                  </span>
                )}
              </dt>
              <dd>−{promoDiscount.toLocaleString("pl-PL")} zł</dd>
            </div>
          )}
          <div className="flex justify-between items-start text-[var(--muted)] gap-3">
            <dt className="shrink-0">Dostawa</dt>
            <dd className="text-right">
              {shipping > 0 ? (
                `${shipping.toLocaleString("pl-PL")} zł`
              ) : (
                <span className="text-xs leading-snug">
                  ustalana indywidualnie
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 font-bold text-base text-[var(--fg)]">
            <dt>Razem</dt>
            <dd>{Number(order.total).toLocaleString("pl-PL")} zł</dd>
          </div>
        </dl>
      </div>

      {order.shipping_address && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">
            Adres dostawy
          </h3>
          <address className="not-italic text-sm text-[var(--fg)] leading-relaxed">
            {order.shipping_address.street}
            <br />
            {order.shipping_address.postal_code} {order.shipping_address.city}
            <br />
            {order.shipping_address.country}
          </address>
        </div>
      )}

      {order.status === "pending" && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-6">
          <h3 className="font-display text-base font-bold text-[var(--fg)] mb-1">
            Zamówienie czeka na płatność
          </h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            Jeśli się rozmyśliłeś, możesz anulować zamówienie zanim zostanie
            opłacone. Po opłaceniu anulowanie wymaga kontaktu z nami.
          </p>
          <CancelOrderButton orderId={order.id} />
        </div>
      )}

      {(order.items?.length ?? 0) > 0 && order.status !== "cancelled" && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-1">
            Spodobało się?
          </h3>
          <p className="text-sm text-[var(--muted)] mb-5">
            Możesz złożyć identyczne zamówienie ponownie — wszystkie pozycje
            (z wybranymi wariantami) trafią od razu do koszyka. Ceny zostaną
            zaktualizowane do aktualnych.
          </p>
          <ReorderButton items={order.items ?? []} />
        </div>
      )}
    </div>
  );
}
