import { stemToken } from "./search-filter";

// Normalizacja tekstu do porównań w wyszukiwarkach (filtr listy produktów
// w adminie): małe litery, bez diakrytyków, bez skrajnych spacji — „lozko"
// znajduje „Łóżko". NFD rozkłada ą/ę/ó/ś/ż/ź/ć/ń na literę + znak łączący
// (zdejmowany regexem), ale ł/Ł NIE ma dekompozycji w Unicode — mapujemy
// jawnie (po toLowerCase wystarczy „ł").
//
// Uwaga na różnicę wobec foldDiacritics z search-filter.ts: tam mapa 1:1 na
// stałej liście znaków (musi się zgadzać z translate() w bazie), tu NFD, czyli
// dowolny diakrytyk i formy zdekomponowane. Ta ścieżka nie dotyka bazy, więc
// nie ma czego z czym synchronizować. Jedyne, czego NFD nie zdejmuje, to ß.
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Tokeny frazy: znormalizowane słowa, bez pustych. Pusta fraza → pusta lista,
// a `every` na pustej liście jest prawdą, więc filtr wtedy nie zawęża.
function queryTokens(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

// Wspólny predykat: każdy token musi być podłańcuchem odspacjowanego siana.
// Spacje lecą z OBU stron, dzięki czemu „chillme" znajduje „Chill Me".
function matchesTokens(haystack: string, tokens: string[]): boolean {
  const key = normalizeSearchText(haystack).replace(/\s+/g, "");
  return tokens.every((t) => key.includes(t));
}

// Dopasowanie odporne na spacje i kolejność słów: normalizujemy obie strony
// (małe litery, bez diakrytyków — przez normalizeSearchText), z „siana" usuwamy
// WSZYSTKIE spacje, frazę tniemy na słowa; trafienie = każde słowo jest
// podłańcuchem odspacjowanego siana. Pusta fraza → true (nie zawęża).
export function searchMatches(haystack: string, query: string): boolean {
  return matchesTokens(haystack, queryTokens(query));
}

// Filtr listy odporny DODATKOWO na odmianę: „sofy" znajduje „Sofa Modena".
//
// Dwa przebiegi, nie jeden. Najpierw dopasowanie DOKŁADNE — bit w bit to samo,
// co robił dotąd searchMatches. Dopiero gdy nie zwróci NICZEGO, powtarzamy je
// na rdzeniach po obcięciu końcówki fleksyjnej (stemToken, ten sam co w
// wyszukiwarce sklepu).
//
// Dlaczego fallback, a nie stemowanie od razu: te listy nie mają rankingu.
// Rdzeń 3-znakowy z 4-literowej nazwy własnej łapie popularne słowa — „poso"
// (tkanina) daje rdzeń „pos", który siedzi w „pościel" w 21 nazwach. Przy
// stemowaniu od razu trzy właściwe pozycje utonęłyby wśród dwudziestu jednu
// nietrafionych i nic by ich nie wypchnęło na wierzch. Przy fallbacku „poso"
// ma trafienia dokładne, więc drugi przebieg w ogóle nie startuje.
//
// Właściwość bezpieczeństwa jak w migracji 73: może tylko DODAĆ wyniki, nigdy
// odebrać. Pierwszy przebieg jest niezmieniony, a drugi odpala się wyłącznie
// tam, gdzie dziś jest pusto.
//
// getTexts zwraca pola do sprawdzenia; trafienie w KTÓRYMKOLWIEK z nich
// wystarcza (lista produktów w adminie szuka po nazwie ALBO po kategorii).
export function filterBySearch<T>(
  items: T[],
  query: string,
  getTexts: (item: T) => (string | null | undefined)[]
): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return items;

  const match = (item: T, toks: string[]) =>
    getTexts(item).some((text) => !!text && matchesTokens(text, toks));

  const exact = items.filter((item) => match(item, tokens));
  if (exact.length > 0) return exact;

  // Tokeny są już złożone do ASCII przez normalizeSearchText, czyli w formie,
  // której oczekuje stemToken. Gdy obcięcie nic nie zmienia, drugi przebieg
  // dałby ten sam pusty wynik — nie ma po co go puszczać.
  const stems = tokens.map(stemToken);
  if (stems.every((s, i) => s === tokens[i])) return exact;

  return items.filter((item) => match(item, stems));
}
