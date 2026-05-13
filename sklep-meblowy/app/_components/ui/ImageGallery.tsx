"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function ImageGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const list = images.length > 0 ? images : ["/placeholder.jpg"];

  // Zoom state w lightboxie
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [pinchScale, setPinchScale] = useState(1);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);

  // Reset zoom przy zmianie zdjęcia lub otwarciu/zamknięciu lightboxa
  useEffect(() => {
    setHover(false);
    setPinchScale(1);
    setPos({ x: 50, y: 50 });
  }, [active, lightbox]);

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

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setPos({ x, y });
  }

  // Pinch-zoom (mobile): obliczamy odległość między dwoma palcami,
  // skalujemy obraz proporcjonalnie do zmiany odległości.
  function distance(a: React.Touch, b: React.Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchStartDistRef.current = distance(e.touches[0], e.touches[1]);
      pinchStartScaleRef.current = pinchScale;
    }
  }
  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const d = distance(e.touches[0], e.touches[1]);
      const next = Math.min(
        3,
        Math.max(1, pinchStartScaleRef.current * (d / pinchStartDistRef.current))
      );
      setPinchScale(next);
    }
  }
  function onTouchEnd() {
    pinchStartDistRef.current = null;
  }

  // Końcowa skala: jeśli pinch aktywny — pinchScale, inaczej hover×2 albo 1.
  const scale = pinchScale > 1 ? pinchScale : hover ? 2 : 1;

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
          <div
            className="relative w-full max-w-6xl aspect-[4/3] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseMove={onMouseMove}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ cursor: hover ? "zoom-in" : "default", touchAction: "none" }}
          >
            <Image
              src={list[active]}
              alt={name}
              fill
              sizes="100vw"
              className="object-contain pointer-events-none select-none"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: `${pos.x}% ${pos.y}%`,
                transition: pinchScale > 1 ? "none" : "transform 120ms ease-out",
              }}
            />
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
