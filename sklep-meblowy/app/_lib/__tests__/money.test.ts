import { describe, it, expect } from "vitest";
import {
  convertToEur,
  formatEur,
  formatMoney,
  formatOrderAmount,
} from "@/app/_lib/money";

describe("convertToEur — pełne euro w górę", () => {
  it("zaokrągla w górę", () => {
    expect(convertToEur(2199, 0.23)).toBe(506); // 505.77 -> 506
  });
  it("wartość całkowita bez zmian", () => {
    expect(convertToEur(1000, 0.2)).toBe(200); // 200.0 -> 200
  });
  it("ułamek > 0 zaokrągla w górę", () => {
    expect(convertToEur(101, 0.23)).toBe(24); // 23.23 -> 24
  });
  it("zero -> zero", () => {
    expect(convertToEur(0, 0.23)).toBe(0);
  });
});

describe("formatEur — symbol € + grupowanie de-DE", () => {
  it("setki", () => {
    expect(formatEur(506)).toBe("506 €");
  });
  it("tysiące z separatorem de-DE", () => {
    expect(formatEur(2990)).toBe("2.990 €");
  });
  it("zero", () => {
    expect(formatEur(0)).toBe("0 €");
  });
});

describe("formatMoney — cena katalogowa (PLN w DB)", () => {
  it("de: konwersja + EUR", () => {
    expect(formatMoney(2199, "de", 0.23)).toBe("506 €");
  });
  it("pl: bez konwersji, zł (zachowanie formatPrice)", () => {
    // Grupowanie tysięcy zależy od danych ICU w runtimie — używamy faktycznego
    // wyjścia formatPrice zamiast dosłownego "2 199 zł"
    expect(formatMoney(2199, "pl", 0.23)).toBe(`${(2199).toLocaleString("pl-PL")} zł`);
  });
});

describe("formatOrderAmount — kwota w walucie zamówienia", () => {
  it("eur: kwota już w EUR, bez konwersji", () => {
    expect(formatOrderAmount(506, "eur")).toBe("506 €");
  });
  it("pln: zł, grupowanie pl-PL", () => {
    // Grupowanie tysięcy zależy od danych ICU w runtimie — używamy faktycznego
    // wyjścia formatPrice zamiast dosłownego "2 199 zł"
    expect(formatOrderAmount(2199, "pln")).toBe(`${(2199).toLocaleString("pl-PL")} zł`);
  });
});
