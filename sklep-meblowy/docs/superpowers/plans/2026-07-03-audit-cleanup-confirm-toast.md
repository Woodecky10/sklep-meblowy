# Audit cleanup (confirm dialogs + toasts + dead code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić natywne `confirm()`/`alert()` własnym, spójnym systemem (promise-owy `useConfirm` + `ConfirmDialog`; toasty przez `useToast`) i usunąć martwy `secure-compare`.

**Architecture:** Jeden `ConfirmProvider` (w root layout) trzyma stan i renderuje jeden `ConfirmDialog`; eksponuje `useConfirm()` → `confirm(opts): Promise<boolean>`, dzięki czemu migracja 16 miejsc jest niemal drop-in (`if (!(await confirm({...}))) return;`). `ConfirmDialog` używa istniejącego a11y-hooka `useModal`. Alerty informacyjne idą przez istniejący globalny `useToast`.

**Tech Stack:** Next.js 16 App Router, React 19, istniejące `useModal`/`useToast`/dictionaries, Vitest.

## Global Constraints

- **Promise-owy `useConfirm()` zwraca bezpośrednio `confirm`** (jak `useToast()` → `showToast`). Wywołanie: `if (!(await confirm({ message, danger: true }))) return;`. Zamknięcie bez wyboru (Escape/tło/„Anuluj"/X) = `false`.
- **`ConfirmProvider` i `ConfirmDialog` klienckie**, montowane w `app/layout.tsx` obok `ToastProvider` → działają w sklepie i adminie.
- **Etykiety domyślne ze słownika** (`t.common.confirm`/`cancel`/`confirmTitle`) — lokalizacja PL/DE automatyczna; caller może nadpisać `title`/`confirmLabel`/`cancelLabel`. `danger` = czerwony przycisk potwierdzenia.
- **Poza zakresem (YAGNI):** konsolidacja `_shared`, zmiana `window.prompt` w RichTextEditor, `CartToast`, admin `ToastView`.
- **Testy:** komponenty klienckie bez unit-testów (wzorzec repo) — lint + istniejące testy + build + Playwright (wizualnie dialog) + smoke.
- **Commity: celowany `git add <ścieżki>`** — nigdy `git add -A`. Gałąź `feat/confirm-toast-cleanup` (spec zacommitowany). Copy: admin PL, klient PL/DE. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Struktura plików

- **Nowe:** `app/_context/ConfirmContext.tsx` (`ConfirmProvider` + `useConfirm` + typ `ConfirmOptions`); `app/_components/ui/ConfirmDialog.tsx`.
- **Edycja:** `app/_lib/dictionaries/pl.ts` + `de.ts` (klucze `common`); `app/layout.tsx` (mount); 2 pliki z `alert`; 16 plików z `confirm`.
- **Usunięte:** `app/_lib/secure-compare.ts`, `app/_lib/__tests__/secure-compare.test.ts`.

---

### Task 1: Infrastruktura potwierdzeń (ConfirmProvider + ConfirmDialog + słownik + mount)

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts` (typ `common` + wartości), `app/_lib/dictionaries/de.ts` (wartości `common`)
- Create: `app/_context/ConfirmContext.tsx`, `app/_components/ui/ConfirmDialog.tsx`
- Modify: `app/layout.tsx` (mount `ConfirmProvider`)

**Interfaces:**
- Produces:
  - `type ConfirmOptions = { message: string; title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }`
  - `useConfirm(): (opts: ConfirmOptions) => Promise<boolean>`
  - `ConfirmProvider` (mount w layout)
  - słownikowe `t.common.confirm` / `t.common.cancel` / `t.common.confirmTitle`

- [ ] **Step 1: Słownik — dodaj klucze `common` (typ + PL + DE)**

W `app/_lib/dictionaries/pl.ts`: w **typie** `common` (obecnie kończy się `browseShop: string;`) dodaj trzy pola:
```ts
    browseShop: string;
    confirm: string;
    cancel: string;
    confirmTitle: string;
```
W **wartościach** `common` w pl.ts (blok zaczynający się `common: { loading: "Ładowanie…", ...`) dodaj:
```ts
    confirm: "Potwierdź",
    cancel: "Anuluj",
    confirmTitle: "Potwierdzenie",
```
W `app/_lib/dictionaries/de.ts`, w bloku `common`, dodaj odpowiedniki:
```ts
    confirm: "Bestätigen",
    cancel: "Abbrechen",
    confirmTitle: "Bestätigung",
```

- [ ] **Step 2: `ConfirmDialog` (na useModal)**

Utwórz `app/_components/ui/ConfirmDialog.tsx`:
```tsx
"use client";

import { useRef } from "react";
import { useModal } from "@/app/_lib/useModal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { ConfirmOptions } from "@/app/_context/ConfirmContext";

// Dialog potwierdzenia — czysty layout (tytuł + treść + Anuluj/Potwierdź) na
// współdzielonym a11y-hooku useModal (scroll-lock, Escape, focus-trap). z-[110]
// nad Modal (100) i toastami (70). whitespace-pre-line dla komunikatów z \n.
export default function ConfirmDialog({
  open,
  opts,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = getDictionary(useClientLocale());
  const ref = useRef<HTMLDivElement>(null);
  useModal(open, { onClose: onCancel, containerRef: ref, trapFocus: true });

  if (!open) return null;

  const title = opts.title ?? t.common.confirmTitle;
  const confirmLabel = opts.confirmLabel ?? t.common.confirm;
  const cancelLabel = opts.cancelLabel ?? t.common.cancel;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col gap-5 p-6"
      >
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            {title}
          </p>
          <p className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line">
            {opts.message}
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 font-sans font-semibold text-sm uppercase tracking-widest rounded-full text-white transition-colors ${
              opts.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--color-navy)] hover:bg-[var(--color-gold)]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `ConfirmContext` (provider + promise-owy hook)**

Utwórz `app/_context/ConfirmContext.tsx`:
```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmDialog from "@/app/_components/ui/ConfirmDialog";

export type ConfirmOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm musi być użyte wewnątrz <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: ConfirmOptions }>({
    open: false,
    opts: { message: "" },
  });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const settle = useCallback((result: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
    r?.(result);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // Nowe wywołanie w trakcie otwartego dialogu: poprzednie → false.
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, opts });
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        opts={state.opts}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
```

(Cykl importów jest tylko type-only w kierunku ConfirmDialog→Context — bezpieczny.)

- [ ] **Step 4: Mount `ConfirmProvider` w layout**

W `app/layout.tsx` dodaj import (obok `ToastProvider`, linia 12):
```tsx
import { ConfirmProvider } from "./_context/ConfirmContext";
```
Owiń zawartość wewnątrz `<ToastProvider>` w `<ConfirmProvider>`. Zmień (obecnie linie 85-96):
```tsx
                <ToastProvider>
                  <HideOnAdmin>
                    <TopBar />
                    <Navbar />
                  </HideOnAdmin>
                  <main className="flex-1">{children}</main>
                  <HideOnAdmin>
                    <Footer />
                    <CookieBanner />
                  </HideOnAdmin>
                  <CartToast />
                </ToastProvider>
```
na:
```tsx
                <ToastProvider>
                  <ConfirmProvider>
                    <HideOnAdmin>
                      <TopBar />
                      <Navbar />
                    </HideOnAdmin>
                    <main className="flex-1">{children}</main>
                    <HideOnAdmin>
                      <Footer />
                      <CookieBanner />
                    </HideOnAdmin>
                    <CartToast />
                  </ConfirmProvider>
                </ToastProvider>
```

- [ ] **Step 5: Weryfikacja lint + build**

Run: `npm run lint && npm run build`
Expected: lint czysty; build EXIT 0. (Dialog renderuje się `null` gdy zamknięty; nikt jeszcze nie woła `useConfirm` — to OK.)

- [ ] **Step 6: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_context/ConfirmContext.tsx "app/_components/ui/ConfirmDialog.tsx" app/layout.tsx
git commit -m "feat(ui): promise-owy useConfirm + ConfirmDialog (infra)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Alerty → toast + usunięcie martwego kodu

**Files:**
- Modify: `app/admin/produkty/DeleteProductButton.tsx`, `app/admin/produkty/[id]/RichTextEditor.tsx`
- Delete: `app/_lib/secure-compare.ts`, `app/_lib/__tests__/secure-compare.test.ts`

**Interfaces:**
- Consumes: `useToast` (`@/app/_context/ToastContext`, `showToast(message, type?)`).

- [ ] **Step 1: `DeleteProductButton` — alert → toast**

W `app/admin/produkty/DeleteProductButton.tsx`: dodaj import `import { useToast } from "@/app/_context/ToastContext";`, w komponencie `const showToast = useToast();`. Zmień linię 40:
```tsx
      window.alert(`Nie udało się usunąć: ${res.error}`);
```
na:
```tsx
      showToast(`Nie udało się usunąć: ${res.error}`, "error");
```
(Uwaga: `window.confirm` w tym pliku, linia 26, migrujemy w Task 3 — tu zostaw.)

- [ ] **Step 2: `RichTextEditor` — 3× alert → toast**

W `app/admin/produkty/[id]/RichTextEditor.tsx`: dodaj `import { useToast } from "@/app/_context/ToastContext";` + `const showToast = useToast();` w komponencie. Zmień:
- linia 97: `window.alert("Upload nieudany: " + res.error);` → `showToast("Upload nieudany: " + res.error, "error");`
- linia 99: `window.alert("Brak URL po uploadzie");` → `showToast("Brak URL po uploadzie", "error");`
- linia 136: `window.alert("Dozwolone tylko linki http(s):, mailto: lub tel:");` → `showToast("Dozwolone tylko linki http(s):, mailto: lub tel:", "error");`
(`window.prompt` na linii ~129 zostaje — poza zakresem.)

- [ ] **Step 3: Usuń martwy `secure-compare`**

Najpierw potwierdź brak importerów:
Run: `grep -rn "secure-compare\|safeCompareSecret" app/`
Expected: tylko `app/_lib/secure-compare.ts` i `app/_lib/__tests__/secure-compare.test.ts`. Jeśli tak — usuń oba pliki:
```bash
git rm app/_lib/secure-compare.ts app/_lib/__tests__/secure-compare.test.ts
```
(Jeśli grep pokaże inny importer — NIE usuwaj, zgłoś.)

- [ ] **Step 4: Weryfikacja lint + test + build**

Run: `npm run lint && npm test && npm run build`
Expected: lint czysty; testy PASS (liczba spadnie o testy secure-compare); build EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/DeleteProductButton.tsx "app/admin/produkty/[id]/RichTextEditor.tsx" app/_lib/secure-compare.ts app/_lib/__tests__/secure-compare.test.ts
git commit -m "fix(admin): alert() → toast; usunięcie martwego secure-compare

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Migracja 16× `confirm()` → `useConfirm`

**Files (16):** patrz tabela poniżej.

**Interfaces:**
- Consumes: `useConfirm` (Task 1). Import: `import { useConfirm } from "@/app/_context/ConfirmContext";`.

**Wzorzec migracji (dla każdego pliku):**
1. Dodaj import `useConfirm` i w komponencie `const confirm = useConfirm();` (na górze, zgodnie z regułami hooków — NIE w handlerze).
2. Handler zawierający `confirm(...)` uczyń `async` (np. `async function handleX()` / `onClick={async () => ...}`).
3. Zamień wywołanie:
   - `if (!window.confirm(MSG)) return;` → `if (!(await confirm({ message: MSG, danger: true }))) return;`
   - `const ok = window.confirm(MSG); ... if (!ok) return;` → `const ok = await confirm({ message: MSG, danger: true }); ... if (!ok) return;`
   - `if (!confirm(MSG)) return;` (bare, ReviewForm) → `if (!(await confirm({ message: MSG, danger: true }))) return;`
   MSG = dokładnie dotychczasowy argument (template literal z interpolacją zostaje 1:1).
Etykiety przycisków biorą się z domyślnych (`t.common.*`) — lokalizacja automatyczna; nie trzeba nic dodawać per-site.

**Tabela miejsc** (plik : obecna linia — `danger`):

| # | Plik | ~linia | danger | Uwaga |
|---|------|-------|--------|-------|
| 1 | `app/konto/zamowienia/CancelOrderButton.tsx` | 31 | true | kliencki; MSG = `c.confirm` |
| 2 | `app/admin/zapytania/InquiriesList.tsx` | 226 | true | |
| 3 | `app/_components/ui/ReviewForm.tsx` | 85 | true | kliencki; bare `confirm`; MSG = `c.confirmDelete` |
| 4 | `app/admin/tkaniny/FabricsEditor.tsx` | 119 | true | MSG = template z `${f.name}` |
| 5 | `app/admin/polecane/FeaturedEditor.tsx` | 343 | true | |
| 6 | `app/admin/zamowienia/[id]/OrderControls.tsx` | 175 | true | `const ok = window.confirm(...)` (wieloliniowy MSG z `\n`) |
| 7 | `app/admin/slider/SliderEditor.tsx` | 311 | true | |
| 8 | `app/admin/kategorie/KategorieEditor.tsx` | 570 | true | MSG = zmienna `confirmMessage` |
| 9 | `app/admin/kafelki/TilesEditor.tsx` | 291 | true | |
| 10 | `app/admin/kolekcje/CollectionsEditor.tsx` | 189 | true | |
| 11 | `app/admin/kody-rabatowe/PromoEditor.tsx` | 201 | true | |
| 12 | `app/admin/produkty/DeleteProductButton.tsx` | 26 | true | `const ok = window.confirm(...)` (wieloliniowy) |
| 13 | `app/admin/reklamacje/ReklamacjeList.tsx` | 198 | true | |
| 14 | `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` | 78 | true | |
| 15 | `app/admin/produkty/[id]/SizeGroupEditor.tsx` | 96 | **false** | scalenie grup (nie usuwanie); `const ok = window.confirm(...)` |
| 16 | `app/admin/produkty/[id]/VariantsEditor.tsx` | 62 | true | |

- [ ] **Step 1: Zmigruj wszystkie 16 miejsc wg wzorca i tabeli**

Otwórz każdy plik, znajdź `confirm(...)` (linie orientacyjne — mogły się przesunąć), zastosuj wzorzec. Zachowaj `danger` z tabeli (15 = false, reszta = true). Komunikaty 1:1.

- [ ] **Step 2: Weryfikacja — brak natywnych confirm + lint/test/build**

Run: `grep -rn "window.confirm" app/ ; grep -rnE "[^.]\bconfirm\(" app/ | grep -v "useConfirm\|await confirm\|=> confirm\|(opts: ConfirmOptions)"`
Expected: **zero** `window.confirm`; jedyne `confirm(` to wywołania `await confirm({...})` i definicja w ConfirmContext. `window.prompt` (RichTextEditor) zostaje — to nie confirm.
Run: `npm run lint && npm test && npm run build`
Expected: lint czysty; testy PASS; build EXIT 0.

- [ ] **Step 3: Smoke (deferowany — kontroler/użytkownik)**

Playwright/przeglądarka: otwórz kliencki dialog (np. usuwanie recenzji / anulowanie zamówienia) — wygląda spójnie, „Anuluj" zamyka bez akcji, „Potwierdź" (czerwony przy `danger`) wykonuje; kilka admin-owych (usuń slajd/kafelek/kod) działa i anuluje.

- [ ] **Step 4: Commit**

```bash
git add app/konto/zamowienia/CancelOrderButton.tsx app/admin/zapytania/InquiriesList.tsx "app/_components/ui/ReviewForm.tsx" app/admin/tkaniny/FabricsEditor.tsx app/admin/polecane/FeaturedEditor.tsx "app/admin/zamowienia/[id]/OrderControls.tsx" app/admin/slider/SliderEditor.tsx app/admin/kategorie/KategorieEditor.tsx app/admin/kafelki/TilesEditor.tsx app/admin/kolekcje/CollectionsEditor.tsx app/admin/kody-rabatowe/PromoEditor.tsx app/admin/produkty/DeleteProductButton.tsx app/admin/reklamacje/ReklamacjeList.tsx "app/admin/produkty/[id]/DescriptionSectionsEditor.tsx" "app/admin/produkty/[id]/SizeGroupEditor.tsx" "app/admin/produkty/[id]/VariantsEditor.tsx"
git commit -m "fix(ui): natywny confirm() → useConfirm/ConfirmDialog (16 miejsc)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (autor planu)

**1. Pokrycie spec:**
- Promise-owy `useConfirm` + jeden `ConfirmDialog` (na useModal) + mount w layout → Task 1. ✅
- Etykiety ze słownika (PL/DE) + `danger` → Task 1 (dict + dialog). ✅
- Migracja 16 confirm (2 klienckie zlokalizowane + 14 admin) → Task 3 (tabela, `danger` per-site; 15=merge=false). ✅
- 4 alert→toast (globalny useToast) → Task 2. ✅
- Usunięcie martwego secure-compare (+ test) po grep-potwierdzeniu → Task 2. ✅
- Poza zakresem (_shared, prompt, CartToast, admin ToastView) → nietykane. ✅
- Zamknięcie bez wyboru = false; „ostatni wygrywa" → ConfirmProvider (`settle(false)`, resolver reset). ✅
- Testy: bez unit dla komponentów; lint/test/build + Playwright wizualnie + smoke. ✅

**2. Placeholdery:** brak — pełny kod infry, dokładne linie i komunikaty migracji, komendy weryfikacji. ✅

**3. Spójność typów:** `ConfirmOptions` i `useConfirm(): (opts) => Promise<boolean>` zdefiniowane w Task 1, konsumowane identycznie w Task 3; `ConfirmDialog` props (`open/opts/onConfirm/onCancel`) spójne między Task 1 Step 2 a Step 3; `t.common.confirm/cancel/confirmTitle` dodane (Task 1 Step 1) i użyte w ConfirmDialog. `showToast(message, type)` zgodne z ToastContext. ✅
