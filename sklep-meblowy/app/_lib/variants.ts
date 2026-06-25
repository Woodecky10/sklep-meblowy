import type { Product, ProductOption, ProductVariant } from "./types";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "./de-content-maps";
import { effectivePrice, isOnSale } from "./pricing";

// Czy produkt ma warianty (i przynajmniej jedną opcję)?
export function hasVariants(product: Product): boolean {
  return !!product.variants && product.variants.options.length > 0;
}

// Znajdź dokładną kombinację dopasowaną do wybranych wartości.
// Zwraca null jeśli nie wszystkie opcje są wybrane lub kombinacja nie istnieje.
export function findVariant(
  product: Product,
  selectedValues: Record<string, string>
): ProductVariant | null {
  if (!product.variants) return null;
  const optionNames = product.variants.options.map((o) => o.name);

  for (const name of optionNames) {
    if (!selectedValues[name]) return null;
  }

  return (
    product.variants.combinations.find((c) =>
      optionNames.every((n) => c.values[n] === selectedValues[n])
    ) ?? null
  );
}

// Czy wybór wariantu jest kompletny (wszystkie opcje mają wartość)?
export function isVariantSelectionComplete(
  product: Product,
  selectedValues: Record<string, string>
): boolean {
  if (!hasVariants(product)) return true;
  return product.variants!.options.every((o) => !!selectedValues[o.name]);
}

// Stock dostępny dla wybranej kombinacji.
// Brak wariantów -> product.stock. Niekompletny wybór lub brak kombinacji -> 0.
export function getVariantStock(
  product: Product,
  selectedValues: Record<string, string>
): number {
  if (!hasVariants(product)) return product.stock;
  const variant = findVariant(product, selectedValues);
  return variant?.stock ?? 0;
}

// Cena dla wybranej kombinacji = product.price + price_modifier.
// Niekompletny wybór -> bazowa cena.
export function getVariantPrice(
  product: Product,
  selectedValues: Record<string, string>
): number {
  if (!hasVariants(product)) return product.price;
  const variant = findVariant(product, selectedValues);
  if (!variant) return product.price;
  return product.price + (variant.price_modifier ?? 0);
}

// Suma stocków wszystkich kombinacji (lub product.stock dla produktu bez wariantów).
// Używane np. w „Wyprzedany" gdy wszystkie kombinacje mają 0.
export function totalProductStock(product: Product): number {
  if (!hasVariants(product)) return product.stock;
  return product.variants!.combinations.reduce((sum, c) => sum + c.stock, 0);
}

// Czy konkretna wartość opcji jest w ogóle dostępna (jakakolwiek kombinacja > 0)
// przy uwzględnieniu już wybranych innych opcji. Używane do wyszarzania chipów.
export function isOptionValueAvailable(
  product: Product,
  optionName: string,
  value: string,
  selectedValues: Record<string, string>
): boolean {
  if (!product.variants) return true;
  const otherSelections = Object.entries(selectedValues).filter(
    ([k, v]) => k !== optionName && !!v
  );

  return product.variants.combinations.some((c) => {
    if (c.values[optionName] !== value) return false;
    if (c.stock <= 0) return false;
    return otherSelections.every(([k, v]) => c.values[k] === v);
  });
}

// Krótka, czytelna etykieta wybranych wartości — np. "Strona: Lewa, Kolor: Beżowy".
// Na DE tłumaczy nazwę opcji i (znaną) wartość; kody/wymiary przechodzą bez zmian.
export function formatVariantLabel(
  values: Record<string, string>,
  locale: Locale = DEFAULT_LOCALE
): string {
  const de = locale === "de";
  return Object.entries(values)
    .map(([k, v]) => {
      const key = de ? mapDe(VARIANT_OPTION_DE, k) ?? k : k;
      const val = de ? mapDe(VARIANT_VALUE_DE, v) ?? v : v;
      return `${key}: ${val}`;
    })
    .join(", ");
}

// Zdjęcia do pokazania klientowi: jeśli wybrany wariant ma własne, użyj ich.
// W przeciwnym razie (brak wariantów, niekompletny wybór, brak zdjęć w
// kombinacji) wracamy do globalnej galerii produktu.
export function getVariantImages(
  product: Product,
  selectedValues: Record<string, string>
): string[] {
  if (!hasVariants(product)) return product.images ?? [];
  const variant = findVariant(product, selectedValues);
  if (variant?.images && variant.images.length > 0) return variant.images;
  return product.images ?? [];
}

// Display name opcji — jeśli admin nadpisał ("Wariant" → "Kolor"), użyj override.
export function getOptionDisplayName(
  product: Product,
  optionName: string
): string {
  return (
    product.variants?.overrides?.option_names?.[optionName] ?? optionName
  );
}

// Display label wartości — jeśli admin nadpisał ("01 beż" → "Beż"), użyj override.
export function getValueDisplayLabel(
  product: Product,
  optionName: string,
  value: string
): string {
  return (
    product.variants?.overrides?.value_labels?.[optionName]?.[value] ?? value
  );
}

// Deterministyczny klucz kombinacji (nazwy opcji posortowane). Współdzielony
// z VariantsEditor i price-history, żeby kluczowanie było spójne.
export function variantKey(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

// Cena promocyjna wybranej jednostki (kombinacja lub poziom produktu).
export function getVariantSalePrice(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (!hasVariants(product)) return product.sale_price ?? null;
  const variant = findVariant(product, selectedValues);
  return variant?.sale_price ?? null;
}

// Najniższa cena z 30 dni dla wybranej jednostki (zdenormalizowana).
export function getVariantOmnibus(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (!hasVariants(product)) return product.omnibus_price ?? null;
  const variant = findVariant(product, selectedValues);
  return variant?.omnibus_price ?? null;
}

// Czy wybrana jednostka jest w promocji (sale < regularna).
export function isVariantOnSale(
  product: Product,
  selectedValues: Record<string, string>
): boolean {
  return isOnSale(
    getVariantPrice(product, selectedValues),
    getVariantSalePrice(product, selectedValues)
  );
}

// Cena efektywna wybranej jednostki (promocyjna gdy w promocji, inaczej regularna).
export function getVariantEffectivePrice(
  product: Product,
  selectedValues: Record<string, string>
): number {
  return effectivePrice(
    getVariantPrice(product, selectedValues),
    getVariantSalePrice(product, selectedValues)
  );
}

// ── Generowanie kombinacji wariantów (współdzielone z VariantsEditor + applyFabricSelection) ──

// Wszystkie kombinacje opcji (iloczyn kartezjański). Pomija opcje bez nazwy/wartości.
export function cartesianProduct(
  options: ProductOption[]
): Array<Record<string, string>> {
  const valid = options.filter((o) => o.name.trim() && o.values.length > 0);
  if (valid.length === 0) return [];
  return valid.reduce<Array<Record<string, string>>>(
    (acc, opt) =>
      acc.flatMap((prev) => opt.values.map((v) => ({ ...prev, [opt.name]: v }))),
    [{}]
  );
}

// Po zmianie opcji przelicz kombinacje, zachowując stock/price/images/sale dla
// kombinacji których klucz dalej istnieje. Nowe → stock 0, price_modifier 0.
export function rebuildCombinations(
  options: ProductOption[],
  oldCombinations: ProductVariant[]
): ProductVariant[] {
  const oldMap = new Map<string, ProductVariant>(
    oldCombinations.map((c) => [variantKey(c.values), c])
  );
  return cartesianProduct(options).map((values) => {
    const prev = oldMap.get(variantKey(values));
    if (prev) return { ...prev, values };
    return { values, stock: 0, price_modifier: 0 };
  });
}

// ── Tkaniny (katalog) ──

// Stała nazwa opcji wariantu reprezentującej tkaninę. Nazwa DE tej opcji
// ("Tkanina"/"TKANINA" → "Stoff"/"STOFF") jest już w VARIANT_OPTION_DE.
export const FABRIC_OPTION_NAME = "Tkanina";

// Ustawia (lub tworzy/usuwa) opcję „Tkanina" z podanym zbiorem nazw i przelicza
// kombinacje przez rebuildCombinations (ta sama logika co edytor). Pozostałe
// opcje bez zmian. Pusty wybór → usuwa opcję „Tkanina".
export function applyFabricSelection(
  options: ProductOption[],
  combinations: ProductVariant[],
  selectedFabricNames: string[]
): { options: ProductOption[]; combinations: ProductVariant[] } {
  let nextOptions: ProductOption[];
  if (selectedFabricNames.length === 0) {
    nextOptions = options.filter((o) => o.name !== FABRIC_OPTION_NAME);
  } else if (options.some((o) => o.name === FABRIC_OPTION_NAME)) {
    nextOptions = options.map((o) =>
      o.name === FABRIC_OPTION_NAME ? { ...o, values: selectedFabricNames } : o
    );
  } else {
    nextOptions = [...options, { name: FABRIC_OPTION_NAME, values: selectedFabricNames }];
  }
  return { options: nextOptions, combinations: rebuildCombinations(nextOptions, combinations) };
}

// Buduje mapę PL→DE nazw tkanin (pomija puste name_de). Czysta — testowalna bez
// DB; serwerowy getFabricDeMap (fabrics.ts) ją opakowuje danymi z tabeli fabrics.
export function buildFabricDeMap(
  fabrics: { name: string; name_de: string | null }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fabrics) {
    const de = f.name_de?.trim();
    if (de) map[f.name] = de;
  }
  return map;
}
