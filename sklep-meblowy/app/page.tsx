import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import HomeHeroSlider from "./_components/layout/HomeHeroSlider";
import { getActiveSlides, DEFAULT_FALLBACK_SLIDE } from "./_lib/slides";
import { getActiveTiles, DEFAULT_FALLBACK_TILES } from "./_lib/home-tiles";
import { getFeaturedOrFallback } from "./_lib/featured";
import { getCategories } from "./_lib/categories";
import ProductCard from "./_components/ui/ProductCard";

export const metadata: Metadata = {
  title: "Meble Premium | Eleganckie Meble do Twojego Domu",
};

export default async function HomePage() {
  const [dbSlides, dbTiles, featured, allCategories] = await Promise.all([
    getActiveSlides(),
    getActiveTiles(),
    getFeaturedOrFallback(),
    getCategories(),
  ]);
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));
  // Fallback gdy admin jeszcze nic nie dodał — żeby home nie była pusta.
  const slides = dbSlides.length > 0 ? dbSlides : [DEFAULT_FALLBACK_SLIDE];
  const tiles = dbTiles.length > 0 ? dbTiles : DEFAULT_FALLBACK_TILES;

  return (
    <>
      {/* Hero — slider z auto-rotacją (6s) i nawigacją (strzałki + kropki) */}
      <HomeHeroSlider slides={slides} />

      {/* Kategorie */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
            Kolekcje
          </p>
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
            Znajdź swój styl
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tiles.map((tile) => (
            <Link
              key={tile.id}
              href={tile.href}
              className="group relative aspect-square rounded-2xl overflow-hidden bg-[var(--color-navy)] hover:ring-2 hover:ring-[var(--color-gold)] transition-all"
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
              <div className="relative h-full p-6 flex flex-col justify-end gap-2">
                <span className="font-display text-2xl font-bold text-white leading-tight group-hover:text-[var(--color-gold)] transition-colors">
                  {tile.label}
                </span>
                {tile.description && (
                  <span className="text-sm text-white/80 leading-snug">
                    {tile.description}
                  </span>
                )}
                <span className="mt-1 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
                  Odkryj
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Polecane */}
      <section className="bg-[var(--card-bg)] border-y border-[var(--border)] py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-16">
            <div>
              <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                Polecane produkty
              </h2>
            </div>
            <Link
              href="/sklep"
              className="hidden md:inline-flex text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
            >
              Wszystkie →
            </Link>
          </div>

          {featured.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Brak polecanych produktów. Wybierz je w Admin → Polecane.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featured.map(({ product, badge }) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  badge={badge}
                  categoryLabel={categoryLabels.get(product.category)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Banner promocyjny */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="rounded-3xl bg-[var(--color-navy)] px-12 py-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
              Oferta limitowana
            </p>
            <h3 className="font-display text-3xl md:text-4xl font-bold text-white max-w-md">
              Do 30% taniej na wybrane modele
            </h3>
          </div>
          <Link
            href="/sklep?wyprzedaz=true"
            className="shrink-0 px-8 py-4 bg-[var(--color-gold)] text-[var(--color-navy)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold-light)] transition-colors"
          >
            Skorzystaj z oferty
          </Link>
        </div>
      </section>
    </>
  );
}
