// Czyste helpery do bezpiecznego budowania filtrów PostgREST / ILIKE z user
// inputu. Wydzielone z products.ts, żeby były testowalne bez mockowania
// supabase (jak safe-redirect).

import { synonymsFor } from "./search-vocabulary";

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

// Ranking wyników wyszukiwania — TRZY poziomy trafności:
//
//   1. nazwa zawiera każdy token w formie ZŁOŻONEJ, ale NIEzestemowanej
//      (dokładne trafienie, modulo wielkość liter, ogonki i spacje),
//   2. nazwa zawiera każdy token co najmniej RDZENIEM po stemie,
//   3. reszta — dopasowanie wyłącznie przez opis.
//
// Wyszukiwarka szuka po name+description (kolumna search_key_fold), więc np.
// „materac" łapie też łóżka kontynentalne (boxspring z materacem w opisie) —
// poziom 3 trzyma je pod faktycznymi materacami, bez utraty szukania po treści.
//
// Po co poziom 1: stem obcina 4-literowe słowo kończące się samogłoską do
// 3 znaków, a 3-literowy rdzeń zderza się z popularnymi słowami z nazw. Pomiar
// na produkcji 2026-08-13: tkanina „POSO" (rdzeń „pos") to 3 dopasowania
// dokładne wobec 41 przez rdzeń, z czego 21 to „…na pościel" w NAZWIE. Bez
// poziomu 1 hałas siedzi w tej samej, najwyższej grupie i wygrywa świeższą
// datą — POSO ląduje na pozycjach 22-23 (strona 2 przy limicie 12), a
// w rozwijce podpowiedzi nie ma go wcale. To samo dotyczy „Liva" (4 vs 18,
// 14 razy kolekcja „Livia" w nazwie) i „Elio" (11 vs 37).
//
// Fraza wieloczłonowa: na poziom 1 wchodzi tylko wiersz, w którym KAŻDY token
// trafia dokładnie. Fraza mieszana (jeden token dokładnie, drugi dopiero
// rdzeniem) idzie na poziom 2 — inaczej „poso łóżko" wpuściłoby na szczyt
// łóżka „…na pościel" (dokładne „lozko" + rdzeń „pos") obok prawdziwych POSO,
// czyli wróciłby dokładnie ten hałas, który poziom 1 ma usuwać. Poziom 1 znaczy
// „nic nie musiałem rozszerzać stemem", i tylko taka definicja jest odporna.
//
// Poziom 2 to DOKŁADNIE ten sam zbiór, który przed rozbiciem był całą grupą
// „trafienie w nazwie" (warunek wejścia to nadal „każdy rdzeń w kluczu"),
// a forma złożona zawiera rdzeń jako prefiks, więc poziom 1 jest jego
// podzbiorem. Recall się nie zmienia, a fraza bez ani jednego dokładnego
// trafienia (np. „sofy" — żadna nazwa nie ma „sofy") daje pusty poziom 1
// i kolejność bit w bit jak wcześniej.
//
// Synonimy (search-vocabulary.ts) liczą się na poziomie 2, nigdy na 1. „kanapa"
// nie występuje w żadnej nazwie sofy, więc bez tego wszystkie sofy wpadałyby na
// poziom 3 i mieszały się z szumem opisowym. Poziom 1 dalej znaczy „nic nie
// musiałem rozszerzać" — ani stemem, ani słownikiem.
//
// Kolejność wewnątrz każdego poziomu jest zachowana (stabilna), więc sort z DB
// (alfabetyczny/cena/nowość) rozstrzyga remisy. Fraza pusta po sanityzacji →
// wejście bez zmian.
export function rankByNameMatch<T>(
  rows: T[],
  raw: string,
  getName: (row: T) => string | null | undefined
): T[] {
  const forms = searchKeyTokenForms(raw);
  if (forms.length === 0) return rows;
  const exactHits: T[] = [];
  const stemHits: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    // Klucz nazwy budowany DOKŁADNIE jak kolumna search_key_fold w bazie:
    // złożone znaki, małe litery, bez spacji. Tokeny są już złożone, więc
    // żadnego toLowerCase() na nich nie potrzeba.
    const key = foldDiacritics(getName(row) ?? "").replace(/\s+/g, "");
    if (!forms.every((f) => synonymsFor(f.stem).some((alt) => key.includes(alt)))) {
      rest.push(row);
    } else if (forms.every((f) => key.includes(f.fold))) {
      exactHits.push(row);
    } else {
      stemHits.push(row);
    }
  }
  return [...exactHits, ...stemHits, ...rest];
}

// Składanie znaków diakrytycznych na ASCII: 12 znaków w mapie + ß→ss.
//
// ⚠️ TEN ZESTAW MUSI ODPOWIADAĆ wyrażeniom translate()/replace() w OBU
// kolumnach generowanych: search_key_fold (migracja
// 74_search_key_fold_pl_de_znaki.sql — do 74 kolumna PL składała tylko
// 9 polskich znaków i ten komentarz kłamał) oraz search_key_fold_de
// (migracja 73_search_key_fold.sql). Rozjazd nie wywala błędu — cicho zeruje
// wyszukiwanie, bo token przestaje trafiać w klucz. Zmieniasz tu → zmieniasz
// w obu migracjach.
//
// ä ö ü są tu, mimo że dziś ŻADEN produkt nie ma ich w polach PL (pomiar
// 2026-08-13: 0 na 361). Pola DE już je mają, bo dostawca tak nazywa tkaniny,
// więc „Fotel Björn" jest kwestią czasu — a bez tego byłby nieznajdywalny
// KAŻDĄ pisownią.
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

// Dwie formy jednego tokenu frazy: `fold` to forma złożona na ASCII BEZ stemu
// (dokładna pisownia klienta), `stem` to ta sama forma po obcięciu końcówki.
// Filtr do bazy pyta rdzeniem (łapie więcej form), ranking potrzebuje obu, żeby
// odróżnić dokładne trafienie w nazwie od trafienia dopiero rdzeniem.
export type SearchTokenForms = { fold: string; stem: string };

// Tokeny frazy w OBU formach. Potok identyczny jak w searchKeyTokens:
// sanityzacja (przez searchTokens — w tym ochrona przed injection w .or())
// → złożenie znaków → obcięcie końcówki, z deduplikacją PO RDZENIU.
//
// Deduplikacja po rdzeniu jest celowa i wiążąca: searchKeyTokens jest
// zdefiniowany jako `.map((t) => t.stem)` na wyniku tej funkcji, więc oba
// wywołania zawsze zgadzają się co do tego, KTÓRE tokeny muszą wystąpić.
// Przy „sofa sofy" (jeden rdzeń „sof") zostaje forma pierwszego wystąpienia,
// czyli „sofa" — dla poziomu 1 rankingu to i tak najostrzejszy sensowny
// wariant, bo drugi token dodałby wymóg, który jest tym samym słowem.
//
// Ta funkcja służy WYŁĄCZNIE rankingowi (rankByNameMatch). Trzy miejsca
// budujące filtr do bazy wołają searchKeyTokens i mają tak zostać.
export function searchKeyTokenForms(raw: string): SearchTokenForms[] {
  const forms: SearchTokenForms[] = [];
  const seen = new Set<string>();
  for (const token of searchTokens(raw)) {
    const fold = foldDiacritics(token);
    if (!fold) continue;
    const stem = stemToken(fold);
    if (seen.has(stem)) continue;
    seen.add(stem);
    forms.push({ fold, stem });
  }
  return forms;
}

// Tokeny gotowe do dopasowania przeciwko kolumnie search_key_fold: rdzenie
// z searchKeyTokenForms, w kolejności wystąpienia, bez duplikatów — „sofa sofy"
// daje jedno „sof", bo dwa identyczne warunki ILIKE to zbędna praca dla bazy.
export function searchKeyTokens(raw: string): string[] {
  return searchKeyTokenForms(raw).map((forms) => forms.stem);
}

// Grupy alternatyw dla filtra do bazy: każdy token frazy zamienia się w listę
// „on sam plus jego synonimy" (patrz search-vocabulary.ts).
//
// Filtr ANDuje grupy między sobą (każde słowo frazy musi wystąpić) i ORuje
// alternatywy wewnątrz grupy (w którejkolwiek postaci). Liczba grup jest
// zawsze równa liczbie tokenów z searchKeyTokens — inaczej filtr wymagałby
// czego innego niż ranking.
//
// Ranking NIE używa tej funkcji: on potrzebuje wiedzieć, którą formą token
// trafił, i woła searchKeyTokenForms + synonymsFor osobno.
export function searchKeyTokenGroups(raw: string): string[][] {
  return searchKeyTokens(raw).map((token) => synonymsFor(token));
}

// Warunek dla jednej grupy alternatyw, wspólny dla trzech konsumentów — żeby
// składnia PostgREST siedziała w jednym miejscu, a nie w trzech kopiach.
//
// Grupa jednoelementowa idzie zwykłym .ilike() (czytelniejsze i tańsze).
// Grupa z synonimami idzie .or(), gdzie wildcardem jest `*`, NIE `%` — to inna
// składnia niż w metodzie .ilike(). Wiele .or() na zapytaniu jest ANDowanych,
// tak samo jak wiele .ilike().
//
// Zmierzone na produkcji 2026-08-13 (klucz anon, te same RLS co storefront):
// `.ilike("search_key_fold", "%kanap%")` → 0 wierszy, a
// `.or("search_key_fold.ilike.*kanap*,search_key_fold.ilike.*sof*")` → 41,
// czyli dokładnie tyle, ile samo „sof". Gwiazdka JEST wildcardem: ten sam
// operand z nieistniejącym rdzeniem daje 0, więc nie jest brana literalnie.
// (`%` w tej pozycji też działa, ale `*` to składnia dokumentowana.) Dwa .or()
// na jednym zapytaniu dały 25 — tyle samo, co dwa .ilike() na rdzeniach.
//
// Bezpieczeństwo: tokeny przeszły już sanitizeSearchTerm (usuwa `, . ( )` oraz
// wildcardy), a wartości słownika są ograniczone testem do [a-z0-9]+. Do tego
// escapeIlike na każdym operandzie — mimo że po tej sanityzacji jest no-opem,
// bo nie ma już czego escapować. Jego backslash escapuje TAK SAMO wewnątrz
// .or(), jak w metodzie .ilike() (pomiar 2026-08-13: `*\_*` → 0 wierszy przy
// `*_*` → 353, a `*s\of*` → 41 jak `*sof*`), więc dla `%`, `_` i `\` ta
// warstwa trzyma w obu składniach.
//
// ⚠️ ZAKRES escapeIlike TO DOKŁADNIE `%`, `_` i `\` — NIE `*`. A `*` jest
// wildcardem w wartości podawanej do .or() (na tym stoi cały ten helper), więc
// operand z gwiazdką przeszedłby przez escapeIlike nietknięty i po cichu
// rozszerzył dopasowanie. `*` odsiewa dopiero sanityzacja FRAZY
// (sanitizeSearchTerm: litery, cyfry, spacja, myślnik) plus test kształtu
// słownika [a-z0-9]+ — nie ten helper. Kto poluzuje tamtą allowlistę (realny
// scenariusz: „klient musi móc wpisać `&` w nazwie tkaniny"), musi zadbać
// o `*` tutaj, LOKALNIE. Do globalnego escapeIlike gwiazdki mimo to nie
// dopisywać — ale NIE dlatego, że w metodzie .ilike() (m.in. linkGuestOrders)
// `*` wildcardem nie jest. JEST nim w obu składniach: pomiar 2026-08-13 na
// prostym filtrze, bez .or(), dał `search_key_fold=ilike.*sof*` → 41 wierszy,
// dokładnie tyle co `ilike.%sof%`, przy `ilike.sof` → 0 i `ilike.*zzzsofzzz*`
// → 0. Metoda .ilike() nie przekształca wzorca (postgrest-js emituje dosłownie
// `col=ilike.<wzorzec>`), więc `*` aliasuje sam PostgREST na poziomie operatora
// ilike — niezależnie od tego, czy operand siedzi w .or(), czy nie.
// Powód zakazu jest inny: backslash najpewniej NIE robi z gwiazdki literału
// (skoro PostgREST mapuje `*`→`%` w całym wzorcu, `\*` wychodzi jako `\%`,
// czyli dosłowny procent) — i tego NIKT nie zmierzył. Gwiazdkę odsiewa się
// więc WYCINANIEM w sanitizeSearchTerm, nie escapowaniem; escapeIlike i tak by
// tu nie pomógł, a globalnie ruszany być nie musi.
export function applyTokenGroup<Q extends {
  ilike: (col: string, pattern: string) => Q;
  or: (filters: string) => Q;
}>(query: Q, keyCol: string, group: string[]): Q {
  // Pusta grupa → zapytanie bez zmian, zamiast `.or("")`. Trzej konsumenci tu
  // nie trafią (synonymsFor zwraca zawsze co najmniej sam rdzeń), ale helper
  // jest eksportowany i generyczny, a `.or("")` wysłałoby do PostgREST pusty
  // warunek: zniekształcony filtr, którego nikt nie chciał, i to bez śladu
  // w logach. Skoro grupa nie stawia żadnego wymagania, niech to będzie widać.
  if (group.length === 0) return query;
  if (group.length === 1) {
    return query.ilike(keyCol, `%${escapeIlike(group[0])}%`);
  }
  return query.or(
    group.map((alt) => `${keyCol}.ilike.*${escapeIlike(alt)}*`).join(",")
  );
}
