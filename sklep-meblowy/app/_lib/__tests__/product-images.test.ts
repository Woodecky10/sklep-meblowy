import { describe, it, expect } from "vitest";
import { imageUrlsToDelete, cleanValueImages } from "@/app/_lib/product-images";

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

describe("cleanValueImages — czyszczenie zdjęć wartości przy zapisie wariantów", () => {
  it("zostawia tylko wpisy dla istniejących wartości (pruning)", () => {
    expect(
      cleanValueImages(["A"], { A: ["https://x/a.jpg"], B: ["https://x/b.jpg"] })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
  it("odrzuca nie-stringi, puste stringi i URL-e bez http(s)", () => {
    expect(
      cleanValueImages(["A"], {
        A: ["https://x/a.jpg", "", 123, "javascript:alert(1)", "ftp://x/z.jpg"],
      })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
  it("puste tablice znikają; nic nie zostało → undefined", () => {
    expect(cleanValueImages(["A"], { A: [] })).toBeUndefined();
    expect(cleanValueImages(["A"], {})).toBeUndefined();
    expect(cleanValueImages(["A"], { B: ["https://x/b.jpg"] })).toBeUndefined();
  });
  it("śmieciowe wejście (nie-obiekt / tablica / undefined) → undefined", () => {
    expect(cleanValueImages(["A"], undefined)).toBeUndefined();
    expect(cleanValueImages(["A"], "x")).toBeUndefined();
    expect(cleanValueImages(["A"], ["https://x/a.jpg"])).toBeUndefined();
    expect(cleanValueImages(["A"], null)).toBeUndefined();
  });
  it("wartość z tablicą zawierającą śmieci → zostają tylko poprawne URL-e", () => {
    expect(
      cleanValueImages(["A", "B"], { A: ["https://x/a.jpg"], B: "nie-tablica" })
    ).toEqual({ A: ["https://x/a.jpg"] });
  });
});
