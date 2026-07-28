import type { FabricPropertyDef } from "@/app/_lib/fabric-properties";
import { pickLocalized, type Locale } from "@/app/_lib/i18n";
import FabricPropertyIconSvg from "./FabricPropertyIcon";

// Pigułki cech tkaniny przy wyborze tkaniny na karcie produktu. Podpis jest w
// pigułce, nie w dymku — klient nie musi na nic najeżdżać ani zgadywać,
// co znaczy ikonka (decyzja z makiety, wariant B).
//
// Zestaw cech jest edytowalny w panelu, więc podpisy i ikonki przychodzą
// gotowe w definicjach (`FabricPropertyDef`) — komponent nic nie parsuje,
// nie sortuje i nie sięga do słownika w kodzie.

// Zwraca <span> (nie <div>) — pigułki lądują też w akapicie <p> z podpisem
// wybranej wartości, a <div> w <p> to nieprawidłowy HTML (psuje hydrację).
export default function FabricPropertyBadges({
  defs,
  locale,
}: {
  defs: FabricPropertyDef[];
  locale: Locale;
}) {
  // Brak cech → zero markupu (żadnego pustego wiersza pod nazwą tkaniny).
  if (defs.length === 0) return null;
  // normal-case/tracking-normal, bo podpis wybranej wartości siedzi w akapicie
  // z `uppercase tracking-widest` — pigułki mają zostać pisane zdaniowo.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 normal-case tracking-normal">
      {defs.map((def) => (
        <span
          key={def.code}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-2 py-0.5 text-[11px] font-sans font-semibold text-[var(--color-gold-text)]"
        >
          {/* Klucz ikonki spoza biblioteki (np. ikonka wycięta z kodu) → sam
              podpis. Pigułka nigdy nie znika i nigdy nie wysypuje karty. */}
          {def.icon && <FabricPropertyIconSvg icon={def.icon} />}
          {pickLocalized(def.label, def.labelDe, locale)}
        </span>
      ))}
    </span>
  );
}
