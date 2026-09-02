"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { filterBySearch } from "@/app/_lib/search-normalize";
import { effectivePrice } from "@/app/_lib/pricing";
import { formatPrice } from "@/app/_lib/format";
import { ORDER_SOURCES, OTHER_SOURCE, SOURCE_MAX_LENGTH } from "@/app/_lib/order-source";
import { NOTES_MAX_LENGTH, parsePrice } from "@/app/_lib/external-order";
import { createExternalOrder } from "../actions";

// Minimalny kształt produktu do pickera (page.tsx nie ciągnie pełnych wierszy).
export type ProductOption = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
};

// Wiersz pozycji w formularzu. Cena i ilość jako TEKST — admin wpisuje
// „1 299,50", a parsowanie robi parseExternalOrderInput po stronie serwera;
// tu tylko podgląd sumy. `key` bo ten sam produkt może być dwa razy (dwa
// warianty), więc product_id nie nadaje się na klucz Reacta.
type Row = {
  key: number;
  product_id: string;
  name: string;
  price: string;
  quantity: string;
  notes: string;
};

export default function ExternalOrderForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [source, setSource] = useState<string>(ORDER_SOURCES[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [pending, startTransition] = useTransition();
  // Licznik kluczy wierszy — ref, bo zmiana nie ma renderować.
  const nextKey = useRef(1);

  // Wyszukiwarka jak w /admin/zestawy — filtr kliencki po znormalizowanym tekście.
  const filtered = useMemo(
    () => (query.trim() ? filterBySearch(products, query, (p) => [p.name]).slice(0, 20) : []),
    [products, query]
  );

  // Podgląd sumy: to samo parsowanie co na serwerze, więc nie rozjedzie się
  // z tym, co trafi do bazy. Wiersz z nieczytelną ceną liczy się jako 0.
  const total = rows.reduce((s, r) => {
    const price = parsePrice(r.price) ?? 0;
    const qty = Number(r.quantity);
    return s + price * (Number.isInteger(qty) && qty > 0 ? qty : 0);
  }, 0);

  function addProduct(p: ProductOption) {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        product_id: p.id,
        name: p.name,
        // Podpowiedź: cena sklepowa. Admin nadpisuje ją ceną z marketplace.
        price: String(effectivePrice(Number(p.price), p.sale_price)),
        quantity: "1",
        notes: "",
      },
    ]);
    setQuery("");
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function submit(formData: FormData) {
    setToast(null);
    // Pozycje jako jeden JSON — patrz RawExternalOrder w external-order.ts.
    formData.set(
      "items",
      JSON.stringify(
        rows.map((r) => ({
          product_id: r.product_id,
          price: r.price,
          quantity: r.quantity,
          notes: r.notes,
        }))
      )
    );
    startTransition(async () => {
      const res = await createExternalOrder(formData);
      if (res.ok) {
        router.push(`/admin/zamowienia/${res.orderId}`);
      } else {
        setToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Źródło */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Źródło zamówienia</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Skąd przyszło zamówienie" required>
            <select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={inputCls}
            >
              {ORDER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={OTHER_SOURCE}>{OTHER_SOURCE}</option>
            </select>
          </Field>
          {source === OTHER_SOURCE && (
            <Field
              label="Nazwa źródła"
              required
              hint="Ta nazwa trafi do maila dla klienta (np. „Vinted”)."
            >
              <input
                name="source_name"
                required
                maxLength={SOURCE_MAX_LENGTH}
                placeholder="np. Vinted"
                className={inputCls}
              />
            </Field>
          )}
        </div>
      </Card>

      {/* Klient */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Klient</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Imię i nazwisko" required>
            <input name="fullname" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="E-mail" required hint="Na ten adres pójdą maile o zamówieniu.">
            <input name="email" type="email" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="Telefon">
            <input name="phone" maxLength={40} className={inputCls} />
          </Field>
          <Field label="Ulica i numer" required>
            <input name="street" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="Kod pocztowy" required>
            <input name="postal_code" required maxLength={20} placeholder="00-001" className={inputCls} />
          </Field>
          <Field label="Miasto" required>
            <input name="city" required maxLength={120} className={inputCls} />
          </Field>
        </div>
      </Card>

      {/* Pozycje */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Pozycje</h3>

        <Field label="Dodaj produkt" hint="Wpisz fragment nazwy, potem kliknij produkt na liście.">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj produktu…"
            className={inputCls}
            autoComplete="off"
          />
        </Field>
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
          <p className="mt-4 text-sm text-[var(--muted)]">Brak pozycji — wyszukaj produkt powyżej.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-[var(--border)]" aria-label="Pozycje zamówienia">
            {rows.map((r, idx) => (
              <li key={r.key} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[var(--fg)]">
                    {idx + 1}. {r.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Usuń
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[10rem_6rem_1fr] gap-3">
                  <Field label="Cena (zł)" required hint="Cena z tamtego sklepu.">
                    <input
                      value={r.price}
                      onChange={(e) => updateRow(r.key, { price: e.target.value })}
                      inputMode="decimal"
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Ilość" required>
                    <input
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                      type="number"
                      min={1}
                      step={1}
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Wariant / uwagi" hint="np. „Vena 12, narożnik lewy”.">
                    <input
                      value={r.notes}
                      onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                      maxLength={NOTES_MAX_LENGTH}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between text-base font-bold text-[var(--fg)]">
          <span>Razem</span>
          <span data-testid="external-order-total">{formatPrice(total, "pl")}</span>
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || rows.length === 0}
          className="px-6 py-2.5 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Zapisywanie…" : "Zapisz zamówienie"}
        </button>
        {rows.length === 0 && (
          <span className="text-xs text-[var(--muted)]">Dodaj co najmniej jedną pozycję.</span>
        )}
      </div>
    </form>
  );
}
