"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function ImageGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const list = images.length > 0 ? images : ["/placeholder.jpg"];

  // Esc zamyka lightbox; strzałki przełączają zdjęcia
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % list.length);
      if (e.key === "ArrowLeft") setActive((i) => (i - 1 + list.length) % list.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, list.length]);

  return (
    <>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="Powiększ zdjęcie"
          className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-800 rounded-3xl overflow-hidden group"
        >
          <Image
            src={list[active]}
            alt={name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        </button>
        {list.length > 1 && (
          <div className="flex gap-3">
            {list.map((src, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`relative w-20 aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                  i === active ? "border-[var(--color-gold)]" : "border-transparent"
                }`}
              >
                <Image src={src} alt={`${name} ${i + 1}`} fill className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Zdjęcie produktu ${name}`}
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="relative w-full max-w-6xl aspect-[4/3]" onClick={(e) => e.stopPropagation()}>
            <Image src={list[active]} alt={name} fill sizes="100vw" className="object-contain" />
          </div>
          {list.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((i) => (i - 1 + list.length) % list.length);
                }}
                aria-label="Poprzednie zdjęcie"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white z-10"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActive((i) => (i + 1) % list.length);
                }}
                aria-label="Następne zdjęcie"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white z-10"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={() => setLightbox(false)}
            aria-label="Zamknij"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
