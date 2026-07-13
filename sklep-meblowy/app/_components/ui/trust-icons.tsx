import type { ReactNode } from "react";

const GOLD = "var(--color-gold)";

export const TRUST_ICON_KEYS = [
  "medal-pl",
  "shield-check",
  "truck-free",
  "warranty-2y",
  "star",
  "leaf",
  "headset",
  "wallet",
  "hand-heart",
  "clock",
] as const;

export type TrustIconKey = (typeof TRUST_ICON_KEYS)[number];

export function isTrustIconKey(v: string): v is TrustIconKey {
  return (TRUST_ICON_KEYS as readonly string[]).includes(v);
}

// Teksty osadzone w ikonach (0 zł / 2 LATA|JAHRE) — ze słownika trustBar.
export type TrustIconTexts = {
  iconFree: string;
  iconYears: string;
  iconYearsWord: string;
};

// Etykiety PL do pickera w adminie.
export const TRUST_ICON_LABELS: Record<TrustIconKey, string> = {
  "medal-pl": "Medal PL",
  "shield-check": "Tarcza z ptaszkiem",
  "truck-free": "Ciężarówka (0 zł)",
  "warranty-2y": 'Tarcza "2 lata"',
  star: "Gwiazdka",
  leaf: "Liść (eko)",
  headset: "Słuchawki (obsługa)",
  wallet: "Portfel",
  "hand-heart": "Serce w dłoni",
  clock: "Zegar",
};

export const TRUST_ICONS: Record<TrustIconKey, (t: TrustIconTexts) => ReactNode> = {
  "medal-pl": () => <MedalPL />,
  "shield-check": () => <ShieldCheck />,
  "truck-free": (t) => <TruckFree free={t.iconFree} />,
  "warranty-2y": (t) => <ShieldYears years={t.iconYears} word={t.iconYearsWord} />,
  star: () => <StarBadge />,
  leaf: () => <Leaf />,
  headset: () => <Headset />,
  wallet: () => <Wallet />,
  "hand-heart": () => <HandHeart />,
  clock: () => <Clock />,
};

// ── 4 istniejące ikony z TrustBar.tsx ──

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

// ── 6 nowych ikon (ten sam język wizualny) ──

// Duża gwiazda z mniejszą złotą w środku.
function StarBadge() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M52 10l12.4 25.2 27.8 4-20.1 19.6 4.7 27.7L52 73.4 27.2 86.5l4.7-27.7L11.8 39.2l27.8-4L52 10z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M52 38l5.4 11 12.1 1.7-8.7 8.5 2 12L52 65.5l-10.8 5.7 2-12-8.7-8.5 12.1-1.7 5.4-11z" stroke={GOLD} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

// Liść ze złotą żyłką.
function Leaf() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M20 84C20 44 48 20 88 20c0 40-24 68-64 68" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M26 78C42 62 58 46 80 28" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Słuchawki ze złotym mikrofonem.
function Headset() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M20 62v-8a32 32 0 0 1 64 0v8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <rect x="14" y="58" width="14" height="24" rx="6" stroke="currentColor" strokeWidth="5" />
      <rect x="76" y="58" width="14" height="24" rx="6" stroke="currentColor" strokeWidth="5" />
      <path d="M83 82v2a10 10 0 0 1-10 10H62" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
      <circle cx="58" cy="94" r="4" fill={GOLD} />
    </svg>
  );
}

// Portfel ze złotym zapięciem.
function Wallet() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <rect x="14" y="30" width="76" height="50" rx="8" stroke="currentColor" strokeWidth="5" />
      <path d="M14 44h76" stroke="currentColor" strokeWidth="5" />
      <rect x="64" y="52" width="26" height="16" rx="5" stroke={GOLD} strokeWidth="4" />
      <circle cx="77" cy="60" r="3" fill={GOLD} />
    </svg>
  );
}

// Dłoń ze złotym sercem.
function HandHeart() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <path d="M18 70h14l12 8h20a6 6 0 0 0 0-12H50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 92h18l16 6 30-10" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 40c-7-12 7-21 12-11 5-10 19-1 12 11-4 7-12 11-12 11s-8-4-12-11z" stroke={GOLD} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

// Zegar ze złotymi wskazówkami.
function Clock() {
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" fill="none" aria-hidden>
      <circle cx="52" cy="52" r="40" stroke="currentColor" strokeWidth="5" />
      <path d="M52 30v22l16 10" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
