// Odporność wyszukiwarki na literówki klienta: czysta arytmetyka odległości
// edycyjnej i wybór jednej poprawki ze słownika katalogu. Zero I/O, zero bazy,
// zero stanu — moduł nie wie ani KIEDY się odpala, ani skąd bierze się słownik.
//
// KIEDY to woła wołający: WYŁĄCZNIE przy zerowym wyniku wyszukiwania. Te
// funkcje są bezstanowe i deterministyczne właśnie po to, żeby wołający mógł tę
// właściwość utrzymać — nic tu nie zapamiętuje poprzedniej frazy i nic nie
// zmienia zachowania między wywołaniami.
//
// Tokeny przychodzą JUŻ złożone do ASCII i małymi literami (foldDiacritics
// z search-filter.ts). Ten moduł niczego nie normalizuje ponownie: gdyby to
// robił, dwa miejsca decydowałyby o tym samym i cicho by się rozjechały —
// dokładnie ta klasa błędu, którą opisuje komentarz przy FOLD_MAP.
//
// Po co to w ogóle: zmierzone na produkcji 2026-08-17 — `materca`, `sofq`,
// `naroznk`, `fotle` dawały DOKŁADNIE ZERO podpowiedzi, przy `materac`, `sofa`,
// `naroznik`, `fotel` → 6. Każda z tych czterech to jeden znak od poprawnej
// pisowni, a dwie z nich to przestawienie sąsiednich liter.

// Ile błędów wolno dla słowa tej długości: ≤3 → 0, 4-6 → 1, od 7 → 2.
//
// Próg 0 dla słów do trzech znaków jest celowy i nie chodzi o oszczędność:
// przy jednym dozwolonym błędzie „puf" zderza się z „puk" i „pub" — słowa
// trzyliterowe mają zbyt gęstych sąsiadów, żeby zgadywanie było uczciwe. Lepiej
// nie podpowiedzieć nic, niż podstawić klientowi cudzy produkt.
export function maxTypos(word: string): number {
  if (word.length <= 3) return 0;
  if (word.length <= 6) return 1;
  return 2;
}

// Odległość Damerau-Levenshteina w wariancie OSA (optimal string alignment):
// wstawienie, usunięcie i substytucja kosztują 1, a PRZESTAWIENIE DWÓCH
// SĄSIEDNICH ZNAKÓW TEŻ 1. Zwraca odległość albo null, gdy przekracza `max`.
//
// ⚠️ Koszt 1 za przestawienie to nie detal, tylko powód istnienia tego pliku:
// `materca`↔`materac` i `fotle`↔`fotel` to właśnie przestawienie sąsiednich
// liter — najczęstsza literówka przy pisaniu. Zwykły Levenshtein liczy je jako
// dwa błędy i przy progu 1 (a „fotle" ma 5 liter, więc próg to 1) przegapiłby
// je oba.
//
// OSA, nie pełny Damerau: różnią się tym, że OSA nie pozwala edytować odcinka,
// który już przestawił („ca"→„abc" to 3, nie 2). Dla wyszukiwarki bez różnicy —
// przy progu 1-2 takie przypadki i tak odpadają — a OSA liczy się na trzech
// wierszach macierzy zamiast na całej macierzy plus tablicy ostatnich pozycji.
//
// Wydajność: ta funkcja leci w pętli po CAŁYM słowniku katalogu z
// /api/search/suggest, czyli z najgorętszego endpointu sklepu (żądanie na każde
// wpisane słowo). Stąd dwa wczesne wyjścia:
//   1. różnica długości > max — sama zmiana długości wymaga tylu wstawień lub
//      usunięć, więc odpowiadamy null bez liczenia czegokolwiek;
//   2. cały wiersz macierzy > max — wynik nigdy nie zejdzie poniżej minimum
//      wiersza, więc dalsze wiersze są zmarnowaną pracą. Formalnie: ścieżka
//      optymalna przechodzi przez każdy wiersz, a przeskok transpozycji z
//      wiersza i-2 do i omija wiersz i-1 tylko wtedy, gdy w wierszu i-1 istnieje
//      komórka nie droższa (substytucja tej samej pary), więc minimum każdego
//      wiersza pozostaje dolnym ograniczeniem wyniku.
export function editDistanceWithin(
  a: string,
  b: string,
  max: number
): number | null {
  // Ujemny próg nie przepuszcza nawet słowa identycznego (odległość 0 > max).
  if (max < 0) return null;

  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return null;
  if (a === b) return 0;

  // Trzy wiersze w rotacji: prev2 = i-2 (potrzebny wyłącznie dla transpozycji),
  // prev = i-1, cur = liczony. Bufory są przestawiane, nie alokowane w pętli.
  let prev2 = new Array<number>(lb + 1);
  let prev = new Array<number>(lb + 1);
  let cur = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(
        prev[j] + 1, // usunięcie znaku z a
        cur[j - 1] + 1, // wstawienie znaku z b
        prev[j - 1] + cost // substytucja (albo zgodność)
      );
      // Transpozycja: dwa ostatnie porównywane znaki obu słów to ta sama para,
      // zamieniona miejscami. To jedyne miejsce czytające wiersz i-2, i wchodzi
      // się w nie dopiero przy i > 1 — czyli niezainicjowany bufor (przy i = 1
      // prev2 jest jeszcze surowy) nie jest nigdy odczytywany.
      if (
        i > 1 &&
        j > 1 &&
        ai === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        const transposed = prev2[j - 2] + 1;
        if (transposed < value) value = transposed;
      }
      cur[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return null;
    const spare = prev2;
    prev2 = prev;
    prev = cur;
    cur = spare;
  }

  // Po ostatniej rotacji wynik siedzi w `prev`, nie w `cur`.
  const distance = prev[lb];
  return distance > max ? null : distance;
}

// Kandydat w trakcie wybierania. Trzymamy komplet danych rozstrzygających, żeby
// porównanie było jednym miejscem, a nie warunkiem rozsypanym po pętli.
type Candidate = { word: string; distance: number; weight: number };

// Kolejność rozstrzygania, w tej i tylko tej kolejności:
//   1. mniejsza odległość,
//   2. remis → większa waga (w ilu produktach słowo występuje),
//   3. dalszy remis → alfabetycznie rosnąco.
//
// Punkt 3 nie jest kosmetyką: wynik trafia wprost do UI („Pokazujemy wyniki dla
// «materac»") i do testów, więc nie może zależeć od kolejności iteracji Mapy —
// tę buduje zapytanie do bazy, która niczego o kolejności wierszy nie obiecuje.
// Porównanie `<` na stringach jest po jednostkach kodowych, ale słownik jest już
// złożony do ASCII (patrz foldDiacritics), więc to jest alfabet — i przy okazji
// nie zależy od locale procesu, w odróżnieniu od localeCompare.
function beatsBest(candidate: Candidate, best: Candidate): boolean {
  if (candidate.distance !== best.distance) {
    return candidate.distance < best.distance;
  }
  if (candidate.weight !== best.weight) return candidate.weight > best.weight;
  return candidate.word < best.word;
}

// Najlepsza poprawka tokenu albo null, gdy nie ma czego (albo nie wolno)
// poprawiać.
//
// `vocabulary`: klucz = słowo katalogu złożone do ASCII, wartość = waga, czyli
// w ilu produktach to słowo występuje. Dla tej funkcji waga jest nieprzezroczystą
// liczbą — liczy się wyłącznie to, że większa wygrywa.
//
// ⚠️ TO MUSI BYĆ `Map`, NIGDY LITERAŁ OBIEKTOWY — i dlatego sygnatura wymusza
// `ReadonlyMap`. Klucz pochodzi tu WPROST od klienta, a odczyt z literału
// schodzi na łańcuch prototypu: `OBJ["constructor"]` zwraca funkcję `Object` —
// wartość prawdziwościowo prawdziwą i NIEiterowalną — na czym w tym repo już raz
// wywalił się spread, czyli 500 z publicznego `/sklep?q=constructor` (error.tsx
// nie istnieje, więc klient widzi stronę awarii). Ta funkcja nie buduje wewnątrz
// żadnej struktury indeksowanej tokenem ani słowem ze słownika — nie ma tu ani
// Object.fromEntries, ani obiektu-akumulatora — i tak ma zostać.
export function pickCorrection(
  token: string,
  vocabulary: ReadonlyMap<string, number>
): string | null {
  const limit = maxTypos(token);
  // Próg 0 → nie ma czego liczyć. Wyjście PRZED pętlą, a nie odsianie w środku:
  // przy jednoznakowych frazach z podpowiedzi-na-każdą-literę oszczędza to
  // przejście po całym słowniku katalogu.
  if (limit === 0) return null;

  // Słowo jest w słowniku, czyli jest poprawne — nie ma czego poprawiać.
  // Równoważne warunkowi „kandydat w odległości 0", bo odległość 0 zachodzi
  // dokładnie dla słów identycznych, tylko tańsze i czytelniejsze.
  if (vocabulary.has(token)) return null;

  let best: Candidate | null = null;
  // Budżet zacieśnia się do odległości aktualnie najlepszego kandydata: dalszy
  // i tak by przegrał w punkcie 1, więc niech odpadnie wcześnie. NIE `best - 1` —
  // kandydat o RÓWNEJ odległości ma prawo wygrać wagą albo alfabetem.
  let budget = limit;

  for (const [word, weight] of vocabulary) {
    const distance = editDistanceWithin(token, word, budget);
    if (distance === null) continue;
    const candidate: Candidate = { word, distance, weight };
    if (best !== null && !beatsBest(candidate, best)) continue;
    best = candidate;
    budget = distance;
  }

  return best === null ? null : best.word;
}
