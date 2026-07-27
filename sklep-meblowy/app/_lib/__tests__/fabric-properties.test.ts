import { describe, it, expect } from "vitest";
import {
  FABRIC_PROPERTY_ICONS,
  buildFabricPropertyDefs,
  resolveFabricProperties,
  propertyCodeSlug,
  normalizePropertyCodes,
  filterKnownCodes,
  fabricPropertiesPatch,
} from "@/app/_lib/fabric-properties";

const DEFS = buildFabricPropertyDefs([
  { code: "waterproof", label: "Wodoodporna", label_de: "Wasserabweisend", icon: "drop", sort_order: 0 },
  { code: "pet_friendly", label: "Przyjazna zwierzętom", label_de: null, icon: "paw", sort_order: 1 },
  { code: "easy_clean", label: "Łatwa w czyszczeniu", label_de: "Pflegeleicht", icon: "sparkle", sort_order: 2 },
]);

describe("FABRIC_PROPERTY_ICONS", () => {
  it("to dziesięć kluczy w ustalonej kolejności", () => {
    expect([...FABRIC_PROPERTY_ICONS]).toEqual([
      "drop", "paw", "sparkle", "leaf", "shield", "sun", "flame", "weave", "durability", "breathable",
    ]);
  });
});

describe("buildFabricPropertyDefs", () => {
  it("mapuje wiersze z bazy i sortuje po sort_order", () => {
    const defs = buildFabricPropertyDefs([
      { code: "b", label: "B", label_de: null, icon: "leaf", sort_order: 5 },
      { code: "a", label: "A", label_de: "A-DE", icon: "drop", sort_order: 1 },
    ]);
    expect(defs.map((d) => d.code)).toEqual(["a", "b"]);
    expect(defs[0]).toEqual({ code: "a", label: "A", labelDe: "A-DE", icon: "drop", sortOrder: 1 });
  });

  it("nieznany klucz ikonki → icon null (pigułka bez ikonki, nie wyjątek)", () => {
    const defs = buildFabricPropertyDefs([
      { code: "a", label: "A", label_de: null, icon: "teleport", sort_order: 0 },
    ]);
    expect(defs[0].icon).toBeNull();
  });

  it("puste label_de → null (fallback do PL robi render)", () => {
    const defs = buildFabricPropertyDefs([
      { code: "a", label: "A", label_de: "   ", icon: "drop", sort_order: 0 },
    ]);
    expect(defs[0].labelDe).toBeNull();
  });

  it("wiersze bez code albo bez label są pomijane", () => {
    const defs = buildFabricPropertyDefs([
      { code: "", label: "A", label_de: null, icon: "drop", sort_order: 0 },
      { code: "b", label: "   ", label_de: null, icon: "drop", sort_order: 1 },
      { code: "c", label: "C", label_de: null, icon: "drop", sort_order: 2 },
    ]);
    expect(defs.map((d) => d.code)).toEqual(["c"]);
  });

  it("wejście nie-tablicowe → pusta lista (błąd zapytania, stary cache)", () => {
    expect(buildFabricPropertyDefs(null)).toEqual([]);
    expect(buildFabricPropertyDefs(undefined)).toEqual([]);
    expect(buildFabricPropertyDefs("x")).toEqual([]);
  });
});

describe("resolveFabricProperties", () => {
  it("zwraca definicje w kolejności sort_order, niezależnie od kolejności kodów", () => {
    const out = resolveFabricProperties(["easy_clean", "waterproof"], DEFS);
    expect(out.map((d) => d.code)).toEqual(["waterproof", "easy_clean"]);
  });

  it("odsiewa kody bez definicji (usunięta cecha)", () => {
    expect(resolveFabricProperties(["waterproof", "nieistnieje"], DEFS).map((d) => d.code)).toEqual([
      "waterproof",
    ]);
  });

  it("usuwa duplikaty i przycina białe znaki", () => {
    expect(resolveFabricProperties([" waterproof ", "waterproof"], DEFS).map((d) => d.code)).toEqual([
      "waterproof",
    ]);
  });

  it("pomija elementy nie-stringowe", () => {
    expect(resolveFabricProperties([1, null, {}, "paw_missing", "pet_friendly"], DEFS).map((d) => d.code)).toEqual([
      "pet_friendly",
    ]);
  });

  it("wejście nie-tablicowe albo brak definicji → pusta lista", () => {
    expect(resolveFabricProperties(null, DEFS)).toEqual([]);
    expect(resolveFabricProperties(["waterproof"], [])).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const codes = ["easy_clean", "waterproof"];
    const snapshot = JSON.stringify(codes);
    resolveFabricProperties(codes, DEFS);
    expect(JSON.stringify(codes)).toBe(snapshot);
  });
});

describe("normalizePropertyCodes", () => {
  it("przycina białe znaki i zachowuje kolejność", () => {
    expect(normalizePropertyCodes([" waterproof ", "paw"])).toEqual(["waterproof", "paw"]);
  });

  it("odsiewa nie-stringi i puste wartości", () => {
    expect(normalizePropertyCodes(["a", 1, null, undefined, {}, "   ", "b"])).toEqual(["a", "b"]);
  });

  it("usuwa duplikaty (pierwsze wystąpienie wygrywa)", () => {
    expect(normalizePropertyCodes(["a", "b", " a ", "b"])).toEqual(["a", "b"]);
  });

  it("wejście nie-tablicowe → pusta lista", () => {
    expect(normalizePropertyCodes(null)).toEqual([]);
    expect(normalizePropertyCodes("waterproof")).toEqual([]);
  });
});

describe("filterKnownCodes", () => {
  it("zostawia tylko kody ze słownika, w kolejności wejścia", () => {
    expect(filterKnownCodes(["b", "x", "a"], new Set(["a", "b"]))).toEqual(["b", "a"]);
  });

  it("pusty słownik → pusta lista (żaden kod nie jest znany)", () => {
    expect(filterKnownCodes(["a", "b"], new Set())).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const codes = ["a", "x"];
    filterKnownCodes(codes, new Set(["a"]));
    expect(codes).toEqual(["a", "x"]);
  });
});

// Regresja: pusty/niedostępny słownik NIE może po cichu wyczyścić
// fabrics.properties przy edycji tkaniny (review zadania 4, finding 1).
describe("fabricPropertiesPatch", () => {
  it("(a) sekcja wyrenderowana, admin odznaczył wszystko → zapis ustawia []", () => {
    expect(fabricPropertiesPatch(true, [])).toEqual({ properties: [] });
  });

  it("(b) sekcji nie wyrenderowano (brak definicji) → payload BEZ klucza properties", () => {
    const patch = fabricPropertiesPatch(false, []);
    expect(patch).toEqual({});
    expect("properties" in patch).toBe(false);
  });

  it("(c) sekcja wyrenderowana, zaznaczone dwie cechy → zapisane dwa kody", () => {
    expect(fabricPropertiesPatch(true, ["waterproof", "easy_clean"])).toEqual({
      properties: ["waterproof", "easy_clean"],
    });
  });

  it("brak sekcji ignoruje ewentualne kody z podrobionego requestu", () => {
    expect(fabricPropertiesPatch(false, ["waterproof"])).toEqual({});
  });
});

describe("propertyCodeSlug", () => {
  it("robi kod z nazwy, z polskimi znakami", () => {
    expect(propertyCodeSlug("Przyjazna zwierzętom", new Set())).toBe("przyjazna-zwierzetom");
  });

  it("kolizja → sufiks -2, potem -3", () => {
    expect(propertyCodeSlug("Wodoodporna", new Set(["wodoodporna"]))).toBe("wodoodporna-2");
    expect(propertyCodeSlug("Wodoodporna", new Set(["wodoodporna", "wodoodporna-2"]))).toBe("wodoodporna-3");
  });

  it("nazwa bez znaków alfanumerycznych → fallback 'cecha'", () => {
    expect(propertyCodeSlug("!!!", new Set())).toBe("cecha");
  });
});
