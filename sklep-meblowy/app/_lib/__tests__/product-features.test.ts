import { describe, it, expect } from "vitest";
import {
  parseFeatureRows,
  MAX_FEATURES,
  collectFeatureKeySuggestions,
  SEED_FEATURE_KEYS,
  DEDICATED_FEATURE_KEYS,
} from "../product-features";

describe("parseFeatureRows", () => {
  it("parsuje poprawne wiersze z trim", () => {
    const input = JSON.stringify([
      { key: " Wypełnienie ", value: " Pianka HR " },
      { key: "Stelaż", value: "Drewno bukowe" },
    ]);
    expect(parseFeatureRows(input)).toEqual([
      { key: "Wypełnienie", value: "Pianka HR" },
      { key: "Stelaż", value: "Drewno bukowe" },
    ]);
  });
  it("pomija wiersze bez klucza lub wartości i nie-obiekty", () => {
    const input = JSON.stringify([
      { key: "", value: "x" },
      { key: "K", value: "   " },
      "tekst",
      null,
      { key: "OK", value: "tak" },
    ]);
    expect(parseFeatureRows(input)).toEqual([{ key: "OK", value: "tak" }]);
  });
  it("dedupe kluczy case-insensitive — pierwszy wygrywa", () => {
    const input = JSON.stringify([
      { key: "Wypełnienie", value: "Pianka" },
      { key: "wypełnienie", value: "Sprężyny" },
    ]);
    expect(parseFeatureRows(input)).toEqual([{ key: "Wypełnienie", value: "Pianka" }]);
  });
  it("tnie długości (klucz 100, wartość 300) i limit MAX_FEATURES", () => {
    const long = JSON.stringify([{ key: "a".repeat(150), value: "b".repeat(400) }]);
    const [row] = parseFeatureRows(long);
    expect(row.key).toHaveLength(100);
    expect(row.value).toHaveLength(300);
    const many = JSON.stringify(
      Array.from({ length: MAX_FEATURES + 5 }, (_, i) => ({ key: `k${i}`, value: "v" }))
    );
    expect(parseFeatureRows(many)).toHaveLength(MAX_FEATURES);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseFeatureRows("nie json")).toEqual([]);
    expect(parseFeatureRows(undefined)).toEqual([]);
    expect(parseFeatureRows(JSON.stringify({ key: "a", value: "b" }))).toEqual([]);
  });
});

describe("collectFeatureKeySuggestions", () => {
  it("bez danych z bazy zwraca seed posortowany po polsku", () => {
    const out = collectFeatureKeySuggestions([]);
    expect(out).toHaveLength(SEED_FEATURE_KEYS.length);
    expect(out).toEqual([...SEED_FEATURE_KEYS].sort((a, b) => a.localeCompare(b, "pl")));
    expect(out).toContain("Wysokość nóżek");
  });

  it("dokłada klucze z produktów i sortuje po polsku razem z seedem (ł między l i m)", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Łączenie modułów", value: "x" }],
      [{ key: "Lampki LED", value: "x" }],
      [{ key: "Moduł USB", value: "x" }],
    ]);
    const iL = out.indexOf("Lampki LED");
    const iLl = out.indexOf("Łączenie modułów");
    const iM = out.indexOf("Moduł USB");
    expect(iL).toBeGreaterThanOrEqual(0);
    expect(iL).toBeLessThan(iLl);
    expect(iLl).toBeLessThan(iM);
  });

  it("dedupe trim + case-insensitive — pisownia seeda wygrywa z bazą", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "  wysokość nóżek ", value: "12 cm" }],
      [{ key: "WYSOKOŚĆ NÓŻEK", value: "10 cm" }],
    ]);
    expect(out.filter((k) => k.toLowerCase() === "wysokość nóżek")).toEqual([
      "Wysokość nóżek",
    ]);
  });

  it("dedupe case-insensitive między produktami — pierwsza pisownia z bazy wygrywa", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Stelaż", value: "x" }],
      [{ key: "stelaż", value: "y" }],
    ]);
    expect(out.filter((k) => k.toLowerCase() === "stelaż")).toEqual(["Stelaż"]);
  });

  it("filtruje DEDICATED_FEATURE_KEYS case-insensitive", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Kolor", value: "szary" }, { key: "Waga", value: "80 kg" }],
      [{ key: "MATERIAŁ", value: "welur" }, { key: "Stelaż", value: "buk" }],
    ]);
    expect(out).toContain("Stelaż");
    for (const dedicated of DEDICATED_FEATURE_KEYS) {
      expect(out.map((k) => k.toLowerCase())).not.toContain(dedicated.toLowerCase());
    }
  });

  it("pomija śmieci: nie-tablice, elementy bez key, nie-stringi, puste po trim, >100 zn.", () => {
    const out = collectFeatureKeySuggestions([
      null,
      "tekst",
      42,
      [{ value: "bez klucza" }, { key: 7, value: "x" }, { key: "   ", value: "x" }],
      [{ key: "a".repeat(101), value: "x" }],
      [{ key: "Poprawny", value: "x" }],
    ]);
    expect(out).toContain("Poprawny");
    expect(out).toHaveLength(SEED_FEATURE_KEYS.length + 1);
  });
});
