import { Fragment, type ReactNode } from "react";
import LocalizedLink from "./_components/ui/LocalizedLink";
import Image from "next/image";
import type { Metadata } from "next";
import HomeHeroSlider from "./_components/layout/HomeHeroSlider";
import { getActiveSlides, DEFAULT_FALLBACK_SLIDE, localizeSlide } from "./_lib/slides";
import { getActiveTiles, DEFAULT_FALLBACK_TILES, localizeTile } from "./_lib/home-tiles";
import { getFeaturedOrFallback } from "./_lib/featured";
import { getCategories } from "./_lib/categories";
import { getCollectionTilesForHome } from "./_lib/collections";
import { getUserWishlistIds } from "./_lib/wishlist";
import { getLocale } from "./_lib/i18n-server";
import { getEurRate } from "./_lib/store-settings";
import { localizePath } from "./_lib/i18n";
import { alternatesFor } from "./_lib/sitemap-i18n";
import { baseOpenGraph } from "./_lib/seo-og";
import { getDictionary } from "./_lib/dictionaries";
import ProductCard from "./_components/ui/ProductCard";
import ReviewCard from "./_components/ui/ReviewCard";
import ProductCarousel from "./_components/ui/ProductCarousel";
import { getHomepageReviews } from "./_lib/reviews";
import TrustBar from "./_components/ui/TrustBar";
import { localizeBlock, type LocalizedBlock } from "./_lib/blocks";
import { getHomeBlocks } from "./_lib/blocks-server";
import ContentBlock from "./_components/blocks/ContentBlock";
import HomeCollections from "./_components/blocks/HomeCollections";
import AboutStore from "./_components/blocks/AboutStore";
import { getSiteTexts, siteText } from "./_lib/site-texts";

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
    // Pełny blok OG (z obrazkiem) — samo `locale` gubiło og:image i og:site_name
    // z layoutu, bo Next nadpisuje `openGraph` w całości. Patrz seo-og.ts.
    openGraph: baseOpenGraph(locale),
  };
}

// Polski poprawnik typograficzny: ostatnia pojedyncza litera (np. "L", "U")
// nigdy nie powinna zawijać się na nową linię ("sierota"). Zamieniamy ostatnią
// spację+literę na non-breaking space + literę, żeby trzymały się razem.
function protectOrphans(text: string): string {
  return text.replace(/ ([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż])$/, " $1");
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [
    dbSlides,
    dbTiles,
    featured,
    allCategories,
    collectionTiles,
    wishlistIds,
    rate,
    dbBlocks,
    siteTexts,
    homepageReviews,
  ] = await Promise.all([
    getActiveSlides(),
    getActiveTiles(),
    getFeaturedOrFallback(locale),
    getCategories(locale),
    getCollectionTilesForHome(locale),
    getUserWishlistIds(),
    getEurRate(),
    getHomeBlocks(),
    getSiteTexts(),
    getHomepageReviews(locale),
  ]);
  // Pusty fallback celowo — brak wpisu w panelu obsługuje AboutStore, sięgając
  // po tekst domyślny ze słownika (i po właściwy język).
  const aboutHtml = siteText(siteTexts, "home_about", locale, "");
  const blocks = dbBlocks
    .map((b) => localizeBlock(b, locale))
    .filter((b): b is LocalizedBlock => b !== null);
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));
  const hasTrustBar = blocks.some((b) => b.visible && b.type === "trust_bar");
  // h1 wisi pod hero. Gdyby blok hero wyłączono w panelu, strona zostałaby bez
  // jedynego h1 — i bez zdania wyjaśniającego, czym jest sklep.
  const hasHero = blocks.some((b) => b.visible && b.type === "hero");

  function purposeHeading() {
    return (
      <section className="max-w-3xl mx-auto px-6 pt-10 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-[var(--fg)]">
          {t.home.h1}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
          {t.home.h1Lead}
        </p>
      </section>
    );
  }

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
        // Hero — slider z auto-rotacją (6s) i nawigacją (strzałki + kropki).
        // Pod nim JEDYNY <h1> strony. Historia w trzech krokach: do 2026-08-10
        // home nie miała h1 wcale, a nad zgięciem stały same hasła („Meble,
        // które opowiadają historię"), przez co weryfikacja marki Google
        // odrzucała ją z powodem „strona główna nie wyjaśnia celu aplikacji";
        // 2026-08-17 h1 usunięto na polecenie właściciela; 2026-08-31 wrócił —
        // też decyzją właściciela, z treścią dobraną pod realne frazy
        // z Search Console. NIE zamieniać go na hasło marketingowe.
        // Tekst jest wyciszony, ale nie ukryty — ukrycie Google traktuje
        // jak cloaking.
        //
        // Slajdy slidera są celowo <h2>, nie <h1>: slider trzyma wszystkie
        // slajdy w DOM naraz, więc jako h1 dawały ich cztery. Nie zamieniać
        // ich z powrotem na h1 — to był pre-existing defekt SEO.
        return (
          <>
            <HomeHeroSlider slides={slides} />
            {purposeHeading()}
          </>
        );

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
        // Pasek zaufania — dlaczego warto kupować u nas (spec 2026-07-06).
        // `intro` dokłada opis sklepu wymagany przez weryfikację marki Google —
        // tematycznie to ta sama sekcja („kim jesteśmy"), więc nie wygląda jak
        // doklejony blok SEO. Zapas na wypadek wyłączenia paska: niżej.
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            <TrustBar
              withHeading
              locale={locale}
              heading={b.heading}
              eyebrow={b.subheading}
              intro={<AboutStore locale={locale} html={aboutHtml} />}
            />
          </section>
        );

      case "collections":
        // Nasze kolekcje — auto-render kolekcji z DB które mają aktywne produkty.
        // Zwijanie i markup kafelka: _components/blocks/HomeCollections.tsx
        if (collectionTiles.length === 0) return null;
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <HomeCollections tiles={collectionTiles} locale={locale} />
          </section>
        );

      case "customer_reviews":
        // Brak pasujących opinii → NIC. Pusty slider z nagłówkiem „Co mówią
        // klienci" wygląda gorzej niż jego brak, a taki właśnie jest stan do
        // pierwszej zatwierdzonej opinii.
        if (homepageReviews.length === 0) return null;
        return (
          <section id="home-reviews" className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <ProductCarousel prevLabel={t.a11y.prevReviews} nextLabel={t.a11y.nextReviews}>
              {homepageReviews.map((r) => (
                <ReviewCard key={r.id} review={r} locale={locale} />
              ))}
            </ProductCarousel>
            <div className="mt-12 text-center">
              <LocalizedLink
                href="/opinie"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--border)] font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent transition-colors"
              >
                {t.home.reviewsSeeAll}
              </LocalizedLink>
            </div>
          </section>
        );
    }

    // Bloki treściowe — wspólny dispatcher.
    return <ContentBlock block={b} locale={locale} />;
  }

  return (
    <>
      {!hasHero && purposeHeading()}
      {blocks
        .filter((b) => b.visible)
        .map((b) => (
          <Fragment key={b.id}>{renderBlock(b)}</Fragment>
        ))}

      {/* Zapasowe wyjście dla opisu sklepu. Normalnie jest on wstępem paska
          zaufania, ale ten pasek da się wyłączyć w panelu — a na opisie wisi
          weryfikacja marki Google, więc nie może zniknąć razem z paskiem. */}
      {!hasTrustBar && (
        <section className="max-w-7xl mx-auto px-6 py-24">
          <AboutStore locale={locale} html={aboutHtml} withHeading />
        </section>
      )}
    </>
  );
}
