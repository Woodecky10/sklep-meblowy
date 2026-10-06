"use client";

// Edytor pozycji zamówienia — wydzielony z formularza „Dodaj zamówienie”
// (nowe/ExternalOrderForm.tsx). Korzystają z niego oba formularze: „Dodaj
// zamówienie” (bez opcji dodatkowych, zachowanie jak przed wydzieleniem)
// i „Edytuj zamówienie” (z wariantami, podpowiedzią cennika i wniesieniem).
// Renderuje wyszukiwarkę, przyciski dodawania i listę wierszy; SUMĘ pokazuje
// rodzic, bo tylko on wie, co jeszcze do niej wchodzi.

import { useMemo, useState } from "react";
import Image from "next/image";
import { Field, inputCls } from "@/app/admin/_shared";
import { filterBySearch } from "@/app/_lib/search-normalize";
import { effectivePrice } from "@/app/_lib/pricing";
import { formatPrice } from "@/app/_lib/format";
import { CUSTOM_NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from "@/app/_lib/external-order";
import { CARRY_IN_LINE_NAME, CARRY_IN_PRICE } from "@/app/_lib/carry-in";
import { getVariantEffectivePrice } from "@/app/_lib/variants";
import type { Product, ProductVariants } from "@/app/_lib/types";

// Minimalny kształt produktu do pickera (strony nie ciągną pełnych wierszy).
export type EditorProduct = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
  variants?: ProductVariants | null;
};

// Wiersz pozycji w formularzu. Cena i ilość jako TEKST — admin wpisuje
// „1 299,50”, a parsowanie robi serwer; tu tylko podgląd sumy u rodzica.
// `key` bo ten sam produkt może być dwa razy (dwa warianty), więc product_id
// nie nadaje się na klucz Reacta.
//
// `product_id: null` = pozycja SPOZA KATALOGU (2026-09-09): nazwa jest wtedy
// polem do wpisania, a nie etykietą wybranego produktu.
// `id` = id istniejącej pozycji zamówienia (edycja); null dla nowych.
export type EditorRow = {
  key: number;
  id: string | null;
  product_id: string | null;
  name: string;
  price: string;
  quantity: string;
  notes: string;
  variant_values: Record<string, string> | null;
  bundle_label: string | null;
};

export default function OrderItemsEditor({
  products,
  rows,
  setRows,
  newKey,
  priceLabel,
  priceHint,
  withVariants,
  catalogHint,
  suggestCatalogPrice,
  withCarryIn,
}: {
  products: EditorProduct[];
  rows: EditorRow[];
  setRows: (fn: (prev: EditorRow[]) => EditorRow[]) => void;
  newKey: () => number;
  priceLabel: string;
  priceHint?: string;
  withVariants?: boolean;
  catalogHint?: boolean;
  // Cena katalogowa (zł) jako startowa cena nowej pozycji. false dla
  // zamówienia w EUR — złotówki w polu "Cena (EUR)" to zła kwota.
  suggestCatalogPrice: boolean;
  withCarryIn?: boolean;
}) {
  const [query, setQuery] = useState("");

  // Wyszukiwarka jak w /admin/zestawy — filtr kliencki po znormalizowanym tekście.
  const filtered = useMemo(
    () => (query.trim() ? filterBySearch(products, query, (p) => [p.name]).slice(0, 20) : []),
    [products, query]
  );

  // getVariantEffectivePrice czyta tylko price, sale_price i variants, ale
  // przyjmuje pełny Product — stąd zawężone rzutowanie zamiast `any`.
  // Do grosza — dopłaty wariantów potrafią dać szum zmiennoprzecinkowy.
  function catalogPrice(p: EditorProduct, values: Record<string, string>): number {
    const price = getVariantEffectivePrice(
      {
        price: Number(p.price),
        sale_price: p.sale_price,
        variants: p.variants ?? null,
      } as unknown as Product,
      values
    );
    return Math.round(price * 100) / 100;
  }

  function addProduct(p: EditorProduct) {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        id: null,
        product_id: p.id,
        name: p.name,
        // Podpowiedź: cena sklepowa. Admin nadpisuje ją ceną z marketplace.
        price: suggestCatalogPrice
          ? String(Math.round(effectivePrice(Number(p.price), p.sale_price) * 100) / 100)
          : "",
        quantity: "1",
        notes: "",
        variant_values: null,
        bundle_label: null,
      },
    ]);
    setQuery("");
  }

  // Pozycja spoza katalogu: pusty wiersz, w którym nazwę wpisuje się ręcznie.
  // Cena bez podpowiedzi — nie ma z czego jej wziąć.
  function addCustomRow() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        id: null,
        product_id: null,
        name: "",
        price: "",
        quantity: "1",
        notes: "",
        variant_values: null,
        bundle_label: null,
      },
    ]);
    setQuery("");
  }

  // Wniesienie: pozycja spoza katalogu o stałej nazwie i cenie — po nazwie
  // rozpoznaje ją reszta systemu (carry-in.ts). Raz na zamówienie.
  function addCarryInRow() {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        id: null,
        product_id: null,
        name: CARRY_IN_LINE_NAME,
        price: String(CARRY_IN_PRICE),
        quantity: "1",
        notes: "",
        variant_values: null,
        bundle_label: null,
      },
    ]);
    setQuery("");
  }

  function updateRow(key: number, patch: Partial<EditorRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const hasCarryIn = rows.some((r) => r.product_id === null && r.name === CARRY_IN_LINE_NAME);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Field
          label="Dodaj produkt"
          hint="Wpisz fragment nazwy, potem kliknij produkt na liście."
          className="flex-1 min-w-0"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj produktu…"
            className={inputCls}
            autoComplete="off"
          />
        </Field>
        {/* Mebel dogadany indywidualnie albo wycofany model — nie ma go
            w katalogu i NIE zakładamy dla niego produktu w sklepie
            (decyzja właściciela 2026-09-09). */}
        <button
          type="button"
          onClick={addCustomRow}
          className="shrink-0 px-4 py-2 border border-[var(--border)] text-[var(--fg)] font-sans text-sm rounded-lg hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          + Pozycja spoza katalogu
        </button>
        {withCarryIn && (
          <button
            type="button"
            onClick={addCarryInRow}
            disabled={hasCarryIn}
            className="shrink-0 px-4 py-2 border border-[var(--border)] text-[var(--fg)] font-sans text-sm rounded-lg hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Wniesienie (+{formatPrice(CARRY_IN_PRICE, "pl")})
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">
        Nie ma tego mebla w sklepie? Kliknij „+ Pozycja spoza katalogu” i wpisz nazwę ręcznie —
        produkt nie zostanie dodany do sklepu.
      </p>
      {query.trim() && (
        <ul
          aria-label="Wyniki wyszukiwania"
          className="mt-2 max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]"
        >
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => addProduct(p)}
                className="w-full flex items-center gap-3 p-2 text-left hover:bg-[var(--bg)] transition-colors"
              >
                <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                  {p.images?.[0] ? (
                    <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                  ) : null}
                </div>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">{p.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  u nas: {formatPrice(effectivePrice(Number(p.price), p.sale_price), "pl")}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
          )}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          Brak pozycji — wyszukaj produkt powyżej albo dodaj pozycję spoza katalogu.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-[var(--border)]" aria-label="Pozycje zamówienia">
          {rows.map((r, idx) => {
            const product =
              r.product_id !== null ? products.find((p) => p.id === r.product_id) : undefined;
            const options = withVariants ? (product?.variants?.options ?? []) : [];
            // Wniesienie reszta systemu rozpoznaje po nazwie (carry-in.ts) —
            // nazwa nieedytowalna, ilość zawsze 1. Cenę da się zmienić, usunąć też.
            const isCarryIn = r.product_id === null && r.name === CARRY_IN_LINE_NAME;
            return (
              <li key={r.key} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="font-semibold text-[var(--fg)] shrink-0">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    {r.product_id === null && !isCarryIn ? (
                      <Field
                        label="Nazwa pozycji"
                        required
                        hint="Wpisz, co klient kupił — ta nazwa trafi na kartę zamówienia. Produkt NIE zostanie dodany do sklepu."
                      >
                        <input
                          value={r.name}
                          onChange={(e) => updateRow(r.key, { name: e.target.value })}
                          required
                          maxLength={CUSTOM_NAME_MAX_LENGTH}
                          placeholder="np. Pufa Vena, tkanina Rico 12"
                          className={inputCls}
                        />
                      </Field>
                    ) : (
                      <p className="font-semibold text-[var(--fg)]">{r.name}</p>
                    )}
                    {r.bundle_label && (
                      <span className="mt-1 inline-block text-xs text-[var(--muted)]">
                        Zestaw: {r.bundle_label}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Usuń
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[10rem_6rem_1fr] gap-3">
                  {/* Podpowiedź cennika i przycisk stoją POZA etykietą pola ceny:
                      klik w <label> aktywuje jego pierwszy element, więc przycisk
                      w środku ustawiałby też fokus na polu ceny. */}
                  <div className="flex flex-col gap-1.5">
                    <Field label={priceLabel} required hint={priceHint}>
                      <input
                        value={r.price}
                        onChange={(e) => updateRow(r.key, { price: e.target.value })}
                        inputMode="decimal"
                        required
                        className={inputCls}
                      />
                    </Field>
                    {catalogHint && product && (
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
                        <span>
                          cennik:{" "}
                          {formatPrice(catalogPrice(product, r.variant_values ?? {}), "pl")}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateRow(r.key, {
                              price: String(catalogPrice(product, r.variant_values ?? {})),
                            })
                          }
                          className="underline hover:text-[var(--color-gold)]"
                        >
                          wstaw z cennika
                        </button>
                      </div>
                    )}
                  </div>
                  <Field label="Ilość" required>
                    <input
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                      type="number"
                      min={1}
                      step={1}
                      disabled={isCarryIn}
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    label="Wariant / uwagi"
                    hint="np. „Vena 12, narożnik lewy” albo kolor ustalony z klientem."
                  >
                    <input
                      value={r.notes}
                      onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                      maxLength={NOTES_MAX_LENGTH}
                      className={inputCls}
                    />
                  </Field>
                </div>
                {options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {options.map((opt) => {
                      const current = r.variant_values?.[opt.name] ?? "";
                      const outside = current !== "" && !opt.values.includes(current);
                      return (
                        <Field key={opt.name} label={opt.name}>
                          <select
                            value={current}
                            onChange={(e) => {
                              const next = { ...(r.variant_values ?? {}) };
                              if (e.target.value === "") delete next[opt.name];
                              else next[opt.name] = e.target.value;
                              updateRow(r.key, {
                                variant_values: Object.keys(next).length > 0 ? next : null,
                              });
                            }}
                            className={inputCls}
                          >
                            <option value="">— wybierz —</option>
                            {outside && <option value={current}>{current} (spoza katalogu)</option>}
                            {opt.values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </Field>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
