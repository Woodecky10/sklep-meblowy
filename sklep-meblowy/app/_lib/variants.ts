import type { Product, ProductOption } from "./types";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE, mapDe } from "./de-content-maps";
import { effectivePrice, isOnSale } from "./pricing";

// Czy produkt ma warianty (i przynajmniej jedną opcję)?
export function hasVariants(product: Product): boolean {
  return !!product.variants && product.variants.options.length > 0;
}

// Czy wybor wariantu jest kompletny (wszystkie opcje mają wartość)?
export function isVariantSelectionComplete(
  product: Product,
  selectedValues: Record<string, string>
): boolean {
  if (!hasVariants(product)) return true;
  return product.variants!.options.every((o) => !!selectedValues[o.name]);
}

// Stock dostępny dla wybranej kombinacji.
// Model produktowy: zawsze product.stock (stan na poziomie produktu).
export function getVariantStock(
  product: Product,
  _selectedValues: Record<string, string>
): number {
  return product.stock;
}

// Cena dla wybranego zestawu opcji = product.price + suma dopłat wartości.
export function getVariantPrice(
  product: Product,
  selectedValues: Record<string, string>
): number {
  return product.price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
}

// Dostępny stock produktu (model produktowy: product.stock).
export function totalProductStock(product: Product): number {
  return product.stock;
}

// Stała nazwa opcji wariantu reprezentującej tkaninę. Musi być zdefiniowana przed
// formatVariantLabel, który jej używa do specjalnej obsługi mapy PL→DE.
export const FABRIC_OPTION_NAME = "Tkanina";

// Krótka etykieta wybranych wartości — np. "Strona: Lewa, Tkanina: Sawana 21".
// Na DE: nazwy opcji + (kolory/strony) ze statycznej mapy; wartość opcji „Tkanina"
// z fabricMap (katalog) gdy podana, inaczej fallback do statycznej mapy / PL.
export function formatVariantLabel(
  values: Record<string, string>,
  locale: Locale = DEFAULT_LOCALE,
  fabricMap: Record<string, string> = {}
): string {
  const de = locale === "de";
  return Object.entries(values)
    .map(([k, v]) => {
      const key = de ? mapDe(VARIANT_OPTION_DE, k) ?? k : k;
      let val = v;
      if (de) {
        if (k === FABRIC_OPTION_NAME && fabricMap[v]) val = fabricMap[v];
        else val = mapDe(VARIANT_VALUE_DE, v) ?? v;
      }
      return `${key}: ${val}`;
    })
    .join(", ");
}

// Zdjęcia do pokazania klientowi: galeria produktu (model produktowy).
export function getVariantImages(
  product: Product,
  _selectedValues: Record<string, string>
): string[] {
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

// Sortuje wartości opcji wariantu DO WYŚWIETLENIA: naturalnie (liczby rosnąco,
// „Woolly 2" < „Woolly 10") i alfabetycznie A-Z wg locale. Sortuje po ETYKIECIE
// (labelOf uwzględnia override'y admina + tłumaczenie DE), więc kolejność jest
// poprawna w języku klienta. Case-/diakrytyko-niewrażliwe. Nie mutuje wejścia.
// Używane display-time w VariantSelector — działa dla obecnych i przyszłych
// produktów bez zmian w bazie. Narożniki (Strona) mają własne sortowanie
// semantyczne (orderCornerSideValues) i tu nie przechodzą.
export function sortVariantValues(
  values: string[],
  labelOf: (value: string) => string,
  locale: Locale = DEFAULT_LOCALE
): string[] {
  return [...values].sort((a, b) =>
    labelOf(a).localeCompare(labelOf(b), locale, { numeric: true, sensitivity: "base" })
  );
}

// Sortuje OPCJE wariantu (kategorie: „Kolor", „Rozmiar", „Tkanina"…) A-Z wg
// NAZWY WYŚWIETLANEJ. displayNameOf uwzględnia override'y admina + tłumaczenie
// DE, więc kolejność jest poprawna w języku klienta (spójnie z sortVariantValues,
// które sortuje wartości po etykiecie). Ta sama collation: case-/diakrytyko-
// niewrażliwa, z sortem numerycznym. Nie mutuje wejścia. Używane display-time
// w VariantSelector — działa dla obecnych i przyszłych produktów bez zmian w bazie.
export function sortVariantOptions(
  options: ProductOption[],
  displayNameOf: (optionName: string) => string,
  locale: Locale = DEFAULT_LOCALE
): ProductOption[] {
  return [...options].sort((a, b) =>
    displayNameOf(a.name).localeCompare(displayNameOf(b.name), locale, {
      numeric: true,
      sensitivity: "base",
    })
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

// Cena promocyjna wybranego zestawu opcji = product.sale_price + suma dopłat.
// Gdy sale_price == null -> brak promocji (null).
export function getVariantSalePrice(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (product.sale_price == null) return null;
  return product.sale_price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
}

// Najniższa cena z 30 dni dla wybranego zestawu opcji = product.omnibus_price + dopłaty.
// Gdy omnibus_price == null -> null.
export function getVariantOmnibus(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (product.omnibus_price == null) return null;
  return product.omnibus_price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
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

// ── Dopłaty ceny per wartość opcji ──

// Suma dopłat wartości tworzących daną kombinację. Brak dopłaty = 0.
export function sumValueSurcharges(
  options: ProductOption[],
  values: Record<string, string>
): number {
  let sum = 0;
  for (const opt of options) {
    const v = values[opt.name];
    if (v == null) continue;
    const surcharge = opt.value_prices?.[v];
    if (typeof surcharge === "number" && Number.isFinite(surcharge)) sum += surcharge;
  }
  return sum;
}

// Czy produkt używa cen per wartość (jakakolwiek opcja ma niepustą mapę dopłat).
// Rozróżnia tryb "per wartość" od legacy "ręczny modyfikator per kombinacja".
export function usesValuePricing(options: ProductOption[]): boolean {
  return options.some(
    (o) => o.value_prices && Object.keys(o.value_prices).length > 0
  );
}

// ── Tkaniny (katalog) ──

// Minimalny kształt tkaniny potrzebny do rozwijania na wartości wariantu.
export type FabricLite = { name: string; colors: string[]; price: number };

// Rozwija wybrane tkaniny (kolekcje) na wartości opcji „Tkanina":
// - z kolorami → „Nazwa Numer" dla każdego numeru,
// - bez kolorów → sama „Nazwa".
// Dopłata kolekcji trafia do valuePrices każdej jej wartości (gdy > 0).
// Zachowuje kolejność, deduplikuje wartości.
export function expandFabrics(
  fabrics: FabricLite[]
): { values: string[]; valuePrices: Record<string, number> } {
  const values: string[] = [];
  const valuePrices: Record<string, number> = {};
  const seen = new Set<string>();
  for (const f of fabrics) {
    const name = f.name.trim();
    if (!name) continue;
    const colors = (f.colors ?? []).map((c) => c.trim()).filter(Boolean);
    const fabricValues = colors.length > 0 ? colors.map((c) => `${name} ${c}`) : [name];
    const price = typeof f.price === "number" && Number.isFinite(f.price) ? f.price : 0;
    for (const v of fabricValues) {
      if (seen.has(v)) continue;
      seen.add(v);
      values.push(v);
      if (price > 0) valuePrices[v] = price;
    }
  }
  return { values, valuePrices };
}

// Czy wartość opcji „Tkanina" pochodzi z danej tkaniny (kolekcji)?
// „Nazwa" (bez kolorów) lub „Nazwa Numer" (numer ∈ colors). Do seedowania pickera.
export function fabricValueBelongsTo(value: string, fabric: FabricLite): boolean {
  const name = fabric.name.trim();
  if (value === name) return true;
  const colors = (fabric.colors ?? []).map((c) => c.trim()).filter(Boolean);
  if (colors.length === 0 || !value.startsWith(name + " ")) return false;
  return colors.includes(value.slice(name.length + 1));
}

// Ustawia (lub tworzy/usuwa) opcje "Tkanina" z podanymi wartosciami + doplatami
// per wartosc. Pozostale opcje bez zmian. Pusty zbior wartosci → usuwa opcje "Tkanina".
export function applyFabricSelection(
  options: ProductOption[],
  values: string[],
  valuePrices: Record<string, number> = {}
): { options: ProductOption[] } {
  const vp = Object.keys(valuePrices).length > 0 ? valuePrices : undefined;
  let nextOptions: ProductOption[];
  if (values.length === 0) {
    nextOptions = options.filter((o) => o.name !== FABRIC_OPTION_NAME);
  } else if (options.some((o) => o.name === FABRIC_OPTION_NAME)) {
    nextOptions = options.map((o) =>
      o.name === FABRIC_OPTION_NAME ? { ...o, values, value_prices: vp } : o
    );
  } else {
    nextOptions = [...options, { name: FABRIC_OPTION_NAME, values, value_prices: vp }];
  }
  return { options: nextOptions };
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

// Mapa wartość-wariantu → URL zdjęcia próbki (np. „Riviera 16" → url). Klucz jak
// w expandFabrics: „Nazwa Numer". Pomija numery bez wgranego zdjęcia.
export function buildFabricImageMap(
  fabrics: { name: string; colors: string[]; color_images: Record<string, string> }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fabrics) {
    const name = f.name.trim();
    if (!name) continue;
    for (const code of f.colors ?? []) {
      const url = f.color_images?.[code];
      if (url) map[`${name} ${code}`] = url;
    }
  }
  return map;
}
