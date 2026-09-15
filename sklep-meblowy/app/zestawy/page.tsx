import type { Metadata } from "next";
import { getVisibleBundleTiles } from "@/app/_lib/bundles-server";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import BundleTileCard from "@/app/_components/ui/BundleTileCard";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Lista zestawów (2026-09-15): kafelki WSZYSTKICH widocznych zestawów — ten sam
// kafelek co sekcja na stronie głównej (HomeBundles.tsx pokazuje pierwsze 3
// i linkuje tutaj). Route statyczny — slug „zestawy" zarezerwowany w pages.ts,
// żeby podstrona CMS o tej nazwie nie mogła go przykryć (drift-guard w
// pages.test.ts). Pojedynczy zestaw: /zestaw/[slug].
//
// Zestaw nie ma własnej kolejności ani zdjęcia (decyzja z brainstormingu:
// oba wymagałyby migracji, odłożone) — porządek to „najnowsze pierwsze".

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.bundlesPage.heading,
    description: t.bundlesPage.intro,
    alternates: {
      canonical: localizePath("/zestawy", locale),
      languages: alternatesFor("/zestawy", { hasDe: true }).languages,
    },
  };
}

export default async function ZestawyPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [tiles, rate] = await Promise.all([getVisibleBundleTiles(locale), getEurRate()]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="text-center mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          {t.bundlesPage.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">{t.bundlesPage.heading}</h1>
        <p className="text-sm text-[var(--muted)] mt-4 max-w-2xl mx-auto leading-relaxed">
          {t.bundlesPage.intro}
        </p>
      </div>

      {tiles.length === 0 ? (
        // Pusty stan zamiast gołej strony: właściciel może wyłączyć wszystkie
        // zestawy, a link z menu i sitemapy nadal tu prowadzi.
        <p className="text-center text-[var(--muted)]">
          {t.bundlesPage.empty}{" "}
          <LocalizedLink href="/sklep" className="text-[var(--color-gold)] hover:underline">
            {t.nav.shop} →
          </LocalizedLink>
        </p>
      ) : (
        // id = uchwyt dla e2e/home-bundles.spec.ts (liczy kafelki listy).
        <div id="bundles-list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tiles.map((tile) => (
            <BundleTileCard key={tile.bundle.id} tile={tile} locale={locale} rate={rate} />
          ))}
        </div>
      )}
    </div>
  );
}
