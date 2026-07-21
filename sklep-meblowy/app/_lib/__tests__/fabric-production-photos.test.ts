import { describe, it, expect } from "vitest";
import { parseProductionPhotos, MAX_PRODUCTION_PHOTOS } from "../fabric-production-photos";

describe("parseProductionPhotos", () => {
  it("parsuje poprawne wiersze; puste/brak product_id → null", () => {
    const input = JSON.stringify([
      { url: "https://x.co/a.jpg", product_id: "p1" },
      { url: "http://x.co/b.jpg", product_id: "" },
      { url: "https://x.co/c.jpg" },
    ]);
    expect(parseProductionPhotos(input)).toEqual([
      { url: "https://x.co/a.jpg", product_id: "p1" },
      { url: "http://x.co/b.jpg", product_id: null },
      { url: "https://x.co/c.jpg", product_id: null },
    ]);
  });
  it("odrzuca wiersze bez URL http(s) i nie-obiekty", () => {
    const input = JSON.stringify([
      { url: "javascript:alert(1)", product_id: "p1" },
      { url: "/wzgledny.jpg" },
      "tekst",
      null,
      { product_id: "p2" },
    ]);
    expect(parseProductionPhotos(input)).toEqual([]);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseProductionPhotos("nie json")).toEqual([]);
    expect(parseProductionPhotos(undefined)).toEqual([]);
    expect(parseProductionPhotos(JSON.stringify({ url: "https://x.co/a.jpg" }))).toEqual([]);
  });
  it("tnie do MAX_PRODUCTION_PHOTOS", () => {
    const rows = Array.from({ length: MAX_PRODUCTION_PHOTOS + 5 }, (_, i) => ({
      url: `https://x.co/${i}.jpg`,
    }));
    expect(parseProductionPhotos(JSON.stringify(rows))).toHaveLength(MAX_PRODUCTION_PHOTOS);
  });
});
