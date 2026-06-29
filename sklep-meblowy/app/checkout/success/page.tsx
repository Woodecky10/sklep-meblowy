import Link from "next/link";
import { getOrderById } from "@/app/_lib/orders";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeHref } from "@/app/_lib/i18n";
import { formatOrderAmount } from "@/app/_lib/money";
import ClearCart from "./ClearCart";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderParam } = await searchParams;
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        eyebrow: "Vielen Dank",
        heading: "Bestellung erhalten",
        headingPending: "Zahlung wird verarbeitet",
        intro:
          "Die Zahlung wurde erfolgreich abgewickelt. An die angegebene E-Mail-Adresse haben wir eine Bestellbestätigung mit allen Details geschickt.",
        introPending:
          "Die Zahlung wird vom Anbieter bestätigt. Sobald der Betrag eingegangen ist, senden wir eine Bestätigung an Ihre E-Mail. Sie können diese Seite schließen.",
        details: "Details",
        orderNumber: "Bestellnummer",
        email: "E-Mail",
        amount: "Betrag",
        continue: "Weiter einkaufen",
      }
    : {
        eyebrow: "Dziękujemy",
        heading: "Zamówienie przyjęte",
        headingPending: "Płatność w toku",
        intro:
          "Płatność zrealizowana pomyślnie. Na podany adres email wysłaliśmy potwierdzenie zamówienia wraz ze szczegółami.",
        introPending:
          "Trwa potwierdzanie płatności przez operatora. Gdy środki wpłyną, wyślemy potwierdzenie na podany adres email. Tę stronę można zamknąć.",
        details: "Szczegóły",
        orderNumber: "Numer zamówienia",
        email: "Email",
        amount: "Kwota",
        continue: "Kontynuuj zakupy",
      };

  let orderId: string | null = null;
  let total: number | null = null;
  let email: string | null = null;
  let orderCurrency: "pln" | "eur" = "pln";
  let isPaid = false;

  if (orderParam) {
    try {
      const order = await getOrderById(orderParam);
      orderId = order.id;
      total = Number(order.total);
      orderCurrency = order.currency;
      email = order.guest_email;
      isPaid = order.status !== "pending";
    } catch {
      // brak zamówienia — pokaż ogólny komunikat
    }
  }

  const heading = isPaid ? c.heading : c.headingPending;
  const intro = isPaid ? c.intro : c.introPending;

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
        {heading}
      </h1>
      <p className="text-[var(--muted)] mb-10 leading-relaxed">{intro}</p>

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
                  {formatOrderAmount(total, orderCurrency)}
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
