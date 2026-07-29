"use client";

import { Children, useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Poziomy pasek kart produktów ze strzałkami. Agnostyczny wobec treści —
// dostaje gotowe karty jako children (serwerowe <ProductCard> renderują się
// wewnątrz klienta bez problemu) i tylko owija każde dziecko w slajd.
// Mechanika na embla-carousel (już w zależnościach, patrz HomeHeroSlider):
// przeciąganie na mobile i gotowe canScrollPrev/Next zamiast własnych
// listenerów scrolla.
export default function ProductCarousel({ children }: { children: ReactNode }) {
  const t = getDictionary(useClientLocale());
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    slidesToScroll: "auto",
    containScroll: "trimSnaps",
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    // reInit — karty z Next/Image zmieniają wysokość po doczytaniu zdjęć,
    // wtedy embla przelicza snapy i stan strzałek musi za tym nadążyć.
    const sync = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    sync();
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  const arrowCls =
    "hidden sm:flex absolute top-1/3 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent disabled:opacity-0 disabled:pointer-events-none transition-all z-10 shadow-sm";

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex gap-8">
          {Children.map(children, (child, i) => (
            <div
              key={i}
              className="min-w-0 shrink-0 basis-[78%] sm:basis-[calc(50%-1rem)] lg:basis-[calc(25%-1.5rem)]"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        disabled={!canPrev}
        aria-label={t.a11y.prevProducts}
        className={`${arrowCls} -left-3 lg:-left-5`}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={scrollNext}
        disabled={!canNext}
        aria-label={t.a11y.nextProducts}
        className={`${arrowCls} -right-3 lg:-right-5`}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
