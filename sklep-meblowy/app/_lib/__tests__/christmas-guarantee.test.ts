import { describe, it, expect } from "vitest";
import {
  CHRISTMAS_DEADLINE_MS,
  christmasCountdown,
  hasChristmasGuarantee,
} from "../christmas-guarantee";

const BEFORE = Date.parse("2026-11-24T12:00:00+01:00");
const LAST_SECOND = Date.parse("2026-11-30T23:59:59+01:00");

describe("hasChristmasGuarantee", () => {
  it("obejmuje produkty ze wstążką PRZED ŚWIĘTAMI i SZYBKA DOSTAWA", () => {
    expect(hasChristmasGuarantee("PRZED ŚWIĘTAMI", BEFORE)).toBe(true);
    expect(hasChristmasGuarantee("SZYBKA DOSTAWA", BEFORE)).toBe(true);
  });

  it("nie zależy od wielkości liter ani zbędnych spacji w napisie", () => {
    expect(hasChristmasGuarantee("  przed  świętami ", BEFORE)).toBe(true);
    expect(hasChristmasGuarantee("Szybka dostawa", BEFORE)).toBe(true);
  });

  it("pomija produkty bez wstążki i z inną wstążką", () => {
    expect(hasChristmasGuarantee(null, BEFORE)).toBe(false);
    expect(hasChristmasGuarantee(undefined, BEFORE)).toBe(false);
    expect(hasChristmasGuarantee("", BEFORE)).toBe(false);
    expect(hasChristmasGuarantee("Promocja", BEFORE)).toBe(false);
  });

  it("działa do 30.11 23:59:59 czasu polskiego i gaśnie o północy", () => {
    expect(hasChristmasGuarantee("PRZED ŚWIĘTAMI", LAST_SECOND)).toBe(true);
    expect(hasChristmasGuarantee("PRZED ŚWIĘTAMI", CHRISTMAS_DEADLINE_MS)).toBe(false);
  });
});

describe("christmasCountdown", () => {
  it("rozkłada pozostały czas na dni, godziny, minuty i sekundy", () => {
    expect(christmasCountdown(BEFORE)).toEqual({ days: 6, hours: 12, minutes: 0, seconds: 0 });
    expect(christmasCountdown(LAST_SECOND)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it("zaokrągla w dół niepełną sekundę", () => {
    expect(christmasCountdown(LAST_SECOND - 500)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it("po terminie zwraca null", () => {
    expect(christmasCountdown(CHRISTMAS_DEADLINE_MS)).toBeNull();
    expect(christmasCountdown(CHRISTMAS_DEADLINE_MS + 1000)).toBeNull();
  });
});
