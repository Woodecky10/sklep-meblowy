"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { Bundle } from "@/app/_lib/types";
import { filterBySearch } from "@/app/_lib/search-normalize";
import { effectivePrice } from "@/app/_lib/pricing";
import { computeBundleDiscount, type BundleDiscountType } from "@/app/_lib/bundles";
import { formatPrice } from "@/app/_lib/format";
import { createBundle, saveBundle, deleteBundle } from "./actions";

// Minimalny kształt produktu do pickera (lista może mieć setki pozycji —
// page.tsx nie ciągnie pełnych wierszy). Eksport stąd, NIE z page.tsx.
export type PickerProduct = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
  is_active: boolean;
};

type AdminBundle = Bundle & { product_ids: string[] };

export default function BundlesEditor({
  bundles,
  products,
}: {
  bundles: AdminBundle[];
  products: PickerProduct[];
}) {
  const [editing, setEditing] = useState<AdminBundle | "new" | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  return (
    <div className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {editing === null ? (
        <>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="self-start px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            + Nowy zestaw
          </button>
          {bundles.length === 0 ? (
            <EmptyState message="Nie masz jeszcze żadnych zestawów. Dodaj pierwszy żeby zacząć." />
          ) : (
            <ul className="flex flex-col gap-3">
              {bundles.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl"
                >
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-[var(--fg)]">
                      {b.name}{" "}
                      {!b.is_active && (
                        <span className="text-xs text-[var(--muted)]">(nieaktywny)</span>
                      )}
                      {b.product_ids.length < 2 && (
                        <span className="text-xs text-red-600"> (niekompletny — min 2 produkty)</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted)] truncate mt-0.5">
                      {b.product_ids
                        .map((id) => productById.get(id)?.name ?? "(produkt ukryty/usunięty)")
                        .join(" + ")}{" "}
                      · rabat{" "}
                      {b.discount_type === "percent"
                        ? `${b.discount_value}%`
                        : `${b.discount_value} zł`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a
                      href={`/zestaw/${b.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)]"
                    >
                      Podgląd
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditing(b)}
                      className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                    >
                      Edytuj
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Card>
          <BundleForm
            bundle={editing === "new" ? null : editing}
            products={products}
            onDone={(t) => {
              setEditing(null);
              showToast(t);
            }}
          />
        </Card>
      )}
    </div>
  );
}

function BundleForm({
  bundle,
  products,
  onDone,
}: {
  bundle: AdminBundle | null;
  products: PickerProduct[];
  onDone: (toast: Toast) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(bundle?.product_ids ?? []);
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [descriptionDe, setDescriptionDe] = useState(bundle?.description_de ?? "");
  const [discountType, setDiscountType] = useState<BundleDiscountType>(
    bundle?.discount_type ?? "percent"
  );
  const [discountValue, setDiscountValue] = useState<string>(
    bundle ? String(bundle.discount_value) : "10"
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Wyszukiwarka jak w /admin/produkty — filtr kliencki po znormalizowanym tekście.
  const filtered = useMemo(
    () => filterBySearch(products, query, (p) => [p.name]),
    [products, query]
  );

  // Podgląd na żywo: suma cen bazowych (efektywnych) → cena zestawu.
  const baseSum = selectedIds.reduce((s, id) => {
    const p = productById.get(id);
    return p ? s + effectivePrice(Number(p.price), p.sale_price) : s;
  }, 0);
  const parsedValue = Number(discountValue);
  const previewDiscount =
    Number.isFinite(parsedValue) && parsedValue > 0
      ? computeBundleDiscount(baseSum, 1, discountType, parsedValue)
      : 0;

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = bundle ? saveBundle : createBundle;
      const res = await action(formData, selectedIds);
      if (res.ok) onDone({ type: "success", message: res.message ?? "Zapisano" });
      else setError(res.error);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-5">
      {bundle && <input type="hidden" name="id" value={bundle.id} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nazwa zestawu" required>
          <input name="name" defaultValue={bundle?.name ?? ""} required maxLength={200}
            placeholder="np. Zestaw Loft" className={inputCls} />
        </Field>
        <Field label="Nazwa (DE)" hint="Puste → na /de pokaże się nazwa PL.">
          <input name="name_de" defaultValue={bundle?.name_de ?? ""} maxLength={200}
            className={inputCls} />
        </Field>
        <Field label="Opis" hint="Opcjonalny. Obsługuje formatowanie." className="md:col-span-2">
          <input type="hidden" name="description" value={description} />
          <RichTextEditor value={description} onChange={setDescription} ariaLabel="Opis zestawu (PL)" placeholder="Opis zestawu…" />
        </Field>
        <Field label="Opis (DE)" hint="Puste → na /de pokaże się opis PL." className="md:col-span-2">
          <input type="hidden" name="description_de" value={descriptionDe} />
          <RichTextEditor value={descriptionDe} onChange={setDescriptionDe} ariaLabel="Opis zestawu (DE)" />
        </Field>
        {!bundle && (
          <Field label="Adres (slug)" hint="Zostaw puste żeby wygenerować z nazwy.">
            <input name="slug" maxLength={80} placeholder="np. zestaw-loft"
              className={`${inputCls} font-mono`} />
          </Field>
        )}
      </div>

      {/* Rabat */}
      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
          Rabat zestawu <span className="text-red-500">*</span>
        </legend>
        <div className="flex rounded-full border border-[var(--border)] overflow-hidden">
          {(["percent", "amount"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDiscountType(t)}
              className={`px-4 py-2 text-sm ${
                discountType === t
                  ? "bg-[var(--color-navy)] text-white"
                  : "text-[var(--muted)]"
              }`}
            >
              {t === "percent" ? "%" : "zł"}
            </button>
          ))}
        </div>
        <input type="hidden" name="discount_type" value={discountType} />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            {discountType === "percent" ? "Procent (1–90)" : "Kwota w zł"}
          </span>
          <input
            name="discount_value"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            type="number"
            min={discountType === "percent" ? 1 : 0.01}
            max={discountType === "percent" ? 90 : undefined}
            step={discountType === "percent" ? 1 : 0.01}
            required
            className={`${inputCls} w-32`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={bundle?.is_active ?? true}
            className="h-4 w-4 accent-[var(--color-gold)]"
          />
          <span>Aktywny (widoczny w sklepie)</span>
        </label>
      </fieldset>

      {/* Picker produktów */}
      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Produkty w zestawie <span className="text-red-500">*</span> (min 2) — wybrano:{" "}
            {selectedIds.length}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj produktu…"
            className={`${inputCls} max-w-xs`}
          />
        </div>
        <ul className="max-h-96 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {filtered.map((p) => {
            const active = selectedIds.includes(p.id);
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${active ? "bg-[var(--color-gold)]/10" : "hover:bg-[var(--bg)]"}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                    {p.images?.[0] ? (
                      <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    ) : null}
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">{p.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {formatPrice(effectivePrice(Number(p.price), p.sale_price), "pl")}
                  </span>
                </label>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
          )}
        </ul>
      </div>

      {/* Podgląd na żywo */}
      {selectedIds.length >= 2 && (
        <div className="text-sm bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[var(--muted)]">
            Razem osobno: <b className="text-[var(--fg)]">{formatPrice(baseSum, "pl")}</b>
          </p>
          <p className="text-[var(--muted)]">
            W zestawie:{" "}
            <b className="text-[var(--fg)]">{formatPrice(Math.max(0, baseSum - previewDiscount), "pl")}</b>{" "}
            <span className="text-emerald-700">(klient oszczędza {formatPrice(previewDiscount, "pl")})</span>
          </p>
          {discountType === "amount" && parsedValue >= baseSum && baseSum > 0 && (
            <p className="text-amber-700 mt-1">
              Uwaga: kwota rabatu jest większa lub równa sumie cen — zestaw wyjdzie za 0 zł.
            </p>
          )}
          <p className="text-xs text-[var(--muted)] mt-2">
            Ceny bazowe bez dopłat za tkaniny/opcje — rzeczywisty rabat liczy się od
            cen z wybranymi dopłatami.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={pending || selectedIds.length < 2}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : bundle ? "Zapisz zestaw" : "Utwórz zestaw"}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          disabled={pending}
          className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </button>
        {bundle && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!(await confirm({ message: `Usunąć zestaw "${bundle.name}"? Produkty zostają w sklepie.`, danger: true }))) return;
              const fd = new FormData();
              fd.set("id", bundle.id);
              startTransition(async () => {
                const res = await deleteBundle(fd);
                onDone(
                  res.ok
                    ? { type: "success", message: res.message ?? "Usunięto" }
                    : { type: "error", message: res.error }
                );
              });
            }}
            className="ml-auto px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            Usuń zestaw
          </button>
        )}
      </div>
    </form>
  );
}
