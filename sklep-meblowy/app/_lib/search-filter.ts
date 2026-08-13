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
// (alfabetyczny/cena/nowość) pozostaje w mocy. Dopasowanie po tych samych
// tokenach co filtr DB (searchKeyTokens) i po tak samo złożonej nazwie —
// czyli niezależnie od wielkości liter, ogonków i końcówki fleksyjnej. Fraza
// pusta po sanityzacji → wejście bez zmian.
export function rankByNameMatch<T>(
  rows: T[],
  raw: string,
  getName: (row: T) => string | null | undefined
): T[] {
  const tokens = searchKeyTokens(raw);
  if (tokens.length === 0) return rows;
  const nameHits: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    // Klucz nazwy budowany DOKŁADNIE jak kolumna search_key_fold w bazie:
    // złożone znaki, małe litery, bez spacji. Tokeny są już złożone i
    // zestemowane, więc żadnego toLowerCase() na nich nie potrzeba.
    const key = foldDiacritics(getName(row) ?? "").replace(/\s+/g, "");
    if (tokens.every((t) => key.includes(t))) nameHits.push(row);
    else rest.push(row);
  }
  return [...nameHits, ...rest];
}

// Składanie znaków diakrytycznych na ASCII.
//
// ⚠️ TA LISTA MUSI ODPOWIADAĆ wyrażeniu translate()/replace() w migracji
// 73_search_key_fold.sql. Rozjazd nie wywala błędu — cicho zeruje wyszukiwanie,
// bo token przestaje trafiać w klucz. Zmieniasz tu → zmieniasz tam.
//
// ß jest dwuznakiem (→ ss), więc idzie osobnym replace, a nie mapą 1:1.
const FOLD_MAP: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
  ä: "a",
  ö: "o",
  ü: "u",
};

export function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[ąćęłńóśźżäöü]/g, (ch) => FOLD_MAP[ch] ?? ch);
}

// Końcówki fleksyjne w formie JUŻ ZŁOŻONEJ (po foldDiacritics), posortowane od
// najdłuższej — inaczej „materacami" straciłoby samo „i" zamiast „ami".
// „ów" po złożeniu to „ow", „ą" to „a", „ę" to „e", dlatego lista jest krótsza,
// niż wyglądałaby dla surowej polszczyzny.
const STEM_SUFFIXES = [
  "ami",
  "ach",
  "owi",
  "iem",
  "ow",
  "om",
  "ie",
  "em",
  "y",
  "i",
  "e",
  "a",
  "u",
  "o",
];

// Minimalna długość rdzenia po obcięciu. 3, nie 4 — przy progu 4 fraza „sofy"
// (rdzeń „sof") nie zostałaby zestemowana i dalej dawałaby zero wyników.
export const MIN_STEM_LENGTH = 3;

// Obcina JEDNĄ końcówkę. Dopasowanie w bazie jest podciągiem, więc krótszy
// rdzeń łapie wszystkie dłuższe formy — stemowanie może tylko DODAĆ trafienia,
// nigdy odebrać.
export function stemToken(token: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (
      token.length - suffix.length >= MIN_STEM_LENGTH &&
      token.endsWith(suffix)
    ) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

// Tokeny gotowe do dopasowania przeciwko kolumnie search_key_fold: sanityzacja
// (jak searchTokens — w tym ochrona przed injection w .or()) → złożenie znaków
// → obcięcie końcówki.
//
// Duplikaty po stemowaniu są odfiltrowane: „sofa sofy" daje dwa razy „sof",
// a dwa identyczne warunki ILIKE to zbędna praca dla bazy.
export function searchKeyTokens(raw: string): string[] {
  const stemmed = searchTokens(raw).map((token) =>
    stemToken(foldDiacritics(token))
  );
  return [...new Set(stemmed)].filter(Boolean);
}
