import { describe, it, expect } from "vitest";
import {
  escapeIlike,
  sanitizeSearchTerm,
  searchTokens,
  rankByNameMatch,
  foldDiacritics,
  stemToken,
  MIN_STEM_LENGTH,
  searchKeyTokens,
  searchKeyTokenForms,
  searchKeyTokenGroups,
} from "@/app/_lib/search-filter";

describe("sanitizeSearchTerm — ochrona przed injection w .or() (audyt MED)", () => {
  it("normalna fraza zostaje", () => {
    expect(sanitizeSearchTerm("sofa")).toBe("sofa");
    expect(sanitizeSearchTerm("łóżko 160x200")).toBe("łóżko 160x200");
    expect(sanitizeSearchTerm("narożnik 3-osobowy")).toBe("narożnik 3-osobowy");
  });

  it("usuwa składnię .or() PostgREST (przecinek, kropka, nawiasy)", () => {
    // Wektor z audytu: q=x,price.gt.0 wstrzykiwał dodatkowy warunek OR.
    expect(sanitizeSearchTerm("x,price.gt.0")).toBe("xpricegt0");
    expect(sanitizeSearchTerm("sofa,beż")).toBe("sofabeż");
    expect(sanitizeSearchTerm("a(b)c")).toBe("abc");
  });

  it("usuwa wildcardy ILIKE i backslash", () => {
    expect(sanitizeSearchTerm("100%")).toBe("100");
    expect(sanitizeSearchTerm("a_b")).toBe("ab");
    expect(sanitizeSearchTerm("a\\b")).toBe("ab");
  });

  it("collapse białych znaków + trim", () => {
    expect(sanitizeSearchTerm("  sofa   beżowa  ")).toBe("sofa beżowa");
    expect(sanitizeSearchTerm("sofa\tbeżowa\n")).toBe("sofa beżowa");
  });

  it("sama interpunkcja → pusty string", () => {
    expect(sanitizeSearchTerm(",.()%_")).toBe("");
    expect(sanitizeSearchTerm("")).toBe("");
  });
});

describe("searchTokens — tokenizacja frazy", () => {
  it("tnie na słowa, zwija spacje", () => {
    expect(searchTokens("  sofa   modena ")).toEqual(["sofa", "modena"]);
  });
  it("sanityzuje jak sanitizeSearchTerm (usuwa składnię .or())", () => {
    expect(searchTokens("x,price.gt.0")).toEqual(["xpricegt0"]);
  });
  it("sama interpunkcja / pusta → []", () => {
    expect(searchTokens(",.()")).toEqual([]);
    expect(searchTokens("")).toEqual([]);
  });
  it("limit MAX_SEARCH_TOKENS (10)", () => {
    const raw = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
    expect(searchTokens(raw)).toHaveLength(10);
  });
});

describe("rankByNameMatch — trafienia w nazwie przed trafieniami w opisie", () => {
  const get = (r: { name: string }) => r.name;

  it("wiele słów w dowolnej kolejności — wszystkie muszą być w nazwie", () => {
    const rows = [
      { name: "Sofa Modena szara" },
      { name: "Narożnik VEGAS L Duża Funkcja SPANIA" },
    ];
    const ranked = rankByNameMatch(rows, "spania vegas", get);
    expect(ranked[0]).toEqual({ name: "Narożnik VEGAS L Duża Funkcja SPANIA" });
  });

  it("produkty z frazą w nazwie idą przed dopasowanymi tylko przez opis", () => {
    // Scenariusz z bugu: „materac" łapie materac (nazwa) + łóżka kontynentalne
    // (opis, boxspring z materacem). Materac musi być pierwszy.
    const rows = [
      { name: "Łóżko kontynentalne Marbella" }, // dopasowane przez opis
      { name: "Materac kieszeniowy AURELIO" }, // dopasowane przez nazwę
      { name: "Łóżko kontynentalne Tiki" }, // dopasowane przez opis
    ];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "Materac kieszeniowy AURELIO" },
      { name: "Łóżko kontynentalne Marbella" },
      { name: "Łóżko kontynentalne Tiki" },
    ]);
  });

  it("zachowuje kolejność wejściową w obrębie każdej grupy (stabilne)", () => {
    const rows = [
      { name: "Materac A" },
      { name: "Bez trafienia w nazwie 1" },
      { name: "Materac B" },
      { name: "Bez trafienia w nazwie 2" },
    ];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "Materac A" },
      { name: "Materac B" },
      { name: "Bez trafienia w nazwie 1" },
      { name: "Bez trafienia w nazwie 2" },
    ]);
  });

  it("dopasowanie nazwy jest case-insensitive (jak ILIKE)", () => {
    const rows = [{ name: "sofa" }, { name: "MATERAC" }];
    expect(rankByNameMatch(rows, "materac", get)).toEqual([
      { name: "MATERAC" },
      { name: "sofa" },
    ]);
  });

  it("używa przekazanego akcesora (np. kolumna DE)", () => {
    const rows = [
      { name: "Łóżko", name_de: "Matratzen-Bett" },
      { name: "Materac", name_de: "Matratze" },
    ];
    const ranked = rankByNameMatch(rows, "matratze", (r) => r.name_de);
    // Oba mają „matratze" w name_de, ale pierwszy ma je też — kolejność
    // stabilna: oba trafione, więc bez zmian.
    expect(ranked.map((r) => r.name)).toEqual(["Łóżko", "Materac"]);
  });

  it("fraza pusta/sama interpunkcja → wejście bez zmian (nie rankuj)", () => {
    const rows = [{ name: "Łóżko" }, { name: "Materac" }];
    expect(rankByNameMatch(rows, "", get)).toEqual(rows);
    expect(rankByNameMatch(rows, "   ", get)).toEqual(rows);
    expect(rankByNameMatch(rows, ",.()", get)).toEqual(rows);
  });

  it("sanityzuje frazę tak jak sanitizeSearchTerm (spójne dopasowanie)", () => {
    // „materac,x" sanityzuje się do „materacx" — nie trafia w „Materac ...".
    const rows = [{ name: "Materac kieszeniowy" }, { name: "Sofa" }];
    expect(rankByNameMatch(rows, "materac", get)[0]).toEqual({
      name: "Materac kieszeniowy",
    });
  });
});

describe("rankByNameMatch — dopasowanie nazwy po złożeniu znaków", () => {
  const get = (r: { name: string }) => r.name;

  it("fraza BEZ ogonków rozpoznaje trafienie w nazwie Z ogonkami", () => {
    const rows = [
      { name: "Sofa Modena" },
      { name: "Łóżko kontynentalne Marbella" },
    ];
    // Dziś „lozko" nie trafia w „Łóżko" i oba wiersze lądują w grupie „z opisu",
    // czyli kolejność wejściowa zostaje bez zmian.
    expect(rankByNameMatch(rows, "lozko", get)).toEqual([
      { name: "Łóżko kontynentalne Marbella" },
      { name: "Sofa Modena" },
    ]);
  });

  it("liczba mnoga we frazie rozpoznaje pojedynczą w nazwie", () => {
    const rows = [
      { name: "Materac kieszeniowy AURELIO" },
      { name: "Narożnik Alva L" },
    ];
    expect(rankByNameMatch(rows, "narożniki", get)[0]).toEqual({
      name: "Narożnik Alva L",
    });
  });

  it("działa dla ścieżki DE (ß w nazwie)", () => {
    const rows = [
      { name: "A", name_de: "Sofa klein" },
      { name: "B", name_de: "Sofa Größe XL" },
    ];
    const ranked = rankByNameMatch(rows, "grösse", (r) => r.name_de);
    expect(ranked[0].name).toBe("B");
  });
});

describe("rankByNameMatch — dokładne trafienie bije rdzeń (POSO / pościel)", () => {
  const get = (r: { name: string }) => r.name;

  it("nazwa z dokładnym tokenem przed nazwą złapaną tylko rdzeniem", () => {
    // Pomiar na produkcji 2026-08-13: „poso" → rdzeń „pos" daje 41 dopasowań,
    // z czego 21 to „…na pościel" w NAZWIE, a tylko 3 to tkanina POSO. Wiersze
    // z pościelą są nowsze, więc przy jednej grupie „nazwa" wygrywały datą.
    const rows = [
      { name: "Łóżko tapicerowane Lino z pojemnikiem na pościel 120x200" },
      { name: "Sofa Soren z funkcją spania i pojemnikiem na pościel" },
      { name: "Narożnik Vegas L w POSO 100 Sztruks" },
      { name: "Narożnik Vegas Mini w POSO piękny Sztruks" },
      { name: "Narożnik Vegas Rivia z funkcją spania" }, // tylko z opisu
    ];
    expect(rankByNameMatch(rows, "poso", get)).toEqual([
      { name: "Narożnik Vegas L w POSO 100 Sztruks" },
      { name: "Narożnik Vegas Mini w POSO piękny Sztruks" },
      { name: "Łóżko tapicerowane Lino z pojemnikiem na pościel 120x200" },
      { name: "Sofa Soren z funkcją spania i pojemnikiem na pościel" },
      { name: "Narożnik Vegas Rivia z funkcją spania" },
    ]);
  });

  it("dokładne trafienie liczy się po złożeniu znaków, nie po pisowni", () => {
    // „Livia" łapie rdzeń „liv", ale dokładnego „liva" nie ma — kolekcja Liva
    // musi być wyżej, mimo że wiersze Livia są w wejściu pierwsze.
    const rows = [
      { name: "Narożnik Livia rozkładany" },
      { name: "Łóżko kontynentalne Liva 90x200" },
    ];
    expect(rankByNameMatch(rows, "Liva", get)[0]).toEqual({
      name: "Łóżko kontynentalne Liva 90x200",
    });
  });

  it("fraza bez ani jednego dokładnego trafienia → kolejność jak dotąd", () => {
    // Główny przypadek użycia: „sofy" (rdzeń „sof"). Żadna nazwa nie zawiera
    // „sofy", więc wszystko wpada na poziom rdzenia — poziom 1 jest pusty
    // i grupowanie jest identyczne jak przed rozbiciem na trzy poziomy.
    const rows = [
      { name: "Sofa Modena szara" },
      { name: "Narożnik Vegas" }, // tylko z opisu
      { name: "Sofa Alva Mini" },
    ];
    expect(rankByNameMatch(rows, "sofy", get)).toEqual([
      { name: "Sofa Modena szara" },
      { name: "Sofa Alva Mini" },
      { name: "Narożnik Vegas" },
    ]);
  });

  it("fraza MIESZANA (jeden token dokładnie, drugi rdzeniem) → poziom rdzenia", () => {
    // Decyzja: poziom 1 wymaga dokładnego trafienia KAŻDEGO tokenu. Inaczej
    // łóżko „…na pościel" (dokładne „lozko" + rdzeń „pos") awansowałoby obok
    // prawdziwego POSO i hałas wracałby na szczyt.
    const rows = [
      { name: "Łóżko tapicerowane Lino z pojemnikiem na pościel" }, // lozko + pos
      { name: "Łóżko Vegas w POSO Sztruks" }, // lozko + poso
    ];
    expect(rankByNameMatch(rows, "poso łóżko", get)).toEqual([
      { name: "Łóżko Vegas w POSO Sztruks" },
      { name: "Łóżko tapicerowane Lino z pojemnikiem na pościel" },
    ]);
  });

  it("poziom rdzenia nie gubi nic, co było trafieniem w nazwie (recall)", () => {
    // Suma poziomów 1 i 2 musi być tym samym zbiorem, co dawna grupa „nazwa":
    // każdy wiersz z rdzeniem w nazwie zostaje nad trafieniami z opisu.
    const rows = [
      { name: "Bez rdzenia w nazwie" },
      { name: "Narożnik Fado" }, // tylko rdzeń „naroznik"
      { name: "Narożniki Alva" }, // dokładne „narozniki"
    ];
    const ranked = rankByNameMatch(rows, "narożniki", get);
    expect(ranked.map((r) => r.name)).toEqual([
      "Narożniki Alva",
      "Narożnik Fado",
      "Bez rdzenia w nazwie",
    ]);
  });
});

describe("escapeIlike — escape wildcardów (linkGuestOrders, audyt MED)", () => {
  it("escapuje _ i % i backslash", () => {
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("a%b")).toBe("a\\%b");
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("email z _ przestaje działać jak wildcard", () => {
    // jan_kowalski@x.com — bez escape `_` dopasowałby też janXkowalski@x.com
    expect(escapeIlike("jan_kowalski@x.com")).toBe("jan\\_kowalski@x.com");
  });

  it("zwykły email bez zmian", () => {
    expect(escapeIlike("anna.nowak@x.com")).toBe("anna.nowak@x.com");
  });
});

describe("foldDiacritics — składanie znaków na ASCII (musi = translate() w migracji 74 dla PL i 73 dla DE)", () => {
  it("składa wszystkie dziewięć polskich znaków", () => {
    expect(foldDiacritics("ąćęłńóśźż")).toBe("acelnoszz");
  });

  it("składa realne frazy z katalogu", () => {
    expect(foldDiacritics("łóżko")).toBe("lozko");
    expect(foldDiacritics("narożnik")).toBe("naroznik");
    expect(foldDiacritics("rozkładana")).toBe("rozkladana");
  });

  it("sprowadza do małych liter (wielkie znaki też składa)", () => {
    expect(foldDiacritics("ŁÓŻKO")).toBe("lozko");
    expect(foldDiacritics("Narożnik ALVA")).toBe("naroznik alva");
  });

  it("niemieckie: ä ö ü oraz ß jako dwuznak", () => {
    expect(foldDiacritics("äöü")).toBe("aou");
    expect(foldDiacritics("Größe")).toBe("grosse");
  });

  it("tekst bez diakrytyków przechodzi bez zmian (poza wielkością liter)", () => {
    expect(foldDiacritics("sofa modena")).toBe("sofa modena");
    expect(foldDiacritics("160x200")).toBe("160x200");
  });

  it("puste wejście → pusty string", () => {
    expect(foldDiacritics("")).toBe("");
  });
});

describe("stemToken — obcięcie jednej końcówki fleksyjnej", () => {
  it("liczba mnoga wraca do rdzenia (przypadki z pomiarów na produkcji)", () => {
    expect(stemToken("narozniki")).toBe("naroznik");
    expect(stemToken("fotele")).toBe("fotel");
    expect(stemToken("materace")).toBe("materac");
    expect(stemToken("sofy")).toBe("sof");
    expect(stemToken("lozka")).toBe("lozk");
  });

  it("obcina najdłuższą pasującą końcówkę, nie pierwszą z listy", () => {
    // „materacami" → „ami" (3 znaki), nie „i" (1 znak).
    expect(stemToken("materacami")).toBe("materac");
    expect(stemToken("lozkach")).toBe("lozk");
    expect(stemToken("stolowi")).toBe("stol");
  });

  it("obcina TYLKO jedną końcówkę", () => {
    // „sofami" → „sof"; nie stemujemy dalej do „so".
    expect(stemToken("sofami")).toBe("sof");
  });

  it("nie obcina, gdy rdzeń zszedłby poniżej MIN_STEM_LENGTH", () => {
    expect(MIN_STEM_LENGTH).toBe(3);
    // „ale" → obcięcie „e" dałoby rdzeń 2-znakowy → zostaw nietknięte.
    expect(stemToken("ale")).toBe("ale");
    expect(stemToken("do")).toBe("do");
    expect(stemToken("na")).toBe("na");
  });

  it("token bez końcówki z listy zostaje bez zmian", () => {
    expect(stemToken("materac")).toBe("materac");
    expect(stemToken("naroznik")).toBe("naroznik");
    expect(stemToken("vegas")).toBe("vegas");
  });

  it("wymiary i liczby zostają nietknięte", () => {
    expect(stemToken("160x200")).toBe("160x200");
    expect(stemToken("3")).toBe("3");
  });

  it("pusty token zostaje pusty", () => {
    expect(stemToken("")).toBe("");
  });
});

describe("searchKeyTokens — potok: sanityzacja → składanie → stem", () => {
  it("fraza bez ogonków trafia w ten sam rdzeń co z ogonkami", () => {
    expect(searchKeyTokens("łóżko")).toEqual(["lozk"]);
    expect(searchKeyTokens("lozko")).toEqual(["lozk"]);
  });

  it("liczba mnoga i pojedyncza dają ten sam rdzeń", () => {
    expect(searchKeyTokens("narożniki")).toEqual(["naroznik"]);
    expect(searchKeyTokens("narożnik")).toEqual(["naroznik"]);
  });

  it("wiele słów → wiele tokenów, kolejność zachowana", () => {
    expect(searchKeyTokens("narożnik szary")).toEqual(["naroznik", "szar"]);
  });

  it("odfiltrowuje duplikaty powstałe po stemowaniu", () => {
    // „sofa" i „sofy" dają oba rdzeń „sof" — jeden warunek ILIKE, nie dwa.
    expect(searchKeyTokens("sofa sofy")).toEqual(["sof"]);
  });

  it("dziedziczy sanityzację po searchTokens (injection w .or())", () => {
    expect(searchKeyTokens("x,price.gt.0")).toEqual(["xpricegt0"]);
  });

  it("sama interpunkcja / pusta fraza → []", () => {
    expect(searchKeyTokens(",.()")).toEqual([]);
    expect(searchKeyTokens("")).toEqual([]);
  });

  it("respektuje limit MAX_SEARCH_TOKENS (10 unikalnych rdzeni)", () => {
    const raw = Array.from({ length: 15 }, (_, i) => `wyraz${i}`).join(" ");
    expect(searchKeyTokens(raw).length).toBeLessThanOrEqual(10);
  });
});

describe("searchKeyTokenForms — obie formy tokenu (tylko dla rankingu)", () => {
  it("zwraca formę złożoną BEZ stemu obok formy po stemie", () => {
    expect(searchKeyTokenForms("łóżko")).toEqual([
      { fold: "lozko", stem: "lozk" },
    ]);
    expect(searchKeyTokenForms("POSO")).toEqual([
      { fold: "poso", stem: "pos" },
    ]);
  });

  it("token bez końcówki z listy ma obie formy identyczne", () => {
    expect(searchKeyTokenForms("materac")).toEqual([
      { fold: "materac", stem: "materac" },
    ]);
  });

  it("wiele słów → wiele par, kolejność zachowana", () => {
    expect(searchKeyTokenForms("narożnik szary")).toEqual([
      { fold: "naroznik", stem: "naroznik" },
      { fold: "szary", stem: "szar" },
    ]);
  });

  it("deduplikacja PO RDZENIU — zostaje forma pierwszego wystąpienia", () => {
    expect(searchKeyTokenForms("sofa sofy")).toEqual([
      { fold: "sofa", stem: "sof" },
    ]);
  });

  it("rdzenie są DOKŁADNIE tym, co zwraca searchKeyTokens (jeden inwariant)", () => {
    for (const raw of [
      "łóżko",
      "sofa sofy",
      "narożnik szary",
      "poso",
      "x,price.gt.0",
      ",.()",
      "",
      Array.from({ length: 15 }, (_, i) => `wyraz${i}`).join(" "),
    ]) {
      expect(searchKeyTokenForms(raw).map((f) => f.stem)).toEqual(
        searchKeyTokens(raw)
      );
    }
  });

  it("sama interpunkcja / pusta fraza → []", () => {
    expect(searchKeyTokenForms(",.()")).toEqual([]);
    expect(searchKeyTokenForms("")).toEqual([]);
  });
});

describe("searchKeyTokenGroups — alternatywy do filtra", () => {
  it("token bez synonimów daje grupę jednoelementową", () => {
    expect(searchKeyTokenGroups("materace")).toEqual([["materac"]]);
  });

  it("token ze słownika daje siebie plus synonimy", () => {
    expect(searchKeyTokenGroups("kanapa")).toEqual([["kanap", "sof"]]);
  });

  it("fraza wielosłowna daje jedną grupę na słowo, w kolejności", () => {
    expect(searchKeyTokenGroups("kanapa welur")).toEqual([
      ["kanap", "sof"],
      ["welur"],
    ]);
  });

  it("liczba grup zawsze równa liczbie tokenów z searchKeyTokens", () => {
    // Wiążące: filtr ANDuje grupy, więc rozjazd znaczyłby inny zbiór wymagań
    // niż ten, którego pilnuje ranking.
    for (const fraza of ["kanapa", "sofa sofy", "łóżeczko dziecinne", ""]) {
      expect(searchKeyTokenGroups(fraza)).toHaveLength(
        searchKeyTokens(fraza).length
      );
    }
  });

  it("pusta fraza → brak grup", () => {
    expect(searchKeyTokenGroups("   ")).toEqual([]);
  });
});
