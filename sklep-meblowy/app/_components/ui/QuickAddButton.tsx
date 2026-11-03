"use client";

import LocalizedLink from "./LocalizedLink";
import { useCart } from "@/app/_context/CartContext";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { QuickAddProduct } from "@/app/_lib/quick-add";

// Okrągły przycisk „+" na karcie produktu (ProductCard). Dostaje tylko wąskie
// dane z toQuickAddProduct, NIE cały produkt — powód w app/_lib/quick-add.ts.
// Pełny przycisk z karty produktu (wybór wariantu, „Kup teraz") to
// AddToCartButton.
//
// Meble robione na zamówienie — brak limitów sztuk. Produkt z opcjami NIE
// trafia do koszyka stąd (wpadłby z variantValues=undefined, a checkout potem
// odrzuci) — przycisk prowadzi wtedy na kartę produktu, gdzie klient wybierze.
export default function QuickAddButton({ item }: { item: QuickAddProduct }) {
  const { add } = useCart();
  const t = getDictionary(useClientLocale());

  if (item.hasVariants) {
    return (
      <LocalizedLink
        href={`/produkt/${item.id}`}
        className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--color-navy)] text-[var(--color-navy)] dark:border-[var(--color-gold)] dark:text-[var(--color-gold)] hover:bg-[var(--color-navy)] hover:text-white dark:hover:bg-[var(--color-gold)] dark:hover:text-[var(--color-navy)] transition-colors"
        aria-label={t.product.selectVariant}
        title={t.product.selectVariant}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </LocalizedLink>
    );
  }

  return (
    <button
      onClick={() =>
        add({
          id: item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          quantity: 1,
          category: item.category,
        })
      }
      className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors"
      aria-label={t.product.addToCart}
    >
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
