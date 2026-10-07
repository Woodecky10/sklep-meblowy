// Ile produktów na stronę pokazuje /sklep — wybór klienta z przycisku „Pokaż”
// w FilterBarze, niesiony w adresie jak sortowanie. Moduł CZYSTY: czyta go
// i strona serwerowa, i FilterBar (komponent kliencki).

export const PER_PAGE_PARAM = "na_stronie";

// Każda wartość dzieli się przez 2, 3 i 4 — ostatni rząd siatki (1/2/3/4
// kolumny zależnie od szerokości) jest zawsze pełny.
export const PER_PAGE_OPTIONS = [12, 24, 48] as const;

export const DEFAULT_PER_PAGE = 12;

// Tylko wartości z listy. clampLimit w products.ts przepuściłby do 100 —
// tu lista jest ciaśniejsza celowo, żeby adres nie wymuszał dowolnej liczby kart.
export function parsePerPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PER_PAGE_OPTIONS.find((n) => String(n) === value) ?? DEFAULT_PER_PAGE;
}
