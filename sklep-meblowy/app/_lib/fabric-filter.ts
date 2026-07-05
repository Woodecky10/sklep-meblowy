// Dopasowanie rodzin tkanin (katalog fabrics) do wartości opcji wariantów —
// zasila filtr „Tkanina" na /sklep. Czyste funkcje (bez importów server-only),
// testowalne w node.
//
// Kontekst: kolumna products.material jest w większości pusta; prawda o
// tkaninach żyje w variants.options (wartości formatu „Rodzina numer", np.
// „Poso 105"; edge case'y: opcja „TKANINA", opcja „Wariant" z combo
// „Monolith 84 + Solar 99"). Dlatego dopasowujemy nazwy rodzin do WSZYSTKICH
// wartości WSZYSTKICH opcji, case-insensitive, na granicach słów.

import type { ProductVariants } from "./types";

// " poso 105 " — separatory (+ , / ) zamienione na spacje, spacje zbite,
// obłożone spacjami z obu stron → test „ rodzina " łapie całe słowa/sekwencje
// („Solaris" nie zawiera „ solar ").
function normalizeValue(value: string): string {
  return (
    " " +
    value
      .toLowerCase()
      .replace(/[+,/]/g, " ")
      .replace(/\s+/g, " ")
      .trim() +
    " "
  );
}

function valueHasFamily(normalizedValue: string, family: string): boolean {
  return normalizedValue.includes(" " + family.toLowerCase() + " ");
}

// Rodziny tkanin występujące w wartościach opcji produktu. Zwraca kanoniczną
// pisownię i kolejność z familyNames (= kolejność katalogu fabrics).
export function deriveFabricFamilies(
  variants: ProductVariants | null | undefined,
  familyNames: string[]
): string[] {
  const options = variants?.options ?? [];
  if (options.length === 0 || familyNames.length === 0) return [];
  const normalized: string[] = [];
  for (const opt of options) {
    for (const value of opt.values) normalized.push(normalizeValue(value));
  }
  return familyNames.filter((family) =>
    normalized.some((nv) => valueHasFamily(nv, family))
  );
}

// Semantyka filtra (spec 2026-07-05): produkt pasuje do wybranej wartości V,
// gdy V jest jego rodziną tkaniny (z wariantów) LUB dokładną wartością
// kolumny material (legacy — unia źródeł, nic nie znika z filtra).
export function productMatchesFabric(
  variants: ProductVariants | null | undefined,
  material: string | null | undefined,
  selected: string[],
  familyNames: string[]
): boolean {
  if (selected.length === 0) return false;
  const families = new Set(deriveFabricFamilies(variants, familyNames));
  const legacy = material?.trim() ?? "";
  return selected.some((s) => families.has(s) || (legacy.length > 0 && s === legacy));
}
