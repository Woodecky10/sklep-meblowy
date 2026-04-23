"use client";

import { useState } from "react";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
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
  const { items } = useCart();

  const showVariants = hasVariants(product);
  const complete = isVariantSelectionComplete(product, selected);
  const stock = showVariants
    ? complete
      ? getVariantStock(product, selected)
      : 0
    : product.stock;
  const price = getVariantPrice(product, selected);

  // Ile sztuk tej kombinacji (lub produktu bez wariantów) jest już w koszyku.
  const showAvailability = showVariants ? complete : true;
  const key = cartItemKey(
    product.id,
    showVariants && complete ? selected : undefined
  );
  const inCart = showAvailability
    ? items.find((i) => cartItemKey(i.id, i.variantValues) === key)?.quantity ?? 0
    : 0;
  const remaining = Math.max(0, stock - inCart);

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

      {/* Dynamiczna dostępność uwzględniająca koszyk */}
      {showAvailability && (
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          {stock === 0 ? (
            <span className="text-red-500 normal-case tracking-normal">
              {showVariants ? "Wybrana kombinacja niedostępna" : "Wyprzedany"}
            </span>
          ) : (
            <>
              Dostępność:{" "}
              <span className="text-[var(--fg)] font-semibold normal-case tracking-normal">
                {inCart > 0
                  ? `pozostało ${remaining} z ${stock} szt.`
                  : stock > 5
                  ? "na stanie"
                  : `ostatnie ${stock} szt.`}
              </span>
              {inCart > 0 && (
                <span className="ml-2 text-[var(--color-gold)] normal-case tracking-normal">
                  ({inCart} w koszyku)
                </span>
              )}
            </>
          )}
        </p>
      )}

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        currentStock={stock}
        needsVariant={showVariants && !complete}
      />
    </div>
  );
}
