"use client";

import { useState } from "react";
import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pluralForm } from "@/app/_lib/plural";
// Uwaga: z "@/app/_lib/collection-tiles" (czysty moduł), NIE z
// "@/app/_lib/collections" (ma `import "server-only"` i next/cache/next/headers
// — import wartości stąd w komponencie "use client" wciągnąłby je do bundla
// przeglądarki i wysadził build).
import { HOME_COLLECTIONS_VISIBLE, type CollectionTile } from "@/app/_lib/collection-tiles";
import type { Locale } from "@/app/_lib/i18n";

// Klasa grid dla i-tego zdjęcia w mozaice kolekcji (do 4 zdjęć). Pojedyncze
// zdjęcie wypełnia całość, dwa dzielą się na pół wysokości, przy trzech
// pierwsze zajmuje cały górny wiersz, przy czterech siatka 2×2.
// Przeniesione z app/page.tsx razem z markupem kafelka.
function mosaicTileClass(total: number, index: number): string {
  if (total === 1) return "col-span-2 row-span-2";
  if (total === 2) return "col-span-1 row-span-2";
  if (total === 3 && index === 0) return "col-span-2";
  return "";
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6";
const REST_ID = "home-collections-rest";

// Sekcja "Nasze kolekcje". Pierwsze HOME_COLLECTIONS_VISIBLE kafelków widać od
// razu, nadwyżka siedzi w drugim kontenerze do kliknięcia.
export default function HomeCollections({
  tiles,
  locale,
}: {
  tiles: CollectionTile[];
  locale: Locale;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = getDictionary(locale);

  const visible = tiles.slice(0, HOME_COLLECTIONS_VISIBLE);
  const rest = tiles.slice(HOME_COLLECTIONS_VISIBLE);

  function card({ collection, thumbnails, productCount }: CollectionTile) {
    return (
      <LocalizedLink
        key={collection.id}
        href={`/sklep?kolekcja=${collection.slug}`}
        className="group flex flex-col bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
      >
        {/* Mozaika do 4 zdjęć produktów z kolekcji */}
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
          <h3 className="font-display text-2xl font-bold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
            {collection.label}
          </h3>
          {collection.description && (
            <p className="text-sm text-[var(--muted)] leading-snug line-clamp-2">
              {collection.description}
            </p>
          )}
          <span className="mt-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
            {t.home.seeCollection} ({productCount}{" "}
            {pluralForm(productCount, {
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
    );
  }

  return (
    <>
      <div className={GRID}>{visible.map(card)}</div>

      {rest.length > 0 && (
        <>
          {/*
            UKRYCIE MUSI BYĆ `hidden` (display: none), NIE opacity-0 ani
            max-height: 0. Tylko wtedy przeglądarka nie pobiera leniwych zdjęć
            (next/image domyślnie loading="lazy") ze schowanego kontenera.
            Przy opacity-0 wszystkie zdjęcia ładują się normalnie i cały zysk
            przepada — NIEWIDOCZNIE, bo wizualnie zachowanie jest identyczne.
            Pilnuje tego e2e/home-collections.spec.ts.
          */}
          <div id={REST_ID} className={expanded ? `${GRID} mt-6` : "hidden"}>
            {rest.map(card)}
          </div>

          <div className="flex justify-center mt-10">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={REST_ID}
              className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
            >
              {expanded
                ? t.home.collectionsCollapse
                : `${t.home.collectionsShowAll} (+${rest.length})`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
