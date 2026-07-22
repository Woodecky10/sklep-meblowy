import { describe, it, expect } from "vitest";
import { parseFeatureRows, MAX_FEATURES } from "../product-features";

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
