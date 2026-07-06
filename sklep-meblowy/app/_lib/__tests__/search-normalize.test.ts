import { describe, it, expect } from "vitest";
import { normalizeSearchText } from "@/app/_lib/search-normalize";

describe("normalizeSearchText — normalizacja frazy wyszukiwania", () => {
  it("zdejmuje polskie diakrytyki (w tym ł, które nie ma dekompozycji NFD)", () => {
    expect(normalizeSearchText("Łóżko")).toBe("lozko");
    expect(normalizeSearchText("ĄĘŚŻŹĆŃÓŁ")).toBe("aeszzcnol");
    expect(normalizeSearchText("Krzesło pikowane")).toBe("krzeslo pikowane");
  });
  it("obniża wielkość liter i tnie skrajne spacje", () => {
    expect(normalizeSearchText("  SOFA Modena  ")).toBe("sofa modena");
  });
  it("nie zmienia zwykłego ASCII i obsługuje pusty string", () => {
    expect(normalizeSearchText("fotel 123")).toBe("fotel 123");
    expect(normalizeSearchText("")).toBe("");
  });
});
