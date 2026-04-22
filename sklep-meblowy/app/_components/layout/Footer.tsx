import Link from "next/link";
import { SECTIONS, getCategoriesBySection } from "@/app/_lib/categories";

export default function Footer() {
  return (
    <footer className="bg-[var(--color-navy)] text-white mt-24">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
        <div>
          <p className="font-display text-2xl font-bold mb-4">
            Meble<span className="text-[var(--color-gold)]">Premium</span>
          </p>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs">
            Tworzymy przestrzenie, w których chce się żyć. Meble najwyższej
            jakości, z pasją do detalu.
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
            {[
              ["Moje konto", "/konto"],
              ["Historia zamówień", "/konto/zamowienia"],
              ["Polityka prywatności", "/prywatnosc"],
              ["Regulamin", "/regulamin"],
            ].map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="hover:text-[var(--color-gold)] transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} MeblePremium. Wszelkie prawa zastrzeżone.
      </div>
    </footer>
  );
}
