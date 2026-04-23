import Link from "next/link";
import { SECTIONS, getCategoriesBySection } from "@/app/_lib/categories";
import { COMPANY, isFilled } from "@/app/_lib/company";

const INFO_LINKS: [string, string][] = [
  ["Moje konto", "/konto"],
  ["Historia zamówień", "/konto/zamowienia"],
  ["Dostawa i płatności", "/dostawa"],
  ["Zwroty i reklamacje", "/zwroty"],
  ["Kontakt", "/kontakt"],
  ["Regulamin", "/regulamin"],
  ["Polityka prywatności", "/prywatnosc"],
];

export default function Footer() {
  return (
    <footer className="bg-[var(--color-navy)] text-white mt-24">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div>
          <p className="font-display text-2xl font-bold mb-4">
            {COMPANY.brandName}
          </p>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs mb-4">
            Tworzymy przestrzenie, w których chce się żyć. Meble najwyższej
            jakości, z pasją do detalu.
          </p>
          <p className="text-xs text-white/40 leading-relaxed">
            {COMPANY.email}
            {COMPANY.phone && (
              <>
                <br />
                {COMPANY.phone}
              </>
            )}
          </p>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.slug}>
            <p className="font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] mb-4">
              {section.label}
            </p>
            <ul className="space-y-3 text-sm text-white/70">
              {getCategoriesBySection(section.slug).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/sklep?kategoria=${c.slug}`}
                    className="hover:text-[var(--color-gold)] transition-colors"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] mb-4">
            Informacje
          </p>
          <ul className="space-y-3 text-sm text-white/70">
            {INFO_LINKS.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="hover:text-[var(--color-gold)] transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 text-center text-xs text-white/40 px-6">
        © {new Date().getFullYear()} {COMPANY.brandName}. Wszelkie prawa zastrzeżone.
        {isFilled(COMPANY.nip) && (
          <>
            {" "}
            | NIP: {COMPANY.nip}
          </>
        )}
      </div>
    </footer>
  );
}
