"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/_context/CartContext";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizeHref } from "@/app/_lib/i18n";
import type { Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { getVariantImages } from "@/app/_lib/variants";

type Props = {
  product: Product;
  selectedValues?: Record<string, string>;
  currentPrice?: number;
  needsVariant?: boolean;
  // Zlokalizowane etykiety pełnego przycisku (z ProductActions). Bez nich
  // bierzemy je ze słownika po locale klienta (useClientLocale).
  addToCartLabel?: string;
  selectVariantLabel?: string;
  // „Kup teraz": to samo dodanie, a potem od razu /koszyk. Etykieta bez
  // podmiany na „Wybierz wariant" — tę podpowiedź pokazuje już przycisk
  // „Dodaj do koszyka" tuż obok.
  buyNow?: boolean;
  buyNowLabel?: string;
};

// Pełny przycisk z karty produktu (ProductActions). Okrągłe „+" na kartach
// w listach to osobny QuickAddButton — z wąskimi danymi zamiast całego
// produktu (powód w app/_lib/quick-add.ts).
//
// Meble robione na zamówienie — brak limitów sztuk. Walidujemy tylko
// kompletność wyboru wariantu (jeśli produkt ma opcje).
export default function AddToCartButton({
  product,
  selectedValues,
  currentPrice,
  needsVariant,
  addToCartLabel,
  selectVariantLabel,
  buyNow,
  buyNowLabel,
}: Props) {
  const { add, dismissNotification } = useCart();
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const locale = useClientLocale();
  const t = getDictionary(locale);
  const addLabel = addToCartLabel ?? t.product.addToCart;
  const variantLabel = selectVariantLabel ?? t.product.selectVariant;

  const hasSelection = selectedValues && Object.keys(selectedValues).length > 0;
  const price = currentPrice ?? effectivePrice(product.price, product.sale_price);
  // `navigating` blokuje drugi klik w trakcie przejścia na /koszyk — inaczej
  // podwójne kliknięcie „Kup teraz" dodałoby 2 sztuki.
  const disabled = !!needsVariant || navigating;

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
    if (buyNow) {
      // Bez dymka „Dodano do koszyka" — klient za chwilę widzi cały koszyk.
      dismissNotification();
      startTransition(() => router.push(localizeHref("/koszyk", locale)));
    }
  }

  if (buyNow) {
    return (
      <button
        onClick={handleAdd}
        disabled={disabled}
        className="w-full py-4 border border-[var(--color-navy)] text-[var(--color-navy)] dark:border-[var(--color-gold)] dark:text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full enabled:hover:bg-[var(--color-navy)] enabled:hover:text-white dark:enabled:hover:bg-[var(--color-gold)] dark:enabled:hover:text-[var(--color-navy)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {buyNowLabel ?? t.product.buyNow}
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
