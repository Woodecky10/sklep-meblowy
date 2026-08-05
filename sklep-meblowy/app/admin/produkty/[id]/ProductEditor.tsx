"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { updateProductBasics, updateProductImages, duplicateProduct } from "../actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { Product, ActionResult, Fabric, FabricPriceGroup } from "@/app/_lib/types";
import type { VariantInfoEntry } from "@/app/_lib/variant-info";
import type { SelectGroup } from "@/app/_lib/category-tree";
import { Field, IconBtn, inputClass, CollapsibleSection, type Toast } from "./_shared";
import { useImageUpload } from "./useImageUpload";
import VariantsEditor from "./VariantsEditor";
import DescriptionSectionsEditor from "./DescriptionSectionsEditor";
import DescriptionFieldEditor from "./DescriptionFieldEditor";
import TranslationEditor, { type ProductDeFields } from "./TranslationEditor";
import SizeGroupEditor from "./SizeGroupEditor";
import ImagePickerModal from "./ImagePickerModal";
import type { SizeGroupMember } from "@/app/_lib/products";
import { MAX_FEATURES } from "@/app/_lib/product-features";
import type { VariantImageGroup } from "@/app/_lib/variant-image-suggestions";
import { saleStatus, type SaleStatus } from "@/app/_lib/sale-schedule";
import { looksLikeDiscountClaim } from "@/app/_lib/pricing";

export default function ProductEditor({
  product,
  categoryGroups,
  de,
  sizeGroupMembers,
  fabrics,
  fabricGroups,
  variantInfo,
  featureKeySuggestions,
  featureValueSuggestions,
  variantImageGroups,
  today,
}: {
  product: Product;
  categoryGroups: SelectGroup[];
  de: ProductDeFields;
  sizeGroupMembers: SizeGroupMember[];
  fabrics: Fabric[];
  fabricGroups: FabricPriceGroup[];
  variantInfo: Record<string, VariantInfoEntry>;
  // Podpowiedzi nazw parametrów — dropdown „+ Wybierz z listy".
  featureKeySuggestions: string[];
  // Podpowiedzi wartości parametrów — mapa nazwa (trim+lowercase) → wartości
  // już użyte w produktach; zasila strzałkę ▾ przy polu wartości.
  featureValueSuggestions: Record<string, string[]>;
  // Zdjęcia wartości opcji z innych produktów — zasilają wybierak
  // „+ Wybierz z wgranych" (bez opcji „Tkanina", bez galerii).
  variantImageGroups: VariantImageGroup[];
  // Dzień w strefie sklepu, policzony na serwerze (patrz page.tsx) — nie liczymy
  // go tutaj, bo render kliencki i prerender serwerowy mogłyby trafić w różne dni.
  today: string;
}) {
  const [images, setImages] = useState<string[]>(product.images ?? []);
  // Baseline ostatnio zapisanej galerii — resetowany na zapisany payload po
  // sukcesie. Bez tego imagesDirty liczone względem propa product.images
  // (niezmiennego bez reloadu) wisiało jako true po zapisie (audyt LOW).
  const [savedImages, setSavedImages] = useState<string[]>(product.images ?? []);
  // Wybierak „+ Wybierz z wgranych" dla globalnej galerii. Źródło to zdjęcia
  // wartości opcji wariantów (bez „Tkaniny") — patrz spec: galerie innych
  // produktów świadomie nie zasilają listy.
  const [galleryPickerOpen, setGalleryPickerOpen] = useState(false);
  // Napis wstążki na żywo — ostrzeżenie o Omnibusie ma się pokazać przed
  // zapisem, nie po. Seed z zapisanej wartości.
  const [badgeDraft, setBadgeDraft] = useState(product.promo_badge ?? "");
  const promoStatus = saleStatus(
    {
      id: product.id,
      price: Number(product.price),
      sale_price: product.sale_price,
      sale_price_planned: product.sale_price_planned,
      sale_from: product.sale_from,
      sale_to: product.sale_to,
      promo_badge: product.promo_badge,
    },
    today
  );
  const promoStatusLabel = describeSaleStatus(promoStatus);
  // Ostrzegamy tylko przy braku AKTYWNEJ ceny promocyjnej — zaplanowana na
  // przyszłość też jest brakiem, bo wstążka pokaże się od razu.
  const badgeWarning =
    badgeDraft.trim() !== "" &&
    looksLikeDiscountClaim(badgeDraft) &&
    promoStatus.kind !== "active";
  // Parametry produktu (specyfikacja) — wiersze klucz→wartość, seed z
  // product.features (importowane nie giną); serializacja do hidden
  // features_json w formularzu „Podstawowe dane" (wspólny przycisk zapisu).
  type FeatureRow = { key: string; value: string };
  const [featureRows, setFeatureRows] = useState<FeatureRow[]>(() =>
    (product.features ?? []).map((f) => ({ key: f.key, value: f.value }))
  );
  // Dropdown wartości parametru: indeks wiersza z otwartą listą (najwyżej
  // jeden naraz; otwarcie zamyka picker nazw i odwrotnie). Strzałka ▾ tylko
  // gdy nazwa wiersza ma zapisane wartości (lookup trim + lowercase). Każda
  // edycja nazwy/wierszy zamyka listę (indeksy się przesuwają, strzałka może
  // zniknąć).
  const [valuePickerIdx, setValuePickerIdx] = useState<number | null>(null);
  const valuePickerRef = useRef<HTMLDivElement | null>(null);
  const valueSuggestionsFor = (key: string) =>
    featureValueSuggestions[key.trim().toLowerCase()] ?? [];
  function addFeatureRow() {
    setPickerOpen(false);
    setValuePickerIdx(null);
    setFeatureRows((r) => [...r, { key: "", value: "" }]);
  }
  function removeFeatureRow(i: number) {
    setValuePickerIdx(null);
    setFeatureRows((r) => r.filter((_, idx) => idx !== i));
  }
  function setFeatureKey(i: number, key: string) {
    setValuePickerIdx(null);
    setFeatureRows((r) => r.map((row, idx) => (idx === i ? { ...row, key } : row)));
  }
  function setFeatureValue(i: number, value: string) {
    setFeatureRows((r) => r.map((row, idx) => (idx === i ? { ...row, value } : row)));
  }
  // Dropdown „+ Wybierz z listy": nazwy z featureKeySuggestions minus już
  // obecne w wierszach (trim + case-insensitive). Wybór dodaje wiersz z nazwą
  // i fokusuje pole wartości (pendingFocusIdx odczytywany w ref callbacku).
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIdx = useRef<number | null>(null);
  const usedFeatureKeys = new Set(
    featureRows.map((r) => r.key.trim().toLowerCase())
  );
  const availableSuggestions = featureKeySuggestions.filter(
    (k) => !usedFeatureKeys.has(k.toLowerCase())
  );
  function addFeatureRowFromList(key: string) {
    if (featureRows.length >= MAX_FEATURES) return;
    pendingFocusIdx.current = featureRows.length;
    setFeatureRows((r) => [...r, { key, value: "" }]);
    setValuePickerIdx(null);
    setPickerOpen(false);
  }
  useEffect(() => {
    if (!pickerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [pickerOpen]);
  // Zamykanie dropdownu wartości: Esc / klik poza wierszem z otwartą listą.
  useEffect(() => {
    if (valuePickerIdx === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setValuePickerIdx(null);
    }
    function onMouseDown(e: MouseEvent) {
      if (valuePickerRef.current && !valuePickerRef.current.contains(e.target as Node)) {
        setValuePickerIdx(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [valuePickerIdx]);
  const [toast, setToast] = useState<Toast>(null);
  const [savingBasics, startBasicsTransition] = useTransition();
  const [savingImages, startImagesTransition] = useTransition();
  const [duplicating, startDuplicateTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  // Duplikuj ofertę: potwierdzenie → utworzenie ukrytej kopii w grupie
  // rozmiarów oryginału → przejście do edytora kopii. Kopia zawiera ostatnio
  // ZAPISANY stan produktu (niezapisane zmiany w tym formularzu nie wchodzą).
  async function handleDuplicate() {
    const ok = await confirm({
      message:
        "Utworzyć kopię tej oferty? Powstanie jako ukryty szkic w tej samej grupie rozmiarów — zmienisz w niej rozmiar i włączysz ją.",
      confirmLabel: "Duplikuj",
    });
    if (!ok) return;
    startDuplicateTransition(async () => {
      const res = await duplicateProduct(product.id);
      if (res.ok) {
        showToast({ type: "success", message: "Utworzono kopię — przechodzę do edytora" });
        router.push(`/admin/produkty/${res.productId}`);
      } else {
        showToast({ type: "error", message: res.error });
      }
    });
  }

  function handleResult(res: ActionResult) {
    if (res.ok) showToast({ type: "success", message: res.message ?? "Zapisano" });
    else showToast({ type: "error", message: res.error });
  }

  // ============================================================
  // Zdjęcia globalne — upload (multi + drag&drop), sortowanie, usuwanie
  // ============================================================

  const upload = useImageUpload({
    onUploaded: (urls) => setImages((prev) => [...prev, ...urls]),
    onToast: showToast,
    successHint: 'Kliknij „Zapisz zdjęcia” żeby utrwalić.',
  });

  function moveImage(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    setImages((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function saveImages() {
    startImagesTransition(async () => {
      const res = await updateProductImages(product.id, images);
      // Reset baseline na zapisany payload → imagesDirty wraca do false.
      if (res.ok) setSavedImages(images);
      handleResult(res);
    });
  }

  const imagesDirty =
    images.length !== savedImages.length ||
    images.some((u, i) => u !== savedImages[i]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col gap-8">
      {/* Header z breadcrumb */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/produkty"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] inline-flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Wszystkie produkty
          </Link>
          <h1 className="font-display text-3xl font-bold text-[var(--fg)] mt-2">
            {product.name}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            ID: {product.id}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={duplicating}
          title="Utwórz ukrytą kopię tej oferty w tej samej grupie rozmiarów"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-sans font-semibold uppercase tracking-widest rounded-full border border-[var(--color-navy)] text-[var(--color-navy)] dark:border-[var(--color-gold)] dark:text-[var(--color-gold)] hover:bg-[var(--color-navy)] hover:text-white dark:hover:bg-[var(--color-gold)] dark:hover:text-[var(--color-navy)] transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {duplicating ? "Duplikuję..." : "Duplikuj ofertę"}
        </button>
      </div>

      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-sans ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
          role="status"
          data-toast-type={toast.type}
        >
          {toast.message}
        </div>
      )}

      {/* ============================================================
          Sekcja: Podstawowe dane
          ============================================================ */}
      <CollapsibleSection title="Podstawowe dane" storageKey="podstawowe">
        {/* onSubmit zamiast action: React 19 po zakończeniu akcji formularza robi
            automatyczny form.reset(), który cofa niekontrolowany <select> kategorii
            do wartości z mountu (a ponowny zapis odsyłałby starą kategorię do bazy). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startBasicsTransition(async () => handleResult(await updateProductBasics(fd)));
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <input type="hidden" name="id" value={product.id} />

          <Field label="Nazwa" required className="md:col-span-2">
            <input
              name="name"
              defaultValue={product.name}
              required
              maxLength={300}
              className={inputClass}
            />
          </Field>

          <Field label="Cena (zł)" required>
            <input
              name="price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.price}
              required
              className={inputClass}
            />
          </Field>

          <div className="md:col-span-2 flex flex-col gap-3 p-4 border border-[var(--border)] rounded-xl">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
                Promocja
              </p>
              <p className="text-xs text-[var(--fg)]">{promoStatusLabel}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field
                label="Cena promocyjna (zł)"
                hint="Puste = brak promocji. Musi być niższa od ceny regularnej."
              >
                <input
                  name="sale_price_planned"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={product.sale_price_planned ?? ""}
                  className={inputClass}
                />
              </Field>

              <Field label="Od" hint="Puste = od razu.">
                <input
                  name="sale_from"
                  type="date"
                  defaultValue={product.sale_from ?? ""}
                  className={inputClass}
                />
              </Field>

              <Field label="Do (włącznie)" hint="Puste = bez końca, trzeba wyłączyć ręcznie.">
                <input
                  name="sale_to"
                  type="date"
                  defaultValue={product.sale_to ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Napis na wstążce"
              hint="Puste = „Promocja”. Maks. 16 znaków."
            >
              <input
                name="promo_badge"
                maxLength={16}
                defaultValue={product.promo_badge ?? ""}
                onChange={(e) => setBadgeDraft(e.target.value)}
                className={inputClass}
              />
            </Field>

            {badgeWarning && (
              <p className="px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg">
                Ten napis sugeruje obniżkę, a produkt nie ma aktywnej ceny
                promocyjnej. Dyrektywa Omnibus wymaga wtedy pokazania najniższej
                ceny z 30 dni przed obniżką. Ustaw cenę promocyjną albo zmień
                napis na taki, który nie mówi o cenie — np. „Nowość”,
                „Ostatnie sztuki”.
              </p>
            )}
          </div>

          <Field label="Kategoria" required>
            <select name="category" defaultValue={product.category} required className={inputClass}>
              {categoryGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {" ".repeat(o.depth * 4)}
                      {o.label} ({o.slug})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Stan magazynowy">
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              defaultValue={product.stock}
              className={inputClass}
            />
          </Field>

          <Field label="Kolor (do filtra)">
            <input name="color" defaultValue={product.color ?? ""} maxLength={100} className={inputClass} />
          </Field>

          <Field label="Materiał (do filtra)">
            <input name="material" defaultValue={product.material ?? ""} maxLength={100} className={inputClass} />
          </Field>

          <SizeGroupEditor
            currentId={product.id}
            members={sizeGroupMembers}
            onToast={showToast}
          />

          <Field label="Wymiary (cm)" className="md:col-span-2" hint="Szerokość × głębokość × wysokość. Zostaw puste żeby wyczyścić.">
            <div className="grid grid-cols-3 gap-2">
              <input
                name="dim_width"
                type="number"
                step="0.1"
                placeholder="szer."
                defaultValue={product.dimensions?.width ?? ""}
                className={inputClass}
              />
              <input
                name="dim_depth"
                type="number"
                step="0.1"
                placeholder="głęb."
                defaultValue={product.dimensions?.depth ?? ""}
                className={inputClass}
              />
              <input
                name="dim_height"
                type="number"
                step="0.1"
                placeholder="wys."
                defaultValue={product.dimensions?.height ?? ""}
                className={inputClass}
              />
            </div>
          </Field>

          <Field label="Waga (kg)">
            <input
              name="weight"
              type="number"
              step="0.1"
              min="0"
              defaultValue={product.weight ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Czas dostawy">
            <input
              name="delivery_time"
              defaultValue={product.delivery_time ?? ""}
              placeholder="np. 21 dni roboczych"
              maxLength={100}
              className={inputClass}
            />
          </Field>

          <Field label="Gwarancja">
            <input
              name="warranty"
              defaultValue={product.warranty ?? ""}
              placeholder="np. 5 lat"
              maxLength={100}
              className={inputClass}
            />
          </Field>

          <Field label="Konstrukcja" className="md:col-span-2">
            <textarea
              name="construction"
              defaultValue={product.construction ?? ""}
              rows={3}
              maxLength={1000}
              className={`${inputClass} resize-y`}
            />
          </Field>

          {/* Parametry produktu — dowolne pary klucz→wartość doklejane do
              sekcji „Specyfikacja" pod zdjęciem (kolumna products.features). */}
          <div className="md:col-span-2 flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              Parametry produktu
            </span>
            <p className="text-[11px] text-[var(--muted)] -mt-1">
              Wyświetlane w sekcji &bdquo;Specyfikacja&rdquo; pod zdjęciem. Nazwy: Kolor,
              Materiał, Wymiary, Waga, Konstrukcja, Czas realizacji, Gwarancja są na
              karcie pomijane (mają dedykowane pola wyżej) &mdash; nie dubluj. Max {MAX_FEATURES}.
            </p>
            <input
              type="hidden"
              name="features_json"
              readOnly
              value={JSON.stringify(
                featureRows.filter((r) => r.key.trim() && r.value.trim())
              )}
            />
            {featureRows.length === 0 && (
              <span className="text-xs text-[var(--muted)] italic">
                Brak parametrów &mdash; dodaj pierwszy.
              </span>
            )}
            <div className="flex flex-col gap-2">
              {featureRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Wrappery nadają szerokość; input zostaje z inputClass (w-full)
                      i wypełnia wrapper. Bez tego w-full z inputClass kłóciło się
                      z w-2/5/flex-1 na inpucie → pole wartości zapadało się do ~25px
                      i wpisany tekst był niewidoczny. min-w-0 pozwala flex-1 zwężać. */}
                  <div className="w-2/5">
                    <input
                      value={row.key}
                      onChange={(e) => setFeatureKey(i, e.target.value)}
                      placeholder="np. Wypełnienie"
                      maxLength={100}
                      className={inputClass}
                    />
                  </div>
                  <div
                    className="flex-1 min-w-0 relative"
                    ref={valuePickerIdx === i ? valuePickerRef : undefined}
                  >
                    <input
                      ref={(el) => {
                        if (el && pendingFocusIdx.current === i) {
                          pendingFocusIdx.current = null;
                          el.focus();
                        }
                      }}
                      value={row.value}
                      onChange={(e) => setFeatureValue(i, e.target.value)}
                      placeholder="np. Pianka HR"
                      maxLength={300}
                      className={
                        valueSuggestionsFor(row.key).length > 0
                          ? `${inputClass} pr-9`
                          : inputClass
                      }
                    />
                    {valueSuggestionsFor(row.key).length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPickerOpen(false);
                            setValuePickerIdx((v) => (v === i ? null : i));
                          }}
                          aria-label="Wybierz wartość z listy"
                          aria-expanded={valuePickerIdx === i}
                          aria-haspopup="listbox"
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-[var(--color-gold-text)] hover:bg-[var(--color-gold)]/10"
                        >
                          ▾
                        </button>
                        {valuePickerIdx === i && (
                          <ul
                            role="listbox"
                            aria-label="Użyte wartości parametru"
                            className="absolute z-20 top-full mt-1 left-0 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg py-1"
                          >
                            {valueSuggestionsFor(row.key).map((v) => (
                              <li key={v} role="option" aria-selected={false}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFeatureValue(i, v);
                                    setValuePickerIdx(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-gold)]/10"
                                >
                                  {v}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFeatureRow(i)}
                    aria-label="Usuń parametr"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setValuePickerIdx(null);
                    setPickerOpen((o) => !o);
                  }}
                  disabled={featureRows.length >= MAX_FEATURES || availableSuggestions.length === 0}
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  title={
                    availableSuggestions.length === 0
                      ? "Wszystkie nazwy z listy są już dodane"
                      : undefined
                  }
                  className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
                >
                  + Wybierz z listy ▾
                </button>
                {pickerOpen && (
                  <ul
                    role="listbox"
                    aria-label="Gotowe nazwy parametrów"
                    className="absolute z-20 top-full mt-1 left-0 w-72 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg py-1"
                  >
                    {availableSuggestions.map((k) => (
                      <li key={k} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => addFeatureRowFromList(k)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-gold)]/10"
                        >
                          {k}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={addFeatureRow}
                disabled={featureRows.length >= MAX_FEATURES}
                className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
              >
                + Dodaj własny parametr
              </button>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingBasics}
              className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              {savingBasics ? "Zapisuję..." : "Zapisz podstawowe dane"}
            </button>
          </div>
        </form>
      </CollapsibleSection>

      {/* ============================================================
          Sekcja: Zdjęcia produktu (globalna galeria)
          ============================================================ */}
      <CollapsibleSection
        title="Zdjęcia produktu"
        storageKey="zdjecia"
        headerAside={
          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <label
              className={`px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer ${
                upload.uploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {upload.progressText ?? "+ Dodaj zdjęcia"}
              <input {...upload.inputProps} className="hidden" />
            </label>
            {variantImageGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setGalleryPickerOpen(true)}
                className="px-5 py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
              >
                + Wybierz z wgranych
              </button>
            )}
          </div>
        }
      >
        <p className="text-sm text-[var(--muted)] max-w-2xl">
          Globalna galeria pokazywana na karcie produktu gdy klient nie wybrał wariantu
          ze zdjęciami. Możesz dodać kilka zdjęć naraz — wybierając wiele plików lub
          przeciągając je na galerię. Strzałkami ↑/↓ ustawiasz kolejność, ikoną kosza usuwasz.
        </p>

        <div
          {...upload.dropProps}
          className={`relative rounded-xl transition-colors ${
            upload.isDragging
              ? "outline outline-2 outline-dashed outline-[var(--color-gold)] outline-offset-4"
              : ""
          }`}
        >
        {images.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)] border-2 border-dashed border-[var(--border)] rounded-xl">
            Brak zdjęć. Wgraj klikając &bdquo;+ Dodaj zdjęcia&rdquo; lub przeciągnij pliki tutaj.
          </div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((url, i) => (
              <li
                key={`${url}-${i}`}
                className="relative aspect-square bg-stone-100 dark:bg-stone-800 rounded-xl overflow-hidden border border-[var(--border)]"
              >
                <Image src={url} alt={`Zdjęcie ${i + 1}`} fill sizes="200px" className="object-cover" />
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-sans rounded-full">
                  {i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-2 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent">
                  <div className="flex gap-1">
                    <IconBtn
                      label="Przesuń w lewo"
                      onClick={() => moveImage(i, -1)}
                      disabled={i === 0}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </IconBtn>
                    <IconBtn
                      label="Przesuń w prawo"
                      onClick={() => moveImage(i, 1)}
                      disabled={i === images.length - 1}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </IconBtn>
                  </div>
                  <IconBtn label="Usuń" onClick={() => removeImage(i)} danger>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                    </svg>
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
          {upload.isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--color-navy)]/60 pointer-events-none">
              <span className="text-white font-sans text-sm uppercase tracking-widest">
                Upuść zdjęcia tutaj
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)]">
            {imagesDirty ? "Masz niezapisane zmiany w galerii." : "Galeria zapisana."}
          </p>
          <button
            onClick={saveImages}
            disabled={savingImages || !imagesDirty}
            className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {savingImages ? "Zapisuję..." : "Zapisz zdjęcia"}
          </button>
        </div>
      </CollapsibleSection>

      {/* Modal poza CollapsibleSection — zwinięcie sekcji ukryłoby go razem
          z jej zawartością. */}
      {galleryPickerOpen && (
        <ImagePickerModal
          groups={variantImageGroups}
          alreadyUsed={images}
          onPick={(picked) => {
            // Dedupe: ten sam URL nie ma wejść do galerii dwa razy (upload
            // zawsze dawał nowe URL-e, więc dotąd nie było takiego ryzyka).
            setImages((prev) => [...prev, ...picked.filter((u) => !prev.includes(u))]);
            setGalleryPickerOpen(false);
          }}
          onCancel={() => setGalleryPickerOpen(false)}
        />
      )}

      {/* ============================================================
          Sekcja: Warianty (pełny editor)
          ============================================================ */}
      <VariantsEditor productId={product.id} initial={product.variants} categorySlug={product.category} fabrics={fabrics} fabricGroups={fabricGroups} initialVariantInfo={variantInfo} variantImageGroups={variantImageGroups} onToast={showToast} />

      {/* ============================================================
          Sekcja: Pojedynczy opis (fallback gdy brak sekcji)
          ============================================================ */}
      <DescriptionFieldEditor
        productId={product.id}
        initial={product.description ?? ""}
        onToast={showToast}
      />

      {/* ============================================================
          Sekcja: Edytor sekcji opisu (z importu + admin images)
          ============================================================ */}
      <DescriptionSectionsEditor
        productId={product.id}
        initial={product.description_sections ?? []}
        onToast={showToast}
      />

      {/* ============================================================
          Sekcja: Tłumaczenie niemieckie (DE) — override + status
          ============================================================ */}
      <TranslationEditor productId={product.id} initial={de} onToast={showToast} />

    </div>
  );
}

// Data z kolumny `date` (YYYY-MM-DD) na polski zapis dzienny.
function dayPl(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function describeSaleStatus(s: SaleStatus): string {
  switch (s.kind) {
    case "active":
      return s.until ? `aktywna — do ${dayPl(s.until)}` : "aktywna — bez terminu końca";
    case "scheduled":
      return `zaplanowana — startuje ${dayPl(s.from)}`;
    case "ended":
      return `zakończona ${dayPl(s.on)}`;
    case "badgeOnly":
      return "sam napis na wstążce, bez obniżki ceny";
    case "none":
      return "brak promocji";
  }
}
