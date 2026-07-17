"use client";

// Box „Kup w zestawie" na karcie produktu — widoczny od razu (pod
// ProductActions). Max 3 zestawy; pokazuje PEŁNY skład zestawu (miniatura +
// nazwa + cena „od" per składnik) — składniki inne niż bieżący produkt
// linkują bezpośrednio na ich karty, bieżący oznaczony „ten produkt".
// Pod składem: cena zestawu po rabacie (przekreślona suma) + oszczędność.
// „Kup w zestawie" otwiera modal z konfiguratorem, „Zobacz zestaw" prowadzi
// na stronę zestawu. Modal reużywa wspólny shell `Modal` (useModal:
// scroll-lock tła, Escape, focus-trap) — spójnie z InquiryModal.

import { useState } from "react";
import Image from "next/image";
import type { BundleWithComponents, Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { minBundlePricing } from "@/app/_lib/bundles";
import BundleConfigurator from "./BundleConfigurator";
import LocalizedLink from "./LocalizedLink";
import { Modal } from "./Modal";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

export default function BundleOffer({
  bundles,
  currentProduct,
  selected,
}: {
  bundles: BundleWithComponents[];
  currentProduct: Product;
  // Aktualnie wybrane opcje bieżącego produktu (z ProductMainSection) —
  // pre-wypełniają jego konfigurację w modalu.
  selected: Record<string, string>;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (bundles.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {bundles.map((b) => {
        const pricing = minBundlePricing(
          b.components.map((p) => effectivePrice(Number(p.price), p.sale_price)),
          b.discount_type,
          Number(b.discount_value)
        );
        return (
          <div
            key={b.id}
            className="p-5 border-2 border-[var(--color-gold)]/50 rounded-2xl bg-[var(--card-bg)] flex flex-col gap-3"
          >
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
              {t.bundle.badge}
            </p>
            <p className="text-sm text-[var(--fg)] font-semibold">{b.name}</p>

            {/* Skład zestawu: każdy składnik z miniaturą, nazwą i ceną „od";
                bieżący produkt bez linku (oznaczony), pozostałe klikalne. */}
            <ul className="flex flex-col">
              {b.components.map((p, i) => {
                const isCurrent = p.id === currentProduct.id;
                const price = effectivePrice(Number(p.price), p.sale_price);
                const row = (
                  <div className="flex items-center gap-3 py-1.5">
                    <Image
                      src={p.images?.[0] ?? "/placeholder.jpg"}
                      alt={p.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-lg object-cover border border-[var(--border)] shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-sm text-[var(--fg)] line-clamp-2">
                      {p.name}
                      {isCurrent && (
                        <span className="ml-2 text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] whitespace-nowrap">
                          ({t.bundle.thisProduct})
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm text-[var(--muted)]">
                      {formatMoney(price, locale, rate)}
                    </span>
                    {!isCurrent && (
                      <span aria-hidden className="shrink-0 text-[var(--muted)]">
                        →
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={p.id}>
                    {i > 0 && (
                      <div
                        aria-hidden
                        className="pl-5 text-[var(--muted)] text-sm leading-none"
                      >
                        +
                      </div>
                    )}
                    {isCurrent ? (
                      row
                    ) : (
                      <LocalizedLink
                        href={`/produkt/${p.id}`}
                        aria-label={`${p.name} — ${formatMoney(price, locale, rate)}`}
                        className="block rounded-lg -mx-2 px-2 hover:bg-[var(--bg)] transition-colors"
                      >
                        {row}
                      </LocalizedLink>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-1">
              <p className="text-sm text-[var(--fg)]">
                {t.bundle.bundlePriceFrom}{" "}
                <strong className="font-sans">
                  {formatMoney(pricing.discounted, locale, rate)}
                </strong>{" "}
                <span className="text-[var(--muted)] line-through">
                  {formatMoney(pricing.base, locale, rate)}
                </span>
              </p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
                {t.bundle.savesFrom} {formatMoney(pricing.savings, locale, rate)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenSlug(b.slug)}
                className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
              >
                {t.bundle.buy}
              </button>
              <LocalizedLink
                href={`/zestaw/${b.slug}`}
                className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
              >
                {t.bundle.see} →
              </LocalizedLink>
            </div>

            <Modal
              open={openSlug === b.slug}
              onClose={() => setOpenSlug(null)}
              ariaLabel={b.name}
              eyebrow={t.bundle.badge}
              heading={b.name}
              closeLabel={t.common.close}
            >
              <BundleConfigurator
                bundle={b}
                initialSelections={{ [currentProduct.id]: selected }}
                onAdded={() => setOpenSlug(null)}
              />
            </Modal>
          </div>
        );
      })}
    </div>
  );
}
