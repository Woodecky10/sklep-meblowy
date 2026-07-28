import { describe, it, expect } from "vitest";
import { swatchImages } from "../fabric-swatch-images";

describe("swatchImages", () => {
  it("zwraca próbki mające zdjęcie, w kolejności colors", () => {
    const res = swatchImages(
      ["02", "04", "09"],
      { "09": "https://x.co/9.jpg", "02": "https://x.co/2.jpg" }
    );
    expect(res).toEqual([
      { code: "02", url: "https://x.co/2.jpg" },
      { code: "09", url: "https://x.co/9.jpg" },
    ]);
  });
  it("pomija kody bez URL oraz URL nie-http(s)", () => {
    const res = swatchImages(
      ["02", "04", "05"],
      { "02": "https://x.co/2.jpg", "04": "", "05": "javascript:alert(1)" }
    );
    expect(res).toEqual([{ code: "02", url: "https://x.co/2.jpg" }]);
  });
  it("pusta mapa / brak kolorów → []", () => {
    expect(swatchImages(["02"], {})).toEqual([]);
    expect(swatchImages([], { "02": "https://x.co/2.jpg" })).toEqual([]);
  });
});
