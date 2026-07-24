// Filtry z parametrów produktu (?cecha_<slug>=w1|w2) na /sklep. Czyste
// funkcje (bez importów server-only) — wzorzec option-filter.ts. Separator
// "|" zamiast CSV: wartości typu "4,5 cm" mają przecinek w środku.
import { normalizeOptionName, optionParamSlug } from "./option-filter";
import { FEATURE_KEY_DE, FEATURE_VALUE_DE } from "./de-content-maps";
import type { Locale } from "./i18n";

export const FEATURE_PARAM_PREFIX = "cecha_";
export const FEATURE_PARAM_SEPARATOR = "|";

// Parametry produktu widoczne jako filtry — kolejność = kolejność sekcji
// w FilterBarze (decyzja biznesowa, nie alfabet). Pisownia kanoniczna.
export const FILTERABLE_FEATURE_KEYS: string[] = [
  "Powierzchnia spania",
  "Pojemnik na pościel",
  "Tył mebla tapicerowany",
  "Wysokość nóżek",
];

export type FeatureFacetGroup = {
  slug: string; // część parametru: ?cecha_<slug>=
  name: string; // kanoniczna nazwa PL z FILTERABLE_FEATURE_KEYS
  values: string[]; // surowe wartości PL — niosą URL i dopasowanie
};

export type LocalizedFeatureFacet = {
  slug: string;
  label: string;
  values: { value: string; label: string }[];
};

// Surowa kolumna features (jsonb) → [{key, value}] z pominięciem śmieci.
function featureEntries(features: unknown): { key: string; value: string }[] {
  if (!Array.isArray(features)) return [];
  const out: { key: string; value: string }[] = [];
  for (const item of features) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { key?: unknown; value?: unknown };
    if (typeof rec.key !== "string" || typeof rec.value !== "string") continue;
    const key = rec.key.trim();
    const value = rec.value.trim();
    if (!key || !value) continue;
    out.push({ key, value });
  }
  return out;
}

// Agreguje wartości filtrowanych parametrów z aktywnych produktów w grupy
// facetów. Klucz dopasowany case-insensitive po trim; dedupe wartości
// (pierwsza pisownia wygrywa); wartość z separatorem nie przeżyje rundy
// przez URL — nie staje się filtrem. Grupy w kolejności listy, puste odpadają.
export function collectFeatureFacets(
  rows: { features: unknown }[]
): FeatureFacetGroup[] {
  const byNorm = new Map(
    FILTERABLE_FEATURE_KEYS.map((k) => [normalizeOptionName(k), k])
  );
  const groups = new Map<string, Map<string, string>>(); // canonical → norm(value) → value
  for (const row of rows) {
    for (const { key, value } of featureEntries(row.features)) {
      const canonical = byNorm.get(normalizeOptionName(key));
      if (!canonical) continue;
      if (value.includes(FEATURE_PARAM_SEPARATOR)) continue;
      let values = groups.get(canonical);
      if (!values) {
        values = new Map();
        groups.set(canonical, values);
      }
      const dedupe = value.toLowerCase();
      if (!values.has(dedupe)) values.set(dedupe, value);
    }
  }
  return FILTERABLE_FEATURE_KEYS.filter((k) => groups.has(k)).map((name) => ({
    slug: optionParamSlug(name),
    name,
    values: [...groups.get(name)!.values()].sort((a, b) =>
      a.localeCompare(b, "pl", { numeric: true })
    ),
  }));
}

// Projekcja grup na locale — value zostaje PL/surowe (niesie URL i filtr),
// label z map DE z fallbackiem (kody wymiarów "80x200"/"15 cm" bez zmian).
export function localizeFeatureFacets(
  groups: FeatureFacetGroup[],
  locale: Locale
): LocalizedFeatureFacet[] {
  const de = locale === "de";
  return groups.map((g) => ({
    slug: g.slug,
    label: de ? (FEATURE_KEY_DE[g.name] ?? g.name) : g.name,
    values: g.values.map((v) => ({
      value: v,
      label: de ? (FEATURE_VALUE_DE[v] ?? v) : v,
    })),
  }));
}

// selected: slug → wybrane wartości. Produkt pasuje, gdy dla KAŻDEJ grupy ma
// parametr o tym slugu z ≥1 wybraną wartością (OR w grupie, AND między
// grupami). Brak parametru = brak dopasowania (spójnie z opcjami/tkaniną).
export function productMatchesFeatureFilters(
  features: unknown,
  selected: Record<string, string[]>
): boolean {
  const active = Object.entries(selected).filter(([, v]) => v.length > 0);
  if (active.length === 0) return true;
  const entries = featureEntries(features);
  for (const [slug, wanted] of active) {
    const values = new Set<string>();
    for (const { key, value } of entries) {
      if (optionParamSlug(key) !== slug) continue;
      values.add(value);
    }
    if (!wanted.some((w) => values.has(w))) return false;
  }
  return true;
}

// Parsuje searchParams strony: ?cecha_<slug>=w1|w2 → { slug: [w1, w2] }.
// Niepoprawne slugi/puste wartości ignorowane — żaden URL nie wywoła błędu.
export function parseFeatureFilterParams(
  sp: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(sp)) {
    if (!key.startsWith(FEATURE_PARAM_PREFIX)) continue;
    const slug = key.slice(FEATURE_PARAM_PREFIX.length);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const values = (value ?? "")
      .split(FEATURE_PARAM_SEPARATOR)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) out[slug] = values;
  }
  return out;
}
