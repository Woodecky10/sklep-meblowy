"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { updateProductVariants, uploadProductImage } from "../actions";
import type {
  ProductOption,
  ProductVariant,
  ProductVariants,
} from "@/app/_lib/types";
import {
  Field,
  IconBtn,
  compressIfNeeded,
  inputClass,
  type Toast,
} from "./_shared";
import {
  formatVariantLabel,
  variantKey,
  rebuildCombinations,
} from "@/app/_lib/variants";

// ============================================================
// Komponent
// ============================================================

export default function VariantsEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: ProductVariants | null;
  onToast: (t: Toast) => void;
}) {
  const [variants, setVariants] = useState<ProductVariants | null>(initial);
  const [saving, startSaveTransition] = useTransition();
  // Klucze kombinacji w trakcie uploadu zdjęcia (żeby zablokować ich button)
  const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());

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
      combinations: rebuildCombinations(nextOptions, variants.combinations),
    });
  }

  function setOptionName(idx: number, name: string) {
    if (!variants) return;
    const old = variants.options[idx];
    const nextOptions = variants.options.map((o, i) => (i === idx ? { ...o, name } : o));
    // Jeśli nazwa się zmieniła, klucz starych kombinacji jest nieaktualny
    // — najprościej zrebuild, tracąc poprzednie stock/images (ostrzegamy w UI).
    // Ale jeśli mamy poprzednią nazwę i pasujące values, możemy zmapować.
    const remappedCombos = variants.combinations.map((c) => {
      if (old.name in c.values) {
        const { [old.name]: v, ...rest } = c.values;
        return { ...c, values: { ...rest, [name]: v } };
      }
      return c;
    });
    setVariants({
      options: nextOptions,
      combinations: rebuildCombinations(nextOptions, remappedCombos),
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
      combinations: rebuildCombinations(nextOptions, variants.combinations),
    });
  }

  function removeValue(optIdx: number, value: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) =>
      i === optIdx ? { ...o, values: o.values.filter((v) => v !== value) } : o
    );
    setVariants({
      options: nextOptions,
      combinations: rebuildCombinations(nextOptions, variants.combinations),
    });
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

  async function uploadComboImage(comboIdx: number, file: File) {
    if (!variants) return;
    const combo = variants.combinations[comboIdx];
    const key = variantKey(combo.values);
    setUploadingKeys((prev) => new Set(prev).add(key));
    try {
      const toSend = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", toSend, toSend.name);
      const res = await uploadProductImage(fd);
      if (!res.ok) {
        onToast({ type: "error", message: res.error });
        return;
      }
      const url = (res.data as { url: string } | undefined)?.url;
      if (!url) {
        onToast({ type: "error", message: "Brak URL po uploadzie" });
        return;
      }
      const currentImages = combo.images ?? [];
      setComboImages(comboIdx, [...currentImages, url]);
      onToast({
        type: "success",
        message: "Zdjęcie wgrane. Kliknij „Zapisz warianty” żeby utrwalić.",
      });
    } finally {
      setUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
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
      // Sprzątanie: filtruj puste opcje/wartości, rebuild kombinacji
      let toSave: ProductVariants | null = variants;
      if (variants) {
        const cleanOptions = variants.options
          .map((o) => ({ name: o.name.trim(), values: o.values.filter((v) => v.trim()) }))
          .filter((o) => o.name && o.values.length > 0);
        if (cleanOptions.length === 0) {
          toSave = null;
        } else {
          toSave = {
            options: cleanOptions,
            combinations: rebuildCombinations(cleanOptions, variants.combinations),
          };
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
        <button
          type="button"
          onClick={enableVariants}
          className="self-start px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          + Dodaj warianty
        </button>
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
                  uploading={uploadingKeys.has(key)}
                  allVariantImages={allVariantImages}
                  onStockChange={(stock) => patchCombination(i, { stock })}
                  onPriceModifierChange={(price_modifier) =>
                    patchCombination(i, { price_modifier })
                  }
                  onSalePriceChange={(sale_price) =>
                    patchCombination(i, sale_price === null ? { sale_price: undefined } : { sale_price })
                  }
                  onUpload={(file) => uploadComboImage(i, file)}
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
  onRemoveOption,
}: {
  option: ProductOption;
  onNameChange: (name: string) => void;
  onAddValue: (v: string) => void;
  onRemoveValue: (v: string) => void;
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
        <div className="flex flex-wrap gap-2">
          {option.values.length === 0 && (
            <span className="text-xs text-[var(--muted)] italic">Brak wartości — dodaj poniżej.</span>
          )}
          {option.values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-full text-sm"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemoveValue(v)}
                aria-label={`Usuń ${v}`}
                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
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
  uploading,
  allVariantImages,
  onStockChange,
  onPriceModifierChange,
  onSalePriceChange,
  onUpload,
  onAddExisting,
  onMoveImage,
  onRemoveImage,
}: {
  combo: ProductVariant;
  uploading: boolean;
  // Wszystkie URL-e zdjęć ze WSZYSTKICH wariantów (z VariantsEditor).
  // CombinationRow filtruje te które już są w bieżącej kombinacji.
  allVariantImages: string[];
  onStockChange: (stock: number) => void;
  onPriceModifierChange: (mod: number) => void;
  onSalePriceChange: (v: number | null) => void;
  onUpload: (file: File) => void;
  onAddExisting: (url: string) => void;
  onMoveImage: (imgIdx: number, dir: -1 | 1) => void;
  onRemoveImage: (imgIdx: number) => void;
}) {
  const label = formatVariantLabel(combo.values);
  const images = combo.images ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);

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
        <Field label="Modyfikator ceny (zł)" hint="+/- różnica vs cena bazowa produktu.">
          <input
            type="number"
            step="0.01"
            value={combo.price_modifier ?? 0}
            onChange={(e) => onPriceModifierChange(Number(e.target.value) || 0)}
            className={inputClass}
          />
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

      <div className="flex flex-col gap-2">
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
            <label className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer disabled:opacity-50">
              {uploading ? "Wgrywam..." : "+ Dodaj zdjęcie"}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onUpload(f);
                }}
                className="hidden"
              />
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
      </div>
    </li>
  );
}
