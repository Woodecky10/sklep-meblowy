# Guard niezapisanych zmian w panelu admina — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gdy admin edytuje dane w panelu i klika link wyjściowy bez zapisu, pojawia się dialog „Zostań / Zapisz i wyjdź / Wyjdź bez zapisywania"; zamknięcie karty daje natywny prompt przeglądarki.

**Architecture:** Jeden klientowy komponent `UnsavedChangesGuard` montowany w `AdminShell`, śledzący brudne jednostki (formularze auto-delegacją; 5 edytorów bez form przez atrybuty `data-guard-section`/`data-guard-save`). Czysta logika decyzyjna w osobnym module testowanym vitestem. „Zapisz i wyjdź" wyzwala natywne zapisy edytorów i czeka na ich zakończenie (migawka `disabled`).

**Tech Stack:** Next.js 16 App Router (client component), React 19 form actions, vitest, Playwright (weryfikacja lokalna).

**Spec:** `docs/superpowers/specs/2026-07-06-admin-unsaved-guard-design.md`

## Global Constraints

- Atrybuty DOM dokładnie: `data-guard-section`, `data-guard-save`, `data-guard-ignore`, `data-toast-type`.
- Teksty dialogu dokładnie: tytuł „Niezapisane zmiany", treść „Masz niezapisane zmiany. Co chcesz zrobić?", przyciski „Zostań" / „Zapisz i wyjdź" / „Wyjdź bez zapisywania".
- Wykluczenia dirty: `input[type=file]`, elementy wewnątrz `[data-guard-ignore]`.
- Poll zapisu: co 150 ms, timeout 10 000 ms, koniec po 2 kolejnych odczytach bez świeżo-zablokowanych przycisków.
- Zero nowych zależności npm. Komentarze w kodzie po polsku (konwencja repo).
- Przycisk „wstecz" przeglądarki poza zakresem.
- Przed napisaniem kodu przeczytaj konwencje repo: `AGENTS.md` (Next 16 — czytaj `node_modules/next/dist/docs/` przy wątpliwościach co do API).

---

### Task 1: Czysta logika decyzyjna `unsaved-guard-core.ts` (TDD)

**Files:**
- Create: `app/_lib/unsaved-guard-core.ts`
- Test: `app/_lib/__tests__/unsaved-guard-core.test.ts`

**Interfaces (Produces):**
```ts
export type DirtyTargetInfo = {
  isFileInput: boolean;   // target to input[type=file]
  inIgnored: boolean;     // target ma przodka [data-guard-ignore]
  unitKind: "form" | "section" | null; // najbliższa jednostka śledzenia
};
export function shouldMarkDirty(info: DirtyTargetInfo): boolean;

export type LinkClickInfo = {
  sameOrigin: boolean;    // URL linku ma origin strony
  samePageHash: boolean;  // ta sama ścieżka + hash (kotwica)
  modifier: boolean;      // ctrl/meta/shift/alt
  targetBlank: boolean;
  hasDownload: boolean;
  mainButton: boolean;    // lewy przycisk myszy
};
export function shouldInterceptLink(info: LinkClickInfo, dirtyCount: number): boolean;

export type SettleState = { consecutiveIdle: number; elapsedMs: number };
export const SETTLE_INTERVAL_MS = 150;
export const SETTLE_TIMEOUT_MS = 10_000;
// Zwraca nowy stan + settled (2 kolejne odczyty idle) + timedOut (elapsed >= timeout)
export function nextSettleState(
  prev: SettleState,
  anyStillSaving: boolean
): { state: SettleState; settled: boolean; timedOut: boolean };

export function decideAfterSave(info: {
  errorToastVisible: boolean;
  anyStillDirty: boolean;
  timedOut: boolean;
}): "leave" | "stay";
```

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/unsaved-guard-core.test.ts
import { describe, it, expect } from "vitest";
import {
  shouldMarkDirty,
  shouldInterceptLink,
  nextSettleState,
  decideAfterSave,
  SETTLE_INTERVAL_MS,
  SETTLE_TIMEOUT_MS,
} from "@/app/_lib/unsaved-guard-core";

describe("shouldMarkDirty", () => {
  it("pole w formularzu → brudne", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: "form" })).toBe(true);
  });
  it("pole w sekcji data-guard-section → brudne", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: "section" })).toBe(true);
  });
  it("input[type=file] → nigdy (upload zapisuje się sam)", () => {
    expect(shouldMarkDirty({ isFileInput: true, inIgnored: false, unitKind: "form" })).toBe(false);
  });
  it("wewnątrz [data-guard-ignore] → nie (wyszukiwarki)", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: true, unitKind: "form" })).toBe(false);
  });
  it("poza jakąkolwiek jednostką → nie", () => {
    expect(shouldMarkDirty({ isFileInput: false, inIgnored: false, unitKind: null })).toBe(false);
  });
});

const baseLink = {
  sameOrigin: true,
  samePageHash: false,
  modifier: false,
  targetBlank: false,
  hasDownload: false,
  mainButton: true,
};

describe("shouldInterceptLink", () => {
  it("wewnętrzny link + brudno → przechwyć", () => {
    expect(shouldInterceptLink(baseLink, 1)).toBe(true);
  });
  it("czysto → nie przechwytuj", () => {
    expect(shouldInterceptLink(baseLink, 0)).toBe(false);
  });
  it("inny origin → nie (beforeunload to złapie)", () => {
    expect(shouldInterceptLink({ ...baseLink, sameOrigin: false }, 1)).toBe(false);
  });
  it("kotwica na tej samej stronie → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, samePageHash: true }, 1)).toBe(false);
  });
  it("ctrl/meta (nowa karta) → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, modifier: true }, 1)).toBe(false);
  });
  it("target=_blank → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, targetBlank: true }, 1)).toBe(false);
  });
  it("download → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, hasDownload: true }, 1)).toBe(false);
  });
  it("środkowy przycisk myszy → nie", () => {
    expect(shouldInterceptLink({ ...baseLink, mainButton: false }, 1)).toBe(false);
  });
});

describe("nextSettleState", () => {
  it("zapis trwa → zeruje licznik idle, dodaje czas", () => {
    const r = nextSettleState({ consecutiveIdle: 1, elapsedMs: 0 }, true);
    expect(r.state.consecutiveIdle).toBe(0);
    expect(r.state.elapsedMs).toBe(SETTLE_INTERVAL_MS);
    expect(r.settled).toBe(false);
    expect(r.timedOut).toBe(false);
  });
  it("dwa kolejne odczyty idle → settled", () => {
    const r1 = nextSettleState({ consecutiveIdle: 0, elapsedMs: 300 }, false);
    expect(r1.settled).toBe(false);
    const r2 = nextSettleState(r1.state, false);
    expect(r2.settled).toBe(true);
  });
  it("przekroczenie timeoutu → timedOut", () => {
    const r = nextSettleState({ consecutiveIdle: 0, elapsedMs: SETTLE_TIMEOUT_MS }, true);
    expect(r.timedOut).toBe(true);
  });
});

describe("decideAfterSave", () => {
  it("wszystko zapisane, brak błędów → leave", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: false, timedOut: false })).toBe("leave");
  });
  it("toast błędu → stay (użytkownik widzi błąd)", () => {
    expect(decideAfterSave({ errorToastVisible: true, anyStillDirty: false, timedOut: false })).toBe("stay");
  });
  it("jednostka nadal brudna (walidacja zatrzymała submit) → stay", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: true, timedOut: false })).toBe("stay");
  });
  it("timeout → stay (bez nawigacji w ciemno)", () => {
    expect(decideAfterSave({ errorToastVisible: false, anyStillDirty: false, timedOut: true })).toBe("stay");
  });
});
```

- [ ] **Step 2: Uruchom test — ma nie przejść (brak modułu)**

Run: `npx vitest run app/_lib/__tests__/unsaved-guard-core.test.ts`
Expected: FAIL — "Cannot find module ... unsaved-guard-core" / testy czerwone.

- [ ] **Step 3: Zaimplementuj moduł**

```ts
// app/_lib/unsaved-guard-core.ts
// Czysta logika guarda niezapisanych zmian panelu admina — bez DOM, testowalna
// vitestem w node. Komponent UnsavedChangesGuard (app/admin) ekstrahuje fakty
// z DOM/zdarzeń do tych struktur i deleguje decyzje tutaj.
// Spec: docs/superpowers/specs/2026-07-06-admin-unsaved-guard-design.md

export type DirtyTargetInfo = {
  isFileInput: boolean;
  inIgnored: boolean;
  unitKind: "form" | "section" | null;
};

// Edycja oznacza jednostkę jako brudną tylko gdy: leży w jednostce śledzenia,
// nie jest uploadem pliku (zapisuje się sam) i nie leży w [data-guard-ignore]
// (wyszukiwarki, auto-zapisujące się sekcje).
export function shouldMarkDirty(info: DirtyTargetInfo): boolean {
  return info.unitKind !== null && !info.isFileInput && !info.inIgnored;
}

export type LinkClickInfo = {
  sameOrigin: boolean;
  samePageHash: boolean;
  modifier: boolean;
  targetBlank: boolean;
  hasDownload: boolean;
  mainButton: boolean;
};

// Przechwytujemy tylko zwykłą nawigację lewym przyciskiem do wewnętrznego URL.
// Nowa karta / download / kotwica nie porzucają stanu strony; obcy origin
// łapie beforeunload.
export function shouldInterceptLink(info: LinkClickInfo, dirtyCount: number): boolean {
  return (
    dirtyCount > 0 &&
    info.sameOrigin &&
    !info.samePageHash &&
    !info.modifier &&
    !info.targetBlank &&
    !info.hasDownload &&
    info.mainButton
  );
}

export const SETTLE_INTERVAL_MS = 150;
export const SETTLE_TIMEOUT_MS = 10_000;

export type SettleState = { consecutiveIdle: number; elapsedMs: number };

// Zapis „ustał", gdy 2 kolejne odczyty nie widzą świeżo-zablokowanych
// przycisków (edytory blokują przyciski na czas useTransition).
export function nextSettleState(
  prev: SettleState,
  anyStillSaving: boolean
): { state: SettleState; settled: boolean; timedOut: boolean } {
  const state: SettleState = {
    consecutiveIdle: anyStillSaving ? 0 : prev.consecutiveIdle + 1,
    elapsedMs: prev.elapsedMs + SETTLE_INTERVAL_MS,
  };
  return {
    state,
    settled: state.consecutiveIdle >= 2,
    timedOut: prev.elapsedMs >= SETTLE_TIMEOUT_MS,
  };
}

// Po „Zapisz i wyjdź": nawigujemy tylko gdy zapisy zakończone bez błędu.
// Toast błędu / niedokończona walidacja / timeout → zostajemy, żeby użytkownik
// widział co się stało (bez nawigacji w ciemno).
export function decideAfterSave(info: {
  errorToastVisible: boolean;
  anyStillDirty: boolean;
  timedOut: boolean;
}): "leave" | "stay" {
  if (info.errorToastVisible || info.anyStillDirty || info.timedOut) return "stay";
  return "leave";
}
```

- [ ] **Step 4: Testy zielone**

Run: `npx vitest run app/_lib/__tests__/unsaved-guard-core.test.ts`
Expected: PASS (wszystkie).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/unsaved-guard-core.ts app/_lib/__tests__/unsaved-guard-core.test.ts
git commit -m "feat(admin): czysta logika guarda niezapisanych zmian (core + testy)"
```

---

### Task 2: Komponent `UnsavedChangesGuard` + montaż w AdminShell

**Files:**
- Create: `app/admin/UnsavedChangesGuard.tsx`
- Modify: `app/admin/AdminShell.tsx` (montaż, ~1 linia + import)

**Interfaces:**
- Consumes: cały moduł `app/_lib/unsaved-guard-core` z Task 1 (dokładne sygnatury tam).
- Consumes: `useModal` z `app/_lib/useModal` — `useModal(open, { onClose, containerRef, trapFocus: true })` (wzorzec z `app/_components/ui/ConfirmDialog.tsx`).
- Produces: `<UnsavedChangesGuard />` — client component bez propsów, montowany raz w AdminShell.

Uwaga dla implementera: `AdminShell.tsx` to `"use client"`; guard montujemy na
końcu głównego kontenera (`<div className="min-h-screen bg-[var(--bg)] lg:flex">`),
obok istniejących dzieci. Dialog stylizuj IDENTYCZNIE jak
`app/_components/ui/ConfirmDialog.tsx` (przeczytaj go przed pisaniem): overlay
`fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm`, karta
`max-w-sm bg-[var(--card-bg)] border rounded-2xl p-6`, role="alertdialog".

- [ ] **Step 1: Napisz komponent**

```tsx
// app/admin/UnsavedChangesGuard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useModal } from "@/app/_lib/useModal";
import {
  shouldMarkDirty,
  shouldInterceptLink,
  nextSettleState,
  decideAfterSave,
  SETTLE_INTERVAL_MS,
  type SettleState,
} from "@/app/_lib/unsaved-guard-core";

// Guard niezapisanych zmian panelu admina. Delegacja zdarzeń na document:
// - input/change wewnątrz <form> lub [data-guard-section] → jednostka brudna
//   (poza input[type=file] i [data-guard-ignore]);
// - submit formularza / klik [data-guard-save] → jednostka czysta;
// - klik wewnętrznego <a> przy brudnym stanie → dialog Zostań / Zapisz i wyjdź /
//   Wyjdź bez zapisywania;
// - beforeunload (zamknięcie karty/reload) → natywny prompt przeglądarki.
// Spec: docs/superpowers/specs/2026-07-06-admin-unsaved-guard-design.md
export default function UnsavedChangesGuard() {
  const router = useRouter();
  const pathname = usePathname();
  // Brudne jednostki jako elementy DOM (form lub kontener sekcji). Ref, nie
  // state — zmiany nie mają renderować; render tylko dla dialogu.
  const dirtyRef = useRef<Set<Element>>(new Set());
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Zmiana strony w panelu unieważnia jednostki poprzedniej strony.
  useEffect(() => {
    dirtyRef.current.clear();
  }, [pathname]);

  useEffect(() => {
    // Najbliższa jednostka śledzenia dla celu zdarzenia.
    function unitOf(target: Element): { unit: Element; kind: "form" | "section" } | null {
      const form = target.closest("form");
      if (form) return { unit: form, kind: "form" };
      const section = target.closest("[data-guard-section]");
      if (section) return { unit: section, kind: "section" };
      return null;
    }

    function onEdit(e: Event) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const found = unitOf(target);
      const info = {
        isFileInput: target instanceof HTMLInputElement && target.type === "file",
        inIgnored: target.closest("[data-guard-ignore]") !== null,
        unitKind: found?.kind ?? null,
      };
      if (shouldMarkDirty(info) && found) dirtyRef.current.add(found.unit);
    }

    // Submit czyści formularz (optymistycznie — błąd zapisu pokazuje toast edytora).
    function onSubmit(e: Event) {
      if (e.target instanceof Element) dirtyRef.current.delete(e.target);
    }

    function onClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;

      // Klik przycisku zapisu sekcji → sekcja czysta.
      const saveBtn = target.closest("[data-guard-save]");
      if (saveBtn) {
        const section = saveBtn.closest("[data-guard-section]");
        if (section) dirtyRef.current.delete(section);
        return;
      }

      // Przechwycenie wewnętrznego linku przy brudnym stanie.
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      let sameOrigin = false;
      let samePageHash = false;
      try {
        const url = new URL(anchor.href, window.location.href);
        sameOrigin = url.origin === window.location.origin;
        samePageHash =
          url.pathname === window.location.pathname && url.hash.length > 0;
      } catch {
        return; // niepoprawny URL — nie ruszamy
      }
      const info = {
        sameOrigin,
        samePageHash,
        modifier: e.ctrlKey || e.metaKey || e.shiftKey || e.altKey,
        targetBlank: anchor.target === "_blank",
        hasDownload: anchor.hasAttribute("download"),
        mainButton: e.button === 0,
      };
      if (!shouldInterceptLink(info, dirtyRef.current.size)) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(anchor.getAttribute("href"));
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current.size > 0) e.preventDefault();
    }

    // Capture: submit nie bąbelkuje po preventDefault Reacta; click łapiemy
    // przed routerem Next Linka.
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  function leaveWithoutSaving() {
    if (!pendingHref) return;
    dirtyRef.current.clear();
    const href = pendingHref;
    setPendingHref(null);
    router.push(href);
  }

  // „Zapisz i wyjdź": wyzwól natywne zapisy edytorów, czekaj aż ustaną
  // (migawka disabled eliminuje przyciski zablokowane z innych powodów),
  // nawiguj tylko przy czystym sukcesie (bez toastu błędu / resztek dirty).
  async function saveAndLeave() {
    if (!pendingHref || saving) return;
    setSaving(true);
    const units = Array.from(dirtyRef.current);

    const enabledButtons = new Map<Element, Element[]>();
    for (const unit of units) {
      enabledButtons.set(
        unit,
        Array.from(unit.querySelectorAll("button:not([disabled])"))
      );
    }
    for (const unit of units) {
      if (unit instanceof HTMLFormElement) {
        unit.requestSubmit(); // odpala walidację natywną + akcję edytora
      } else {
        const btn = unit.querySelector("[data-guard-save]");
        if (btn instanceof HTMLElement) btn.click();
      }
    }

    const anyStillSaving = () =>
      units.some((unit) =>
        (enabledButtons.get(unit) ?? []).some(
          (b) => b.isConnected && (b as HTMLButtonElement).disabled
        )
      );

    let settle: SettleState = { consecutiveIdle: 0, elapsedMs: 0 };
    let outcome: { settled: boolean; timedOut: boolean };
    do {
      await new Promise((r) => setTimeout(r, SETTLE_INTERVAL_MS));
      const next = nextSettleState(settle, anyStillSaving());
      settle = next.state;
      outcome = next;
    } while (!outcome.settled && !outcome.timedOut);

    const decision = decideAfterSave({
      errorToastVisible: document.querySelector('[data-toast-type="error"]') !== null,
      anyStillDirty: dirtyRef.current.size > 0,
      timedOut: outcome.timedOut,
    });
    setSaving(false);
    if (decision === "leave") {
      leaveWithoutSaving();
    } else {
      setPendingHref(null); // zostań — użytkownik widzi toast/walidację
    }
  }

  return (
    <UnsavedDialog
      open={pendingHref !== null}
      saving={saving}
      onStay={() => setPendingHref(null)}
      onSaveAndLeave={saveAndLeave}
      onLeave={leaveWithoutSaving}
    />
  );
}

// Dialog 3-przyciskowy — layout i a11y jak ConfirmDialog (useModal: scroll-lock,
// Escape → Zostań, focus-trap). Panel admina jest polskojęzyczny — teksty PL.
function UnsavedDialog({
  open,
  saving,
  onStay,
  onSaveAndLeave,
  onLeave,
}: {
  open: boolean;
  saving: boolean;
  onStay: () => void;
  onSaveAndLeave: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(open, { onClose: onStay, containerRef: ref, trapFocus: true });

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-modal="true"
      aria-label="Niezapisane zmiany"
      aria-describedby="unsaved-dialog-message"
      onClick={saving ? undefined : onStay}
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col gap-5 p-6"
      >
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Niezapisane zmiany
          </p>
          <p id="unsaved-dialog-message" className="text-sm text-[var(--fg)] leading-relaxed">
            Masz niezapisane zmiany. Co chcesz zrobić?
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={onStay}
            disabled={saving}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Zostań
          </button>
          <button
            type="button"
            onClick={onLeave}
            disabled={saving}
            className="px-5 py-2.5 font-sans text-sm uppercase tracking-widest rounded-full text-red-600 border border-red-300 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            Wyjdź bez zapisywania
          </button>
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={saving}
            className="px-5 py-2.5 font-sans font-semibold text-sm uppercase tracking-widest rounded-full text-white bg-[var(--color-navy)] hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {saving ? "Zapisuję..." : "Zapisz i wyjdź"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Zamontuj w AdminShell**

W `app/admin/AdminShell.tsx`: dodaj import i wstaw `<UnsavedChangesGuard />`
zaraz po otwarciu głównego kontenera:

```tsx
import UnsavedChangesGuard from "./UnsavedChangesGuard";
// ...
  return (
    <div className="min-h-screen bg-[var(--bg)] lg:flex">
      <UnsavedChangesGuard />
      {/* reszta bez zmian */}
```

- [ ] **Step 3: Typecheck + pełne testy**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, wszystkie testy zielone.

- [ ] **Step 4: Commit**

```bash
git add app/admin/UnsavedChangesGuard.tsx app/admin/AdminShell.tsx
git commit -m "feat(admin): guard niezapisanych zmian — komponent + montaż w AdminShell"
```

---

### Task 3: Atrybuty — ToastView, 5 sekcji, 2 ignore

**Files:**
- Modify: `app/admin/_shared.tsx` (ToastView, ~linia 62)
- Modify: `app/admin/ustawienia/SettingsForm.tsx` (kontener ~linia 26, przycisk „Zapisz kurs" ~linia 44)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (kontener główny return, przycisk „Zapisz warianty" ~linia 320)
- Modify: `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` (kontener, przycisk „Zapisz sekcje" ~linia 223)
- Modify: `app/admin/produkty/[id]/TranslationEditor.tsx` (kontener, przycisk „Zapisz tłumaczenie DE" ~linia 306)
- Modify: `app/admin/produkty/[id]/DescriptionFieldEditor.tsx` (kontener, przycisk „Zapisz opis" ~linia 62)
- Modify: `app/admin/produkty/[id]/SizeGroupEditor.tsx` (kontener główny ~linia 125 → `data-guard-ignore`)
- Modify: `app/admin/zamowienia/page.tsx` (formularz szukajki ~linia 65 → `data-guard-ignore`)

**Interfaces:**
- Consumes: semantyka atrybutów z Task 2 (`data-guard-section` = jednostka, `data-guard-save` = JEDEN główny przycisk zapisu sekcji, `data-guard-ignore` = wyłączenie poddrzewa).

- [ ] **Step 1: ToastView — atrybut typu toastu**

W `app/admin/_shared.tsx` na głównym divie ToastView dodaj `data-toast-type`:

```tsx
    <div
      role="status"
      data-toast-type={toast.type}
      className={`fixed top-24 right-6 z-50 ...`}  /* className BEZ ZMIAN */
```

- [ ] **Step 2: Sekcje — 5 edytorów**

W każdym z 5 edytorów: na NAJWYŻSZYM kontenerze zwracanym przez komponent dodaj
`data-guard-section`, a na głównym przycisku zapisu (dokładnie jednym per
sekcja) `data-guard-save`. Wzór (SettingsForm):

```tsx
    <div data-guard-section className="bg-[var(--card-bg)] border ...">  {/* reszta className bez zmian */}
      {/* ... */}
        <button
          type="button"
          data-guard-save
          /* reszta propsów bez zmian */
        >
          {saving ? "Zapisuję..." : "Zapisz kurs"}
        </button>
```

Analogicznie:
- `VariantsEditor.tsx`: kontener return + przycisk „Zapisz warianty" (~320).
- `DescriptionSectionsEditor.tsx`: kontener return + przycisk „Zapisz sekcje" (~223). UWAGA: edytor ma własny banner „niezapisane zmiany" — nie ruszać, to niezależny UX.
- `TranslationEditor.tsx`: kontener return + przycisk „Zapisz tłumaczenie DE" (~306).
- `DescriptionFieldEditor.tsx`: kontener return + przycisk „Zapisz opis" (~62).

Jeśli któryś edytor renderuje kilka przycisków „Zapisz…" (np. w trybie edycji
wiersza), `data-guard-save` dostaje TYLKO główny przycisk zapisu całej sekcji.

- [ ] **Step 3: Ignore — SizeGroupEditor i szukajka zamówień**

`SizeGroupEditor.tsx` (~linia 125) — kontener główny (etykiety zapisują się na
blur, drugi input to wyszukiwarka):

```tsx
    <div data-guard-ignore className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
```

`app/admin/zamowienia/page.tsx` (~linia 65) — formularz szukajki:

```tsx
      <form action="/admin/zamowienia" data-guard-ignore className="flex gap-2 max-w-lg">
```

- [ ] **Step 4: Typecheck + testy + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: wszystko zielone, build exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/_shared.tsx app/admin/ustawienia/SettingsForm.tsx "app/admin/produkty/[id]/VariantsEditor.tsx" "app/admin/produkty/[id]/DescriptionSectionsEditor.tsx" "app/admin/produkty/[id]/TranslationEditor.tsx" "app/admin/produkty/[id]/DescriptionFieldEditor.tsx" "app/admin/produkty/[id]/SizeGroupEditor.tsx" app/admin/zamowienia/page.tsx
git commit -m "feat(admin): atrybuty guarda — data-toast-type, 5 sekcji, 2 ignore"
```

---

### Task 4: Weryfikacja end-to-end (Playwright, lokalny build produkcyjny)

**Files:**
- Scratchpad script (poza repo): `verify-guard.js` w katalogu scratchpad sesji.

**Interfaces:**
- Consumes: działający panel admina lokalnie. UWAGA: wymaga zalogowanego
  admina — jeśli logowanie w skrypcie niemożliwe (Supabase auth), zweryfikuj
  ręcznie flow lub użyj istniejącego wzorca logowania z `e2e/` (przeczytaj
  `playwright.local.config.ts` i `e2e/*.spec.ts` czy jest tam auth-helper).

- [ ] **Step 1: Zbuduj i uruchom lokalnie**

```bash
npm run build
npx next start -p 3042   # w tle
```

- [ ] **Step 2: Scenariusze (Playwright lub ręcznie w przeglądarce)**

1. `/admin/produkty/<id>` → wpisz coś w pole „Nazwa" → klik „Produkty" w
   sidebarze → dialog „Niezapisane zmiany" widoczny; klik „Zostań" → zostajesz,
   wpisana wartość nienaruszona.
2. To samo → „Wyjdź bez zapisywania" → nawigacja na listę, wartość porzucona
   (po powrocie stara nazwa).
3. To samo → „Zapisz i wyjdź" → nawigacja na listę, a po powrocie nowa nazwa
   zapisana (weryfikacja w DB przez UI).
4. Sekcja bez form: edytuj coś w „Tłumaczenie DE" → klik sidebar → dialog jest.
   Klik „Zapisz tłumaczenie DE" ręcznie → klik sidebar → dialogu NIE ma.
5. `/admin/zamowienia` → wpisz frazę w szukajkę (bez Enter) → klik sidebar →
   dialogu NIE ma (`data-guard-ignore`).
6. Wpisz coś w pole produktu → submit „Zapisz podstawowe dane" → po sukcesie
   klik sidebar → dialogu NIE ma.

Expected: wszystkie 6 scenariuszy zgodnie z opisem.

- [ ] **Step 3: Zatrzymaj serwer, finalny commit dokumentacji planu (checkboxy)**

```bash
git add docs/superpowers/plans/2026-07-06-admin-unsaved-guard.md
git commit -m "docs(admin): plan guarda niezapisanych zmian — wykonany"
```

---

### Task 5: Integracja (merge → deploy → weryfikacja prod)

Konwencje sesji/projektu:

- [ ] Merge do main bez fast-forward i push (konto **Woodecky10** — domyślne
  mwlo1403 dostaje 403; `gh auth switch --user Woodecky10`):

```bash
git checkout main && git merge --no-ff feat/admin-unsaved-guard -m "Merge branch 'feat/admin-unsaved-guard'"
git push origin main
```

- [ ] Po ~2,5 min sprawdź zdrowie prod (bez pętli — rate-limit Vercela):
  `curl -s -o /dev/null -w "%{http_code}" https://www.mollien.pl/` → 200 oraz
  `/admin` → 200/307 (redirect logowania OK).
