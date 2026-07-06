# Sticky header + przycisk „powrót na górę" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cały header sklepu (TopBar + Navbar) przyklejony do góry przy scrollu + pływający przycisk powrotu na samą górę w prawym dolnym rogu.

**Architecture:** Naprawa istniejącego sticky (łamanego przez `overflow-x: hidden` na html/body — zamiana na `clip`), wspólny sticky wrapper na TopBar+Navbar w root layout, nowy client component `BackToTop` (scroll listener + smooth scrollTo), korekta pozycji CartToast pod wyższy przyklejony header.

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind v4 (zmienne motywu `--color-navy`/`--color-gold`/`--bg`), słowniki PL/DE typowane w `pl.ts`.

**Spec:** `docs/superpowers/specs/2026-07-06-sticky-header-back-to-top-design.md`

## Global Constraints

- To jest Next.js 16.2.4 z breaking changes — przy wątpliwościach czytać `node_modules/next/dist/docs/` (AGENTS.md).
- Wszystkie teksty widoczne/aria przez słowniki PL/DE (`getDictionary`), klient: `getDictionary(useClientLocale())`.
- Kolory wyłącznie ze zmiennych motywu (dark/light przełącza się samo).
- Panel admina bez chrome'u sklepu — nowe elementy montować wewnątrz `<HideOnAdmin>`.
- Komentarze po polsku, w stylu istniejących (wyjaśniają „dlaczego", nie „co").

---

### Task 1: Sticky header (naprawa overflow + wspólny wrapper)

**Files:**
- Modify: `app/globals.css:45-48`
- Modify: `app/layout.tsx:90-93`
- Modify: `app/_components/layout/Navbar.tsx:55`

**Interfaces:**
- Consumes: istniejące `TopBar`, `Navbar`, `HideOnAdmin` (renderuje fragment — nie psuje sticky).
- Produces: sticky wrapper `<div className="sticky top-0 z-50">` w layoucie; header o łącznej wysokości ~132px (TopBar h-9 = 36px + Navbar h-24 = 96px) — Task 2 zakłada tę wysokość przy pozycji CartToast.

- [ ] **Step 1: globals.css — `hidden` → `clip`**

W `app/globals.css` zamień (linie 45-48):

```css
html,
body {
  overflow-x: hidden;
}
```

na:

```css
/* clip zamiast hidden: tak samo ucina poziomy scroll, ale nie robi z
   html/body scroll-containera — hidden łamał position:sticky headera. */
html,
body {
  overflow-x: clip;
}
```

- [ ] **Step 2: layout.tsx — sticky wrapper na TopBar+Navbar**

W `app/layout.tsx` zamień:

```tsx
                    <HideOnAdmin>
                      <TopBar />
                      <Navbar />
                    </HideOnAdmin>
```

na:

```tsx
                    <HideOnAdmin>
                      {/* Wspólny sticky na oba paski — jeden element zamiast
                          dwóch osobnych sticky eliminuje 1px szczeliny przy
                          ułamkowym zoomie. */}
                      <div className="sticky top-0 z-50">
                        <TopBar />
                        <Navbar />
                      </div>
                    </HideOnAdmin>
```

- [ ] **Step 3: Navbar.tsx — sticky schodzi z headera**

W `app/_components/layout/Navbar.tsx` (linia 55) zamień:

```tsx
    <header className="sticky top-0 z-50 bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
```

na:

```tsx
    <header className="bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
```

- [ ] **Step 4: typecheck + testy**

Run: `npx tsc --noEmit` → brak błędów.
Run: `npm run test` → 406 passed (bez zmian — task nie dotyka logiki).

- [ ] **Step 5: smoke na dev serwerze**

Run: `npm run dev` (background), potem:

```bash
curl -s http://localhost:3000/ | grep -c 'sticky top-0 z-50'
```

Expected: `1` (wrapper w HTML). Wizualna weryfikacja scrolla w Task 2 Step 8 (jeden przebieg dla obu tasków).

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx app/_components/layout/Navbar.tsx
git commit -m "fix(sklep): sticky header naprawiony (overflow-x clip) i objety caly TopBar+Navbar"
```

---

### Task 2: BackToTop + słowniki + korekta CartToast

**Files:**
- Create: `app/_components/layout/BackToTop.tsx`
- Modify: `app/_lib/dictionaries/pl.ts:228` (typ) i `:538` (wartości — po `productImageDialog`)
- Modify: `app/_lib/dictionaries/de.ts:240` (po `productImageDialog`)
- Modify: `app/layout.tsx` (montaż w drugim `<HideOnAdmin>`)
- Modify: `app/_components/layout/CartToast.tsx:47`

**Interfaces:**
- Consumes: `getDictionary` z `@/app/_lib/dictionaries`, `useClientLocale` z `@/app/_lib/useClientLocale` (wzorzec jak w `ConfirmDialog.tsx`), sticky header ~132px z Task 1.
- Produces: `export default function BackToTop()` — bez propsów; klucz słownika `a11y.backToTop`.

- [ ] **Step 1: klucz `a11y.backToTop` w słownikach**

`app/_lib/dictionaries/pl.ts` — w TYPIE (po `productImageDialog: string;`, linia ~228):

```ts
    productImageDialog: string;
    backToTop: string;
```

W wartościach PL (po `productImageDialog: "Zdjęcie produktu",`, linia ~538):

```ts
    productImageDialog: "Zdjęcie produktu",
    backToTop: "Wróć na górę",
```

`app/_lib/dictionaries/de.ts` (po `productImageDialog: "Produktbild",`, linia ~240):

```ts
    productImageDialog: "Produktbild",
    backToTop: "Zurück nach oben",
```

- [ ] **Step 2: typecheck potwierdza parytet**

Run: `npx tsc --noEmit` → brak błędów (typ `Dictionary` wymusza komplet kluczy w obu językach).

- [ ] **Step 3: komponent BackToTop**

Create `app/_components/layout/BackToTop.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getDictionary } from "@/app/_lib/dictionaries";
import { useClientLocale } from "@/app/_lib/useClientLocale";

// Pływający przycisk powrotu na górę. Zawsze zamontowany — widoczność
// sterowana klasami (opacity + pointer-events), więc SSR i pierwsza klatka
// klienta renderują to samo (ukryty) i nie ma hydration mismatch, a
// pojawianie się jest animowane zamiast skokowe.
const SHOW_AFTER_PX = 600;

export default function BackToTop() {
  const t = getDictionary(useClientLocale());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t.a11y.backToTop}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-4 sm:right-6 z-40 w-12 h-12 rounded-full bg-[var(--color-navy)] text-white shadow-lg flex items-center justify-center transition-all duration-300 hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: montaż w layout.tsx**

Import w `app/layout.tsx`:

```tsx
import BackToTop from "./_components/layout/BackToTop";
```

W drugim `<HideOnAdmin>` (obok stopki):

```tsx
                    <HideOnAdmin>
                      <Footer />
                      <CookieBanner />
                      <BackToTop />
                    </HideOnAdmin>
```

- [ ] **Step 5: CartToast pod wyższy header**

W `app/_components/layout/CartToast.tsx` (linia 47) zamień `top-28` na `top-36` (header sticky ma teraz ~132px: 36px TopBar + 96px Navbar; 144px = tuż pod nim).

- [ ] **Step 6: typecheck + testy**

Run: `npx tsc --noEmit` → brak błędów.
Run: `npm run test` → 406 passed.

- [ ] **Step 7: smoke markupu**

Dev serwer z Task 1 nadal działa; sprawdź:

```bash
curl -s http://localhost:3000/ | grep -c 'aria-label="Wróć na górę"'
curl -s http://localhost:3000/de | grep -c 'aria-label="Zurück nach oben"'
```

Expected: po `1` na każdej stronie (przycisk w HTML, ukryty klasami).

- [ ] **Step 8: weryfikacja wizualna (verify skill / przeglądarka)**

Scroll w dół na `/` i na karcie produktu: (a) TopBar+Navbar przyklejone u góry, dropdowny kategorii działają po scrollu; (b) przycisk ↑ pojawia się po ~600px, klik płynnie wraca na górę; (c) dark mode — kolory poprawne; (d) toast koszyka (dodaj produkt) nie nachodzi na header.

- [ ] **Step 9: Commit**

```bash
git add app/_components/layout/BackToTop.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/layout.tsx app/_components/layout/CartToast.tsx
git commit -m "feat(sklep): przycisk powrotu na gore + toast koszyka pod sticky headerem"
```
