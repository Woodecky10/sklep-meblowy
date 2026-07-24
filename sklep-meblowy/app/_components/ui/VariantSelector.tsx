"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product, ProductVariants } from "@/app/_lib/types";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "@/app/_lib/de-content-maps";
import { localizeHref, pickLocalized, type Locale } from "@/app/_lib/i18n";
import { useFabricLabels, useFabricImages, useFabricMeta } from "@/app/_lib/fabric-context";
import { FABRIC_OPTION_NAME, sortVariantValues, sortVariantOptions, optionHasValueImages } from "@/app/_lib/variants";
import {
  cornerSideOf,
  isCornerSideOptionName,
  orderCornerSideValues,
  type CornerSide,
} from "@/app/_lib/corner-side";
import { getDictionary } from "@/app/_lib/dictionaries";
import { useEurRate } from "@/app/_lib/rate-context";
import { formatMoney } from "@/app/_lib/money";
import { useVariantInfo } from "@/app/_lib/variant-info-context";
import { variantInfoKey, variantInfoText } from "@/app/_lib/variant-info";
import ValueInfoTip from "./ValueInfoTip";

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

// Zewnętrzny „przycisk" wartości wariantu (chip/próbka/kafelek). Natywny
// <button> nie może zawierać zagnieżdżonego <button> (ValueInfoTip) — podczas
// parsowania HTML przeglądarka zamyka zewnętrzny button na widok wewnętrznego,
// co psuje hydration (React: "cannot contain a nested <button>"). Gdy wartość
// ma tooltip informacyjny, renderujemy div[role=button] z obsługą klawiatury
// zamiast <button>; pozostałe wartości bez zmian (nadal natywny <button>).
function SwatchButton({
  hasTip,
  onClick,
  ariaPressed,
  className,
  children,
}: {
  hasTip: boolean;
  onClick: () => void;
  ariaPressed: boolean;
  className: string;
  children: ReactNode;
}) {
  if (hasTip) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={ariaPressed}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={className}
      >
        {children}
      </div>
    );
  }
  return (
    <button type="button" aria-pressed={ariaPressed} onClick={onClick} className={className}>
      {children}
    </button>
  );
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
  const t = getDictionary(locale);
  const variantInfo = useVariantInfo();
  const infoTextFor = (optionName: string, value: string) =>
    variantInfoText(variantInfo[variantInfoKey(optionName, value)], locale);
  function pick(name: string, value: string) {
    onChange({ ...selected, [name]: value });
  }

  // Kolejność opcji (kategorii wariantu) A-Z po nazwie wyświetlanej — spójnie
  // z sortowaniem wartości niżej. Nie mutuje propsa.
  const orderedOptions = sortVariantOptions(
    variants.options,
    (name) => getOptionName(product, name, locale),
    locale
  );

  return (
    <div className="flex flex-col gap-4">
      {orderedOptions.map((option) => {
        const current = selected[option.name];
        const displayName = getOptionName(product, option.name, locale);
        // Kolejność wyświetlania A-Z (naturalnie, po etykiecie). Narożniki (Strona)
        // mają własne sortowanie semantyczne w CornerSideGroup (orderCornerSideValues),
        // więc dla nich zostawiamy surową kolejność.
        const orderedValues = isCornerSideOptionName(option.name)
          ? option.values
          : sortVariantValues(
              option.values,
              (v) => getValueLabel(product, option.name, v, locale, fabricMap),
              locale
            );
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
                values={orderedValues}
                current={current}
                valuePrices={option.value_prices}
                images={fabricImages}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                infoFor={(v) => infoTextFor(option.name, v)}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : isCornerSideOptionName(option.name) ? (
              <CornerSideGroup
                values={option.values}
                current={current}
                valuePrices={option.value_prices}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                infoFor={(v) => infoTextFor(option.name, v)}
                hint={t.product.cornerSideHint}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : optionHasValueImages(option) ? (
              <ValueImageSwatchGroup
                values={orderedValues}
                current={current}
                valuePrices={option.value_prices}
                valueImages={option.value_images ?? {}}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                infoFor={(v) => infoTextFor(option.name, v)}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {orderedValues.map((v) => {
                  const isActive = current === v;
                  const label = getValueLabel(product, option.name, v, locale, fabricMap);
                  const surcharge = option.value_prices?.[v] ?? 0;
                  const info = infoTextFor(option.name, v);
                  return (
                    <SwatchButton
                      key={v}
                      hasTip={!!info}
                      onClick={() => pick(option.name, v)}
                      ariaPressed={isActive}
                      className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                        isActive
                          ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                          : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {info && <ValueInfoTip text={info} />}
                      </span>
                      {surcharge !== 0 && (
                        <span className={isActive ? "opacity-80" : "text-[var(--muted)]"}>
                          {" "}
                          ({surcharge > 0 ? "+" : "−"}
                          {formatMoney(Math.abs(surcharge), locale, rate)})
                        </span>
                      )}
                    </SwatchButton>
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

// Widok kompaktowy: pierwsze SWATCH_LIMIT próbek + „Zobacz więcej (+N)".
// Po rozwinięciu: próbki pogrupowane w rozwijane karty GRUP CENOWYCH
// (spec 2026-07-21), w karcie podsekcje per tkanina z linkiem „szczegóły"
// do /tkaniny/[slug]. Wartości spoza katalogu → karta „Pozostałe".
function FabricSwatchGroup({
  values,
  current,
  valuePrices,
  images,
  labelOf,
  infoFor,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  images: Record<string, string>;
  labelOf: (v: string) => string;
  infoFor: (value: string) => string | null;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  const meta = useFabricMeta();
  const t = getDictionary(locale);
  const [expanded, setExpanded] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);

  const swatch = (v: string) => {
    const active = current === v;
    const img = images[v];
    const surcharge = valuePrices?.[v] ?? 0;
    const label = labelOf(v);
    const info = infoFor(v);
    return (
      <SwatchButton
        key={v}
        hasTip={!!info}
        onClick={() => onPick(v)}
        ariaPressed={active}
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
          className={`text-xs leading-tight inline-flex items-center gap-1 ${
            active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
          }`}
        >
          {label}
          {info && <ValueInfoTip text={info} />}
        </span>
        <span className="text-[11px] text-[var(--muted)]">
          {surcharge > 0 ? `+${formatMoney(surcharge, locale, rate)}` : formatMoney(0, locale, rate)}
        </span>
      </SwatchButton>
    );
  };

  // ── Widok kompaktowy (jak dotąd) ──
  if (!expanded) {
    const shown = values.slice(0, SWATCH_LIMIT);
    const hidden = values.length - shown.length;
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {shown.map(swatch)}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[4rem] p-2 rounded-2xl border border-[var(--border)] text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
          >
            <span className="text-xs font-sans">
              {locale === "de" ? "Mehr anzeigen" : "Zobacz więcej"}
            </span>
            <span className="text-[11px] text-[var(--muted)]">(+{hidden})</span>
          </button>
        )}
      </div>
    );
  }

  // ── Widok rozwinięty: karty grup cenowych ──
  type GroupBucket = {
    code: string;
    label: string;
    surcharge: number;
    sort: number;
    fabrics: Map<string, { slug: string | null; values: string[] }>;
  };
  const buckets = new Map<string, GroupBucket>();
  for (const v of values) {
    const m = meta[v];
    const code = m?.groupCode ?? "__other";
    let bucket = buckets.get(code);
    if (!bucket) {
      bucket = m
        ? {
            code,
            label: pickLocalized(m.groupName, m.groupNameDe, locale),
            surcharge: m.groupSurcharge,
            sort: m.groupSort,
            fabrics: new Map(),
          }
        : {
            code: "__other",
            label: t.fabrics.otherGroupLabel,
            surcharge: 0,
            sort: Number.MAX_SAFE_INTEGER,
            fabrics: new Map(),
          };
      buckets.set(code, bucket);
    }
    const fabricName = m?.fabricName ?? v;
    const entry = bucket.fabrics.get(fabricName);
    if (entry) entry.values.push(v);
    else bucket.fabrics.set(fabricName, { slug: m?.slug ?? null, values: [v] });
  }
  const ordered = [...buckets.values()].sort((a, b) => a.sort - b.sort);
  const currentGroup = current ? meta[current]?.groupCode ?? "__other" : null;
  const open = openGroups ?? new Set([currentGroup ?? ordered[0]?.code]);

  function toggleGroup(code: string) {
    const next = new Set(open);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setOpenGroups(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((g) => {
        const isOpen = open.has(g.code);
        const count = g.fabrics.size;
        return (
          <div key={g.code} className="border border-[var(--border)] rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(g.code)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--card-bg)] hover:bg-[var(--color-gold)]/5 transition-colors text-left"
            >
              <span className="font-sans text-sm font-semibold text-[var(--fg)]">{g.label}</span>
              <span className="text-xs text-[var(--color-gold-text)] font-semibold">
                {g.code !== "__other" &&
                  (g.surcharge > 0
                    ? `+${formatMoney(g.surcharge, locale, rate)}`
                    : t.fabrics.groupNoSurcharge)}
              </span>
              <span className="text-xs text-[var(--muted)] ml-auto">{count}</span>
              <span className="text-[var(--muted)]">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="p-4 flex flex-col gap-5 border-t border-[var(--border)]">
                {[...g.fabrics.entries()].map(([fabricName, entry]) => (
                  <div key={fabricName}>
                    <p className="text-xs font-sans text-[var(--muted)] mb-2 flex items-center gap-2">
                      <span className="font-semibold text-[var(--fg)]">{fabricName}</span>
                      {entry.slug && (
                        <Link
                          href={localizeHref(`/tkaniny/${entry.slug}`, locale)}
                          className="text-[var(--color-gold)] underline underline-offset-2 hover:no-underline"
                        >
                          {t.fabrics.detailsLink}
                        </Link>
                      )}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {entry.values.map(swatch)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="self-start px-4 py-2 text-xs font-sans rounded-full border border-[var(--border)] text-[var(--color-gold)] hover:border-[var(--color-gold)] transition-colors"
      >
        {locale === "de" ? "Weniger anzeigen" : "Zobacz mniej"}
      </button>
    </div>
  );
}

// Swatche zdjęć wariantu (value_images) dla opcji innych niż tkanina/narożnik.
// Zachowują się jak próbki tkanin: miniatura przy wartości, klik = wybór; zdjęcia
// NIE wchodzą do głównej galerii (patrz getVariantImages — scala tylko narożnik).
// Miniatura = pierwsze zdjęcie wartości; brak zdjęcia → tekst wartości w kółku.
function ValueImageSwatchGroup({
  values,
  current,
  valuePrices,
  valueImages,
  labelOf,
  infoFor,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  valueImages: Record<string, string[]>;
  labelOf: (v: string) => string;
  infoFor: (value: string) => string | null;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {values.map((v) => {
        const active = current === v;
        const img = valueImages[v]?.[0];
        const surcharge = valuePrices?.[v] ?? 0;
        const label = labelOf(v);
        const info = infoFor(v);
        return (
          <SwatchButton
            key={v}
            hasTip={!!info}
            onClick={() => onPick(v)}
            ariaPressed={active}
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
              className={`text-xs leading-tight inline-flex items-center gap-1 ${
                active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
              }`}
            >
              {label}
              {info && <ValueInfoTip text={info} />}
            </span>
            <span className="text-[11px] text-[var(--muted)]">
              {surcharge > 0 ? `+${formatMoney(surcharge, locale, rate)}` : formatMoney(0, locale, rate)}
            </span>
          </SwatchButton>
        );
      })}
    </div>
  );
}

// Grafiki stron narożnika (statyczne SVG z public/, językowo neutralne —
// etykieta pod kafelkiem idzie z wartości opcji przez overrides → mapy DE).
const CORNER_SIDE_IMAGES: Record<CornerSide, string> = {
  left: "/naroznik-lewostronny.svg",
  right: "/naroznik-prawostronny.svg",
};

// Opcja „Strona" (narożnik lewostronny/prawostronny) jako dwa kafelki z grafiką
// mebla — wzorzec FabricSwatchGroup (aria-pressed, złota obwódka aktywnego).
// Kremowe tło kafelka (#ECE4D7, kolor brandowy) — granatowy korpus czytelny
// także w dark mode. Wartość nierozpoznana przez cornerSideOf → chip tekstowy.
function CornerSideGroup({
  values,
  current,
  valuePrices,
  labelOf,
  infoFor,
  hint,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  labelOf: (v: string) => string;
  infoFor: (value: string) => string | null;
  hint: string;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {orderCornerSideValues(values).map((v) => {
          const side = cornerSideOf(v);
          const active = current === v;
          const label = labelOf(v);
          const surcharge = valuePrices?.[v] ?? 0;
          const info = infoFor(v);
          if (!side) {
            return (
              <SwatchButton
                key={v}
                hasTip={!!info}
                onClick={() => onPick(v)}
                ariaPressed={active}
                className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                  active
                    ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                    : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  {info && <ValueInfoTip text={info} />}
                </span>
              </SwatchButton>
            );
          }
          return (
            <SwatchButton
              key={v}
              hasTip={!!info}
              onClick={() => onPick(v)}
              ariaPressed={active}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-colors ${
                active
                  ? "border-[var(--color-gold)]"
                  : "border-[var(--border)] hover:border-[var(--color-gold)]"
              }`}
            >
              <span className="w-full rounded-xl bg-[#ECE4D7] p-2">
                <Image
                  src={CORNER_SIDE_IMAGES[side]}
                  alt=""
                  width={200}
                  height={190}
                  className="w-full h-auto"
                />
              </span>
              <span
                className={`text-xs leading-tight inline-flex items-center gap-1 ${
                  active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
                }`}
              >
                {label}
                {info && <ValueInfoTip text={info} />}
                {surcharge !== 0 && (
                  <span className={active ? "opacity-80" : "text-[var(--muted)]"}>
                    {" "}
                    ({surcharge > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(surcharge), locale, rate)})
                  </span>
                )}
              </span>
            </SwatchButton>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--muted)] mt-2">{hint}</p>
    </div>
  );
}
