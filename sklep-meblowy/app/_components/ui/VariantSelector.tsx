"use client";

import type { ProductVariants } from "@/app/_lib/types";

type Props = {
  variants: ProductVariants;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // product zostawiamy w propsach dla kompatybilności — nie jest już używany
  // do sprawdzania dostępności (brak limitów sztuk).
  product?: unknown;
};

export default function VariantSelector({ variants, selected, onChange }: Props) {
  function pick(name: string, value: string) {
    onChange({ ...selected, [name]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      {variants.options.map((option) => {
        const current = selected[option.name];
        return (
          <div key={option.name}>
            <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
              {option.name}:{" "}
              <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">
                {current ?? <span className="text-[var(--muted)]">wybierz</span>}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((v) => {
                const isActive = current === v;
                return (
                  <button
                    key={v}
                    onClick={() => pick(option.name, v)}
                    className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                      isActive
                        ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                        : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
