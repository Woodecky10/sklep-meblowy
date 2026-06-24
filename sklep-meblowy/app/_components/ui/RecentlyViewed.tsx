"use client";

import { useEffect, useReducer } from "react";
import LocalizedLink from "./LocalizedLink";
import Image from "next/image";
import {
  addRecentlyViewed,
  RECENTLY_VIEWED_LS_KEY,
  type RecentlyViewedItem,
} from "@/app/_lib/recently-viewed";
import { DEFAULT_LOCALE, type Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

// Sekcja „Ostatnio oglądane" na stronie produktu. Czyta snapshoty z
// localStorage (wzorzec jak CartContext), dopisuje bieżący produkt na mount
// i pokazuje to, co oglądane WCZEŚNIEJ (bez bieżącego). Gdy nic wcześniej nie
// oglądano — nie renderuje nic. `current.category` to gotowy label (nie slug).
export default function RecentlyViewed({
  current,
  locale = DEFAULT_LOCALE,
}: {
  current: RecentlyViewedItem;
  locale?: Locale;
}) {
  // useReducer (nie useState) — synchroniczny setState w efekcie łamie regułę
  // react-hooks/set-state-in-effect; dispatch jej nie łamie (wzorzec hydracji
  // z localStorage jak w CartContext). Reducer tylko podstawia świeżą listę.
  const [items, hydrate] = useReducer(
    (_prev: RecentlyViewedItem[], next: RecentlyViewedItem[]) => next,
    []
  );

  useEffect(() => {
    let stored: RecentlyViewedItem[] = [];
    try {
      const raw = localStorage.getItem(RECENTLY_VIEWED_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) stored = parsed;
      }
    } catch {
      // Uszkodzony JSON — ignorujemy.
    }
    // Pokazujemy to, co oglądane PRZED bieżącym produktem.
    hydrate(stored.filter((p) => p && p.id !== current.id));
    // Dopisujemy bieżący na początek (dedup + cap) i zapisujemy z powrotem.
    try {
      localStorage.setItem(
        RECENTLY_VIEWED_LS_KEY,
        JSON.stringify(addRecentlyViewed(stored, current))
      );
    } catch {
      // Brak miejsca / tryb prywatny — pomijamy zapis.
    }
  }, [current]);

  const rate = useEurRate();

  if (items.length === 0) return null;

  const t = getDictionary(locale);

  return (
    <section className="mt-24">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.product.recentlyViewedEyebrow}
        </p>
        <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
          {t.product.recentlyViewedHeading}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {items.map((p) => (
          <LocalizedLink key={p.id} href={`/produkt/${p.id}`} className="group flex flex-col">
            <div className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden mb-4">
              {p.image ? (
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-sm">
                  {t.common.noImage}
                </div>
              )}
            </div>
            <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
              {p.category}
            </p>
            <p className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors mb-2 leading-snug">
              {p.name}
            </p>
            <p className="font-sans font-bold text-[var(--fg)] mt-auto">
              {formatMoney(p.price, locale, rate)}
            </p>
          </LocalizedLink>
        ))}
      </div>
    </section>
  );
}
