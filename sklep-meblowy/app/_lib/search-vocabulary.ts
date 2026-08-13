// Wiedza o tym, jak klient nazywa to, co sklep sprzedaje — i czego sklep nie
// sprzedaje. Jedno miejsce, ręcznie utrzymywane.
//
// ⚠️ TA LISTA SIĘ ZESTARZEJE I NIC O TYM NIE PRZYPOMNI. Gdy sklep zacznie
// sprzedawać nową rodzinę produktów, wpisy trzeba dopisać ręcznie. Świadome
// ograniczenie: zbiór jest domknięty (siedem rodzin: łóżka, materace,
// narożniki, sofy, fotele, pufy, schodki), a nowa rodzina produktów to i tak
// zmiana z udziałem programisty.
//
// Klucze i wartości to RDZENIE po złożeniu znaków i obcięciu końcówki, czyli
// dokładnie to, co zwraca searchKeyTokens() z search-filter.ts. NIE surowe
// słowa — inaczej „kanapy" nie trafiłoby we wpis „kanapa". Test w
// __tests__/search-vocabulary.test.ts pilnuje, że każdy klucz jest naprawdę
// osiągalny dla tokenizera.
//
// Mapowanie jednokierunkowe: słowo klienta → słowo z katalogu. W drugą stronę
// nie ma sensu, bo „kanapa" nie występuje w żadnej nazwie produktu.
//
// Liczby w komentarzach to pomiar na produkcji 2026-08-13 (349 aktywnych
// pozycji): ile produktów zawiera dany rdzeń w kolumnie search_key_fold.
//
// ⚠️ OBA SŁOWNIKI TO `Map`, NIE LITERAŁY OBIEKTOWE — i tak ma zostać.
// Kluczem jest tu rdzeń FRAZY OD KLIENTA, a odczyt z literału obiektowego
// schodzi na łańcuch prototypu: `SEARCH_SYNONYMS["constructor"]` zwracało
// funkcję `Object` — wartość prawdziwościowo prawdziwą i NIEiterowalną — więc
// `[stem, ...extra]` rzucało `TypeError`, czyli 500 z publicznego
// `/sklep?q=constructor` i z `/api/search/suggest`. `Map.get()` zna wyłącznie
// własne klucze, więc problem znika z całej KLASY błędów, a nie z jednego
// wywołania: kolejny helper w tym pliku nie ma jak go wskrzesić. Regresję
// pilnuje test „klucze z łańcucha prototypu" w __tests__.
export const SEARCH_SYNONYMS: ReadonlyMap<string, readonly string[]> = new Map([
  // → sofy (rdzeń „sof": 41)
  ["kanap", ["sof"]],
  ["kanapk", ["sof"]],
  ["wersalk", ["sof"]],
  ["sofk", ["sof"]], // zdrobnienie; stem nie zejdzie z „sofk" na „sof"
  ["otoman", ["sof"]],
  ["szezlong", ["sof"]],
  ["lezank", ["sof"]],
  ["tapczan", ["sof", "lozk"]], // bywa i sofą, i łóżkiem
  // → narożniki (rdzeń „naroznik": 40)
  ["kacik", ["naroznik"]], // „kącik wypoczynkowy"
  // → pufy (rdzeń „puf": 9)
  ["podnozek", ["puf"]],
  ["podnozk", ["puf"]], // dwa klucze: stem różni się dla „podnóżek" i „podnóżka"
  // → łóżka (rdzeń „lozk": 167)
  ["lozeczk", ["lozk"]], // NAJWAŻNIEJSZY WPIS: 41 łóżek dziecięcych, dziś zero wyników
  ["poslan", ["lozk"]],
  ["boxspring", ["kontynentaln"]], // boxspring to łóżko kontynentalne („kontynentaln": 113)
  // → materace (157), fotele (9), dziecięce (25)
  ["materacyk", ["materac"]],
  ["fotelik", ["fotel"]],
  ["dziecinn", ["dzieciec"]], // katalog mówi „dziecięce", klient też „dziecinne"
]);

// Rzeczy, których sklep NIE prowadzi. Wartość to nazwa w DOPEŁNIACZU liczby
// mnogiej, wstawiana do komunikatu „Nie prowadzimy ...".
//
// Sprawdzane WYŁĄCZNIE przy zerowym wyniku, więc kolizja z realnym produktem
// jest niemożliwa: gdyby sklep zaczął sprzedawać stoliki, fraza „stol" coś by
// zwróciła i do tej gałęzi nigdy byśmy nie doszli. Pomiar 2026-08-13: każdy
// z tych rdzeni daje dziś 0 trafień.
//
// `Map` z tego samego powodu co wyżej: klucz pochodzi od klienta.
export const NOT_CARRIED: ReadonlyMap<string, { pl: string; de: string }> =
  new Map([
    ["szaf", { pl: "szaf", de: "Schränke" }],
    ["komod", { pl: "komód", de: "Kommoden" }],
    ["stol", { pl: "stołów", de: "Tische" }],
    ["krzesl", { pl: "krzeseł", de: "Stühle" }],
    ["biurk", { pl: "biurek", de: "Schreibtische" }],
    ["dywan", { pl: "dywanów", de: "Teppiche" }],
    ["lamp", { pl: "lamp", de: "Lampen" }],
    ["regal", { pl: "regałów", de: "Regale" }],
  ]);

// Alternatywy dla jednego rdzenia: on sam plus jego synonimy. Bez wpisu
// w słowniku zwraca jednoelementową listę, więc wołający nie musi rozgałęziać.
export function synonymsFor(stem: string): string[] {
  const extra = SEARCH_SYNONYMS.get(stem);
  return extra ? [stem, ...extra] : [stem];
}

// Nazwa rzeczy nieprowadzonej dla pierwszego rdzenia frazy, który ją opisuje.
// null = fraza nie dotyczy niczego z listy, czyli zero wyników ma inny powód.
export function notCarriedLabel(
  stems: string[],
  locale: "pl" | "de"
): string | null {
  for (const stem of stems) {
    const entry = NOT_CARRIED.get(stem);
    if (entry) return entry[locale];
  }
  return null;
}
