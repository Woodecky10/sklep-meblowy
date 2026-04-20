"use client";

import { useCart } from "@/app/_context/CartContext";
import type { Product } from "@/app/_lib/types";

type Props = {
  product: Product;
  compact?: boolean;
  selectedVariant?: string;
};

export default function AddToCartButton({ product, compact, selectedVariant }: Props) {
  const { add } = useCart();

  function handleAdd() {
    add({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] ?? "",
      quantity: 1,
      variant: selectedVariant,
    });
  }

  if (compact) {
    return (
      <button
        onClick={handleAdd}
        disabled={product.stock === 0}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Dodaj do koszyka"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleAdd}
      disabled={product.stock === 0}
      className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {product.stock === 0 ? "Wyprzedane" : "Dodaj do koszyka"}
    </button>
  );
}
