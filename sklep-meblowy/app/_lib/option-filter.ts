// Filtry opcji wariantów (?opcja_<slug>=w1,w2) i wymiarów (?szer_od= itd.)
// na /sklep. Czyste funkcje (bez importów server-only), testowalne w node —
// wzorzec feature-filter.ts. Nazwy opcji to wolne stringi admina z mieszanym
// casingiem (ROZMIAR/Rozmiar), więc grupujemy po znormalizowanej nazwie.

import type { ProductVariants, ProductDimensions } from "./types";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE } from "./de-content-maps";
import type { Locale } from "./i18n";

export const OPTION_PARAM_PREFIX = "opcja_";

// Opcja „Tkanina" w wariantach to kody kolorów tkanin (np. „Poso 105"), nie
// nadaje się na generyczny facet — wykluczamy ją ŚWIADOMIE z filtrów opcji.
// (Dawniej miała dedykowany filtr rodzin tkanin; został usunięty.)
export const EXCLUDED_OPTION_SLUGS: Set<string> = new Set(["tkanina"]);

// "  POWIERZCHNIA   SPANIA " → "powierzchnia spania" (klucz grupowania).
export function normalizeOptionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Wyświetlana forma grupy: "ROZMIAR" → "Rozmiar".
export function displayOptionName(name: string): string {
  const n = normalizeOptionName(name);
  return n.length === 0 ? n : n[0].toUpperCase() + n.slice(1);
}

// Slug do parametru URL: bez polskich znaków, tylko [a-z0-9-].
// "STELAŻ" → "stelaz", "POWIERZCHNIA SPANIA" → "powierzchnia-spania".
// ł nie rozkłada się przez NFD (to nie litera+znak diakrytyczny) — ręcznie.
export function optionParamSlug(name: string): string {
  return normalizeOptionName(name)
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type OptionFacetValue = {
  value: string; // surowa wartość — niesie URL i dopasowanie
  label: string; // etykieta PL (override admina lub surowa wartość)
  label_de: string | null; // tłumaczenie DE lub null → fallback PL
};

export type OptionFacetGroup = {
  slug: string; // część parametru: ?opcja_<slug>=
  name: string; // wyświetlana nazwa PL, np. "Rozmiar"
  name_de: string | null;
  values: OptionFacetValue[];
};

// Agreguje opcje filterable=true z produktów w grupy facetów. Grupowanie po
// slugu znormalizowanej nazwy (ROZMIAR ∪ Rozmiar). Etykieta wartości: pierwszy
// napotkany override admina (value_labels) wygrywa nad surową wartością.
export function collectOptionFacets(
  rows: { variants: ProductVariants | null }[]
): OptionFacetGroup[] {
  const groups = new Map<
    string,
    { name: string; name_de: string | null; values: Map<string, OptionFacetValue> }
  >();
  for (const row of rows) {
    for (const opt of row.variants?.options ?? []) {
      if (opt.filterable !== true) continue;
      const slug = optionParamSlug(opt.name);
      if (slug.length === 0 || EXCLUDED_OPTION_SLUGS.has(slug)) continue;
      let group = groups.get(slug);
      if (!group) {
        group = { name: displayOptionName(opt.name), name_de: null, values: new Map() };
        groups.set(slug, group);
      }
      if (group.name_de === null) {
        // Wartość mapy bez transformacji — karta produktu na /de pokazuje
        // te same nazwy (np. "GRÖSSE"), facet ma być z nią spójny.
        const de = VARIANT_OPTION_DE[opt.name.trim()];
        if (de) group.name_de = de;
      }
      const overrides = row.variants?.overrides?.value_labels?.[opt.name];
      for (const raw of opt.values) {
        const value = raw.trim();
        if (value.length === 0 || group.values.has(value)) continue;
        // Wartość z przecinkiem nie przeżyje rundy przez CSV w URL
        // (?opcja_x=a,b tnie się po przecinku) — nie staje się filtrem.
        if (value.includes(",")) continue;
        group.values.set(value, {
          value,
          label: overrides?.[raw] ?? value,
          label_de: VARIANT_VALUE_DE[value] ?? null,
        });
      }
    }
  }
  return [...groups.entries()]
    .map(([slug, g]) => ({
      slug,
      name: g.name,
      name_de: g.name_de,
      values: [...g.values.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "pl", { numeric: true })
      ),
    }))
    // Grupa bez ani jednej niepustej wartości nie renderuje pustej piguły.
    .filter((g) => g.values.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export type LocalizedOptionFacet = {
  slug: string;
  label: string;
  values: { value: string; label: string }[];
};

// Projekcja grup na locale — value zostaje PL/surowe (niesie URL i filtr),
// label DE z fallbackiem PL. Wzorzec buildLocalizedFacets (localize.ts).
export function localizeOptionFacets(
  groups: OptionFacetGroup[],
  locale: Locale
): LocalizedOptionFacet[] {
  const de = locale === "de";
  return groups.map((g) => ({
    slug: g.slug,
    label: de && g.name_de ? g.name_de : g.name,
    values: g.values.map((v) => ({
      value: v.value,
      label: de && v.label_de ? v.label_de : v.label,
    })),
  }));
}

// selected: slug → wybrane wartości. Produkt pasuje, gdy dla KAŻDEJ grupy ma
// opcję o tym slugu z ≥1 wybraną wartością (OR w grupie, AND między grupami —
// jak kolor × tkanina). Flaga filterable NIE wpływa na dopasowanie (facety
// i tak nie pokażą niewłączonych filtrów); brak opcji = brak dopasowania
// (spójnie z filtrem tkaniny).
export function productMatchesOptionFilters(
  variants: ProductVariants | null | undefined,
  selected: Record<string, string[]>
): boolean {
  for (const [slug, wanted] of Object.entries(selected)) {
    if (wanted.length === 0) continue;
    const values = new Set<string>();
    for (const opt of variants?.options ?? []) {
      if (optionParamSlug(opt.name) !== slug) continue;
      for (const value of opt.values) values.add(value.trim());
    }
    if (!wanted.some((w) => values.has(w))) return false;
  }
  return true;
}

export type DimensionRanges = {
  widthMin?: number;
  widthMax?: number;
  depthMin?: number;
  depthMax?: number;
  heightMin?: number;
  heightMax?: number;
};

export function hasActiveDimensionRanges(ranges: DimensionRanges): boolean {
  return Object.values(ranges).some((v) => typeof v === "number");
}

// Produkt bez wymiarów odpada przy aktywnym zakresie (brak danych = brak
// dopasowania, jak tkanina). Uszkodzone/częściowe dane z JSONB traktujemy
// jak brak wymiaru.
export function productMatchesDimensions(
  dimensions: ProductDimensions | null | undefined,
  ranges: DimensionRanges
): boolean {
  if (!hasActiveDimensionRanges(ranges)) return true;
  if (!dimensions) return false;
  const checks: [number | undefined, number | undefined, unknown][] = [
    [ranges.widthMin, ranges.widthMax, dimensions.width],
    [ranges.depthMin, ranges.depthMax, dimensions.depth],
    [ranges.heightMin, ranges.heightMax, dimensions.height],
  ];
  for (const [min, max, actual] of checks) {
    const bounded = typeof min === "number" || typeof max === "number";
    if (!bounded) continue;
    if (typeof actual !== "number" || !Number.isFinite(actual)) return false;
    if (typeof min === "number" && actual < min) return false;
    if (typeof max === "number" && actual > max) return false;
  }
  return true;
}

export type DimensionBounds = {
  width: { min: number; max: number } | null;
  depth: { min: number; max: number } | null;
  height: { min: number; max: number } | null;
};

// Min/max wymiarów aktywnych produktów — granice-podpowiedzi pól zakresu
// w FilterBarze. null = żaden produkt nie ma tego wymiaru.
export function collectDimensionBounds(
  rows: { dimensions: ProductDimensions | null }[]
): DimensionBounds {
  const acc: DimensionBounds = { width: null, depth: null, height: null };
  for (const row of rows) {
    for (const key of ["width", "depth", "height"] as const) {
      const v = row.dimensions?.[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      const cur = acc[key];
      acc[key] = cur
        ? { min: Math.min(cur.min, v), max: Math.max(cur.max, v) }
        : { min: v, max: v };
    }
  }
  return acc;
}

// Parsuje searchParams strony: ?opcja_<slug>=w1,w2 → { slug: [w1, w2] }.
// Niepoprawne slugi/puste wartości ignorowane — żaden URL nie wywoła błędu.
export function parseOptionFilterParams(
  sp: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(sp)) {
    if (!key.startsWith(OPTION_PARAM_PREFIX)) continue;
    const slug = key.slice(OPTION_PARAM_PREFIX.length);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const values = (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) out[slug] = values;
  }
  return out;
}
