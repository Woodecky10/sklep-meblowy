"use client";

import { useMemo, useState, useTransition } from "react";
import { updateProductVariants, upsertVariantInfo } from "../actions";
import { variantInfoKey, type VariantInfoEntry } from "@/app/_lib/variant-info";
import type {
  ProductOption,
  ProductVariants,
  Fabric,
  FabricPriceGroup,
} from "@/app/_lib/types";
import { CollapsibleSection, Field, inputClass, type Toast } from "./_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  applyFabricSelection,
  buildGroupSurchargeMap,
  expandFabrics,
  fabricValueBelongsTo,
  FABRIC_OPTION_NAME,
} from "@/app/_lib/variants";
import { groupFabricsByCategory, groupSelectionState } from "@/app/_lib/fabric-groups";
import { commonPrice, groupValuesByFabric, setPriceForValues } from "@/app/_lib/fabric-value-groups";
import { pluralPl } from "@/app/_lib/fabric-labels";
import { filterBySearch } from "@/app/_lib/search-normalize";
import {
  applyCornerSideSelection,
  hasCornerSideOption,
  isCornerCategorySlug,
} from "@/app/_lib/corner-side";
import ValueImagesPanel from "./ValueImagesPanel";
import type { VariantImageGroup } from "@/app/_lib/variant-image-suggestions";

// ============================================================
// Komponent
// ============================================================

export default function VariantsEditor({
  productId,
  initial,
  categorySlug,
  fabrics,
  fabricGroups,
  initialVariantInfo,
  variantImageGroups,
  onToast,
}: {
  productId: string;
  initial: ProductVariants | null;
  categorySlug: string;
  fabrics: Fabric[];
  fabricGroups: FabricPriceGroup[];
  initialVariantInfo: Record<string, VariantInfoEntry>;
  // Zdjęcia wartości opcji z innych produktów — do wybieraka w panelu 📷.
  variantImageGroups: VariantImageGroup[];
  onToast: (t: Toast) => void;
}) {
  const [variants, setVariants] = useState<ProductVariants | null>(initial);
  const [saving, startSaveTransition] = useTransition();
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);
  const confirm = useConfirm();

  // Info o wariancie jest GLOBALNE (slownik po parze opcja+wartosc), wiec trzymane
  // osobno od products.variants. Edytujemy kopie; zapis przez upsertVariantInfo.
  const [variantInfo, setVariantInfo] = useState<Record<string, VariantInfoEntry>>(initialVariantInfo);
  const [savedVariantInfo, setSavedVariantInfo] = useState<Record<string, VariantInfoEntry>>(initialVariantInfo);
  const infoDirty = useMemo(
    () => JSON.stringify(variantInfo) !== JSON.stringify(savedVariantInfo),
    [variantInfo, savedVariantInfo]
  );

  // Wybór strony narożnika: stan = obecność opcji side-like (także ręcznej
  // "STRONA"/"STRONA MEBLA"). Toggle widoczny dla kategorii narożników albo
  // gdy produkt już ma opcję strony (żeby dało się ją wyłączyć po zmianie kategorii).
  const sideEnabled = hasCornerSideOption(variants);
  const showCornerToggle = isCornerCategorySlug(categorySlug) || sideEnabled;

  function toggleCornerSide(enabled: boolean) {
    setVariants(applyCornerSideSelection(variants, enabled));
  }

  const dirty = useMemo(
    () => JSON.stringify(variants) !== JSON.stringify(initial),
    [variants, initial]
  );

  // Nazwa grupy cenowej (Standard/Premium/…) do plakietki przy tkaninie.
  const groupNameById = useMemo(
    () => Object.fromEntries(fabricGroups.map((g) => [g.id, g.name])),
    [fabricGroups]
  );

  // ============================================================
  // Mutacje stanu — opcje
  // ============================================================

  function enableVariants() {
    setVariants({ options: [] });
  }

  async function disableVariants() {
    if (!(await confirm({ message: "Usunąć wszystkie warianty produktu? Zdjęcia per wariant zostaną wyczyszczone.", danger: true }))) return;
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
    setVariants({ ...variants, options: nextOptions });
  }

  function setOptionName(idx: number, name: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => (i === idx ? { ...o, name } : o));
    setVariants({ ...variants, options: nextOptions });
  }

  // Flaga „Filtr w sklepie": true → klucz w JSON, false → klucz znika
  // (undefined wypada przy JSON.stringify — czysty JSONB bez filterable:false).
  function setOptionFilterable(idx: number, filterable: boolean) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) =>
      i === idx ? { ...o, filterable: filterable || undefined } : o
    );
    setVariants({ ...variants, options: nextOptions });
  }

  function addValue(optIdx: number, value: string) {
    if (!variants) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (variants.options[optIdx].values.includes(trimmed)) return;
    const nextOptions = variants.options.map((o, i) =>
      i === optIdx ? { ...o, values: [...o.values, trimmed] } : o
    );
    setVariants({ ...variants, options: nextOptions });
  }

  // Usuwa wartości (jedną albo całą tkaninę naraz) razem z ich dopłatami i zdjęciami.
  function removeValues(optIdx: number, values: string[]) {
    if (!variants) return;
    const gone = new Set(values);
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const nextPrices = { ...(o.value_prices ?? {}) };
      const nextImages = { ...(o.value_images ?? {}) };
      for (const v of values) {
        delete nextPrices[v];
        delete nextImages[v];
      }
      return {
        ...o,
        values: o.values.filter((v) => !gone.has(v)),
        value_prices: Object.keys(nextPrices).length > 0 ? nextPrices : undefined,
        value_images: Object.keys(nextImages).length > 0 ? nextImages : undefined,
      };
    });
    setVariants({ ...variants, options: nextOptions });
  }

  // Ustaw dopłatę wartościom opcji — jednej albo wszystkim kolorom tkaniny
  // (puste/0 usuwa wpis).
  function setValuesPrice(optIdx: number, values: string[], price: number | null) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) =>
      i === optIdx ? { ...o, value_prices: setPriceForValues(o.value_prices, values, price) } : o
    );
    setVariants({ ...variants, options: nextOptions });
  }

  // Ustaw info dla pary (nazwa opcji, wartosc). Puste PL → usun wpis z mapy.
  function setValueInfo(optionName: string, value: string, info: string, infoDe: string) {
    const key = variantInfoKey(optionName, value);
    setVariantInfo((prev) => {
      const next = { ...prev };
      if (info.trim()) next[key] = { info, info_de: infoDe.trim() ? infoDe : null };
      else delete next[key];
      return next;
    });
  }

  // Dodaj wgrane zdjęcia do wartości opcji (dopisywane na koniec, bez duplikatów).
  function addValueImages(optIdx: number, value: string, urls: string[]) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const current = o.value_images?.[value] ?? [];
      const merged = [...current, ...urls.filter((u) => !current.includes(u))];
      return { ...o, value_images: { ...(o.value_images ?? {}), [value]: merged } };
    });
    setVariants({ ...variants, options: nextOptions });
  }

  // Usuń zdjęcie wartości (pusta lista → wpis znika; pusta mapa → klucz znika).
  function removeValueImage(optIdx: number, value: string, url: string) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) => {
      if (i !== optIdx) return o;
      const nextImages = { ...(o.value_images ?? {}) };
      const kept = (nextImages[value] ?? []).filter((u) => u !== url);
      if (kept.length > 0) nextImages[value] = kept;
      else delete nextImages[value];
      return {
        ...o,
        value_images: Object.keys(nextImages).length > 0 ? nextImages : undefined,
      };
    });
    setVariants({ ...variants, options: nextOptions });
  }

  // Zastosuj wybor z katalogu → rozwin kolekcje na wartosci „Nazwa Numer" (+doplaty),
  // dolacz zachowane wartosci spoza katalogu, ustaw opcje „Tkanina".
  function applyFabrics(selectedFabrics: Fabric[], keptOrphanValues: string[]) {
    const base = variants ?? { options: [] };
    const { values, valuePrices } = expandFabrics(
      selectedFabrics.map((f) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0, group_id: f.group_id })),
      buildGroupSurchargeMap(fabricGroups)
    );
    // Zachowaj doplaty istniejacych wartosci-sierot (spoza katalogu).
    const currentVP =
      base.options.find((o) => o.name === FABRIC_OPTION_NAME)?.value_prices ?? {};
    const finalValues = [...values, ...keptOrphanValues.filter((v) => !values.includes(v))];
    const finalVP: Record<string, number> = { ...valuePrices };
    for (const ov of keptOrphanValues) {
      if (finalVP[ov] == null && currentVP[ov] != null) finalVP[ov] = currentVP[ov];
    }
    const next = applyFabricSelection(base.options, finalValues, finalVP);
    setVariants(next.options.length === 0 ? null : { ...base, options: next.options });
    setFabricPickerOpen(false);
  }

  // ============================================================
  // Zapis
  // ============================================================

  function save() {
    startSaveTransition(async () => {
      // Sprzatanie: filtruj puste opcje/wartosci, zachowaj doplaty istniejacych wartosci.
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
            let value_images: Record<string, string[]> | undefined;
            if (o.value_images) {
              const keptImages: Record<string, string[]> = {};
              for (const v of values) {
                const imgs = o.value_images[v];
                if (Array.isArray(imgs) && imgs.length > 0) keptImages[v] = imgs;
              }
              if (Object.keys(keptImages).length > 0) value_images = keptImages;
            }
            return {
              name: o.name.trim(),
              values,
              ...(value_prices ? { value_prices } : {}),
              ...(value_images ? { value_images } : {}),
              ...(o.filterable ? { filterable: true } : {}),
            };
          })
          .filter((o) => o.name && o.values.length > 0);
        if (cleanOptions.length === 0) {
          toSave = null;
        } else {
          toSave = { options: cleanOptions, overrides: variants.overrides };
        }
      }
      const res = await updateProductVariants(productId, toSave);
      if (res.ok) {
        if (!infoDirty) {
          // Nic w info nie zmieniono (np. zapis samej ceny) — nie wywoluj
          // upsertVariantInfo wcale, zeby nie kasowac par, ktorych admin
          // nigdy nie dotknal w tej sesji (variantInfo jest zasiane z
          // 300s-cache'owanej globalnej mapy, wiec moze byc nieaktualne).
          onToast({ type: "success", message: res.message ?? "Zapisano warianty" });
          setVariants(toSave);
          return;
        }
        // Rekoncyliacja TYLKO par faktycznie dotknietych w tej sesji: diff
        // variantInfo vs savedVariantInfo. Zmienione/dodane pary → upsert,
        // pary usuniete z variantInfo wzgledem baseline → DELETE (info: "").
        // Klucze sa unikalne (Map/object), wiec bez dodatkowego dedupe.
        const entries: { option_name: string; value: string; info: string; info_de: string }[] = [];
        for (const [key, entry] of Object.entries(variantInfo)) {
          if (JSON.stringify(entry) !== JSON.stringify(savedVariantInfo[key])) {
            const [option_name, value] = key.split("\u0000");
            entries.push({ option_name, value, info: entry.info, info_de: entry.info_de ?? "" });
          }
        }
        for (const key of Object.keys(savedVariantInfo)) {
          if (!(key in variantInfo)) {
            const [option_name, value] = key.split("\u0000");
            entries.push({ option_name, value, info: "", info_de: "" });
          }
        }
        const infoRes = await upsertVariantInfo(productId, entries);
        onToast({
          type: infoRes.ok ? "success" : "error",
          message: infoRes.ok ? (res.message ?? "Zapisano warianty") : infoRes.error,
        });
        if (infoRes.ok) setSavedVariantInfo(variantInfo);
        setVariants(toSave);
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  // ============================================================
  // Render
  // ============================================================

  if (!variants) {
    return (
      <CollapsibleSection title="Warianty produktu" storageKey="warianty" bodyClassName="flex flex-col gap-4">
        <p className="text-sm text-[var(--muted)]">
          Produkt nie ma wariantów. Stock jest zarządzany w polu &bdquo;Stan magazynowy&rdquo; wyżej.
        </p>
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
              setVariants({ options: [] });
              setFabricPickerOpen(true);
            }}
            className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj tkaniny z katalogu
          </button>
          {isCornerCategorySlug(categorySlug) && (
            <button
              type="button"
              onClick={() => setVariants(applyCornerSideSelection(null, true))}
              className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
            >
              + Dodaj wybór strony (Lewostronny/Prawostronny)
            </button>
          )}
        </div>
        {/* Usunięcie/wyzerowanie wariantów („Usuń warianty", „Zastosuj (0)" w
            pickerze) ląduje w tej gałęzi jako stan w pamięci — bez tego paska
            NIE dało się go utrwalić (brak przycisku zapisu = zmiana ginęła po
            wyjściu, a w bazie zostawały stare warianty). */}
        {dirty && (
          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-[var(--border)]">
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Masz niezapisane usunięcie wariantów.
            </p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              aria-busy={saving}
              className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              {saving ? "Zapisuję..." : "Zapisz warianty"}
            </button>
            <button
              type="button"
              onClick={() => setVariants(initial)}
              disabled={saving}
              className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-xs uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Cofnij
            </button>
          </div>
        )}
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
      title="Warianty produktu"
      storageKey="warianty"
      bodyClassName="flex flex-col gap-6"
      headerAside={
        <button
          type="button"
          onClick={disableVariants}
          className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Usuń warianty
        </button>
      }
    >
      {/* CollapsibleSection nie przekazuje dowolnych atrybutów do swojego
          <section>, więc jednostka guarda (data-guard-section) opakowuje
          bezpośrednio całą zawartość zwracaną tutaj — jedyny realny wspólny
          kontener DOM, do którego mamy dostęp. */}
      <div data-guard-section className="flex flex-col gap-6">
      <p className="text-sm text-[var(--muted)] max-w-2xl">
        Dodaj opcje (np. „Kolor”, „Tkanina”, „Strona”) i ich wartości — klient wybiera po jednej wartości z każdej opcji. Przy wartości możesz ustawić dopłatę „+zł” (np. droższa tkanina) oraz zdjęcia (📷) — pokażą się na początku galerii, gdy klient wybierze tę wartość. Stan magazynowy i cena promocyjna są wspólne dla całego produktu — ustawiasz je w „Podstawowych danych”; globalna galeria w „Zdjęciach produktu” wyżej.
      </p>

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
            onRemoveValues={(vs) => removeValues(i, vs)}
            onSetValuesPrice={(vs, p) => setValuesPrice(i, vs, p)}
            fabricCatalog={
              opt.name === FABRIC_OPTION_NAME ? { fabrics, groupNameById } : undefined
            }
            onOpenFabricPicker={() => setFabricPickerOpen(true)}
            onRemoveOption={() => removeOption(i)}
            onToggleFilterable={(v) => setOptionFilterable(i, v)}
            onAddValueImages={(v, urls) => addValueImages(i, v, urls)}
            onRemoveValueImage={(v, url) => removeValueImage(i, v, url)}
            onSetValueInfo={(v, info, infoDe) => setValueInfo(opt.name, v, info, infoDe)}
            infoFor={(v) => variantInfo[variantInfoKey(opt.name, v)]}
            imageGroups={variantImageGroups}
            onToast={onToast}
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
        {showCornerToggle && (
          <label className="self-start flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
            <input
              type="checkbox"
              checked={sideEnabled}
              onChange={(e) => toggleCornerSide(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            Wybór strony narożnika (Lewostronny/Prawostronny)
          </label>
        )}
      </div>

      {/* ============================================================
          Zapis
          ============================================================ */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          {dirty || infoDirty ? "Masz niezapisane zmiany w wariantach." : "Warianty zapisane."}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || (!dirty && !infoDirty)}
          aria-busy={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz warianty"}
        </button>
      </div>

      {fabricPickerOpen && (
        <FabricPicker
          fabrics={fabrics}
          priceGroups={fabricGroups}
          initiallySelectedValues={
            variants?.options.find((o) => o.name === FABRIC_OPTION_NAME)?.values ?? []
          }
          onCancel={() => setFabricPickerOpen(false)}
          onApply={applyFabrics}
        />
      )}
      </div>
    </CollapsibleSection>
  );
}

// ============================================================
// Sub-komponenty
// ============================================================

// Katalog tkanin dla opcji „Tkanina" — gdy podany, wartości są grupowane per
// tkanina (jedna zwinięta linia, kolory po rozwinięciu), a pole wpisywania
// dowolnego tekstu zastępuje przycisk katalogu (decyzja właściciela 2026-11-04:
// tkaniny tylko z katalogu — wpisywanie ręczne tworzyło sieroty typu
// „Velvet Velvet 17"). Dane w bazie bez zmian: wartości dalej „Nazwa Kolor".
type FabricCatalog = { fabrics: Fabric[]; groupNameById: Record<string, string> };

function OptionRow({
  option,
  onNameChange,
  onAddValue,
  onRemoveValues,
  onSetValuesPrice,
  onRemoveOption,
  onToggleFilterable,
  onAddValueImages,
  onRemoveValueImage,
  onSetValueInfo,
  infoFor,
  imageGroups,
  fabricCatalog,
  onOpenFabricPicker,
  onToast,
}: {
  option: ProductOption;
  onNameChange: (name: string) => void;
  onAddValue: (v: string) => void;
  onRemoveValues: (values: string[]) => void;
  onSetValuesPrice: (values: string[], price: number | null) => void;
  onRemoveOption: () => void;
  onToggleFilterable: (v: boolean) => void;
  onAddValueImages: (value: string, urls: string[]) => void;
  onRemoveValueImage: (value: string, url: string) => void;
  onSetValueInfo: (value: string, info: string, infoDe: string) => void;
  infoFor: (value: string) => VariantInfoEntry | undefined;
  imageGroups: VariantImageGroup[];
  fabricCatalog?: FabricCatalog;
  onOpenFabricPicker: () => void;
  onToast: (t: Toast) => void;
}) {
  const [newValue, setNewValue] = useState("");
  const [imagesFor, setImagesFor] = useState<string | null>(null);
  const [infoForVal, setInfoForVal] = useState<string | null>(null);
  // Rozwinięte tkaniny (po nazwie z katalogu) — domyślnie wszystkie zwinięte.
  const [openFabrics, setOpenFabrics] = useState<Set<string>>(() => new Set());
  const confirm = useConfirm();

  const fabricView = fabricCatalog
    ? groupValuesByFabric(option.values, fabricCatalog.fabrics)
    : null;

  function toggleFabric(name: string) {
    setOpenFabrics((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function removeFabric(name: string, values: string[]) {
    const label = `${values.length} ${pluralPl(values.length, "kolor", "kolory", "kolorów")}`;
    if (!(await confirm({ message: `Usunąć tkaninę ${name} (${label}) z tego produktu?`, danger: true }))) return;
    if (imagesFor && values.includes(imagesFor)) setImagesFor(null);
    if (infoForVal && values.includes(infoForVal)) setInfoForVal(null);
    onRemoveValues(values);
  }

  // Jeden wiersz wartości: 📷, ℹ, dopłata, usuń + panele pod spodem. `label` to
  // tekst w wierszu — w tkaninie sam kolor („2071"), poza nią pełna wartość.
  function renderValue(v: string, label: string) {
    const imgCount = option.value_images?.[v]?.length ?? 0;
    return (
      <div key={v} className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg px-2 sm:px-3 py-1.5">
          <span className="flex-1 min-w-[2.5rem] text-sm truncate">{label}</span>
          {/* Przyciski jako jedna grupa — na wąskim ekranie przechodzą razem pod etykietę. */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setImagesFor(imagesFor === v ? null : v)}
              aria-expanded={imagesFor === v}
              aria-label={`Zdjęcia wartości ${v} (${imgCount})`}
              title="Zdjęcia tej wartości"
              className={`shrink-0 px-2 py-1 text-[11px] font-sans rounded-full border transition-colors ${
                imagesFor === v || imgCount > 0
                  ? "border-[var(--color-gold)] text-[var(--color-gold-text)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold-text)]"
              }`}
            >
              📷{imgCount > 0 ? ` ${imgCount}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setInfoForVal(infoForVal === v ? null : v)}
              aria-expanded={infoForVal === v}
              aria-label={`Informacja o wariancie ${v}`}
              title="Krótka informacja (tooltip u klienta)"
              className={`shrink-0 px-2 py-1 text-[11px] font-sans rounded-full border transition-colors ${
                infoForVal === v || infoFor(v)
                  ? "border-[var(--color-gold)] text-[var(--color-gold-text)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold-text)]"
              }`}
            >
              ℹ{infoFor(v) ? " •" : ""}
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-[var(--muted)]">+</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={option.value_prices?.[v] ?? ""}
                onChange={(e) =>
                  onSetValuesPrice([v], e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder="0"
                aria-label={`Dopłata za ${v} (zł)`}
                className="w-16 sm:w-20 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-right focus:border-[var(--color-gold)] focus:outline-none"
              />
              <span className="text-xs text-[var(--muted)]">zł</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (imagesFor === v) setImagesFor(null);
                onRemoveValues([v]);
              }}
              aria-label={`Usuń ${v}`}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {imagesFor === v && (
          <ValueImagesPanel
            value={v}
            urls={option.value_images?.[v] ?? []}
            groups={imageGroups}
            optionName={option.name}
            onAdd={(urls) => onAddValueImages(v, urls)}
            onRemove={(url) => onRemoveValueImage(v, url)}
            onToast={onToast}
          />
        )}
        {infoForVal === v && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-3">
            <label className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
              Info PL (tooltip, maks. 200 zn.) — zapis globalny dla „{option.name}: {v}&rdquo;
            </label>
            <textarea
              maxLength={200}
              value={infoFor(v)?.info ?? ""}
              onChange={(e) => onSetValueInfo(v, e.target.value, infoFor(v)?.info_de ?? "")}
              placeholder="np. Miękki welur, łatwy w czyszczeniu"
              className={`${inputClass} min-h-[3rem]`}
            />
            <label className="text-[11px] uppercase tracking-widest text-[var(--muted)]">
              Info DE (opcjonalnie)
            </label>
            <textarea
              maxLength={200}
              value={infoFor(v)?.info_de ?? ""}
              onChange={(e) => onSetValueInfo(v, infoFor(v)?.info ?? "", e.target.value)}
              placeholder="z. B. Weicher Cord, pflegeleicht"
              className={`${inputClass} min-h-[3rem]`}
            />
            <p className="text-[11px] text-[var(--muted)]">
              Uwaga: edycja zmienia info wszędzie, gdzie występuje ta para (opcja + wartość).
            </p>
          </div>
        )}
      </div>
    );
  }

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

      <label className="self-start flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
        <input
          type="checkbox"
          checked={option.filterable === true}
          onChange={(e) => onToggleFilterable(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-gold)]"
        />
        Filtr w sklepie
        <span className="text-xs text-[var(--muted)]">
          — klient może filtrować listę produktów po tej opcji
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Wartości
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          {fabricView
            ? "Dopłatę ustawiasz przy całej tkaninie (zmienia wszystkie jej kolory). Rozwiń tkaninę, żeby zmienić pojedynczy kolor, dodać zdjęcia (📷) albo informację (ℹ)."
            : "Pole „+zł” to dopłata do ceny bazowej za wybór tej wartości (np. Premium +200). Dopłaty wybranych wartości sumują się. Puste = bez dopłaty."}
        </p>
        <div className="flex flex-col gap-1.5">
          {option.values.length === 0 && (
            <span className="text-xs text-[var(--muted)] italic">
              {fabricView ? "Brak tkanin — dodaj z katalogu poniżej." : "Brak wartości — dodaj poniżej."}
            </span>
          )}
          {fabricView ? (
            <>
              {fabricView.groups.length > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                  <span>
                    <b className="text-[var(--fg)]">
                      {fabricView.groups.length}{" "}
                      {pluralPl(fabricView.groups.length, "tkanina", "tkaniny", "tkanin")} z katalogu
                    </b>
                    {" · "}
                    {option.values.length - fabricView.orphans.length}{" "}
                    {pluralPl(option.values.length - fabricView.orphans.length, "kolor", "kolory", "kolorów")}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFabrics(
                        openFabrics.size === fabricView.groups.length
                          ? new Set()
                          : new Set(fabricView.groups.map((g) => g.fabric.name))
                      )
                    }
                    className="underline text-[var(--color-gold-text)] hover:text-[var(--fg)]"
                  >
                    {openFabrics.size === fabricView.groups.length ? "Zwiń wszystkie" : "Rozwiń wszystkie"}
                  </button>
                </div>
              )}
              {fabricView.groups.map(({ fabric, items }) => {
                const name = fabric.name;
                const values = items.map((it) => it.value);
                const open = openFabrics.has(name);
                const price = commonPrice(values, option.value_prices);
                const withImages = values.filter((v) => (option.value_images?.[v]?.length ?? 0) > 0).length;
                const groupName = fabricCatalog?.groupNameById[fabric.group_id];
                return (
                  <div key={name} className="flex flex-col" data-testid="fabric-value-group">
                    <div
                      className={`flex items-center gap-2 bg-[var(--card-bg)] border px-3 py-1.5 ${
                        open ? "border-[var(--color-gold)] rounded-t-lg" : "border-[var(--border)] rounded-lg"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFabric(name)}
                        aria-expanded={open}
                        className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-left"
                      >
                        {/* Strzałka + nazwa razem, plakietka i licznik bez łamania —
                            na wąskim ekranie zawijają się całe do kolejnej linii. */}
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden
                            className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-90" : ""}`}
                          >
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                          <span className="text-sm font-semibold text-[var(--fg)]">{name}</span>
                        </span>
                        {groupName && (
                          <span className="whitespace-nowrap px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider rounded-full border border-[var(--color-gold)] text-[var(--color-gold-text)]">
                            {groupName}
                          </span>
                        )}
                        <span className="whitespace-nowrap text-xs text-[var(--muted)]">
                          {items.length} {pluralPl(items.length, "kolor", "kolory", "kolorów")}
                        </span>
                      </button>
                      {withImages > 0 && (
                        <span
                          title="Kolory z własnymi zdjęciami"
                          className="shrink-0 px-2 py-1 text-[11px] font-sans rounded-full border border-[var(--color-gold)] text-[var(--color-gold-text)]"
                        >
                          📷 {withImages}
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-[var(--muted)]">+</span>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          value={price ? price : ""}
                          onChange={(e) =>
                            onSetValuesPrice(values, e.target.value === "" ? null : Number(e.target.value))
                          }
                          placeholder={price === null ? "różne" : "0"}
                          aria-label={`Dopłata za tkaninę ${name} (zł)`}
                          className="w-20 px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-sm text-right focus:border-[var(--color-gold)] focus:outline-none"
                        />
                        <span className="text-xs text-[var(--muted)]">zł</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFabric(name, values)}
                        aria-label={`Usuń tkaninę ${name}`}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {open && (
                      <div className="flex flex-col gap-1.5 border border-t-0 border-[var(--color-gold)] rounded-b-lg p-2 sm:pl-6">
                        {items.map((it) => renderValue(it.value, it.color || it.value))}
                      </div>
                    )}
                  </div>
                );
              })}
              {fabricView.orphans.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Spoza katalogu ({fabricView.orphans.length}) — tych wartości nie ma w zakładce
                    „Tkaniny” (literówka albo usunięty kolor). Usuń je albo dodaj tkaninę do katalogu.
                  </p>
                  {fabricView.orphans.map((v) => renderValue(v, v))}
                </div>
              )}
            </>
          ) : (
            option.values.map((v) => renderValue(v, v))
          )}
        </div>
        {fabricView ? (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onOpenFabricPicker}
              className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
            >
              + Dodaj tkaninę z katalogu
            </button>
            <span className="text-[11px] text-[var(--muted)]">
              Tkaniny tylko z katalogu — nazwa i kolory zawsze zgodne z zakładką „Tkaniny”.
            </span>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

function FabricPicker({
  fabrics,
  priceGroups,
  initiallySelectedValues,
  onApply,
  onCancel,
}: {
  fabrics: Fabric[];
  // Grupy cenowe (Standard/Premium/…) — INNY byt niż lokalne `groups` (grupowanie
  // po kategorii do sekcji pickera, z groupFabricsByCategory poniżej).
  priceGroups: FabricPriceGroup[];
  initiallySelectedValues: string[];
  onApply: (selectedFabrics: Fabric[], keptOrphanValues: string[]) => void;
  onCancel: () => void;
}) {
  const toLite = (f: Fabric) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0, group_id: f.group_id });
  const surchargeById = buildGroupSurchargeMap(priceGroups);

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
  const filtered = q ? filterBySearch(base, search, (f) => [f.name]) : base;
  const groups = groupFabricsByCategory(filtered);
  const selectedSet = new Set(selectedNames);
  const searching = q.length > 0;
  // Przy szukaniu / gdy jest tylko jedna grupa — rozwijamy automatycznie.
  const autoExpandAll = searching || onlySelected || groups.length === 1;

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
  const { values: previewValues } = expandFabrics(selectedFabrics.map(toLite), surchargeById);
  const totalValues =
    previewValues.length + keptOrphans.filter((v) => !previewValues.includes(v)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col p-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz tkaniny (wybrano: {selectedNames.length} → {totalValues} wart.)
          </h3>
          {/* data-guard-ignore — jak w ImagePickerModal: filtrowanie listy to nie
              edycja danych, a modal siedzi w [data-guard-section]. */}
          <input
            type="text"
            autoFocus
            data-guard-ignore
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
                                {(() => {
                                  const eff = (surchargeById[f.group_id] ?? 0) + (f.price ?? 0);
                                  return eff > 0 ? ` · +${eff.toFixed(2)} zł` : "";
                                })()}
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
