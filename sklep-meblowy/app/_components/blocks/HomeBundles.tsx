import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import BundleTileCard from "@/app/_components/ui/BundleTileCard";
import { getDictionary } from "@/app/_lib/dictionaries";
import { HOME_BUNDLES_VISIBLE, type BundleTile } from "@/app/_lib/bundle-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Sekcja „Zestawy mebli" na stronie głównej: pierwsze HOME_BUNDLES_VISIBLE
// kafelków i ZAWSZE link do pełnej listy /zestawy. Inaczej niż kolekcje
// (HomeCollections.tsx), które zwijają nadwyżkę na miejscu — one nie mają
// własnej podstrony, zestawy mają. Komponent serwerowy: nic tu nie klika,
// więc ceny formatujemy z kursem po stronie serwera. Nagłówek sekcji i uchwyt
// id="home-bundles" (e2e/home-bundles.spec.ts) stoją w app/page.tsx.
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
  const visible = tiles.slice(0, HOME_BUNDLES_VISIBLE);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((tile) => (
          <BundleTileCard key={tile.bundle.id} tile={tile} locale={locale} rate={rate} />
        ))}
      </div>

      <div className="flex justify-center mt-10">
        <LocalizedLink
          href="/zestawy"
          className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
        >
          {t.home.bundlesSeeAll}
          {tiles.length > HOME_BUNDLES_VISIBLE ? ` (${tiles.length})` : ""}
        </LocalizedLink>
      </div>
    </>
  );
}
