"use client";

import { useState } from "react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ImageLightbox from "@/app/_components/ui/ImageLightbox";

// Zdjęcia z produkcji: każde zdjęcie klikalne → lightbox (zestaw = wszystkie).
// Pod zdjęciem z podpiętym aktywnym produktem osobny link do karty produktu
// (klik zdjęcia = podgląd, klik nazwy = przejście do produktu).
export default function FabricProductionPhotos({
  photos,
  fabricName,
}: {
  photos: { url: string; product: { id: string; name: string } | null }[];
  fabricName: string;
}) {
  const t = getDictionary(useClientLocale());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const lightboxImages = photos.map((p) => ({
    src: p.url,
    caption: p.product?.name,
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {photos.map((p, i) => (
          <div key={i} className="group flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={t.a11y.zoomImage}
              className="relative block aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg)] cursor-pointer hover:ring-2 hover:ring-[var(--color-gold)]/40 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.product?.name ?? fabricName}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
            {p.product && (
              <LocalizedLink
                href={`/produkt/${p.product.id}`}
                className="text-sm font-sans text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
              >
                {p.product.name} <span aria-hidden="true">→</span>
              </LocalizedLink>
            )}
          </div>
        ))}
      </div>
      <ImageLightbox
        images={lightboxImages}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
        alt={fabricName}
      />
    </>
  );
}
