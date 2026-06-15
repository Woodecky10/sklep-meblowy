// Czyste helpery do pre-lokalizacji wierszy z DB: gdy locale==='de', podmieniają
// pola tekstowe na ich odpowiedniki _de (z fallbackiem do PL gdy _de puste).
// Wydzielone żeby były testowalne bez mockowania supabase (jak search-filter).
//
// Wzorzec: warstwa odczytu (products/categories/reviews) pobiera wiersze z
// kolumnami PL + _de, a te helpery zwracają wiersz, w którym KANONICZNE pola
// (name/description/color/material/label/comment) zawierają już treść wg locale.
// Komponenty renderują wtedy zwykłe `product.name` — nie muszą znać locale.

import { pickLocalized, type Locale } from "./i18n";
import type { ProductDescriptionSection, ProductFeature } from "./types";
import {
  CONSTRUCTION_DE,
  DELIVERY_TIME_DE,
  WARRANTY_DE,
  FEATURE_KEY_DE,
  FEATURE_VALUE_DE,
  mapDe,
} from "./de-content-maps";

// Akceptujemy dowolny kształt wiersza produktu, byle miał pola PL + _de.
// Generic <T> żeby zachować pozostałe pola (id, price, images...) bez utraty typu.
type ProductLocalizable = {
  name: string;
  description: string;
  color: string | null;
  material: string | null;
  description_sections: ProductDescriptionSection[];
  name_de?: string | null;
  description_de?: string | null;
  color_de?: string | null;
  material_de?: string | null;
  description_sections_de?: ProductDescriptionSection[] | null;
  // Wolnotekstowe pola bez kolumn _de — tłumaczone przez mapy de-content-maps.
  construction?: string | null;
  delivery_time?: string | null;
  warranty?: string | null;
  features?: ProductFeature[];
};

// Podmienia color/material na _de tylko gdy _de jest niepuste. PRESERWUJE null
// (PL color=null + brak _de → zostaje null, nie "").
function pickNullable(
  pl: string | null,
  de: string | null | undefined
): string | null {
  if (de && de.trim().length > 0) return de;
  return pl;
}

export function localizeProduct<T extends ProductLocalizable>(
  row: T,
  locale: Locale
): T {
  if (locale !== "de") return row;
  const sectionsDe = row.description_sections_de;
  // Cechy BL: tłumaczymy klucz i (jeśli znana) wartość; nieznane (kody, liczby,
  // wymiary, nazwy własne) przechodzą bez zmian.
  const featuresDe: ProductFeature[] | undefined = Array.isArray(row.features)
    ? row.features.map((f) => ({
        key: mapDe(FEATURE_KEY_DE, f.key) ?? f.key,
        value: mapDe(FEATURE_VALUE_DE, f.value) ?? f.value,
      }))
    : row.features;
  return {
    ...row,
    name: pickLocalized(row.name, row.name_de, locale),
    description: pickLocalized(row.description, row.description_de, locale),
    color: pickNullable(row.color, row.color_de),
    material: pickNullable(row.material, row.material_de),
    construction: mapDe(CONSTRUCTION_DE, row.construction),
    delivery_time: mapDe(DELIVERY_TIME_DE, row.delivery_time),
    warranty: mapDe(WARRANTY_DE, row.warranty),
    features: featuresDe,
    description_sections:
      Array.isArray(sectionsDe) && sectionsDe.length > 0
        ? sectionsDe
        : row.description_sections,
  };
}

type LabelLocalizable = {
  label: string;
  label_de?: string | null;
};

export function localizeCategory<T extends LabelLocalizable>(
  row: T,
  locale: Locale
): T {
  if (locale !== "de") return row;
  return { ...row, label: pickLocalized(row.label, row.label_de, locale) };
}

// Grupy kategorii mają identyczny kształt (label/label_de) — alias dla czytelności.
export const localizeCategoryGroup = localizeCategory;

// Facet (kolor/materiał) na /sklep: dedupe po KANONICZNEJ wartości PL (używanej
// do query + filtra DB), z localized labelem do wyświetlenia. Czysty helper —
// testowalny bez mockowania supabase (getFilterFacets tylko dostarcza wiersze).
//
// value = PL canonical (np. "beż") — niesie ?kolor= i .in("color", ...).
// label = DE gdy _de niepuste, inaczej PL — to co widzi user.
// Gdy ten sam PL value ma kilka wierszy, pierwszy niepusty _de wygrywa jako label.
// Sortowanie po label wg podanego locale (PL collation gdy locale=pl).
export type LocalizedFacet = { value: string; label: string };

export function buildLocalizedFacets(
  rows: Array<{ value: string | null; value_de: string | null | undefined }>,
  locale: Locale
): LocalizedFacet[] {
  const byValue = new Map<string, string>();
  for (const r of rows) {
    const value = r.value?.trim() ?? "";
    if (value.length === 0) continue;
    const de = r.value_de?.trim() ?? "";
    const label = locale === "de" && de.length > 0 ? de : value;
    // Pierwszy wpis ustala label; kolejne nadpisują tylko gdy obecny label ==
    // value (PL fallback) a nowy ma sensowny DE — żeby przetłumaczony wiersz
    // wygrał nad nieprzetłumaczonym przy tym samym PL value.
    const existing = byValue.get(value);
    if (existing === undefined) {
      byValue.set(value, label);
    } else if (existing === value && label !== value) {
      byValue.set(value, label);
    }
  }
  return Array.from(byValue.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

type ReviewLocalizable = {
  comment: string | null;
  comment_de?: string | null;
};

export function localizeReview<T extends ReviewLocalizable>(
  row: T,
  locale: Locale
): T {
  if (locale !== "de") return row;
  return { ...row, comment: pickNullable(row.comment, row.comment_de) };
}
