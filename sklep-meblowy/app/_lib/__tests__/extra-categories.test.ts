import { describe, it, expect } from "vitest";
import { categoryMatchFilter, NO_MATCH_FILTER } from "@/app/_lib/extra-categories";

describe("categoryMatchFilter", () => {
  it("jeden slug: kategoria główna LUB dodatkowa", () => {
    expect(categoryMatchFilter(["szybka-dostawa"])).toBe(
      "category.in.(szybka-dostawa),extra_categories.ov.{szybka-dostawa}"
    );
  });

  it("poddrzewo: kolejność zachowana, duplikat raz", () => {
    expect(categoryMatchFilter(["narozniki", "naroznik-l", "narozniki"])).toBe(
      "category.in.(narozniki,naroznik-l),extra_categories.ov.{narozniki,naroznik-l}"
    );
  });

  it("odrzuca slugi, które rozbiłyby składnię PostgREST", () => {
    expect(categoryMatchFilter(["a,b", "x)", "y}", "Sofy", " sofy", "sofy"])).toBe(
      "category.in.(sofy),extra_categories.ov.{sofy}"
    );
  });

  it("pusta lista albo same złe slugi → warunek, który nic nie dopasuje", () => {
    expect(categoryMatchFilter([])).toBe(NO_MATCH_FILTER);
    expect(categoryMatchFilter(["a,b"])).toBe(NO_MATCH_FILTER);
  });
});
