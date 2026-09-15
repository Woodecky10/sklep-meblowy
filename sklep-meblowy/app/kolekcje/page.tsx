import type { Metadata } from "next";
import { getCollectionTilesForHome } from "@/app/_lib/collections";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import CollectionTileCard from "@/app/_components/ui/CollectionTileCard";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Lista kolekcji (2026-09-15): cel linku „Zobacz wszystkie kolekcje" ze
// slidera na home. Ten sam zbiór i kolejność, co slider — obie strony jedzą
// z getCollectionTilesForHome (widoczne w panelu + mające aktywne produkty,
// kolejność z przeciągania). Kafelek prowadzi do filtra /sklep?kolekcja=…,
// jak dotąd; kolekcja nie ma własnej strony. Route statyczny — slug
// „kolekcje" zarezerwowany w pages.ts (drift-guard w pages.test.ts).

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.collectionsPage.heading,
    description: t.collectionsPage.intro,
    alternates: {
      canonical: localizePath("/kolekcje", locale),
      languages: alternatesFor("/kolekcje", { hasDe: true }).languages,
    },
  };
}

export default async function KolekcjePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const tiles = await getCollectionTilesForHome(locale);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          {t.collectionsPage.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          {t.collectionsPage.heading}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-4 max-w-2xl mx-auto leading-relaxed">
          {t.collectionsPage.intro}
        </p>
      </div>

      {tiles.length === 0 ? (
        <p className="text-center text-[var(--muted)]">
          {t.collectionsPage.empty}{" "}
          <LocalizedLink href="/sklep" className="text-[var(--color-gold)] hover:underline">
            {t.nav.shop} →
          </LocalizedLink>
        </p>
      ) : (
        // id = uchwyt dla e2e/home-collections.spec.ts (porównuje z sliderem).
        <div id="collections-list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tiles.map((tile) => (
            <CollectionTileCard key={tile.collection.id} tile={tile} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
