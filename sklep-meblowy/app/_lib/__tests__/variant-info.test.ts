import { describe, it, expect } from "vitest";
import {
  variantInfoKey,
  buildVariantInfoMap,
  variantInfoText,
  normalizeVariantInfoInput,
} from "@/app/_lib/variant-info";

describe("variantInfoKey", () => {
  it("łączy opcję i wartość stabilnym separatorem (NUL)", () => {
    expect(variantInfoKey("Tkanina", "Baloo 2071")).toBe("Tkanina\u0000Baloo 2071");
  });
  it("różne pary → różne klucze; te same → ten sam", () => {
    expect(variantInfoKey("Kolor nóżek", "Złote")).not.toBe(variantInfoKey("Rama", "Złote"));
    expect(variantInfoKey("A", "B")).toBe(variantInfoKey("A", "B"));
  });
});

describe("buildVariantInfoMap", () => {
  it("mapuje po kluczu, przycina, pomija puste info", () => {
    const map = buildVariantInfoMap([
      { option_name: "Tkanina", value: "Baloo 2071", info: "  Welur, łatwy w czyszczeniu ", info_de: " Velours " },
      { option_name: "Kolor nóżek", value: "Złote", info: "Stal malowana", info_de: null },
      { option_name: "X", value: "Y", info: "   ", info_de: "nieważne" },
      { option_name: "Z", value: "W", info: null, info_de: "nieważne" },
    ]);
    expect(map[variantInfoKey("Tkanina", "Baloo 2071")]).toEqual({ info: "Welur, łatwy w czyszczeniu", info_de: "Velours" });
    expect(map[variantInfoKey("Kolor nóżek", "Złote")]).toEqual({ info: "Stal malowana", info_de: null });
    expect(map[variantInfoKey("X", "Y")]).toBeUndefined();
    expect(map[variantInfoKey("Z", "W")]).toBeUndefined();
  });
  it("puste info_de → null", () => {
    const map = buildVariantInfoMap([{ option_name: "A", value: "B", info: "x", info_de: "  " }]);
    expect(map[variantInfoKey("A", "B")]).toEqual({ info: "x", info_de: null });
  });
});

describe("variantInfoText", () => {
  const entry = { info: "PL tekst", info_de: "DE Text" };
  it("pl → info", () => expect(variantInfoText(entry, "pl")).toBe("PL tekst"));
  it("de → info_de", () => expect(variantInfoText(entry, "de")).toBe("DE Text"));
  it("de bez info_de → fallback PL", () =>
    expect(variantInfoText({ info: "PL", info_de: null }, "de")).toBe("PL"));
  it("brak wpisu → null", () => expect(variantInfoText(undefined, "pl")).toBeNull());
});

describe("normalizeVariantInfoInput", () => {
  it("upsert niepustych (trim + limit 200), delete pustych", () => {
    const long = "a".repeat(250);
    const res = normalizeVariantInfoInput([
      { option_name: "T", value: "1", info: "  ok ", info_de: " de " },
      { option_name: "T", value: "2", info: "", info_de: "" },
      { option_name: "T", value: "3", info: long, info_de: "" },
    ]);
    expect(res.upserts).toEqual([
      { option_name: "T", value: "1", info: "ok", info_de: "de" },
      { option_name: "T", value: "3", info: "a".repeat(200), info_de: null },
    ]);
    expect(res.deletes).toEqual([{ option_name: "T", value: "2" }]);
  });
});
