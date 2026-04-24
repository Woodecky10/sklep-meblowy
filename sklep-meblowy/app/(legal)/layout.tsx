import Link from "next/link";

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/o-nas", label: "O nas" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/dostawa", label: "Dostawa i płatności" },
  { href: "/zwroty", label: "Zwroty i reklamacje" },
  { href: "/regulamin", label: "Regulamin" },
  { href: "/prywatnosc", label: "Polityka prywatności" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-4">
          Informacje
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {LEGAL_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block py-1 text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <article className="legal-prose text-[var(--fg)]">{children}</article>
    </div>
  );
}
