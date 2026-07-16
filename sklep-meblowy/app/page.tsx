import { Fragment, type ReactNode } from "react";
import LocalizedLink from "./_components/ui/LocalizedLink";
import Image from "next/image";
import type { Metadata } from "next";
import HomeHeroSlider from "./_components/layout/HomeHeroSlider";
import { getActiveSlides, DEFAULT_FALLBACK_SLIDE, localizeSlide } from "./_lib/slides";
import { getActiveTiles, DEFAULT_FALLBACK_TILES, localizeTile } from "./_lib/home-tiles";
import { getFeaturedOrFallback } from "./_lib/featured";
import { getCategories } from "./_lib/categories";
import { getCollectionsForHome } from "./_lib/collections";
import { getUserWishlistIds } from "./_lib/wishlist";
import { getLocale } from "./_lib/i18n-server";
import { getEurRate } from "./_lib/store-settings";
import { pluralForm } from "./_lib/plural";
import { localizePath } from "./_lib/i18n";
import { alternatesFor } from "./_lib/sitemap-i18n";
import { getDictionary } from "./_lib/dictionaries";
import ProductCard from "./_components/ui/ProductCard";
import TrustBar from "./_components/ui/TrustBar";
import { localizeBlock, type LocalizedBlock } from "./_lib/blocks";
import { getHomeBlocks } from "./_lib/blocks-server";
import ContentBlock from "./_components/blocks/ContentBlock";

// Home jest w pełni przetłumaczone przez słownik UI → DE zawsze (hasDe: true).
// generateMetadata na poziomie strony nadpisuje statyczne metadata z layoutu
// dla "/". canonical = self per locale, og:locale dopasowany.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.meta.homeTitle,
    alternates: {
      canonical: localizePath("/", locale),
      languages: alternatesFor("/", { hasDe: true }).languages,
    },
    openGraph: {
      locale: locale === "de" ? "de_DE" : "pl_PL",
    },
  };
}

// Polski poprawnik typograficzny: ostatnia pojedyncza litera (np. "L", "U")
// nigdy nie powinna zawijać się na nową linię ("sierota"). Zamieniamy ostatnią
// spację+literę na non-breaking space + literę, żeby trzymały się razem.
function protectOrphans(text: string): string {
  return text.replace(/ ([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż])$/, " $1");
}

// Klasa grid dla i-tego zdjęcia w mozaice kolekcji (do 4 zdjęć). Pojedyncze
// zdjęcie wypełnia całość, dwa dzielą się na pół wysokości, przy trzech
// pierwsze zajmuje cały górny wiersz, przy czterech siatka 2×2.
function mosaicTileClass(total: number, index: number): string {
  if (total === 1) return "col-span-2 row-span-2";
  if (total === 2) return "col-span-1 row-span-2";
  if (total === 3 && index === 0) return "col-span-2";
  return "";
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [dbSlides, dbTiles, featured, allCategories, collectionsForHome, wishlistIds, rate, dbBlocks] =
    await Promise.all([
      getActiveSlides(),
      getActiveTiles(),
      getFeaturedOrFallback(locale),
      getCategories(locale),
      getCollectionsForHome(locale),
      getUserWishlistIds(),
      getEurRate(),
      getHomeBlocks(),
    ]);
  const blocks = dbBlocks
    .map((b) => localizeBlock(b, locale))
    .filter((b): b is LocalizedBlock => b !== null);
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));
  // Fallback gdy admin jeszcze nic nie dodał — żeby home nie była pusta.
  // localizeSlide/localizeTile tłumaczą treść (DB i fallback) na DE przez mapy.
  const slides = (dbSlides.length > 0 ? dbSlides : [DEFAULT_FALLBACK_SLIDE]).map(
    (s) => localizeSlide(s, locale)
  );
  const tiles = (dbTiles.length > 0 ? dbTiles : DEFAULT_FALLBACK_TILES).map((tile) =>
    localizeTile(tile, locale)
  );

  // Nagłówek+eyebrow sekcji z bazy; null/pusty → blok nagłówka pomijany.
  function sectionHeader(s: { heading: string | null; subheading: string | null }) {
    if (!s.heading && !s.subheading) return null;
    return (
      <div className="text-center mb-16">
        {s.subheading && (
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
            {s.subheading}
          </p>
        )}
        {s.heading && (
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
            {s.heading}
          </h2>
        )}
      </div>
    );
  }

  function renderBlock(b: LocalizedBlock): ReactNode {
    switch (b.type) {
      case "hero":
        // Hero — slider z auto-rotacją (6s) i nawigacją (strzałki + kropki)
        return <HomeHeroSlider slides={slides} />;

      case "tiles":
        // Kategorie
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tiles.map((tile) => (
                <LocalizedLink
                  key={tile.id}
                  href={tile.href}
                  className="group relative aspect-[4/3] sm:aspect-square rounded-2xl overflow-hidden bg-[var(--color-navy)] hover:ring-2 hover:ring-[var(--color-gold)] transition-all"
                >
                  {tile.image_url ? (
                    <Image
                      src={tile.image_url}
                      alt={tile.image_alt}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="relative h-full p-4 sm:p-5 md:p-6 flex flex-col justify-end gap-1.5 sm:gap-2">
                    {/* Wrapper z min-h = 2 linie tekstu × leading-tight (1.25) ≈ 2.5em.
                        Single-line tytuł rezerwuje miejsce na 2 linie, items-end
                        dokuje tekst do dołu — wszystkie kafelki wyrównane bez
                        względu na długość etykiety. */}
                    <span className="flex items-end min-h-[2.5em] text-lg sm:text-xl md:text-2xl">
                      <span className="font-display font-bold text-white leading-tight text-balance break-words hyphens-auto group-hover:text-[var(--color-gold)] transition-colors">
                        {protectOrphans(tile.label)}
                      </span>
                    </span>
                    {tile.description && (
                      <span className="hidden sm:block text-sm text-white/80 leading-snug">
                        {tile.description}
                      </span>
                    )}
                    <span className="mt-1 text-[10px] sm:text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
                      {t.home.tileDiscover}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </LocalizedLink>
              ))}
            </div>
          </section>
        );

      case "featured":
        // Polecane
        return (
          <section className="py-24">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-end justify-between mb-16">
                <div>
                  {b.heading && (
                    <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                      {b.heading}
                    </h2>
                  )}
                </div>
                <LocalizedLink
                  href="/sklep"
                  className="hidden md:inline-flex text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
                >
                  {t.home.seeAll}
                </LocalizedLink>
              </div>

              {featured.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  {t.home.featuredEmpty}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {featured.map(({ product, badge }) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      badge={badge}
                      categoryLabel={categoryLabels.get(product.category)}
                      isInWishlist={wishlistIds.has(product.id)}
                      locale={locale}
                      rate={rate}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        );

      case "trust_bar":
        // Pasek zaufania — dlaczego warto kupować u nas (spec 2026-07-06)
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            <TrustBar withHeading locale={locale} heading={b.heading} eyebrow={b.subheading} />
          </section>
        );

      case "collections":
        // Nasze kolekcje — auto-render kolekcji z DB które mają produkty
        if (collectionsForHome.length === 0) return null;
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {collectionsForHome.map(({ collection, sampleProducts }) => (
                <LocalizedLink
                  key={collection.id}
                  href={`/sklep?kolekcja=${collection.slug}`}
                  className="group flex flex-col bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
                >
                  {/* Mozaika do 4 zdjęć produktów z kolekcji */}
                  <div className="relative aspect-[4/3] grid grid-cols-2 gap-1 p-1 bg-stone-100 dark:bg-stone-900">
                    {sampleProducts.slice(0, 4).map((p, i) => (
                      <div
                        key={p.id}
                        className={`relative bg-stone-200 dark:bg-stone-800 rounded-lg overflow-hidden ${mosaicTileClass(
                          sampleProducts.length,
                          i
                        )}`}
                      >
                        {p.images?.[0] && (
                          <Image
                            src={p.images[0]}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition-transform group-hover:scale-105"
                          />
                        )}
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
                      {t.home.seeCollection} ({sampleProducts.length}{" "}
                      {pluralForm(sampleProducts.length, {
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
            </div>
          </section>
        );
    }

    // Bloki treściowe — wspólny dispatcher.
    return <ContentBlock block={b} locale={locale} />;
  }

  return (
    <>
      {blocks
        .filter((b) => b.visible)
        .map((b) => (
          <Fragment key={b.id}>{renderBlock(b)}</Fragment>
        ))}
    </>
  );
}
