"use client";

import LocalizedLink from "./LocalizedLink";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { SizeOption } from "@/app/_lib/size-groups";

// Selektor rozmiaru: chipy w stylu VariantSelector. Bieżący rozmiar = podświetlony
// nieklikalny span; pozostałe = linki do /produkt/{id} (LocalizedLink zachowuje /de).
// Self-guard: < 2 opcji → nic nie renderuje.
export default function SizeSelector({ options }: { options: SizeOption[] }) {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  if (options.length < 2) return null;

  return (
    <div>
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
        {t.product.sizeLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) =>
          opt.current ? (
            <span
              key={opt.id}
              aria-current="true"
              className="px-4 py-2 text-sm font-sans rounded-full border border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            >
              {opt.label}
            </span>
          ) : (
            <LocalizedLink
              key={opt.id}
              href={`/produkt/${opt.id}`}
              className="px-4 py-2 text-sm font-sans rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] transition-colors"
            >
              {opt.label}
            </LocalizedLink>
          )
        )}
      </div>
    </div>
  );
}
