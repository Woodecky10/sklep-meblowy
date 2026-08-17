import { describe, it, expect } from "vitest";
import {
  SEARCH_SYNONYMS,
  NOT_CARRIED,
  synonymsFor,
  notCarriedLabel,
} from "@/app/_lib/search-vocabulary";
import {
  searchKeyTokens,
  searchKeyTokenGroups,
  rankByNameMatch,
} from "@/app/_lib/search-filter";

describe("SEARCH_SYNONYMS — kształt wpisów", () => {
  it("klucze i wartości to wyłącznie małe litery ASCII i cyfry", () => {
    // Bramka bezpieczeństwa: wartości trafiają do składni PostgREST .or(),
    // gdzie przecinek, kropka i nawias są znakami znaczącymi. Wpis z takim
    // znakiem ROZJECHAŁBY filtr, a nie tylko nie zadziałał.
    for (const [key, values] of SEARCH_SYNONYMS) {
      expect(key, `klucz ${key}`).toMatch(/^[a-z0-9]+$/);
      for (const value of values) {
        expect(value, `wartość ${value} przy kluczu ${key}`).toMatch(
          /^[a-z0-9]+$/
        );
      }
    }
  });

  it("klucze NOT_CARRIED też są czystymi rdzeniami", () => {
    for (const key of NOT_CARRIED.keys()) {
      expect(key).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("żaden synonim nie wskazuje na własny klucz", () => {
    for (const [key, values] of SEARCH_SYNONYMS) {
      expect(values, `klucz ${key}`).not.toContain(key);
    }
  });

  it("słownik synonimów i lista nieprowadzonych nie mają wspólnych kluczy", () => {
    // Wpis w obu naraz znaczyłby „rozszerz o synonim, a potem powiedz, że nie
    // prowadzimy" — sprzeczność.
    const wspolne = [...SEARCH_SYNONYMS.keys()].filter((k) =>
      NOT_CARRIED.has(k)
    );
    expect(wspolne).toEqual([]);
  });
});

describe("SEARCH_SYNONYMS — klucze osiągalne dla tokenizera", () => {
  // Najgroźniejszy możliwy błąd w tym pliku to klucz, którego searchKeyTokens
  // nigdy nie wyprodukuje — wpis wygląda dobrze i nie robi nic.
  const przypadki: [string, string][] = [
    ["kanapa", "kanap"],
    ["kanapy", "kanap"],
    ["kanapka", "kanapk"],
    ["wersalka", "wersalk"],
    ["sofka", "sofk"],
    ["otomana", "otoman"],
    ["szezlong", "szezlong"],
    ["leżanka", "lezank"],
    ["tapczan", "tapczan"],
    ["kącik", "kacik"],
    ["podnóżek", "podnozek"],
    ["podnóżka", "podnozk"],
    ["łóżeczko", "lozeczk"],
    ["posłanie", "poslan"],
    ["boxspring", "boxspring"],
    ["materacyk", "materacyk"],
    ["fotelik", "fotelik"],
    ["dziecinne", "dziecinn"],
  ];

  it.each(przypadki)("„%s\" tokenizuje się do „%s\"", (slowo, rdzen) => {
    expect(searchKeyTokens(slowo)).toEqual([rdzen]);
    expect(SEARCH_SYNONYMS.has(rdzen)).toBe(true);
  });

  it("każdy klucz słownika ma pokrycie w powyższej tabeli", () => {
    // Bez tego można dopisać wpis i nigdy nie sprawdzić, czy jest osiągalny.
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = [...SEARCH_SYNONYMS.keys()].filter(
      (k) => !pokryte.has(k)
    );
    expect(niepokryte).toEqual([]);
  });
});

describe("NOT_CARRIED — klucze osiągalne dla tokenizera", () => {
  // Ta sama bramka co dla kluczy synonimów, z tego samego powodu: klucz, którego
  // searchKeyTokens nigdy nie wyprodukuje, nie zgłosi błędu — klient po prostu
  // nigdy nie zobaczy „Nie prowadzimy ...". Dopasowanie w notCarriedLabel jest
  // po DOKŁADNYM kluczu, więc rdzeń musi zgadzać się co do znaku.
  const przypadki: [string, string][] = [
    ["szafa", "szaf"],
    ["szafy", "szaf"],
    ["komoda", "komod"],
    ["komody", "komod"],
    ["stół", "stol"],
    ["stoły", "stol"],
    ["krzesło", "krzesl"],
    ["krzesła", "krzesl"],
    ["biurko", "biurk"],
    ["biurka", "biurk"],
    ["dywan", "dywan"],
    ["dywany", "dywan"],
    ["lampa", "lamp"],
    ["lampy", "lamp"],
    ["regał", "regal"],
    ["regały", "regal"],
  ];

  it.each(przypadki)("„%s\" tokenizuje się do „%s\"", (slowo, rdzen) => {
    expect(searchKeyTokens(slowo)).toEqual([rdzen]);
    expect(NOT_CARRIED.has(rdzen)).toBe(true);
  });

  it("każdy klucz listy ma pokrycie w powyższej tabeli", () => {
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = [...NOT_CARRIED.keys()].filter((k) => !pokryte.has(k));
    expect(niepokryte).toEqual([]);
  });
});

describe("SEARCH_SYNONYMS — wartości osiągalne dla tokenizera", () => {
  // Wartości to rdzenie KATALOGOWE: idą do zapytania jako podciąg dopasowywany
  // do kolumny search_key_fold. Wartość w formie odmienionej („sofy" zamiast
  // „sof") nie wywali zapytania — po cichu przestanie łapać część wierszy
  // („…sofa…"), czyli synonim zadziała słabiej, niż wygląda. Przejście tej
  // tabeli dowodzi, że wartość jest tą najkrótszą formą, którą tokenizer
  // produkuje z katalogowego słowa, więc łapie wszystkie jego odmiany.
  const wartosci = new Set([...SEARCH_SYNONYMS.values()].flat());
  const przypadki: [string, string][] = [
    ["sofa", "sof"],
    ["sofy", "sof"],
    ["narożnik", "naroznik"],
    ["narożniki", "naroznik"],
    ["pufa", "puf"],
    ["pufy", "puf"],
    ["łóżko", "lozk"],
    ["łóżka", "lozk"],
    ["kontynentalne", "kontynentaln"],
    ["kontynentalny", "kontynentaln"],
    ["materac", "materac"],
    ["materace", "materac"],
    ["fotel", "fotel"],
    ["fotele", "fotel"],
    ["dziecięce", "dzieciec"],
    ["dziecięcy", "dzieciec"],
  ];

  it.each(przypadki)("„%s\" tokenizuje się do „%s\"", (slowo, rdzen) => {
    expect(searchKeyTokens(slowo)).toEqual([rdzen]);
    expect(wartosci.has(rdzen)).toBe(true);
  });

  it("każda wartość słownika ma pokrycie w powyższej tabeli", () => {
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = [...wartosci].filter((w) => !pokryte.has(w));
    expect(niepokryte).toEqual([]);
  });
});

describe("synonymsFor / notCarriedLabel", () => {
  it("rdzeń ze słownika dostaje siebie na pierwszym miejscu i synonimy dalej", () => {
    expect(synonymsFor("kanap")).toEqual(["kanap", "sof"]);
    expect(synonymsFor("tapczan")).toEqual(["tapczan", "sof", "lozk"]);
  });

  it("rdzeń bez wpisu zwraca sam siebie", () => {
    expect(synonymsFor("materac")).toEqual(["materac"]);
  });

  it("nazwa nieprowadzonej rzeczy po pierwszym pasującym rdzeniu", () => {
    expect(notCarriedLabel(["szaf"], "pl")).toBe("szaf");
    expect(notCarriedLabel(["szaf"], "de")).toBe("Schränke");
    expect(notCarriedLabel(["drewnian", "komod"], "pl")).toBe("komód");
  });

  it("fraza spoza listy → null", () => {
    expect(notCarriedLabel(["xyzabc"], "pl")).toBeNull();
    expect(notCarriedLabel([], "pl")).toBeNull();
  });
});

describe("klucze z łańcucha prototypu — odczyt spoza słownika", () => {
  // REGRES DO ZATRZYMANIA NA ZAWSZE. Dopóki słowniki były literałami
  // obiektowymi, `SEARCH_SYNONYMS["constructor"]` wracało funkcją `Object`
  // z prototypu — wartością prawdziwościowo prawdziwą i NIEiterowalną — więc
  // `[stem, ...extra]` rzucało `TypeError: extra is not iterable`. Klucz idzie
  // wprost od klienta, więc `/sklep?q=constructor` wywalało render RSC
  // (w repo nie ma error.tsx), a `/api/search/suggest?q=constructor` dawało
  // 500 z najgorętszego endpointu sklepu. Dziś słowniki to `Map`, a te testy
  // pilnują, żeby nikt nie wrócił do literału ani nie dopisał obok helpera
  // z tym samym odczytem.
  //
  // Co tokenizer NAPRAWDĘ produkuje (zmierzone realnym searchKeyTokens):
  //   „constructor"    → „constructor"     OSIĄGALNE i to ono wywalało 500
  //   „tostring"       → „tostring"        osiągalne; nieszkodliwe, bo
  //   „valueof"        → „valueof"         własności są camelCase, a token jest
  //                                        po foldDiacritics zawsze małymi
  //   „prototype"      → „prototyp"        samo słowo NIE trafia; „prototypea"
  //                                        już tak (końcówka „a" obcięta)
  //   „hasownproperty" → „hasownpropert"   j.w.; trafia „hasownpropertya"
  //   „__proto__"      → „prot"            sanitizeSearchTerm wycina `_`, więc
  //                                        klucza „__proto__" z frazy nie da
  //                                        się zbudować — ale funkcje są
  //                                        publiczne, więc pinujemy i to
  const zPrototypu = [
    "constructor",
    "prototype",
    "tostring",
    "valueof",
    "hasownproperty",
    "proto",
    "__proto__",
  ];

  it.each(zPrototypu)("synonymsFor(„%s\") zwraca sam rdzeń", (stem) => {
    expect(synonymsFor(stem)).toEqual([stem]);
  });

  it.each(zPrototypu)("notCarriedLabel([„%s\"]) daje null", (stem) => {
    // Ta sama dziura, cichsza: przy literale zwracało `undefined` przy
    // zadeklarowanym `string | null`.
    expect(notCarriedLabel([stem], "pl")).toBeNull();
    expect(notCarriedLabel([stem], "de")).toBeNull();
  });

  it("„constructor\" jest naprawdę osiągalne dla tokenizera", () => {
    // Bez tego powyższe testy pinowałyby wejście, którego klient nie umie
    // wpisać. Żadna końcówka z listy nie pasuje do słowa na „r", więc stem
    // nie obcina niczego, a sanityzacja przepuszcza same litery.
    expect(searchKeyTokens("constructor")).toEqual(["constructor"]);
    expect(searchKeyTokens("kanapa constructor")).toEqual([
      "kanap",
      "constructor",
    ]);
  });

  it("cały potok filtra nie rzuca dla frazy trafiającej w prototyp", () => {
    expect(searchKeyTokenGroups("constructor")).toEqual([["constructor"]]);
    // Wystarczyło JEDNO takie słowo we frazie, żeby wywalić całe zapytanie.
    expect(searchKeyTokenGroups("kanapa constructor")).toEqual([
      ["kanap", "sof"],
      ["constructor"],
    ]);
  });

  it("ranking nie rzuca dla frazy trafiającej w prototyp", () => {
    // rankByNameMatch woła synonymsFor osobno, więc miał tę samą dziurę.
    const rows = [{ name: "Sofa Modena" }, { name: "Łóżko Lino" }];
    expect(rankByNameMatch(rows, "constructor", (r) => r.name)).toEqual(rows);
  });
});
