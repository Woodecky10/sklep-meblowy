// Filtry opcji wariantów (?opcja_<slug>=w1,w2) i wymiarów (?szer_od= itd.)
// na /sklep. Czyste funkcje (bez importów server-only), testowalne w node —
// wzorzec fabric-filter.ts. Nazwy opcji to wolne stringi admina z mieszanym
// casingiem (ROZMIAR/Rozmiar), więc grupujemy po znormalizowanej nazwie.

import type { ProductVariants } from "./types";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE } from "./de-content-maps";
import type { Locale } from "./i18n";

export const OPTION_PARAM_PREFIX = "opcja_";

// „Tkanina" ma dedykowany filtr rodzin tkanin (fabric-filter.ts) — nie
// dublujemy jej w generycznych filtrach opcji.
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
        const de = VARIANT_OPTION_DE[opt.name.trim()];
        if (de) group.name_de = displayOptionName(de);
      }
      const overrides = row.variants?.overrides?.value_labels?.[opt.name];
      for (const raw of opt.values) {
        const value = raw.trim();
        if (value.length === 0 || group.values.has(value)) continue;
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
