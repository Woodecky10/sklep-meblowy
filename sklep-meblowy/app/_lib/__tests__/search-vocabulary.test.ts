import { describe, it, expect } from "vitest";
import {
  SEARCH_SYNONYMS,
  NOT_CARRIED,
  synonymsFor,
  notCarriedLabel,
} from "@/app/_lib/search-vocabulary";
import { searchKeyTokens } from "@/app/_lib/search-filter";

describe("SEARCH_SYNONYMS — kształt wpisów", () => {
  it("klucze i wartości to wyłącznie małe litery ASCII i cyfry", () => {
    // Bramka bezpieczeństwa: wartości trafiają do składni PostgREST .or(),
    // gdzie przecinek, kropka i nawias są znakami znaczącymi. Wpis z takim
    // znakiem ROZJECHAŁBY filtr, a nie tylko nie zadziałał.
    for (const [key, values] of Object.entries(SEARCH_SYNONYMS)) {
      expect(key, `klucz ${key}`).toMatch(/^[a-z0-9]+$/);
      for (const value of values) {
        expect(value, `wartość ${value} przy kluczu ${key}`).toMatch(
          /^[a-z0-9]+$/
        );
      }
    }
  });

  it("klucze NOT_CARRIED też są czystymi rdzeniami", () => {
    for (const key of Object.keys(NOT_CARRIED)) {
      expect(key).toMatch(/^[a-z0-9]+$/);
    }
  });

  it("żaden synonim nie wskazuje na własny klucz", () => {
    for (const [key, values] of Object.entries(SEARCH_SYNONYMS)) {
      expect(values, `klucz ${key}`).not.toContain(key);
    }
  });

  it("słownik synonimów i lista nieprowadzonych nie mają wspólnych kluczy", () => {
    // Wpis w obu naraz znaczyłby „rozszerz o synonim, a potem powiedz, że nie
    // prowadzimy" — sprzeczność.
    const wspolne = Object.keys(SEARCH_SYNONYMS).filter((k) => k in NOT_CARRIED);
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
    expect(rdzen in SEARCH_SYNONYMS).toBe(true);
  });

  it("każdy klucz słownika ma pokrycie w powyższej tabeli", () => {
    // Bez tego można dopisać wpis i nigdy nie sprawdzić, czy jest osiągalny.
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = Object.keys(SEARCH_SYNONYMS).filter(
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
    expect(rdzen in NOT_CARRIED).toBe(true);
  });

  it("każdy klucz listy ma pokrycie w powyższej tabeli", () => {
    const pokryte = new Set(przypadki.map(([, rdzen]) => rdzen));
    const niepokryte = Object.keys(NOT_CARRIED).filter((k) => !pokryte.has(k));
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
  const wartosci = new Set(Object.values(SEARCH_SYNONYMS).flat());
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
