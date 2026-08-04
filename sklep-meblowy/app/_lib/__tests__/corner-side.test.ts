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

// Produkt z tkaninami.
const fabricVariants: ProductVariants = {
  options: [
    {
      name: "Tkanina",
      values: ["Sawana 21", "Riviera 16"],
      value_prices: { "Riviera 16": 200 },
    },
  ],
  overrides: { option_names: { Tkanina: "Materiał" } },
};

// Produkt z RECZNA opcja strony (uppercase, jak w prod DB).
const manualSideVariants: ProductVariants = {
  options: [{ name: "STRONA", values: ["LEWOSTRONNY", "PRAWOSTRONNY"] }],
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
  it("pufy (po migracji 68 to węzeł \"PUFY\", nie narożniki) → false", () => {
    expect(isCornerCategorySlug("pufy")).toBe(false);
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

describe("applyCornerSideSelection — model tylko-opcje", () => {
  it("null + enable → opcja Strona jako jedyna", () => {
    const r = applyCornerSideSelection(null, true)!;
    expect(r.options).toEqual([{ name: "Strona", values: ["Lewostronny", "Prawostronny"] }]);
  });
  it("produkt z tkaninami + enable → Strona jako PIERWSza opcja, tkanina zostaje", () => {
    const r = applyCornerSideSelection(fabricVariants, true)!;
    expect(r.options.map((o) => o.name)).toEqual(["Strona", "Tkanina"]);
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });
  it("idempotencja: reczna opcja STRONA + enable → bez zmian", () => {
    expect(applyCornerSideSelection(manualSideVariants, true)).toBe(manualSideVariants);
  });
  it("disable → usuwa opcje side-like; ostatnia opcja → null", () => {
    expect(applyCornerSideSelection(manualSideVariants, false)).toBeNull();
    const enabled = applyCornerSideSelection(fabricVariants, true)!;
    const r = applyCornerSideSelection(enabled, false)!;
    expect(r.options.map((o) => o.name)).toEqual(["Tkanina"]);
  });
  it("idempotencja: null/bez strony → bez zmian", () => {
    expect(applyCornerSideSelection(null, false)).toBeNull();
    expect(applyCornerSideSelection(fabricVariants, false)).toBe(fabricVariants);
  });
});
