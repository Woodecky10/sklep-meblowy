"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useModal } from "@/app/_lib/useModal";

export default function ImageGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const list = images.length > 0 ? images : ["/placeholder.jpg"];

  // Zmiana zestawu zdjęć (np. wybór wariantu z własną galerią) → wróć do
  // pierwszego zdjęcia. Bez tego `active` mógł wskazywać poza nową, krótszą
  // listę (list[active] === undefined → crash next/image). Porównanie po
  // zawartości (nie referencji) — odporne na świeże tablice z helpera.
  const imagesKey = images.join("|");
  const [prevImagesKey, setPrevImagesKey] = useState(imagesKey);
  if (prevImagesKey !== imagesKey) {
    setPrevImagesKey(imagesKey);
    setActive(0);
  }

  // Stan zoomu w lightboxie:
  // - zoomed: czy 2x czy 1x
  // - origin: transform-origin (gdzie w obrazku jest "centrum" zoomu)
  // - pan: offset translacji w pikselach (przesunięcie po kliknięciu zooma)
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Drag state — używamy pointer events (unified mouse+touch). Trzymamy
  // dragStart pozycji + pan + wymiary kontenera w momencie pointerdown,
  // plus flagę `moved` żeby rozróżnić KLIKNIĘCIE od DRAGA (próg 5px movement).
  const dragRef = useRef<{
    startX: number;
    startY: number;
    basePanX: number;
    basePanY: number;
    rectWidth: number;
    rectHeight: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Ogranicz pan tak, żeby krawędzie obrazu nie weszły poza kontener.
  // Z transform: translate(P) scale(S) i transform-origin (ox, oy):
  // - max Tx = ox * (S - 1)        (obraz nie wyjdzie z lewej strony)
  // - min Tx = -(W - ox) * (S - 1) (obraz nie wyjdzie z prawej strony)
  // ox, oy w PIKSELACH (origin trzymamy w %, konwertujemy mnożąc przez W/100).
  function clampPan(
    px: number,
    py: number,
    rectWidth: number,
    rectHeight: number
  ): { x: number; y: number } {
    const S = 2;
    const oxPx = (origin.x * rectWidth) / 100;
    const oyPx = (origin.y * rectHeight) / 100;
    const maxX = oxPx * (S - 1);
    const minX = -(rectWidth - oxPx) * (S - 1);
    const maxY = oyPx * (S - 1);
    const minY = -(rectHeight - oyPx) * (S - 1);
    return {
      x: Math.max(minX, Math.min(maxX, px)),
      y: Math.max(minY, Math.min(maxY, py)),
    };
  }

  // Reset zoom przy zmianie zdjęcia / zamknięciu lightbox — wzorzec
  // "adjusting state during render" (React docs) zamiast setState w efekcie:
  // bez dodatkowego przebiegu renderu i bez mignięcia starym zoomem.
  const [prevReset, setPrevReset] = useState({ active, lightbox });
  if (prevReset.active !== active || prevReset.lightbox !== lightbox) {
    setPrevReset({ active, lightbox });
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setOrigin({ x: 50, y: 50 });
  }

  // a11y: scroll-lock tła, Escape zamyka, focus-trap (Escape obsługuje useModal).
  useModal(lightbox, {
    onClose: () => setLightbox(false),
    containerRef: lightboxRef,
    trapFocus: true,
  });

  // Strzałki przełączają zdjęcia w otwartym lightboxie
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % list.length);
      if (e.key === "ArrowLeft") setActive((i) => (i - 1 + list.length) % list.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, list.length]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    // Pointer capture żeby dostawać move/up nawet poza kontenerem
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      basePanX: pan.x,
      basePanY: pan.y,
      rectWidth: rect.width,
      rectHeight: rect.height,
      moved: false,
    };
    if (zoomed) setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > 5) {
      state.moved = true;
    }
    if (!zoomed || !state.moved) return;
    const clamped = clampPan(
      state.basePanX + dx,
      state.basePanY + dy,
      state.rectWidth,
      state.rectHeight
    );
    setPan(clamped);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const state = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!state || state.moved) return;
    // Click bez movement → toggle zoom
    if (!zoomed) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setOrigin({ x, y });
      setPan({ x: 0, y: 0 });
      setZoomed(true);
    } else {
      setZoomed(false);
      setPan({ x: 0, y: 0 });
    }
  }

  const lightboxCursor = zoomed
    ? dragging
      ? "grabbing"
      : "grab"
    : "zoom-in";

  return (
    <>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="Powiększ zdjęcie"
          className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-800 rounded-3xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-[var(--color-gold)]/40 transition-all"
        >
          <Image
            src={list[active]}
            alt={name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </button>
        {list.length > 1 && (
          <div className="flex gap-3">
            {list.map((src, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                aria-label={`Pokaż zdjęcie ${i + 1}`}
                aria-current={i === active}
                className={`relative w-20 aspect-square rounded-xl overflow-hidden border-2 transition-colors cursor-pointer ${
                  i === active ? "border-[var(--color-gold)]" : "border-transparent hover:border-[var(--color-gold)]/50"
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
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Zdjęcie produktu ${name}`}
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
        >
          <div
            className="relative w-full max-w-6xl aspect-[4/3] overflow-hidden select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: lightboxCursor, touchAction: "none" }}
          >
            <Image
              src={list[active]}
              alt={name}
              fill
              sizes="100vw"
              className="object-contain pointer-events-none select-none"
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? 2 : 1})`,
                transformOrigin: `${origin.x}% ${origin.y}%`,
                transition: dragging ? "none" : "transform 200ms ease-out",
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
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white z-10 cursor-pointer"
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
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white z-10 cursor-pointer"
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
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
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
