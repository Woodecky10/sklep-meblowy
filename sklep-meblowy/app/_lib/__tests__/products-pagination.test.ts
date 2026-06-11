import { describe, it, expect } from "vitest";
import {
  clampPage,
  clampLimit,
  PRODUCTS_PAGE_LIMIT_MAX,
} from "@/app/_lib/products";

describe("clampPage — odporność na NaN/0/ujemne (audyt MED: 500/DoS na /sklep)", () => {
  it("poprawna strona zostaje", () => {
    expect(clampPage(1)).toBe(1);
    expect(clampPage(5)).toBe(5);
  });
  it("NaN (?strona=abc) → 1", () => {
    expect(clampPage(Number("abc"))).toBe(1);
  });
  it("0 i ujemne → 1", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
  });
  it("ułamek → floor", () => {
    expect(clampPage(2.7)).toBe(2);
  });
  it("undefined → 1", () => {
    expect(clampPage(undefined)).toBe(1);
  });
});

describe("clampLimit — bezpieczny limit", () => {
  it("poprawny limit zostaje", () => {
    expect(clampLimit(12)).toBe(12);
    expect(clampLimit(24)).toBe(24);
  });
  it("NaN/0/ujemne → fallback 12", () => {
    expect(clampLimit(Number("x"))).toBe(12);
    expect(clampLimit(0)).toBe(12);
    expect(clampLimit(-3)).toBe(12);
  });
  it("przekroczony max → clamp do MAX", () => {
    expect(clampLimit(9999)).toBe(PRODUCTS_PAGE_LIMIT_MAX);
  });
  it("undefined → fallback 12", () => {
    expect(clampLimit(undefined)).toBe(12);
  });
});
