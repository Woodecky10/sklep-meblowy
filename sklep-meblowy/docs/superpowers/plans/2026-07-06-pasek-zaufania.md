# Pasek zaufania — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sekcja zaufania (4 atuty) odtworzona 1:1 w HTML/CSS z grafik `docs/grafika-zaufanie-sklepu*.png`, osadzona na karcie produktu (pod opisem), stronie głównej (z nagłówkiem) i w stopce (poza kartami produktu).

**Architecture:** Jeden server component `TrustBar` (ikony inline SVG, kolory ze zmiennych motywu + wariant `onNavy` dla zawsze-granatowej stopki), teksty ze słowników PL/DE. Strony są wspólne dla PL i `/de` (prefiks w middleware, `await getLocale()`), więc każde umiejscowienie to jedna zmiana. Stopka dostaje client wrapper chowający pasek na kartach produktu (czysta funkcja `isProductPath`).

**Tech Stack:** Next.js 16 App Router (server components), Tailwind v4 (dark = klasa `.dark`), vitest, Playwright (weryfikacja side-by-side z PNG).

**Spec:** `docs/superpowers/specs/2026-07-06-pasek-zaufania-design.md`
**Wzorce wierności:** `docs/grafika-zaufanie-sklepu.png` (jasny+nagłówek), `docs/grafika-zaufanie-sklepu-granat.png` (ciemny+nagłówek), `docs/grafika-zaufanie-sklepu-cream-bez-naglowka.png`, `docs/grafika-zaufanie-sklepu-granat-bez-naglowka.png`.

## Global Constraints

- Teksty słownikowe DOKŁADNIE wg tabeli w spec (PL: „MEBLE Z CHARAKTEREM", „Dlaczego warto kupować u nas?", „Polski producent", „Gwarancja jakości", „Darmowa dostawa", „na terenie całej Polski", „2 lata gwarancji", „0 zł"; DE: „MÖBEL MIT CHARAKTER", „Warum bei uns kaufen?", „Polnischer Hersteller", „Qualitätsgarantie", „Kostenlose Lieferung", „in ganz Polen", „2 Jahre Garantie", „0 zł") + słowo w tarczy: PL „LATA" / DE „JAHRE".
- Kolory WYŁĄCZNIE ze zmiennych motywu (`--fg`, `--muted`, `--border`, `--color-gold`, `--color-gold-text`); wariant `onNavy` używa stałych `#ECE4D7`/`white/60`/`white/15` (stopka jest zawsze granatowa).
- Zero nowych zależności npm; komentarze po polsku; PNG z `docs/` NIE trafiają do `public/` ani do runtime.
- Gałąź robocza: `feat/pasek-zaufania` (merge w Task 4; push kontem Woodecky10).
- Żadnych zapisów do produkcyjnej DB podczas weryfikacji.

---

### Task 1: Komponent `TrustBar` + słowniki

**Files:**
- Create: `app/_components/ui/TrustBar.tsx`
- Modify: `app/_lib/dictionaries/pl.ts` (typ `Dictionary` + wartości PL)
- Modify: `app/_lib/dictionaries/de.ts` (wartości DE)

**Interfaces:**
- Produces: `export default function TrustBar({ locale, withHeading?, onNavy? }: { locale: Locale; withHeading?: boolean; onNavy?: boolean })` — konsumowane przez Taski 2-3.
- Produces: sekcja słownika `t.trustBar` z kluczami: `eyebrow, heading, producer, quality, delivery, deliveryScope, warranty, iconFree, iconYears, iconYearsWord`.

- [ ] **Step 1: Słowniki.** W `app/_lib/dictionaries/pl.ts` dodaj do typu `Dictionary` nową sekcję (obok istniejących `home`/`product`/`footer` — trzymaj się stylu pliku):

```ts
  trustBar: {
    eyebrow: string;
    heading: string;
    producer: string;
    quality: string;
    delivery: string;
    deliveryScope: string;
    warranty: string;
    iconFree: string;
    iconYears: string;
    iconYearsWord: string;
  };
```

oraz wartości PL:

```ts
  // Pasek zaufania (TrustBar) — treści 1:1 z grafik docs/grafika-zaufanie-sklepu*.png
  trustBar: {
    eyebrow: "MEBLE Z CHARAKTEREM",
    heading: "Dlaczego warto kupować u nas?",
    producer: "Polski producent",
    quality: "Gwarancja jakości",
    delivery: "Darmowa dostawa",
    deliveryScope: "na terenie całej Polski",
    warranty: "2 lata gwarancji",
    iconFree: "0 zł",
    iconYears: "2",
    iconYearsWord: "LATA",
  },
```

W `app/_lib/dictionaries/de.ts` (TS wymusi komplet):

```ts
  trustBar: {
    eyebrow: "MÖBEL MIT CHARAKTER",
    heading: "Warum bei uns kaufen?",
    producer: "Polnischer Hersteller",
    quality: "Qualitätsgarantie",
    delivery: "Kostenlose Lieferung",
    deliveryScope: "in ganz Polen",
    warranty: "2 Jahre Garantie",
    iconFree: "0 zł",
    iconYears: "2",
    iconYearsWord: "JAHRE",
  },
```

- [ ] **Step 2: Komponent.** Utwórz `app/_components/ui/TrustBar.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

// Pasek zaufania „Dlaczego warto kupować u nas?" — HTML/CSS 1:1 z grafik
// docs/grafika-zaufanie-sklepu*.png (wzorzec wierności; PNG nie idą do runtime).
// Server component, zero JS klienta. Kolory ze zmiennych motywu → dark/light
// przełącza się samo. Wariant onNavy: stopka ma ZAWSZE granatowe tło, więc
// kontury są stałe kremowe (jak grafika granatowa), niezależnie od motywu.
const GOLD = "var(--color-gold)";

type Props = { locale: Locale; withHeading?: boolean; onNavy?: boolean };

export default function TrustBar({ locale, withHeading = false, onNavy = false }: Props) {
  const t = getDictionary(locale).trustBar;
  const ink = onNavy ? "text-[#ECE4D7]" : "text-[var(--fg)]";
  const muted = onNavy ? "text-white/60" : "text-[var(--muted)]";
  const divide = onNavy ? "lg:divide-white/15" : "lg:divide-[var(--border)]";

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
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
            {t.eyebrow}
          </p>
          <h2 className="font-display text-4xl font-bold">{t.heading}</h2>
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
```

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: wszystko zielone/exit 0 (typ Dictionary wymusza komplet DE — błąd kompilacji = brak klucza).

- [ ] **Step 4: Commit**

```bash
git add app/_components/ui/TrustBar.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(ui): TrustBar — pasek zaufania 1:1 z grafik (PL/DE, dark/light, onNavy)"
```

---

### Task 2: Umiejscowienia — strona główna i karta produktu

**Files:**
- Modify: `app/page.tsx` (między sekcją „Polecane" ~linia 172 a „Nasze kolekcje" ~174)
- Modify: `app/produkt/[id]/page.tsx` (po blokach opisu ~linia 317, przed `{/* Cross-sell */}` ~319)

**Interfaces:**
- Consumes: `TrustBar` z Task 1 (`import TrustBar from "@/app/_components/ui/TrustBar"` — w page.tsx ścieżka względna jak sąsiednie importy: `"./_components/ui/TrustBar"`).
- Obie strony mają już `const locale = await getLocale()` — użyj istniejącej zmiennej.

- [ ] **Step 1: Strona główna** — w `app/page.tsx`, bezpośrednio PO zamknięciu sekcji „Polecane" (`</section>` ~linia 172), PRZED komentarzem `{/* Nasze kolekcje ... */}` wstaw:

```tsx
      {/* Pasek zaufania — dlaczego warto kupować u nas (spec 2026-07-06) */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <TrustBar withHeading locale={locale} />
      </section>
```

- [ ] **Step 2: Karta produktu** — w `app/produkt/[id]/page.tsx`, PO obu blokach opisu (sekcje `visibleSections` ORAZ fallback legacy description — wstaw po drugim z nich), PRZED `{/* Cross-sell ... */}`:

```tsx
      {/* Pasek zaufania — atuty sklepu pod opisem produktu (spec 2026-07-06).
          Renderuje się też gdy produkt nie ma opisu — wtedy zaraz po sekcji głównej. */}
      <section className="mb-24">
        <TrustBar locale={locale} />
      </section>
```

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0. (Wstawki są renderowane bezwarunkowo — brak opisu ⇒ pasek po prostu następuje po sekcji głównej; to zamierzone.)

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx "app/produkt/[id]/page.tsx"
git commit -m "feat(sklep): pasek zaufania na stronie głównej (z nagłówkiem) i kartach produktów"
```

---

### Task 3: Stopka — `isProductPath` (TDD) + client wrapper + wpięcie

**Files:**
- Create: `app/_lib/routes.ts`
- Create: `app/_components/layout/FooterTrustBar.tsx`
- Modify: `app/_components/layout/Footer.tsx` (wewnątrz `<footer>`, przed głównym gridem ~linia 29)
- Test: `app/_lib/__tests__/routes.test.ts`

**Interfaces:**
- Consumes: `TrustBar` (Task 1), `stripLocale` z `@/app/_lib/i18n` (istnieje: `stripLocale(pathname) → { locale, pathname }`).
- Produces: `export function isProductPath(pathname: string): boolean`.

- [ ] **Step 1: Failing test** — `app/_lib/__tests__/routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isProductPath } from "@/app/_lib/routes";

describe("isProductPath — karty produktu (PL i /de)", () => {
  it("karta produktu PL", () => {
    expect(isProductPath("/produkt/abc-123")).toBe(true);
  });
  it("karta produktu DE", () => {
    expect(isProductPath("/de/produkt/abc-123")).toBe(true);
  });
  it("inne strony — false", () => {
    expect(isProductPath("/")).toBe(false);
    expect(isProductPath("/sklep")).toBe(false);
    expect(isProductPath("/de")).toBe(false);
    expect(isProductPath("/de/sklep")).toBe(false);
  });
  it("prefiksy podobne — false (admin, sam /produkt bez id)", () => {
    expect(isProductPath("/admin/produkty/abc")).toBe(false);
    expect(isProductPath("/produkt")).toBe(false);
    expect(isProductPath("/produkty")).toBe(false);
  });
});
```

- [ ] **Step 2: Czerwone** — Run: `npx vitest run app/_lib/__tests__/routes.test.ts` → FAIL (brak modułu).

- [ ] **Step 3: Implementacja** — `app/_lib/routes.ts`:

```ts
import { stripLocale } from "./i18n";

// Czy ścieżka to karta produktu (PL lub /de)? Stopka chowa tam pasek zaufania
// (FooterTrustBar), bo karta ma własny egzemplarz pod opisem — bez dublowania.
export function isProductPath(pathname: string): boolean {
  return stripLocale(pathname).pathname.startsWith("/produkt/");
}
```

`app/_components/layout/FooterTrustBar.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isProductPath } from "@/app/_lib/routes";

// Widoczność paska zaufania w stopce: wszędzie POZA kartami produktu (tam
// jest już pod opisem). Children = zrenderowany serwerowo <TrustBar> — ten
// wrapper tylko decyduje o pokazaniu, TrustBar zostaje server componentem.
export default function FooterTrustBar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isProductPath(pathname)) return null;
  return <>{children}</>;
}
```

W `app/_components/layout/Footer.tsx`: dodaj importy
(`import FooterTrustBar from "./FooterTrustBar";`,
`import TrustBar from "../ui/TrustBar";`) i wewnątrz `<footer className="bg-[var(--color-navy)] text-white">`, PRZED istniejącym `<div className="max-w-7xl mx-auto px-6 py-16 grid ...">` wstaw:

```tsx
      {/* Pasek zaufania — nad treścią stopki; ukryty na kartach produktu (dubel). */}
      <FooterTrustBar>
        <div className="max-w-7xl mx-auto px-6 pt-16 pb-4">
          <TrustBar locale={locale} onNavy />
        </div>
      </FooterTrustBar>
```

- [ ] **Step 4: Zielone + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: testy PASS (w tym nowe), exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/routes.ts app/_lib/__tests__/routes.test.ts app/_components/layout/FooterTrustBar.tsx app/_components/layout/Footer.tsx
git commit -m "feat(stopka): pasek zaufania nad stopką (poza kartami produktu)"
```

---

### Task 4: Weryfikacja wizualna side-by-side + integracja

**Files:** skrypty tymczasowe w scratchpadzie sesji (poza repo).

**Interfaces:**
- Consumes: lokalny build; wzorce `docs/grafika-zaufanie-sklepu*.png`; produkt do podglądu: `2b00686f-137c-43e9-ab14-528597f2d3a2` (Sofa Montes).

- [ ] **Step 1: Build + serwer** — `npm run build`, `npx next start -p 3210` (tło, poll do 200).

- [ ] **Step 2: Zrzuty (Playwright, viewport 1440×1000):**
1. Strona główna, motyw jasny: screenshot sekcji TrustBar (element z nagłówkiem) → porównaj z `docs/grafika-zaufanie-sklepu.png`.
2. Strona główna, motyw ciemny: `document.documentElement.classList.add("dark")` przed zrzutem → porównaj z `docs/grafika-zaufanie-sklepu-granat.png`.
3. Karta produktu (Montes), jasny: sekcja bez nagłówka → `...cream-bez-naglowka.png`.
4. Dowolna strona nie-produktowa (np. `/sklep`): stopka zawiera pasek (granatowy wariant). Karta produktu: stopka BEZ paska (jest tylko pod opisem).
5. `/de`: nagłówek „Warum bei uns kaufen?", etykiety DE, tarcza „2 JAHRE".

Oceń zgodność względem wzorców: układ 4 kolumn + separatory, proporcje ikon, kolory (granat/krem/złoto), typografia (serif nagłówek/PL, sans etykiety), checkboxy. **Rozjazdy → popraw TrustBar.tsx i powtórz zrzut** (iteracja wierności jest częścią tego taska; commituj poprawki jako `fix(ui): TrustBar — wierność do grafiki`).

- [ ] **Step 3: Merge + deploy + prod:**

```bash
git checkout main && git merge --no-ff feat/pasek-zaufania -m "Merge branch 'feat/pasek-zaufania'"
git push origin main
# po ~2,5 min (bez pętli — rate-limit):
curl -s -o /dev/null -w "%{http_code}" https://www.mollien.pl/            # 200
curl -s "https://www.mollien.pl/" | grep -c "Dlaczego warto kupować u nas"  # >=1
curl -s "https://www.mollien.pl/de" | grep -c "Warum bei uns kaufen"        # >=1
```
