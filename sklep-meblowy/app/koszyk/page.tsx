"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
import { formatVariantLabel } from "@/app/_lib/variants";

export default function KoszykPage() {
  const { items, total, count, remove, updateQty, clear } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-32 text-center">
        <p className="font-display text-5xl mb-4">🛒</p>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-4">
          Koszyk jest pusty
        </h1>
        <p className="text-[var(--muted)] mb-10">
          Dodaj produkty do koszyka, aby kontynuować zakupy.
        </p>
        <Link
          href="/sklep"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Przejdź do sklepu
        </Link>
      </div>
    );
  }

  const shipping = 299;
  const grandTotal = total + shipping;

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
            Koszyk
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            Twoje produkty ({count})
          </h1>
        </div>
        <button
          onClick={clear}
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500 transition-colors"
        >
          Wyczyść koszyk
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Lista produktów */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {items.map((item) => {
            const key = cartItemKey(item.id, item.variantValues);
            return (
              <div
                key={key}
                className="flex gap-6 p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl"
              >
                {/* Zdjęcie */}
                <Link href={`/produkt/${item.id}`} className="shrink-0">
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-xs">
                        Brak
                      </div>
                    )}
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/produkt/${item.id}`}>
                    <p className="font-display text-lg font-semibold text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors leading-snug mb-1">
                      {item.name}
                    </p>
                  </Link>
                  {item.variantValues && (
                    <p className="text-xs text-[var(--muted)] mb-3">
                      {formatVariantLabel(item.variantValues)}
                    </p>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-4">
                    {/* Ilość */}
                    <div className="flex items-center gap-3 border border-[var(--border)] rounded-full px-4 py-2">
                      <button
                        onClick={() =>
                          item.quantity > 1
                            ? updateQty(item.id, item.quantity - 1, item.variantValues)
                            : remove(item.id, item.variantValues)
                        }
                        className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors font-bold"
                      >
                        −
                      </button>
                      <span className="font-sans font-semibold text-sm text-[var(--fg)] w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateQty(item.id, item.quantity + 1, item.variantValues)
                        }
                        className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors font-bold"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-6">
                      <p className="font-sans font-bold text-[var(--fg)]">
                        {(item.price * item.quantity).toLocaleString("pl-PL")} zł
                      </p>
                      <button
                        onClick={() => remove(item.id, item.variantValues)}
                        className="text-[var(--muted)] hover:text-red-500 transition-colors"
                        aria-label="Usuń"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Podsumowanie */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gap-6">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
              Podsumowanie
            </h2>

            <div className="flex flex-col gap-3 text-sm font-sans">
              <div className="flex justify-between text-[var(--muted)]">
                <span>Produkty ({count} szt.)</span>
                <span>{total.toLocaleString("pl-PL")} zł</span>
              </div>
              <div className="flex justify-between text-[var(--muted)]">
                <span>Dostawa</span>
                <span>{shipping} zł</span>
              </div>
              <div className="border-t border-[var(--border)] pt-3 flex justify-between font-bold text-base text-[var(--fg)]">
                <span>Razem</span>
                <span>{grandTotal.toLocaleString("pl-PL")} zł</span>
              </div>
            </div>

            <Link
              href="/checkout"
              className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors text-center"
            >
              Przejdź do kasy →
            </Link>

            <Link
              href="/sklep"
              className="text-center text-xs font-sans text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors uppercase tracking-widest"
            >
              ← Kontynuuj zakupy
            </Link>

            <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)] space-y-1">
              <p>✓ Bezpieczna płatność Stripe</p>
              <p>✓ Zwrot do 30 dni</p>
              <p>✓ Gwarancja 2 lata</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
