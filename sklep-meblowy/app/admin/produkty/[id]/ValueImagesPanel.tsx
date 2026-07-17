"use client";

import Image from "next/image";
import { useImageUpload } from "./useImageUpload";
import type { Toast } from "./_shared";

// Panel zdjęć jednej wartości opcji wariantu — rozwijany pod wierszem wartości
// w VariantsEditor: miniatury z usuwaniem + upload (multi-select i drag&drop,
// przez wspólny useImageUpload → uploadProductImage). Stan trzyma rodzic
// (VariantsEditor) — utrwalenie dopiero przyciskiem „Zapisz warianty".
export default function ValueImagesPanel({
  value,
  urls,
  onAdd,
  onRemove,
  onToast,
}: {
  value: string;
  urls: string[];
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  onToast: (t: Toast) => void;
}) {
  const upload = useImageUpload({
    onUploaded: onAdd,
    onToast,
    successHint: "Kliknij „Zapisz warianty” żeby utrwalić.",
  });

  return (
    <div
      {...upload.dropProps}
      className={`flex flex-col gap-2 p-3 bg-[var(--bg)] border border-dashed rounded-lg transition-colors ${
        upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
      }`}
    >
      {urls.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <li
              key={url}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--border)]"
            >
              <Image
                src={url}
                alt={`Zdjęcie wartości ${value}`}
                fill
                sizes="64px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(url)}
                aria-label={`Usuń zdjęcie wartości ${value}`}
                className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label
        className={`self-start px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer ${
          upload.uploading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {upload.progressText ?? "+ Dodaj zdjęcia"}
        <input {...upload.inputProps} className="hidden" />
      </label>
      <p className="text-[11px] text-[var(--muted)]">
        Zdjęcia tej wartości pokażą się na początku galerii, gdy klient ją
        wybierze na karcie produktu. Możesz też przeciągnąć pliki tutaj.
      </p>
    </div>
  );
}
