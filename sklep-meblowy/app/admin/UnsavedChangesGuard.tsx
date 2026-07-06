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
//
// Odłączone jednostki: jeśli edytor został odmontowany bez zapisu (np. usunięty
// z DOM), jego element trafiony wcześniej do dirtyRef zostaje "osierocony" —
// pruneDetached() czyści takie wpisy przed każdą decyzją opartą o rozmiar zbioru.
function pruneDetached(set: Set<Element>) {
  for (const el of set) if (!el.isConnected) set.delete(el);
}

export default function UnsavedChangesGuard() {
  const router = useRouter();
  const pathname = usePathname();
  // Brudne jednostki jako elementy DOM (form lub kontener sekcji). Ref, nie
  // state — zmiany nie mają renderować; render tylko dla dialogu.
  const dirtyRef = useRef<Set<Element>>(new Set());
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Źródło prawdy dla domknięć pętli zapisu (state służy tylko do renderu
  // dialogu — patrz openDialog/closeDialog i komentarz przy saveAndLeave).
  const pendingHrefRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openDialog(href: string) {
    pendingHrefRef.current = href;
    setPendingHref(href);
  }
  function closeDialog() {
    pendingHrefRef.current = null;
    setPendingHref(null);
  }

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
      pruneDetached(dirtyRef.current);
      if (!shouldInterceptLink(info, dirtyRef.current.size)) return;
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute("href");
      if (href) openDialog(href);
    }

    function onBeforeUnload(e: BeforeUnloadEvent) {
      pruneDetached(dirtyRef.current);
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
    const href = pendingHrefRef.current;
    if (!href) return;
    dirtyRef.current.clear();
    closeDialog();
    router.push(href);
  }

  // „Zapisz i wyjdź": wyzwól natywne zapisy edytorów, czekaj aż ustaną
  // (migawka disabled eliminuje przyciski zablokowane z innych powodów),
  // nawiguj tylko przy czystym sukcesie (bez toastu błędu / resztek dirty).
  // Domknięcie tej pętli jest zamrożone na renderze, w którym powstało —
  // nie widzi PÓŹNIEJSZYCH setPendingHref. Dlatego intencja nawigacji jest
  // pilnowana przez pendingHrefRef (żywy, czytany na bieżąco) + token
  // hrefAtStart: nawigujemy po zakończeniu zapisu tylko jeśli ref wciąż
  // wskazuje na TEN SAM href, na który użytkownik kliknął „Zapisz i wyjdź".
  // „Zostań" (lub Escape) w trakcie zapisu robi closeDialog() → ref = null →
  // po ustaniu zapisu leaveWithoutSaving() jest no-opem (guard `if (!href)`).
  // Jeśli w międzyczasie otwarto NOWY dialog (inny link), ref wskazuje na
  // inny href niż hrefAtStart — stara pętla go nie nadpisuje ani nie nawiguje.
  async function saveAndLeave() {
    const hrefAtStart = pendingHrefRef.current;
    if (!hrefAtStart || saving) return;
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
      if (pendingHrefRef.current === hrefAtStart) leaveWithoutSaving();
    } else if (pendingHrefRef.current === hrefAtStart) {
      closeDialog(); // zostań — użytkownik widzi toast/walidację
    }
  }

  return (
    <UnsavedDialog
      open={pendingHref !== null}
      saving={saving}
      onStay={closeDialog}
      onSaveAndLeave={saveAndLeave}
      onLeave={leaveWithoutSaving}
    />
  );
}

// Dialog 3-przyciskowy — layout i a11y jak ConfirmDialog (useModal: scroll-lock,
// Escape → Zostań, focus-trap). Panel admina jest polskojęzyczny — teksty PL.
// Escape/backdrop-Zostań działają identycznie podczas zapisu jak przycisk
// „Zostań" (celowo NIE blokujemy Escape w trakcie saving — patrz przycisk
// „Zostań" niżej, który z tego samego powodu pozostaje aktywny).
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
  const stayRef = useRef<HTMLButtonElement>(null);
  useModal(open, { onClose: onStay, containerRef: ref, trapFocus: true });

  // Pozostałe dwa przyciski dostają disabled podczas zapisu — przeglądarka
  // odbiera im focus (ląduje na <body>), co wypuściłoby Tab poza modal (trap
  // useModal przechwytuje tylko na granicach focusowalnych WEWNĄTRZ
  // kontenera). „Zostań" zostaje aktywne właśnie po to, by było czym złapać
  // focus z powrotem.
  useEffect(() => {
    if (saving) stayRef.current?.focus();
  }, [saving]);

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
            ref={stayRef}
            type="button"
            onClick={onStay}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
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
