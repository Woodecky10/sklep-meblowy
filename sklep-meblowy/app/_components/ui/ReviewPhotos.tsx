"use client";

import { useState } from "react";
import Image from "next/image";
import ImageLightbox from "./ImageLightbox";
import { getDictionary } from "@/app/_lib/dictionaries";
import { MAX_REVIEW_PHOTOS } from "@/app/_lib/reviews-photos";
import type { Locale } from "@/app/_lib/i18n";

// Rząd miniatur zdjęć od klienta z opinii — klik otwiera lightbox, jak we
// wzorniku tkanin (FabricSwatchGrid). Wydzielone z ReviewCard jako JEDYNY
// kliencki kawałek karty: sama karta zostaje serwerowa (cytat, ocena, link do
// produktu nie potrzebują JS), a interaktywność dotyczy tylko zdjęć.
//
// Miniatury mają 72 px w sliderze i ok. 200 px na /opinie, więc bez
// powiększenia zdjęcia od klientów były praktycznie nie do obejrzenia.
// Trzy miejsca renderują te same miniatury i różnią się WYŁĄCZNIE układem
// siatki oraz rozmiarem, pod jaki next/image ma dobrać plik. Trzymamy je tutaj
// w jednym miejscu, żeby czwarte wywołanie nie było kolejną kopią znaczników —
// to właśnie kopia w ReviewList sprawiła, że karta produktu nie dostała
// lightboxa razem z resztą.
const UKLAD = {
  // Rządek pod cytatem w sliderze na stronie głównej.
  slider: { lista: "flex gap-2", kafelek: "w-[72px] shrink-0", sizes: "72px" },
  // Siatka w karcie opinii na /opinie.
  pelna: { lista: "grid grid-cols-3 gap-2", kafelek: "", sizes: "200px" },
  // Sekcja opinii na karcie produktu (węższa kolumna niż /opinie).
  produkt: {
    lista: "grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3 max-w-md",
    kafelek: "",
    sizes: "160px",
  },
} as const;

export type ReviewPhotosWariant = keyof typeof UKLAD;

export default function ReviewPhotos({
  photos,
  altBazowy,
  locale,
  wariant,
}: {
  photos: string[];
  altBazowy: string;
  locale: Locale;
  wariant: ReviewPhotosWariant;
}) {
  const t = getDictionary(locale);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const widoczne = photos.slice(0, MAX_REVIEW_PHOTOS);
  const uklad = UKLAD[wariant];

  return (
    <>
      <ul className={uklad.lista}>
        {widoczne.map((url, i) => (
          <li
            key={url}
            className={`relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] ${uklad.kafelek}`}
          >
            {/* Przycisk wypełnia kafelek (absolute inset-0), więc jest zarazem
                pozycjonowanym rodzicem dla <Image fill> — inaczej zdjęcie
                liczyłoby rozmiar od <li> i przycisk zostałby bez wysokości. */}
            <button
              type="button"
              data-review-photo
              onClick={() => setOpenIndex(i)}
              aria-label={t.a11y.zoomImage}
              className="absolute inset-0 cursor-zoom-in hover:opacity-90 transition-opacity"
            >
              <Image
                src={url}
                alt={`${altBazowy} (${i + 1})`}
                fill
                sizes={uklad.sizes}
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <ImageLightbox
        images={widoczne.map((src) => ({ src }))}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        alt={altBazowy}
      />
    </>
  );
}
