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
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby="confirm-dialog-message"
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
          <p
            id="confirm-dialog-message"
            className="text-sm text-[var(--fg)] leading-relaxed whitespace-pre-line"
          >
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
