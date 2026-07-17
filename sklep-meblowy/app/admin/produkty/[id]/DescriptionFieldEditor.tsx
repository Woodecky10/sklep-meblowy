// app/admin/produkty/[id]/DescriptionFieldEditor.tsx
"use client";

import { useState, useTransition } from "react";
import { updateProductDescription, uploadProductImage } from "../actions";
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
import { CollapsibleSection, type Toast } from "./_shared";

// Pojedynczy opis produktu (PL). Renderuje sie na karcie TYLKO gdy produkt nie
// ma sekcji opisu (fallback) — stad hint. Ma wlasny zapis (jak zdjecia/sekcje/
// warianty); updateProductBasics tego pola nie dotyka.
export default function DescriptionFieldEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: string;
  onToast: (t: Toast) => void;
}) {
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, startSave] = useTransition();
  const dirty = value !== baseline;

  function save() {
    startSave(async () => {
      const res = await updateProductDescription(productId, value);
      if (res.ok) {
        setBaseline(value);
        onToast({ type: "success", message: res.message ?? "Zapisano opis" });
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <CollapsibleSection title="Opis produktu" storageKey="opis" bodyClassName="flex flex-col gap-4">
      {/* CollapsibleSection nie przekazuje dowolnych atrybutów do <section>,
          więc jednostka guarda opakowuje bezpośrednio całą zawartość. */}
      <div data-guard-section className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        Pokazywany na karcie produktu <strong>tylko gdy nie dodasz sekcji opisu
        poniżej</strong>. Jeśli używasz sekcji, to pole jest ignorowane.
      </p>

      <RichTextEditor
        value={value}
        onChange={setValue}
        ariaLabel="Opis produktu"
        placeholder="Napisz opis — użyj paska do pogrubień, list i nagłówków."
        enableImage
        uploadImage={async (file) => {
          const fd = new FormData();
          fd.set("image", file, file.name);
          const res = await uploadProductImage(fd);
          return res.ok ? ((res.data as { url: string } | undefined)?.url ?? null) : null;
        }}
      />

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          {dirty ? "Masz niezapisane zmiany." : "Opis zapisany."}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          aria-busy={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz opis"}
        </button>
      </div>
      </div>
    </CollapsibleSection>
  );
}
