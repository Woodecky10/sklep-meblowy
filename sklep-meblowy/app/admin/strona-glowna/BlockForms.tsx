"use client";

// Formularze treści bloków (panel admina, PL-only). Każdy formularz trzyma
// lokalny stan zbudowany z block.content (surowy jsonb) i na zapis wysyła
// obiekt treści do updateContentBlock — walidacja jest po stronie serwera
// (validateBlockContent), toast z błędem wraca przez onResult.
//
// Task 11 dopisze do TEGO SAMEGO pliku kolejne formularze (ProductsForm,
// FaqForm, ReviewsForm) korzystając z helperów zdefiniowanych tutaj (cs,
// SaveButton, BlockFormProps, BlockPickerData).

import { useState, useTransition } from "react";
import Image from "next/image";
import { updateContentBlock } from "./actions";
import { useImageUpload } from "@/app/admin/produkty/[id]/useImageUpload";
import type { PageBlockRow } from "@/app/_lib/blocks";
import type { ActionResult } from "@/app/_lib/types";
import { Field, inputCls } from "@/app/admin/_shared";

export type BlockFormProps = {
  block: PageBlockRow;
  onResult: (r: ActionResult) => void;
};

// Dane do pickerów sekcji produktowej (Task 11: ProductsForm) — produkty do
// wyboru ręcznego, kolekcje i kategorie do wyboru źródła "collection"/"category".
export type BlockPickerData = {
  products: { id: string; name: string }[];
  collections: { slug: string; label: string }[];
  categories: { slug: string; label: string }[];
};

// Bezpieczny odczyt stringa z jsonb do kontrolowanego inputa.
export function cs(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function SaveButton({ saving }: { saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      data-guard-save
      className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
    >
      {saving ? "Zapisuję..." : "Zapisz sekcję"}
    </button>
  );
}

// ── Banner (tekst + zdjęcie) ─────────────────────────────────────────────

export function BannerForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [body, setBody] = useState(cs(c.body));
  const [bodyDe, setBodyDe] = useState(cs(c.body_de));
  const [layout, setLayout] = useState(cs(c.layout) || "left");
  const [imageUrl, setImageUrl] = useState(cs(c.image_url));
  const [ctaLabel, setCtaLabel] = useState(cs(c.cta_label));
  const [ctaLabelDe, setCtaLabelDe] = useState(cs(c.cta_label_de));
  const [ctaHref, setCtaHref] = useState(cs(c.cta_href));
  const [saving, startTransition] = useTransition();

  const upload = useImageUpload({
    onUploaded: (urls) => {
      if (urls[0]) setImageUrl(urls[0]);
    },
    onToast: (t) => {
      if (!t) return;
      onResult(t.type === "error" ? { ok: false, error: t.message } : { ok: true, message: t.message });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, {
          heading, heading_de: headingDe, body, body_de: bodyDe,
          layout, image_url: imageUrl || null,
          cta_label: ctaLabel, cta_label_de: ctaLabelDe, cta_href: ctaHref,
        })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek" required>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Tekst">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} className={inputCls} />
        </Field>
        <Field label="Tekst (DE)">
          <textarea value={bodyDe} onChange={(e) => setBodyDe(e.target.value)} rows={4} maxLength={2000} className={inputCls} />
        </Field>
      </div>

      <Field label="Układ">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["left", "Zdjęcie po lewej"],
              ["right", "Zdjęcie po prawej"],
              ["background", "Zdjęcie jako tło"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                layout === value
                  ? "bg-[var(--color-navy)] text-white"
                  : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Zdjęcie">
        <div
          {...upload.dropProps}
          className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-start gap-3 ${
            upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
          }`}
        >
          {imageUrl && (
            <div className="relative w-40 aspect-[4/3] rounded-lg overflow-hidden">
              <Image src={imageUrl} alt="" fill className="object-cover" />
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="cursor-pointer px-3 py-1.5 border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full uppercase tracking-widest hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors">
              {imageUrl ? "Zmień zdjęcie" : "Wybierz zdjęcie"}
              <input className="hidden" {...upload.inputProps} multiple={false} />
            </label>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl("")} className="text-red-600 hover:underline">
                Usuń zdjęcie
              </button>
            )}
            {upload.uploading && <span className="text-[var(--muted)]">{upload.progressText}</span>}
            {!upload.uploading && <span className="text-[var(--muted)]">albo przeciągnij plik tutaj</span>}
          </div>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Etykieta przycisku (opcjonalnie)">
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={200} className={inputCls} placeholder="np. Zobacz kolekcję" />
        </Field>
        <Field label="Etykieta przycisku (DE)">
          <input value={ctaLabelDe} onChange={(e) => setCtaLabelDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Link przycisku">
          <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} maxLength={500} className={inputCls} placeholder="np. /sklep?kolekcja=lisbon" />
        </Field>
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Galeria zdjęć ────────────────────────────────────────────────────────

type GalleryImage = { url: string; alt: string };

export function GalleryForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [images, setImages] = useState<GalleryImage[]>(() =>
    (Array.isArray(c.images) ? c.images : [])
      .map((img) => {
        const o = (typeof img === "object" && img !== null ? img : {}) as Record<string, unknown>;
        return { url: cs(o.url), alt: cs(o.alt) };
      })
      .filter((img) => img.url.length > 0)
  );
  const [saving, startTransition] = useTransition();

  const upload = useImageUpload({
    onUploaded: (urls) =>
      setImages((prev) => [...prev, ...urls.map((url) => ({ url, alt: "" }))]),
    onToast: (t) => {
      if (!t) return;
      onResult(t.type === "error" ? { ok: false, error: t.message } : { ok: true, message: t.message });
    },
  });

  function moveImage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, { heading, heading_de: headingDe, images })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      <div
        {...upload.dropProps}
        className={`border-2 border-dashed rounded-xl p-4 flex flex-col gap-3 ${
          upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="cursor-pointer px-3 py-1.5 border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full uppercase tracking-widest hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors">
            + Dodaj zdjęcia
            <input className="hidden" {...upload.inputProps} />
          </label>
          {upload.uploading ? (
            <span className="text-[var(--muted)]">{upload.progressText}</span>
          ) : (
            <span className="text-[var(--muted)]">albo przeciągnij pliki tutaj (max 24)</span>
          )}
        </div>
        {images.length > 0 && (
          <ul className="flex flex-col gap-2">
            {images.map((img, i) => (
              <li key={`${img.url}-${i}`} className="flex items-center gap-3 border border-[var(--border)] rounded-lg p-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Przesuń zdjęcie wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} aria-label="Przesuń zdjęcie niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                  <Image src={img.url} alt="" fill className="object-cover" />
                </div>
                <input
                  value={img.alt}
                  onChange={(e) =>
                    setImages((prev) => prev.map((x, xi) => (xi === i ? { ...x, alt: e.target.value } : x)))
                  }
                  placeholder="Podpis pod zdjęciem (widoczny, opcjonalnie)"
                  maxLength={200}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, xi) => xi !== i))}
                  aria-label="Usuń zdjęcie"
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────

type FaqItem = { question: string; question_de: string; answer: string; answer_de: string };

export function FaqForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [items, setItems] = useState<FaqItem[]>(() =>
    (Array.isArray(c.items) ? c.items : []).map((it) => {
      const o = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
      return { question: cs(o.question), question_de: cs(o.question_de), answer: cs(o.answer), answer_de: cs(o.answer_de) };
    })
  );
  const [saving, startTransition] = useTransition();

  function setItem(i: number, patch: Partial<FaqItem>) {
    setItems((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  }
  function moveItem(i: number, delta: -1 | 1) {
    const t = i + delta;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[i], next[t]] = [next[t], next[i]];
    setItems(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(await updateContentBlock(block.id, { heading, heading_de: headingDe, items }));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      {items.map((item, i) => (
        <div key={i} className="border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <div className="flex flex-col gap-0.5 shrink-0">
            <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Przesuń pytanie wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="Przesuń pytanie niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <Field label={`Pytanie ${i + 1}`} required>
              <input value={item.question} onChange={(e) => setItem(i, { question: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
            <Field label="Pytanie (DE)">
              <input value={item.question_de} onChange={(e) => setItem(i, { question_de: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
            <Field label="Odpowiedź" required>
              <textarea value={item.answer} onChange={(e) => setItem(i, { answer: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Odpowiedź (DE)">
              <textarea value={item.answer_de} onChange={(e) => setItem(i, { answer_de: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
            aria-label={`Usuń pytanie ${i + 1}`}
            className="self-start w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, { question: "", question_de: "", answer: "", answer_de: "" }])}
        className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj pytanie
      </button>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Opinie ───────────────────────────────────────────────────────────────

type ReviewItem = { quote: string; quote_de: string; author: string };

export function ReviewsForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [items, setItems] = useState<ReviewItem[]>(() =>
    (Array.isArray(c.items) ? c.items : []).map((it) => {
      const o = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
      return { quote: cs(o.quote), quote_de: cs(o.quote_de), author: cs(o.author) };
    })
  );
  const [saving, startTransition] = useTransition();

  function setItem(i: number, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(await updateContentBlock(block.id, { heading, heading_de: headingDe, items }));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      {items.map((item, i) => (
        <div key={i} className="border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <Field label={`Opinia ${i + 1}`} required>
              <textarea value={item.quote} onChange={(e) => setItem(i, { quote: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Opinia (DE)">
              <textarea value={item.quote_de} onChange={(e) => setItem(i, { quote_de: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Podpis (np. Anna z Warszawy)">
              <input value={item.author} onChange={(e) => setItem(i, { author: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
            aria-label={`Usuń opinię ${i + 1}`}
            className="self-start w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, { quote: "", quote_de: "", author: "" }])}
        className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj opinię
      </button>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Sekcja produktowa ────────────────────────────────────────────────────

export function ProductsForm({
  block,
  onResult,
  picker,
}: BlockFormProps & { picker: BlockPickerData }) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [source, setSource] = useState<string>(
    c.source === "collection" || c.source === "category" ? (c.source as string) : "manual"
  );
  const [productIds, setProductIds] = useState<string[]>(() =>
    (Array.isArray(c.product_ids) ? c.product_ids : []).filter(
      (x): x is string => typeof x === "string"
    )
  );
  const [collectionSlug, setCollectionSlug] = useState(cs(c.collection_slug));
  const [categorySlug, setCategorySlug] = useState(cs(c.category_slug));
  const [limit, setLimit] = useState(
    typeof c.limit === "number" && Number.isFinite(c.limit) ? String(c.limit) : "4"
  );
  const [search, setSearch] = useState("");
  const [saving, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const visibleProducts = q
    ? picker.products.filter((p) => p.name.toLowerCase().includes(q))
    : picker.products;

  function toggleProduct(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, {
          heading, heading_de: headingDe, source,
          product_ids: productIds, collection_slug: collectionSlug,
          category_slug: categorySlug, limit: Number(limit) || 4,
        })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      <Field label="Skąd brać produkty?">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["manual", "Wybieram ręcznie"],
              ["collection", "Cała kolekcja"],
              ["category", "Cała kategoria"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(value)}
              aria-pressed={source === value}
              className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                source === value
                  ? "bg-[var(--color-navy)] text-white"
                  : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {source === "manual" && (
        <div className="flex flex-col gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj produktu…"
            className={inputCls}
          />
          <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {visibleProducts.length === 0 && (
              <p className="p-3 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
            )}
            {visibleProducts.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-[var(--bg)]">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={() => toggleProduct(p.id)}
                  className="h-4 w-4 accent-[var(--color-gold)]"
                />
                <span className="text-sm text-[var(--fg)]">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Wybrano: {productIds.length} (max 12; kolejność = kolejność zaznaczania)
          </p>
        </div>
      )}

      {source === "collection" && (
        <Field label="Kolekcja" required>
          <select value={collectionSlug} onChange={(e) => setCollectionSlug(e.target.value)} className={inputCls}>
            <option value="">— wybierz —</option>
            {picker.collections.map((col) => (
              <option key={col.slug} value={col.slug}>{col.label}</option>
            ))}
          </select>
        </Field>
      )}

      {source === "category" && (
        <Field label="Kategoria" required>
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className={inputCls}>
            <option value="">— wybierz —</option>
            {picker.categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>{cat.label}</option>
            ))}
          </select>
        </Field>
      )}

      {source !== "manual" && (
        <Field label="Ile produktów pokazać (1–12)">
          <input
            type="number" min={1} max={12} inputMode="numeric"
            value={limit} onChange={(e) => setLimit(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </Field>
      )}

      <SaveButton saving={saving} />
    </form>
  );
}
