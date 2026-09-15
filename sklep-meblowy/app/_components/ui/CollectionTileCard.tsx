import Image from "next/image";
import LocalizedLink from "./LocalizedLink";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pluralForm } from "@/app/_lib/plural";
import { mosaicTileClass } from "@/app/_lib/mosaic";
import type { CollectionTile } from "@/app/_lib/collection-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Kafelek kolekcji — ten sam w sliderze na stronie głównej (HomeCollections)
// i na liście /kolekcje. Mozaika do 4 zdjęć produktów, nazwa, opis, „Zobacz
// kolekcję (N produktów)" → filtr sklepu. Komponent serwerowy bez hooków;
// wcześniej ten markup siedział w HomeCollections.tsx (a jeszcze wcześniej
// w app/page.tsx). Bliźniak: BundleTileCard.tsx — zmieniasz wygląd jednego,
// przejrzyj drugi.
export default function CollectionTileCard({
  tile,
  locale,
}: {
  tile: CollectionTile;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const { collection, thumbnails, productCount } = tile;

  return (
    <LocalizedLink
      href={`/sklep?kolekcja=${collection.slug}`}
      className="group flex flex-col h-full bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
    >
      <div className="relative aspect-[4/3] grid grid-cols-2 gap-1 p-1 bg-stone-100 dark:bg-stone-900">
        {thumbnails.map((src, i) => (
          <div
            key={src}
            className={`relative bg-stone-200 dark:bg-stone-800 rounded-lg overflow-hidden ${mosaicTileClass(
              thumbnails.length,
              i
            )}`}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 78vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform group-hover:scale-105"
            />
          </div>
        ))}
      </div>
      <div className="p-6 flex flex-col gap-2">
        <h3 className="font-display text-2xl font-bold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
          {collection.label}
        </h3>
        {collection.description && (
          <p className="text-sm text-[var(--muted)] leading-snug line-clamp-2">
            {collection.description}
          </p>
        )}
        <span className="mt-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
          {t.home.seeCollection} ({productCount}{" "}
          {pluralForm(productCount, {
            one: t.home.productOne,
            few: t.home.productFew,
            many: t.home.productMany,
          })})
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </LocalizedLink>
  );
}
