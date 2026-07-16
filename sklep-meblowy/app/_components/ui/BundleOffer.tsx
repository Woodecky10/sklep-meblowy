"use client";

// Box „Kup w zestawie" na karcie produktu — widoczny od razu (pod
// ProductActions). Max 3 zestawy; klik otwiera modal z konfiguratorem,
// link prowadzi na stronę zestawu. Modal reużywa wspólny shell `Modal`
// (useModal: scroll-lock tła, Escape, focus-trap) — spójnie z InquiryModal.

import { useState } from "react";
import Image from "next/image";
import type { BundleWithComponents, Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { minBundleSavings } from "@/app/_lib/bundles";
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
        const others = b.components.filter((p) => p.id !== currentProduct.id);
        const savings = minBundleSavings(
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
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3">
                {others.slice(0, 3).map((p) =>
                  p.images?.[0] ? (
                    <Image
                      key={p.id}
                      src={p.images[0]}
                      alt={p.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[var(--card-bg)]"
                    />
                  ) : null
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--fg)] font-semibold truncate">{b.name}</p>
                <p className="text-xs text-[var(--muted)] truncate">
                  {t.bundle.withProducts} {others.map((p) => p.name).join(", ")}
                </p>
              </div>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
              {t.bundle.savesFrom} {formatMoney(savings, locale, rate)}
            </p>
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
