import Image from "next/image";
import { notFound } from "next/navigation";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeProduct } from "@/app/_lib/localize";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "@/app/_lib/de-content-maps";
import { formatOrderAmount } from "@/app/_lib/money";
import type { Order, OrderItem } from "@/app/_lib/types";
import ReorderButton from "@/app/_components/ui/ReorderButton";
import CancelOrderButton from "../CancelOrderButton";
import { deliveryView } from "@/app/_lib/delivery";

export async function generateMetadata() {
  const locale = await getLocale();
  const de = locale === "de";
  return {
    title: de ? "Bestelldetails — Mollien" : "Szczegóły zamówienia — Mollien",
  };
}

const statusLabels: Record<
  string,
  { label: string; labelDe: string; className: string }
> = {
  pending: { label: "Oczekuje na płatność", labelDe: "Ausstehende Zahlung", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", labelDe: "Bezahlt", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", labelDe: "In Bearbeitung", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", labelDe: "Versandt", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", labelDe: "Geliefert", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", labelDe: "Storniert", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const de = locale === "de";
  const c = de
    ? {
        backAll: "← Alle Bestellungen",
        product: "Produkt",
        notes: "Anmerkungen",
        products: "Produkte",
        coupon: "Gutschein",
        shipping: "Versand",
        shippingIndividual: "individuell festgelegt",
        total: "Gesamt",
        shippingAddress: "Lieferadresse",
        delivery: "Versand",
        carrier: "Spediteur",
        trackingNumber: "Sendungsnummer",
        pendingTitle: "Bestellung wartet auf Zahlung",
        pendingDesc:
          "Falls Sie es sich anders überlegt haben, können Sie die Bestellung vor der Bezahlung stornieren. Nach der Bezahlung ist für die Stornierung eine Kontaktaufnahme mit uns erforderlich.",
        likedTitle: "Hat es gefallen?",
        likedDesc:
          "Sie können dieselbe Bestellung erneut aufgeben — alle Positionen (mit den gewählten Varianten) landen sofort im Warenkorb. Die Preise werden auf die aktuellen aktualisiert.",
        priceLocale: "de-DE",
      }
    : {
        backAll: "← Wszystkie zamówienia",
        product: "Produkt",
        notes: "Uwagi",
        products: "Produkty",
        coupon: "Kupon",
        shipping: "Dostawa",
        shippingIndividual: "ustalana indywidualnie",
        total: "Razem",
        shippingAddress: "Adres dostawy",
        delivery: "Dostawa",
        carrier: "Przewoźnik",
        trackingNumber: "Numer śledzenia",
        pendingTitle: "Zamówienie czeka na płatność",
        pendingDesc:
          "Jeśli się rozmyśliłeś, możesz anulować zamówienie zanim zostanie opłacone. Po opłaceniu anulowanie wymaga kontaktu z nami.",
        likedTitle: "Spodobało się?",
        likedDesc:
          "Możesz złożyć identyczne zamówienie ponownie — wszystkie pozycje (z wybranymi wariantami) trafią od razu do koszyka. Ceny zostaną zaktualizowane do aktualnych.",
        priceLocale: "pl-PL",
      };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  // Zapytanie przez admin client: RLS na products (is_active=true) ukrywałby
  // kupione produkty, które później zostały ukryte (znikły z BL / admin),
  // a promo_codes nie ma polityki odczytu dla klienta — embed kodu kuponu
  // zawsze zwracał null. Ownership wymusza .eq("user_id", user.id) z sesji.
  const adminSupabase = await createAdminClient();
  const { data, error } = await adminSupabase
    .from("orders")
    .select(`*, items:order_items(*, product:products(*)), promo_code:promo_codes(code)`)
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) notFound();

  const order = data as unknown as Order & { items: OrderItem[] };
  const status = statusLabels[order.status] ?? statusLabels.pending;
  const statusText = de ? status.labelDe : status.label;
  const subtotal = (order.items ?? []).reduce(
    (s, i) => s + Number(i.price) * i.quantity,
    0
  );
  const promoDiscount = Number(order.promo_discount ?? 0);
  // total = subtotal - promo_discount + shipping  =>  shipping = total - subtotal + promo_discount
  const shipping = Number(order.total) - subtotal + promoDiscount;
  const delivery = deliveryView(order);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <LocalizedLink
          href="/konto/zamowienia"
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          {c.backAll}
        </LocalizedLink>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="font-mono text-sm text-[var(--muted)] mb-1">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {new Date(order.created_at).toLocaleDateString(c.priceLocale, {
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
            {statusText}
          </span>
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-6">
          {(order.items ?? []).map((item) => {
            const variantEntries = item.variant_values
              ? Object.entries(item.variant_values)
              : [];
            const prod = item.product
              ? localizeProduct(item.product, locale)
              : item.product;
            return (
              <div key={item.id} className="flex gap-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
                  {prod?.images?.[0] && (
                    <Image
                      src={prod.images[0]}
                      alt={prod.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--fg)] truncate">
                    {prod?.name ?? c.product}
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.quantity} × {formatOrderAmount(Number(item.price), order.currency)}
                  </p>
                  {variantEntries.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {variantEntries.map(([name, value]) => (
                        <li
                          key={name}
                          className="text-xs text-[var(--muted)]"
                        >
                          <span className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                            {de ? mapDe(VARIANT_OPTION_DE, name) ?? name : name}:
                          </span>{" "}
                          <span className="text-[var(--fg)]">
                            {de ? mapDe(VARIANT_VALUE_DE, value) ?? value : value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.notes && (
                    <p className="mt-2 text-xs text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                      <span className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)] block mb-0.5">
                        {c.notes}
                      </span>
                      {item.notes}
                    </p>
                  )}
                </div>
                <p className="text-sm font-semibold text-[var(--fg)] whitespace-nowrap">
                  {formatOrderAmount(Number(item.price) * item.quantity, order.currency)}
                </p>
              </div>
            );
          })}
        </div>

        <dl className="border-t border-[var(--border)] mt-6 pt-6 flex flex-col gap-2 text-sm">
          <div className="flex justify-between text-[var(--muted)]">
            <dt>{c.products}</dt>
            <dd>{formatOrderAmount(subtotal, order.currency)}</dd>
          </div>
          {promoDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>
                {c.coupon}
                {order.promo_code?.code && (
                  <span className="ml-1 font-mono text-xs">
                    ({order.promo_code.code})
                  </span>
                )}
              </dt>
              <dd>−{formatOrderAmount(promoDiscount, order.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between items-start text-[var(--muted)] gap-3">
            <dt className="shrink-0">{c.shipping}</dt>
            <dd className="text-right">
              {shipping > 0 ? (
                formatOrderAmount(shipping, order.currency)
              ) : (
                <span className="text-xs leading-snug">
                  {c.shippingIndividual}
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-2 font-bold text-base text-[var(--fg)]">
            <dt>{c.total}</dt>
            <dd>{formatOrderAmount(Number(order.total), order.currency)}</dd>
          </div>
        </dl>
      </div>

      {order.shipping_address && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">
            {c.shippingAddress}
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

      {delivery.hasInfo && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">
            {c.delivery}
          </h3>
          <dl className="flex flex-col gap-3 text-sm">
            {delivery.carrier && (
              <div className="flex flex-col gap-0.5">
                <dt className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                  {c.carrier}
                </dt>
                <dd className="text-[var(--fg)]">{delivery.carrier}</dd>
              </div>
            )}
            {delivery.trackingNumber && (
              <div className="flex flex-col gap-0.5">
                <dt className="font-sans uppercase tracking-widest text-[10px] text-[var(--color-gold)]">
                  {c.trackingNumber}
                </dt>
                <dd className="font-mono text-[var(--fg)]">{delivery.trackingNumber}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {order.status === "pending" && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl p-6">
          <h3 className="font-display text-base font-bold text-[var(--fg)] mb-1">
            {c.pendingTitle}
          </h3>
          <p className="text-sm text-[var(--muted)] mb-4">
            {c.pendingDesc}
          </p>
          <CancelOrderButton orderId={order.id} />
        </div>
      )}

      {(order.items?.length ?? 0) > 0 && order.status !== "cancelled" && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-1">
            {c.likedTitle}
          </h3>
          <p className="text-sm text-[var(--muted)] mb-5">
            {c.likedDesc}
          </p>
          <ReorderButton items={order.items ?? []} />
        </div>
      )}
    </div>
  );
}
