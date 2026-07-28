import { describe, it, expect } from "vitest";
import { parseFeaturedProductIds, MAX_FEATURED_PRODUCTS } from "../fabric-featured-products";

describe("parseFeaturedProductIds", () => {
  it("parsuje poprawne id, trim, zachowuje kolejność", () => {
    const input = JSON.stringify([" p1 ", "p2", "p3"]);
    expect(parseFeaturedProductIds(input)).toEqual(["p1", "p2", "p3"]);
  });
  it("odrzuca nie-stringi i puste; dedupe zachowuje pierwsze wystąpienie", () => {
    const input = JSON.stringify(["p1", "", "   ", 42, null, "p2", "p1"]);
    expect(parseFeaturedProductIds(input)).toEqual(["p1", "p2"]);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseFeaturedProductIds("nie json")).toEqual([]);
    expect(parseFeaturedProductIds(undefined)).toEqual([]);
    expect(parseFeaturedProductIds(JSON.stringify({ id: "p1" }))).toEqual([]);
  });
  it("tnie do MAX_FEATURED_PRODUCTS (licząc tylko unikalne)", () => {
    const rows = Array.from({ length: MAX_FEATURED_PRODUCTS + 5 }, (_, i) => `p${i}`);
    expect(parseFeaturedProductIds(JSON.stringify(rows))).toHaveLength(MAX_FEATURED_PRODUCTS);
  });
});
