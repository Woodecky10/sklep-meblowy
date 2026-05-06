"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import type { Product, ProductVariant } from "@/app/_lib/types";
import {
  updateOptionName,
  updateValueLabel,
  updateVariantImages,
  type ActionResult,
} from "./actions";

type Toast = { type: "success" | "error"; message: string } | null;

export default function VariantsEditor({ product }: { product: Product }) {
  const [toast, setToast] = useState<Toast>(null);
  const variants = product.variants!;
  const allImages = product.images ?? [];

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3500);
  }

  function handleResult(r: ActionResult) {
    if (r.ok) showToast({ type: "success", message: r.message ?? "Zapisano" });
    else showToast({ type: "error", message: r.error });
  }

  return (
    <div className="flex flex-col gap-8">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Sekcja: Edycja nazw opcji */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-[var(--fg)] mb-1">
          Nazwy opcji
        </h2>
        <p className="text-xs text-[var(--muted)] mb-4">
          Zmień napis który widzi klient (np. „Wariant" → „Kolor"). Zostaw
          puste żeby użyć surowej nazwy z BaseLinkera.
        </p>
        <div className="flex flex-col gap-3">
          {variants.options.map((opt) => (
            <OptionNameRow
              key={opt.name}
              productId={product.id}
              optionName={opt.name}
              currentDisplay={
                variants.overrides?.option_names?.[opt.name] ?? ""
              }
              onResult={handleResult}
            />
          ))}
        </div>
      </Card>

      {/* Sekcja: Edycja value labels — per opcja */}
      {variants.options.map((opt) => (
        <Card key={`labels-${opt.name}`}>
          <h2 className="font-display text-lg font-semibold text-[var(--fg)] mb-1">
            Wartości — „{opt.name}"
          </h2>
          <p className="text-xs text-[var(--muted)] mb-4">
            Zmień napis który widzi klient (np. „01 beż drewniany stelaż" →
            „Beż drewniany"). Zostaw puste żeby zachować surową nazwę.
          </p>
          <div className="flex flex-col gap-2">
            {opt.values.map((val) => (
              <ValueLabelRow
                key={val}
                productId={product.id}
                optionName={opt.name}
                rawValue={val}
                currentDisplay={
                  variants.overrides?.value_labels?.[opt.name]?.[val] ?? ""
                }
                onResult={handleResult}
              />
            ))}
          </div>
        </Card>
      ))}

      {/* Sekcja: Zdjęcia per wariant */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-[var(--fg)] mb-1">
          Zdjęcia per wariant
        </h2>
        <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
          Dla każdego wariantu zaznacz zdjęcia które klient zobaczy po jego
          wyborze. Bez zaznaczenia żadnego — pokażemy wszystkie zdjęcia
          produktu (fallback).
        </p>
        {allImages.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">
            Produkt nie ma żadnych zdjęć — wgraj je w BaseLinkerze.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {variants.combinations.map((combo, idx) => (
              <VariantImagesRow
                key={idx}
                productId={product.id}
                combo={combo}
                allImages={allImages}
                onResult={handleResult}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// Pojedynczy wiersz: edycja nazwy opcji
// ============================================================

function OptionNameRow({
  productId,
  optionName,
  currentDisplay,
  onResult,
}: {
  productId: string;
  optionName: string;
  currentDisplay: string;
  onResult: (r: ActionResult) => void;
}) {
  const [value, setValue] = useState(currentDisplay);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await updateOptionName(productId, optionName, value);
      onResult(r);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] w-24 shrink-0">
        {optionName}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`np. Kolor (zostaw puste = ${optionName})`}
        className="flex-1 px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
      />
      <button
        onClick={save}
        disabled={pending || value === currentDisplay}
        className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-30"
      >
        {pending ? "..." : "Zapisz"}
      </button>
    </div>
  );
}

// ============================================================
// Pojedynczy wiersz: edycja value label
// ============================================================

function ValueLabelRow({
  productId,
  optionName,
  rawValue,
  currentDisplay,
  onResult,
}: {
  productId: string;
  optionName: string;
  rawValue: string;
  currentDisplay: string;
  onResult: (r: ActionResult) => void;
}) {
  const [value, setValue] = useState(currentDisplay);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await updateValueLabel(productId, optionName, rawValue, value);
      onResult(r);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <code className="text-xs text-[var(--muted)] w-48 shrink-0 truncate" title={rawValue}>
        {rawValue}
      </code>
      <span className="text-[var(--muted)]">→</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`zostaw puste = "${rawValue}"`}
        className="flex-1 px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
      />
      <button
        onClick={save}
        disabled={pending || value === currentDisplay}
        className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-30"
      >
        {pending ? "..." : "Zapisz"}
      </button>
    </div>
  );
}

// ============================================================
// Pojedynczy wiersz: zdjęcia per wariant
// ============================================================

function VariantImagesRow({
  productId,
  combo,
  allImages,
  onResult,
}: {
  productId: string;
  combo: ProductVariant;
  allImages: string[];
  onResult: (r: ActionResult) => void;
}) {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(
    new Set(combo.images ?? [])
  );
  const [pending, startTransition] = useTransition();
  const initial = new Set(combo.images ?? []);
  const dirty =
    selectedImages.size !== initial.size ||
    [...selectedImages].some((url) => !initial.has(url));

  function toggle(url: string) {
    const next = new Set(selectedImages);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelectedImages(next);
  }

  function save() {
    startTransition(async () => {
      const r = await updateVariantImages(
        productId,
        combo.values,
        Array.from(selectedImages)
      );
      onResult(r);
    });
  }

  const variantLabel = Object.entries(combo.values)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-sans font-semibold text-[var(--fg)]">
          {variantLabel}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {selectedImages.size} z {allImages.length} zaznaczone
          </span>
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="px-4 py-1.5 text-xs font-sans uppercase tracking-widest bg-[var(--color-navy)] text-white rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-30"
          >
            {pending ? "Zapisuję..." : "Zapisz"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {allImages.map((url) => {
          const active = selectedImages.has(url);
          return (
            <button
              key={url}
              type="button"
              onClick={() => toggle(url)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                active
                  ? "border-[var(--color-gold)]"
                  : "border-transparent hover:border-[var(--border)]"
              }`}
              aria-pressed={active}
            >
              <Image src={url} alt="" fill sizes="100px" className="object-cover" />
              {active && (
                <span className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-gold)] text-[var(--color-navy)]">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Pomocnicze
// ============================================================

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      {children}
    </div>
  );
}

function ToastView({ toast, onClose }: { toast: NonNullable<Toast>; onClose: () => void }) {
  return (
    <div
      role="status"
      className={`fixed top-24 right-6 z-50 max-w-sm px-5 py-4 rounded-2xl shadow-2xl border ${
        toast.type === "success"
          ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
          : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <p className="text-sm flex-1">{toast.message}</p>
        <button onClick={onClose} aria-label="Zamknij" className="shrink-0 opacity-70 hover:opacity-100">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
