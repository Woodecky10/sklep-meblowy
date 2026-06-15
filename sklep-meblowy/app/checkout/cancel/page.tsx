import Link from "next/link";
import { getLocale } from "@/app/_lib/i18n-server";

export default async function CancelPage() {
  const locale = await getLocale();
  const de = locale === "de";

  const c = de
    ? {
        eyebrow: "Zahlung abgebrochen",
        heading: "Die Bestellung wurde nicht bezahlt",
        intro:
          "Keine Sorge — Ihr Warenkorb ist unverändert geblieben. Sie können es jederzeit erneut versuchen.",
        backToCart: "Zurück zum Warenkorb",
        continue: "Weiter einkaufen",
      }
    : {
        eyebrow: "Płatność anulowana",
        heading: "Zamówienie nie zostało opłacone",
        intro:
          "Nie martw się — koszyk pozostał nienaruszony. Możesz spróbować ponownie kiedy zechcesz.",
        backToCart: "Wróć do koszyka",
        continue: "Kontynuuj zakupy",
      };

  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 mb-8">
        <svg
          width="40"
          height="40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>

      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
        {c.eyebrow}
      </p>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--fg)] mb-6">
        {c.heading}
      </h1>
      <p className="text-[var(--muted)] mb-10 leading-relaxed">{c.intro}</p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/koszyk"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          {c.backToCart}
        </Link>
        <Link
          href="/sklep"
          className="inline-flex px-8 py-4 border border-[var(--border)] text-[var(--fg)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          {c.continue}
        </Link>
      </div>
    </div>
  );
}
