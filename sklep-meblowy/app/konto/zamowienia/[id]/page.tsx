import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import type { Order, OrderItem } from "@/app/_lib/types";

export const metadata = { title: "Szczegóły zamówienia — MeblePremium" };

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
    .select(`*, items:order_items(*, product:products(*))`)
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
  const shipping = Number(order.total) - subtotal;

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
          {(order.items ?? []).map((item) => (
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
              </div>
              <p className="text-sm font-semibold text-[var(--fg)] whitespace-nowrap">
                {(Number(item.price) * item.quantity).toLocaleString("pl-PL")} zł
              </p>
            </div>
          ))}
        </div>

        <dl className="border-t border-[var(--border)] mt-6 pt-6 flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-[var(--muted)]">
            <dt>Produkty</dt>
            <dd>{subtotal.toLocaleString("pl-PL")} zł</dd>
          </div>
          <div className="flex justify-between text-[var(--muted)]">
            <dt>Dostawa</dt>
            <dd>
              {shipping <= 0 ? (
                <span className="text-green-600 font-semibold">Gratis</span>
              ) : (
                `${shipping.toLocaleString("pl-PL")} zł`
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
    </div>
  );
}
