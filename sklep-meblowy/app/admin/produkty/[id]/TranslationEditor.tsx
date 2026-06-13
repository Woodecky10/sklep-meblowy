"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProductDe } from "../actions";
import { Field, inputClass, type Toast } from "./_shared";

// Surowe pola tłumaczenia DE produktu (niezlokalizowane — patrz page.tsx).
// description_sections_de NIE jest edytowane ręcznie tutaj: sekcje opisu DE
// zostają zarządzane przez auto-tłumaczenie (DeepL) — przycisk "Przetłumacz
// ponownie" je odświeża. Tu admin koryguje krótkie pola (nazwa/opis/kolor/
// materiał), które najczęściej wymagają ręcznej poprawki.
export type ProductDeFields = {
  name_de: string;
  description_de: string;
  color_de: string | null;
  material_de: string | null;
  description_sections_de: unknown;
  needs_translation: boolean;
  translated_at: string | null;
};

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

  const [saving, startSaveTransition] = useTransition();

  // Dirty względem wartości initial (po router.refresh() props się odświeżą,
  // a komponent zremountuje się — baseline wraca do świeżego DB).
  const dirty = useMemo(
    () =>
      nameDe !== initial.name_de ||
      descriptionDe !== initial.description_de ||
      colorDe !== (initial.color_de ?? "") ||
      materialDe !== (initial.material_de ?? ""),
    [nameDe, descriptionDe, colorDe, materialDe, initial]
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
            <strong> ręcznie</strong>. Puste pole = fallback do polskiej treści.
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
