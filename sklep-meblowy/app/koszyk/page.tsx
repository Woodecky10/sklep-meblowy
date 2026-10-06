"use client";

import { useState, useEffect, useTransition } from "react";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import Image from "next/image";
import { useCart, cartItemKey } from "@/app/_context/CartContext";
import { formatVariantLabel } from "@/app/_lib/variants";
import { groupCartBundles, eligiblePromoBase } from "@/app/_lib/bundles";
import {
  applyPromoCodeAction,
  getCartCrossSellAction,
  revalidateBundleTermsAction,
} from "./actions";
import ProductCard from "@/app/_components/ui/ProductCard";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";
import { buildCartEventPayload } from "@/app/_lib/meta-pixel";
import { trackPixel } from "@/app/_lib/meta-pixel-client";
import { buildGaCartPayload } from "@/app/_lib/ga-ecommerce";
import { trackGaEvent } from "@/app/_lib/ga-client";
import { useFabricLabels } from "@/app/_lib/fabric-context";
import type { Product } from "@/app/_lib/types";

export default function KoszykPage() {
  const locale = useClientLocale();
  const rate = useEurRate();
  const fabricMap = useFabricLabels();
  const t = getDictionary(locale);
  const {
    items,
    total,
    count,
    remove,
    updateQty,
    updateNotes,
    removeBundle,
    updateBundleQty,
    updateBundleTerms,
    clear,
    appliedPromo,
    applyPromo,
    clearPromo,
  } = useCart();

  // Zestawy: pozycje ze wspólnym bundle.unitKey renderujemy jako jedną kartę
  // grupy (nad pozycjami solo). soloItems = zwykłe zakupy poza zestawami.
  const soloItems = items.filter((i) => !i.bundle);
  const bundleGroups = groupCartBundles(items);
  const bundleDiscount = bundleGroups.reduce((s, g) => s + g.discount, 0);
  // Kod rabatowy NIE obejmuje pozycji z zestawów (decyzja użytkownika) — jego
  // podstawą jest suma subtotali pozycji spoza zestawów.
  const eligibleBase = eligiblePromoBase(
    items.map((i) => ({ subtotal: i.price * i.quantity, bundle: i.bundle ?? null }))
  );

  // Koszt dostawy ustalany indywidualnie per zamówienie po kontakcie z klientem
  // — meble różnią się wagą i gabarytami. Płatność online pobiera tylko cenę produktów.
  const discount = appliedPromo?.discount ?? 0;
  const grandTotal = Math.max(0, total - bundleDiscount - discount);

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

  // Re-waliduj kod gdy zmieni się kwalifikująca podstawa (np. po dodaniu/
  // usunięciu pozycji albo zmianie ilości). Server policzy nową kwotę zniżki
  // (przy percent) albo wyrzuci kod (np. spadliśmy poniżej min_order_value).
  // Podstawą jest eligibleBase — pozycje z zestawów nie liczą się do kodu.
  useEffect(() => {
    if (!appliedPromo) return;
    let cancelled = false;
    applyPromoCodeAction(appliedPromo.code, eligibleBase).then((res) => {
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
  }, [eligibleBase]);

  // Odśwież warunki rabatu zestawów — admin mógł je zmienić po dodaniu do
  // koszyka (snapshot w localStorage). Zbieżny: po aktualizacji terms grupy
  // przeliczają się na nowe wartości, dep się stabilizuje.
  useEffect(() => {
    const ids = Array.from(new Set(bundleGroups.map((g) => g.bundleId)));
    if (ids.length === 0) return;
    let cancelled = false;
    revalidateBundleTermsAction(ids).then((terms) => {
      if (cancelled) return;
      for (const g of bundleGroups) {
        const t = terms[g.bundleId];
        if (t && (t.discountType !== g.discountType || t.discountValue !== g.discountValue)) {
          updateBundleTerms(g.bundleId, t.discountType, t.discountValue);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleGroups.map((g) => `${g.bundleId}:${g.discountType}:${g.discountValue}`).join(",")]);

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
          {/* Zestawy — jedna karta na grupę (nad pozycjami solo) */}
          {bundleGroups.map((g) => (
            <div
              key={g.unitKey}
              className="p-6 bg-[var(--card-bg)] border-2 border-[var(--color-gold)]/40 rounded-2xl flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-sans text-xs uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
                  {t.bundle.cartGroupLabel}:{" "}
                  <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">
                    {g.name}
                  </span>
                </p>
                <button
                  onClick={() => removeBundle(g.unitKey)}
                  className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500 transition-colors shrink-0"
                >
                  {t.bundle.removeBundle}
                </button>
              </div>

              {g.items.map((item) => (
                <div
                  key={cartItemKey(item.id, item.variantValues, item.bundle?.unitKey)}
                  className="flex gap-4 items-start"
                >
                  {/* Zdjęcie (skopiowane z karty solo) */}
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

                  {/* Info: nazwa + wariant + uwagi (bez steppera i usuwania —
                      zestaw ma jeden wspólny stepper i jedno usuwanie niżej) */}
                  <div className="flex-1 min-w-0">
                    <LocalizedLink href={`/produkt/${item.id}`}>
                      <p className="font-display text-lg font-semibold text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors leading-snug mb-1">
                        {item.name}
                      </p>
                    </LocalizedLink>
                    {item.variantValues && (
                      <p className="text-xs text-[var(--muted)] mb-3">
                        {formatVariantLabel(item.variantValues, locale, fabricMap)}
                      </p>
                    )}
                    <ItemNotes
                      initial={item.notes ?? ""}
                      onSave={(notes) =>
                        updateNotes(item.id, notes, item.variantValues, item.bundle?.unitKey)
                      }
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
              ))}

              {/* Jeden stepper ilości + cena całego zestawu */}
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                <div className="flex items-center gap-3 border border-[var(--border)] rounded-full px-4 py-2">
                  <button
                    onClick={() =>
                      g.qty > 1
                        ? updateBundleQty(g.unitKey, g.qty - 1)
                        : removeBundle(g.unitKey)
                    }
                    className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors font-bold"
                  >
                    −
                  </button>
                  <span className="font-sans font-semibold text-sm text-[var(--fg)] w-4 text-center">
                    {g.qty}
                  </span>
                  <button
                    onClick={() => updateBundleQty(g.unitKey, g.qty + 1)}
                    className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors font-bold"
                  >
                    +
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-[var(--muted)] line-through">
                    {formatMoney(g.base, locale, rate)}
                  </p>
                  <p className="font-sans font-bold text-[var(--fg)]">
                    {formatMoney(g.base - g.discount, locale, rate)}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {t.bundle.saves} {formatMoney(g.discount, locale, rate)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {soloItems.map((item) => {
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
                      {formatVariantLabel(item.variantValues, locale, fabricMap)}
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
                        {formatMoney(item.price * item.quantity, locale, rate)}
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
          <div className="sticky top-40 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gap-6">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
              {t.cart.summary}
            </h2>

            {eligibleBase === 0 && bundleGroups.length > 0 ? (
              // Cały koszyk to zestawy — kod nie ma do czego się przyłożyć.
              <p className="text-xs text-[var(--muted)]">{t.bundle.promoExcluded}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <PromoInput
                  cartTotal={eligibleBase}
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
                {bundleGroups.length > 0 && (
                  <p className="text-xs text-[var(--muted)]">{t.bundle.promoExcluded}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 text-sm font-sans">
              <div className="flex justify-between text-[var(--muted)]">
                <span>{t.cart.productsCount} ({count} {t.cart.pieces})</span>
                <span>{formatMoney(total, locale, rate)}</span>
              </div>
              {bundleDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t.bundle.discountLine}</span>
                  <span>−{formatMoney(bundleDiscount, locale, rate)}</span>
                </div>
              )}
              {appliedPromo && discount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{t.cart.discount} ({appliedPromo.code})</span>
                  <span>−{formatMoney(discount, locale, rate)}</span>
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
              <p className="text-xs text-[var(--muted)] leading-snug">
                {t.cart.deliveryNotice}{" "}
                <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
                  {t.cart.deliveryNoticeLink}
                </LocalizedLink>
              </p>
              <div className="border-t border-[var(--border)] pt-3 flex justify-between font-bold text-base text-[var(--fg)]">
                <span>{t.cart.total}</span>
                <span>{formatMoney(grandTotal, locale, rate)}</span>
              </div>
            </div>

            <LocalizedLink
              href="/checkout"
              onClick={() => {
                // Wejście w checkout — najcenniejsza grupa remarketingowa: byli
                // o krok od zakupu. Kwota to `grandTotal`, czyli PO rabacie;
                // suma cen katalogowych zawyżałaby wartość koszyka przy każdym
                // kuponie.
                // Bez zgody trackPixel/trackGaEvent nie robią nic.
                trackPixel(
                  "InitiateCheckout",
                  buildCartEventPayload(
                    items.map((item) => ({
                      productId: item.id,
                      quantity: item.quantity,
                      price: item.price,
                    })),
                    grandTotal
                  )
                );
                trackGaEvent(
                  "begin_checkout",
                  buildGaCartPayload(
                    items.map((item) => ({
                      productId: item.id,
                      name: item.name,
                      quantity: item.quantity,
                      price: item.price,
                    })),
                    grandTotal
                  )
                );
              }}
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
                rate={rate}
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
