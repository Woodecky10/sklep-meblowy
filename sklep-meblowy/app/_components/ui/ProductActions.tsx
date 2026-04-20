"use client";

import { useState } from "react";
import type { Product } from "@/app/_lib/types";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";

export default function ProductActions({ product }: { product: Product }) {
  const firstVariant = product.variants?.[0]?.value ?? "";
  const [selected, setSelected] = useState(firstVariant);

  return (
    <div className="flex flex-col gap-6">
      {product.variants && product.variants.length > 0 && (
        <VariantSelector
          variants={product.variants}
          selected={selected}
          onChange={setSelected}
        />
      )}
      <AddToCartButton product={product} selectedVariant={selected || undefined} />
    </div>
  );
}
