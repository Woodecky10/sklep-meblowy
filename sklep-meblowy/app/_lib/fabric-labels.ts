import { getDictionary } from "./dictionaries";

type Dict = ReturnType<typeof getDictionary>;

// Polska liczba mnoga: 1 → "one", 2-4 → "few", 5+ → "many". Wyjątek 12-14
// dostaje "many", mimo końcówki 2-4 ("13 kolorów", nie "13 kolory").
//
// Wydzielone z app/tkaniny/page.tsx (2026-07-30): funkcja siedziała tam jako
// lokalna i nieprzetestowana. Czysta funkcja bez Reacta → da się przetestować
// vitestem, którego projekt używa do wszystkiego w _lib.
function pluralPl(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
  return many;
}

export function colorsLabel(n: number, t: Dict): string {
  return pluralPl(n, t.fabrics.colorsOne, t.fabrics.colorsFew, t.fabrics.colorsMany);
}
