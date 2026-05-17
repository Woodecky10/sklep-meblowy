import Link from "next/link";

export default function CancelPage() {
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
        Płatność anulowana
      </p>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--fg)] mb-6">
        Zamówienie nie zostało opłacone
      </h1>
      <p className="text-[var(--muted)] mb-10 leading-relaxed">
        Nie martw się — koszyk pozostał nienaruszony. Możesz spróbować ponownie
        kiedy zechcesz.
      </p>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/koszyk"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Wróć do koszyka
        </Link>
        <Link
          href="/sklep"
          className="inline-flex px-8 py-4 border border-[var(--border)] text-[var(--fg)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Kontynuuj zakupy
        </Link>
      </div>
    </div>
  );
}
