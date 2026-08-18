// Wspólne, presentacyjne komponenty edytorów admina (audyt 2026-06-11 LOW #20).
// Wcześniej każdy edytor (slider/kafelki/polecane/kolekcje/kody/kategorie) miał
// własne kopie Field/Card/EmptyState/ToastView/inputCls — rozjeżdżały się
// (np. inputCls raz z text-sm, raz bez). Jedno źródło prawdy.

import type { ReactNode } from "react";

export type Toast = { type: "success" | "error"; message: string } | null;

export const inputCls =
  "w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

export function Field({
  label,
  hint,
  required,
  className,
  composite,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  // `true` = w środku siedzi WIDŻET ZŁOŻONY (pasek narzędzi + obszar edycji),
  // a nie pojedyncza kontrolka. Wtedy opakowaniem jest <div>, nie <label>.
  //
  // ⚠️ TO NIE JEST KOSMETYKA. `<label>` bez `for` aktywuje PIERWSZY etykietowalny
  // element potomka, a `<input type="hidden">` etykietowalny NIE jest. Przy
  // RichTextEditorze pierwszym takim elementem jest przycisk „Pogrubienie" —
  // więc klikniecie w napis etykiety, w podpowiedź pod spodem albo w odstęp
  // POGRUBIAŁO zaznaczony tekst. Zgłoszenie właścicielki 2026-08-18:
  // „kliknęłam poza obszar edytora i się pogrubiła".
  //
  // Dostępności to nie psuje: RichTextEditor nadaje obszarowi edycji własne
  // `aria-label` (prop `ariaLabel`), więc nazwa dla czytników ekranu zostaje.
  composite?: boolean;
  children: ReactNode;
}) {
  const Wrapper = composite ? "div" : "label";
  return (
    <Wrapper className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)] leading-snug">{hint}</span>}
    </Wrapper>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
      <p className="font-display text-lg">{message}</p>
    </div>
  );
}

export function ToastView({
  toast,
  onClose,
}: {
  toast: NonNullable<Toast>;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      data-toast-type={toast.type}
      className={`fixed top-24 right-6 z-50 max-w-sm px-5 py-4 rounded-2xl shadow-2xl border ${
        toast.type === "success"
          ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
          : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <p className="text-sm flex-1">{toast.message}</p>
        <button onClick={onClose} aria-label="Zamknij" className="shrink-0 opacity-70 hover:opacity-100">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
