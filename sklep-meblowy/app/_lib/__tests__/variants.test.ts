import { describe, it, expect } from "vitest";
import { getVariantImages, getVariantPrice } from "@/app/_lib/variants";
import type { Product } from "@/app/_lib/types";
import {
  variantKey,
  getVariantSalePrice,
  getVariantOmnibus,
  isVariantOnSale,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";

// Minimalny produkt z wariantami — tyle, ile czytają helpery.
const product = {
  price: 1000,
  images: ["global-1.jpg", "global-2.jpg"],
  variants: {
    options: [{ name: "Wariant", values: ["A", "B", "C"] }],
    combinations: [
      {
        values: { Wariant: "A" },
        stock: 1,
        price_modifier: 0,
        images: ["a-1.jpg"],
      },
      { values: { Wariant: "B" }, stock: 1, price_modifier: 190 },
      { values: { Wariant: "C" }, stock: 1, price_modifier: 0, images: [] },
    ],
  },
} as unknown as Product;

describe("getVariantImages — galeria per wariant z fallbackiem", () => {
  it("wariant z własnymi zdjęciami → jego zdjęcia", () => {
    expect(getVariantImages(product, { Wariant: "A" })).toEqual(["a-1.jpg"]);
  });
  it("wariant bez zdjęć → globalna galeria produktu", () => {
    expect(getVariantImages(product, { Wariant: "B" })).toEqual([
      "global-1.jpg",
      "global-2.jpg",
    ]);
  });
  it("wariant z pustą listą zdjęć → globalna galeria (nie pusta)", () => {
    expect(getVariantImages(product, { Wariant: "C" })).toEqual([
      "global-1.jpg",
      "global-2.jpg",
    ]);
  });
  it("brak wyboru → globalna galeria", () => {
    expect(getVariantImages(product, {})).toEqual([
      "global-1.jpg",
      "global-2.jpg",
    ]);
  });
});

describe("getVariantPrice — jedna cena obowiązująca dla wyboru", () => {
  it("brak wyboru → cena bazowa", () => {
    expect(getVariantPrice(product, {})).toBe(1000);
  });
  it("wariant z modyfikatorem → baza + modyfikator", () => {
    expect(getVariantPrice(product, { Wariant: "B" })).toBe(1190);
  });
  it("wariant bez modyfikatora → cena bazowa", () => {
    expect(getVariantPrice(product, { Wariant: "A" })).toBe(1000);
  });
});

describe("variantKey", () => {
  it("deterministyczny niezależnie od kolejności kluczy", () => {
    expect(variantKey({ Kolor: "Beż", Strona: "Lewa" })).toBe(
      variantKey({ Strona: "Lewa", Kolor: "Beż" })
    );
    expect(variantKey({ Kolor: "Beż" })).toBe("Kolor=Beż");
  });
});

const noVar = {
  price: 1000, sale_price: 800, omnibus_price: 1000, variants: null,
} as unknown as Product;

const withVar = {
  price: 1000, sale_price: null, omnibus_price: null,
  variants: {
    options: [{ name: "Kolor", values: ["Beż", "Granat"] }],
    combinations: [
      { values: { Kolor: "Beż" }, stock: 1, price_modifier: 0, sale_price: 700, omnibus_price: 1000 },
      { values: { Kolor: "Granat" }, stock: 1, price_modifier: 200 },
    ],
  },
} as unknown as Product;

describe("helpery promocji wariantu", () => {
  it("produkt bez wariantów → poziom produktu", () => {
    expect(getVariantSalePrice(noVar, {})).toBe(800);
    expect(getVariantOmnibus(noVar, {})).toBe(1000);
    expect(isVariantOnSale(noVar, {})).toBe(true);
    expect(getVariantEffectivePrice(noVar, {})).toBe(800);
  });
  it("kombinacja w promocji → jej sale/omnibus, cena efektywna = sale", () => {
    expect(getVariantSalePrice(withVar, { Kolor: "Beż" })).toBe(700);
    expect(getVariantOmnibus(withVar, { Kolor: "Beż" })).toBe(1000);
    expect(isVariantOnSale(withVar, { Kolor: "Beż" })).toBe(true);
    expect(getVariantEffectivePrice(withVar, { Kolor: "Beż" })).toBe(700);
  });
  it("kombinacja bez promocji → regularna (price+modifier), nie on-sale", () => {
    expect(getVariantSalePrice(withVar, { Kolor: "Granat" })).toBeNull();
    expect(isVariantOnSale(withVar, { Kolor: "Granat" })).toBe(false);
    expect(getVariantEffectivePrice(withVar, { Kolor: "Granat" })).toBe(1200);
  });
  it("niekompletny wybór wariantu → nie on-sale (brak dopasowanej kombinacji)", () => {
    expect(isVariantOnSale(withVar, {})).toBe(false);
    expect(getVariantSalePrice(withVar, {})).toBeNull();
  });
});
