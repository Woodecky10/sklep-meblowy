"use client";

import type { Product, ProductVariants } from "@/app/_lib/types";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "@/app/_lib/de-content-maps";
import type { Locale } from "@/app/_lib/i18n";
import { useFabricLabels } from "@/app/_lib/fabric-context";
import { FABRIC_OPTION_NAME } from "@/app/_lib/variants";
import { useEurRate } from "@/app/_lib/rate-context";
import { formatMoney } from "@/app/_lib/money";

type Props = {
  variants: ProductVariants;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // Opcjonalnie produkt — z niego bierzemy override-y nazw opcji/wartości.
  product?: Product;
};

// Override admina → potem (na DE) ręczna mapa tłumaczeń; kody/wymiary bez zmian.
function getOptionName(p: Product | undefined, optionName: string, locale: Locale): string {
  const raw = p?.variants?.overrides?.option_names?.[optionName] ?? optionName;
  return locale === "de" ? mapDe(VARIANT_OPTION_DE, raw) ?? raw : raw;
}

function getValueLabel(
  p: Product | undefined,
  optionName: string,
  value: string,
  locale: Locale,
  fabricMap: Record<string, string>
): string {
  const raw = p?.variants?.overrides?.value_labels?.[optionName]?.[value] ?? value;
  if (locale !== "de") return raw;
  if (optionName === FABRIC_OPTION_NAME && fabricMap[raw]) return fabricMap[raw];
  return mapDe(VARIANT_VALUE_DE, raw) ?? raw;
}

export default function VariantSelector({
  variants,
  selected,
  onChange,
  product,
}: Props) {
  const locale = useClientLocale();
  const fabricMap = useFabricLabels();
  const rate = useEurRate();
  function pick(name: string, value: string) {
    onChange({ ...selected, [name]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      {variants.options.map((option) => {
        const current = selected[option.name];
        const displayName = getOptionName(product, option.name, locale);
        return (
          <div key={option.name}>
            <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
              {displayName}:{" "}
              <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">
                {current ? (
                  getValueLabel(product, option.name, current, locale, fabricMap)
                ) : (
                  <span className="text-[var(--muted)]">{locale === "de" ? "wählen" : "wybierz"}</span>
                )}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {option.values.map((v) => {
                const isActive = current === v;
                const label = getValueLabel(product, option.name, v, locale, fabricMap);
                const surcharge = option.value_prices?.[v] ?? 0;
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
                    {surcharge !== 0 && (
                      <span className={isActive ? "opacity-80" : "text-[var(--muted)]"}>
                        {" "}
                        ({surcharge > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(surcharge), locale, rate)})
                      </span>
                    )}
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
