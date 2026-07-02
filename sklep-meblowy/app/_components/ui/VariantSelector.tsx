"use client";

import { useState } from "react";
import type { Product, ProductVariants } from "@/app/_lib/types";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "@/app/_lib/de-content-maps";
import type { Locale } from "@/app/_lib/i18n";
import { useFabricLabels, useFabricImages } from "@/app/_lib/fabric-context";
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
  const fabricImages = useFabricImages();
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
            {option.name === FABRIC_OPTION_NAME ? (
              <FabricSwatchGroup
                values={option.values}
                current={current}
                valuePrices={option.value_prices}
                images={fabricImages}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : (
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// Ile próbek pokazać zanim „Zobacz więcej" (jak na referencji dealmeble).
const SWATCH_LIMIT = 5;

// Opcja „Tkanina" jako okrągłe próbki ze zdjęciem + podpis + cena. Po SWATCH_LIMIT
// kafelek „Zobacz więcej (+N)" rozwija resztę w miejscu; po rozwinięciu ten sam
// kafelek staje się „Zobacz mniej" i zwija listę z powrotem.
function FabricSwatchGroup({
  values,
  current,
  valuePrices,
  images,
  labelOf,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  images: Record<string, string>;
  labelOf: (v: string) => string;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? values : values.slice(0, SWATCH_LIMIT);
  const hidden = values.length - shown.length;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {shown.map((v) => {
        const active = current === v;
        const img = images[v];
        const surcharge = valuePrices?.[v] ?? 0;
        const label = labelOf(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            aria-pressed={active}
            className="flex flex-col items-center gap-1.5 text-center group"
          >
            <span
              className={`relative w-16 h-16 rounded-full overflow-hidden border-2 transition-colors ${
                active
                  ? "border-[var(--color-gold)]"
                  : "border-[var(--border)] group-hover:border-[var(--color-gold)]"
              }`}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt={label} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-[var(--bg)] text-[10px] text-[var(--muted)]">
                  {v.split(" ").pop()}
                </span>
              )}
            </span>
            <span
              className={`text-xs leading-tight ${
                active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
              }`}
            >
              {label}
            </span>
            <span className="text-[11px] text-[var(--muted)]">
              {surcharge > 0 ? `+${formatMoney(surcharge, locale, rate)}` : formatMoney(0, locale, rate)}
            </span>
          </button>
        );
      })}
      {values.length > SWATCH_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex flex-col items-center justify-center gap-0.5 min-h-[4rem] p-2 rounded-2xl border border-[var(--border)] text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
        >
          <span className="text-xs font-sans">
            {expanded
              ? locale === "de" ? "Weniger anzeigen" : "Zobacz mniej"
              : locale === "de" ? "Mehr anzeigen" : "Zobacz więcej"}
          </span>
          {!expanded && <span className="text-[11px] text-[var(--muted)]">(+{hidden})</span>}
        </button>
      )}
    </div>
  );
}
