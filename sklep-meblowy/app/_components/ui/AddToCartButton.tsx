"use client";

import LocalizedLink from "./LocalizedLink";
import { useCart } from "@/app/_context/CartContext";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { getVariantImages } from "@/app/_lib/variants";

type Props = {
  product: Product;
  compact?: boolean;
  selectedValues?: Record<string, string>;
  currentPrice?: number;
  needsVariant?: boolean;
  // Zlokalizowane etykiety pełnego przycisku (z ProductActions). Bez nich
  // bierzemy je ze słownika po locale klienta (useClientLocale) — dotyczy
  // też wariantu compact (aria-label na kartach produktu).
  addToCartLabel?: string;
  selectVariantLabel?: string;
};

// Meble robione na zamówienie — brak limitów sztuk. Walidujemy tylko
// kompletność wyboru wariantu (jeśli produkt ma opcje).
export default function AddToCartButton({
  product,
  compact,
  selectedValues,
  currentPrice,
  needsVariant,
  addToCartLabel,
  selectVariantLabel,
}: Props) {
  const { add } = useCart();
  const t = getDictionary(useClientLocale());
  const addLabel = addToCartLabel ?? t.product.addToCart;
  const variantLabel = selectVariantLabel ?? t.product.selectVariant;

  const hasSelection = selectedValues && Object.keys(selectedValues).length > 0;
  const price = currentPrice ?? effectivePrice(product.price, product.sale_price);
  // Compact (na ProductCard) nie ma wyboru wariantu — sprawdzamy bezpośrednio
  // czy produkt ma jakiekolwiek opcje. Jeśli tak, NIE pozwalamy na quick-add
  // (bo wpadłby do koszyka z variantValues=undefined, a checkout potem
  // odrzuci) — zamiast tego linkujemy do karty produktu gdzie klient wybierze.
  const productHasVariants =
    (product.variants?.options?.length ?? 0) > 0;
  const disabled = !!needsVariant;

  function handleAdd() {
    if (disabled) return;
    add({
      id: product.id,
      name: product.name,
      price,
      // Zdjęcie pozycji = pierwsze zdjęcie aktualnej galerii. Zdjęcia wariantu
      // trafiają do galerii tylko dla opcji strony narożnika (Strona); dla
      // pozostałych opcji jest to pierwsze zdjęcie produktu (product.images[0]).
      image: getVariantImages(product, selectedValues ?? {})[0] ?? "",
      quantity: 1,
      variantValues: hasSelection ? selectedValues : undefined,
      category: product.category,
    });
  }

  if (compact) {
    // Produkt ma warianty → przekieruj na kartę produktu (nie dodawaj z pustym
    // wariantem). Bez wariantów → quick-add jak dotychczas.
    if (productHasVariants) {
      return (
        <LocalizedLink
          href={`/produkt/${product.id}`}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--color-navy)] text-[var(--color-navy)] dark:border-[var(--color-gold)] dark:text-[var(--color-gold)] hover:bg-[var(--color-navy)] hover:text-white dark:hover:bg-[var(--color-gold)] dark:hover:text-[var(--color-navy)] transition-colors"
          aria-label={variantLabel}
          title={variantLabel}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </LocalizedLink>
      );
    }
    return (
      <button
        onClick={handleAdd}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors"
        aria-label={addLabel}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    );
  }

  const label = needsVariant ? variantLabel : addLabel;

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
