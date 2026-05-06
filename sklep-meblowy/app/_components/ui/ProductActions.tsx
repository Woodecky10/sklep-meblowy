"use client";

import type { Product } from "@/app/_lib/types";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantPrice,
} from "@/app/_lib/variants";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";

// Akcje produktu — wybór wariantu, dynamiczna cena, dodaj do koszyka.
// State wybranego wariantu może być przekazany z zewnątrz (przez ProductMain),
// żeby galeria zdjęć też mogła reagować na wybór.
export default function ProductActions({
  product,
  selected,
  onSelectedChange,
}: {
  product: Product;
  selected: Record<string, string>;
  onSelectedChange: (next: Record<string, string>) => void;
}) {
  const showVariants = hasVariants(product);
  const complete = isVariantSelectionComplete(product, selected);
  const price = getVariantPrice(product, selected);

  return (
    <div className="flex flex-col gap-6">
      {/* Cena wariantu — bez przekreślonej bazowej (warianty to różne ceny,
          nie promocje). */}
      {showVariants && complete && price !== product.price && (
        <p className="font-sans text-2xl font-bold text-[var(--color-gold)]">
          {price.toLocaleString("pl-PL")} zł
        </p>
      )}

      {showVariants && (
        <VariantSelector
          product={product}
          variants={product.variants!}
          selected={selected}
          onChange={onSelectedChange}
        />
      )}

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        needsVariant={showVariants && !complete}
      />
    </div>
  );
}
