import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import { SLIDES_3_PER_ROW } from "@/app/_components/ui/carousel-slides";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pluralForm } from "@/app/_lib/plural";
import { mosaicTileClass } from "@/app/_lib/mosaic";
import type { CollectionTile } from "@/app/_lib/collection-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Sekcja „Nasze kolekcje" — slider ze WSZYSTKIMI kolekcjami z panelu, w
// kolejności ustawionej przeciąganiem (decyzja właściciela 2026-09-15: „na
// kolekcjach też tak", jak zestawy). Wcześniej: siatka 6 + „Pokaż wszystkie
// kolekcje" (spec 2026-07-31) — zwijanie, kreska „poniżej dopiero po
// rozwinięciu" w panelu i HOME_COLLECTIONS_VISIBLE poszły razem z nim.
// Zdjęcia slajdów poza ekranem ładują się leniwie (next/image liczy
// przecięcie z viewportem, a slajdy poza nim są za overflow-hidden karuzeli).
// Komponent serwerowy: karty renderują się na serwerze i wjeżdżają do
// klienckiej karuzeli jako children — ten sam układ, co opinie na home.
// Uchwyt id="home-collections" (e2e/home-collections.spec.ts) stoi na
// <section> w app/page.tsx.
export default function HomeCollections({
  tiles,
  locale,
}: {
  tiles: CollectionTile[];
  locale: Locale;
}) {
  const t = getDictionary(locale);

  return (
    <ProductCarousel
      prevLabel={t.a11y.prevCollections}
      nextLabel={t.a11y.nextCollections}
      slideClassName={SLIDES_3_PER_ROW}
    >
      {tiles.map(({ collection, thumbnails, productCount }) => (
        <LocalizedLink
          key={collection.id}
          href={`/sklep?kolekcja=${collection.slug}`}
          className="group flex flex-col h-full bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
        >
          {/* Mozaika do 4 zdjęć produktów z kolekcji — reguła w app/_lib/mosaic.ts */}
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
      ))}
    </ProductCarousel>
  );
}
