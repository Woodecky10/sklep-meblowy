import type { Product } from "./types";
import type { Locale } from "./i18n";
import { VARIANT_OPTION_DE, mapDe } from "./de-content-maps";
import { sortVariantOptions } from "./variants";

export type MissingOption = { name: string; label: string }; // name = surowa nazwa opcji
export type MissingGroup = { title?: string; labels: string[] };

// Override admina → potem (na DE) ręczna mapa tłumaczeń; kody/wymiary bez zmian.
export function localizedOptionName(
  product: Pick<Product, "variants"> | undefined,
  optionName: string,
  locale: Locale
): string {
  const raw = product?.variants?.overrides?.option_names?.[optionName] ?? optionName;
  return locale === "de" ? mapDe(VARIANT_OPTION_DE, raw) ?? raw : raw;
}

// Opcje bez wybranej wartości (niepusty string = wybrano), w kolejności selektora.
export function missingVariantOptions(
  product: Pick<Product, "variants">,
  selected: Record<string, string>,
  locale: Locale
): MissingOption[] {
  const options = product.variants?.options ?? [];
  const missing = options.filter((o) => !selected[o.name]);
  return sortVariantOptions(missing, (n) => localizedOptionName(product, n, locale), locale).map((o) => ({
    name: o.name,
    label: localizedOptionName(product, o.name, locale),
  }));
}

export function missingBundleGroups(
  components: Pick<Product, "id" | "name" | "variants">[],
  selections: Record<string, Record<string, string>>,
  locale: Locale
): MissingGroup[] {
  const groups: MissingGroup[] = [];
  for (const c of components) {
    const labels = missingVariantOptions(c, selections[c.id] ?? {}, locale).map((m) => m.label);
    if (labels.length > 0) groups.push({ title: c.name, labels });
  }
  return groups;
}
