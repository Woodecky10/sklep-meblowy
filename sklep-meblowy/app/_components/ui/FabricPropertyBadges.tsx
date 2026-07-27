import type { ReactNode } from "react";
import { FABRIC_PROPERTY_CODES, type FabricPropertyCode } from "@/app/_lib/fabric-properties";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";

// Pigułki cech tkaniny (wodoodporna / przyjazna zwierzętom / łatwa
// w czyszczeniu) przy wyborze tkaniny na karcie produktu. Podpis jest w
// pigułce, nie w dymku — klient nie musi na nic najeżdżać ani zgadywać,
// co znaczy ikonka (decyzja z makiety, wariant B).
//
// Ikonki jako inline SVG: zero zewnętrznych zależności, dziedziczą kolor
// tekstu (currentColor) i skalują się z rozmiarem czcionki.

const ICONS: Record<FabricPropertyCode, ReactNode> = {
  waterproof: (
    <path d="M12 2.6c3.9 4.9 6.8 8 6.8 11.3A6.8 6.8 0 1 1 5.2 13.9C5.2 10.6 8.1 7.5 12 2.6z" />
  ),
  pet_friendly: (
    <>
      <circle cx="6.5" cy="9.5" r="2.3" />
      <circle cx="11" cy="6.6" r="2.3" />
      <circle cx="16" cy="7.6" r="2.3" />
      <circle cx="19" cy="12" r="2.1" />
      <path d="M12.4 12.2c2.6 0 5.3 2.4 5.3 4.8 0 1.7-1.4 2.7-3.2 2.7-1.2 0-1.6-.5-2.9-.5s-1.7.5-2.9.5c-1.8 0-3.2-1-3.2-2.7 0-2.4 2.7-4.8 5.3-4.8z" />
    </>
  ),
  easy_clean: (
    <path d="M12 2l1.7 4.6L18.3 8l-4.6 1.7L12 14.3l-1.7-4.6L5.7 8l4.6-1.4L12 2zm6 11l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9L18 13z" />
  ),
};

// Zwraca <span> (nie <div>) — pigułki lądują też w akapicie <p> z podpisem
// wybranej wartości, a <div> w <p> to nieprawidłowy HTML (psuje hydrację).
export default function FabricPropertyBadges({
  codes,
  locale,
}: {
  codes: FabricPropertyCode[];
  locale: Locale;
}) {
  // Kolejność wyświetlania jest stała (FABRIC_PROPERTY_CODES) niezależnie od
  // kolejności wejścia — parser z bazy już sortuje, ale render nie ma zależeć
  // od tego, kto poda kody; przy okazji odsiewa duplikaty.
  const ordered = FABRIC_PROPERTY_CODES.filter((code) => codes.includes(code));
  // Brak cech → zero markupu (żadnego pustego wiersza pod nazwą tkaniny).
  if (ordered.length === 0) return null;
  const t = getDictionary(locale);
  const labels: Record<FabricPropertyCode, string> = {
    waterproof: t.fabrics.propertyWaterproof,
    pet_friendly: t.fabrics.propertyPetFriendly,
    easy_clean: t.fabrics.propertyEasyClean,
  };
  // normal-case/tracking-normal, bo podpis wybranej wartości siedzi w akapicie
  // z `uppercase tracking-widest` — pigułki mają zostać pisane zdaniowo.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 normal-case tracking-normal">
      {ordered.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-2 py-0.5 text-[11px] font-sans font-semibold text-[var(--color-gold-text)]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
            {ICONS[code]}
          </svg>
          {labels[code]}
        </span>
      ))}
    </span>
  );
}
