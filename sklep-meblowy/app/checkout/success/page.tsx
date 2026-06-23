import Link from "next/link";
import { getStripe } from "@/app/_lib/stripe";
import { getOrderById } from "@/app/_lib/orders";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeHref } from "@/app/_lib/i18n";
import { formatPrice } from "@/app/_lib/format";
import ClearCart from "./ClearCart";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        eyebrow: "Vielen Dank",
        heading: "Bestellung erhalten",
        intro:
          "Die Zahlung wurde erfolgreich abgewickelt. An die angegebene E-Mail-Adresse haben wir eine Bestellbestätigung mit allen Details geschickt.",
        details: "Details",
        orderNumber: "Bestellnummer",
        email: "E-Mail",
        amount: "Betrag",
        continue: "Weiter einkaufen",
      }
    : {
        eyebrow: "Dziękujemy",
        heading: "Zamówienie przyjęte",
        intro:
          "Płatność zrealizowana pomyślnie. Na podany adres email wysłaliśmy potwierdzenie zamówienia wraz ze szczegółami.",
        details: "Szczegóły",
        orderNumber: "Numer zamówienia",
        email: "Email",
        amount: "Kwota",
        continue: "Kontynuuj zakupy",
      };

  let orderId: string | null = null;
  let total: number | null = null;
  let email: string | null = null;

  if (session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      orderId = session.metadata?.order_id ?? null;
      email = session.customer_details?.email ?? session.customer_email ?? null;
      if (orderId) {
        const order = await getOrderById(orderId);
        total = Number(order.total);
      }
    } catch {
      // sesja mogła wygasnąć — pokaż ogólny komunikat
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <ClearCart />

      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-950 text-green-600 mb-8">
        <svg
          width="40"
          height="40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
        {c.eyebrow}
      </p>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--fg)] mb-6">
        {c.heading}
      </h1>
      <p className="text-[var(--muted)] mb-10 leading-relaxed">{c.intro}</p>

      {(orderId || total !== null || email) && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 mb-10 text-left">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-4">
            {c.details}
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            {orderId && (
              <div className="flex justify-between border-b border-[var(--border)] pb-3">
                <dt className="text-[var(--muted)]">{c.orderNumber}</dt>
                <dd className="font-mono text-[var(--fg)]">
                  {orderId.slice(0, 8).toUpperCase()}
                </dd>
              </div>
            )}
            {email && (
              <div className="flex justify-between border-b border-[var(--border)] pb-3">
                <dt className="text-[var(--muted)]">{c.email}</dt>
                <dd className="text-[var(--fg)]">{email}</dd>
              </div>
            )}
            {total !== null && (
              <div className="flex justify-between font-bold text-base">
                <dt className="text-[var(--fg)]">{c.amount}</dt>
                <dd className="text-[var(--fg)]">
                  {formatPrice(total, locale)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <Link
        href={localizeHref("/sklep", locale)}
        className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
      >
        {c.continue}
      </Link>
    </div>
  );
}
