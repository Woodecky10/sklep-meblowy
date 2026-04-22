"use client";

import { useState } from "react";
import type { Product } from "@/app/_lib/types";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantPrice,
  getVariantStock,
} from "@/app/_lib/variants";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";

export default function ProductActions({ product }: { product: Product }) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  const showVariants = hasVariants(product);
  const complete = isVariantSelectionComplete(product, selected);
  const stock = complete ? getVariantStock(product, selected) : 0;
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
          onChange={setSelected}
        />
      )}

      {/* Stan magazynowy dla wybranego wariantu */}
      {showVariants && complete && (
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          {stock > 0 ? (
            <>
              Dostępność:{" "}
              <span className="text-[var(--fg)] font-semibold normal-case tracking-normal">
                {stock > 5 ? "na stanie" : `ostatnie ${stock} szt.`}
              </span>
            </>
          ) : (
            <span className="text-red-500 normal-case tracking-normal">
              Wybrana kombinacja niedostępna
            </span>
          )}
        </p>
      )}

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        currentStock={showVariants ? (complete ? stock : 0) : product.stock}
        needsVariant={showVariants && !complete}
      />
    </div>
  );
}
