"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  filterGroups,
  sortGroupsForContext,
  type VariantImageGroup,
} from "@/app/_lib/variant-image-suggestions";
import { inputClass } from "./_shared";

// Wybór już wgranego zdjęcia zamiast ponownego uploadu. Lista = zdjęcia
// przypisane do wartości opcji wariantów innych produktów (bez „Tkaniny",
// bez galerii) — zbiera je collectVariantImageSuggestions. Layout i klasy
// wzorowane na FabricPicker w VariantsEditor, żeby panel był spójny.
// Wybór NIE zapisuje do bazy — utrwala go przycisk zapisu sekcji, dokładnie
// jak przy uploadzie.
export default function ImagePickerModal({
  groups,
  contextOptionName,
  alreadyUsed,
  onPick,
  onCancel,
}: {
  groups: VariantImageGroup[];
  // Nazwa opcji, z której otwarto wybierak — jej grupa idzie na górę.
  contextOptionName?: string | null;
  // URL-e już obecne w docelowej liście — wyszarzone, nieklikalne.
  alreadyUsed: string[];
  onPick: (urls: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const used = useMemo(() => new Set(alreadyUsed), [alreadyUsed]);
  const visible = useMemo(
    () => filterGroups(sortGroupsForContext(groups, contextOptionName), query),
    [groups, contextOptionName, query]
  );

  function toggle(url: string) {
    setSelected((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz z wgranych (zaznaczono: {selected.length})
          </h3>
          {/* data-guard-ignore: modal renderuje się WEWNĄTRZ [data-guard-section]
              edytora wariantów, a guard traktuje każde input/change w sekcji jako
              edycję. Bez tego atrybutu samo wpisanie frazy w szukajkę (nawet po
              „Anuluj") wywoływało dialog „masz niezapisane zmiany". Nie usuwać. */}
          <input
            type="text"
            autoFocus
            data-guard-ignore
            placeholder="Szukaj…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Szukaj zdjęcia"
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl">
          {visible.length === 0 ? (
            <p className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
          ) : (
            visible.map((group) => (
              <div key={group.key}>
                <div className="p-2 bg-[var(--bg)] border-b border-[var(--border)] sticky top-0">
                  <span className="text-sm font-semibold text-[var(--fg)]">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-[var(--muted)] ml-2">
                    {group.images.length}
                  </span>
                </div>
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-3">
                  {group.images.map((img) => {
                    const isUsed = used.has(img.url);
                    const isSelected = selected.includes(img.url);
                    return (
                      <li key={img.url}>
                        <button
                          type="button"
                          onClick={() => toggle(img.url)}
                          disabled={isUsed}
                          aria-pressed={isSelected}
                          className={`w-full text-left rounded-lg border-2 p-1 transition-colors ${
                            isUsed
                              ? "border-[var(--border)] opacity-40 cursor-not-allowed"
                              : isSelected
                                ? "border-[var(--color-gold)]"
                                : "border-transparent hover:border-[var(--border)]"
                          }`}
                        >
                          <span className="relative block aspect-square rounded-md overflow-hidden bg-stone-100 dark:bg-stone-800">
                            <Image
                              src={img.url}
                              alt={`${img.value} — ${img.productName}`}
                              fill
                              sizes="96px"
                              className="object-cover"
                            />
                            {isSelected && (
                              <span className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-gold)] text-white text-xs">
                                ✓
                              </span>
                            )}
                          </span>
                          <span className="block mt-1 text-[11px] text-[var(--fg)] truncate">
                            {img.value}
                          </span>
                          <span className="block text-[10px] text-[var(--muted)] truncate">
                            {isUsed ? "już dodane" : img.productName}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
          <p className="text-[11px] text-[var(--muted)]">
            Wybór trzeba jeszcze zapisać przyciskiem zapisu sekcji.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={() => onPick(selected)}
              disabled={selected.length === 0}
              className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Dodaj wybrane ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
