import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import CollectionTileCard from "@/app/_components/ui/CollectionTileCard";
import CarouselSeeAll from "./CarouselSeeAll";
import { SLIDES_3_PER_ROW } from "@/app/_components/ui/carousel-slides";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { CollectionTile } from "@/app/_lib/collection-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Sekcja „Nasze kolekcje" — slider ze WSZYSTKIMI kolekcjami z panelu, w
// kolejności ustawionej przeciąganiem, plus link do listy /kolekcje (decyzje
// właściciela 2026-09-15: „na kolekcjach też tak", jak zestawy). Wcześniej:
// siatka 6 + „Pokaż wszystkie kolekcje" (spec 2026-07-31) — zwijanie, kreska
// „poniżej dopiero po rozwinięciu" w panelu i HOME_COLLECTIONS_VISIBLE poszły
// razem z nim. Zdjęcia slajdów poza ekranem ładują się leniwie (next/image
// liczy przecięcie z viewportem, a slajdy poza nim są za overflow-hidden).
// Komponent serwerowy — karty wjeżdżają do klienckiej karuzeli jako children.
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
    <CarouselSeeAll href="/kolekcje" label={`${t.home.collectionsSeeAll} (${tiles.length})`}>
      <ProductCarousel
        prevLabel={t.a11y.prevCollections}
        nextLabel={t.a11y.nextCollections}
        slideClassName={SLIDES_3_PER_ROW}
      >
        {tiles.map((tile) => (
          <CollectionTileCard key={tile.collection.id} tile={tile} locale={locale} />
        ))}
      </ProductCarousel>
    </CarouselSeeAll>
  );
}
