"use client";

import { useTransition } from "react";
import { addContentBlock } from "./actions";
import {
  CONTENT_BLOCK_DEFS,
  CONTENT_BLOCK_TYPES,
  type ContentBlockType,
} from "@/app/_lib/blocks";
import type { ActionResult } from "@/app/_lib/types";

// Galeria typów sekcji — wzorzec modala jak ConfirmDialog (fixed overlay + karta).
export default function AddBlockModal({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (r: ActionResult) => void;
}) {
  const [adding, startTransition] = useTransition();

  function add(type: ContentBlockType) {
    const fd = new FormData();
    fd.set("type", type);
    startTransition(async () => {
      const res = await addContentBlock(fd);
      onResult(res);
      if (res.ok) onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dodaj sekcję"
    >
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Dodaj sekcję
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Nowa sekcja trafia na koniec strony jako ukryta — uzupełnij treść
          i włącz widoczność, gdy będzie gotowa.
        </p>
        <div className="flex flex-col gap-2">
          {CONTENT_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              disabled={adding}
              className="text-left border border-[var(--border)] rounded-xl p-4 hover:border-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              <p className="font-display text-base font-semibold text-[var(--fg)]">
                {CONTENT_BLOCK_DEFS[type].name}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {CONTENT_BLOCK_DEFS[type].description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
