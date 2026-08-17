import { describe, it, expect } from "vitest";
import {
  SEARCH_SYNONYMS,
  NOT_CARRIED,
  synonymsFor,
  notCarriedLabel,
  buildCatalogVocabulary,
  VOCABULARY_EXTRA_WORDS,
  MIN_VOCABULARY_WORD_LENGTH,
} from "@/app/_lib/search-vocabulary";
import {
  searchKeyTokens,
  searchKeyTokenGroups,
  rankByNameMatch,
} from "@/app/_lib/search-filter";
import { pickCorrection } from "@/app/_lib/search-typos";

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

describe("buildCatalogVocabulary — rozbicie nazw na słowa", () => {
  it("tnie nazwę na słowa i składa znaki do ASCII", () => {
    const vocab = buildCatalogVocabulary(["Łóżko Kontynentalne VEGAS"], []);
    expect([...vocab.keys()]).toEqual(["lozko", "kontynentalne", "vegas"]);
  });

  it("tnie po KAŻDYM znaku niebędącym literą ani cyfrą", () => {
    // Separatory zmierzone w nazwach na produkcji 2026-08-17 (353 aktywne
    // pozycje): spacja, `-`, `–` (półpauza, U+2013), `,`, `!`, `(`, `)`, `/`,
    // `|`. Nazwa poniżej zbiera je wszystkie w jednym stringu — gdyby ktoś
    // zawęził cięcie do samej spacji, „narożnik/prawy" wjechałoby do słownika
    // jako jedno słowo, którego klient nigdy nie wpisze.
    const vocab = buildCatalogVocabulary(
      ["Sofa (Modena) - narożnik/prawy, 120x200 – NOWOŚĆ!|premium"],
      []
    );
    expect([...vocab.keys()]).toEqual([
      "sofa",
      "modena",
      "naroznik",
      "prawy",
      "120x200",
      "nowosc",
      "premium",
    ]);
  });

  it("cyfry zostają częścią słowa", () => {
    // „120x200" to 41 produktów i realna fraza wyszukiwania — rozmiar musi
    // przeżyć tokenizację w jednym kawałku.
    const vocab = buildCatalogVocabulary(["Materac 120x200 Visco"], []);
    expect(vocab.has("120x200")).toBe(true);
  });

  it("odrzuca słowa krótsze niż trzy znaki", () => {
    // Nie oszczędność, tylko martwy balast: maxTypos daje próg 1 dopiero od
    // 4 znaków, a różnica długości > próg ucina editDistanceWithin od razu —
    // więc do słowa 2-znakowego nie da się dojść ŻADNYM tokenem.
    const vocab = buildCatalogVocabulary(["Łóżko z pojemnikiem na 2 osoby"], []);
    expect([...vocab.keys()]).toEqual(["lozko", "pojemnikiem", "osoby"]);
    expect(MIN_VOCABULARY_WORD_LENGTH).toBe(3);
  });

  it("długość mierzona PO złożeniu znaków", () => {
    // „Fuß" ma 3 znaki surowo, ale foldDiacritics rozwija ß na „ss" → „fuss".
    // Klient wpisze frazę też po złożeniu, więc filtr musi patrzeć na tę samą
    // postać co klucz.
    const vocab = buildCatalogVocabulary(["Fuß Bali"], []);
    expect([...vocab.keys()]).toEqual(["fuss", "bali"]);
  });

  it("pusta nazwa i sama interpunkcja nic nie wnoszą", () => {
    const vocab = buildCatalogVocabulary(["", "   ", "- , !"], []);
    expect(vocab.size).toBe(0);
  });
});

describe("buildCatalogVocabulary — waga", () => {
  it("waga to liczba PRODUKTÓW, nie wystąpień", () => {
    // Task 1 rozstrzyga remisy wagą, więc zliczanie wystąpień promowałoby
    // nazwy z powtórzeniem słowa zamiast słów naprawdę popularnych w katalogu.
    const zDwoch = buildCatalogVocabulary(["Sofa Modena", "Sofa Verona"], []);
    expect(zDwoch.get("sofa")).toBe(2);

    const zJednej = buildCatalogVocabulary(["Sofa sofa Modena"], []);
    expect(zJednej.get("sofa")).toBe(1);
  });

  it("powtórzenie liczy się raz nawet przy różnej pisowni", () => {
    // „SOFA" i „sofa" to po złożeniu ten sam klucz — jeden produkt, waga 1.
    const vocab = buildCatalogVocabulary(["SOFA narożna sofa"], []);
    expect(vocab.get("sofa")).toBe(1);
  });
});

describe("buildCatalogVocabulary — słowa ze słowników ręcznych", () => {
  it("klucze i wartości SEARCH_SYNONYMS oraz klucze NOT_CARRIED są w słowniku", () => {
    // Bez tego „kanpa" nie ma na co się poprawić: słowa „kanapa" NIE MA
    // w żadnej z 353 nazw (sklep sprzedaje „sofy"), a „szfa" odbierałoby
    // klientowi uczciwe „Nie prowadzimy szaf".
    const vocab = buildCatalogVocabulary([], VOCABULARY_EXTRA_WORDS);
    for (const key of SEARCH_SYNONYMS.keys()) {
      expect(vocab.has(key), `klucz synonimu ${key}`).toBe(true);
    }
    for (const value of [...SEARCH_SYNONYMS.values()].flat()) {
      expect(vocab.has(value), `wartość synonimu ${value}`).toBe(true);
    }
    for (const key of NOT_CARRIED.keys()) {
      expect(vocab.has(key), `klucz nieprowadzonego ${key}`).toBe(true);
    }
  });

  it("VOCABULARY_EXTRA_WORDS nie ma duplikatów", () => {
    expect(VOCABULARY_EXTRA_WORDS.length).toBe(
      new Set(VOCABULARY_EXTRA_WORDS).size
    );
  });

  it("słowo dodatkowe NIE zaniża wagi słowa z katalogu", () => {
    // Cztery słowa są jednocześnie w słownikach ręcznych i w nazwach
    // produktów (pomiar 2026-08-17: `naroznik` 40, `materac` 83, `fotel` 9,
    // `boxspring` 4). Gdyby dokładanie nadpisywało wagę, przegrywałyby remisy
    // z byle czym. Nazwy poniżej są syntetyczne — chodzi o samą arytmetykę.
    const vocab = buildCatalogVocabulary(
      ["Fotel Alva", "Fotel Aurea"],
      ["fotel"]
    );
    expect(vocab.get("fotel")).toBe(2);
  });

  it("pusta lista nazw daje poprawny słownik z samymi dodatkami", () => {
    const vocab = buildCatalogVocabulary([], VOCABULARY_EXTRA_WORDS);
    expect(vocab.size).toBe(VOCABULARY_EXTRA_WORDS.length);
    expect(buildCatalogVocabulary([], []).size).toBe(0);
  });
});

describe("buildCatalogVocabulary — klucze z łańcucha prototypu", () => {
  // TEN SAM REGRES CO WYŻEJ, tyle że po stronie słownika katalogowego. Klucz
  // odpytuje pickCorrection tokenem WPROST od klienta, a odczyt z literału
  // obiektowego schodzi na prototyp: `OBJ["constructor"]` zwraca funkcję
  // `Object` — wartość prawdziwościowo prawdziwą — więc pickCorrection
  // uznałby, że fraza „constructor" jest poprawna, i po cichu przestałby
  // poprawiać. Zwracana struktura MUSI być `Map`.
  const zPrototypu = [
    "constructor",
    "prototype",
    "toString",
    "tostring",
    "valueOf",
    "valueof",
    "hasOwnProperty",
    "hasownproperty",
    "__proto__",
  ];

  it("zwracana struktura to Map", () => {
    expect(buildCatalogVocabulary(["Sofa Modena"], [])).toBeInstanceOf(Map);
  });

  it("pickCorrection na tym słowniku nie uznaje „constructor\" za słowo katalogu", () => {
    // Sedno regresu po stronie korekty: przy literale obiektowym
    // `vocabulary.has(token)` byłoby prawdą dla „constructor", więc funkcja
    // wyszłaby wcześniej z null — korekta przestałaby działać po cichu.
    const vocab = buildCatalogVocabulary(
      ["Sofa 2-osobowa Aurea", "Sofa 2-osobowa Elio"],
      VOCABULARY_EXTRA_WORDS
    );
    expect(pickCorrection("constructor", vocab)).toBeNull();
    expect(pickCorrection("sofq", vocab)).toBe("sofa");
  });

  it.each(zPrototypu)("„%s\" nie jest w słowniku i nie zwraca śmieci", (key) => {
    const vocab = buildCatalogVocabulary(
      ["Sofa Modena", "Łóżko Kontynentalne VEGAS"],
      VOCABULARY_EXTRA_WORDS
    );
    expect(vocab.has(key)).toBe(false);
    expect(vocab.get(key)).toBeUndefined();
  });
});

// Nazwy SKOPIOWANE Z PRODUKCJI 2026-08-17 (353 aktywne pozycje), nie wymyślone.
// Chodzi o to, żeby kształt danych był prawdziwy: rzeczywiste nazwy mają
// półpauzy, ukośniki, cyfry, powtórzone słowo w jednej nazwie („Sofa … sofa …")
// i trzyliterowe wtręty (`box`, `rog`, `mio`, `dla`, `psa`), a każdy z tych
// szczegółów zmienia wynik korekty.
const NAZWY_Z_PRODUKCJI = [
  "Sofa 2-osobowa Aurea – nowoczesna sofa do salonu na złotych nogach",
  "Sofa 2-osobowa Elio – elegancka sofa tapicerowana do salonu",
  "Sofa 2-osobowa Livia – nowoczesna sofa modułowa do salonu",
  "Sofa modułowa Nuvo bez podłokietników",
  "Fotel Alva – miękka forma i wyrazisty design",
  "Fotel Aurea – elegancki fotel do salonu na złotych nogach",
  "Pufa Alva – nowoczesna elegancja i wielofunkcyjność",
  "Pufa Alva Mini – nowoczesna pufa o zaokrąglonej formie",
  "Łóżko kontynentalne Karo 2 z materacem 120x200 cm",
  "Łóżko kontynentalne Karo 2 z materacem 140x200 cm",
  "Łóżko kontynentalne box Tiki boucle baranek 140x200",
  "Łóżko kontynentalne dla dzieci i młodzieży Kori 80x200",
  "Narożnik modułowy MIO L – nowoczesny design i wyjątkowy komfort",
  "Róg Lova P – stwórz narożnik dopasowany do siebie",
  "Materac nawierzchniowy Nova T25 3 cm 70x200 cm",
  "schodki dla psa/kotka pupila",
];

describe("słownik z prawdziwych nazw — kształt", () => {
  const vocab = buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, VOCABULARY_EXTRA_WORDS);

  it("nazwa z powtórzonym słowem daje wagę 1 na produkt", () => {
    // „Sofa 2-osobowa Aurea – nowoczesna sofa do salonu…" ma „sofa" DWA razy.
    // Cztery nazwy z sofą → waga 4, nie 7.
    expect(vocab.get("sofa")).toBe(4);
  });

  it("cyfry i rozmiary przeżywają tokenizację", () => {
    expect(vocab.get("120x200")).toBe(1);
    expect(vocab.get("t25")).toBe(1);
  });

  it("słowo dodatkowe nie zaniża wagi słowa z katalogu", () => {
    // `naroznik` i `fotel` są jednocześnie wartościami SEARCH_SYNONYMS
    // i słowami z nazw — waga musi zostać katalogowa.
    expect(vocab.get("naroznik")).toBe(2);
    expect(vocab.get("fotel")).toBe(2);
    // A `sof`/`puf` (rdzenie, w nazwach nie występują) mają wagę „istnieje".
    expect(vocab.get("sof")).toBe(1);
    expect(vocab.get("puf")).toBe(1);
  });
});

describe("słownik z prawdziwych nazw + pickCorrection", () => {
  // Domknięcie Taska 1: tam słownik był atrapą z testu, tu jest wyprowadzony
  // z prawdziwych nazw. Wszystkie wyniki poniżej zostały ZMIERZONE na pełnym
  // słowniku produkcyjnym (267 słów: 238 z 353 nazw + 33 dodatkowe) i dają na
  // tej próbce to samo.
  const vocab = buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, VOCABULARY_EXTRA_WORDS);

  it.each([
    ["materca", "materac"],
    ["sofq", "sofa"],
    ["naroznk", "naroznik"],
    ["fotle", "fotel"],
  ])("literówka z produkcji „%s\" → „%s\"", (token, poprawka) => {
    expect(pickCorrection(token, vocab)).toBe(poprawka);
  });

  it("„kanpa\" trafia w klucz synonimu, którego NIE MA w żadnej nazwie", () => {
    // Bez VOCABULARY_EXTRA_WORDS kandydata nie ma w ogóle: słowo „kanapa" nie
    // występuje w katalogu ani razu, a klient dalej widziałby zero.
    expect(pickCorrection("kanpa", vocab)).toBe("kanap");
    expect(pickCorrection("kanpa", buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, []))).toBeNull();
  });

  it("„dywna\" trafia w klucz NOT_CARRIED, czyli w komunikat o braku", () => {
    // Sklep dywanów nie prowadzi, ale ma dla nich uczciwą odpowiedź
    // („Nie prowadzimy dywanów"). Bez klucza `dywan` w słowniku literówka
    // odbierałaby klientowi tę odpowiedź i zostawiała same zero wyników.
    expect(pickCorrection("dywna", vocab)).toBe("dywan");
    expect(
      pickCorrection("dywna", buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, []))
    ).toBeNull();
  });

  it("słowo dodatkowe nie wygrywa remisu ze słowem z katalogu", () => {
    // „kontynentalny" leży o 1 od `kontynentalne` (waga 4, z nazw) i o 1 od
    // `kontynentaln` (waga 1, rdzeń ze słownika ręcznego). Waga rozstrzyga —
    // i dlatego dodatki dostają 1, a nie cokolwiek wyższego.
    expect(pickCorrection("kontynentalny", vocab)).toBe("kontynentalne");
    expect(pickCorrection("pufy", vocab)).toBe("pufa");
  });
});

describe("słowa 3-literowe — czy kradną poprawki", () => {
  // OBAWA Z PRZEGLĄDU TASKA 1: próg liczy się z długości tokenu KLIENTA, więc
  // token 4-znakowy (próg 1) może wylądować na słowie 3-znakowym, choć samego
  // słowa 3-znakowego nigdy byśmy nie poprawiali (próg 0). Dotyczy to WYŁĄCZNIE
  // tokenów 4-znakowych: przy 5 znakach różnica długości to już 2 i
  // editDistanceWithin ucina parę bez liczenia.
  //
  // Zmierzone na pełnym słowniku produkcyjnym 2026-08-17: z 88 realistycznych
  // fraz 4-literowych 12 ląduje na słowie 3-literowym i większość jest TRAFNA
  // (`boxy`→`box` — 8 łóżek „kontynentalne box"; `rogi`/`rogu`→`rog` — moduł
  // „Róg Lova P"). Nietrafione są dwie klasy: nazwa kolekcji (`flok`→`flo`)
  // i przyimek z nazwy (`beza`→`bez`, z „sofa … bez podłokietników"). To NIE
  // jest wada słów trzyliterowych: dokładnie tak samo wypadają czteroliterowe
  // nazwy kolekcji (`para`→`lara`, `noga`→`nova`, `lata`→`lara`), których próg
  // 4 znaków by nie ruszył. Podniesienie progu kosztowałoby trafne `box`/`rog`
  // i nie usunęłoby ani jednej z tych głupich kandydatur.
  const vocab = buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, VOCABULARY_EXTRA_WORDS);

  it.each([
    ["boxy", "box"],
    ["rogi", "rog"],
    ["rogu", "rog"],
  ])("„%s\" → „%s\" (trafienie, nie hałas)", (token, poprawka) => {
    expect(pickCorrection(token, vocab)).toBe(poprawka);
  });

  it("słowo 3-literowe nie odbiera poprawki dłuższemu słowu z nazwy", () => {
    // `sofq` leży o 1 i od `sofa` (waga 4), i od `sof` (rdzeń, waga 1);
    // `pufy` o 1 i od `pufa` (2), i od `puf` (1). W obu remisach wygrywa
    // słowo z katalogu — to jedyne, co trzyma trzyliterowe rdzenie w ryzach.
    expect(pickCorrection("sofq", vocab)).toBe("sofa");
    expect(pickCorrection("pufy", vocab)).toBe("pufa");
  });

  it("słowo 3-literowe nie jest poprawiane samo z siebie", () => {
    expect(pickCorrection("rog", vocab)).toBeNull();
    expect(pickCorrection("bxo", vocab)).toBeNull();
  });
});

describe("zmierzone niespodzianki — pinowane świadomie", () => {
  const vocab = buildCatalogVocabulary(NAZWY_Z_PRODUKCJI, VOCABULARY_EXTRA_WORDS);

  it("„szfa\" idzie na „sofa\", a nie na „szaf\"", () => {
    // ⚠️ Brief motywował klucze NOT_CARRIED przykładem „szfa" → „szafa" →
    // komunikat „Nie prowadzimy szaf". Zmierzone: `szfa` leży o 1 od `szaf`
    // (przestawienie, waga 1) i o 1 od `sofa` (substytucja z→o, waga 4 na
    // próbce, 38 na produkcji), więc remis rozstrzyga waga i wygrywa `sofa`.
    // Klient dostanie sofy zamiast „Nie prowadzimy szaf" — świadomie przyjęte:
    // pokazanie realnych produktów nie jest gorsze od komunikatu o braku, a
    // podbicie wagi dodatków po to, żeby wygrywały, zepsułoby wszystkie inne
    // remisy. Klucze NOT_CARRIED zarabiają na siebie tam, gdzie katalog nie ma
    // bliskiego sąsiada — zmierzone na produkcji: „dywna" → `dywan`,
    // „regla" → `regal`, „lamap" → `lamp`, „krzeso" → `krzesl`.
    expect(pickCorrection("szfa", vocab)).toBe("sofa");
  });

  it("poprawką bywa RDZEŃ, nie słowo („loze\" → „lozk\")", () => {
    // ⚠️ DLA TASKA 3/4: wartości i klucze słowników ręcznych to rdzenie
    // („lozk", „kanap", „kontynentaln"), więc korekta potrafi zwrócić coś, co
    // nie jest polskim słowem. Do zapytania to trafia poprawnie (rdzeń łapie
    // wszystkie odmiany), ale WYŚWIETLENIE tego klientowi jako „Pokazujemy
    // wyniki dla «lozk»" wygląda na awarię. Warstwa UI musi to rozwiązać —
    // tutaj tego nie da się naprawić bez wyrzucenia rdzeni ze słownika, czyli
    // bez utraty jedynych kandydatów dla „kanpa" i spółki.
    expect(pickCorrection("loze", vocab)).toBe("lozk");
  });
});
