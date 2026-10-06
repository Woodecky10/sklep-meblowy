"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { formatPrice } from "@/app/_lib/format";
import { ORDER_SOURCES, OTHER_SOURCE, SOURCE_MAX_LENGTH } from "@/app/_lib/order-source";
import { parsePrice } from "@/app/_lib/external-order";
import { createExternalOrder } from "../actions";
import OrderItemsEditor, { type EditorProduct, type EditorRow } from "../_components/OrderItemsEditor";

// page.tsx importuje ten typ stąd — kształt produktu żyje teraz w edytorze pozycji.
export type { EditorProduct as ProductOption } from "../_components/OrderItemsEditor";

export default function ExternalOrderForm({ products }: { products: EditorProduct[] }) {
  const router = useRouter();
  const [source, setSource] = useState<string>(ORDER_SOURCES[0]);
  // Domyślnie „Opłacone w źródle" — tak działał formularz przed 2026-09-09
  // i tak wygląda większość zamówień z marketplace'ów.
  const [payment, setPayment] = useState<"online" | "cod">("online");
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [toast, setToast] = useState<Toast>(null);
  const [pending, startTransition] = useTransition();
  // Licznik kluczy wierszy — ref, bo zmiana nie ma renderować.
  const nextKey = useRef(1);

  // Podgląd sumy: to samo parsowanie co na serwerze, więc nie rozjedzie się
  // z tym, co trafi do bazy. Wiersz z nieczytelną ceną liczy się jako 0.
  const total = rows.reduce((s, r) => {
    const price = parsePrice(r.price) ?? 0;
    const qty = Number(r.quantity);
    return s + price * (Number.isInteger(qty) && qty > 0 ? qty : 0);
  }, 0);

  function submit(formData: FormData) {
    setToast(null);
    // Pozycje jako jeden JSON — patrz RawExternalOrder w external-order.ts.
    formData.set(
      "items",
      JSON.stringify(
        rows.map((r) => ({
          // Dokładnie jedno z dwóch — parseExternalOrderInput odrzuca oba naraz.
          product_id: r.product_id,
          custom_name: r.product_id === null ? r.name : null,
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
    <form
      action={submit}
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        // Enter w dowolnym polu tekstowym wysyłałby formularz — a po dodaniu
        // pierwszej pozycji przycisk „Zapisz” przestaje być disabled, więc
        // Enter przy wpisywaniu DRUGIEGO produktu zapisałby PRAWDZIWE
        // zamówienie w produkcyjnej bazie. Zapis wyłącznie kliknięciem.
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
          e.preventDefault();
        }
      }}
    >
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

      {/* Płatność */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-1">Płatność</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Czy klient już zapłacił za to zamówienie?
        </p>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Sposób płatności</legend>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="payment"
              value="online"
              checked={payment === "online"}
              onChange={() => setPayment("online")}
              className="mt-1 shrink-0 accent-[var(--color-gold)]"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--fg)]">
                Opłacone w źródle
              </span>
              <span className="block text-xs text-[var(--muted)] leading-snug">
                Klient zapłacił już na Allegro / OLX itp. Zamówienie dostanie status „Opłacone
                (zewn.)”.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="payment"
              value="cod"
              checked={payment === "cod"}
              onChange={() => setPayment("cod")}
              className="mt-1 shrink-0 accent-[var(--color-gold)]"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--fg)]">
                Płatność przy odbiorze
              </span>
              <span className="block text-xs text-[var(--muted)] leading-snug">
                Klient zapłaci gotówką kurierowi. Zamówienie dostanie status „W realizacji”
                z plakietką „Pobranie”.
              </span>
            </span>
          </label>
        </fieldset>
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

        <OrderItemsEditor
          products={products}
          rows={rows}
          setRows={setRows}
          newKey={() => nextKey.current++}
          priceLabel="Cena (zł)"
          priceHint="Cena z tamtego sklepu."
        />

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
