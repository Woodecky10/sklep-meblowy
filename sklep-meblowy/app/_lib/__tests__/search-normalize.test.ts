import { describe, it, expect } from "vitest";
import { normalizeSearchText, searchMatches } from "@/app/_lib/search-normalize";

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

describe("searchMatches — spacje i kolejność słów bez znaczenia", () => {
  it("dowolna kolejność słów", () => {
    expect(searchMatches("Narożnik VEGAS L", "vegas narożnik")).toBe(true);
  });
  it("spacje całkowicie ignorowane (obie strony)", () => {
    expect(searchMatches("Chill Me", "chillme")).toBe(true);
    expect(searchMatches("Chillme", "chill me")).toBe(true);
  });
  it("diakrytyki nieczułe", () => {
    expect(searchMatches("Łóżko Sawana", "lozko")).toBe(true);
  });
  it("wszystkie słowa muszą wystąpić", () => {
    expect(searchMatches("Sofa Modena", "sofa xyz")).toBe(false);
  });
  it("pusta / sama-spacja fraza → true (nie zawęża)", () => {
    expect(searchMatches("cokolwiek", "")).toBe(true);
    expect(searchMatches("cokolwiek", "   ")).toBe(true);
  });
});
