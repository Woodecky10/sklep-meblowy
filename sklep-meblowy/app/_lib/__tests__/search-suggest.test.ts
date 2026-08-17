import { describe, it, expect } from "vitest";
import {
  normalizeSuggestResponse,
  type SearchSuggestion,
} from "@/app/_lib/search-suggest";
import { applyTypoCorrection } from "@/app/_lib/search-correction";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Kształt odpowiedzi widziany przez PRZEGLĄDARKĘ (SearchBox).
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ Ten kawałek istnieje wyłącznie dlatego, że deploy nie wymienia otwartych
// kart klientów. Przez cały okres życia starej karty (a sklep trzyma sesje
// godzinami) możliwe są OBA rozjazdy naraz:
//   • stary bundle → nowe API: dostaje `{ items: [...] }` i musi pokazać
//     podpowiedzi, a nie pustkę — tego nie da się już naprawić w kodzie, który
//     klient ma u siebie, więc pilnuje tego dopiero kolejny deploy;
//   • NOWY bundle → stare API (rollback, cache CDN, żądanie do starszego
//     deploymentu): dostaje GOŁĄ TABLICĘ i ma zachować się dokładnie jak dziś.
// Drugi przypadek jest w naszych rękach i to on jest tu testowany.

const PRZYKLAD: SearchSuggestion = {
  id: "p1",
  name: "Sofa VEGAS",
  price: 2499,
  image: null,
  category: "Sofy",
};

describe("normalizeSuggestResponse — nowy kształt odpowiedzi", () => {
  it("obiekt z items zwraca te same pozycje w tej samej kolejności", () => {
    const items = [
      { ...PRZYKLAD, id: "a" },
      { ...PRZYKLAD, id: "b" },
      { ...PRZYKLAD, id: "c" },
    ];
    const out = normalizeSuggestResponse({ items });
    expect(out.items.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
  });

  it("wariant A: obie frazy korekty przechodzą do UI", () => {
    const out = normalizeSuggestResponse({
      items: [PRZYKLAD],
      correctedFrom: "materca",
      correctedTo: "materac",
    });
    expect(out.correctedFrom).toBe("materca");
    expect(out.correctedTo).toBe("materac");
  });

  it("wariant B: samo correctedFrom (poprawki NIE wolno cytować)", () => {
    // Kontrakt pola z search-correction.ts: `correctedTo` przychodzi DOKŁADNIE
    // wtedy, gdy poprawkę wolno pokazać klientowi. Brak tego pola przy obecnym
    // `correctedFrom` znaczy «korekta zaszła, ale zdanie ma jej nie cytować» —
    // i UI ma to rozróżnienie dostać nietknięte, bo sam go nie odtworzy.
    const out = normalizeSuggestResponse({
      items: [PRZYKLAD],
      correctedFrom: "kanpa",
    });
    expect(out.correctedFrom).toBe("kanpa");
    expect(out.correctedTo).toBeUndefined();
  });

  it("correctedTo bez correctedFrom jest ignorowane w całości", () => {
    // Samo zdanie «Pokazujemy wyniki dla materac» bez wiedzy, że w ogóle była
    // korekta, to zdanie znikąd. Takiej odpowiedzi API nie produkuje — ale
    // produkować ją może STARSZY albo NOWSZY deployment po drugiej stronie.
    const out = normalizeSuggestResponse({
      items: [PRZYKLAD],
      correctedTo: "materac",
    });
    expect(out.items).toHaveLength(1);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
  });

  it("pola korekty spoza typu string są pomijane, bez rzucania", () => {
    const out = normalizeSuggestResponse({
      items: [PRZYKLAD],
      correctedFrom: 42,
      correctedTo: { zle: true },
    });
    expect(out.items).toHaveLength(1);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
  });

  it("puste stringi nie robią z korekty zdania o niczym", () => {
    const out = normalizeSuggestResponse({
      items: [PRZYKLAD],
      correctedFrom: "",
      correctedTo: "",
    });
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
  });
});

describe("normalizeSuggestResponse — STARY kształt (goła tablica)", () => {
  it("tablica podpowiedzi przechodzi bez zmian i bez pól korekty", () => {
    // ⚠️ To jest łagodne zejście z briefu: nowy bundle odpytujący STARE API
    // ma zachować się dokładnie jak dziś — pokazać podpowiedzi i niczego nie
    // rzucić. Kolejność jest częścią kontraktu (ranking robi API).
    const out = normalizeSuggestResponse([
      { ...PRZYKLAD, id: "a" },
      { ...PRZYKLAD, id: "b" },
    ]);
    expect(out.items.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
  });

  it("pusta tablica (dzisiejsze «nic nie znaleziono») daje puste items", () => {
    expect(normalizeSuggestResponse([]).items).toEqual([]);
  });
});

describe("normalizeSuggestResponse — śmieci zamiast odpowiedzi", () => {
  // Dzisiejszy kod robi `Array.isArray(data) ? data : []` i dzięki temu NIE
  // RZUCA na niczym — ta własność ma zostać. Rozwijka wisi w headerze na każdej
  // stronie sklepu, więc wyjątek w tym miejscu to zepsuta cała strona (w repo
  // nie ma error.tsx).
  const smieci: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["string", "materac"],
    ["liczba", 7],
    ["pusty obiekt", {}],
    ["items niebędące tablicą", { items: "sofa" }],
    ["items null", { items: null }],
    ["odpowiedź błędu API", { error: "boom" }],
  ];

  it.each(smieci)("«%s» → puste items, bez rzucania", (_opis, dane) => {
    expect(() => normalizeSuggestResponse(dane)).not.toThrow();
    expect(normalizeSuggestResponse(dane)).toEqual({ items: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. KIEDY rozwijka w ogóle próbuje poprawiać — kompozycja użyta w route.
// ─────────────────────────────────────────────────────────────────────────────
//
// Route woła to samo applyTypoCorrection co /sklep, ale z INNYM `R` i innym
// predykatem pustki: tu wynikiem jest goła lista podpowiedzi, więc pusto znaczy
// `length === 0` (a nie `total === 0`, bo rozwijka nie ma paginacji ani pola
// total). Testy Taska 3 sprawdzają tamtą kompozycję i tej nie pokrywają —
// dlatego ta sekcja istnieje mimo pozornego podobieństwa.
//
// Zapytania do bazy nie ma: całe I/O jest wstrzyknięte (repo nie mockuje
// supabase), a licznik wywołań jest tu głównym dowodem.

const KATALOG: ReadonlyMap<string, number> = new Map([
  // Wagi z pomiaru na produkcji 2026-08-17 (353 aktywne pozycje): liczba nazw,
  // w których słowo występuje. `kanap` to goły rdzeń ze słownika ręcznego —
  // waga 1, bo w ŻADNEJ nazwie go nie ma (sklep sprzedaje «sofy»).
  ["materac", 83],
  ["sofa", 41],
  ["naroznik", 40],
  ["fotel", 9],
  ["kanap", 1],
]);

const ZNALEZIONE: SearchSuggestion[] = [
  { ...PRZYKLAD, id: "a" },
  { ...PRZYKLAD, id: "b" },
  { ...PRZYKLAD, id: "c" },
];

function stanowisko(opcje: {
  vocabularyThrows?: boolean;
  rerunResult?: SearchSuggestion[];
}) {
  const licznik = { slownik: 0, ponowienia: 0, frazy: [] as string[] };
  return {
    licznik,
    loadVocabulary: async () => {
      licznik.slownik++;
      if (opcje.vocabularyThrows) throw new Error("baza padła");
      return KATALOG;
    },
    rerun: async (phrase: string) => {
      licznik.ponowienia++;
      licznik.frazy.push(phrase);
      return opcje.rerunResult ?? ZNALEZIONE;
    },
    // DOKŁADNIE ten predykat, który podaje route.
    isEmpty: (items: SearchSuggestion[]) => items.length === 0,
  };
}

describe("rozwijka — BRAK REGRESJI (najważniejszy test tego taska)", () => {
  it("fraza z podpowiedziami zwraca TE SAME podpowiedzi w TEJ SAMEJ kolejności, bez pól korekty", async () => {
    // ⚠️ Fraza jest ZŁOŚLIWIE dobrana tak, żeby dała się poprawić
    // («materca» → «materac», zmierzone na produkcji). Gdyby ktoś kiedyś puścił
    // korektę bezwarunkowo — zamiast wyłącznie przy pustej liście — ten test
    // padnie na trzy sposoby naraz: podmieniona lista, doklejone pola korekty
    // i niezerowe liczniki wstrzykniętego I/O.
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "materca",
      initial: ZNALEZIONE,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(ZNALEZIONE);
    expect(out.result.map((s2) => s2.id)).toEqual(["a", "b", "c"]);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    // Rozwijka to najgorętszy endpoint sklepu (żądanie na każde wpisane słowo):
    // przy trafionej frazie nie ma prawa kosztować ANI JEDNEGO zapytania więcej.
    expect(s.licznik.slownik).toBe(0);
    expect(s.licznik.ponowienia).toBe(0);
  });

  it("jedna podpowiedź to też nie jest pustka", async () => {
    // Granica predykatu. `length === 0`, a nie «mało wyników» — poprawianie
    // frazy, która COŚ znalazła, podmieniłoby klientowi trafienie na cudze.
    const jedna = [PRZYKLAD];
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "materca",
      initial: jedna,
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(jedna);
    expect(out.correctedFrom).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });
});

describe("rozwijka — pusta lista podpowiedzi", () => {
  it("literówka z trafną poprawką: podpowiedzi + OBA pola korekty", async () => {
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "materca",
      initial: [],
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toBe(ZNALEZIONE);
    expect(out.correctedFrom).toBe("materca");
    expect(out.correctedTo).toBe("materac");
    expect(s.licznik.frazy).toEqual(["materac"]);
    // Ponowienie DOKŁADNIE raz — rekurencja w rozwijce jest niedopuszczalna
    // tak samo jak na /sklep.
    expect(s.licznik.ponowienia).toBe(1);
  });

  it("wariant B: poprawka jest gołym rdzeniem → correctedTo NIE przychodzi", async () => {
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "kanpa",
      initial: [],
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.correctedFrom).toBe("kanpa");
    expect(out.correctedTo).toBeUndefined();
    // Do ZAPYTANIA rdzeń trafia mimo wszystko — tego klient nie widzi.
    expect(s.licznik.frazy).toEqual(["kanap"]);
  });

  it("brak sensownego kandydata → pusto, bez pól korekty, bez ponowienia", async () => {
    const s = stanowisko({});
    const out = await applyTypoCorrection({
      search: "zzzzzzz",
      initial: [],
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toEqual([]);
    expect(out.correctedFrom).toBeUndefined();
    expect(out.correctedTo).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });

  it("poprawka, która nadal nic nie znajduje → pusto, bez pól korekty", async () => {
    const s = stanowisko({ rerunResult: [] });
    const out = await applyTypoCorrection({
      search: "materca",
      initial: [],
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toEqual([]);
    expect(out.correctedFrom).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(1);
  });

  it("awaria słownika nie wywala rozwijki", async () => {
    // getCatalogVocabulary RZUCA przy błędzie bazy (celowo — żeby cache nie
    // zapamiętał pustego słownika na 300 s). Rozwijka wisi w headerze KAŻDEJ
    // strony, więc niezłapany wyjątek to 500 z najgorętszego endpointu.
    const s = stanowisko({ vocabularyThrows: true });
    const out = await applyTypoCorrection({
      search: "materca",
      initial: [],
      isEmpty: s.isEmpty,
      loadVocabulary: s.loadVocabulary,
      rerun: s.rerun,
    });

    expect(out.result).toEqual([]);
    expect(out.correctedFrom).toBeUndefined();
    expect(s.licznik.ponowienia).toBe(0);
  });
});
