"use client";

import type { ProductVariants } from "@/app/_lib/types";
import { isOptionValueAvailable } from "@/app/_lib/variants";

type Props = {
  variants: ProductVariants;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // Produkt potrzebny do sprawdzania dostępności kombinacji
  product: Parameters<typeof isOptionValueAvailable>[0];
};

export default function VariantSelector({
  variants,
  selected,
  onChange,
  product,
}: Props) {
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
                const available = isOptionValueAvailable(
                  product,
                  option.name,
                  v,
                  selected
                );
                const isActive = current === v;
                return (
                  <button
                    key={v}
                    onClick={() => pick(option.name, v)}
                    disabled={!available && !isActive}
                    title={!available ? "Niedostępne dla bieżącego wyboru" : undefined}
                    className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                      isActive
                        ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                        : available
                        ? "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                        : "border-[var(--border)] text-[var(--muted)] line-through opacity-50 cursor-not-allowed"
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
