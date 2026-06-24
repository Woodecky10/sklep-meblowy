"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { updateProductDescriptionSections, uploadProductImage } from "../actions";
import type { ProductDescriptionSection } from "@/app/_lib/types";
import { compressIfNeeded, IconBtn, inputClass, type Toast } from "./_shared";
import RichTextEditor from "./RichTextEditor";

// Sekcja + stabilne lokalne id (klucz Reacta). Id NIE jest częścią danych
// zapisywanych do DB — służy tylko do identyfikacji wiersza w UI.
type SectionRow = { id: string; data: ProductDescriptionSection };

// Edytor sekcji opisu produktu:
// - Sekcje text (z importu) są read-only — admin widzi pierwsze 80 znaków preview
// - Sekcje image (admin) — pełna edycja: alt, caption, usuń, move up/down
// - Między każdą parą sekcji przycisk "+ Dodaj zdjęcie" wstawia image section
//
// Wszystkie sekcje opisu (tekst i obrazy) są w pełni zarządzane tutaj,
// ręcznie przez admina.
export default function DescriptionSectionsEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: ProductDescriptionSection[];
  onToast: (t: Toast) => void;
}) {
  // Sekcje jako {id, data} — id to STABILNY klucz Reacta (audyt LOW #18).
  // Z key={idx} stan `expanded` w wierszu przyklejał się do POZYCJI: po
  // reorderze/insercie rozwinięcie wędrowało na inną sekcję. Id wędruje razem
  // z danymi, więc UI-stan podąża za treścią. Id NIE trafia do payloadu zapisu.
  const [rows, setRows] = useState<SectionRow[]>(() =>
    initial.map((data, i) => ({ id: `init-${i}`, data }))
  );
  const nextIdRef = useRef(0);
  function newId() {
    nextIdRef.current += 1;
    return `new-${nextIdRef.current}`;
  }

  // Baseline ostatnio zapisanego stanu — resetowany na DOKŁADNIE wysłany
  // payload po sukcesie. Inaczej dirty zostaje true na zawsze: kolumna JSONB
  // normalizuje kolejność kluczy → round-trip nie wraca do równości z initial
  // (audyt 2026-06-11 MED).
  const [baseline, setBaseline] = useState<ProductDescriptionSection[]>(initial);
  const [saving, startSaveTransition] = useTransition();
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const sections = rows.map((r) => r.data);
  const dirty = useMemo(
    () => JSON.stringify(rows.map((r) => r.data)) !== JSON.stringify(baseline),
    [rows, baseline]
  );

  function patchSection(idx: number, patch: Partial<ProductDescriptionSection>) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, data: { ...r.data, ...patch } as ProductDescriptionSection }
          : r
      )
    );
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function removeSection(idx: number) {
    if (!window.confirm("Usunąć tę sekcję?")) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // Wstawia nową pustą custom text sekcję (admin może edytować inline).
  // admin_custom=true sprawia że merge logic NIE próbuje match-ować jej
  // do BL — sekcja przeżywa kolejne sync.
  function insertCustomTextAt(insertIdx: number) {
    const newText: ProductDescriptionSection = {
      kind: "text",
      title: "",
      body: "",
      admin_custom: true,
    };
    setRows((prev) => {
      const next = prev.slice();
      next.splice(insertIdx, 0, { id: newId(), data: newText });
      return next;
    });
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
      setRows((prev) => {
        const next = prev.slice();
        next.splice(insertIdx, 0, { id: newId(), data: newImage });
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
    const payload = rows.map((r) => r.data);
    startSaveTransition(async () => {
      const res = await updateProductDescriptionSections(productId, payload);
      if (res.ok) {
        // Reset baseline na wysłany payload → dirty wraca do false
        // (banner „niezapisane zmiany" i przycisk „Zapisz sekcje" znikają).
        setBaseline(payload);
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
          Wszystkie sekcje opisu są zarządzane <strong>tutaj</strong>.
          Sekcje pochodzące z dawnego importu możesz <strong>nadpisać</strong>
          (przycisk „Edytuj override”) albo ukryć.
          <br />
          Nowe treści dodajesz przyciskami „+ Własna sekcja” (tekst) i „+ Zdjęcie”.
        </p>
      </div>

      <div className="flex flex-col">
        {/* Insert button na samej górze */}
        <InsertSectionButton
          uploading={uploadingIdx === 0}
          onUploadImage={(file) => insertImageAt(0, file)}
          onAddCustomText={() => insertCustomTextAt(0)}
        />

        {rows.map((row, idx) => {
          const s = row.data;
          return (
          <div key={row.id}>
            {s.kind === "text" ? (
              <TextSectionRow
                section={s}
                onAdminTitleChange={(v) =>
                  patchSection(idx, {
                    admin_title: v.trim() === "" ? undefined : v,
                  } as Partial<ProductDescriptionSection>)
                }
                onAdminBodyChange={(v) =>
                  patchSection(idx, {
                    admin_body: v.trim() === "" ? undefined : v,
                  } as Partial<ProductDescriptionSection>)
                }
                onToggleHidden={(v) =>
                  patchSection(idx, {
                    // Trzymamy explicit boolean (true/false), nie undefined.
                    // Bo gdy admin un-hide (true → false), merge logic
                    // potrzebuje wiedzieć że admin nadal "ma kontrolę" nad
                    // sekcją — żeby nie dropować jej przy kolejnych zmianach.
                    hidden: v,
                  } as Partial<ProductDescriptionSection>)
                }
                onTitleChange={(v) =>
                  patchSection(idx, { title: v } as Partial<ProductDescriptionSection>)
                }
                onBodyChange={(v) =>
                  patchSection(idx, { body: v } as Partial<ProductDescriptionSection>)
                }
                onRemove={s.admin_custom ? () => removeSection(idx) : undefined}
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
            <InsertSectionButton
              uploading={uploadingIdx === idx + 1}
              onUploadImage={(file) => insertImageAt(idx + 1, file)}
              onAddCustomText={() => insertCustomTextAt(idx + 1)}
            />
          </div>
          );
        })}

        {sections.length === 0 && (
          <p className="text-sm text-[var(--muted)] italic py-6 text-center">
            Brak sekcji opisu. Dodaj własną sekcję tekstową lub zdjęcie
            przyciskiem powyżej.
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
  onAdminTitleChange,
  onAdminBodyChange,
  onToggleHidden,
  onTitleChange,
  onBodyChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: Extract<ProductDescriptionSection, { kind: "text" }>;
  onAdminTitleChange: (v: string) => void;
  onAdminBodyChange: (v: string) => void;
  onToggleHidden: (v: boolean) => void;
  // Dla admin_custom sekcji edytujemy title/body bezpośrednio (nie przez
  // override) — bo nie ma źródłowej treści do nadpisania. Dla sekcji z importu
  // te callbacki nie są używane.
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  // onRemove obecne tylko dla admin_custom sekcji — sekcji z importu nie można
  // usunąć (istnieją trwale). Można je tylko ukryć (hidden=true).
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  // Override = admin coś realnie ustawił. Pomijamy whitespace-only stringi
  // (puste / same spacje nie są realnym override). hidden=true liczy się jako
  // "admin tknął" — patrz onToggleHidden i merge logic.
  const hasTitleOverride = (section.admin_title?.trim().length ?? 0) > 0;
  const hasBodyOverride = (section.admin_body?.trim().length ?? 0) > 0;
  const hasOverride = hasTitleOverride || hasBodyOverride || section.hidden === true;

  // Expand kontroli override gdy admin już coś nadpisał — wtedy widzi
  // wszystkie pola od razu. Inaczej trzeba kliknąć "Edytuj override".
  // UWAGA: hook musi być PRZED wczesnym returnem admin_custom — sekcje są
  // renderowane z key={idx}, więc ta sama instancja komponentu może przejść
  // z BL-sekcji na custom (np. po wstawieniu sekcji wyżej) i odwrotnie;
  // hook za returnem = "Rendered fewer/more hooks" crash.
  const [expanded, setExpanded] = useState(hasOverride);

  // Admin custom sekcja — render zupełnie inny (inline editable inputs)
  if (section.admin_custom) {
    return (
      <CustomTextSectionRow
        section={section}
        onTitleChange={onTitleChange}
        onBodyChange={onBodyChange}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );
  }

  const effectiveTitle = section.admin_title?.trim() || section.title;
  const effectiveBody = hasBodyOverride
    ? (section.admin_body as string)
    : section.body;

  return (
    <div
      className={`bg-[var(--bg)] border rounded-xl p-4 flex flex-col gap-3 ${
        section.hidden
          ? "border-red-300 dark:border-red-800 opacity-60"
          : hasOverride
            ? "border-[var(--color-gold)]/50"
            : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-[var(--color-navy)]/10 dark:bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-navy)] dark:text-[var(--color-gold)]">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="14" y2="18" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-semibold text-[var(--fg)]">
            {effectiveTitle}
            {hasTitleOverride && (
              <span className="ml-2 text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
                (tytuł override)
              </span>
            )}
            {hasBodyOverride && (
              <span className="ml-2 text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
                (treść override)
              </span>
            )}
            {section.hidden === true && (
              <span className="ml-2 text-[10px] font-sans uppercase tracking-widest text-red-500">
                (ukryta)
              </span>
            )}
          </p>
          <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">
            {effectiveBody
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 120)}
            {effectiveBody.length > 120 ? "…" : ""}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)]">
              {hasOverride ? "Nadpisana przez admina" : "Z importu — edytuj przez override"}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline"
            >
              {expanded ? "Zwiń" : "Edytuj override"}
            </button>
          </div>
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

      {expanded && (
        <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-3">
          <div>
            <label className="block text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
              Nadpisz tytuł (zostaw puste = z importu)
            </label>
            <input
              type="text"
              value={section.admin_title ?? ""}
              onChange={(e) => onAdminTitleChange(e.target.value)}
              placeholder={section.title}
              maxLength={120}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
              Nadpisz treść (zostaw puste = z importu).
            </label>
            <RichTextEditor
              value={section.admin_body ?? ""}
              onChange={onAdminBodyChange}
              ariaLabel="Nadpisz treść sekcji"
              placeholder={section.body.slice(0, 80) || "Wpisz treść, by nadpisać import"}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--fg)] cursor-pointer">
            <input
              type="checkbox"
              checked={section.hidden === true}
              onChange={(e) => onToggleHidden(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-gold)]"
            />
            Ukryj sekcję na karcie produktu (nie pokazuj klientom)
          </label>
        </div>
      )}
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

// Inline editable text section (admin custom) — admin pisze title i body
// bezpośrednio, bez override panel. Sekcja jest niezależna od importu.
function CustomTextSectionRow({
  section,
  onTitleChange,
  onBodyChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: Extract<ProductDescriptionSection, { kind: "text" }>;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--color-gold)]/30 rounded-xl p-4 flex items-start gap-3">
      <div className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-[var(--color-gold)]/10 flex items-center justify-center text-[var(--color-gold)]">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
          Własna sekcja (twoja)
        </p>
        <input
          type="text"
          value={section.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Tytuł sekcji (np. „Dostępne tkaniny”)"
          maxLength={120}
          className={inputClass}
        />
        <RichTextEditor
          value={section.body}
          onChange={onBodyChange}
          ariaLabel="Treść własnej sekcji opisu"
          placeholder="Napisz opis — użyj paska do pogrubień, list i nagłówków."
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
        {onRemove && (
          <IconBtn label="Usuń" onClick={onRemove} danger>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            </svg>
          </IconBtn>
        )}
      </div>
    </div>
  );
}

// Cienki przycisk wstawiający NOWĄ sekcję między istniejące. Po hover
// pokazuje 2 opcje: Zdjęcie kontekstowe lub Własna sekcja tekstowa.
function InsertSectionButton({
  uploading,
  onUploadImage,
  onAddCustomText,
}: {
  uploading: boolean;
  onUploadImage: (file: File) => void;
  onAddCustomText: () => void;
}) {
  return (
    <div className="py-1 group">
      <div className="flex items-center justify-center gap-3 py-1.5 opacity-40 group-hover:opacity-100 transition-opacity border-y border-dashed border-transparent group-hover:border-[var(--color-gold)]/50">
        <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {uploading ? "Wgrywam…" : "+ Zdjęcie"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUploadImage(f);
            }}
            className="hidden"
          />
        </label>
        <span className="text-[var(--muted)] opacity-50">·</span>
        <button
          type="button"
          onClick={onAddCustomText}
          className="inline-flex items-center gap-1.5 text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="14" y2="18" />
          </svg>
          + Własna sekcja
        </button>
      </div>
    </div>
  );
}
