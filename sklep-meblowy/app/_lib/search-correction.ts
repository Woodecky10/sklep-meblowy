// Korekta literówek klienta na /sklep: KIEDY wolno poprawić frazę, na co ją
// poprawić i czy poprawkę wolno klientowi POKAZAĆ.
//
// ⚠️ CAŁE I/O JEST WSTRZYKNIĘTE (słownik katalogu, ponowione zapytanie) i to nie
// jest ozdoba architektoniczna: testy w tym repo nie mockują supabase, a
// najważniejszą własnością całego feature'u jest to, że korekta NIE odpala się
// przy niepustym wyniku. Bez wstrzyknięcia ta własność byłaby sprawdzalna
// wyłącznie ręcznie. Ten sam powód, dla którego search-filter.ts został kiedyś
// wydzielony z products.ts.
//
// Po co to w ogóle: pomiar na produkcji 2026-08-17 (353 aktywne pozycje) —
// `materca`, `sofq`, `naroznk`, `fotle` dawały DOKŁADNIE ZERO wyników, przy
// poprawnej pisowni odpowiednio 83, 41, 40 i 9 produktów.

import { foldDiacritics, searchTokens, stemToken } from "./search-filter";
import { pickCorrection } from "./search-typos";
import { VOCABULARY_EXTRA_WORDS } from "./search-vocabulary";

// Rdzenie ze słowników RĘCZNYCH (klucze ∪ wartości SEARCH_SYNONYMS ∪ klucze
// NOT_CARRIED) — dokładnie ten zbiór, który Task 2 dokłada do słownika
// katalogu. Nie budujemy drugiej listy: rozjazd dwóch kopii tej wiedzy nie
// wywala błędu, tylko po cichu przepuszcza rdzeń do UI.
//
// `Set`, nie literał obiektowy — pytanie idzie tu słowem wybranym na podstawie
// frazy KLIENTA, a odczyt z literału schodzi na łańcuch prototypu
// (`OBJ["constructor"]` → funkcja `Object`, czyli wartość prawdziwościowo
// prawdziwa). Ta sama klasa błędu, która w tym repo dała już 500 z publicznego
// `/sklep?q=constructor`.
const RDZENIE_RECZNE: ReadonlySet<string> = new Set(VOCABULARY_EXTRA_WORDS);

// Minimalna długość poprawki, którą wolno zacytować klientowi.
//
// Cztery znaki odsiewają zmierzone `flok`→`flo`, `miod`→`mio`, `beza`→`bez`:
// to PRAWDZIWE słowa z nazw (kolekcje `flo` i `mio`, kolor `bez`), a mimo to
// zdanie „Pokazujemy wyniki dla «mio»" wygląda dla klienta jak awaria sklepu.
// Przepuszczają wszystkie realne przypadki, o które w tym feature chodzi:
// `sofa`, `fotel`, `materac`, `naroznik`, `pufa`.
export const MIN_SHOWN_CORRECTION_LENGTH = 4;

// Czy tę jedną poprawkę wolno pokazać klientowi.
//
// ⚠️ WARUNEK (a) NIE JEST SAMĄ PRZYNALEŻNOŚCIĄ DO `VOCABULARY_EXTRA_WORDS`
// i to jest świadome odstępstwo, poparte pomiarem. Z 33 rdzeni ręcznych
// DOKŁADNIE CZTERY są jednocześnie prawdziwymi słowami z nazw produktów
// (pomiar 2026-08-17: `materac` w 83 nazwach, `naroznik` w 40, `fotel` w 9,
// `boxspring` w 4) — bo są wartościami SEARCH_SYNONYMS, a katalog akurat mówi
// tak samo jak klient. Sama przynależność do zbioru zabiłaby więc flagowe
// przypadki całego feature'u: `materca`, `naroznk` i `fotle` nigdy nie
// pokazałyby poprawki.
//
// Rozróżnia je WAGA. buildCatalogVocabulary dokłada rdzeń ręczny z wagą 1
// TYLKO wtedy, gdy słowa nie ma jeszcze w nazwach (`if (!vocabulary.has(word))`),
// więc goły rdzeń — taki, którego w żadnej nazwie nie ma — ma wagę dokładnie 1.
// Pomiar 2026-08-17 potwierdza rozdział bez ani jednego wyjątku: wszystkie 29
// gołych rdzeni (`kanap`, `lozk`, `sof`, `szaf`, `kontynentaln`…) mają wagę 1,
// a wszystkie 4 realne słowa mają wagę 4-83.
//
// Kierunek pomyłki jest bezpieczny: rdzeń ręczny, który trafi kiedyś do
// DOKŁADNIE JEDNEJ nazwy produktu, dostanie wagę 1 i zostanie schowany mimo że
// jest prawdziwym słowem. Klient zobaczy wtedy wariant B, czyli zdanie, które
// niczego nie cytuje — a nie „Pokazujemy wyniki dla «lozk»".
function canShowCorrection(word: string, weight: number): boolean {
  if (RDZENIE_RECZNE.has(word) && weight <= 1) return false;
  return word.length >= MIN_SHOWN_CORRECTION_LENGTH;
}

export type SearchCorrectionPlan = {
  // Fraza do POWTÓRZONEGO zapytania. Złożona z tokenów, które przeszły już
  // sanityzację searchTokens (litery, cyfry, spacja, myślnik), i ze słów
  // słownika, które składają się wyłącznie z liter i cyfr — więc ponowne
  // przepuszczenie jej przez searchKeyTokenGroups da zamierzone rdzenie i nie
  // wpuści do zapytania niczego, czego dziś nie da się wpuścić.
  phrase: string;
  // Czy CAŁĄ poprawioną frazę wolno zacytować klientowi (patrz
  // canShowCorrection). Wystarczy jeden niepokazywalny token, żeby zdanie
  // wyglądało na zepsute, więc warunek jest na wszystkich naraz.
  showCorrection: boolean;
};

// Plan korekty frazy albo null, gdy korekty nie ma albo nie ma sensu.
//
// ⚠️ WOŁAĆ WYŁĄCZNIE PRZY ZEROWYM WYNIKU — ta funkcja o tym nie wie i wiedzieć
// nie ma; pilnuje tego applyTypoCorrection niżej.
export function planSearchCorrection(
  raw: string,
  vocabulary: ReadonlyMap<string, number>
): SearchCorrectionPlan | null {
  const tokens = searchTokens(raw);
  if (tokens.length === 0) return null;

  const words = [...vocabulary.keys()];
  const wyjscie: string[] = [];
  const poprawki: string[] = [];

  for (const token of tokens) {
    const fold = foldDiacritics(token);
    const stem = stemToken(fold);
    // Token ZNANY = jego rdzeń jest podciągiem któregoś słowa słownika, czyli
    // dokładnie to, o co pyta bazy `ILIKE %rdzen%`. Taki token zostaje bez
    // zmian — i to w PISOWNI KLIENTA, bo poprawiona fraza idzie też do UI,
    // a składanie znaków zrobi ponownie searchKeyTokenGroups.
    if (stem && words.some((word) => word.includes(stem))) {
      wyjscie.push(token);
      continue;
    }
    const correction = pickCorrection(fold, vocabulary);
    // Choć jeden token bez kandydata → koniec. Grupy tokenów są w zapytaniu
    // ANDowane, więc taki token i tak wyzerowałby wynik: poprawianie reszty
    // byłoby pracą na darmo i obietnicą bez pokrycia.
    if (correction === null) return null;
    wyjscie.push(correction);
    poprawki.push(correction);
  }

  const phrase = wyjscie.join(" ");
  // Nic się nie zmieniło → nie ma czego ponawiać. Warunek jest na całej frazie,
  // a nie na liczbie poprawek, bo to on jest wymaganiem: powtarzamy zapytanie
  // tylko wtedy, gdy naprawdę pytamy o co innego.
  if (phrase === tokens.join(" ")) return null;

  return {
    phrase,
    showCorrection: poprawki.every((word) =>
      canShowCorrection(word, vocabulary.get(word) ?? 0)
    ),
  };
}

export type TypoCorrectionOutcome<R> = {
  result: R;
  // Fraza KLIENTA. Obecne ⇔ korekta naprawdę coś znalazła.
  correctedFrom?: string;
  // ⚠️ Fraza użyta w zapytaniu, ale obecna TYLKO WTEDY, GDY WOLNO JĄ POKAZAĆ
  // KLIENTOWI (patrz canShowCorrection). To celowy kontrakt: gdyby pole
  // zawierało poprawkę zawsze, UI musiałby powtórzyć u siebie regułę „nigdy nie
  // pokazuj rdzenia" — a dwa miejsca decydujące o tym samym cicho się rozjadą.
  // Brak tego pola przy obecnym `correctedFrom` znaczy: korekta zaszła, ale
  // zdanie ma jej nie cytować.
  correctedTo?: string;
};

// Fallback korekty literówek dla wyszukiwania z zerowym wynikiem.
//
// `initial` to wynik DZISIEJSZEGO wyszukiwania, `rerun` powtarza je poprawioną
// frazą, `loadVocabulary` daje słownik katalogu. Wszystko wstrzyknięte — patrz
// nagłówek pliku.
export async function applyTypoCorrection<R>(params: {
  search: string;
  initial: R;
  isEmpty: (result: R) => boolean;
  loadVocabulary: () => Promise<ReadonlyMap<string, number>>;
  rerun: (phrase: string) => Promise<R>;
}): Promise<TypoCorrectionOutcome<R>> {
  const { search, initial, isEmpty, loadVocabulary, rerun } = params;

  // ⚠️ NAJWAŻNIEJSZY WARUNEK CAŁEGO FEATURE'U I PIERWSZA LINIA TEJ FUNKCJI:
  // fraza, która dziś cokolwiek zwraca, ma zwrócić DOKŁADNIE ten sam zbiór
  // w DOKŁADNIE tej samej kolejności. Na tej własności stoi też stemming
  // (migracja 73) i fallback synonimów — złamanie jej byłoby najgorszą możliwą
  // regresją wyszukiwarki. Wyjście PRZED jakimkolwiek I/O, żeby niepusty wynik
  // nie kosztował nawet jednego dodatkowego zapytania.
  if (!isEmpty(initial)) return { result: initial };

  let vocabulary: ReadonlyMap<string, number>;
  try {
    vocabulary = await loadVocabulary();
  } catch {
    // getCatalogVocabulary RZUCA przy błędzie bazy — celowo, żeby cache nie
    // zapamiętał pustego słownika na 300 s. Tu wyjątek MUSI zostać złapany:
    // zero wyników bez podpowiedzi jest gorsze niż z podpowiedzią, ale
    // nieporównanie lepsze niż strona awarii (w repo nie ma error.tsx).
    return { result: initial };
  }

  const plan = planSearchCorrection(search, vocabulary);
  if (plan === null) return { result: initial };

  const retried = await rerun(plan.phrase);
  // Poprawka nic nie dała → oddajemy pusty wynik BEZ pól korekty. Nie kłamiemy,
  // że coś poprawiliśmy, skoro klient i tak patrzy na pustą stronę.
  if (isEmpty(retried)) return { result: initial };

  return {
    result: retried,
    correctedFrom: search,
    correctedTo: plan.showCorrection ? plan.phrase : undefined,
  };
}
