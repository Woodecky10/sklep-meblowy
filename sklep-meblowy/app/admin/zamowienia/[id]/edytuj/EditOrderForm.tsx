"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { parsePrice } from "@/app/_lib/external-order";
import { formatOrderAmount } from "@/app/_lib/money";
import type { Address } from "@/app/_lib/types";
import { updateOrder } from "../../actions";
import OrderItemsEditor, {
  type EditorProduct,
  type EditorRow,
} from "../../_components/OrderItemsEditor";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function EditOrderForm({
  orderId,
  fingerprint,
  currency,
  total,
  paidOnline,
  guestEmail,
  accountEmail,
  address,
  bundleDiscount,
  promoDiscount,
  products,
  initialRows,
}: {
  orderId: string;
  fingerprint: string;
  currency: "pln" | "eur";
  total: number;
  paidOnline: boolean;
  guestEmail: string | null;
  accountEmail: string | null;
  address: Address;
  bundleDiscount: number;
  promoDiscount: number;
  products: EditorProduct[];
  initialRows: EditorRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditorRow[]>(initialRows);
  const [bundle, setBundle] = useState(String(bundleDiscount));
  const [promo, setPromo] = useState(String(promoDiscount));
  const [toast, setToast] = useState<Toast>(null);
  const [pending, startTransition] = useTransition();
  // Wiersze z serwera mają klucze 1..N — nowe muszą zacząć od N+1.
  const nextKey = useRef(initialRows.length + 1);

  // Podgląd sumy: to samo parsowanie co na serwerze (parsePrice), wiersz
  // z nieczytelną ceną liczy się jako 0.
  const itemsSum = round2(
    rows.reduce((s, r) => {
      const price = parsePrice(r.price) ?? 0;
      const qty = Number(r.quantity);
      return s + price * (Number.isInteger(qty) && qty > 0 ? qty : 0);
    }, 0)
  );
  const discounts = round2((parsePrice(bundle) ?? 0) + (parsePrice(promo) ?? 0));
  const newTotal = Math.max(0, round2(itemsSum - discounts));

  function submit(formData: FormData) {
    setToast(null);
    formData.set(
      "items",
      JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          product_id: r.product_id,
          custom_name: r.product_id === null ? r.name : null,
          price: r.price,
          quantity: r.quantity,
          notes: r.notes,
          variant_values: r.variant_values,
        }))
      )
    );
    startTransition(async () => {
      const res = await updateOrder(formData);
      if (res.ok) {
        router.push(`/admin/zamowienia/${orderId}?edytowano=1`);
        router.refresh();
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
        // Enter w polu tekstowym wysyłałby formularz i zapisał zmiany w
        // PRAWDZIWYM zamówieniu. Zapis wyłącznie kliknięciem.
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
          e.preventDefault();
        }
      }}
    >
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="fingerprint" value={fingerprint} />

      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Klient</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Imię i nazwisko" required>
            <input
              name="fullname"
              required
              maxLength={200}
              defaultValue={address.fullname ?? ""}
              className={inputCls}
            />
          </Field>
          {guestEmail !== null ? (
            <Field label="E-mail" required hint="Na ten adres pójdą maile o zamówieniu.">
              <input
                name="email"
                type="email"
                required
                maxLength={200}
                defaultValue={guestEmail}
                className={inputCls}
              />
            </Field>
          ) : (
            <Field
              label="E-mail"
              hint="E-mail konta klienta — zmienia go klient w swoim koncie."
            >
              <input
                value={accountEmail ?? "—"}
                readOnly
                disabled
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Telefon">
            <input
              name="phone"
              maxLength={40}
              defaultValue={address.phone ?? ""}
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Adres dostawy</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ulica i numer" required>
            <input
              name="street"
              required
              maxLength={200}
              defaultValue={address.street ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Kod pocztowy" required>
            <input
              name="postal_code"
              required
              maxLength={20}
              defaultValue={address.postal_code ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Miasto" required>
            <input
              name="city"
              required
              maxLength={120}
              defaultValue={address.city ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Kraj">
            <input
              name="country"
              maxLength={80}
              defaultValue={address.country || "Polska"}
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Pozycje</h3>
        <OrderItemsEditor
          products={products}
          rows={rows}
          setRows={setRows}
          newKey={() => nextKey.current++}
          priceLabel={currency === "eur" ? "Cena (EUR)" : "Cena (zł)"}
          withVariants
          catalogHint={currency === "pln"}
          withCarryIn
        />
      </Card>

      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Rabaty</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Rabat za zestaw">
            <input
              name="bundle_discount"
              value={bundle}
              onChange={(e) => setBundle(e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </Field>
          <Field label="Rabat z kodu">
            <input
              name="promo_discount"
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Podsumowanie</h3>
        <div className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          <p className="flex justify-between">
            <span>Pozycje</span>
            <span>{formatOrderAmount(itemsSum, currency)}</span>
          </p>
          <p className="flex justify-between">
            <span>Rabaty</span>
            <span>−{formatOrderAmount(discounts, currency)}</span>
          </p>
          <p className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between items-baseline text-base font-bold">
            <span>Nowa suma</span>
            <span>
              <span data-testid="edit-order-total">{formatOrderAmount(newTotal, currency)}</span>
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                było {formatOrderAmount(total, currency)}
              </span>
            </span>
          </p>
        </div>
        {paidOnline && (
          <p
            role="note"
            className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            Przelewy24 pobrały {formatOrderAmount(total, currency)}. Zmiana sumy nie zmienia
            pobranej kwoty — dopłatę lub zwrot rozlicz ręcznie.
          </p>
        )}
      </Card>

      <label className="flex items-center gap-3 cursor-pointer text-sm text-[var(--fg)]">
        <input
          type="checkbox"
          name="notify"
          value="1"
          className="shrink-0 accent-[var(--color-gold)]"
        />
        Powiadom klienta mailem o zmianach
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || rows.length === 0}
          className="px-6 py-2.5 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Zapisywanie…" : "Zapisz zmiany"}
        </button>
        <Link
          href={`/admin/zamowienia/${orderId}`}
          className="px-4 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </Link>
      </div>
    </form>
  );
}
