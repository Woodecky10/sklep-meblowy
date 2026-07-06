import { describe, it, expect } from "vitest";
import { isValidCodPhone } from "@/app/_lib/cod";

describe("isValidCodPhone — telefon wymagany przy pobraniu", () => {
  it("akceptuje polski numer ze spacjami i prefiksem", () => {
    expect(isValidCodPhone("+48 789 826 403")).toBe(true);
    expect(isValidCodPhone("789826403")).toBe(true);
    expect(isValidCodPhone("789-826-403")).toBe(true);
  });
  it("akceptuje niemiecki numer (dłuższy format)", () => {
    expect(isValidCodPhone("+49 30 123456789")).toBe(true);
  });
  it("odrzuca brak / pusty / za krótki / za długi / bez cyfr", () => {
    expect(isValidCodPhone(null)).toBe(false);
    expect(isValidCodPhone(undefined)).toBe(false);
    expect(isValidCodPhone("")).toBe(false);
    expect(isValidCodPhone("   ")).toBe(false);
    expect(isValidCodPhone("123456")).toBe(false); // 6 cyfr
    expect(isValidCodPhone("1234567890123456")).toBe(false); // 16 cyfr
    expect(isValidCodPhone("zadzwońcie wieczorem")).toBe(false);
  });
});
