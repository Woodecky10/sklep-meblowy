import type { ReactNode } from "react";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Slider sekcji home + link „Zobacz wszystkie …" w jednym, ustalonym miejscu:
// na desktopie dyskretny link nad sliderem z prawej (jak „Wszystkie →" przy
// polecanych produktach), na mobile przycisk pod sliderem — bo obok nagłówka
// nie ma tam miejsca. Link jest w DOM dwa razy, widoczny zawsze jeden
// (e2e liczą `:visible`). Wspólne dla zestawów (HomeBundles) i kolekcji
// (HomeCollections) — właściciel chciał „tak samo jak w zestawach".
export default function CarouselSeeAll({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:flex justify-end mb-4">
        <LocalizedLink
          href={href}
          className="text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          {label} →
        </LocalizedLink>
      </div>

      {children}

      <div className="md:hidden flex justify-center mt-8">
        <LocalizedLink
          href={href}
          className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
        >
          {label}
        </LocalizedLink>
      </div>
    </>
  );
}
