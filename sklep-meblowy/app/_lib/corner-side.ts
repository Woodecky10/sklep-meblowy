// Wybór strony narożnika (Lewostronny/Prawostronny) jako opcja wariantu
// o zarezerwowanej nazwie — wzorzec FABRIC_OPTION_NAME (variants.ts).
// Czyste funkcje (bez importu supabase/next) — testowalne w izolacji.
//
// Rozpoznawanie jest ZNORMALIZOWANE (trim + uppercase), bo katalog ma już
// ręcznie dodane opcje "STRONA"/"Strona"/"STRONA MEBLA" z wartościami
// "LEWOSTRONNY"/"Lewa"/… (w tym literówkę "LEWOSTORNNY") — te produkty
// dostają graficzny picker bez zmiany swoich danych.

import type { ProductOption, ProductVariants } from "./types";

// Kanoniczna postać opcji dodawanej przez toggle admina / backfill / nowy produkt.
export const CORNER_SIDE_OPTION_NAME = "Strona";
export const CORNER_SIDE_VALUES = ["Lewostronny", "Prawostronny"];

// Kategoria, której produkty dostają wybór strony domyślnie (decyzja: opt-out).
export const CORNER_SIDE_DEFAULT_CATEGORY = "naroznik-l";

// Slugi kategorii narożników spoza wzorca "naroznik*" — prod DB ma slug "pufy"
// przerobiony na narożniki U (CATEGORY_LABEL_DE: pufy → "U-förmiges Ecksofa").
const EXTRA_CORNER_CATEGORY_SLUGS = new Set(["pufy"]);

// Czy kategoria to narożnik — steruje widocznością toggle'a w adminie.
export function isCornerCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = slug.trim().toLowerCase();
  return s.includes("naroznik") || EXTRA_CORNER_CATEGORY_SLUGS.has(s);
}

// Nazwy opcji rozpoznawane jako "strona narożnika" (po znormalizowaniu).
const SIDE_OPTION_NAMES = new Set(["STRONA", "STRONA MEBLA"]);

export function isCornerSideOptionName(name: string): boolean {
  return SIDE_OPTION_NAMES.has(name.trim().toUpperCase());
}

// Która strona? Po prefiksie znormalizowanej wartości — pokrywa "Lewostronny",
// "LEWOSTRONNY", "LEWOSTORNNY" (literówka w DB), "Lewa", "Prawa" itd.
// null = wartość nierozpoznana (picker pokaże dla niej zwykły chip tekstowy).
export type CornerSide = "left" | "right";

export function cornerSideOf(value: string): CornerSide | null {
  const v = value.trim().toUpperCase();
  if (v.startsWith("LEW")) return "left";
  if (v.startsWith("PRAW")) return "right";
  return null;
}

// Kolejność wyświetlania stron w graficznym pickerze: ZAWSZE lewa→prawa,
// niezależnie od kolejności zapisanej w danych. Katalog ma oba warianty
// zapisu (część produktów "Prawostronny" przed "Lewostronny") → bez tego
// pozycja kafelków lewo/prawo skakała między produktami (użytkownik: „na
// niektórych produktach odwrócone względem siebie"). Wartości nierozpoznane
// przez cornerSideOf trafiają na koniec w oryginalnej kolejności (stabilnie).
// Zwraca nową tablicę — nie mutuje wejścia.
export function orderCornerSideValues(values: string[]): string[] {
  const rank = (v: string): number => {
    const side = cornerSideOf(v);
    if (side === "left") return 0;
    if (side === "right") return 1;
    return 2;
  };
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i)
    .map((x) => x.v);
}

// Czy produkt ma już opcję strony (dowolną side-like, także ręczną).
export function hasCornerSideOption(variants: ProductVariants | null): boolean {
  return !!variants && variants.options.some((o) => isCornerSideOptionName(o.name));
}

// Wlacza/wylacza wybor strony. Idempotentne w obie strony (bez zmian, gdy
// stan docelowy juz zastany — zwraca wejscie bez kopiowania).
//
// Wlaczanie: kanoniczna opcja "Strona" jako PIERWSZA (nad "Tkanina").
// Wylaczanie: usuwa opcje side-like. Ostatnia opcja → null (produkt bez wariantow).
export function applyCornerSideSelection(
  variants: ProductVariants | null,
  enabled: boolean
): ProductVariants | null {
  if (enabled) {
    if (hasCornerSideOption(variants)) return variants;
    const base = variants ?? { options: [] };
    const sideOption: ProductOption = {
      name: CORNER_SIDE_OPTION_NAME,
      values: [...CORNER_SIDE_VALUES],
    };
    return { ...base, options: [sideOption, ...base.options] };
  }

  if (!variants || !hasCornerSideOption(variants)) return variants;
  const options = variants.options.filter((o) => !isCornerSideOptionName(o.name));
  if (options.length === 0) return null;
  return { ...variants, options };
}
