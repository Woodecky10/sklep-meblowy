// Wiedza o tym, jak klient nazywa to, co sklep sprzedaje — i czego sklep nie
// sprzedaje. Jedno miejsce, ręcznie utrzymywane.
//
// Na dole pliku dochodzi druga, AUTOMATYCZNA część tej wiedzy:
// buildCatalogVocabulary() wyprowadza słownik poprawnych słów wprost z nazw
// produktów, dla poprawiania literówek (search-typos.ts).
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

// ⚠️ Ten jeden import zamyka CYKL: search-filter.ts importuje stąd synonymsFor.
// Cykl jest bezpieczny i taki ma zostać, bo ŻADEN z tych dwóch modułów nie woła
// niczego z drugiego na poziomie modułu — oba sięgają po import dopiero w ciele
// funkcji, a deklaracje funkcji są hoistowane. Oba porządki inicjalizacji są
// realnie przechodzone przez testy (search-filter.test.ts ładuje najpierw filtr,
// search-vocabulary.test.ts najpierw ten plik). Alternatywą byłoby przepisanie
// składania znaków tutaj, czyli DRUGIE źródło prawdy o foldowaniu obok FOLD_MAP
// i obu kolumn generowanych w bazie — a rozjazd takich kopii nie wywala błędu,
// tylko po cichu zeruje trafienia (ten sam argument stoi przy FOLD_MAP).
import { foldDiacritics } from "./search-filter";

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

// ─────────────────────────────────────────────────────────────────────────────
// Słownik poprawnych słów dla korekty literówek (search-typos.ts).
//
// Źródłem są NAZWY produktów, nie opisy — i to nie jest ekonomia zapytania.
// Nazwa jest tym, co klient przepisuje z pamięci albo z rozmowy, więc to w niej
// robi literówkę. Opis to zdania marketingowe: wpuszczenie ich zamieniłoby wagę
// „w ilu produktach to słowo jest w nazwie" w „jak często copywriter użył tego
// słowa", a Task 1 rozstrzyga wagą REMISY — czyli dokładnie te przypadki, gdzie
// dwa kandydaci są tak samo blisko i decyduje popularność. Pomiar na produkcji
// 2026-08-17: opis ma WYPEŁNIONY 24 produkty z 353 (329 pustych), więc dziś
// opisy wniosłyby garść słów z przypadkowych 7% katalogu — waga byłaby losowa,
// nie rzadsza.
// ─────────────────────────────────────────────────────────────────────────────

// Minimalna długość słowa wpuszczanego do słownika.
//
// Trzy znaki, i to nie jest oszczędność pamięci: maxTypos() daje próg 0 dla
// słów do trzech znaków i 1 dopiero od czterech, a editDistanceWithin ucina
// parę, gdy sama różnica długości przekracza próg. Słowo 2-znakowe jest więc
// nieosiągalne dla KAŻDEGO tokenu (4-znakowy ma budżet 1, a różnica to już 2),
// czyli byłoby czystym balastem w pętli po całym słowniku — a ta pętla leci
// z /api/search/suggest, najgorętszego endpointu sklepu.
//
// ⚠️ Słowa 3-znakowe zostają OSIĄGALNE, ale WYŁĄCZNIE dla tokenów 4-znakowych
// (próg 1, różnica długości 1; przy 5 znakach różnica to już 2 i para odpada
// bez liczenia). Pomiar na produkcji 2026-08-17: nazwy dają 13 takich słów
// (`dla`:17 z „dla dzieci i młodzieży", `mio`:15 i `flo`:4 i `leo`:4 to nazwy
// kolekcji, `t25`:9 to model materaca, `box`:8 z „łóżko kontynentalne box",
// `rog`:3 z „Róg Lova P", plus `100`, `120`, `150`, `bez`, `hit`, `psa` po 1)
// oraz dwa rdzenie ze słowników ręcznych (`sof`, `puf`). Zmierzone skutki są
// w większości TRAFNE („boxy" → `box`, „rogi"/„rogu" → `rog`), a pomyłki nie są
// specyficzne dla trzech znaków — patrz test „słowa 3-literowe — czy kradną
// poprawki".
export const MIN_VOCABULARY_WORD_LENGTH = 3;

// Cięcie nazwy na słowa: wszystko, co nie jest literą ani cyfrą. Klasy
// unicode (\p{L}\p{N}), NIE [a-z0-9] — cięcie idzie PRZED złożeniem znaków,
// więc „Łóżko" musi zostać jednym słowem. Separatory zmierzone w nazwach na
// produkcji 2026-08-17: spacja, `-`, `–`, `,`, `!`, `(`, `)`, `/`, `|`.
// Cyfry zostają w słowie, bo „120x200" (41 produktów) to realna fraza.
const WORD_SEPARATORS = /[^\p{L}\p{N}]+/u;

// Słownik poprawnych słów: klucz = słowo złożone do ASCII, wartość = waga.
//
// ⚠️ WAGA TO LICZBA PRODUKTÓW, W KTÓRYCH SŁOWO WYSTĘPUJE — nie liczba
// wystąpień. Nazwa „Sofa sofa Modena" wnosi do `sofa` dokładnie 1. Zliczanie
// wystąpień promowałoby nazwy z powtórzeniem słowa zamiast słów naprawdę
// rozpowszechnionych w katalogu, a waga rozstrzyga remisy w pickCorrection.
//
// ⚠️ ZWRACAMY `Map`, NIGDY LITERAŁ OBIEKTOWY — z tego samego powodu co oba
// słowniki ręczne wyżej: pickCorrection odpytuje tę strukturę tokenem WPROST od
// klienta. Przy literale `OBJ["constructor"]` zwróciłoby funkcję `Object`,
// czyli korekta uznałaby frazę „constructor" za poprawne słowo katalogu i po
// cichu przestała poprawiać (a w innych miejscach tego repo ta sama dziura dała
// 500 z publicznego /sklep?q=constructor — w repo nie ma error.tsx).
//
// `extraWords` to słowa spoza katalogu, które i tak muszą być osiągalne jako
// kandydaci — patrz VOCABULARY_EXTRA_WORDS niżej. Słowa, które są już
// w katalogu, ZACHOWUJĄ swoją wagę: dołożenie nie może zaniżyć popularności
// realnego słowa (`naroznik` jest i wartością synonimu, i słowem z 40 nazw).
export function buildCatalogVocabulary(
  names: readonly string[],
  extraWords: readonly string[]
): Map<string, number> {
  const vocabulary = new Map<string, number>();

  for (const name of names) {
    if (!name) continue;
    // Zbiór per PRODUKT — to on realizuje „waga liczy produkty".
    const seen = new Set<string>();
    for (const rawWord of name.split(WORD_SEPARATORS)) {
      if (!rawWord) continue;
      const word = foldDiacritics(rawWord);
      // Długość mierzona PO złożeniu: ß rozwija się na „ss", więc surowa
      // długość nie jest tą, którą wpisze klient.
      if (word.length < MIN_VOCABULARY_WORD_LENGTH) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
    }
  }

  for (const rawWord of extraWords) {
    const word = foldDiacritics(rawWord);
    if (word.length < MIN_VOCABULARY_WORD_LENGTH) continue;
    // Waga 1 = „istnieje", najniższa możliwa. Świadomie NIE podbijamy jej
    // wyżej: słowo, którego nie ma w ani jednej nazwie, nie ma prawa wygrywać
    // remisów z realnym słowem katalogu. Konsekwencja jest zmierzona i przyjęta:
    // „szfa" ma do `szaf` (waga 1) i do `sofa` (waga 38) tę samą odległość 1,
    // więc wygrywa `sofa` — klient zamiast „Nie prowadzimy szaf" zobaczy sofy.
    if (!vocabulary.has(word)) vocabulary.set(word, 1);
  }

  return vocabulary;
}

// Słowa ze słowników RĘCZNYCH tego pliku, do dołożenia przy budowie słownika.
//
// Bez nich korekta nie ma na co poprawiać dwóch całych klas literówek:
//   `kanpa` → „kanapa": słowa „kanapa" NIE MA w żadnej z 353 nazw (sklep
//     sprzedaje „sofy"), więc kandydatem może być tylko klucz SEARCH_SYNONYMS,
//     który wyszukiwarka i tak rozwinie na `sof` (41 produktów);
//   `szfa` → „szafa": sklep szaf nie prowadzi, ale NOT_CARRIED ma dla nich
//     uczciwy komunikat „Nie prowadzimy szaf" — bez tych kluczy literówka
//     odbiera klientowi tę odpowiedź.
//
// Wartości SEARCH_SYNONYMS (rdzenie katalogowe: `sof`, `lozk`, `naroznik`…) też
// tu są: to formy najkrótsze, więc w nazwach występują tylko w odmianach
// („sofa", „łóżko") i same z siebie do słownika by nie trafiły.
//
// Deduplikacja przez Set, bo `sof` jest wartością ośmiu różnych kluczy.
// Razem daje to dziś 33 słowa (17 kluczy synonimów + 8 różnych wartości
// + 8 kluczy NOT_CARRIED), z czego 4 są już w nazwach produktów.
export const VOCABULARY_EXTRA_WORDS: readonly string[] = [
  ...new Set([
    ...SEARCH_SYNONYMS.keys(),
    ...[...SEARCH_SYNONYMS.values()].flat(),
    ...NOT_CARRIED.keys(),
  ]),
];
