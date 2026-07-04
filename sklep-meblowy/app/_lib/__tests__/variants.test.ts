import { describe, it, expect } from "vitest";
import {
  variantKey,
  getVariantPrice,
  getVariantSalePrice,
  getVariantOmnibus,
  getVariantStock,
  totalProductStock,
  getVariantImages,
  getVariantEffectivePrice,
  isVariantOnSale,
  formatVariantLabel,
  getOptionDisplayName,
  getValueDisplayLabel,
  isVariantSelectionComplete,
  hasVariants,
} from "@/app/_lib/variants";
import type { Product } from "@/app/_lib/types";

// Produkt z opcjami + dopłatą per wartość; stan/promo/zdjęcia PRODUKTOWE.
const product = {
  id: "p1", name: "Sofa", price: 2000, stock: 5,
  sale_price: 1800, omnibus_price: 1700, images: ["prod.jpg"],
  variants: {
    options: [{ name: "Tkanina", values: ["Sawana 21", "Riviera 16"], value_prices: { "Riviera 16": 200 } }],
    combinations: [], // pole jeszcze istnieje w typie (usuwane w Tasku 8)
  },
} as unknown as import("@/app/_lib/types").Product;

describe("model tylko-opcje — ceny z dopłat + poziom produktu", () => {
  it("getVariantPrice -> base + dopłata wybranej wartości", () => {
    expect(getVariantPrice(product, { Tkanina: "Sawana 21" })).toBe(2000);
    expect(getVariantPrice(product, { Tkanina: "Riviera 16" })).toBe(2200);
  });
  it("getVariantSalePrice -> sale + dopłata (dopłata dolicza się do promocji)", () => {
    expect(getVariantSalePrice(product, { Tkanina: "Riviera 16" })).toBe(2000); // 1800+200
    expect(getVariantSalePrice(product, { Tkanina: "Sawana 21" })).toBe(1800);
  });
  it("getVariantOmnibus -> omnibus + dopłata", () => {
    expect(getVariantOmnibus(product, { Tkanina: "Riviera 16" })).toBe(1900); // 1700+200
  });
  it("getVariantEffectivePrice/isVariantOnSale -> spójne (on-sale ⇔ sale<base)", () => {
    expect(getVariantEffectivePrice(product, { Tkanina: "Riviera 16" })).toBe(2000);
    expect(isVariantOnSale(product, { Tkanina: "Riviera 16" })).toBe(true);
  });
  it("getVariantStock/totalProductStock -> product.stock", () => {
    expect(getVariantStock(product, { Tkanina: "Riviera 16" })).toBe(5);
    expect(totalProductStock(product)).toBe(5);
  });
  it("getVariantImages -> galeria produktu", () => {
    expect(getVariantImages(product, { Tkanina: "Riviera 16" })).toEqual(["prod.jpg"]);
  });
  it("brak sale_price -> getVariantSalePrice null", () => {
    const p2 = { ...product, sale_price: null } as typeof product;
    expect(getVariantSalePrice(p2, { Tkanina: "Riviera 16" })).toBeNull();
  });
});

describe("variantKey", () => {
  it("deterministyczny niezależnie od kolejności kluczy", () => {
    expect(variantKey({ Kolor: "Bez", Strona: "Lewa" })).toBe(
      variantKey({ Strona: "Lewa", Kolor: "Bez" })
    );
    expect(variantKey({ Kolor: "Bez" })).toBe("Kolor=Bez");
  });
});

describe("formatVariantLabel", () => {
  it("zwraca czytelny label dla wybranych wartości", () => {
    expect(formatVariantLabel({ Tkanina: "Sawana 21", Strona: "Lewa" })).toBe(
      "Tkanina: Sawana 21, Strona: Lewa"
    );
  });
});

describe("getOptionDisplayName / getValueDisplayLabel", () => {
  it("brak overrides -> zwraca oryginalna nazwa", () => {
    const p = { variants: { options: [], combinations: [], overrides: {} } } as unknown as Product;
    expect(getOptionDisplayName(p, "Tkanina")).toBe("Tkanina");
    expect(getValueDisplayLabel(p, "Tkanina", "Sawana 21")).toBe("Sawana 21");
  });
});

describe("isVariantSelectionComplete / hasVariants", () => {
  it("produkt bez wariantów -> hasVariants false, selection complete", () => {
    const p = { variants: null } as unknown as Product;
    expect(hasVariants(p)).toBe(false);
    expect(isVariantSelectionComplete(p, {})).toBe(true);
  });
  it("produkt z opcjami -> kompletny wybor gdy wszystkie opcje wybrane", () => {
    expect(isVariantSelectionComplete(product, { Tkanina: "Sawana 21" })).toBe(true);
    expect(isVariantSelectionComplete(product, {})).toBe(false);
  });
});
