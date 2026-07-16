import { describe, it, expect } from "vitest";
import {
  isHexColor,
  hexToRgb,
  rgbToHex,
  mix,
  lighten,
  darken,
  relativeLuminance,
  contrastRatio,
  ensureContrast,
} from "@/app/_lib/color-utils";

describe("isHexColor", () => {
  it("akceptuje #rrggbb, odrzuca resztę", () => {
    expect(isHexColor("#c9a84c")).toBe(true);
    expect(isHexColor("#C9A84C")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("c9a84c")).toBe(false);
    expect(isHexColor("#c9a84g")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe("hex ↔ rgb", () => {
  it("roundtrip", () => {
    expect(hexToRgb("#1a1a2e")).toEqual({ r: 26, g: 26, b: 46 });
    expect(rgbToHex(26, 26, 46)).toBe("#1a1a2e");
  });
  it("rgbToHex clampuje i zaokrągla", () => {
    expect(rgbToHex(300, -5, 12.6)).toBe("#ff000d");
  });
});

describe("mix / lighten / darken", () => {
  it("środek czerni i bieli to szarość", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("t=0 zwraca pierwszy kolor, t=1 drugi", () => {
    expect(mix("#c9a84c", "#000000", 0)).toBe("#c9a84c");
    expect(mix("#c9a84c", "#000000", 1)).toBe("#000000");
  });
  it("lighten zwiększa luminancję, darken zmniejsza", () => {
    const base = "#c9a84c";
    expect(relativeLuminance(lighten(base, 0.3))).toBeGreaterThan(relativeLuminance(base));
    expect(relativeLuminance(darken(base, 0.3))).toBeLessThan(relativeLuminance(base));
  });
});

describe("relativeLuminance / contrastRatio (WCAG)", () => {
  it("biel=1, czerń=0, kontrast biel/czerń=21", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });
  it("kontrast jest symetryczny", () => {
    expect(contrastRatio("#c9a84c", "#ece4d7")).toBeCloseTo(
      contrastRatio("#ece4d7", "#c9a84c"),
      5
    );
  });
  it("znany problem z audytu: złoto na kremie ~1.84 (za mało)", () => {
    expect(contrastRatio("#c9a84c", "#ece4d7")).toBeLessThan(3);
  });
});

describe("ensureContrast", () => {
  it("kolor już kontrastowy → bez zmian", () => {
    expect(ensureContrast("#1a1a2e", "#ece4d7")).toBe("#1a1a2e");
  });
  it("złoto na jasnym kremie → przyciemnione do >=4.5", () => {
    const fixed = ensureContrast("#c9a84c", "#ece4d7");
    expect(contrastRatio(fixed, "#ece4d7")).toBeGreaterThanOrEqual(4.5);
    expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance("#c9a84c"));
  });
  it("ciemny kolor na ciemnym tle → rozjaśniony do >=4.5", () => {
    const fixed = ensureContrast("#1a1a2e", "#0f0f1a");
    expect(contrastRatio(fixed, "#0f0f1a")).toBeGreaterThanOrEqual(4.5);
  });
});
