import { describe, it, expect } from "vitest";
import { isProductPath } from "@/app/_lib/routes";

describe("isProductPath — karty produktu (PL i /de)", () => {
  it("karta produktu PL", () => {
    expect(isProductPath("/produkt/abc-123")).toBe(true);
  });
  it("karta produktu DE", () => {
    expect(isProductPath("/de/produkt/abc-123")).toBe(true);
  });
  it("inne strony — false", () => {
    expect(isProductPath("/")).toBe(false);
    expect(isProductPath("/sklep")).toBe(false);
    expect(isProductPath("/de")).toBe(false);
    expect(isProductPath("/de/sklep")).toBe(false);
  });
  it("prefiksy podobne — false (admin, sam /produkt bez id)", () => {
    expect(isProductPath("/admin/produkty/abc")).toBe(false);
    expect(isProductPath("/produkt")).toBe(false);
    expect(isProductPath("/produkty")).toBe(false);
  });
});
