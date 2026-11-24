import { describe, it, expect } from "vitest";
import { pickByKeys, variantValuesOf, withoutLongText } from "../page-payload";
import type { Product } from "../types";

const variants = (options: { name: string; values: string[] }[]) =>
  ({ options }) as unknown as Product["variants"];

describe("variantValuesOf", () => {
  it("zbiera wartości wszystkich opcji wszystkich produktów, bez powtórzeń", () => {
    const values = variantValuesOf([
      { variants: variants([
        { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
        { name: "Tkanina", values: ["Baloo 2071", "Baloo 2072"] },
      ]) },
      { variants: variants([{ name: "Tkanina", values: ["Baloo 2072", "Riviera 16"] }]) },
    ]);
    expect([...values].sort()).toEqual(
      ["Baloo 2071", "Baloo 2072", "Lewostronny", "Prawostronny", "Riviera 16"].sort()
    );
  });

  it("produkt bez wariantów nie wnosi niczego", () => {
    expect(variantValuesOf([{ variants: null }]).size).toBe(0);
    expect(variantValuesOf([]).size).toBe(0);
  });
});

describe("pickByKeys", () => {
  it("zostawia tylko wpisy o podanych kluczach, w kolejności mapy", () => {
    const map = { "Baloo 2071": "a", "Baloo 2072": "b", "Riviera 16": "c" };
    expect(pickByKeys(map, new Set(["Riviera 16", "Baloo 2071", "Nie ma"]))).toEqual({
      "Baloo 2071": "a",
      "Riviera 16": "c",
    });
  });

  it("pusty zbiór kluczy daje pustą mapę i nie rusza źródła", () => {
    const map = { x: 1 };
    expect(pickByKeys(map, new Set())).toEqual({});
    expect(map).toEqual({ x: 1 });
  });
});

describe("withoutLongText", () => {
  it("czyści opisy, resztę pól zostawia, źródła nie zmienia", () => {
    const product = {
      id: "p1",
      name: "Sofa",
      price: 100,
      description: "<p>długi opis</p>",
      description_sections: [{ kind: "text", title: "t", body: "b" }],
    } as unknown as Product;
    const slim = withoutLongText(product);
    expect(slim.description).toBe("");
    expect(slim.description_sections).toEqual([]);
    expect(slim.id).toBe("p1");
    expect(slim.name).toBe("Sofa");
    expect(slim.price).toBe(100);
    expect(product.description).toBe("<p>długi opis</p>");
  });
});
