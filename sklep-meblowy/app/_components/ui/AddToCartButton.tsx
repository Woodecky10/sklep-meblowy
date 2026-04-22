"use client";

import { useCart } from "@/app/_context/CartContext";
import type { Product } from "@/app/_lib/types";

type Props = {
  product: Product;
  compact?: boolean;
  selectedValues?: Record<string, string>;
  // Cena/stock zależne od wariantu — przekazane z ProductActions; w trybie compact (karta listy) brak.
  currentPrice?: number;
  currentStock?: number;
  needsVariant?: boolean;
};

export default function AddToCartButton({
  product,
  compact,
  selectedValues,
  currentPrice,
  currentStock,
  needsVariant,
}: Props) {
  const { add } = useCart();

  const hasSelection = selectedValues && Object.keys(selectedValues).length > 0;
  const price = currentPrice ?? product.price;
  const stock = currentStock ?? product.stock;
  const disabled = stock === 0 || !!needsVariant;

  function handleAdd() {
    if (disabled) return;
    add({
      id: product.id,
      name: product.name,
      price,
      image: product.images?.[0] ?? "",
      quantity: 1,
      variantValues: hasSelection ? selectedValues : undefined,
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

  const label = needsVariant
    ? "Wybierz wariant"
    : stock === 0
    ? "Wyprzedane"
    : "Dodaj do koszyka";

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
