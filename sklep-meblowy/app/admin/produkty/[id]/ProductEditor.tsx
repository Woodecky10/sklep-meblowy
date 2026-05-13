"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  updateProductBasics,
  updateProductImages,
  uploadProductImage,
  type ActionResult,
} from "../actions";
import type { Product } from "@/app/_lib/types";
import type { CategoryDef } from "@/app/_lib/categories";
import { hasVariants } from "@/app/_lib/variants";
import { Field, IconBtn, compressIfNeeded, inputClass, type Toast } from "./_shared";
import VariantsEditor from "./VariantsEditor";

export default function ProductEditor({
  product,
  categories,
}: {
  product: Product;
  categories: CategoryDef[];
}) {
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [toast, setToast] = useState<Toast>(null);
  const [savingBasics, startBasicsTransition] = useTransition();
  const [savingImages, startImagesTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(res: ActionResult) {
    if (res.ok) showToast({ type: "success", message: res.message ?? "Zapisano" });
    else showToast({ type: "error", message: res.error });
  }

  // ============================================================
  // Zdjęcia globalne — upload, sortowanie, usuwanie
  // ============================================================

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset żeby kolejny upload tego samego pliku zadziałał

    setUploading(true);
    try {
      const toSend = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", toSend, toSend.name);
      const res = await uploadProductImage(fd);
      if (!res.ok) {
        showToast({ type: "error", message: res.error });
        return;
      }
      const url = (res.data as { url: string } | undefined)?.url;
      if (!url) {
        showToast({ type: "error", message: "Brak URL po uploadzie" });
        return;
      }
      setImages((prev) => [...prev, url]);
      showToast({
        type: "success",
        message: 'Zdjęcie wgrane. Kliknij „Zapisz zdjęcia” żeby utrwalić.',
      });
    } finally {
      setUploading(false);
    }
  }

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
      handleResult(res);
    });
  }

  const imagesDirty =
    images.length !== (product.images?.length ?? 0) ||
    images.some((u, i) => u !== product.images?.[i]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col gap-8">
      {/* Header z breadcrumb */}
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

      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-sans ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      {/* ============================================================
          Sekcja: Podstawowe dane
          ============================================================ */}
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Podstawowe dane
        </h2>

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

          <Field label="Kategoria" required>
            <select name="category" defaultValue={product.category} required className={inputClass}>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label} ({c.slug})
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Stan magazynowy"
            hint={hasVariants(product) ? "Dla produktów z wariantami suma stocków = stock per kombinacja." : undefined}
          >
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              defaultValue={product.stock}
              className={inputClass}
              disabled={hasVariants(product)}
            />
          </Field>

          <Field label="Kolor (do filtra)">
            <input name="color" defaultValue={product.color ?? ""} maxLength={100} className={inputClass} />
          </Field>

          <Field label="Materiał (do filtra)">
            <input name="material" defaultValue={product.material ?? ""} maxLength={100} className={inputClass} />
          </Field>

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
      </section>

      {/* ============================================================
          Sekcja: Zdjęcia produktu (globalna galeria)
          ============================================================ */}
      <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
              Zdjęcia produktu
            </h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              Globalna galeria pokazywana na karcie produktu gdy klient nie wybrał wariantu
              ze zdjęciami. Strzałkami ↑/↓ ustawiasz kolejność, ikoną kosza usuwasz.
            </p>
          </div>
          <label className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors cursor-pointer disabled:opacity-50">
            {uploading ? "Wgrywam..." : "+ Dodaj zdjęcie"}
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {images.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)] border-2 border-dashed border-[var(--border)] rounded-xl">
            Brak zdjęć. Wgraj pierwsze klikając &bdquo;+ Dodaj zdjęcie&rdquo;.
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
      </section>

      {/* ============================================================
          Sekcja: Warianty (pełny editor)
          ============================================================ */}
      <VariantsEditor productId={product.id} initial={product.variants} onToast={showToast} />

      {/* ============================================================
          Sekcja: Surowe dane z BaseLinker (debug / diagnostyka)
          ============================================================ */}
      {product.baselinker_id && (
        <BaseLinkerRawSection baselinkerId={product.baselinker_id} />
      )}
    </div>
  );
}

// ============================================================
// BaseLinkerRawSection — akordeon z surowym payloadem BL produktu
// ============================================================
// Pomocne przy debugowaniu wariantów (czy nazwa pasuje do "Kolor:
// Beżowy, Strona: Lewa"?) i innych pól które sync może nie podchwycić.
function BaseLinkerRawSection({ baselinkerId }: { baselinkerId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/baselinker/raw?productId=${encodeURIComponent(baselinkerId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Błąd pobierania danych");
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) load();
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-[var(--bg)] transition-colors rounded-2xl"
      >
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Surowe dane z BaseLinker
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            BL product ID: <code className="font-mono">{baselinkerId}</code> — kliknij żeby zobaczyć
            payload zwrócony przez API (pomocne przy diagnozie wariantów).
          </p>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-6">
          {loading && (
            <p className="text-sm text-[var(--muted)]">Pobieram z BaseLinker…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {data !== null && !loading && !error && (
            <pre className="text-[11px] font-mono bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre-wrap break-words">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
