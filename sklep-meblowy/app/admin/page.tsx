import Link from "next/link";

// Dashboard admina — placeholder cards do podpięcia w kolejnych PR-ach.
// Każda karta linkuje do właściwej sekcji.

const CARDS = [
  {
    href: "/admin/slider",
    title: "Slider na stronie głównej",
    description:
      "Edytuj slajdy hero, podmieniaj zdjęcia, ustalaj daty obowiązywania promocji.",
    cta: "Edytuj slider",
    status: "dostępne" as const,
  },
  {
    href: "/admin/kategorie",
    title: "Kategorie",
    description:
      "Dodawaj, edytuj i porządkuj kategorie produktów. Mapowanie na BaseLinker.",
    cta: "Zarządzaj",
    status: "dostępne" as const,
  },
  {
    href: "/admin/baselinker",
    title: "BaseLinker",
    description:
      "Synchronizuj produkty z BL → strona, sprawdź historię synchronizacji.",
    cta: "Otwórz",
    status: "dostępne" as const,
  },
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
        <p className="text-sm text-[var(--muted)] mt-2">
          Zarządzaj treścią strony głównej, kategoriami i synchronizacją z BaseLinkerem.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-4 p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:border-[var(--color-gold)] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
                {card.title}
              </h2>
              <span className="px-2.5 py-1 bg-[var(--bg)] border border-[var(--border)] text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] rounded-full">
                {card.status}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed flex-1">
              {card.description}
            </p>
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-2">
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
