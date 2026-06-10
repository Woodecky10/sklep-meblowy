import { describe, it, expect } from "vitest";
import { getVariantImages, getVariantPrice } from "@/app/_lib/variants";
import type { Product } from "@/app/_lib/types";

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
