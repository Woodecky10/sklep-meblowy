import { describe, it, expect } from "vitest";
import { fabricSlug } from "../fabric-slug";

describe("fabricSlug", () => {
  it("sluguje polskie znaki", () => {
    expect(fabricSlug("Płótno Żółte", new Set())).toBe("plotno-zolte");
  });
  it("kolizja → sufiks -2, -3", () => {
    expect(fabricSlug("Boss", new Set(["boss"]))).toBe("boss-2");
    expect(fabricSlug("Boss", new Set(["boss", "boss-2"]))).toBe("boss-3");
  });
  it("nazwa bez znaków alfanumerycznych → fallback 'tkanina'", () => {
    expect(fabricSlug("###", new Set())).toBe("tkanina");
    expect(fabricSlug("###", new Set(["tkanina"]))).toBe("tkanina-2");
  });
});
