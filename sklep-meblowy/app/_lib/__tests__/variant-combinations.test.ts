import { describe, it, expect } from "vitest";
import { cartesianProduct, rebuildCombinations } from "../variants";
import type { ProductOption, ProductVariant } from "../types";

describe("cartesianProduct", () => {
  it("zwraca pustą tablicę gdy brak poprawnych opcji", () => {
    expect(cartesianProduct([])).toEqual([]);
    expect(cartesianProduct([{ name: "", values: [] }])).toEqual([]);
  });

  it("generuje iloczyn dwóch opcji", () => {
    const options: ProductOption[] = [
      { name: "Tkanina", values: ["Sawana 21", "Velvet Granat"] },
      { name: "Strona", values: ["Lewa", "Prawa"] },
    ];
    const result = cartesianProduct(options);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ Tkanina: "Sawana 21", Strona: "Lewa" });
    expect(result).toContainEqual({ Tkanina: "Velvet Granat", Strona: "Prawa" });
  });
});

describe("rebuildCombinations", () => {
  it("zachowuje stock/zdjęcia kombinacji której klucz przetrwał, nowe dostają stock 0", () => {
    const options: ProductOption[] = [{ name: "Tkanina", values: ["A", "B"] }];
    const old: ProductVariant[] = [
      { values: { Tkanina: "A" }, stock: 7, price_modifier: 0, images: ["img-a.jpg"] },
    ];
    const result = rebuildCombinations(options, old);
    expect(result).toHaveLength(2);
    const a = result.find((c) => c.values.Tkanina === "A")!;
    const b = result.find((c) => c.values.Tkanina === "B")!;
    expect(a.stock).toBe(7);
    expect(a.images).toEqual(["img-a.jpg"]);
    expect(b.stock).toBe(0);
    expect(b.price_modifier).toBe(0);
  });
});
