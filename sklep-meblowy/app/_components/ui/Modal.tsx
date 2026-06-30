"use client";

import { useRef, type ReactNode } from "react";
import { useModal } from "@/app/_lib/useModal";

// Wspólny shell modala (overlay + karta + nagłówek z przyciskiem zamknięcia)
// i pomocniki formularza — współdzielone przez InquiryModal i OrderIssueModal,
// które różnią się tylko zawartością formularza. Stan otwarcia/zamknięcia oraz
// reset wyniku zostają w komponencie-rodzicu (`open`/`onClose`); shell odpowiada
// za prezentację i a11y (useModal: scroll-lock, Escape, focus-trap).

// Styl triggera otwierającego modal (pełna szerokość, złota obwódka).
export const modalTriggerCls =
  "w-full py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors";

export const inputCls =
  "w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

export function Modal({
  open,
  onClose,
  ariaLabel,
  eyebrow,
  heading,
  subtitle,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  eyebrow: string;
  heading: string;
  // Dodatkowa linia pod nagłówkiem (np. nazwa produktu); opcjonalna.
  subtitle?: ReactNode;
  closeLabel: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // a11y: scroll-lock tła, Escape zamyka, focus-trap w obrębie modala.
  useModal(open, { onClose, containerRef: dialogRef, trapFocus: true });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col gap-5 p-6 my-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-1">
              {eyebrow}
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--fg)] leading-tight">
              {heading}
            </h2>
            {subtitle}
          </div>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

// Box potwierdzenia wysłania (zielony) z przyciskiem zamknięcia.
export function ModalSuccess({
  title,
  message,
  onClose,
  closeLabel,
}: {
  title: string;
  message: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="p-5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-xl">
      <p className="text-sm text-emerald-800 dark:text-emerald-200 font-semibold mb-1">{title}</p>
      <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>
      <button
        onClick={onClose}
        className="mt-4 px-5 py-2 text-xs font-sans uppercase tracking-widest border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
      >
        {closeLabel}
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}
