import { describe, it, expect } from "vitest";
import {
  collectionSearchName,
  collectionIdsForGroups,
  priorityCollectionIds,
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
});

describe("collectionIdsForGroups — kolekcje do filtra, per grupa alternatyw", () => {
  it("rdzeń tokenu zaczyna słowo nazwy kolekcji → jej id w grupie", () => {
    // „fado" → rdzeń „fad" → początek słowa „Fado".
    expect(collectionIdsForGroups(searchKeyTokenGroups("fado"), ALL, "pl")).toEqual([
      [FADO.id],
    ]);
  });

  it("ogon marketingowy NIE liczy się: „sofa” nie trafia w Amicę", () => {
    // Inaczej „sofa" zwracałaby całe kolekcje, łącznie z łóżkami — decyzja
    // właściciela 2026-10-29: liczy się tylko nazwa przed separatorem.
    expect(collectionIdsForGroups(searchKeyTokenGroups("sofa"), ALL, "pl")).toEqual([[]]);
  });

  it("fraza wieloczłonowa: każda grupa osobno, grupa bez kolekcji → pusta lista", () => {
    const groups = searchKeyTokenGroups("narożnik fado");
    expect(groups).toHaveLength(2);
    expect(collectionIdsForGroups(groups, ALL, "pl")).toEqual([[], [FADO.id]]);
  });

  it("synonim z grupy też trafia (alternatywy są ORowane)", () => {
    // „kanapa" → grupa [„kanap", „sof"]; kolekcja o nazwie „Sofy Premium"
    // ma słowo zaczynające się „sof".
    const sofy: SearchableCollection = {
      id: "55555555-5555-4555-8555-555555555555",
      label: "Kolekcja Sofy Premium – opis",
      label_de: null,
    };
    expect(
      collectionIdsForGroups(searchKeyTokenGroups("kanapa"), [FADO, sofy], "pl")
    ).toEqual([[sofy.id]]);
  });

  it("DE używa label_de, a przy jego braku polskiej etykiety", () => {
    // „kollektion" trafia w FADO (label_de) i w LIVIA (label_de), a LIVA bez
    // label_de spada na „Kolekcja Liva" — i „kollektion" w nią NIE trafia.
    expect(
      collectionIdsForGroups(searchKeyTokenGroups("kollektion"), ALL, "de")
    ).toEqual([[FADO.id, LIVIA.id]]);
    // „liva" → rdzeń „liv" (filtr jest rdzeniem, jak w bazie): trafia w LIVĘ
    // przez polską etykietę (brak label_de) i w LIVIĘ przez label_de.
    expect(collectionIdsForGroups(searchKeyTokenGroups("liva"), ALL, "de")).toEqual([
      [LIVA.id, LIVIA.id],
    ]);
  });
});

describe("priorityCollectionIds — kolekcje trafione nazwą, do awansu na szczyt", () => {
  it("token w formie złożonej zaczyna słowo nazwy kolekcji", () => {
    expect(priorityCollectionIds("fado", ALL, "pl")).toEqual(new Set([FADO.id]));
  });

  it("fraza wpisywana po literze (fad) też trafia", () => {
    expect(priorityCollectionIds("fad", ALL, "pl")).toEqual(new Set([FADO.id]));
  });

  it("„liva” awansuje Livę, NIE Livię — bez stemu, bez synonimów", () => {
    // Rdzeń „liv" zaczyna obie; forma złożona „liva" tylko Livę. Awans ma być
    // tak samo ostry jak poziom 1 rankingu („nic nie musiałem rozszerzać").
    expect(priorityCollectionIds("liva", ALL, "pl")).toEqual(new Set([LIVA.id]));
  });

  it("wystarczy, że JEDEN token frazy trafia w nazwę kolekcji", () => {
    // „narożnik fado" ma awansować narożniki Fado, mimo że „narożnik" w nazwie
    // kolekcji nie ma.
    expect(priorityCollectionIds("narożnik fado", ALL, "pl")).toEqual(new Set([FADO.id]));
  });

  it("fraza bez trafienia w nazwę → pusty zbiór", () => {
    expect(priorityCollectionIds("sofa do salonu", ALL, "pl")).toEqual(new Set());
    expect(priorityCollectionIds("", ALL, "pl")).toEqual(new Set());
  });
});
