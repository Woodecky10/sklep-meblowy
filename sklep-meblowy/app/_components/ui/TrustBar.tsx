import type { ReactNode } from "react";
import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

// Pasek zaufania „Dlaczego warto kupować u nas?" — HTML/CSS 1:1 z grafik
// docs/grafika-zaufanie-sklepu*.png (wzorzec wierności; PNG nie idą do runtime).
// Server component, zero JS klienta. Kolory ze zmiennych motywu → dark/light
// przełącza się samo.
const GOLD = "var(--color-gold)";

type Props = {
  locale: Locale;
  withHeading?: boolean;
  // Nagłówek sekcji z home_sections (admin) — fallback na słownik, żeby
  // karta produktu i stopka (bez propsów) działały bez zmian.
  heading?: string | null;
  eyebrow?: string | null;
};

export default function TrustBar({
  locale,
  withHeading = false,
  heading,
  eyebrow,
}: Props) {
  const t = getDictionary(locale).trustBar;
  const resolvedHeading = heading ?? t.heading;
  const resolvedEyebrow = eyebrow ?? t.eyebrow;
  const ink = "text-[var(--fg)]";
  const muted = "text-[var(--muted)]";
  const divide = "lg:divide-[var(--border)]";

  const items: { icon: ReactNode; label: string; sub?: string }[] = [
    { icon: <MedalPL />, label: t.producer },
    { icon: <ShieldCheck />, label: t.quality },
    { icon: <TruckFree free={t.iconFree} />, label: t.delivery, sub: t.deliveryScope },
    { icon: <ShieldYears years={t.iconYears} word={t.iconYearsWord} />, label: t.warranty },
  ];

  return (
    <div className={ink}>
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
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-0 lg:divide-x ${divide}`}
      >
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center gap-8 px-6">
            <span className="h-28 flex items-center">{it.icon}</span>
            <span className="flex items-start gap-3 text-left">
              <CheckBadge />
              <span className="font-sans font-bold text-lg leading-snug">
                {it.label}
                {it.sub && (
                  <span className={`block font-normal text-base ${muted}`}>{it.sub}</span>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ikony (stroke = currentColor dla konturu, złoto stałe) ──

// Złoty kwadracik z ✓ przy etykiecie.
function CheckBadge() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.2" className="shrink-0 mt-0.5" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8.5 12.5 2.5 2.5 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Medal: podwójne kółko z serif „PL".
function MedalPL() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <circle cx="52" cy="52" r="46" stroke="currentColor" strokeWidth="5" />
      <circle cx="52" cy="52" r="36" stroke={GOLD} strokeWidth="2.5" />
      <text x="52" y="52" dy="0.36em" textAnchor="middle" fill="currentColor" className="font-display" fontSize="34" fontWeight="700">
        PL
      </text>
    </svg>
  );
}

// Tarcza ze złotym ✓.
function ShieldCheck() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M52 8 88 22v26c0 24-15 40-36 48C31 88 16 72 16 48V22Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="m36 50 12 12 22-26" stroke={GOLD} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Ciężarówka w pędzie ze złotym „0 zł" na skrzyni.
function TruckFree({ free }: { free: string }) {
  return (
    <svg width="128" height="104" viewBox="0 0 128 104" fill="none" aria-hidden>
      <path d="M8 38h14M4 50h14M8 62h14" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
      <rect x="34" y="26" width="52" height="44" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M86 40h16l12 14v16h-28" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="52" cy="76" r="8" stroke="currentColor" strokeWidth="5" />
      <circle cx="100" cy="76" r="8" stroke="currentColor" strokeWidth="5" />
      <text x="60" y="48" dy="0.35em" textAnchor="middle" fill={GOLD} className="font-display" fontSize="24" fontWeight="700">
        {free}
      </text>
    </svg>
  );
}

// Tarcza ze złotym „2 / LATA" (DE: JAHRE).
function ShieldYears({ years, word }: { years: string; word: string }) {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M52 8 88 22v26c0 24-15 40-36 48C31 88 16 72 16 48V22Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <text x="52" y="46" textAnchor="middle" fill={GOLD} className="font-display" fontSize="30" fontWeight="700">
        {years}
      </text>
      <text x="52" y="64" textAnchor="middle" fill={GOLD} className="font-sans" fontSize="12" fontWeight="700" letterSpacing="3">
        {word}
      </text>
    </svg>
  );
}
