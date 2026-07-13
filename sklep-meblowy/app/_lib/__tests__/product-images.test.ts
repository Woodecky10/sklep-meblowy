import { describe, it, expect } from "vitest";
import { imageUrlsToDelete } from "@/app/_lib/product-images";

describe("imageUrlsToDelete — kasuj ze storage tylko URL-e nieużywane gdzie indziej", () => {
  it("URL współdzielony z innym produktem NIE jest kasowany", () => {
    // Bliźniak rozmiarowy współdzieli te same zdjęcia — usunięcie jednego
    // nie może skasować plików używanych przez drugi.
    expect(
      imageUrlsToDelete(["a.jpg", "b.jpg"], [["a.jpg", "b.jpg"]])
    ).toEqual([]);
  });

  it("URL nieużywany przez żaden inny produkt jest kasowany", () => {
    expect(imageUrlsToDelete(["a.jpg", "b.jpg"], [["c.jpg"]])).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("miks: kasuje tylko te wyłącznie własne", () => {
    // a.jpg używa też inny produkt (zostaje), b.jpg tylko ten (kasujemy).
    expect(
      imageUrlsToDelete(["a.jpg", "b.jpg"], [["a.jpg"], ["z.jpg"]])
    ).toEqual(["b.jpg"]);
  });

  it("deduplikuje URL-e w wejściu", () => {
    expect(imageUrlsToDelete(["a.jpg", "a.jpg"], [])).toEqual(["a.jpg"]);
  });

  it("pusta lista zdjęć produktu → nic do kasowania", () => {
    expect(imageUrlsToDelete([], [["a.jpg"]])).toEqual([]);
  });

  it("brak innych produktów → kasujemy wszystkie własne", () => {
    expect(imageUrlsToDelete(["a.jpg", "b.jpg"], [])).toEqual(["a.jpg", "b.jpg"]);
  });
});
