import { describe, it, expect } from "vitest";
import { safeCompareSecret } from "@/app/_lib/secure-compare";

describe("safeCompareSecret — stałoczasowe porównanie sekretów (audyt LOW)", () => {
  it("równe sekrety → true", () => {
    expect(safeCompareSecret("abc123XYZ", "abc123XYZ")).toBe(true);
  });

  it("różne sekrety tej samej długości → false", () => {
    expect(safeCompareSecret("abc123XYZ", "abc123xyz")).toBe(false);
  });

  it("różne długości → false (bez rzucania)", () => {
    expect(safeCompareSecret("abc", "abcdef")).toBe(false);
    expect(safeCompareSecret("abcdef", "abc")).toBe(false);
  });

  it("null / undefined / pusty → false", () => {
    expect(safeCompareSecret(null, "x")).toBe(false);
    expect(safeCompareSecret("x", null)).toBe(false);
    expect(safeCompareSecret(undefined, undefined)).toBe(false);
    expect(safeCompareSecret("", "")).toBe(false);
    expect(safeCompareSecret("x", "")).toBe(false);
  });

  it("Bearer-token (cron) porównywany w całości", () => {
    expect(safeCompareSecret("Bearer s3cret", "Bearer s3cret")).toBe(true);
    expect(safeCompareSecret("Bearer s3cret", "Bearer s3creX")).toBe(false);
  });

  it("znaki wielobajtowe (UTF-8) — różna liczba bajtów → false", () => {
    expect(safeCompareSecret("łóżkó", "łóżkó")).toBe(true);
    expect(safeCompareSecret("łóżkó", "lozko")).toBe(false);
  });
});
