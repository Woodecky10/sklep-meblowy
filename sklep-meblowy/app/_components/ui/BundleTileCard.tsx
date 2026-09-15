import Image from "next/image";
import LocalizedLink from "./LocalizedLink";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pluralForm } from "@/app/_lib/plural";
import { formatMoney } from "@/app/_lib/money";
import { mosaicTileClass } from "@/app/_lib/mosaic";
import { extractShortDescription } from "@/app/_lib/product-html";
import type { BundleTile } from "@/app/_lib/bundle-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Kafelek zestawu — ten sam na liście /zestawy i w sekcji na stronie głównej.
// Wygląd 1:1 z kafelkiem kolekcji (mozaika ze zdjęć składników, nazwa, opis,
// wiersz akcji), plus to, co odróżnia zestaw: liczba mebli i cena „od" z
// oszczędnością — liczone tak samo jak w boxie na karcie produktu
// (bundle-tiles.ts → minBundlePricing). Komponent serwerowy bez hooków: kurs
// EUR przychodzi w propsie, bo nic tu nie klika.
export default function BundleTileCard({
  tile,
  locale,
  rate,
}: {
  tile: BundleTile;
  locale: Locale;
  rate: number;
}) {
  const t = getDictionary(locale);
  const { bundle, thumbnails, componentCount, pricing } = tile;
  // Opis zestawu to HTML z edytora WYSIWYG — na kafelku tylko pierwszy akapit.
  const short = extractShortDescription(bundle.description, 140);

  return (
    <LocalizedLink
      href={`/zestaw/${bundle.slug}`}
      className="group flex flex-col bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
    >
      {/* Mozaika ze zdjęć składników (do 4) — jak kafelek kolekcji */}
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
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform group-hover:scale-105"
            />
          </div>
        ))}
      </div>

      <div className="p-6 flex flex-col gap-2">
        <p className="font-sans text-xs uppercase tracking-widest text-[var(--muted)]">
          {componentCount}{" "}
          {pluralForm(componentCount, {
            one: t.home.furnitureOne,
            few: t.home.furnitureFew,
            many: t.home.furnitureMany,
          })}
        </p>
        <h3 className="font-display text-2xl font-bold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
          {bundle.name}
        </h3>
        {short && (
          <p className="text-sm text-[var(--muted)] leading-snug line-clamp-2">{short}</p>
        )}

        <div className="mt-2 pt-3 border-t border-[var(--border)] flex flex-col gap-1">
          <p className="text-sm text-[var(--fg)]">
            {t.bundle.bundlePriceFrom}{" "}
            <strong className="font-sans">{formatMoney(pricing.discounted, locale, rate)}</strong>{" "}
            <span className="text-[var(--muted)] line-through">
              {formatMoney(pricing.base, locale, rate)}
            </span>
          </p>
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
            {t.bundle.savesFrom} {formatMoney(pricing.savings, locale, rate)}
          </p>
        </div>

        <span className="mt-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
          {t.bundle.see}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </LocalizedLink>
  );
}
