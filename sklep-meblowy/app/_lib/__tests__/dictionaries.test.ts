import { describe, it, expect } from "vitest";
import { getDictionary } from "@/app/_lib/dictionaries";

describe("getDictionary", () => {
  it("pl zwraca polskie stringi", () => {
    expect(getDictionary("pl").nav.shop).toBe("Sklep");
  });
  it("de nadpisuje przetłumaczonym stringiem", () => {
    expect(getDictionary("de").nav.shop).toBe("Shop");
  });
  it("brakujący klucz DE → fallback do PL", () => {
    // common.back jest celowo NIE przetłumaczony w de.ts
    const de = getDictionary("de");
    const pl = getDictionary("pl");
    expect(de.common.back).toBe(pl.common.back);
    expect(de.common.back).toBe("Wstecz");
  });
});
