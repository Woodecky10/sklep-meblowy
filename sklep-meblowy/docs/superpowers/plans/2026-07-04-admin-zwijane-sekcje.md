# Zwijane sekcje edytora produktu (admin) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać zwijanie każdej sekcji edytora produktu (`/admin/produkty/[id]`) z zapamiętywaniem stanu w localStorage, żeby ograniczyć przewijanie.

**Architecture:** Czysty moduł persystencji (`app/_lib/section-collapse.ts`, testowalny w node) + wspólny komponent `CollapsibleSection` (w `_shared.tsx`) renderujący dotychczasową kartę z klikalnym nagłówkiem. Sześć istniejących sekcji refaktorowanych na ten komponent.

**Tech Stack:** Next.js 16 (Turbopack), React (client components), TypeScript, Tailwind (zmienne CSS `--card-bg` itd.), Vitest (node env, bez jsdom), Playwright (e2e).

## Global Constraints

- Panel admina jest po polsku na twardo (bez i18n). Kopie po polsku.
- Brak jsdom w testach — logikę testujemy jako czyste funkcje (node env); komponenty React weryfikujemy przez `tsc` + dev/e2e.
- Konwencja testów: `describe`/`it` po polsku ze strzałką `→`; testy w `app/_lib/__tests__/`.
- AGENTS.md: Next ma breaking changes — w razie wątpliwości o API czytać `node_modules/next/dist/docs/`. Ten plan nie używa API Next poza istniejącymi wzorcami komponentów klienckich.
- Wygląd kart bez zmian: `bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6`; nagłówek `font-display text-xl font-semibold text-[var(--fg)]`.
- Klucz localStorage: prefiks `admin.produkt.sekcja.` + `storageKey` sekcji. Klucze sekcji: `podstawowe`, `zdjecia`, `warianty`, `opis`, `sekcje-opisu`, `tlumaczenie-de`.
- Commity: konwencja repo, po polsku (`feat(admin): …`), stopka `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Gałąź: `feat/admin-zwijane-sekcje` (już utworzona; spec już zacommitowany).

---

### Task 1: Moduł persystencji `section-collapse.ts` (TDD)

**Files:**
- Create: `app/_lib/section-collapse.ts`
- Test: `app/_lib/__tests__/section-collapse.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  - `COLLAPSE_KEY_PREFIX: string` (= `"admin.produkt.sekcja."`)
  - `readCollapsed(storageKey: string): boolean` — true = zwinięte.
  - `writeCollapsed(storageKey: string, collapsed: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/section-collapse.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readCollapsed,
  writeCollapsed,
  COLLAPSE_KEY_PREFIX,
} from "@/app/_lib/section-collapse";

describe("section-collapse — persystencja localStorage", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    // Minimalny mock localStorage (node env nie ma go domyślnie).
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("readCollapsed → brak klucza = false (rozwinięte)", () => {
    expect(readCollapsed("warianty")).toBe(false);
  });

  it("readCollapsed → '1' = true (zwinięte)", () => {
    store[COLLAPSE_KEY_PREFIX + "warianty"] = "1";
    expect(readCollapsed("warianty")).toBe(true);
  });

  it("readCollapsed → '0' = false", () => {
    store[COLLAPSE_KEY_PREFIX + "warianty"] = "0";
    expect(readCollapsed("warianty")).toBe(false);
  });

  it("writeCollapsed → zapisuje '1'/'0' pod prefiksowanym kluczem", () => {
    writeCollapsed("zdjecia", true);
    expect(store[COLLAPSE_KEY_PREFIX + "zdjecia"]).toBe("1");
    writeCollapsed("zdjecia", false);
    expect(store[COLLAPSE_KEY_PREFIX + "zdjecia"]).toBe("0");
  });

  it("round-trip → write(true) potem read = true", () => {
    writeCollapsed("opis", true);
    expect(readCollapsed("opis")).toBe(true);
  });

  it("brak localStorage (SSR) → readCollapsed=false, writeCollapsed nie rzuca", () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(readCollapsed("x")).toBe(false);
    expect(() => writeCollapsed("x", true)).not.toThrow();
  });

  it("wyjątek storage (tryb prywatny) → readCollapsed=false, writeCollapsed nie rzuca", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readCollapsed("x")).toBe(false);
    expect(() => writeCollapsed("x", true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/section-collapse.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/section-collapse"` / `readCollapsed is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `app/_lib/section-collapse.ts`:

```ts
// Persystencja stanu zwinięcia sekcji edytora produktu w localStorage.
// Czyste funkcje (bez React) — testowalne w node env z mockiem localStorage.
// Klucz per sekcja (nie per produkt) → zwinięcie trzyma się przy kolejnych
// produktach. Wartość "1" = zwinięte, cokolwiek innego / brak = rozwinięte.

export const COLLAPSE_KEY_PREFIX = "admin.produkt.sekcja.";

export function readCollapsed(storageKey: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + storageKey) === "1";
  } catch {
    // storage niedostępny (tryb prywatny / wyłączony) → domyślnie rozwinięte
    return false;
  }
}

export function writeCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COLLAPSE_KEY_PREFIX + storageKey, collapsed ? "1" : "0");
  } catch {
    // storage niedostępny — ignorujemy (preferencja widoku, nie dane)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/section-collapse.test.ts`
Expected: PASS (7 testów).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/section-collapse.ts app/_lib/__tests__/section-collapse.test.ts
git commit -m "feat(admin): moduł persystencji zwinięcia sekcji (localStorage)"
```

---

### Task 2: Komponent `CollapsibleSection`

**Files:**
- Modify: `app/admin/produkty/[id]/_shared.tsx`

**Interfaces:**
- Consumes: `readCollapsed`, `writeCollapsed` z `@/app/_lib/section-collapse` (Task 1).
- Produces: `CollapsibleSection(props)` gdzie
  ```ts
  {
    title: string;
    storageKey: string;
    headerAside?: React.ReactNode;   // akcje po prawej nagłówka (widoczne też zwiniętym)
    bodyClassName?: string;          // domyślnie "flex flex-col gap-5"
    children: React.ReactNode;       // treść chowana gdy zwinięte
  }
  ```

Brak unit-testu: to komponent React, a repo nie ma jsdom. Weryfikacja przez `tsc` (ten task) oraz dev/e2e (Task 8).

- [ ] **Step 1: Dodać importy Reacta i modułu na górze `_shared.tsx`**

Plik zaczyna się od `"use client";` a potem `export { compressIfNeeded } ...`. Po linii `"use client";` dodać:

```ts
import { useEffect, useState } from "react";
import { readCollapsed, writeCollapsed } from "@/app/_lib/section-collapse";
```

- [ ] **Step 2: Dodać komponent na końcu `_shared.tsx`**

Dopisać na końcu pliku (po `IconBtn`):

```tsx
// Zwijana sekcja edytora produktu. Renderuje standardową kartę z klikalnym
// nagłówkiem (chevron + tytuł). Stan zapamiętywany w localStorage per storageKey
// (wspólnie dla wszystkich produktów). Start rozwinięty (SSR-safe); po
// zamontowaniu ustawiany zapamiętany stan (możliwe jednoklatkowe mignięcie —
// akceptowalne w adminie). headerAside pozostaje widoczne także po zwinięciu;
// klik w akcję w headerAside nie zwija sekcji (osobny element, nie przycisk toggle).
export function CollapsibleSection({
  title,
  storageKey,
  headerAside,
  bodyClassName = "flex flex-col gap-5",
  children,
}: {
  title: string;
  storageKey: string;
  headerAside?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed(storageKey));
  }, [storageKey]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      writeCollapsed(storageKey, next);
      return next;
    });
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 text-left group"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--muted)] transition-transform ${collapsed ? "" : "rotate-90"}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            {title}
          </h2>
        </button>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </div>
      {/* Ukrywamy przez CSS (display:none), NIE odmontowujemy — zachowuje stan
          niekontrolowanych pól (defaultValue) w sekcji „Podstawowe dane" przy
          zwinięciu/rozwinięciu. */}
      <div className={collapsed ? "hidden" : bodyClassName}>{children}</div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: brak błędów (exit 0).

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/[id]/_shared.tsx
git commit -m "feat(admin): komponent CollapsibleSection (zwijana karta sekcji)"
```

---

### Task 3: Refaktor `ProductEditor` — sekcje „Podstawowe dane" i „Zdjęcia produktu"

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx`

**Interfaces:**
- Consumes: `CollapsibleSection` (Task 2).

Zasada refaktoru (obowiązuje też w Task 4–7): `<h2>` → prop `title`; opisowy `<p>` przenieść do ciała (children) jako pierwszy element; elementy stojące OBOK tytułu (przyciski/akcje/badge) → `headerAside`; `<section class="…karta…">` → `<CollapsibleSection>`; `</section>` → `</CollapsibleSection>`.

- [ ] **Step 1: Dodać import**

W bloku importów (obok `import { Field, IconBtn, inputClass, type Toast } from "./_shared";`) rozszerzyć o `CollapsibleSection`:

```tsx
import { Field, IconBtn, inputClass, CollapsibleSection, type Toast } from "./_shared";
```

- [ ] **Step 2: Zamienić sekcję „Podstawowe dane"**

Zamienić otwarcie sekcji (obecnie linie ~129–132):

```tsx
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Podstawowe dane
        </h2>

        <form
```

na:

```tsx
      <CollapsibleSection title="Podstawowe dane" storageKey="podstawowe">
        <form
```

oraz odpowiadające zamknięcie tej sekcji (`</section>` po `</form>`, obecnie ~linia 300) na:

```tsx
      </CollapsibleSection>
```

- [ ] **Step 3: Zamienić sekcję „Zdjęcia produktu"**

Otwarcie sekcji „Zdjęcia" (obecnie ~305–325) ma nagłówek z opisem i przyciskiem uploadu w jednym flex-rowie. Zamienić fragment:

```tsx
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
              Zdjęcia produktu
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              Globalna galeria pokazywana na karcie produktu gdy klient nie wybrał wariantu
              ze zdjęciami. Możesz dodać kilka zdjęć naraz — wybierając wiele plików lub
              przeciągając je na galerię. Strzałkami ↑/↓ ustawiasz kolejność, ikoną kosza usuwasz.
            </p>
          </div>
          <label
            className={`shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer ${
              upload.uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {upload.progressText ?? "+ Dodaj zdjęcia"}
            <input {...upload.inputProps} className="hidden" />
          </label>
        </div>
```

na (przycisk uploadu → `headerAside`, opis → pierwszy element ciała):

```tsx
      <CollapsibleSection
        title="Zdjęcia produktu"
        storageKey="zdjecia"
        headerAside={
          <label
            className={`shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer ${
              upload.uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {upload.progressText ?? "+ Dodaj zdjęcia"}
            <input {...upload.inputProps} className="hidden" />
          </label>
        }
      >
        <p className="text-sm text-[var(--muted)] max-w-2xl">
          Globalna galeria pokazywana na karcie produktu gdy klient nie wybrał wariantu
          ze zdjęciami. Możesz dodać kilka zdjęć naraz — wybierając wiele plików lub
          przeciągając je na galerię. Strzałkami ↑/↓ ustawiasz kolejność, ikoną kosza usuwasz.
        </p>
```

oraz zamknięcie tej sekcji (`</section>` po bloku „Zapisz zdjęcia", obecnie ~402) na:

```tsx
      </CollapsibleSection>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/[id]/ProductEditor.tsx
git commit -m "feat(admin): zwijane sekcje Podstawowe dane i Zdjęcia w edytorze produktu"
```

---

### Task 4: Refaktor `VariantsEditor` (obie gałęzie renderu — ten sam `storageKey`)

**Files:**
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx`

**Interfaces:**
- Consumes: `CollapsibleSection` (Task 2).

- [ ] **Step 1: Dodać import**

`VariantsEditor` importuje z `./_shared` (m.in. `inputClass`, `IconBtn`). Rozszerzyć ten import o `CollapsibleSection` (dopisać do istniejącej listy importowanej z `"./_shared"`).

- [ ] **Step 2: Gałąź „bez wariantów" (`if (!variants)`)**

Zamienić otwarcie (obecnie ~353–361):

```tsx
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Warianty produktu
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Produkt nie ma wariantów. Stock jest zarządzany w polu &bdquo;Stan magazynowy&rdquo; wyżej.
          </p>
        </div>
```

na:

```tsx
      <CollapsibleSection title="Warianty produktu" storageKey="warianty" bodyClassName="flex flex-col gap-4">
        <p className="text-sm text-[var(--muted)]">
          Produkt nie ma wariantów. Stock jest zarządzany w polu &bdquo;Stan magazynowy&rdquo; wyżej.
        </p>
```

oraz zamknięcie tej gałęzi (`</section>` obecnie ~390) na `</CollapsibleSection>`.

- [ ] **Step 3: Gałąź „z wariantami" (drugi `return`)**

Zamienić otwarcie (obecnie ~395–414), przenosząc przycisk „Usuń warianty" do `headerAside`, a opis do ciała:

```tsx
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
              Warianty produktu
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
              Najpierw dodaj opcje (np. „Kolor”, „Strona”). Kombinacje generują się
              automatycznie z opcji × wartości. Dla każdej kombinacji ustaw stan i opcjonalnie
              zdjęcia — pokażą się klientowi po wybraniu wariantu.
            </p>
          </div>
          <button
            type="button"
            onClick={disableVariants}
            className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            Usuń warianty
          </button>
        </div>
```

na:

```tsx
      <CollapsibleSection
        title="Warianty produktu"
        storageKey="warianty"
        bodyClassName="flex flex-col gap-6"
        headerAside={
          <button
            type="button"
            onClick={disableVariants}
            className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            Usuń warianty
          </button>
        }
      >
        <p className="text-sm text-[var(--muted)] max-w-2xl">
          Najpierw dodaj opcje (np. „Kolor”, „Strona”). Kombinacje generują się
          automatycznie z opcji × wartości. Dla każdej kombinacji ustaw stan i opcjonalnie
          zdjęcia — pokażą się klientowi po wybraniu wariantu.
        </p>
```

oraz zamknięcie drugiego returnu (końcowe `</section>` funkcji) na `</CollapsibleSection>`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/[id]/VariantsEditor.tsx
git commit -m "feat(admin): zwijana sekcja Warianty (obie gałęzie renderu)"
```

---

### Task 5: Refaktor `DescriptionFieldEditor`

**Files:**
- Modify: `app/admin/produkty/[id]/DescriptionFieldEditor.tsx`

- [ ] **Step 1: Dodać import**

Zmienić `import type { Toast } from "./_shared";` na:

```tsx
import { CollapsibleSection, type Toast } from "./_shared";
```

- [ ] **Step 2: Zamienić wrapper sekcji**

Zamienić otwarcie (obecnie ~39–48):

```tsx
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Opis produktu
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
          Pokazywany na karcie produktu <strong>tylko gdy nie dodasz sekcji opisu
          poniżej</strong>. Jeśli używasz sekcji, to pole jest ignorowane.
        </p>
      </div>
```

na:

```tsx
    <CollapsibleSection title="Opis produktu" storageKey="opis" bodyClassName="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        Pokazywany na karcie produktu <strong>tylko gdy nie dodasz sekcji opisu
        poniżej</strong>. Jeśli używasz sekcji, to pole jest ignorowane.
      </p>
```

oraz końcowe `</section>` (~70) na `</CollapsibleSection>`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/[id]/DescriptionFieldEditor.tsx
git commit -m "feat(admin): zwijana sekcja Opis produktu"
```

---

### Task 6: Refaktor `DescriptionSectionsEditor`

**Files:**
- Modify: `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`

- [ ] **Step 1: Dodać import**

Dopisać do importów pliku:

```tsx
import { CollapsibleSection } from "./_shared";
```

(jeśli plik już importuje coś z `"./_shared"`, dołączyć `CollapsibleSection` do tej listy zamiast osobnej linii.)

- [ ] **Step 2: Zamienić wrapper sekcji**

Zamienić otwarcie (obecnie ~131–143):

```tsx
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Sekcje opisu produktu
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
          Wszystkie sekcje opisu są zarządzane <strong>tutaj</strong>.
          Sekcje pochodzące z dawnego importu możesz <strong>nadpisać</strong>
          (przycisk „Edytuj override”) albo ukryć.
          <br />
          Nowe treści dodajesz przyciskami „+ Własna sekcja” (tekst) i „+ Zdjęcie”.
        </p>
      </div>
```

na:

```tsx
    <CollapsibleSection title="Sekcje opisu produktu" storageKey="sekcje-opisu" bodyClassName="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        Wszystkie sekcje opisu są zarządzane <strong>tutaj</strong>.
        Sekcje pochodzące z dawnego importu możesz <strong>nadpisać</strong>
        (przycisk „Edytuj override”) albo ukryć.
        <br />
        Nowe treści dodajesz przyciskami „+ Własna sekcja” (tekst) i „+ Zdjęcie”.
      </p>
```

oraz końcowe `</section>` tej sekcji na `</CollapsibleSection>`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/[id]/DescriptionSectionsEditor.tsx
git commit -m "feat(admin): zwijana sekcja Sekcje opisu produktu"
```

---

### Task 7: Refaktor `TranslationEditor`

**Files:**
- Modify: `app/admin/produkty/[id]/TranslationEditor.tsx`

**Interfaces:** badge statusu DE → `headerAside` (widoczny także zwiniętym — informacja o stanie tłumaczenia).

- [ ] **Step 1: Dodać import**

Dopisać `CollapsibleSection` do importu z `"./_shared"` (plik używa `Field` z `_shared`, więc dołączyć do istniejącej listy).

- [ ] **Step 2: Zamienić wrapper sekcji**

Zamienić otwarcie (obecnie ~177–206):

```tsx
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Tłumaczenie niemieckie (DE)
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
            Treść pokazywana klientom w niemieckiej wersji sklepu. Wpisz ją
            <strong> ręcznie</strong> — także sekcje opisu (po lewej polska treść
            jako wzór do tłumaczenia). Puste pole = fallback do polskiej treści.
          </p>
        </div>
        {/* Status badge */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {initial.needs_translation ? (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
              DE: oczekuje na tłumaczenie
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
              DE: przetłumaczone
            </span>
          )}
          {translatedAtLabel && (
            <span className="text-[11px] text-[var(--muted)]">
              ostatnio: {translatedAtLabel}
            </span>
          )}
        </div>
      </div>
```

na:

```tsx
    <CollapsibleSection
      title="Tłumaczenie niemieckie (DE)"
      storageKey="tlumaczenie-de"
      headerAside={
        <div className="shrink-0 flex flex-col items-end gap-1">
          {initial.needs_translation ? (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
              DE: oczekuje na tłumaczenie
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
              DE: przetłumaczone
            </span>
          )}
          {translatedAtLabel && (
            <span className="text-[11px] text-[var(--muted)]">
              ostatnio: {translatedAtLabel}
            </span>
          )}
        </div>
      }
    >
      <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        Treść pokazywana klientom w niemieckiej wersji sklepu. Wpisz ją
        <strong> ręcznie</strong> — także sekcje opisu (po lewej polska treść
        jako wzór do tłumaczenia). Puste pole = fallback do polskiej treści.
      </p>
```

oraz końcowe `</section>` tej sekcji na `</CollapsibleSection>`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/[id]/TranslationEditor.tsx
git commit -m "feat(admin): zwijana sekcja Tłumaczenie DE (badge w nagłówku)"
```

---

### Task 8: Weryfikacja końcowa (lint, testy, tsc) + e2e (opcjonalnie)

**Files:**
- Create (opcjonalnie): `e2e/admin-collapse.spec.ts`

- [ ] **Step 1: Pełna weryfikacja statyczna i unit**

```bash
npx tsc --noEmit
npx eslint app/_lib/section-collapse.ts app/admin/produkty/[id]/_shared.tsx app/admin/produkty/[id]/ProductEditor.tsx app/admin/produkty/[id]/VariantsEditor.tsx app/admin/produkty/[id]/DescriptionFieldEditor.tsx app/admin/produkty/[id]/DescriptionSectionsEditor.tsx app/admin/produkty/[id]/TranslationEditor.tsx
npm test
```
Expected: `tsc` exit 0; `eslint` exit 0; vitest wszystkie zielone (dotychczasowe + 7 nowych z section-collapse).

- [ ] **Step 2: Smoke na dev serverze**

Uruchomić `npx next dev -p 3210` (w tle), zalogować się do `/admin`, wejść w dowolny produkt (`/admin/produkty/<id>`). Sprawdzić:
- każdy nagłówek sekcji klikalny; chevron obraca się; treść znika/pojawia się,
- „+ Dodaj zdjęcia" / „Usuń warianty" / badge DE widoczne w nagłówku i klik w nie NIE zwija sekcji,
- odświeżenie strony zachowuje zwinięcia,
- wejście w INNY produkt dziedziczy zwinięcia,
- zwinięcie sekcji NIE gubi niezapisanych zmian po rozwinięciu — dotyczy też niekontrolowanych pól „Podstawowe dane" (`defaultValue`), bo ciało jest ukrywane przez CSS (`display:none`), a nie odmontowywane. Test: wpisz coś w „Nazwa", zwiń sekcję, rozwiń — tekst zostaje.

- [ ] **Step 3 (opcjonalnie): Spec Playwright**

Jeśli dostępny `.env.e2e` z kontem admina — utworzyć `e2e/admin-collapse.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Wymaga zalogowanego admina (storageState z auth.setup) i istniejącego produktu.
// Sprawdza: klik nagłówka zwija sekcję, a stan przeżywa reload (localStorage).
test("edytor produktu — sekcja zwija się i pamięta stan po reloadzie", async ({ page }) => {
  await page.goto("/admin/produkty");
  const firstProduct = page.locator('a[href^="/admin/produkty/"]').first();
  await firstProduct.click();
  await expect(page).toHaveURL(/\/admin\/produkty\/[0-9a-f-]+/);

  const header = page.getByRole("button", { name: "Warianty produktu" });
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");

  await page.reload();
  const headerAfter = page.getByRole("button", { name: "Warianty produktu" });
  await expect(headerAfter).toHaveAttribute("aria-expanded", "false");
});
```

Uruchomienie (gdy jest `.env.e2e`): `E2E_BASE_URL=http://localhost:3210 npx playwright test e2e/admin-collapse.spec.ts`.
Jeśli brak `.env.e2e` — pominąć ten krok (weryfikacja ręczna w Step 2 wystarcza).

- [ ] **Step 4: Commit (jeśli powstał spec e2e)**

```bash
git add e2e/admin-collapse.spec.ts
git commit -m "test(admin): e2e zwijanych sekcji edytora produktu"
```

---

## Self-Review

**Spec coverage:**
- Decyzja „zapamiętywanie per sekcja, wspólne dla produktów" → Task 1 (klucz `prefix+storageKey`, bez id produktu) + Task 2 (`useEffect` czyta).
- `CollapsibleSection` (title/storageKey/headerAside/children) → Task 2 (dodano `bodyClassName` dla odstępów gap-4/5/6 — rozszerzenie zgodne ze spec „opcjonalny headerAside", udokumentowane).
- 6 sekcji, te same klucze → Task 3 (podstawowe, zdjecia), 4 (warianty ×2 gałęzie), 5 (opis), 6 (sekcje-opisu), 7 (tlumaczenie-de).
- „klik w akcję nie zwija" → Task 2 (headerAside poza przyciskiem toggle).
- Testy modułu (node env, mock localStorage) → Task 1. UI/e2e → Task 8.
- Nie-cele (brak „zwiń wszystkie", brak animacji, tylko edytor) → nie ma tasków dla nich.
- Znana konsekwencja mignięcia → udokumentowana w Task 2 (komentarz komponentu).

**Placeholder scan:** brak TBD/TODO; każdy krok z kodem ma kod; komendy z oczekiwanym wynikiem. Ciało sekcji ukrywane przez CSS (`display:none`), nie odmontowywane → brak utraty stanu niekontrolowanych pól (`defaultValue`) w „Podstawowe dane"; problem rozwiązany w projekcie, nie odłożony.

**Type consistency:** `readCollapsed`/`writeCollapsed`/`COLLAPSE_KEY_PREFIX` spójne między Task 1 (definicja) a Task 2 (użycie). `CollapsibleSection` propsy (`title`, `storageKey`, `headerAside`, `bodyClassName`, `children`) spójne między Task 2 (definicja) a Task 3–7 (użycie).
