import { describe, it, expect } from "vitest";
import { buildNewProductPayload } from "@/app/_lib/new-product";

const valid = { name: "Sofa Mollien", price: "1999.99", category: "sofy" };

describe("buildNewProductPayload", () => {
  it("happy path: payload z domyślnymi (needs_translation=true, stock=0, is_active=true)", () => {
    const r = buildNewProductPayload(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.name).toBe("Sofa Mollien");
      expect(r.payload.price).toBe(1999.99);
      expect(r.payload.category).toBe("sofy");
      expect(r.payload.needs_translation).toBe(true);
      expect(r.payload.stock).toBe(0);
      expect(r.payload.is_active).toBe(true);
      expect(r.payload.images).toEqual([]);
      expect(r.payload.variants).toBeNull();
      expect(r.payload.description).toBe("");
    }
  });

  it("normalizuje przecinek w cenie", () => {
    const r = buildNewProductPayload({ ...valid, price: "1999,50" });
    expect(r.ok && r.payload.price).toBe(1999.5);
  });

  it("przycina nazwę i odrzuca pustą/whitespace", () => {
    expect(buildNewProductPayload({ ...valid, name: "   " }).ok).toBe(false);
    const r = buildNewProductPayload({ ...valid, name: "  Fotel  " });
    expect(r.ok && r.payload.name).toBe("Fotel");
  });

  it("odrzuca cenę ujemną, NaN, pustą", () => {
    expect(buildNewProductPayload({ ...valid, price: "-5" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "abc" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "" }).ok).toBe(false);
  });

  it("odrzuca brak kategorii", () => {
    expect(buildNewProductPayload({ ...valid, category: "" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, category: "   " }).ok).toBe(false);
  });

  it("odrzuca nazwę dłuższą niż 300 znaków", () => {
    expect(buildNewProductPayload({ ...valid, name: "x".repeat(301) }).ok).toBe(false);
  });

  it("naroznik-l → variants ma opcje Strona", () => {
    const r = buildNewProductPayload({ name: "N", price: 1000, category: "naroznik-l" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.variants?.options.map((o) => o.name)).toEqual(["Strona"]);
    }
  });

  it("inne kategorie narożników (narozniki, pufy) → variants null (opt-in przez toggle)", () => {
    for (const category of ["narozniki", "pufy", "sofy"]) {
      const r = buildNewProductPayload({ ...valid, category });
      expect(r.ok && r.payload.variants).toBeNull();
    }
  });
});
