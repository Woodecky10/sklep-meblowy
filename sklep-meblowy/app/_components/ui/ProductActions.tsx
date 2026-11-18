"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Product } from "@/app/_lib/types";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { missingVariantOptions } from "@/app/_lib/variant-missing";
import { scrollToFirstMissing } from "@/app/_lib/scroll-to-missing";
import {
  hasVariants,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";
import MissingOptionsHint from "./MissingOptionsHint";

// Produkty robione na zamówienie — bez limitów magazynowych.
// Walidujemy tylko kompletność wyboru wariantu i liczymy dynamiczną cenę
// z ewentualnym modyfikatorem (np. droższy kolor).
//
// Komponent jest kontrolowany — selected/onChange trzyma parent
// (ProductMainSection), żeby galeria zdjęć mogła reagować na wybór wariantu.
export default function ProductActions({
  product,
  selected,
  onChange,
  addToCartLabel,
  buyNowLabel,
}: {
  product: Product;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // Zlokalizowane etykiety CTA — przekazywane z ProductMainSection (client),
  // bo komponenty "use client" nie wołają getLocale().
  addToCartLabel?: string;
  buyNowLabel?: string;
}) {
  const showVariants = hasVariants(product);
  const price = getVariantEffectivePrice(product, selected);
  const locale = useClientLocale();
  const missing = showVariants ? missingVariantOptions(product, selected, locale) : [];
  const hintId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Liczba prób dodania przy niepełnym wyborze: >0 = pokaż podświetlenie,
  // a każda kolejna próba znów przewija do pierwszej brakującej opcji.
  const [attemptTick, setAttemptTick] = useState(0);
  const attempted = attemptTick > 0;

  useEffect(() => {
    if (attemptTick > 0) scrollToFirstMissing(ref.current);
  }, [attemptTick]);

  const buttonProps = {
    needsVariant: missing.length > 0,
    onMissingVariant: () => setAttemptTick((n) => n + 1),
    describedById: missing.length ? hintId : undefined,
  };

  return (
    <div ref={ref} className="flex flex-col gap-6">
      {/* Cenę (jedną, aktualną dla wybranego wariantu) wyświetla parent
          (ProductMainSection) — bez przekreślania bazowej: wzrost ceny
          wariantu wyglądał jak odwrócona promocja. */}
      {showVariants && (
        <VariantSelector
          product={product}
          variants={product.variants!}
          selected={selected}
          onChange={onChange}
          highlightMissing={attempted}
        />
      )}

      <MissingOptionsHint
        id={hintId}
        groups={missing.length ? [{ labels: missing.map((m) => m.label) }] : []}
        attempted={attempted}
      />

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        {...buttonProps}
        addToCartLabel={addToCartLabel}
      />

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        {...buttonProps}
        buyNow
        buyNowLabel={buyNowLabel}
      />
    </div>
  );
}
