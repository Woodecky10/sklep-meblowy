"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { saveProductDe } from "../actions";
import type { ProductDescriptionSection } from "@/app/_lib/types";
import { Field, inputClass, type Toast } from "./_shared";
import RichTextEditor from "./RichTextEditor";

// Surowe pola tłumaczenia DE produktu (niezlokalizowane — patrz page.tsx).
// Wszystkie treści DE wpisuje admin RĘCZNIE (nie ma już DeepL): krótkie pola
// (nazwa/opis/kolor/materiał) oraz sekcje opisu (tytuł+treść każdej).
// description_sections = struktura PL (źródło prawdy, do tłumaczenia),
// description_sections_de = istniejące tłumaczenie DE (do edycji).
export type ProductDeFields = {
  name_de: string;
  description_de: string;
  color_de: string | null;
  material_de: string | null;
  // Sekcje PL — struktura referencyjna (read-only w edytorze DE).
  description_sections: ProductDescriptionSection[];
  // Sekcje DE — istniejące tłumaczenie (pełna tablica jak PL) lub null.
  description_sections_de: ProductDescriptionSection[] | null;
  needs_translation: boolean;
  translated_at: string | null;
};

// Buduje początkową tablicę sekcji DE przez ZIPOWANIE z sekcjami PL po
// indeksie. PL jest źródłem prawdy struktury — wynik ma DOKŁADNIE tyle
// sekcji co PL, każda tego samego `kind`, z tym samym `image_url`/flagami.
// Pola tłumaczalne (title/body/image_alt/caption) bierzemy z istniejącego
// DE gdy jest pod tym indeksem i ma zgodny kind, inaczej zostają PUSTE
// (admin je wpisze). Storefront /de podmienia CAŁĄ tablicę sekcji na tę
// (localizeProduct), więc musi być kompletna i renderowalna — nie diff.
function buildDeSections(
  pl: ProductDescriptionSection[],
  de: ProductDescriptionSection[] | null
): ProductDescriptionSection[] {
  return pl.map((plSection, i) => {
    const deSection = de?.[i];
    const deMatches = deSection?.kind === plSection.kind ? deSection : undefined;
    if (plSection.kind === "text") {
      const deText = deMatches as
        | Extract<ProductDescriptionSection, { kind: "text" }>
        | undefined;
      // WAŻNE: na /de localizeProduct podmienia CAŁĄ tablicę sekcji na tę,
      // a render produktu (page.tsx) liczy tytuł/treść jako
      //   title = admin_title?.trim() || title
      //   body  = admin_body (gdy niepuste) || body
      // Dlatego DE tytuł/treść muszą iść do title/body, a admin_title/
      // admin_body PL NIE mogą tu trafić (przesłoniłyby niemiecki tekst).
      // Zachowujemy tylko hidden (sekcja ukryta w PL ma być ukryta i na /de)
      // oraz admin_custom (nieszkodliwa flaga pochodzenia).
      const out: Extract<ProductDescriptionSection, { kind: "text" }> = {
        kind: "text",
        title: deText?.title ?? "",
        body: deText?.body ?? "",
      };
      if (plSection.hidden !== undefined) out.hidden = plSection.hidden;
      if (plSection.admin_custom !== undefined)
        out.admin_custom = plSection.admin_custom;
      return out;
    }
    const deImage = deMatches as
      | Extract<ProductDescriptionSection, { kind: "image" }>
      | undefined;
    // image_url zostaje z PL (nietłumaczone). Tłumaczymy alt/caption.
    const out: Extract<ProductDescriptionSection, { kind: "image" }> = {
      kind: "image",
      image_url: plSection.image_url,
      image_alt: deImage?.image_alt ?? "",
    };
    const caption = deImage?.caption ?? "";
    if (caption !== "") out.caption = caption;
    return out;
  });
}

// Tekst PL widoczny w sklepie = admin_title ?? title / admin_body ?? body.
// To go pokazujemy adminowi jako referencję do tłumaczenia.
function plText(section: Extract<ProductDescriptionSection, { kind: "text" }>) {
  return {
    title: section.admin_title ?? section.title,
    body: section.admin_body ?? section.body,
  };
}

// Edytor tłumaczenia niemieckiego (DE) produktu. Prop-driven (initial z DB),
// toast przez callback (jak DescriptionSectionsEditor). Panel zostaje w PL.
export default function TranslationEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: ProductDeFields;
  onToast: (t: Toast) => void;
}) {
  const router = useRouter();
  const [nameDe, setNameDe] = useState(initial.name_de);
  const [descriptionDe, setDescriptionDe] = useState(initial.description_de);
  const [colorDe, setColorDe] = useState(initial.color_de ?? "");
  const [materialDe, setMaterialDe] = useState(initial.material_de ?? "");

  const plSections = initial.description_sections;
  const hasSections = plSections.length > 0;

  // Stan sekcji DE — pełna tablica mirrorująca PL (zip-by-index). Pola
  // tłumaczalne wypełnione z DE gdy są, inaczej puste.
  const initialDeSections = useMemo(
    () => buildDeSections(plSections, initial.description_sections_de),
    [plSections, initial.description_sections_de]
  );
  const [deSections, setDeSections] =
    useState<ProductDescriptionSection[]>(initialDeSections);

  const [saving, startSaveTransition] = useTransition();

  function patchSection(idx: number, patch: Partial<ProductDescriptionSection>) {
    setDeSections((prev) =>
      prev.map((s, i) =>
        i === idx ? ({ ...s, ...patch } as ProductDescriptionSection) : s
      )
    );
  }

  // Dirty względem wartości initial (po router.refresh() props się odświeżą,
  // a komponent zremountuje się — baseline wraca do świeżego DB). Sekcje
  // porównujemy strukturalnie do zbudowanego baseline (initialDeSections).
  const dirty = useMemo(
    () =>
      nameDe !== initial.name_de ||
      descriptionDe !== initial.description_de ||
      colorDe !== (initial.color_de ?? "") ||
      materialDe !== (initial.material_de ?? "") ||
      JSON.stringify(deSections) !== JSON.stringify(initialDeSections),
    [
      nameDe,
      descriptionDe,
      colorDe,
      materialDe,
      deSections,
      initialDeSections,
      initial,
    ]
  );

  const translatedAtLabel = initial.translated_at
    ? new Date(initial.translated_at).toLocaleString("pl-PL", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

  function save() {
    startSaveTransition(async () => {
      const res = await saveProductDe(productId, {
        name_de: nameDe,
        description_de: descriptionDe,
        color_de: colorDe.trim() === "" ? null : colorDe,
        material_de: materialDe.trim() === "" ? null : materialDe,
        // Tylko gdy produkt ma sekcje — inaczej nie ruszamy kolumny.
        ...(hasSections ? { description_sections_de: deSections } : {}),
      });
      if (res.ok) {
        onToast({ type: "success", message: res.message ?? "Zapisano tłumaczenie DE" });
        // Odśwież server component → świeże initial (status badge, baseline).
        router.refresh();
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
            Tłumaczenie niemieckie (DE)
          </h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
            Treść pokazywana klientom w niemieckiej wersji sklepu. Wpisz ją
            <strong> ręcznie</strong> — także sekcje opisu (po lewej polska treść
            jako wzór do tłumaczenia). Puste pole = fallback do polskiej treści.
          </p>
        </div>
        {/* Status badge */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {initial.needs_translation ? (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
              DE: oczekuje na tłumaczenie
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-[10px] font-sans uppercase tracking-widest bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
              DE: przetłumaczone
            </span>
          )}
          {translatedAtLabel && (
            <span className="text-[11px] text-[var(--muted)]">
              ostatnio: {translatedAtLabel}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nazwa (DE)" className="md:col-span-2">
          <input
            value={nameDe}
            onChange={(e) => setNameDe(e.target.value)}
            maxLength={300}
            placeholder="Niemiecka nazwa produktu"
            className={inputClass}
          />
        </Field>

        <Field label="Opis (DE)" className="md:col-span-2" hint="HTML dozwolony (jak w polskim opisie).">
          <textarea
            value={descriptionDe}
            onChange={(e) => setDescriptionDe(e.target.value)}
            rows={6}
            placeholder="Niemiecki opis produktu"
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="Kolor (DE)">
          <input
            value={colorDe}
            onChange={(e) => setColorDe(e.target.value)}
            maxLength={100}
            placeholder="np. Beige"
            className={inputClass}
          />
        </Field>

        <Field label="Materiał (DE)">
          <input
            value={materialDe}
            onChange={(e) => setMaterialDe(e.target.value)}
            maxLength={100}
            placeholder="np. Samt"
            className={inputClass}
          />
        </Field>
      </div>

      {/* Sekcje opisu (DE) — renderowane tylko gdy produkt ma sekcje PL.
          Dla każdej sekcji PL pokazujemy treść PL jako referencję (read-only)
          obok edytowalnych pól DE. */}
      {hasSections && (
        <div className="flex flex-col gap-3 pt-2 border-t border-[var(--border)]">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--fg)]">
              Sekcje opisu (DE)
            </h3>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
              Każdej sekcji polskiej (po lewej) odpowiada pole niemieckie (po
              prawej). Przetłumacz ręcznie tytuł i treść. Puste pole = w
              niemieckim sklepie pokaże się polska treść tej sekcji.
            </p>
          </div>

          {plSections.map((plSection, idx) => {
            const deSection = deSections[idx];
            if (!deSection) return null;
            return (
              <div
                key={idx}
                className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3"
              >
                <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)]">
                  Sekcja {idx + 1} ·{" "}
                  {plSection.kind === "text" ? "tekst" : "zdjęcie"}
                </p>
                {plSection.kind === "text" && deSection.kind === "text" ? (
                  <TextSectionTranslator
                    pl={plText(plSection)}
                    de={deSection}
                    onTitleChange={(v) => patchSection(idx, { title: v })}
                    onBodyChange={(v) => patchSection(idx, { body: v })}
                  />
                ) : plSection.kind === "image" && deSection.kind === "image" ? (
                  <ImageSectionTranslator
                    pl={plSection}
                    de={deSection}
                    onAltChange={(v) => patchSection(idx, { image_alt: v })}
                    onCaptionChange={(v) =>
                      patchSection(idx, {
                        caption: v.trim() === "" ? undefined : v,
                      })
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-4 pt-2 border-t border-[var(--border)] flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz tłumaczenie DE"}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Sub-komponenty: jedna sekcja PL (referencja) + pola DE (edycja)
// ============================================================

function TextSectionTranslator({
  pl,
  de,
  onTitleChange,
  onBodyChange,
}: {
  pl: { title: string; body: string };
  de: Extract<ProductDescriptionSection, { kind: "text" }>;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* PL — referencja (read-only) */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)]">
          Polski (wzór)
        </span>
        <p className="text-sm font-semibold text-[var(--fg)]/80">
          {pl.title || <span className="italic text-[var(--muted)]">(brak tytułu)</span>}
        </p>
        <div className="text-xs text-[var(--muted)] leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {pl.body || <span className="italic">(brak treści)</span>}
        </div>
      </div>

      {/* DE — edycja */}
      <div className="flex flex-col gap-3">
        <Field label="Tytuł (DE)">
          <input
            value={de.title}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={120}
            placeholder="Niemiecki tytuł sekcji"
            className={inputClass}
          />
        </Field>
        <Field label="Treść (DE)" hint="Formatuj paskiem — jak w polskiej treści.">
          <RichTextEditor
            value={de.body}
            onChange={onBodyChange}
            ariaLabel="Niemiecka treść sekcji"
            placeholder="Niemiecka treść sekcji"
          />
        </Field>
      </div>
    </div>
  );
}

function ImageSectionTranslator({
  pl,
  de,
  onAltChange,
  onCaptionChange,
}: {
  pl: Extract<ProductDescriptionSection, { kind: "image" }>;
  de: Extract<ProductDescriptionSection, { kind: "image" }>;
  onAltChange: (v: string) => void;
  onCaptionChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* PL — referencja (zdjęcie + alt/caption, read-only) */}
      <div className="flex gap-3">
        <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
          <Image
            src={pl.image_url}
            alt={pl.image_alt || "Zdjęcie sekcji"}
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)]">
            Polski (wzór)
          </span>
          <p className="text-xs text-[var(--fg)]/80 break-words">
            alt: {pl.image_alt || <span className="italic text-[var(--muted)]">(brak)</span>}
          </p>
          <p className="text-xs text-[var(--muted)] break-words">
            podpis: {pl.caption || <span className="italic">(brak)</span>}
          </p>
        </div>
      </div>

      {/* DE — edycja (zdjęcie i flagi nietłumaczone) */}
      <div className="flex flex-col gap-3">
        <Field label="Opis alternatywny (DE)" hint="Dla SEO i czytników ekranu.">
          <input
            value={de.image_alt}
            onChange={(e) => onAltChange(e.target.value)}
            maxLength={200}
            placeholder="Niemiecki opis alternatywny"
            className={inputClass}
          />
        </Field>
        <Field label="Podpis (DE)">
          <input
            value={de.caption ?? ""}
            onChange={(e) => onCaptionChange(e.target.value)}
            maxLength={200}
            placeholder="Niemiecki podpis (opcjonalny)"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
