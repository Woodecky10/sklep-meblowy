// Pasek zaufania „Dlaczego warto kupować u nas?" — pozycje z tabeli
// trust_items (/admin/strona-glowna), ikony z rejestru trust-icons.
// Server component, zero JS klienta. Fallback (null z fetcha) = dzisiejsze
// 4 pozycje ze słowników.

import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { getTrustItems, prepareTrustItems } from "@/app/_lib/trust-items";
import { TRUST_ICONS } from "./trust-icons";

type Props = {
  locale: Locale;
  withHeading?: boolean;
  // Nagłówek sekcji z home_sections (admin) — fallback na słownik.
  heading?: string | null;
  eyebrow?: string | null;
};

export default async function TrustBar({
  locale,
  withHeading = false,
  heading,
  eyebrow,
}: Props) {
  const t = getDictionary(locale).trustBar;
  const rows = await getTrustItems();
  const items = prepareTrustItems(rows, locale);
  if (items.length === 0) return null;

  // undefined = wywołanie bez propsa (karta produktu/stopka) → słownik;
  // null/"" = świadomie wyczyszczone w adminie → element się nie renderuje.
  // (semantyka z fixu po final review kroku 1 — NIE zamieniać na `??`)
  const resolvedHeading = heading === undefined ? t.heading : heading;
  const resolvedEyebrow = eyebrow === undefined ? t.eyebrow : eyebrow;

  // Liczba kolumn na lg dopasowana do liczby pozycji (Tailwind wymaga
  // literalnych klas — stąd mapa zamiast interpolacji).
  const lgCols =
    items.length >= 4
      ? "lg:grid-cols-4"
      : items.length === 3
        ? "lg:grid-cols-3"
        : items.length === 2
          ? "lg:grid-cols-2"
          : "lg:grid-cols-1";

  return (
    <div className="text-[var(--fg)]">
      {withHeading && (
        <div className="text-center mb-14">
          {resolvedEyebrow && (
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
              {resolvedEyebrow}
            </p>
          )}
          {resolvedHeading && (
            <h2 className="font-display text-4xl font-bold">{resolvedHeading}</h2>
          )}
        </div>
      )}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${lgCols} gap-10 lg:gap-0 lg:divide-x lg:divide-[var(--border)]`}
      >
        {items.map((it) => (
          <div key={it.id} className="flex flex-col items-center gap-8 px-6">
            <span className="h-28 flex items-center">{TRUST_ICONS[it.icon](t)}</span>
            <span className="flex items-start gap-3 text-left">
              <CheckBadge />
              <span className="font-sans font-bold text-lg leading-snug">
                {it.label}
                {it.subline && (
                  <span className="block font-normal text-base text-[var(--muted)]">
                    {it.subline}
                  </span>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Złoty kwadracik z ✓ przy etykiecie (zostaje tu — to nie jest ikona
// wybieralna, tylko stały element układu pozycji).
function CheckBadge() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="2.2" className="shrink-0 mt-0.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8.5 12.5 2.5 2.5 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
