"use client";

import { useState, useEffect, useTransition } from "react";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import Image from "next/image";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
import { formatVariantLabel } from "@/app/_lib/variants";
import { applyPromoCodeAction, getCartCrossSellAction } from "./actions";
import ProductCard from "@/app/_components/ui/ProductCard";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatPrice } from "@/app/_lib/format";
import type { Product } from "@/app/_lib/types";

export default function KoszykPage() {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  const {
    items,
    total,
    count,
    remove,
    updateQty,
    updateNotes,
    clear,
    appliedPromo,
    applyPromo,
    clearPromo,
  } = useCart();

  // Koszt dostawy ustalany indywidualnie per zamówienie po kontakcie z klientem
  // — meble różnią się wagą i gabarytami. Stripe pobiera tylko cenę produktów.
  const discount = appliedPromo?.discount ?? 0;
  const grandTotal = Math.max(0, total - discount);

  // Cross-sell — "Może Cię zainteresować".
  // UWAGA: wszystkie hooki muszą być PRZED wczesnym returnem pustego koszyka —
  // inaczej React rzuca "Rendered fewer hooks" gdy koszyk się opróżni.
  const [crossSell, setCrossSell] = useState<Product[]>([]);
  const [crossSellWishlist, setCrossSellWishlist] = useState<Set<string>>(
    new Set()
  );
  const [crossSellLabels, setCrossSellLabels] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    // Pusty koszyk → strona renderuje pusty stan, cross-sell i tak niewidoczny.
    if (items.length === 0) return;
    let cancelled = false;
    getCartCrossSellAction(
      items.map((i) => ({ id: i.id, category: i.category }))
    ).then((res) => {
      if (!cancelled) {
        setCrossSell(res.products);
        setCrossSellWishlist(new Set(res.wishlistIds));
        setCrossSellLabels(res.categoryLabels);
      }
    });
    return () => {
      cancelled = true;
    };
    // Re-fetch gdy zmienia się skład koszyka (po id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  // Re-waliduj kod gdy zmieni się total (np. po dodaniu/usunięciu pozycji
  // albo zmianie ilości). Server policzy nową kwotę zniżki (przy percent)
  // albo wyrzuci kod (np. spadliśmy poniżej min_order_value).
  useEffect(() => {
    if (!appliedPromo) return;
    let cancelled = false;
    applyPromoCodeAction(appliedPromo.code, total).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        if (res.discount !== appliedPromo.discount) {
          applyPromo({
            promoId: res.promoId,
            code: res.code,
            discount: res.discount,
            discountType: res.discountType,
            discountValue: res.discountValue,
          });
        }
      } else {
        clearPromo();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-32 text-center">
        <p className="font-display text-5xl mb-4">🛒</p>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-4">
          {t.cart.empty}
        </h1>
        <p className="text-[var(--muted)] mb-10">
          {t.cart.emptyHint}
        </p>
        <LocalizedLink
          href="/sklep"
          className="inline-flex px-8 py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          {t.cart.goToShop}
        </LocalizedLink>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            {t.cart.eyebrow}
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            {t.cart.yourProducts} ({count})
          </h1>
        </div>
        <button
          onClick={clear}
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500 transition-colors"
        >
          {t.cart.clearCart}
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
                <LocalizedLink href={`/produkt/${item.id}`} className="shrink-0">
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
                        {t.cart.noImage}
                      </div>
                    )}
                  </div>
                </LocalizedLink>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <LocalizedLink href={`/produkt/${item.id}`}>
                    <p className="font-display text-lg font-semibold text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors leading-snug mb-1">
                      {item.name}
                    </p>
                  </LocalizedLink>
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
                        {formatPrice(item.price * item.quantity, locale)}
                      </p>
                      <button
                        onClick={() => remove(item.id, item.variantValues)}
                        className="text-[var(--muted)] hover:text-red-500 transition-colors"
                        aria-label={t.cart.remove}
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Uwagi klienta — collapse */}
                  <ItemNotes
                    initial={item.notes ?? ""}
                    onSave={(notes) => updateNotes(item.id, notes, item.variantValues)}
                    labels={{
                      add: t.cart.addNotes,
                      label: t.cart.notesLabel,
                      placeholder: t.cart.notesPlaceholder,
                      charsSuffix: t.cart.notesCharsSuffix,
                      unsaved: t.cart.notesUnsaved,
                      remove: t.cart.removeNotes,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Podsumowanie (z cross-sell pod nim w mobile) */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gap-6">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
              {t.cart.summary}
            </h2>

            <PromoInput
              cartTotal={total}
              appliedPromo={appliedPromo}
              onApply={applyPromo}
              onClear={clearPromo}
              labels={{
                label: t.cart.promoLabel,
                placeholder: t.cart.promoPlaceholder,
                apply: t.cart.promoApply,
                discountPercent: t.cart.promoDiscountPercent,
                discountAmount: t.cart.promoDiscountAmount,
                remove: t.cart.promoRemove,
              }}
            />

            <div className="flex flex-col gap-3 text-sm font-sans">
              <div className="flex justify-between text-[var(--muted)]">
                <span>{t.cart.productsCount} ({count} {t.cart.pieces})</span>
                <span>{formatPrice(total, locale)}</span>
              </div>
              {appliedPromo && discount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t.cart.discount} ({appliedPromo.code})</span>
                  <span>−{formatPrice(discount, locale)}</span>
                </div>
              )}
              <div className="flex justify-between items-start text-[var(--muted)] gap-3">
                <span className="shrink-0">{t.cart.delivery}</span>
                <span className="text-right text-xs leading-snug">
                  {t.cart.deliveryFrom}
                  <br />
                  <span className="text-[var(--muted)]">
                    {t.cart.deliveryHint}
                  </span>
                </span>
              </div>
              <div className="border-t border-[var(--border)] pt-3 flex justify-between font-bold text-base text-[var(--fg)]">
                <span>{t.cart.total}</span>
                <span>{formatPrice(grandTotal, locale)}</span>
              </div>
            </div>

            <LocalizedLink
              href="/checkout"
              className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors text-center"
            >
              {t.cart.checkout} →
            </LocalizedLink>

            <LocalizedLink
              href="/sklep"
              className="text-center text-xs font-sans text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors uppercase tracking-widest"
            >
              ← {t.cart.continueShopping}
            </LocalizedLink>

            <div className="border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)] space-y-1">
              <p>✓ {t.cart.trustPayment}</p>
              <p>✓ {t.cart.trustReturns}</p>
              <p>✓ {t.cart.trustWarranty}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-sell: "Może Cię zainteresować" */}
      {crossSell.length > 0 && (
        <section className="mt-20 pt-16 border-t border-[var(--border)]">
          <div className="mb-10">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.cart.crossSellEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {t.cart.crossSellHeading}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {crossSell.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                isInWishlist={crossSellWishlist.has(p.id)}
                categoryLabel={crossSellLabels[p.category]}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// Sub-component: uwagi do pozycji (collapse)
// ============================================================

function ItemNotes({
  initial,
  onSave,
  labels,
}: {
  initial: string;
  onSave: (notes: string) => void;
  labels: {
    add: string;
    label: string;
    placeholder: string;
    charsSuffix: string;
    unsaved: string;
    remove: string;
  };
}) {
  const [open, setOpen] = useState(initial.length > 0);
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start mt-3 text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
      >
        {labels.add}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {labels.label}
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (dirty) onSave(value);
        }}
        rows={2}
        maxLength={500}
        placeholder={labels.placeholder}
        className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] resize-y"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--muted)]">
          {value.length}/500 {labels.charsSuffix}{dirty ? labels.unsaved : ""}
        </span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              onSave("");
              setOpen(false);
            }}
            className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500"
          >
            {labels.remove}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-component: wpisz kod rabatowy
// ============================================================

function PromoInput({
  cartTotal,
  appliedPromo,
  onApply,
  onClear,
  labels,
}: {
  cartTotal: number;
  appliedPromo: ReturnType<typeof useCart>["appliedPromo"];
  onApply: ReturnType<typeof useCart>["applyPromo"];
  onClear: ReturnType<typeof useCart>["clearPromo"];
  labels: {
    label: string;
    placeholder: string;
    apply: string;
    discountPercent: string;
    discountAmount: string;
    remove: string;
  };
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!code.trim()) return;
    startTransition(async () => {
      const res = await applyPromoCodeAction(code, cartTotal);
      if (res.ok) {
        onApply({
          promoId: res.promoId,
          code: res.code,
          discount: res.discount,
          discountType: res.discountType,
          discountValue: res.discountValue,
        });
        setCode("");
      } else {
        setError(res.error);
      }
    });
  }

  if (appliedPromo) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 flex items-center gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-700 dark:text-emerald-400 shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 font-mono">
            {appliedPromo.code}
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {appliedPromo.discountType === "percent"
              ? `${labels.discountPercent} ${appliedPromo.discountValue}%`
              : `${labels.discountAmount} ${appliedPromo.discountValue.toFixed(2)} zł`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-sans uppercase tracking-widest text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          {labels.remove}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {labels.label}
      </label>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={labels.placeholder}
          maxLength={50}
          className="flex-1 px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] font-mono uppercase focus:outline-none focus:border-[var(--color-gold)]"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="px-4 py-2 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans text-xs uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] transition-colors disabled:opacity-50"
        >
          {pending ? "..." : labels.apply}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
