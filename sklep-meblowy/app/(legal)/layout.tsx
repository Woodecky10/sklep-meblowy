import Link from "next/link";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizeHref } from "@/app/_lib/i18n";

const LEGAL_LINKS_PL: { href: string; label: string }[] = [
  { href: "/o-nas", label: "O nas" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/dostawa", label: "Dostawa i płatności" },
  { href: "/zwroty", label: "Zwroty i reklamacje" },
  { href: "/regulamin", label: "Regulamin" },
  { href: "/prywatnosc", label: "Polityka prywatności" },
];

const LEGAL_LINKS_DE: { href: string; label: string }[] = [
  { href: "/o-nas", label: "Über uns" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/dostawa", label: "Versand und Zahlung" },
  { href: "/zwroty", label: "Rückgabe und Reklamation" },
  { href: "/regulamin", label: "AGB" },
  { href: "/prywatnosc", label: "Datenschutzerklärung" },
];

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const de = locale === "de";
  const links = de ? LEGAL_LINKS_DE : LEGAL_LINKS_PL;
  const heading = de ? "Informationen" : "Informacje";

  return (
    <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-4">
          {heading}
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={localizeHref(l.href, locale)}
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
