import { describe, it, expect } from "vitest";
import {
  planSearchCorrection,
  applyTypoCorrection,
  MIN_SHOWN_CORRECTION_LENGTH,
} from "@/app/_lib/search-correction";

// Słownik w kształcie tego, co produkuje getCatalogVocabulary: klucz = słowo
// złożone do ASCII, wartość = w ILU PRODUKTACH występuje. Liczby i skład
// przepisane z pomiaru na produkcji 2026-08-17 (353 aktywne pozycje, 238 słów
// z nazw + 29 gołych rdzeni ze słowników ręcznych):
//
//   `materac` 83, `naroznik` 40, `fotel` 9, `boxspring` 4 — to DOKŁADNIE te
//   cztery rdzenie ze słowników ręcznych, które są też prawdziwymi słowami
//   z nazw produktów, więc mają wagę > 1;
//   `kanap`, `lozk`, `sof`, `puf`, `szaf` — rdzenie, których w ŻADNEJ nazwie
//   nie ma, więc buildCatalogVocabulary wpisuje im wagę dokładnie 1.
//
// Ten podział jest nośny dla całego pliku: na nim stoi warunek (a) rulingu
// o dwóch wariantach komunikatu.
const KATALOG: ReadonlyMap<string, number> = new Map([
  ["materac", 83],
  ["naroznik", 40],
  ["sofa", 41],
  ["lozko", 167],
  ["fotel", 9],
  ["pufa", 6],
  ["flo", 4], // nazwa kolekcji z katalogu — prawdziwe słowo, ale 3-znakowe
  ["boxspring", 4],
  ["kanap", 1],
  ["lozk", 1],
  ["sof", 1],
  ["puf", 1],
  ["szaf", 1],
]);

describe("planSearchCorrection — kiedy w ogóle jest co poprawiać", () => {
  it("literówka daje poprawioną frazę", () => {
    // Zmierzone na produkcji 2026-08-17: `materca` dawało DOKŁADNIE ZERO.
    expect(planSearchCorrection("materca", KATALOG)?.phrase).toBe("materac");
    expect(planSearchCorrection("sofq", KATALOG)?.phrase).toBe("sofa");
    expect(planSearchCorrection("naroznk", KATALOG)?.phrase).toBe("naroznik");
    expect(planSearchCorrection("fotle", KATALOG)?.phrase).toBe("fotel");
  });

  it("fraza, której tokeny są już znane katalogowi, nie jest ruszana", () => {
    // Token jest ZNANY, gdy jego rdzeń jest podciągiem któregoś słowa
    // słownika — czyli dokładnie wtedy, gdy zapytanie ILIKE %rdzen% ma czego
    // szukać. `materace` → rdzeń `materac`, `sofy` → `sof`, `łóżka` → `lozk`.
    expect(planSearchCorrection("materace", KATALOG)).toBeNull();
    expect(planSearchCorrection("sofy", KATALOG)).toBeNull();
    expect(planSearchCorrection("łóżka", KATALOG)).toBeNull();
  });

  it("brak sensownego kandydata → null", () => {
    expect(planSearchCorrection("zzzzzzz", KATALOG)).toBeNull();
    expect(planSearchCorrection("qwertyuiop", KATALOG)).toBeNull();
  });

  it("pusta fraza i fraza z samych znaków spoza allowlisty → null", () => {
    // searchTokens sanityzuje frazę (litery, cyfry, spacja, myślnik), więc
    // „!!!" nie ma ani jednego tokenu do poprawienia.
    expect(planSearchCorrection("", KATALOG)).toBeNull();
    expect(planSearchCorrection("   ", KATALOG)).toBeNull();
    expect(planSearchCorrection("!!!", KATALOG)).toBeNull();
  });

  it("pusty słownik → null (nie ma z czego wybierać)", () => {
    expect(planSearchCorrection("materca", new Map())).toBeNull();
  });
});

describe("planSearchCorrection — fraza wielosłowna", () => {
  it("poprawiany jest TYLKO token z literówką", () => {
    expect(planSearchCorrection("sofa materca", KATALOG)?.phrase).toBe(
      "sofa materac"
    );
    expect(planSearchCorrection("materca sofa", KATALOG)?.phrase).toBe(
      "materac sofa"
    );
  });

  it("token znany zachowuje pisownię klienta, z ogonkami włącznie", () => {
    // Poprawiona fraza trafia i do zapytania, i (w wariancie A) do UI. Token,
    // którego nie ruszamy, ma wyglądać tak, jak go klient napisał — składanie
    // znaków zrobi za nas searchKeyTokenGroups przy ponowieniu zapytania.
    expect(planSearchCorrection("łóżko materca", KATALOG)?.phrase).toBe(
      "łóżko materac"
    );
  });

  it("choć jeden token nie do poprawienia → cała fraza odpada", () => {
    // Grupy tokenów są ANDowane, więc token bez kandydata i tak wyzerowałby
    // wynik — poprawianie reszty byłoby pracą na darmo i obietnicą bez pokrycia.
    expect(planSearchCorrection("materca zzzzzzz", KATALOG)).toBeNull();
    expect(planSearchCorrection("zzzzzzz materca", KATALOG)).toBeNull();
  });
});

describe("planSearchCorrection — czy poprawkę wolno POKAZAĆ klientowi", () => {
  it("prawdziwe słowo z katalogu wolno zacytować", () => {
    // Cztery flagowe przypadki tego feature'u. Każdy z nich jest jednocześnie
    // rdzeniem ze słownika ręcznego (`materac` i `naroznik` i `fotel` są
    // wartościami SEARCH_SYNONYMS), więc sama przynależność do tego zbioru NIE
    // może decydować — patrz komentarz przy canShowCorrection.
    expect(planSearchCorrection("materca", KATALOG)?.showCorrection).toBe(true);
    expect(planSearchCorrection("sofq", KATALOG)?.showCorrection).toBe(true);
    expect(planSearchCorrection("naroznk", KATALOG)?.showCorrection).toBe(true);
    expect(planSearchCorrection("fotle", KATALOG)?.showCorrection).toBe(true);
  });

  it("(a) goły rdzeń ze słownika ręcznego — poprawiamy, ale nie cytujemy", () => {
    // „kanapa" nie występuje w ŻADNEJ z 353 nazw (sklep sprzedaje „sofy"), więc
    // jedynym kandydatem jest klucz SEARCH_SYNONYMS. Do zapytania trafia
    // poprawnie (rozwija się na `sof`, 41 produktów), ale zdanie „Pokazujemy
    // wyniki dla «kanap»" wygląda dla klienta jak zepsuty sklep.
    const plan = planSearchCorrection("kanpa", KATALOG);
    expect(plan?.phrase).toBe("kanap");
    expect(plan?.showCorrection).toBe(false);
  });

  it("(b) poprawka krótsza niż 4 znaki — poprawiamy, ale nie cytujemy", () => {
    // `flo` to PRAWDZIWE słowo z nazw (kolekcja, 4 produkty) i NIE jest
    // rdzeniem ze słownika ręcznego — więc odsiewa je wyłącznie długość.
    // Zdanie „Pokazujemy wyniki dla «flo»" wygląda jak awaria tak samo jak
    // „«lozk»", mimo że to zupełnie inny przypadek.
    const plan = planSearchCorrection("flok", KATALOG);
    expect(plan?.phrase).toBe("flo");
    expect(plan?.showCorrection).toBe(false);
    expect(MIN_SHOWN_CORRECTION_LENGTH).toBe(4);
  });

  it("wystarczy JEDEN niepokazywalny token, żeby zamilkła cała fraza", () => {
    // Wariant A cytuje CAŁĄ poprawioną frazę, więc jeden rdzeń w środku
    // wystarczy, żeby zdanie wyglądało na zepsute.
    const plan = planSearchCorrection("materca kanpa", KATALOG);
    expect(plan?.phrase).toBe("materac kanap");
    expect(plan?.showCorrection).toBe(false);
  });
});

describe("planSearchCorrection — klucze z łańcucha prototypu", () => {
  // Ten sam regres do zatrzymania co w search-typos.test.ts i
  // search-vocabulary.test.ts: fraza idzie WPROST od klienta na publicznym
  // /sklep, a repo nie ma error.tsx — 500 z tej ścieżki to strona awarii.
  const zPrototypu = [
    "constructor",
    "__proto__",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "prototype",
  ];

  it.each(zPrototypu)("fraza „%s\" nie rzuca", (fraza) => {
    expect(() => planSearchCorrection(fraza, KATALOG)).not.toThrow();
    expect(() => planSearchCorrection(fraza, new Map())).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orkiestracja: kiedy korekta w ogóle wchodzi do gry.
// ─────────────────────────────────────────────────────────────────────────────

type Wynik = { products: { id: string }[]; total: number; pages: number };

const PUSTY: Wynik = { products: [], total: 0, pages: 0 };
const ZNALEZIONE: Wynik = {
  products: [{ id: "a" }, { id: "b" }, { id: "c" }],
  total: 3,
  pages: 1,
};

// Licznik wywołań wstrzykniętego I/O — na nim stoi test braku regresji
// i test braku pętli.
function stanowisko(opcje: {
  vocabulary?: ReadonlyMap<string, number>;
  vocabularyThrows?: boolean;
  rerunResult?: Wynik;
}) {
  const licznik = { slownik: 0, ponowienia: 0, frazy: [] as string[] };
  return {
    licznik,
    loadVocabulary: async () => {
      licznik.slownik++;
      if (opcje.vocabularyThrows) throw new Error("baza padła");
      return opcje.vocabulary ?? KATALOG;
    },
    rerun: async (phrase: string) => {
      licznik.ponowienia++;
      licznik.frazy.push(phrase);
      return opcje.rerunResult ?? ZNALEZIONE;
    },
    isEmpty: (r: Wynik) => r.total === 0,
  };
}

describe("applyTypoCorrection — BRAK REGRESJI (najważniejszy test feature'u)", () => {
  it("niepusty wynik zostaje nietknięty: ten sam zbiór, ta sama kolejność, bez pól korekty", async () => {
    // ⚠️ TEN TEST PILNUJE CAŁEGO FEATURE'U. Fraza jest ZŁOŚLIWIE dobrana tak,
    // żeby dała się poprawić („materca" → „materac") — gdyby ktoś kiedyś puścił
    // korektę bezwarunkowo, zamiast tylko przy pustym wyniku, ten test padnie
    // na trzy sposoby naraz: podmieniony zbiór produktów, doklejone pola
    // korekty i niezerowe liczniki wstrzykniętego I/O.
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "materca",
      initial: ZNALEZIONE,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(ZNALEZIONE);
    expect(out.result.products.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    // Ani jednego dodatkowego zapytania: ani po słownik, ani po produkty.
    expect(s.licznik.slownik).toBe(0);
    expect(s.licznik.ponowienia).toBe(0);
  });

  it("o pustce decyduje WYŁĄCZNIE wstrzyknięty predykat", async () => {
    // Wołający pyta o `total === 0`, a nie o `products.length === 0` — na
    // stronie 2. wyszukiwania lista jest pusta, choć fraza coś znalazła.
    // Gdyby to pomylić, korekta odpalałaby się na frazie, która MA wyniki.
    const s = stanowisko({});
    const stronaDruga: Wynik = { products: [], total: 3, pages: 1 };
    const out = await applyTypoCorrection({
      search: "materca",
      initial: stronaDruga,
      isEmpty: (r) => r.total === 0,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(stronaDruga);
    expect(out.correctedFrom).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });
});

describe("applyTypoCorrection — pusty wynik", () => {
  it("literówka z trafną poprawką zwraca wyniki i OBA pola korekty", async () => {
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "materca",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(ZNALEZIONE);
    expect(out.correctedFrom).toBe("materca");
    expect(out.correctedTo).toBe("materac");
    expect(s.licznik.frazy).toEqual(["materac"]);
  });

  it("wariant B: poprawka jest gołym rdzeniem → correctedTo NIE jest zwracane", async () => {
    // Kontrakt pola: `correctedTo` obecne ⇔ poprawkę WOLNO zacytować klientowi.
    // Dzięki temu UI nie musi powtarzać rulingu i nie ma jak go rozjechać.
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "kanpa",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(ZNALEZIONE);
    expect(out.correctedFrom).toBe("kanpa");
    expect(out.correctedTo).toBeUndefined();
    // Do ZAPYTANIA poprawka trafia mimo wszystko — tego klient nie widzi.
    expect(s.licznik.frazy).toEqual(["kanap"]);
  });

  it("brak sensownego kandydata → pusto, bez pól korekty, bez ponowienia", async () => {
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "zzzzzzz",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(PUSTY);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });

  it("poprawka, która nadal nic nie znajduje → pusto, bez pól korekty", async () => {
    // Nie kłamiemy, że coś poprawiliśmy, skoro to nic nie dało — klient
    // dostaje dokładnie dzisiejszy komunikat pustego wyniku.
    const s = stanowisko({ rerunResult: PUSTY });
    const out = await applyTypoCorrection({
      search: "materca",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(PUSTY);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(1);
  });

  it("zapytanie jest ponawiane DOKŁADNIE RAZ — rekurencja nie schodzi głębiej", async () => {
    // Pętla na publicznym /sklep jest niedopuszczalna. Ten moduł sam z siebie
    // nie ma jak zapętlić (ponawia przez wstrzyknięty callback), a wołający
    // dokłada flagę — patrz drift-guard w search-correction-wiring.test.ts.
    // Fraza jest dobrana tak, że poprawka NADAL jest literówką w słowniku:
    // gdyby moduł ponawiał rekurencyjnie, licznik poszedłby wyżej niż 1.
    const s = stanowisko({ rerunResult: PUSTY });
    await applyTypoCorrection({
      search: "materca sofq naroznk",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(s.licznik.ponowienia).toBe(1);
    expect(s.licznik.slownik).toBe(1);
  });
});

describe("applyTypoCorrection — awaria słownika", () => {
  it("wyjątek ze słownika → zachowanie DOKŁADNIE jak dziś, bez wywalenia strony", async () => {
    // getCatalogVocabulary RZUCA przy błędzie bazy — celowo, żeby cache nie
    // zapamiętał pustego słownika na 300 s. Wołający MUSI to złapać: w repo
    // nie ma error.tsx, więc niezłapany wyjątek to strona awarii zamiast
    // zwyczajnego „nic nie znaleźliśmy".
    const s = stanowisko({ vocabularyThrows: true });
    const out = await applyTypoCorrection({
      search: "materca",
      initial: PUSTY,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(PUSTY);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });

  it("wyjątek nie wycieka na zewnątrz nawet przy frazie bez literówek", async () => {
    const s = stanowisko({ vocabularyThrows: true });
    await expect(
      applyTypoCorrection({
        search: "materace",
        initial: PUSTY,
        isEmpty: s.isEmpty,
        loadVocabulary: s.loadVocabulary,
        rerun: s.rerun,
      })
    ).resolves.toMatchObject({ result: PUSTY });
  });
});
