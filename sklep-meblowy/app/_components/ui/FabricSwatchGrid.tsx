"use client";

import { useState } from "react";
import Image from "next/image";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { swatchImages } from "@/app/_lib/fabric-swatch-images";
import ImageLightbox from "@/app/_components/ui/ImageLightbox";

// Wzornik: siatka próbek kolorów. Próbka ze zdjęciem → klik otwiera lightbox
// (zestaw = próbki mające zdjęcie, kolejność wg swatchImages). Próbka bez
// zdjęcia → placeholder z numerem (nieklikalny).
export default function FabricSwatchGrid({
  colors,
  images,
  name,
}: {
  colors: string[];
  images: Record<string, string>;
  name: string;
}) {
  const t = getDictionary(useClientLocale());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const clickable = swatchImages(colors, images);
  const lightboxImages = clickable.map((s) => ({ src: s.url, caption: s.code }));
  // kod → pozycja w liście klikalnych (do otwarcia lightboxa na właściwym zdjęciu).
  const indexByCode = new Map(clickable.map((s, i) => [s.code, i]));

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {colors.map((code) => {
          const img = images[code];
          const idx = indexByCode.get(code);
          const tile = (
            <span className="relative block w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
              {img ? (
                // Siatka: 3 kolumny do 640px, 4 do 768px, dalej 6 w kontenerze
                // max-w-7xl → ok. 200px. Bez `sizes` next/image przyjąłby 100vw
                // i ściągał pełnowymiarowe zdjęcie do próbki wielkości kciuka.
                <Image
                  src={img}
                  alt={`${name} ${code}`}
                  fill
                  sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 200px"
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
                  {code}
                </span>
              )}
            </span>
          );
          return (
            <figure key={code} className="flex flex-col items-center gap-2 text-center">
              {idx !== undefined ? (
                <button
                  type="button"
                  onClick={() => setOpenIndex(idx)}
                  aria-label={t.a11y.zoomImage}
                  className="w-full cursor-pointer rounded-xl hover:ring-2 hover:ring-[var(--color-gold)]/40 transition-all"
                >
                  {tile}
                </button>
              ) : (
                tile
              )}
              <figcaption className="text-xs text-[var(--muted)]">{code}</figcaption>
            </figure>
          );
        })}
      </div>
      <ImageLightbox
        images={lightboxImages}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        alt={name}
      />
    </>
  );
}
