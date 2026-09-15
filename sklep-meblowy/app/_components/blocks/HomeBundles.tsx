import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import BundleTileCard from "@/app/_components/ui/BundleTileCard";
import CarouselSeeAll from "./CarouselSeeAll";
import { SLIDES_3_PER_ROW } from "@/app/_components/ui/carousel-slides";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { BundleTile } from "@/app/_lib/bundle-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Sekcja „Zestawy mebli" na stronie głównej: slider ze WSZYSTKIMI widocznymi
// zestawami (strzałki na desktopie, przewijanie palcem na mobile) i link do
// pełnej listy /zestawy (układ linku: CarouselSeeAll). Pierwsza wersja
// (2026-09-15 rano) pokazywała 3 kafelki w siatce i przycisk pod nimi —
// właściciel poprosił o slider „normalnie ze strzałką" i link „obok, w ładnym
// miejscu". Komponent serwerowy: nic tu nie klika, ceny formatujemy z kursem
// po stronie serwera. Nagłówek sekcji i uchwyt id="home-bundles" stoją w
// app/page.tsx.
export default function HomeBundles({
  tiles,
  locale,
  rate,
}: {
  tiles: BundleTile[];
  locale: Locale;
  rate: number;
}) {
  const t = getDictionary(locale);

  return (
    <CarouselSeeAll href="/zestawy" label={`${t.home.bundlesSeeAll} (${tiles.length})`}>
      <ProductCarousel
        prevLabel={t.a11y.prevBundles}
        nextLabel={t.a11y.nextBundles}
        slideClassName={SLIDES_3_PER_ROW}
      >
        {tiles.map((tile) => (
          <BundleTileCard key={tile.bundle.id} tile={tile} locale={locale} rate={rate} />
        ))}
      </ProductCarousel>
    </CarouselSeeAll>
  );
}
