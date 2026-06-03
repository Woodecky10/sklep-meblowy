"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { updateProductDescriptionSections, uploadProductImage } from "../actions";
import type { ProductDescriptionSection } from "@/app/_lib/types";
import { compressIfNeeded, IconBtn, inputClass, type Toast } from "./_shared";

// Edytor sekcji opisu produktu:
// - Sekcje text (z BL) są read-only — admin widzi pierwsze 80 znaków preview
// - Sekcje image (admin) — pełna edycja: alt, caption, usuń, move up/down
// - Między każdą parą sekcji przycisk "+ Dodaj zdjęcie" wstawia image section
//
// BL sync nie ruszą image sekcji (mergeSectionsPreserveAdminImages w sync).
// Text sekcje przychodzą z BL — admin musi je edytować w BL panelu.
export default function DescriptionSectionsEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: ProductDescriptionSection[];
  onToast: (t: Toast) => void;
}) {
  const [sections, setSections] = useState<ProductDescriptionSection[]>(initial);
  const [saving, startSaveTransition] = useTransition();
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(sections) !== JSON.stringify(initial),
    [sections, initial]
  );

  function patchSection(idx: number, patch: Partial<ProductDescriptionSection>) {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? ({ ...s, ...patch } as ProductDescriptionSection) : s))
    );
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    setSections((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function removeSection(idx: number) {
    if (!window.confirm("Usunąć tę sekcję?")) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
  }

  async function insertImageAt(insertIdx: number, file: File) {
    setUploadingIdx(insertIdx);
    try {
      const compressed = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", compressed, compressed.name);
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
      const newImage: ProductDescriptionSection = {
        kind: "image",
        image_url: url,
        image_alt: "",
      };
      setSections((prev) => {
        const next = prev.slice();
        next.splice(insertIdx, 0, newImage);
        return next;
      });
      onToast({
        type: "success",
        message: "Zdjęcie wgrane. Kliknij „Zapisz sekcje” żeby utrwalić.",
      });
    } finally {
      setUploadingIdx(null);
    }
  }

  function save() {
    startSaveTransition(async () => {
      const res = await updateProductDescriptionSections(productId, sections);
      if (res.ok) {
        onToast({ type: "success", message: res.message ?? "Zapisano sekcje" });
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Sekcje opisu produktu
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
          Sekcje <strong>tekstowe</strong> (Opis / Materiał / Pielęgnacja / Wymiary / FAQ) przychodzą z
          BaseLinkera — edytuj je tam, sync zaktualizuje. Możesz między nimi wstawiać{" "}
          <strong>zdjęcia kontekstowe</strong> (np. zbliżenie tkaniny, mood shot
          salonu, infografika wymiarów) — przycisk <em>+ Dodaj zdjęcie</em> między
          sekcjami.
        </p>
      </div>

      <div className="flex flex-col">
        {/* Insert button na samej górze */}
        <InsertImageButton
          uploading={uploadingIdx === 0}
          onUpload={(file) => insertImageAt(0, file)}
        />

        {sections.map((s, idx) => (
          <div key={idx}>
            {s.kind === "text" ? (
              <TextSectionRow
                section={s}
                onMoveUp={idx > 0 ? () => moveSection(idx, -1) : undefined}
                onMoveDown={idx < sections.length - 1 ? () => moveSection(idx, 1) : undefined}
              />
            ) : (
              <ImageSectionRow
                section={s}
                onAltChange={(v) => patchSection(idx, { image_alt: v })}
                onCaptionChange={(v) =>
                  patchSection(idx, { caption: v.trim() === "" ? undefined : v })
                }
                onRemove={() => removeSection(idx)}
                onMoveUp={idx > 0 ? () => moveSection(idx, -1) : undefined}
                onMoveDown={idx < sections.length - 1 ? () => moveSection(idx, 1) : undefined}
              />
            )}
            <InsertImageButton
              uploading={uploadingIdx === idx + 1}
              onUpload={(file) => insertImageAt(idx + 1, file)}
            />
          </div>
        ))}

        {sections.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic py-6 text-center">
            Brak sekcji opisu. Wypełnij pola Opis / Opis 1-4 w BaseLinkerze i odpal sync,
            albo dodaj zdjęcie przyciskiem powyżej.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          {dirty ? "Masz niezapisane zmiany." : "Sekcje zapisane."}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz sekcje"}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Sub-komponenty
// ============================================================

function TextSectionRow({
  section,
  onMoveUp,
  onMoveDown,
}: {
  section: Extract<ProductDescriptionSection, { kind: "text" }>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  // Krótki preview body (strip HTML + 100 znaków)
  const preview = section.body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3">
      <div className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-[var(--color-navy)]/10 dark:bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-navy)] dark:text-[var(--color-gold)]">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="14" y2="18" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm font-semibold text-[var(--fg)]">
          {section.title}
        </p>
        <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
          {preview}
          {section.body.length > 120 ? "…" : ""}
        </p>
        <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mt-2">
          Z BaseLinkera — edytuj w BL panelu
        </p>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <IconBtn label="W górę" onClick={onMoveUp ?? (() => {})} disabled={!onMoveUp}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </IconBtn>
        <IconBtn label="W dół" onClick={onMoveDown ?? (() => {})} disabled={!onMoveDown}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </IconBtn>
      </div>
    </div>
  );
}

function ImageSectionRow({
  section,
  onAltChange,
  onCaptionChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: Extract<ProductDescriptionSection, { kind: "image" }>;
  onAltChange: (v: string) => void;
  onCaptionChange: (v: string) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--color-gold)]/30 rounded-xl p-4 flex items-start gap-3">
      <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
        <Image
          src={section.image_url}
          alt={section.image_alt || "Zdjęcie sekcji"}
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
          Zdjęcie kontekstowe
        </p>
        <input
          type="text"
          value={section.image_alt}
          onChange={(e) => onAltChange(e.target.value)}
          placeholder="Opis alternatywny (dla SEO i czytników ekranu)"
          maxLength={200}
          className={inputClass}
        />
        <input
          type="text"
          value={section.caption ?? ""}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Podpis pod zdjęciem (opcjonalny)"
          maxLength={200}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <IconBtn label="W górę" onClick={onMoveUp ?? (() => {})} disabled={!onMoveUp}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </IconBtn>
        <IconBtn label="W dół" onClick={onMoveDown ?? (() => {})} disabled={!onMoveDown}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </IconBtn>
        <IconBtn label="Usuń" onClick={onRemove} danger>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
          </svg>
        </IconBtn>
      </div>
    </div>
  );
}

// Cienki przycisk wstawiający zdjęcie między sekcjami. Ukrywa się gdy brak
// hover-u (po hover na container). Klik otwiera file picker.
function InsertImageButton({
  uploading,
  onUpload,
}: {
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <label className="block py-1 group cursor-pointer">
      <span className="flex items-center justify-center gap-2 py-1.5 text-xs font-sans uppercase tracking-widest text-[var(--muted)] opacity-40 group-hover:opacity-100 transition-opacity border-y border-dashed border-transparent group-hover:border-[var(--color-gold)]/50">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        {uploading ? "Wgrywam…" : "+ Wstaw zdjęcie tutaj"}
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
      </span>
    </label>
  );
}
