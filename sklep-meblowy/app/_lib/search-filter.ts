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

// Maksymalna liczba słów frazy branych pod uwagę (ochrona przed abuse/długim
// zapytaniem). Fraza jest tokenizowana; każde słowo → osobny warunek ILIKE.
export const MAX_SEARCH_TOKENS = 10;

// Tokeny frazy: sanityzacja (allowlist + zwinięcie spacji) → słowa → limit.
export function searchTokens(raw: string): string[] {
  const term = sanitizeSearchTerm(raw);
  if (!term) return [];
  return term.split(" ").filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
}

// Ranking wyników wyszukiwania: produkty z frazą w NAZWIE przed tymi, które
// dopasowały się tylko przez opis. Wyszukiwarka szuka po name+description
// (search_key), więc np. „materac" łapie też łóżka kontynentalne (boxspring z
// materacem w opisie). Ten ranking wypycha faktyczne materace na górę,
// zachowując trafienia z opisu niżej — bez utraty wyszukiwania po treści.
//
// Kolejność wewnątrz każdej grupy jest zachowana (stabilna), więc sort z DB
// (alfabetyczny/cena/nowość) pozostaje w mocy. Dopasowanie case-insensitive
// (jak ILIKE) i po tych samych tokenach co filtr DB — bez
// diakrytyko-niezależności (identycznie jak zapytanie). Fraza pusta po
// sanityzacji → wejście bez zmian (nie ma czego rankować).
export function rankByNameMatch<T>(
  rows: T[],
  raw: string,
  getName: (row: T) => string | null | undefined
): T[] {
  const tokens = searchTokens(raw);
  if (tokens.length === 0) return rows;
  const nameHits: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    // Odspacjowana, małoliterowa nazwa — spójnie z kolumną search_key (bez
    // zdejmowania diakrytyków). Trafienie w nazwie = KAŻDE słowo obecne.
    const key = (getName(row) ?? "").toLowerCase().replace(/\s+/g, "");
    if (tokens.every((t) => key.includes(t.toLowerCase()))) nameHits.push(row);
    else rest.push(row);
  }
  return [...nameHits, ...rest];
}
