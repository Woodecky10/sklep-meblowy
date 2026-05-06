import Link from "next/link";

const CARDS = [
  { href: "/admin/slider", title: "Slider na stronie głównej", cta: "Edytuj slider" },
  { href: "/admin/kategorie", title: "Kategorie", cta: "Zarządzaj" },
  { href: "/admin/produkty", title: "Produkty (warianty)", cta: "Edytuj" },
  { href: "/admin/baselinker", title: "BaseLinker", cta: "Otwórz" },
];

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Pulpit
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-4 p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:border-[var(--color-gold)] transition-colors"
          >
            <h2 className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
              {card.title}
            </h2>
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-2 mt-auto">
              {card.cta}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
