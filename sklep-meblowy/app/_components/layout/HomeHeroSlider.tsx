"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

export type HeroSlide = {
  /** stabilny key (np. slug slajdu) */
  id: string;
  /** zdjęcie tła — pełnoekranowe */
  imageUrl: string;
  /** alt do zdjęcia (dostępność + SEO) */
  imageAlt: string;
  /** mała etykietka nad tytułem (np. "Kolekcja 2026") */
  eyebrow?: string;
  /** główny tytuł — wspiera <em> dla podkreślenia złotem (zob. niżej format) */
  title: string;
  /** podpis pod tytułem */
  subtitle?: string;
  /** główne CTA */
  ctaPrimary: { label: string; href: string };
  /** opcjonalne drugie CTA */
  ctaSecondary?: { label: string; href: string };
};

const AUTOPLAY_MS = 6000;

export default function HomeHeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, duration: 30 },
    [
      Autoplay({
        delay: AUTOPLAY_MS,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi]
  );
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  if (slides.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden"
      aria-roledescription="carousel"
      aria-label="Polecane kolekcje"
    >
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              className="relative flex-[0_0_100%] min-w-0 min-h-[80vh] flex items-center"
              role="group"
              aria-roledescription="slide"
              aria-label={`${idx + 1} z ${slides.length}`}
            >
              {/* Tło — zdjęcie */}
              <Image
                src={slide.imageUrl}
                alt={slide.imageAlt}
                fill
                priority={idx === 0}
                sizes="100vw"
                className="object-cover"
              />
              {/* Overlay dla czytelności tekstu */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20" />

              {/* Treść */}
              <div className="relative max-w-7xl mx-auto px-6 py-24 w-full">
                <div className="max-w-2xl">
                  {slide.eyebrow && (
                    <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-6">
                      {slide.eyebrow}
                    </p>
                  )}
                  <h1
                    className="font-display text-5xl md:text-7xl font-bold text-white leading-tight mb-8"
                    dangerouslySetInnerHTML={{ __html: slide.title }}
                  />
                  {slide.subtitle && (
                    <p className="text-white/70 text-lg max-w-lg mb-10 leading-relaxed">
                      {slide.subtitle}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <Link
                      href={slide.ctaPrimary.href}
                      className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--color-gold)] text-[var(--color-navy)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold-light)] transition-colors"
                    >
                      {slide.ctaPrimary.label}
                    </Link>
                    {slide.ctaSecondary && (
                      <Link
                        href={slide.ctaSecondary.href}
                        className="inline-flex items-center gap-2 px-8 py-4 border border-white/30 text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                      >
                        {slide.ctaSecondary.label}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strzałki nawigacji — ukryte na mobile, widoczne od md+ */}
      {slides.length > 1 && (
        <>
          <button
            onClick={scrollPrev}
            aria-label="Poprzedni slajd"
            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent transition-colors z-10"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={scrollNext}
            aria-label="Następny slajd"
            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white border border-white/20 hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent transition-colors z-10"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </>
      )}

      {/* Kropki na dole */}
      {slides.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => scrollTo(idx)}
              aria-label={`Przejdź do slajdu ${idx + 1}`}
              aria-current={idx === selectedIndex}
              className={`h-1.5 rounded-full transition-all ${
                idx === selectedIndex
                  ? "w-10 bg-[var(--color-gold)]"
                  : "w-6 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
