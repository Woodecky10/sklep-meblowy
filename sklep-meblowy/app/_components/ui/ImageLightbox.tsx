"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useModal } from "@/app/_lib/useModal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

export type LightboxImage = { src: string; caption?: string };

// Wspólny, sterowany lightbox (wzornik + zdjęcia z produkcji tkaniny). Prosty:
// pełny obraz object-contain, strzałki, Esc/klik-tło/X. Bez zoomu/panu (to ma
// ImageGallery produktu). index === null → nic nie renderuje.
export default function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
  alt,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  alt: string;
}) {
  const t = getDictionary(useClientLocale());
  const ref = useRef<HTMLDivElement>(null);
  const open = index !== null;

  // scroll-lock + Escape + focus-trap (jak ImageGallery).
  useModal(open, { onClose, containerRef: ref, trapFocus: true });

  // Strzałki klawiatury ←/→ tylko gdy otwarty i jest >1 zdjęcie.
  useEffect(() => {
    if (!open || images.length < 2 || index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") onIndexChange((index! + 1) % images.length);
      if (e.key === "ArrowLeft") onIndexChange((index! - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onIndexChange]);

  if (index === null || !images[index]) return null;
  const current = images[index];

  // Portal do document.body: overlay renderuje się poza poddrzewem <main>, więc
  // jego z-[100] działa w root stacking-context — nad banerem cookies (z-50),
  // który jest rodzeństwem <main>, nie potomkiem. Bez portalu numer z-index nie
  // wystarcza (overlay uwięziony w kontekście <main>).
  const overlay = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
    >
      <figure
        className="relative max-w-5xl w-full flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.src}
          alt={alt}
          className="max-w-full max-h-[85vh] object-contain select-none"
          draggable={false}
        />
        {current.caption && (
          <figcaption className="text-sm font-sans text-white/80">{current.caption}</figcaption>
        )}
      </figure>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + images.length) % images.length);
            }}
            aria-label={t.a11y.prevImage}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index + 1) % images.length);
            }}
            aria-label={t.a11y.nextImage}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t.common.close}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(overlay, document.body);
}
