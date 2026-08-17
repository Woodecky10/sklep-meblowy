import { describe, it, expect } from "vitest";
import {
  maxTypos,
  editDistanceWithin,
  pickCorrection,
} from "@/app/_lib/search-typos";

// Mały słownik testowy w kształcie tego, co produkuje Task 2: klucz to słowo
// katalogu ZŁOŻONE do ASCII (tak jak kolumna search_key_fold), wartość to waga,
// czyli w ilu produktach to słowo występuje. Liczby są rzędu tych zmierzonych na
// produkcji 2026-08-13 (349 aktywnych pozycji), ale dla tych funkcji waga jest
// nieprzezroczysta — liczy się wyłącznie to, że większa wygrywa.
const KATALOG: ReadonlyMap<string, number> = new Map([
  ["materac", 157],
  ["lozko", 167],
  ["naroznik", 40],
  ["sofa", 41],
  ["fotel", 9],
  ["puf", 9],
]);

describe("maxTypos — ile błędów wolno dla słowa tej długości", () => {
  it("słowa do 3 znaków nie dostają ani jednego błędu", () => {
    // Próg 0 jest celowy, nie oszczędnościowy: przy jednym dozwolonym błędzie
    // „puf" zderza się z „puk" i „pub" — trzyliterowe słowa mają zbyt gęstych
    // sąsiadów, żeby zgadywanie było uczciwe wobec klienta.
    expect(maxTypos("")).toBe(0);
    expect(maxTypos("a")).toBe(0);
    expect(maxTypos("do")).toBe(0);
    expect(maxTypos("puf")).toBe(0);
  });

  it("słowa 4-6 znaków dostają jeden błąd", () => {
    expect(maxTypos("sofa")).toBe(1);
    expect(maxTypos("fotel")).toBe(1);
    expect(maxTypos("kanapa")).toBe(1);
  });

  it("słowa od 7 znaków dostają dwa błędy", () => {
    expect(maxTypos("materac")).toBe(2);
    expect(maxTypos("naroznik")).toBe(2);
    expect(maxTypos("kontynentalny")).toBe(2);
  });

  it("granice progów: 3→0, 4→1, 6→1, 7→2", () => {
    // Granice osobno i na sztucznych słowach, żeby test nie zależał od tego,
    // ile liter ma akurat „fotel".
    expect(maxTypos("a".repeat(3))).toBe(0);
    expect(maxTypos("a".repeat(4))).toBe(1);
    expect(maxTypos("a".repeat(6))).toBe(1);
    expect(maxTypos("a".repeat(7))).toBe(2);
    expect(maxTypos("a".repeat(30))).toBe(2);
  });
});

describe("editDistanceWithin — przestawienie sąsiednich znaków kosztuje 1", () => {
  // NA TYM STOI CAŁY FEATURE. Zwykły Levenshtein liczy przestawienie jako dwa
  // błędy, więc przy progu 1 („fotle" ma 5 liter) by je przegapił. Dlatego oba
  // asserty podają max = 1: implementacja bez transpozycji zwróci tu null.
  it("„materca\" ↔ „materac\" to jeden błąd", () => {
    expect(editDistanceWithin("materca", "materac", 1)).toBe(1);
    expect(editDistanceWithin("materac", "materca", 1)).toBe(1);
  });

  it("„fotle\" ↔ „fotel\" to jeden błąd", () => {
    expect(editDistanceWithin("fotle", "fotel", 1)).toBe(1);
    expect(editDistanceWithin("fotel", "fotle", 1)).toBe(1);
  });

  it("przestawienie na początku i na końcu słowa liczy się tak samo", () => {
    expect(editDistanceWithin("osfa", "sofa", 1)).toBe(1);
    expect(editDistanceWithin("naroznki", "naroznik", 1)).toBe(1);
  });
});

describe("editDistanceWithin — podstawowe operacje kosztują 1", () => {
  it("substytucja", () => {
    expect(editDistanceWithin("sofq", "sofa", 1)).toBe(1);
    expect(editDistanceWithin("fotel", "hotel", 1)).toBe(1);
  });

  it("wstawienie", () => {
    expect(editDistanceWithin("naroznk", "naroznik", 1)).toBe(1);
    expect(editDistanceWithin("sofa", "sofka", 1)).toBe(1);
  });

  it("usunięcie", () => {
    expect(editDistanceWithin("materacc", "materac", 1)).toBe(1);
    expect(editDistanceWithin("puff", "puf", 1)).toBe(1);
  });

  it("identyczne słowa mają odległość 0, nawet przy max = 0", () => {
    expect(editDistanceWithin("materac", "materac", 0)).toBe(0);
    expect(editDistanceWithin("", "", 0)).toBe(0);
  });

  it("puste słowo kosztuje tyle, ile ma znaków to drugie", () => {
    expect(editDistanceWithin("", "sofa", 4)).toBe(4);
    expect(editDistanceWithin("sofa", "", 4)).toBe(4);
    expect(editDistanceWithin("", "sofa", 3)).toBeNull();
  });

  it("odległość jest symetryczna", () => {
    // Wartość podana wprost, żeby test nie przeszedł na dwóch nullach.
    expect(editDistanceWithin("fotel", "motek", 3)).toBe(2);
    expect(editDistanceWithin("motek", "fotel", 3)).toBe(2);
    expect(editDistanceWithin("materca", "materac", 3)).toBe(1);
    expect(editDistanceWithin("materac", "materca", 3)).toBe(1);
  });
});

describe("editDistanceWithin — null powyżej progu", () => {
  it("zwraca null, gdy odległość przekracza max, mimo równej długości", () => {
    // Równa długość, więc null NIE bierze się z odsiania po różnicy długości —
    // to naprawdę wynik liczenia (albo przerwania liczenia w pół drogi).
    expect(editDistanceWithin("fotel", "motek", 1)).toBeNull();
    expect(editDistanceWithin("fotel", "motek", 2)).toBe(2);
  });

  it("zwraca null, gdy sama różnica długości przekracza max", () => {
    expect(editDistanceWithin("sofa", "kanapa", 1)).toBeNull();
    expect(editDistanceWithin("puf", "materac", 2)).toBeNull();
  });

  it("max = 0 przepuszcza wyłącznie słowo identyczne", () => {
    expect(editDistanceWithin("sofa", "sofq", 0)).toBeNull();
    expect(editDistanceWithin("sofa", "sofka", 0)).toBeNull();
  });

  it("ujemny max nie przepuszcza niczego, nawet słowa identycznego", () => {
    expect(editDistanceWithin("sofa", "sofa", -1)).toBeNull();
  });

  it("wariant OSA: przestawienie z wstawieniem w środku to trzy błędy", () => {
    // Pinujemy WARIANT algorytmu, nie tylko wynik. To klasyczny przykład
    // odróżniający OSA od pełnego Damerau-Levenshteina: pełny wariant liczy tu
    // 2 (przestawienie „ca"→„ac" plus wstawienie „b"), OSA — 3, bo nie pozwala
    // edytować odcinka, który już przestawił. Dla wyszukiwarki to bez różnicy
    // (i tak odsiewamy przy progu 1-2), ale implementacja ma być przewidywalna.
    expect(editDistanceWithin("ca", "abc", 3)).toBe(3);
    expect(editDistanceWithin("ca", "abc", 2)).toBeNull();
  });
});

describe("pickCorrection — kiedy NIE poprawiać", () => {
  it("słowa do 3 znaków zostają bez poprawki (próg 0)", () => {
    // „puf" ma w słowniku sąsiada w odległości 1 („puk"), a i tak ma zostać
    // nietknięty — inaczej klient szukający pufy dostałby cudzy produkt.
    expect(pickCorrection("puf", new Map([["puk", 99]]))).toBeNull();
    expect(pickCorrection("sof", KATALOG)).toBeNull();
    expect(pickCorrection("", KATALOG)).toBeNull();
  });

  it("słowo obecne w słowniku nie jest poprawiane", () => {
    expect(pickCorrection("materac", KATALOG)).toBeNull();
    expect(pickCorrection("sofa", KATALOG)).toBeNull();
    // Nawet gdy ma bliskiego, dużo cięższego sąsiada — jest poprawne, koniec.
    expect(
      pickCorrection("sofa", new Map([["sofa", 1], ["sowa", 9999]]))
    ).toBeNull();
  });

  it("pusty słownik → null", () => {
    expect(pickCorrection("materca", new Map())).toBeNull();
  });

  it("słowo bez żadnego kandydata w progu → null", () => {
    expect(pickCorrection("xyzabc", KATALOG)).toBeNull();
    expect(pickCorrection("zzzzzzzz", KATALOG)).toBeNull();
  });
});

describe("pickCorrection — próg zależy od długości TOKENU", () => {
  it("od 7 znaków przechodzi kandydat oddalony o dwa błędy", () => {
    // Dwa nadmiarowe znaki („mmaterrac"), czyli odległość 2 — dla dziewięciu
    // liter to wciąż w progu. Bez tego testu nic by nie dowodziło, że drugi
    // stopień progu jest w ogóle osiągalny.
    expect(pickCorrection("mmaterrac", KATALOG)).toBe("materac");
  });

  it("do 6 znaków ten sam rodzaj błędu jest już poza progiem", () => {
    // „sofkaa" to od „sofa" te same dwa nadmiarowe znaki, ale sześć liter daje
    // próg 1 — i tu poprawki nie ma. Próg liczy się z DŁUGOŚCI TOKENU KLIENTA,
    // nie kandydata: krótkie słowo ma za gęstych sąsiadów.
    expect(pickCorrection("sofkaa", new Map([["sofa", 41]]))).toBeNull();
  });
});

describe("pickCorrection — kolejność rozstrzygania", () => {
  it("najpierw najmniejsza odległość, waga dopiero potem", () => {
    // „materac" jest o 1 (przestawienie), „materace" o 2 — waga 900 vs 1 nie ma
    // prawa tego odwrócić, inaczej najpopularniejsze słowo katalogu zjadałoby
    // wszystkie literówki w okolicy.
    const slownik = new Map([
      ["materac", 1],
      ["materace", 900],
    ]);
    expect(pickCorrection("materca", slownik)).toBe("materac");
  });

  it("przy równej odległości wygrywa większa waga", () => {
    // Oba są o jedną substytucję od „sofq". Cięższe słowo („sofy") jest
    // alfabetycznie DALSZE, więc test naprawdę mierzy wagę, a nie alfabet.
    const slownik = new Map([
      ["sofa", 2],
      ["sofy", 40],
    ]);
    expect(pickCorrection("sofq", slownik)).toBe("sofy");
  });

  it("przy równej odległości i równej wadze wygrywa alfabet", () => {
    const slownik = new Map([
      ["sofa", 7],
      ["sofy", 7],
    ]);
    expect(pickCorrection("sofq", slownik)).toBe("sofa");
  });

  it("wynik nie zależy od kolejności wpisów w słowniku", () => {
    // Wynik trafia do UI („Pokazujemy wyniki dla «materac»") i do testów, więc
    // nie może zależeć od kolejności iteracji Mapy. Task 2 buduje słownik
    // zapytaniem do bazy — kolejność wierszy nie jest niczym gwarantowana.
    // Wszystkie trzy są o jedną substytucję od „sofq" i mają tę samą wagę, więc
    // rozstrzyga wyłącznie alfabet — w obu kolejnościach tak samo.
    const rosnaco = new Map([
      ["sofa", 7],
      ["sofo", 7],
      ["sofy", 7],
    ]);
    const malejaco = new Map([
      ["sofy", 7],
      ["sofo", 7],
      ["sofa", 7],
    ]);
    expect(pickCorrection("sofq", rosnaco)).toBe("sofa");
    expect(pickCorrection("sofq", malejaco)).toBe("sofa");
  });
});

describe("pickCorrection — realne literówki z produkcji", () => {
  // Zmierzone na produkcji 2026-08-17: każda z tych czterech fraz dawała
  // DOKŁADNIE ZERO podpowiedzi, przy poprawnej pisowni — sześć.
  const przypadki: [string, string][] = [
    ["materca", "materac"],
    ["sofq", "sofa"],
    ["naroznk", "naroznik"],
    ["fotle", "fotel"],
  ];

  it.each(przypadki)("„%s\" poprawia się na „%s\"", (literowka, poprawne) => {
    expect(pickCorrection(literowka, KATALOG)).toBe(poprawne);
  });
});

describe("pickCorrection — klucze z łańcucha prototypu", () => {
  // REGRES DO ZATRZYMANIA NA ZAWSZE, ten sam co w search-vocabulary.test.ts.
  // Dopóki słownik był literałem obiektowym, `OBJ["constructor"]` wracało
  // funkcją `Object` z prototypu — wartością prawdziwościowo prawdziwą
  // i NIEiterowalną — więc spread rzucał `TypeError`, czyli 500 z publicznego
  // `/sklep?q=constructor` (w repo nie ma error.tsx, klient widzi stronę
  // awarii). Te funkcje dostają token WPROST od klienta i są wołane
  // z najgorętszego endpointu sklepu, więc pinujemy obie strony: token
  // z prototypu i słownik z takim kluczem.
  const zPrototypu = [
    "constructor",
    "__proto__",
    "toString",
    "valueOf",
    "tostring",
    "valueof",
    "hasownproperty",
    "prototype",
  ];

  it.each(zPrototypu)("token „%s\" nie rzuca i nie zwraca śmieci", (token) => {
    expect(() => pickCorrection(token, KATALOG)).not.toThrow();
    expect(pickCorrection(token, KATALOG)).toBeNull();
  });

  it.each(zPrototypu)("token „%s\" nie rzuca przy pustym słowniku", (token) => {
    expect(pickCorrection(token, new Map())).toBeNull();
  });

  it("słowo z prototypu jako KLUCZ słownika zachowuje się jak każde inne", () => {
    // Druga strona tej samej pułapki: implementacja nie ma prawa przepisać
    // słownika do literału ani do Object.fromEntries po drodze.
    expect(pickCorrection("constructo", new Map([["constructor", 2]]))).toBe(
      "constructor"
    );
    expect(pickCorrection("__proto_", new Map([["__proto__", 2]]))).toBe(
      "__proto__"
    );
    expect(pickCorrection("constructor", new Map([["constructor", 2]]))).toBeNull();
  });
});
