"use client";

// Konfigurator zestawu: wybór opcji KAŻDEGO składnika (tkanina osobno per
// mebel — decyzja ze specu), cena i rabat na żywo, dodanie całej grupy do
// koszyka jedną akcją (ADD_BUNDLE). Reużywany przez modal na karcie produktu
// (Task 8) i stronę /zestaw/[slug] (Task 9).

import { useMemo, useState } from "react";
import Image from "next/image";
import type { BundleWithComponents } from "@/app/_lib/types";
import { useCart, type CartItem } from "@/app/_context/CartContext";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";
import { bundleUnitKey, computeBundleDiscount } from "@/app/_lib/bundles";
import VariantSelector from "./VariantSelector";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

export default function BundleConfigurator({
  bundle,
  initialSelections,
  onAdded,
}: {
  bundle: BundleWithComponents;
  // Pre-wypełnienie opcji (np. aktualnie wybrane opcje produktu, z którego
  // karty otwarto modal): mapa productId -> variantValues.
  initialSelections?: Record<string, Record<string, string>>;
  onAdded?: () => void;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const { addBundle } = useCart();

  const [selections, setSelections] = useState<Record<string, Record<string, string>>>(
    () => {
      const init: Record<string, Record<string, string>> = {};
      for (const p of bundle.components) init[p.id] = initialSelections?.[p.id] ?? {};
      return init;
    }
  );

  const allComplete = bundle.components.every((p) =>
    isVariantSelectionComplete(p, selections[p.id] ?? {})
  );

  const base = useMemo(
    () =>
      bundle.components.reduce(
        (s, p) => s + getVariantEffectivePrice(p, selections[p.id] ?? {}),
        0
      ),
    [bundle.components, selections]
  );
  const discount = computeBundleDiscount(
    base,
    1,
    bundle.discount_type,
    Number(bundle.discount_value)
  );

  function handleAdd() {
    if (!allComplete) return;
    const unitKey = bundleUnitKey(
      bundle.id,
      bundle.components.map((p) => ({
        productId: p.id,
        variantValues: selections[p.id],
      }))
    );
    const items: CartItem[] = bundle.components.map((p) => ({
      id: p.id,
      name: p.name,
      price: getVariantEffectivePrice(p, selections[p.id] ?? {}),
      image: p.images?.[0] ?? "",
      quantity: 1,
      variantValues: hasVariants(p) ? selections[p.id] : undefined,
      category: p.category,
      bundle: {
        id: bundle.id,
        name: bundle.name,
        unitKey,
        discountType: bundle.discount_type,
        discountValue: Number(bundle.discount_value),
      },
    }));
    addBundle(items);
    onAdded?.();
  }

  return (
    <div className="flex flex-col gap-6">
      {bundle.components.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-2xl">
          <div className="flex items-center gap-3">
            {p.images?.[0] && (
              <Image src={p.images[0]} alt={p.name} width={56} height={56}
                className="rounded-lg object-cover w-14 h-14" />
            )}
            <div>
              <p className="font-display font-semibold text-[var(--fg)]">{p.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatMoney(getVariantEffectivePrice(p, selections[p.id] ?? {}), locale, rate)}
              </p>
            </div>
          </div>
          {hasVariants(p) && (
            <VariantSelector
              product={p}
              variants={p.variants!}
              selected={selections[p.id] ?? {}}
              onChange={(next) => setSelections((prev) => ({ ...prev, [p.id]: next }))}
            />
          )}
        </div>
      ))}

      <div className="flex flex-col gap-1 text-sm font-sans border-t border-[var(--border)] pt-4">
        <div className="flex justify-between text-[var(--muted)]">
          <span>{t.bundle.togetherLabel}</span>
          <span className="line-through">{formatMoney(base, locale, rate)}</span>
        </div>
        <div className="flex justify-between font-bold text-base text-[var(--fg)]">
          <span>{t.bundle.bundleLabel}</span>
          <span>{formatMoney(Math.max(0, base - discount), locale, rate)}</span>
        </div>
        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
          <span>{t.bundle.saves}</span>
          <span>−{formatMoney(discount, locale, rate)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!allComplete}
        className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allComplete ? t.bundle.addToCart : t.bundle.chooseOptions}
      </button>
    </div>
  );
}
