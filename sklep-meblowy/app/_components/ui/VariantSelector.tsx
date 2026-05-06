"use client";

import type { Product, ProductVariants } from "@/app/_lib/types";

type Props = {
  variants: ProductVariants;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // Opcjonalnie produkt — z niego bierzemy override-y nazw opcji/wartości.
  product?: Product;
};

function getOptionName(p: Product | undefined, optionName: string): string {
  return p?.variants?.overrides?.option_names?.[optionName] ?? optionName;
}

function getValueLabel(
  p: Product | undefined,
  optionName: string,
  value: string
): string {
  return (
    p?.variants?.overrides?.value_labels?.[optionName]?.[value] ?? value
  );
}

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
        const displayName = getOptionName(product, option.name);
        return (
          <div key={option.name}>
            <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
              {displayName}:{" "}
              <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">
                {current ? (
                  getValueLabel(product, option.name, current)
                ) : (
                  <span className="text-[var(--muted)]">wybierz</span>
                )}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((v) => {
                const isActive = current === v;
                const label = getValueLabel(product, option.name, v);
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
                    {label}
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
