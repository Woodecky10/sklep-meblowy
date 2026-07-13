"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { updateProductBasics, updateProductImages, duplicateProduct } from "../actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { Product, ActionResult, Fabric } from "@/app/_lib/types";
import type { CategoryDef } from "@/app/_lib/categories";
import { Field, IconBtn, inputClass, CollapsibleSection, type Toast } from "./_shared";
import { useImageUpload } from "./useImageUpload";
import VariantsEditor from "./VariantsEditor";
import DescriptionSectionsEditor from "./DescriptionSectionsEditor";
import DescriptionFieldEditor from "./DescriptionFieldEditor";
import TranslationEditor, { type ProductDeFields } from "./TranslationEditor";
import SizeGroupEditor from "./SizeGroupEditor";
import type { SizeGroupMember } from "@/app/_lib/products";

export default function ProductEditor({
  product,
  categories,
  de,
  sizeGroupMembers,
  fabrics,
}: {
  product: Product;
  categories: CategoryDef[];
  de: ProductDeFields;
  sizeGroupMembers: SizeGroupMember[];
  fabrics: Fabric[];
}) {
  const [images, setImages] = useState<string[]>(product.images ?? []);
  // Baseline ostatnio zapisanej galerii — resetowany na zapisany payload po
  // sukcesie. Bez tego imagesDirty liczone względem propa product.images
  // (niezmiennego bez reloadu) wisiało jako true po zapisie (audyt LOW).
  const [savedImages, setSavedImages] = useState<string[]>(product.images ?? []);
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
        <form
          action={(fd) => startBasicsTransition(async () => handleResult(await updateProductBasics(fd)))}
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

          <Field
            label="Cena promocyjna (zł)"
            hint="Zostaw puste = brak promocji. Musi być niższa od ceny regularnej."
          >
            <input
              name="sale_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.sale_price ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Kategoria" required>
            <select name="category" defaultValue={product.category} required className={inputClass}>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label} ({c.slug})
                </option>
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
          <label
            className={`shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer ${
              upload.uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {upload.progressText ?? "+ Dodaj zdjęcia"}
            <input {...upload.inputProps} className="hidden" />
          </label>
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

      {/* ============================================================
          Sekcja: Warianty (pełny editor)
          ============================================================ */}
      <VariantsEditor productId={product.id} initial={product.variants} categorySlug={product.category} fabrics={fabrics} onToast={showToast} />

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
