import { describe, it, expect } from "vitest";
import {
  FABRIC_OPTION_NAME,
  applyFabricSelection,
  buildFabricDeMap,
  expandFabrics,
  fabricValueBelongsTo,
} from "../variants";
import { formatVariantLabel } from "../variants";
import type { ProductOption, ProductVariant } from "../types";

describe("applyFabricSelection", () => {
  it("tworzy opcję Tkanina gdy nie istnieje i generuje warianty 1:1", () => {
    const { options, combinations } = applyFabricSelection([], [], ["A", "B", "C"]);
    expect(options).toEqual([{ name: FABRIC_OPTION_NAME, values: ["A", "B", "C"] }]);
    expect(combinations).toHaveLength(3);
    expect(combinations.every((c) => c.stock === 0)).toBe(true);
  });

  it("aktualizuje wartości istniejącej opcji Tkanina zachowując stock przetrwałych", () => {
    const options: ProductOption[] = [{ name: FABRIC_OPTION_NAME, values: ["A"] }];
    const combos: ProductVariant[] = [
      { values: { [FABRIC_OPTION_NAME]: "A" }, stock: 5, price_modifier: 0 },
    ];
    const res = applyFabricSelection(options, combos, ["A", "B"]);
    expect(res.options[0].values).toEqual(["A", "B"]);
    const a = res.combinations.find((c) => c.values[FABRIC_OPTION_NAME] === "A")!;
    expect(a.stock).toBe(5);
    expect(res.combinations).toHaveLength(2);
  });

  it("współistnieje z inną opcją — iloczyn tkanin × strona", () => {
    const options: ProductOption[] = [{ name: "Strona", values: ["Lewa", "Prawa"] }];
    const res = applyFabricSelection(options, [], ["A", "B"]);
    expect(res.options.map((o) => o.name).sort()).toEqual(["Strona", "Tkanina"]);
    expect(res.combinations).toHaveLength(4);
  });

  it("pusty wybór usuwa opcję Tkanina (zostają inne opcje)", () => {
    const options: ProductOption[] = [
      { name: FABRIC_OPTION_NAME, values: ["A"] },
      { name: "Strona", values: ["Lewa"] },
    ];
    const combos: ProductVariant[] = [
      { values: { [FABRIC_OPTION_NAME]: "A", Strona: "Lewa" }, stock: 0 },
    ];
    const res = applyFabricSelection(options, combos, []);
    expect(res.options).toEqual([{ name: "Strona", values: ["Lewa"] }]);
    expect(res.combinations).toHaveLength(1);
  });
});

describe("expandFabrics", () => {
  it("kolekcja z kolorami → wartości „Nazwa Numer” + dopłata per wartość", () => {
    const r = expandFabrics([{ name: "Monolith", colors: ["02", "04"], price: 200 }]);
    expect(r.values).toEqual(["Monolith 02", "Monolith 04"]);
    expect(r.valuePrices).toEqual({ "Monolith 02": 200, "Monolith 04": 200 });
  });

  it("kolekcja bez kolorów → sama nazwa; dopłata 0 → brak wpisu ceny", () => {
    const r = expandFabrics([{ name: "Velvet", colors: [], price: 0 }]);
    expect(r.values).toEqual(["Velvet"]);
    expect(r.valuePrices).toEqual({});
  });

  it("wiele kolekcji, dedupe wartości, kolejność zachowana", () => {
    const r = expandFabrics([
      { name: "Monolith", colors: ["02"], price: 0 },
      { name: "Sawana", colors: ["02", "02"], price: 50 },
    ]);
    expect(r.values).toEqual(["Monolith 02", "Sawana 02"]);
    expect(r.valuePrices).toEqual({ "Sawana 02": 50 });
  });
});

describe("fabricValueBelongsTo", () => {
  const monolith = { name: "Monolith", colors: ["02", "04"], price: 0 };
  it("„Nazwa Numer” należy gdy numer ∈ colors", () => {
    expect(fabricValueBelongsTo("Monolith 02", monolith)).toBe(true);
    expect(fabricValueBelongsTo("Monolith 99", monolith)).toBe(false);
  });
  it("sama nazwa należy do kolekcji bez kolorów", () => {
    expect(fabricValueBelongsTo("Velvet", { name: "Velvet", colors: [], price: 0 })).toBe(true);
    expect(fabricValueBelongsTo("Velvet 02", { name: "Velvet", colors: [], price: 0 })).toBe(false);
  });
  it("nie należy do innej kolekcji", () => {
    expect(fabricValueBelongsTo("Monolith 02", { name: "Sawana", colors: ["02"], price: 0 })).toBe(false);
  });
});

describe("buildFabricDeMap", () => {
  it("mapuje tylko tkaniny z niepustą name_de", () => {
    const map = buildFabricDeMap([
      { name: "Sawana 21", name_de: "Savanne 21" },
      { name: "Velvet Granat", name_de: null },
      { name: "Monolith 09", name_de: "  " },
    ]);
    expect(map).toEqual({ "Sawana 21": "Savanne 21" });
  });
});

describe("formatVariantLabel z mapą tkanin", () => {
  it("na DE tłumaczy wartość opcji Tkanina przez fabricMap", () => {
    const label = formatVariantLabel(
      { Tkanina: "Sawana 21", Strona: "Lewa" },
      "de",
      { "Sawana 21": "Savanne 21" }
    );
    // opcja Tkanina→Stoff (VARIANT_OPTION_DE), wartość z fabricMap; Strona/Lewa ze statycznej mapy
    expect(label).toContain("Stoff: Savanne 21");
    expect(label).toContain("Seite: Links");
  });

  it("bez mapy / na PL wartość tkaniny bez zmian", () => {
    expect(formatVariantLabel({ Tkanina: "Sawana 21" }, "pl")).toBe("Tkanina: Sawana 21");
    expect(formatVariantLabel({ Tkanina: "Sawana 21" }, "de")).toContain("Sawana 21");
  });
});
