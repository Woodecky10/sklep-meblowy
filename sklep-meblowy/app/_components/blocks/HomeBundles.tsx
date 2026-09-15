import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import BundleTileCard from "@/app/_components/ui/BundleTileCard";
import { SLIDES_3_PER_ROW } from "@/app/_components/ui/carousel-slides";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { BundleTile } from "@/app/_lib/bundle-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Sekcja „Zestawy mebli" na stronie głównej: slider ze WSZYSTKIMI widocznymi
// zestawami (strzałki na desktopie, przewijanie palcem na mobile) i link do
// pełnej listy /zestawy. Pierwsza wersja (2026-09-15 rano) pokazywała 3 kafelki
// w siatce i przycisk pod nimi — właściciel poprosił o slider „normalnie ze
// strzałką" i link „obok, w ładnym miejscu". Link jest w DOM dwa razy: na
// desktopie dyskretnie nad sliderem z prawej (jak „Wszystkie →" przy
// polecanych), na mobile jako przycisk pod sliderem — widoczny zawsze jeden
// (e2e/home-bundles.spec.ts liczy `:visible`). Komponent serwerowy: nic tu
// nie klika, ceny formatujemy z kursem po stronie serwera. Nagłówek sekcji
// i uchwyt id="home-bundles" stoją w app/page.tsx.
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
  const seeAll = `${t.home.bundlesSeeAll} (${tiles.length})`;

  return (
    <>
      <div className="hidden md:flex justify-end mb-4">
        <LocalizedLink
          href="/zestawy"
          className="text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          {seeAll} →
        </LocalizedLink>
      </div>

      <ProductCarousel
        prevLabel={t.a11y.prevBundles}
        nextLabel={t.a11y.nextBundles}
        slideClassName={SLIDES_3_PER_ROW}
      >
        {tiles.map((tile) => (
          <BundleTileCard key={tile.bundle.id} tile={tile} locale={locale} rate={rate} />
        ))}
      </ProductCarousel>

      <div className="md:hidden flex justify-center mt-8">
        <LocalizedLink
          href="/zestawy"
          className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
        >
          {seeAll}
        </LocalizedLink>
      </div>
    </>
  );
}
