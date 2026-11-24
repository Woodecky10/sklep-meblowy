// Odchudzanie danych, które karta produktu przekazuje komponentom klienckim.
//
// Wszystko, co serwer daje komponentowi klienckiemu w propsach, jest doklejane
// do dokumentu HTML (payload RSC) i przeglądarka musi to pobrać i sparsować,
// zanim pokaże stronę. Pomiar 2026-11-24 (Lighthouse, telefon): dokument karty
// produktu miał 424 KB, z czego ~112 KB to mapy WSZYSTKICH 505 kolorów tkanin
// (typowy mebel używa ~150, a 86 mebli żadnego), a kolejne ~20–30 KB to opisy
// produktów, których żaden komponent kliencki nie czyta.
//
// Czysty moduł — bez importów serwerowych.

import type { Product } from "./types";

// Wszystkie wartości wariantów (np. „Baloo 2071") mebli pokazanych w sekcji
// głównej karty: produktu i składników zestawów z „Kup w zestawie". Selektor
// wariantów szuka w mapach tkanin DOKŁADNIE po tych napisach.
export function variantValuesOf(
  products: readonly Pick<Product, "variants">[]
): Set<string> {
  const values = new Set<string>();
  for (const p of products) {
    for (const option of p.variants?.options ?? []) {
      for (const v of option.values ?? []) {
        if (typeof v === "string") values.add(v);
      }
    }
  }
  return values;
}

// Mapa zawężona do podanych kluczy. Kolejność wpisów jak w mapie źródłowej.
export function pickByKeys<T>(
  map: Readonly<Record<string, T>>,
  keys: ReadonlySet<string>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(map)) {
    if (keys.has(key)) out[key] = map[key];
  }
  return out;
}

// Produkt dla komponentów klienckich: bez długich opisów. Opis renderuje serwer
// (page.tsx, ProductDescriptionSections dostaje sekcje osobnym propsem), a
// galeria, selektor wariantów, koszyk i „Kup w zestawie" ich nie używają.
// Zwraca pełny typ Product, żeby nie zmieniać sygnatur komponentów — pola są
// puste, nie usunięte.
export function withoutLongText<P extends Pick<Product, "description" | "description_sections">>(
  product: P
): P {
  return { ...product, description: "", description_sections: [] };
}
