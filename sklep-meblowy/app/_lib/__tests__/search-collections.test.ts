import { describe, it, expect } from "vitest";
import {
  collectionSearchName,
  collectionOwnName,
  buildCollectionSearchIndex,
  collectionIdsForGroups,
  priorityCollectionIds,
  collectionNameOf,
  type SearchableCollection,
} from "../search-collections";
import { searchKeyTokenGroups } from "../search-filter";

// Etykiety WPROST z produkcji 2026-10-29: „Kolekcja <nazwa> – <ogon
// marketingowy>" albo samo „Kolekcja <nazwa>".
const FADO: SearchableCollection = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Kolekcja Fado – nowoczesne meble tapicerowane do salonu",
  label_de: "Kollektion Fado – moderne Polstermöbel für das Wohnzimmer",
};
const LIVA: SearchableCollection = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Kolekcja Liva",
  label_de: null,
};
const LIVIA: SearchableCollection = {
  id: "33333333-3333-4333-8333-333333333333",
  label: "Kolekcja Livia – nowoczesne meble modułowe do salonu",
  label_de: "Kollektion Livia – moderne modulare Polstermöbel",
};
const AMICA: SearchableCollection = {
  id: "44444444-4444-4444-8444-444444444444",
  label: "Kolekcja Amica – nowoczesne narożniki i sofy do salonu",
  label_de: null,
};
const ALL = [FADO, LIVA, LIVIA, AMICA];
const PL = buildCollectionSearchIndex(ALL, "pl");
const DE = buildCollectionSearchIndex(ALL, "de");

describe("collectionSearchName — część etykiety przed separatorem", () => {
  it("ucina ogon marketingowy po pauzie", () => {
    expect(collectionSearchName(FADO.label)).toBe("Kolekcja Fado");
  });

  it("etykieta bez separatora zostaje cała", () => {
    expect(collectionSearchName("Kolekcja Vegas Buble")).toBe("Kolekcja Vegas Buble");
  });

  it("ucina też po zwykłym myślniku i kresce ze spacjami, ale nie w środku słowa", () => {
    // Nowa kolekcja wpisana w panelu zwykłym myślnikiem ma działać tak samo.
    expect(collectionSearchName("Kolekcja Nube - sofy do salonu")).toBe("Kolekcja Nube");
    expect(collectionSearchName("Kolekcja Nube — sofy do salonu")).toBe("Kolekcja Nube");
    expect(collectionSearchName("Vegas-Buble – opis")).toBe("Vegas-Buble");
  });

  it("separator bez spacji z jednej strony też ucina (dwukropek, pauza)", () => {
    // Panel nie pilnuje spacji — „Kolekcja Amica: narożniki" bez ucięcia
    // wpuściłoby ogon marketingowy, czyli dokładnie to, czego właściciel nie
    // chciał („sofa" → cała Amica, łącznie z łóżkami).
    expect(collectionSearchName("Kolekcja Amica: narożniki i sofy")).toBe("Kolekcja Amica");
    expect(collectionSearchName("Kolekcja Fado –nowoczesne meble")).toBe("Kolekcja Fado");
    expect(collectionSearchName("Kolekcja Fado- nowoczesne meble")).toBe("Kolekcja Fado");
  });
});

describe("collectionOwnName — nazwa własna, bez słowa „Kolekcja”", () => {
  it("zdejmuje pierwsze słowo, gdy to „Kolekcja”/„Kollektion”", () => {
    expect(collectionOwnName(FADO.label)).toBe("Fado");
    expect(collectionOwnName(FADO.label_de!)).toBe("Fado");
    expect(collectionOwnName("Kolekcja Vegas Buble")).toBe("Vegas Buble");
  });

  it("etykieta bez słowa „Kolekcja” zostaje cała, a samo „Kolekcja” nie znika", () => {
    expect(collectionOwnName("Luma – designerskie meble")).toBe("Luma");
    expect(collectionOwnName("Kolekcja")).toBe("Kolekcja");
  });
});

describe("collectionIdsForGroups — kolekcje do filtra, per grupa alternatyw", () => {
  it("rdzeń tokenu zaczyna słowo nazwy kolekcji → jej id w grupie", () => {
    // „fado" → rdzeń „fad" → początek słowa „Fado".
    expect(collectionIdsForGroups(searchKeyTokenGroups("fado"), PL)).toEqual([[FADO.id]]);
  });

  it("ogon marketingowy NIE liczy się: „sofa” nie trafia w Amicę", () => {
    // Inaczej „sofa" zwracałaby całe kolekcje, łącznie z łóżkami — decyzja
    // właściciela 2026-10-29: liczy się tylko nazwa przed separatorem.
    expect(collectionIdsForGroups(searchKeyTokenGroups("sofa"), PL)).toEqual([[]]);
  });

  it("fraza wieloczłonowa: każda grupa osobno, grupa bez kolekcji → pusta lista", () => {
    const groups = searchKeyTokenGroups("narożnik fado");
    expect(groups).toHaveLength(2);
    expect(collectionIdsForGroups(groups, PL)).toEqual([[], [FADO.id]]);
  });

  it("słowo „kolekcja” trafia w KAŻDĄ kolekcję — żeby „kolekcja fado” działało", () => {
    // Pomiar 2026-10-29: „kolekcja fado" na produkcji daje ZERO (opisy nie
    // mają „kolekcj"). Filtr ANDuje grupy, więc „kolekcja" musi w coś trafić
    // — w nazwę każdej kolekcji. Awans (niżej) tego słowa NIE liczy.
    expect(collectionIdsForGroups(searchKeyTokenGroups("kolekcja fado"), PL)).toEqual([
      ALL.map((c) => c.id),
      [FADO.id],
    ]);
  });

  it("synonim z grupy też trafia (alternatywy są ORowane)", () => {
    // „kanapa" → grupa [„kanap", „sof"]; kolekcja o nazwie „Sofy Premium"
    // ma słowo zaczynające się „sof".
    const sofy: SearchableCollection = {
      id: "55555555-5555-4555-8555-555555555555",
      label: "Kolekcja Sofy Premium – opis",
      label_de: null,
    };
    const index = buildCollectionSearchIndex([FADO, sofy], "pl");
    expect(collectionIdsForGroups(searchKeyTokenGroups("kanapa"), index)).toEqual([
      [sofy.id],
    ]);
  });

  it("DE używa label_de, a przy jego braku polskiej etykiety", () => {
    // „kollektion" trafia w FADO (label_de) i w LIVIA (label_de), a LIVA bez
    // label_de spada na „Kolekcja Liva" — i „kollektion" w nią NIE trafia.
    expect(collectionIdsForGroups(searchKeyTokenGroups("kollektion"), DE)).toEqual([
      [FADO.id, LIVIA.id],
    ]);
    // „liva" → rdzeń „liv" (filtr jest rdzeniem, jak w bazie): trafia w LIVĘ
    // przez polską etykietę (brak label_de) i w LIVIĘ przez label_de.
    expect(collectionIdsForGroups(searchKeyTokenGroups("liva"), DE)).toEqual([
      [LIVA.id, LIVIA.id],
    ]);
  });
});

describe("priorityCollectionIds — kolekcje trafione nazwą własną, do awansu na szczyt", () => {
  it("token w formie złożonej zaczyna słowo nazwy własnej kolekcji", () => {
    expect(priorityCollectionIds("fado", PL)).toEqual(new Set([FADO.id]));
  });

  it("fraza wpisywana po literze (fad) też trafia", () => {
    expect(priorityCollectionIds("fad", PL)).toEqual(new Set([FADO.id]));
  });

  it("„liva” awansuje Livę, NIE Livię — bez stemu, bez synonimów", () => {
    // Rdzeń „liv" zaczyna obie; forma złożona „liva" tylko Livę. Awans ma być
    // tak samo ostry jak poziom 1 rankingu („nic nie musiałem rozszerzać").
    expect(priorityCollectionIds("liva", PL)).toEqual(new Set([LIVA.id]));
  });

  it("wystarczy, że JEDEN token frazy trafia w nazwę kolekcji", () => {
    // „narożnik fado" ma awansować narożniki Fado, mimo że „narożnik" w nazwie
    // kolekcji nie ma.
    expect(priorityCollectionIds("narożnik fado", PL)).toEqual(new Set([FADO.id]));
  });

  it("słowo „kolekcja” (i jego początek „kol”) NIE awansuje niczego", () => {
    // Każda etykieta zaczyna się od „Kolekcja", więc awans po tym słowie
    // wyniósłby na szczyt wszystkie kolekcje naraz — przy wpisywaniu „kol…"
    // zepchnąłby produkty, które naprawdę zaczynają się na „kol".
    expect(priorityCollectionIds("kol", PL)).toEqual(new Set());
    expect(priorityCollectionIds("kolekcja", PL)).toEqual(new Set());
    expect(priorityCollectionIds("kolekcja fado", PL)).toEqual(new Set([FADO.id]));
  });

  it("fraza bez trafienia w nazwę → pusty zbiór", () => {
    expect(priorityCollectionIds("sofa do salonu", PL)).toEqual(new Set());
    expect(priorityCollectionIds("", PL)).toEqual(new Set());
  });
});

describe("collectionNameOf — nazwa własna do klucza rankingu produktu", () => {
  it("zwraca nazwę własną kolekcji produktu, a dla braku kolekcji pusty napis", () => {
    // Doklejana do nazwy produktu w rankByNameMatch: produkt znaleziony TYLKO
    // przez kolekcję (rdzeniem albo synonimem) ma trafić na poziom 2, a nie
    // na poziom 3 pod produkty z opisu.
    expect(collectionNameOf(PL, FADO.id)).toBe("Fado");
    expect(collectionNameOf(DE, LIVA.id)).toBe("Liva");
    expect(collectionNameOf(PL, null)).toBe("");
    expect(collectionNameOf(PL, "99999999-9999-4999-8999-999999999999")).toBe("");
  });
});
