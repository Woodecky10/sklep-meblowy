// Czyste helpery do pre-lokalizacji wierszy z DB: gdy locale==='de', podmieniają
// pola tekstowe na ich odpowiedniki _de (z fallbackiem do PL gdy _de puste).
// Wydzielone żeby były testowalne bez mockowania supabase (jak search-filter).
//
// Wzorzec: warstwa odczytu (products/categories/reviews) pobiera wiersze z
// kolumnami PL + _de, a te helpery zwracają wiersz, w którym KANONICZNE pola
// (name/description/color/material/label/comment) zawierają już treść wg locale.
// Komponenty renderują wtedy zwykłe `product.name` — nie muszą znać locale.

import { pickLocalized, type Locale } from "./i18n";
import type { ProductDescriptionSection } from "./types";

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
  return {
    ...row,
    name: pickLocalized(row.name, row.name_de, locale),
    description: pickLocalized(row.description, row.description_de, locale),
    color: pickNullable(row.color, row.color_de),
    material: pickNullable(row.material, row.material_de),
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
