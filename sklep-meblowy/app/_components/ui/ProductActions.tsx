"use client";

import type { Product } from "@/app/_lib/types";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantPrice,
} from "@/app/_lib/variants";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";

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
}: {
  product: Product;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const showVariants = hasVariants(product);
  const complete = isVariantSelectionComplete(product, selected);
  const price = getVariantPrice(product, selected);

  return (
    <div className="flex flex-col gap-6">
      {/* Dynamiczna cena (gdy modyfikator zmienia bazową) */}
      {showVariants && complete && price !== product.price && (
        <div className="flex items-baseline gap-3">
          <p className="font-sans text-2xl font-bold text-[var(--color-gold)]">
            {price.toLocaleString("pl-PL")} zł
          </p>
          <p className="text-sm text-[var(--muted)] line-through">
            {product.price.toLocaleString("pl-PL")} zł
          </p>
        </div>
      )}

      {showVariants && (
        <VariantSelector
          product={product}
          variants={product.variants!}
          selected={selected}
          onChange={onChange}
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
