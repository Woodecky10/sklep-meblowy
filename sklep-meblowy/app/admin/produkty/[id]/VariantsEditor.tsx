"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { updateProductVariants } from "../actions";
import type {
  ProductOption,
  ProductVariant,
  ProductVariants,
  Fabric,
} from "@/app/_lib/types";
import { Field, IconBtn, inputClass, type Toast } from "./_shared";
import { useImageUpload } from "./useImageUpload";
import {
  formatVariantLabel,
  variantKey,
  rebuildCombinations,
  applyFabricSelection,
  applyValuePricing,
  expandFabrics,
  fabricValueBelongsTo,
  FABRIC_OPTION_NAME,
} from "@/app/_lib/variants";
import { findInvalidVariantSale } from "@/app/_lib/pricing";
import { groupFabricsByCategory, groupSelectionState } from "@/app/_lib/fabric-groups";

// ============================================================
// Komponent
// ============================================================

export default function VariantsEditor({
  productId,
  initial,
  basePrice,
  fabrics,
  onToast,
}: {
  productId: string;
  initial: ProductVariants | null;
  basePrice: number;
  fabrics: Fabric[];
  onToast: (t: Toast) => void;
}) {
  const [variants, setVariants] = useState<ProductVariants | null>(initial);
  const [saving, startSaveTransition] = useTransition();
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(variants) !== JSON.stringify(initial),
    [variants, initial]
  );

  // ============================================================
  // Mutacje stanu — opcje
  // ============================================================

  function enableVariants() {
    setVariants({ options: [], combinations: [] });
  }

  function disableVariants() {
    if (!window.confirm("Usunąć wszystkie warianty produktu? Zdjęcia per wariant zostaną wyczyszczone.")) return;
    setVariants(null);
  }

  // Przelicz kombinacje po zmianie opcji: rebuild (zachowuje stock/sale/images)
  // + applyValuePricing (gdy są dopłaty per wartość → price_modifier = suma dopłat).
  function commitOptions(nextOptions: ProductOption[], oldCombinations: ProductVariant[]) {
    return applyValuePricing(
      nextOptions,
      rebuildCombinations(nextOptions, oldCombinations)
    );
  }

  function addOption() {
    if (!variants) return;
    const nextOptions = [...variants.options, { name: "", values: [] }];
    setVariants({ ...variants, options: nextOptions });
  }

  function removeOption(idx: number) {
    if (!variants) return;
    const nextOptions = variants.options.filter((_, i) => i !== idx);
    setVariants({
      options: nextOptions,
      combinations: commitOptions(nextOptions, variants.combinations),
    });
  }

  function setOptionName(idx: number, name: string) {
    if (!variants) return;
    const old = variants.options[idx];
    const nextOptions = variants.options.map((o, i) => (i === idx ? { ...o, name } : o));
    // Jeśli nazwa się zmieniła, klucz starych kombinacji jest nieaktualny
    // — najprościej zrebuild, tracąc poprzednie stock/images (ostrzegamy w UI).
    // Ale jeśli mamy poprzednią nazwę i pasujące values, możemy zmapować.
    // value_prices siedzą w obiekcie opcji (klucz = wartość), więc zmiana nazwy
    // opcji ich nie rusza.
    const remappedCombos = variants.combinations.map((c) => {
      if (old.name in c.values) {
        const { [old.name]: v, ...rest } = c.values;
        return { ...c, values: { ...rest, [name]: v } };
      }
      return c;
    });
    setVariants({
      options: nextOptions,
      combinations: commitOptions(nextOptions, remappedCombos),
    });
  }

  function addValue(optIdx: number, value: string) {
    if (!variants) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (variants.options[optIdx].values.includes(trimmed)) return;
    const nextOptions = variants.options.map((o, i) =>
      i === optIdx ? { ...o, values: [...o.values, trimmed] } : o
    );
    setVariants({
      options: nextOptions,
      combinations: commitOptions(nextOptions, variants.combinations),
    });
  }

  function removeValue(optIdx: number, value: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      // Usuń też ewentualną dopłatę tej wartości.
      const nextPrices = { ...(o.value_prices ?? {}) };
      delete nextPrices[value];
      return {
        ...o,
        values: o.values.filter((v) => v !== value),
        value_prices: Object.keys(nextPrices).length > 0 ? nextPrices : undefined,
      };
    });
    setVariants({
      options: nextOptions,
      combinations: commitOptions(nextOptions, variants.combinations),
    });
  }

  // Ustaw dopłatę dla wartości opcji (puste/0 usuwa wpis). Przelicza modyfikatory.
  function setValuePrice(optIdx: number, value: string, price: number | null) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const nextPrices = { ...(o.value_prices ?? {}) };
      if (price === null || price === 0) delete nextPrices[value];
      else nextPrices[value] = price;
      return {
        ...o,
        value_prices: Object.keys(nextPrices).length > 0 ? nextPrices : undefined,
      };
    });
    setVariants({
      options: nextOptions,
      combinations: applyValuePricing(nextOptions, variants.combinations),
    });
  }

  // Zastosuj wybór z katalogu → rozwiń kolekcje na wartości „Nazwa Numer" (+dopłaty),
  // dołącz zachowane wartości spoza katalogu, ustaw opcję „Tkanina" + przelicz.
  function applyFabrics(selectedFabrics: Fabric[], keptOrphanValues: string[]) {
    const base = variants ?? { options: [], combinations: [] };
    const { values, valuePrices } = expandFabrics(
      selectedFabrics.map((f) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0 }))
    );
    // Zachowaj dopłaty istniejących wartości-sierot (spoza katalogu).
    const currentVP =
      base.options.find((o) => o.name === FABRIC_OPTION_NAME)?.value_prices ?? {};
    const finalValues = [...values, ...keptOrphanValues.filter((v) => !values.includes(v))];
    const finalVP: Record<string, number> = { ...valuePrices };
    for (const ov of keptOrphanValues) {
      if (finalVP[ov] == null && currentVP[ov] != null) finalVP[ov] = currentVP[ov];
    }
    const next = applyFabricSelection(base.options, base.combinations, finalValues, finalVP);
    setVariants(next.options.length === 0 ? null : { ...base, ...next });
    setFabricPickerOpen(false);
  }

  // ============================================================
  // Mutacje stanu — kombinacje
  // ============================================================

  function patchCombination(idx: number, patch: Partial<ProductVariant>) {
    if (!variants) return;
    const nextCombos = variants.combinations.map((c, i) =>
      i === idx ? { ...c, ...patch } : c
    );
    setVariants({ ...variants, combinations: nextCombos });
  }

  function setComboImages(idx: number, images: string[]) {
    patchCombination(idx, { images });
  }

  function addComboImages(comboIdx: number, urls: string[]) {
    if (!variants || urls.length === 0) return;
    const combo = variants.combinations[comboIdx];
    setComboImages(comboIdx, [...(combo.images ?? []), ...urls]);
  }

  function moveComboImage(comboIdx: number, imgIdx: number, dir: -1 | 1) {
    if (!variants) return;
    const combo = variants.combinations[comboIdx];
    const imgs = combo.images ?? [];
    const target = imgIdx + dir;
    if (target < 0 || target >= imgs.length) return;
    const next = imgs.slice();
    [next[imgIdx], next[target]] = [next[target], next[imgIdx]];
    setComboImages(comboIdx, next);
  }

  function removeComboImage(comboIdx: number, imgIdx: number) {
    if (!variants) return;
    const combo = variants.combinations[comboIdx];
    const imgs = combo.images ?? [];
    setComboImages(
      comboIdx,
      imgs.filter((_, i) => i !== imgIdx)
    );
  }

  // ============================================================
  // Zapis
  // ============================================================

  function save() {
    startSaveTransition(async () => {
      // Sprzątanie: filtruj puste opcje/wartości, zachowaj dopłaty istniejących
      // wartości, przelicz kombinacje (applyValuePricing).
      let toSave: ProductVariants | null = variants;
      if (variants) {
        const cleanOptions = variants.options
          .map((o) => {
            const values = o.values.filter((v) => v.trim());
            let value_prices: Record<string, number> | undefined;
            if (o.value_prices) {
              const kept: Record<string, number> = {};
              for (const v of values) {
                const p = o.value_prices[v];
                if (typeof p === "number" && Number.isFinite(p) && p !== 0) kept[v] = p;
              }
              if (Object.keys(kept).length > 0) value_prices = kept;
            }
            return { name: o.name.trim(), values, ...(value_prices ? { value_prices } : {}) };
          })
          .filter((o) => o.name && o.values.length > 0);
        if (cleanOptions.length === 0) {
          toSave = null;
        } else {
          toSave = {
            ...variants,
            options: cleanOptions,
            combinations: applyValuePricing(
              cleanOptions,
              rebuildCombinations(cleanOptions, variants.combinations)
            ),
          };
        }
      }
      // Cena regularna kombinacji nie może zejść < 0 (ujemne dopłaty).
      if (toSave) {
        const negative = toSave.combinations.find(
          (c) => basePrice + (c.price_modifier ?? 0) < 0
        );
        if (negative) {
          onToast({
            type: "error",
            message: `Cena kombinacji „${formatVariantLabel(
              negative.values
            )}" wychodzi poniżej zera — popraw dopłaty.`,
          });
          return;
        }
      }
      // Feedback przed round-tripem: cena promo kombinacji < regularnej (base+modyfikator).
      // Serwer waliduje to ponownie autorytatywnie (basePrice z DB).
      if (toSave) {
        const invalid = findInvalidVariantSale(toSave.combinations, basePrice);
        if (invalid) {
          onToast({
            type: "error",
            message: `Cena promocyjna kombinacji „${formatVariantLabel(
              invalid.values
            )}" (${invalid.sale} zł) musi być niższa od jej ceny regularnej (${invalid.regular} zł).`,
          });
          return;
        }
      }
      const res = await updateProductVariants(productId, toSave);
      if (res.ok) {
        onToast({ type: "success", message: res.message ?? "Zapisano warianty" });
        setVariants(toSave);
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  // Pool wszystkich zdjęć ze WSZYSTKICH wariantów (deduplikowane przez URL).
  // Każda kombinacja może z tego wybrać zdjęcie zamiast uploadować nowe —
  // np. produkt ma 4 kolory × 2 strony = 8 kombinacji, ale tylko 4 zestawy
  // zdjęć (per kolor). Admin uploaduje raz dla "Granatowy/Lewa", potem dla
  // "Granatowy/Prawa" tylko klika "Wybierz z istniejących".
  const allVariantImages = useMemo<string[]>(() => {
    if (!variants) return [];
    const seen = new Set<string>();
    for (const c of variants.combinations) {
      for (const url of c.images ?? []) {
        if (url) seen.add(url);
      }
    }
    return Array.from(seen);
  }, [variants]);

  function addExistingImage(comboIdx: number, url: string) {
    if (!variants) return;
    const combo = variants.combinations[comboIdx];
    const current = combo.images ?? [];
    if (current.includes(url)) return; // już jest, ignoruj
    setComboImages(comboIdx, [...current, url]);
  }

  // ============================================================
  // Render
  // ============================================================

  if (!variants) {
    return (
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Warianty produktu
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Produkt nie ma wariantów. Stock jest zarządzany w polu &bdquo;Stan magazynowy&rdquo; wyżej.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enableVariants}
            className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj warianty
          </button>
          <button
            type="button"
            onClick={() => {
              setVariants({ options: [], combinations: [] });
              setFabricPickerOpen(true);
            }}
            className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj tkaniny z katalogu
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Warianty produktu
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
            Najpierw dodaj opcje (np. „Kolor”, „Strona”). Kombinacje generują się
            automatycznie z opcji × wartości. Dla każdej kombinacji ustaw stan i opcjonalnie
            zdjęcia — pokażą się klientowi po wybraniu wariantu.
          </p>
        </div>
        <button
          type="button"
          onClick={disableVariants}
          className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Usuń warianty
        </button>
      </div>

      {/* ============================================================
          Opcje wariantów
          ============================================================ */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display text-base font-semibold text-[var(--fg)]">
          Opcje
        </h3>
        {variants.options.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic">
            Brak opcji. Dodaj pierwszą żeby zacząć (np. „Kolor”).
          </p>
        )}
        {variants.options.map((opt, i) => (
          <OptionRow
            key={i}
            option={opt}
            onNameChange={(name) => setOptionName(i, name)}
            onAddValue={(v) => addValue(i, v)}
            onRemoveValue={(v) => removeValue(i, v)}
            onSetValuePrice={(v, p) => setValuePrice(i, v, p)}
            onRemoveOption={() => removeOption(i)}
          />
        ))}
        <button
          type="button"
          onClick={addOption}
          className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          + Dodaj opcję
        </button>
        <button
          type="button"
          onClick={() => setFabricPickerOpen(true)}
          className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          Wybierz z katalogu tkanin
        </button>
      </div>

      {/* ============================================================
          Kombinacje
          ============================================================ */}
      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6">
        <h3 className="font-display text-base font-semibold text-[var(--fg)]">
          Kombinacje ({variants.combinations.length})
        </h3>
        {variants.combinations.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic">
            Brak kombinacji. Dodaj co najmniej jedną opcję z wartościami żeby kombinacje wygenerowały się automatycznie.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {variants.combinations.map((combo, i) => {
              const key = variantKey(combo.values);
              return (
                <CombinationRow
                  key={key}
                  combo={combo}
                  basePrice={basePrice}
                  onToast={onToast}
                  allVariantImages={allVariantImages}
                  onStockChange={(stock) => patchCombination(i, { stock })}
                  onSalePriceChange={(sale_price) =>
                    patchCombination(i, sale_price === null ? { sale_price: undefined } : { sale_price })
                  }
                  onAddImages={(urls) => addComboImages(i, urls)}
                  onAddExisting={(url) => addExistingImage(i, url)}
                  onMoveImage={(imgIdx, dir) => moveComboImage(i, imgIdx, dir)}
                  onRemoveImage={(imgIdx) => removeComboImage(i, imgIdx)}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* ============================================================
          Zapis
          ============================================================ */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          {dirty ? "Masz niezapisane zmiany w wariantach." : "Warianty zapisane."}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz warianty"}
        </button>
      </div>

      {fabricPickerOpen && (
        <FabricPicker
          fabrics={fabrics}
          initiallySelectedValues={
            variants?.options.find((o) => o.name === FABRIC_OPTION_NAME)?.values ?? []
          }
          onCancel={() => setFabricPickerOpen(false)}
          onApply={applyFabrics}
        />
      )}
    </section>
  );
}

// ============================================================
// Sub-komponenty
// ============================================================

function OptionRow({
  option,
  onNameChange,
  onAddValue,
  onRemoveValue,
  onSetValuePrice,
  onRemoveOption,
}: {
  option: ProductOption;
  onNameChange: (name: string) => void;
  onAddValue: (v: string) => void;
  onRemoveValue: (v: string) => void;
  onSetValuePrice: (value: string, price: number | null) => void;
  onRemoveOption: () => void;
}) {
  const [newValue, setNewValue] = useState("");
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Field label="Nazwa opcji" required className="flex-1">
          <input
            value={option.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="np. Kolor, Strona, Rozmiar"
            maxLength={50}
            className={inputClass}
          />
        </Field>
        <button
          type="button"
          onClick={onRemoveOption}
          className="self-end shrink-0 px-3 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Usuń opcję
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Wartości
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Pole „+zł” to dopłata do ceny bazowej za wybór tej wartości (np. Premium
          +200). Dopłaty wybranych wartości sumują się. Puste = bez dopłaty.
        </p>
        <div className="flex flex-col gap-1.5">
          {option.values.length === 0 && (
            <span className="text-xs text-[var(--muted)] italic">Brak wartości — dodaj poniżej.</span>
          )}
          {option.values.map((v) => (
            <div
              key={v}
              className="flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg px-3 py-1.5"
            >
              <span className="flex-1 text-sm truncate">{v}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-[var(--muted)]">+</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={option.value_prices?.[v] ?? ""}
                  onChange={(e) =>
                    onSetValuePrice(v, e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder="0"
                  aria-label={`Dopłata za ${v} (zł)`}
                  className="w-20 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-right focus:border-[var(--color-gold)] focus:outline-none"
                />
                <span className="text-xs text-[var(--muted)]">zł</span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveValue(v)}
                aria-label={`Usuń ${v}`}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddValue(newValue);
                setNewValue("");
              }
            }}
            placeholder="np. Beżowy"
            maxLength={50}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              onAddValue(newValue);
              setNewValue("");
            }}
            className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj wartość
          </button>
        </div>
      </div>
    </div>
  );
}

function CombinationRow({
  combo,
  basePrice,
  onToast,
  allVariantImages,
  onStockChange,
  onSalePriceChange,
  onAddImages,
  onAddExisting,
  onMoveImage,
  onRemoveImage,
}: {
  combo: ProductVariant;
  basePrice: number;
  onToast: (t: Toast) => void;
  // Wszystkie URL-e zdjęć ze WSZYSTKICH wariantów (z VariantsEditor).
  // CombinationRow filtruje te które już są w bieżącej kombinacji.
  allVariantImages: string[];
  onStockChange: (stock: number) => void;
  onSalePriceChange: (v: number | null) => void;
  onAddImages: (urls: string[]) => void;
  onAddExisting: (url: string) => void;
  onMoveImage: (imgIdx: number, dir: -1 | 1) => void;
  onRemoveImage: (imgIdx: number) => void;
}) {
  const label = formatVariantLabel(combo.values);
  const images = combo.images ?? [];
  const modifier = combo.price_modifier ?? 0;
  const regularPrice = basePrice + modifier;
  const [pickerOpen, setPickerOpen] = useState(false);
  const upload = useImageUpload({
    onUploaded: onAddImages,
    onToast,
    successHint: 'Kliknij „Zapisz warianty” żeby utrwalić.',
  });

  // Picker pokazuje zdjęcia z innych wariantów, jeszcze nie dodane do tej
  // kombinacji. Pusty pool = nie ma żadnych zdjęć w innych wariantach (klient
  // ma tylko upload jako opcję).
  const availableImages = allVariantImages.filter((url) => !images.includes(url));

  return (
    <li className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
      <p className="font-display text-sm font-semibold text-[var(--fg)]">
        {label}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Stan magazynowy">
          <input
            type="number"
            min="0"
            step="1"
            value={combo.stock}
            onChange={(e) => onStockChange(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Cena regularna (zł)"
          hint={
            modifier !== 0
              ? `baza ${basePrice.toFixed(2)} + dopłaty ${modifier >= 0 ? "+" : ""}${modifier.toFixed(2)}`
              : "= cena bazowa (brak dopłat). Ustaw dopłaty przy wartościach opcji wyżej."
          }
        >
          <div className={`${inputClass} bg-[var(--card-bg)] flex items-center font-semibold`}>
            {regularPrice.toFixed(2)} zł
          </div>
        </Field>
        <Field label="Cena promocyjna (zł)" hint="Puste = brak. < regularnej.">
          <input
            type="number"
            step="0.01"
            min="0"
            value={combo.sale_price ?? ""}
            onChange={(e) =>
              onSalePriceChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
      </div>

      <div
        {...upload.dropProps}
        className={`relative flex flex-col gap-2 rounded-lg transition-colors ${
          upload.isDragging
            ? "outline outline-2 outline-dashed outline-[var(--color-gold)] outline-offset-4"
            : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Zdjęcia tej kombinacji ({images.length})
          </span>
          <div className="flex items-center gap-2">
            {availableImages.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
              >
                {pickerOpen ? "Zamknij wybór" : `Wybierz z istniejących (${availableImages.length})`}
              </button>
            )}
            <label
              className={`shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer ${
                upload.uploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {upload.progressText ?? "+ Dodaj zdjęcia"}
              <input {...upload.inputProps} className="hidden" />
            </label>
          </div>
        </div>

        {pickerOpen && availableImages.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-3 mt-1">
            <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
              Zdjęcia z innych wariantów — kliknij żeby dodać do tej kombinacji
            </p>
            <ul className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
              {availableImages.map((url) => (
                <li key={url}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddExisting(url);
                    }}
                    aria-label="Dodaj to zdjęcie do bieżącej kombinacji"
                    className="relative aspect-square w-full bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--color-gold)] hover:ring-2 hover:ring-[var(--color-gold)]/30 transition-all group"
                  >
                    <Image
                      src={url}
                      alt="Zdjęcie z innego wariantu"
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-[var(--color-navy)]/0 group-hover:bg-[var(--color-navy)]/40 flex items-center justify-center transition-colors">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-[var(--color-gold)] text-[var(--color-navy)] flex items-center justify-center">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {images.length === 0 ? (
          <p className="text-xs text-[var(--muted)] italic">
            Brak zdjęć — klient zobaczy globalną galerię produktu.
          </p>
        ) : (
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {images.map((url, i) => (
              <li
                key={`${url}-${i}`}
                className="relative aspect-square bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden border border-[var(--border)]"
              >
                <Image src={url} alt={`Zdjęcie wariantu ${i + 1}`} fill sizes="150px" className="object-cover" />
                <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-sans rounded-full">
                  {i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-1 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent">
                  <div className="flex gap-0.5">
                    <IconBtn
                      label="W lewo"
                      onClick={() => onMoveImage(i, -1)}
                      disabled={i === 0}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="W prawo"
                      onClick={() => onMoveImage(i, 1)}
                      disabled={i === images.length - 1}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </IconBtn>
                  </div>
                  <IconBtn label="Usuń" onClick={() => onRemoveImage(i)} danger>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                    </svg>
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
        {upload.isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-[var(--color-navy)]/60 pointer-events-none">
            <span className="text-white font-sans text-xs uppercase tracking-widest">
              Upuść zdjęcia tutaj
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function FabricPicker({
  fabrics,
  initiallySelectedValues,
  onApply,
  onCancel,
}: {
  fabrics: Fabric[];
  initiallySelectedValues: string[];
  onApply: (selectedFabrics: Fabric[], keptOrphanValues: string[]) => void;
  onCancel: () => void;
}) {
  const toLite = (f: Fabric) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0 });

  const [selectedNames, setSelectedNames] = useState<string[]>(() =>
    fabrics
      .filter((f) => initiallySelectedValues.some((v) => fabricValueBelongsTo(v, toLite(f))))
      .map((f) => f.name)
  );
  // Wartości spoza katalogu (żadna kolekcja ich nie obejmuje) — zachowywane, można odznaczyć.
  const orphanValues = initiallySelectedValues.filter(
    (v) => !fabrics.some((f) => fabricValueBelongsTo(v, toLite(f)))
  );
  const [keptOrphans, setKeptOrphans] = useState<string[]>(orphanValues);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  // Rozwinięte sekcje (domyślnie wszystkie zwinięte; przy szukaniu i tak rozwinięte).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(name: string) {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }
  function toggleOrphan(v: string) {
    setKeptOrphans((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleExpand(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const base = onlySelected ? fabrics.filter((f) => selectedNames.includes(f.name)) : fabrics;
  const filtered = q ? base.filter((f) => f.name.toLowerCase().includes(q)) : base;
  const groups = groupFabricsByCategory(filtered);
  const selectedSet = new Set(selectedNames);
  const searching = q.length > 0;
  // Przy szukaniu / gdy jest tylko jedna grupa — rozwijamy automatycznie.
  const autoExpandAll = searching || groups.length === 1;

  function toggleGroup(group: (typeof groups)[number]) {
    const names = group.fabrics.map((f) => f.name);
    const state = groupSelectionState(group, selectedSet);
    setSelectedNames((prev) => {
      if (state === "all") {
        const rm = new Set(names);
        return prev.filter((n) => !rm.has(n));
      }
      return [...new Set([...prev, ...names])];
    });
  }
  function selectAllFiltered() {
    const names = filtered.map((f) => f.name);
    setSelectedNames((prev) => [...new Set([...prev, ...names])]);
  }
  function deselectAllFiltered() {
    const rm = new Set(filtered.map((f) => f.name));
    setSelectedNames((prev) => prev.filter((n) => !rm.has(n)));
  }

  const selectedFabrics = fabrics.filter((f) => selectedNames.includes(f.name));
  const { values: previewValues } = expandFabrics(selectedFabrics.map(toLite));
  const totalValues =
    previewValues.length + keptOrphans.filter((v) => !previewValues.includes(v)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col p-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz tkaniny (wybrano: {selectedNames.length} → {totalValues} wart.)
          </h3>
          <input
            type="text"
            autoFocus
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--fg)]">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={() => setOnlySelected((v) => !v)}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            tylko zaznaczone
          </label>
          <button
            type="button"
            onClick={selectAllFiltered}
            className="px-2 py-1 border border-[var(--border)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            Zaznacz pasujące
          </button>
          <button
            type="button"
            onClick={deselectAllFiltered}
            className="px-2 py-1 border border-[var(--border)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            Odznacz pasujące
          </button>
        </div>

        {fabrics.length === 0 && orphanValues.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic py-6 text-center">
            Brak tkanin w katalogu. Dodaj je w &bdquo;Tkaniny&rdquo; (menu admina).
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl">
            {orphanValues.length > 0 && (
              <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
                {orphanValues.map((v) => (
                  <li key={`orphan-${v}`}>
                    <label className="flex items-center gap-3 p-2 cursor-pointer bg-amber-50 dark:bg-amber-950/30">
                      <input
                        type="checkbox"
                        checked={keptOrphans.includes(v)}
                        onChange={() => toggleOrphan(v)}
                        className="h-4 w-4 accent-[var(--color-gold)]"
                      />
                      <span className="text-sm text-[var(--fg)]">{v}</span>
                      <span className="text-[10px] font-sans uppercase tracking-widest text-amber-600 dark:text-amber-400 ml-auto">
                        spoza katalogu
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {groups.length === 0 && (
              <p className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
            )}
            {groups.map((group) => {
              const state = groupSelectionState(group, selectedSet);
              const open = autoExpandAll || expanded.has(group.category);
              return (
                <div key={group.category}>
                  <div className="flex items-center gap-2 p-2 bg-[var(--bg)] border-b border-[var(--border)] sticky top-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.category)}
                      className="w-5 text-[var(--muted)] hover:text-[var(--fg)]"
                      aria-label={open ? "Zwiń" : "Rozwiń"}
                    >
                      {open ? "▾" : "▸"}
                    </button>
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = state === "some";
                      }}
                      checked={state === "all"}
                      onChange={() => toggleGroup(group)}
                      className="h-4 w-4 accent-[var(--color-gold)]"
                      title="Zaznacz/odznacz całą grupę"
                    />
                    <span className="text-sm font-semibold text-[var(--fg)]">{group.category}</span>
                    <span className="text-[10px] text-[var(--muted)] ml-auto">{group.fabrics.length}</span>
                  </div>
                  {open && (
                    <ul className="divide-y divide-[var(--border)]">
                      {group.fabrics.map((f) => {
                        const active = selectedNames.includes(f.name);
                        const colorCount = (f.colors ?? []).length;
                        return (
                          <li key={f.id}>
                            <label className={`flex items-center gap-3 p-2 pl-7 cursor-pointer transition-colors ${active ? "bg-[var(--color-gold)]/10" : "hover:bg-[var(--bg)]"}`}>
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggle(f.name)}
                                className="h-4 w-4 accent-[var(--color-gold)]"
                              />
                              <span className="text-sm text-[var(--fg)]">{f.name}</span>
                              <span className="text-[10px] text-[var(--muted)] ml-auto text-right">
                                {colorCount > 0 ? `${colorCount} kol.` : "bez kolorów"}
                                {f.price > 0 && ` · +${f.price.toFixed(2)} zł`}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => onApply(selectedFabrics, keptOrphans)}
            className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            Zastosuj ({totalValues})
          </button>
        </div>
      </div>
    </div>
  );
}
