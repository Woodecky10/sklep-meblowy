"use client";

import { useState } from "react";
import Image from "next/image";
import ImageLightbox from "./ImageLightbox";
import LocalizedLink from "./LocalizedLink";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";
import type { ProductPhotoGroup } from "@/app/_lib/reviews-gallery";

// Tryb „tylko zdjęcia" na /opinie: kafelki pogrupowane produktami, bo klient
// chce zobaczyć JEDEN mebel w wielu mieszkaniach, a nie zdjęcia jednej opinii.
// Strzałki lightboxa chodzą po zdjęciach tego samego produktu — wyjście poza
// niego gubiłoby kontekst, po co ktoś w ogóle otworzył galerię.
//
// Otwarte zdjęcie trzymamy jako parę (produkt, indeks): sam indeks nie mówi,
// którą listę podać lightboxowi, a osobne stany rozjeżdżają się przy zamykaniu.
export default function ReviewsGallery({
  groups,
  locale,
}: {
  groups: ProductPhotoGroup[];
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const [otwarte, setOtwarte] = useState<{ produkt: string; indeks: number } | null>(null);

  const aktywna = otwarte ? groups.find((g) => g.productId === otwarte.produkt) : undefined;

  return (
    <>
      <div className="flex flex-col gap-12">
        {groups.map((g) => (
          <section key={g.productId} className="flex flex-col gap-4">
            <h2 className="font-display text-xl font-bold text-[var(--fg)]">
              {g.productName ? (
                <LocalizedLink
                  href={`/produkt/${g.productId}`}
                  className="hover:text-[var(--color-gold-text)] transition-colors"
                >
                  {g.productName}
                </LocalizedLink>
              ) : (
                t.reviewsPage.photosFromCustomers
              )}
            </h2>

            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {g.photos.map((zdjecie, i) => (
                <li
                  key={`${zdjecie.reviewId}-${zdjecie.src}`}
                  className="relative aspect-square rounded-xl overflow-hidden border border-[var(--border)]"
                >
                  {/* Przycisk wypełnia kafelek, więc jest zarazem pozycjonowanym
                      rodzicem dla <Image fill> — jak w ReviewPhotos. */}
                  <button
                    type="button"
                    data-gallery-photo
                    onClick={() => setOtwarte({ produkt: g.productId, indeks: i })}
                    aria-label={t.a11y.zoomImage}
                    className="absolute inset-0 cursor-zoom-in hover:opacity-90 transition-opacity"
                  >
                    <Image
                      src={zdjecie.src}
                      alt={
                        locale === "de"
                          ? `Kundenfoto zur Bewertung von ${g.productName ?? "dem Produkt"}`
                          : `Zdjęcie od klienta do opinii o ${g.productName ?? "produkcie"}`
                      }
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px"
                      className="object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <ImageLightbox
        images={(aktywna?.photos ?? []).map((p) => ({
          src: p.src,
          caption: aktywna?.productName ?? undefined,
        }))}
        index={otwarte?.indeks ?? null}
        onClose={() => setOtwarte(null)}
        onIndexChange={(i) => setOtwarte((s) => (s ? { ...s, indeks: i } : s))}
        alt={aktywna?.productName ?? t.reviewsPage.photosFromCustomers}
      />
    </>
  );
}
