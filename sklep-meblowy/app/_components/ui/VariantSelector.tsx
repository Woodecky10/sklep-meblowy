"use client";

import type { ProductVariant } from "@/app/_lib/types";

type Props = {
  variants: ProductVariant[];
  selected: string;
  onChange: (value: string) => void;
};

export default function VariantSelector({ variants, selected, onChange }: Props) {
  const groups = variants.reduce<Record<string, string[]>>((acc, v) => {
    if (!acc[v.name]) acc[v.name] = [];
    acc[v.name].push(v.value);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([name, values]) => (
        <div key={name}>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            {name}: <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">{selected}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {values.map((v) => (
              <button
                key={v}
                onClick={() => onChange(v)}
                className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                  selected === v
                    ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                    : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
