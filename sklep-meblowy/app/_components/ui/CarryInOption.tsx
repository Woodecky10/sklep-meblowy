"use client";

import { CARRY_IN_PRICE } from "@/app/_lib/carry-in";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

// Pole „Wniesienie mebli" (spec 2026-10-06) — domyślnie odznaczone, nie
// blokuje dodania do koszyka. Stan trzyma rodzic w variantValues (setCarryIn).
// Zwykły <label> wokół checkboxa jest tu celowy: klik w napis ma przełączać
// pole (to nie widżet złożony z pułapki `Field` w panelu).
export default function CarryInOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none rounded-2xl border border-[var(--border)] px-4 py-3 hover:border-[var(--color-gold)] has-[:checked]:border-[var(--color-gold)] transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--color-gold)]"
      />
      <span className="flex-1 font-sans text-sm text-[var(--fg)]">{t.product.carryInLabel}</span>
      <span className="font-sans text-sm font-semibold text-[var(--fg)]">
        +{formatMoney(CARRY_IN_PRICE, locale, rate)}
      </span>
    </label>
  );
}
