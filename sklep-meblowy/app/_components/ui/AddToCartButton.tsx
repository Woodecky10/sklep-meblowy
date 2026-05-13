"use client";

import { useCart } from "@/app/_context/CartContext";
import type { Product } from "@/app/_lib/types";

type Props = {
  product: Product;
  compact?: boolean;
  selectedValues?: Record<string, string>;
  currentPrice?: number;
  needsVariant?: boolean;
};

// Meble robione na zamówienie — brak limitów sztuk. Walidujemy tylko
// kompletność wyboru wariantu (jeśli produkt ma opcje).
export default function AddToCartButton({
  product,
  compact,
  selectedValues,
  currentPrice,
  needsVariant,
}: Props) {
  const { add } = useCart();

  const hasSelection = selectedValues && Object.keys(selectedValues).length > 0;
  const price = currentPrice ?? product.price;
  const disabled = !!needsVariant;

  function handleAdd() {
    if (disabled) return;
    add({
      id: product.id,
      name: product.name,
      price,
      image: product.images?.[0] ?? "",
      quantity: 1,
      variantValues: hasSelection ? selectedValues : undefined,
      category: product.category,
    });
  }

  if (compact) {
    return (
      <button
        onClick={handleAdd}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors"
        aria-label="Dodaj do koszyka"
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    );
  }

  const label = needsVariant ? "Wybierz wariant" : "Dodaj do koszyka";

  return (
    <button
      onClick={handleAdd}
      disabled={disabled}
      className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
