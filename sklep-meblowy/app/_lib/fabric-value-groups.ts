// Grupowanie wartości opcji „Tkanina" po tkaninie z katalogu — do edytora
// wariantów w panelu (2026-11-04, decyzja właściciela: jedna zwinięta linia na
// tkaninę zamiast setek wierszy „Baloo 2071", „Baloo 2072"…; kolory po
// rozwinięciu). Czysta logika, bez Reacta — testy w __tests__/fabric-value-groups.
//
// Dane w bazie się NIE zmieniają: wartości nadal są płaskie („Nazwa Kolor"),
// grupy liczymy tylko do wyświetlenia.
import { fabricValueBelongsTo, type FabricLite } from "./variants";

export type FabricValueItem = { value: string; color: string };
export type FabricValueGroup<F extends FabricLite = FabricLite> = {
  fabric: F;
  items: FabricValueItem[];
};

// Dzieli wartości na grupy per tkanina z katalogu (kolejność = pierwsze
// wystąpienie w wartościach produktu) i sieroty spoza katalogu. Przy nazwach
// będących prefiksem innych („Magic" / „Magic Velvet") wygrywa dłuższa nazwa.
export function groupValuesByFabric<F extends FabricLite>(
  values: string[],
  fabrics: F[]
): { groups: FabricValueGroup<F>[]; orphans: string[] } {
  const byLength = [...fabrics].sort((a, b) => b.name.trim().length - a.name.trim().length);
  const groups = new Map<string, FabricValueGroup<F>>();
  const orphans: string[] = [];
  for (const value of values) {
    const fabric = byLength.find((f) => fabricValueBelongsTo(value, f));
    if (!fabric) {
      orphans.push(value);
      continue;
    }
    const name = fabric.name.trim();
    const color = value === name ? "" : value.slice(name.length + 1);
    const group = groups.get(name);
    if (group) group.items.push({ value, color });
    else groups.set(name, { fabric, items: [{ value, color }] });
  }
  return { groups: [...groups.values()], orphans };
}

// Wspólna dopłata wartości (brak wpisu = 0 zł); null, gdy dopłaty się różnią.
export function commonPrice(
  values: string[],
  valuePrices: Record<string, number> | undefined
): number | null {
  let price: number | null = null;
  for (const v of values) {
    const p = valuePrices?.[v] ?? 0;
    if (price === null) price = p;
    else if (p !== price) return null;
  }
  return price ?? 0;
}

// Ustawia tę samą dopłatę wszystkim wskazanym wartościom; 0/null usuwa wpisy
// (jak pole dopłaty pojedynczej wartości). Pusta mapa → undefined, żeby
// w JSONB nie zostawało `value_prices: {}`.
export function setPriceForValues(
  valuePrices: Record<string, number> | undefined,
  values: string[],
  price: number | null
): Record<string, number> | undefined {
  const next = { ...(valuePrices ?? {}) };
  for (const v of values) {
    if (price === null || price === 0) delete next[v];
    else next[v] = price;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
