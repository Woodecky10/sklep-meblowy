"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/_context/CartContext";
import { localizeHref } from "@/app/_lib/i18n";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import type { OrderItem } from "@/app/_lib/types";

// Dodaje wszystkie pozycje z historycznego zamówienia do bieżącego koszyka.
// Ważne: używamy *aktualnej* ceny produktu (z `item.product.price`), nie
// ceny zamrożonej w order_items — w przeciwnym razie klient mógłby
// zapłacić starą (niższą) cenę za produkt który podrożał.
//
// Pominięte: produkty które admin usunął (item.product == null).
export default function ReorderButton({ items }: { items: OrderItem[] }) {
  const { add } = useCart();
  const router = useRouter();
  const locale = useClientLocale();
  const [pending, startTransition] = useTransition();
  const [skipped, setSkipped] = useState(0);

  // Pre-filter — ile dostępnych pozycji do dodania (do labela na buttonie).
  const availableItems = items.filter((i) => i.product != null);
  const availableCount = availableItems.reduce((s, i) => s + i.quantity, 0);

  if (availableCount === 0) {
    return (
      <div className="text-sm text-[var(--muted)] italic">
        Wszystkie produkty z tego zamówienia są niedostępne w sklepie.
      </div>
    );
  }

  function handleClick() {
    let added = 0;
    let skippedCount = 0;
    for (const item of items) {
      if (!item.product) {
        skippedCount += item.quantity;
        continue;
      }
      add({
        id: item.product_id,
        name: item.product.name,
        price: Number(item.product.price),
        image: item.product.images?.[0] ?? "",
        quantity: item.quantity,
        variantValues: item.variant_values ?? undefined,
        category: item.product.category,
        notes: item.notes ?? undefined,
      });
      added += item.quantity;
    }
    setSkipped(skippedCount);
    if (added > 0) {
      startTransition(() => router.push(localizeHref("/koszyk", locale)));
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-60"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.5 6.3M3 20v-5h5" />
        </svg>
        Złóż ponownie ({availableCount}{" "}
        {availableCount === 1 ? "pozycja" : "pozycji"})
      </button>
      {skipped > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Pominięto {skipped} pozycji — produkty niedostępne w sklepie.
        </p>
      )}
      {availableItems.length < items.length && (
        <p className="text-xs text-[var(--muted)]">
          {items.length - availableItems.length} z {items.length} pozycji
          jest już niedostępnych — pominiemy je.
        </p>
      )}
    </div>
  );
}
