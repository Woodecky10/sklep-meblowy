import { describe, it, expect } from "vitest";
import {
  CORNER_SIDE_OPTION_NAME,
  CORNER_SIDE_VALUES,
  CORNER_SIDE_DEFAULT_CATEGORY,
  isCornerCategorySlug,
  isCornerSideOptionName,
  cornerSideOf,
  orderCornerSideValues,
  hasCornerSideOption,
  applyCornerSideSelection,
} from "@/app/_lib/corner-side";
import type { ProductVariants } from "@/app/_lib/types";

// Produkt z tkaninami (value pricing aktywny: Riviera +200) — do testów
// zachowania danych kombinacji przy włączaniu/wyłączaniu strony.
const fabricVariants: ProductVariants = {
  options: [
    {
      name: "Tkanina",
      values: ["Sawana 21", "Riviera 16"],
      value_prices: { "Riviera 16": 200 },
    },
  ],
  combinations: [
    {
      values: { Tkanina: "Sawana 21" },
      stock: 3,
      price_modifier: 0,
      sale_price: 999,
      omnibus_price: 1200,
      images: ["a.jpg"],
    },
    { values: { Tkanina: "Riviera 16" }, stock: 1, price_modifier: 200 },
  ],
  overrides: { option_names: { Tkanina: "Materiał" } },
};

// Produkt z RĘCZNĄ opcją strony (uppercase, jak w prod DB).
const manualSideVariants: ProductVariants = {
  options: [{ name: "STRONA", values: ["LEWOSTRONNY", "PRAWOSTRONNY"] }],
  combinations: [
    { values: { STRONA: "LEWOSTRONNY" }, stock: 0, price_modifier: 0 },
    { values: { STRONA: "PRAWOSTRONNY" }, stock: 0, price_modifier: 0 },
  ],
};

describe("stałe — kanoniczne stringi", () => {
  it("nazwa opcji i wartości zgodne ze specem", () => {
    expect(CORNER_SIDE_OPTION_NAME).toBe("Strona");
    expect(CORNER_SIDE_VALUES).toEqual(["Lewostronny", "Prawostronny"]);
    expect(CORNER_SIDE_DEFAULT_CATEGORY).toBe("naroznik-l");
  });
});

describe("isCornerCategorySlug — kategorie narożników", () => {
  it("naroznik-l / narozniki / naroznik-u → true", () => {
    expect(isCornerCategorySlug("naroznik-l")).toBe(true);
    expect(isCornerCategorySlug("narozniki")).toBe(true);
    expect(isCornerCategorySlug("naroznik-u")).toBe(true);
  });
  it("pufy (slug przerobiony na narożniki U w prod DB) → true", () => {
    expect(isCornerCategorySlug("pufy")).toBe(true);
  });
  it("sofy / null / undefined / pusty → false", () => {
    expect(isCornerCategorySlug("sofy")).toBe(false);
    expect(isCornerCategorySlug(null)).toBe(false);
    expect(isCornerCategorySlug(undefined)).toBe(false);
    expect(isCornerCategorySlug("")).toBe(false);
  });
});

describe("isCornerSideOptionName — rozpoznawanie znormalizowane", () => {
  it("Strona / STRONA / ' strona ' / STRONA MEBLA → true", () => {
    expect(isCornerSideOptionName("Strona")).toBe(true);
    expect(isCornerSideOptionName("STRONA")).toBe(true);
    expect(isCornerSideOptionName(" strona ")).toBe(true);
    expect(isCornerSideOptionName("STRONA MEBLA")).toBe(true);
    expect(isCornerSideOptionName("strona mebla")).toBe(true);
  });
  it("Kolor / Tkanina / pusty → false", () => {
    expect(isCornerSideOptionName("Kolor")).toBe(false);
    expect(isCornerSideOptionName("Tkanina")).toBe(false);
    expect(isCornerSideOptionName("")).toBe(false);
  });
});

describe("cornerSideOf — mapowanie wartości na stronę", () => {
  it("Lewostronny / LEWOSTRONNY / LEWOSTORNNY (literówka z DB) / Lewa → left", () => {
    expect(cornerSideOf("Lewostronny")).toBe("left");
    expect(cornerSideOf("LEWOSTRONNY")).toBe("left");
    expect(cornerSideOf("LEWOSTORNNY")).toBe("left");
    expect(cornerSideOf("Lewa")).toBe("left");
    expect(cornerSideOf(" lewa ")).toBe("left");
  });
  it("Prawostronny / PRAWOSTRONNY / Prawa → right", () => {
    expect(cornerSideOf("Prawostronny")).toBe("right");
    expect(cornerSideOf("PRAWOSTRONNY")).toBe("right");
    expect(cornerSideOf("Prawa")).toBe("right");
  });
  it("wartość nierozpoznana (Sawana 21, pusty) → null", () => {
    expect(cornerSideOf("Sawana 21")).toBeNull();
    expect(cornerSideOf("")).toBeNull();
  });
});

describe("orderCornerSideValues — stała kolejność wyświetlania (lewa→prawa)", () => {
  it("['Prawostronny','Lewostronny'] → ['Lewostronny','Prawostronny'] (odwraca)", () => {
    expect(orderCornerSideValues(["Prawostronny", "Lewostronny"])).toEqual([
      "Lewostronny",
      "Prawostronny",
    ]);
  });
  it("['Lewostronny','Prawostronny'] → bez zmian", () => {
    expect(orderCornerSideValues(["Lewostronny", "Prawostronny"])).toEqual([
      "Lewostronny",
      "Prawostronny",
    ]);
  });
  it("wartości ręczne uppercase też porządkuje (PRAWOSTRONNY przed LEWOSTRONNY)", () => {
    expect(orderCornerSideValues(["PRAWOSTRONNY", "LEWOSTRONNY"])).toEqual([
      "LEWOSTRONNY",
      "PRAWOSTRONNY",
    ]);
  });
  it("nierozpoznane trafiają na koniec, w oryginalnej kolejności (stabilnie)", () => {
    expect(
      orderCornerSideValues(["Prawostronny", "Inna", "Lewostronny", "Druga"])
    ).toEqual(["Lewostronny", "Prawostronny", "Inna", "Druga"]);
  });
  it("nie mutuje wejścia", () => {
    const input = ["Prawostronny", "Lewostronny"];
    orderCornerSideValues(input);
    expect(input).toEqual(["Prawostronny", "Lewostronny"]);
  });
});

describe("hasCornerSideOption", () => {
  it("null / bez opcji side-like → false", () => {
    expect(hasCornerSideOption(null)).toBe(false);
    expect(hasCornerSideOption(fabricVariants)).toBe(false);
  });
  it("ręczna opcja STRONA → true", () => {
    expect(hasCornerSideOption(manualSideVariants)).toBe(true);
  });
});

describe("applyCornerSideSelection — włączanie", () => {
  it("null → struktura z 1 opcją i 2 kombinacjami (stock 0)", () => {
    const r = applyCornerSideSelection(null, true);
    expect(r).not.toBeNull();
    expect(r!.options).toEqual([
      { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
    ]);
    expect(r!.combinations).toEqual([
      { values: { Strona: "Lewostronny" }, stock: 0, price_modifier: 0 },
      { values: { Strona: "Prawostronny" }, stock: 0, price_modifier: 0 },
    ]);
  });

  it("produkt z tkaninami → Strona jako PIERWSZA opcja, kombinacje ×2 z zachowaniem danych", () => {
    const r = applyCornerSideSelection(fabricVariants, true)!;
    expect(r.options.map((o) => o.name)).toEqual(["Strona", "Tkanina"]);
    expect(r.combinations).toHaveLength(4);
    // Dane kombinacji Sawana 21 skopiowane na OBIE strony (sale/omnibus/images/stock).
    const sawanaLewa = r.combinations.find(
      (c) => c.values.Strona === "Lewostronny" && c.values.Tkanina === "Sawana 21"
    )!;
    const sawanaPrawa = r.combinations.find(
      (c) => c.values.Strona === "Prawostronny" && c.values.Tkanina === "Sawana 21"
    )!;
    for (const combo of [sawanaLewa, sawanaPrawa]) {
      expect(combo.stock).toBe(3);
      expect(combo.sale_price).toBe(999);
      expect(combo.omnibus_price).toBe(1200);
      expect(combo.images).toEqual(["a.jpg"]);
      expect(combo.price_modifier).toBe(0);
    }
    // Dopłata per wartość (Riviera +200) przeliczona przez applyValuePricing.
    const rivieraLewa = r.combinations.find(
      (c) => c.values.Strona === "Lewostronny" && c.values.Tkanina === "Riviera 16"
    )!;
    expect(rivieraLewa.price_modifier).toBe(200);
    expect(rivieraLewa.stock).toBe(1);
    // Overrides przechodzą nietknięte.
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });

  it("idempotencja: produkt z ręczną opcją STRONA → bez zmian (nie dubluje)", () => {
    expect(applyCornerSideSelection(manualSideVariants, true)).toBe(manualSideVariants);
  });
});

describe("applyCornerSideSelection — wyłączanie", () => {
  it("strona + tkaniny → kolaps do kombinacji per tkanina (pierwsza pasująca), opcja usunięta", () => {
    const enabled = applyCornerSideSelection(fabricVariants, true)!;
    const r = applyCornerSideSelection(enabled, false)!;
    expect(r.options.map((o) => o.name)).toEqual(["Tkanina"]);
    expect(r.combinations).toHaveLength(2);
    const sawana = r.combinations.find((c) => c.values.Tkanina === "Sawana 21")!;
    expect(sawana.values).toEqual({ Tkanina: "Sawana 21" });
    expect(sawana.stock).toBe(3);
    expect(sawana.sale_price).toBe(999);
    expect(sawana.images).toEqual(["a.jpg"]);
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });

  it("strona jako jedyna opcja → null (produkt bez wariantów)", () => {
    expect(applyCornerSideSelection(manualSideVariants, false)).toBeNull();
  });

  it("idempotencja: null / bez opcji strony → bez zmian", () => {
    expect(applyCornerSideSelection(null, false)).toBeNull();
    expect(applyCornerSideSelection(fabricVariants, false)).toBe(fabricVariants);
  });
});
