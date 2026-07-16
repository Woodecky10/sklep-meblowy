// Czyste helpery do bezpiecznego budowania filtrów PostgREST / ILIKE z user
// inputu. Wydzielone z products.ts, żeby były testowalne bez mockowania
// supabase (jak safe-redirect).

// Escape znaków specjalnych ILIKE (% _ \) w wartości dopasowania — bez tego
// user mógłby użyć wildcardów. Zachowuje dosłowną treść (np. email z "_").
export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

// Sanityzacja frazy wyszukiwania przed wstrzyknięciem w PostgREST .or().
// Audyt 2026-06-11 (MEDIUM): escapowaliśmy tylko wildcardy ILIKE (% _ \), ale
// NIE składni .or() (`, . ( )`). `q=x,price.gt.0` wstrzykiwało dodatkowy
// warunek OR (blind-boolean enumeracja po kolumnach products), a `(`/`)`
// rozbijał filtr → 500 na /sklep. Allowlist: litery (dowolny alfabet, w tym
// polskie znaki), cyfry, spacja, myślnik. Usuwa WSZYSTKIE znaki znaczące dla
// .or() ORAZ wildcardy ILIKE — fraza trafia do zapytania jako czysty literał.
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Buduje filtr .or() (name/description ILIKE) z odsanityzowanej frazy.
// Zwraca null gdy po sanityzacji nic nie zostaje (pusta/sama-interpunkcja
// fraza = nie zawężaj wyników).
//
// `locale==='de'` szuka po kolumnach _de (name_de/description_de). UWAGA:
// celowo NIE fallbackujemy do PL przy wyszukiwaniu — produkty bez tłumaczenia
// DE nie matchują się na DE search dopóki nie zostaną przetłumaczone (decyzja
// projektowa: wyniki DE pokazują tylko przetłumaczoną treść).
export function buildSearchOrFilter(
  raw: string,
  locale: "pl" | "de" = "pl"
): string | null {
  const term = sanitizeSearchTerm(raw);
  if (!term) return null;
  const nameCol = locale === "de" ? "name_de" : "name";
  const descCol = locale === "de" ? "description_de" : "description";
  return `${nameCol}.ilike.%${term}%,${descCol}.ilike.%${term}%`;
}

// Ranking wyników wyszukiwania: produkty z frazą w NAZWIE przed tymi, które
// dopasowały się tylko przez opis. Wyszukiwarka szuka po name+description
// (buildSearchOrFilter), więc np. „materac" łapie też łóżka kontynentalne
// (boxspring z materacem w opisie). Ten ranking wypycha faktyczne materace na
// górę, zachowując trafienia z opisu niżej — bez utraty wyszukiwania po treści.
//
// Kolejność wewnątrz każdej grupy jest zachowana (stabilna), więc sort z DB
// (alfabetyczny/cena/nowość) pozostaje w mocy. Dopasowanie case-insensitive
// (jak ILIKE) i po tej samej sanityzowanej frazie co filtr DB — bez
// diakrytyko-niezależności (identycznie jak zapytanie). Fraza pusta po
// sanityzacji → wejście bez zmian (nie ma czego rankować).
export function rankByNameMatch<T>(
  rows: T[],
  raw: string,
  getName: (row: T) => string | null | undefined
): T[] {
  const term = sanitizeSearchTerm(raw).toLowerCase();
  if (!term) return rows;
  const nameHits: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    if ((getName(row) ?? "").toLowerCase().includes(term)) nameHits.push(row);
    else rest.push(row);
  }
  return [...nameHits, ...rest];
}
