"use client";

import { useState } from "react";
import type { SelectGroup } from "@/app/_lib/category-tree";
import {
  EXTRA_CATEGORIES_FIELD,
  EXTRA_CATEGORIES_PRESENT_FIELD,
} from "@/app/_lib/extra-categories";
import { Field } from "./_shared";

// Kategorie dodatkowe (spec 2026-10-15): produkt pojawia się też na listach
// tych kategorii; okruszki, feed i „podobne" zostają przy kategorii głównej.
// Checkboxy siedzą w formularzu „Podstawowe dane" i zapisują się jego
// przyciskiem. Kategoria główna jest wyłączona — wyłączony checkbox nie
// trafia do FormData, a serwer i tak ją odfiltrowuje.
export default function ExtraCategoriesField({
  groups,
  initial,
  mainCategory,
}: {
  groups: SelectGroup[];
  initial: string[];
  mainCategory: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const labels = new Map(
    groups.flatMap((g) => g.options.map((o) => [o.slug, o.label] as const))
  );
  const chosen = [...selected].filter((s) => s !== mainCategory && labels.has(s));

  function toggle(slug: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  return (
    // composite: <label> owijający całą listę zaznaczałby pierwszy checkbox
    // po kliknięciu w napis pola (pułapka z 2026-08-18).
    <Field
      label="Dodatkowe kategorie"
      composite
      className="md:col-span-2"
      hint="Produkt pojawi się też na listach tych kategorii. Okruszki, feed Google i „podobne produkty” zostają przy kategorii głównej."
    >
      <input type="hidden" name={EXTRA_CATEGORIES_PRESENT_FIELD} value="1" />
      <p className="text-sm text-[var(--fg)]">
        {chosen.length > 0
          ? `Wybrane: ${chosen.map((s) => labels.get(s)).join(", ")}`
          : "Brak — produkt widać tylko w kategorii głównej."}
      </p>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              {g.label}
            </p>
            {g.options.map((o) => {
              const isMain = o.slug === mainCategory;
              return (
                <label
                  key={o.slug}
                  className="flex items-center gap-2 py-0.5 text-sm"
                  style={{ paddingLeft: o.depth * 16 }}
                >
                  <input
                    type="checkbox"
                    name={EXTRA_CATEGORIES_FIELD}
                    value={o.slug}
                    checked={!isMain && selected.has(o.slug)}
                    disabled={isMain}
                    onChange={(e) => toggle(o.slug, e.target.checked)}
                  />
                  <span className={isMain ? "text-[var(--muted)]" : undefined}>
                    {o.label}
                    {isMain && " (kategoria główna)"}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </Field>
  );
}
