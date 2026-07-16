import { describe, it, expect } from "vitest";
import {
  THEME_PRESETS,
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
  resolveThemeTokens,
  buildThemeCss,
  type ThemePresetKey,
} from "@/app/_lib/theme";
import { contrastRatio, relativeLuminance } from "@/app/_lib/color-utils";

describe("THEME_PRESETS — jakość palet (WCAG)", () => {
  const keys = Object.keys(THEME_PRESETS) as ThemePresetKey[];

  it("są dokładnie 4 presety, klasyczny = obecne wartości strony", () => {
    expect(keys).toHaveLength(4);
    const k = THEME_PRESETS.klasyczny;
    expect(k.light.gold).toBe("#c9a84c");
    expect(k.light.bg).toBe("#ece4d7");
    expect(k.light.goldText).toBe("#74612b");
    expect(k.dark.bg).toBe("#0f0f1a");
    expect(k.dark.cardBg).toBe("#1a1a2e");
  });

  it.each(keys)("%s: goldText czytelny na tle (>=4.5) w light i dark", (key) => {
    const p = THEME_PRESETS[key];
    expect(contrastRatio(p.light.goldText, p.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.light.goldText, p.light.cardBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.dark.goldText, p.dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(keys)("%s: tekst główny bardzo czytelny (>=7) w light i dark", (key) => {
    const p = THEME_PRESETS[key];
    expect(contrastRatio(p.light.fg, p.light.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.dark.fg, p.dark.bg)).toBeGreaterThanOrEqual(7);
  });

  it.each(keys)("%s: dark bg jest ciemne, light bg jasne", (key) => {
    const p = THEME_PRESETS[key];
    expect(relativeLuminance(p.light.bg)).toBeGreaterThan(0.5);
    expect(relativeLuminance(p.dark.bg)).toBeLessThan(0.1);
  });
});

describe("normalizeThemeSettings", () => {
  it("null / nieznane wartości → defaulty", () => {
    expect(normalizeThemeSettings(null)).toEqual(DEFAULT_THEME_SETTINGS);
    expect(
      normalizeThemeSettings({ theme_preset: "neon", theme_overrides: "zepsute", font_pair: "comic-sans" })
    ).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("odfiltrowuje złe hexy i nieznane klucze z overrides", () => {
    const s = normalizeThemeSettings({
      theme_preset: "bez-braz",
      theme_overrides: { gold: "#b87333", navy: "nie-hex", tlo: "#ffffff" },
      font_pair: "montserrat",
    });
    expect(s.preset).toBe("bez-braz");
    expect(s.overrides).toEqual({ gold: "#b87333" });
    expect(s.fontPair).toBe("montserrat");
  });
});

describe("resolveThemeTokens — nadpisania z pochodnymi", () => {
  it("bez overrides → tokeny presetu 1:1", () => {
    const { light, dark } = resolveThemeTokens(DEFAULT_THEME_SETTINGS);
    expect(light).toEqual(THEME_PRESETS.klasyczny.light);
    expect(dark).toEqual(THEME_PRESETS.klasyczny.dark);
  });

  it("override gold → goldLight/goldText pochodne, kontrast trzymany", () => {
    const { light, dark } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { gold: "#b87333" },
    });
    expect(light.gold).toBe("#b87333");
    expect(light.goldLight).not.toBe(THEME_PRESETS.klasyczny.light.goldLight);
    expect(contrastRatio(light.goldText, light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.goldText, dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("override cream → bg/cardBg/border pochodne (cardBg jaśniejszy, border ciemniejszy)", () => {
    const { light } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { cream: "#e8ded2" },
    });
    expect(light.bg).toBe("#e8ded2");
    expect(relativeLuminance(light.cardBg)).toBeGreaterThan(relativeLuminance(light.bg));
    expect(relativeLuminance(light.border)).toBeLessThan(relativeLuminance(light.bg));
  });

  it("override navy → fg/navyLight w light i cardBg/bg w dark pochodne", () => {
    const { light, dark } = resolveThemeTokens({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { navy: "#22304a" },
    });
    expect(light.navy).toBe("#22304a");
    expect(light.fg).toBe("#22304a");
    expect(dark.cardBg).toBe("#22304a");
    expect(relativeLuminance(dark.bg)).toBeLessThan(relativeLuminance(dark.cardBg));
  });

  // Test kontrastu palet (wyżej) sprawdza ZAPISANE literały goldText, ale na
  // produkcję trafia wynik resolveThemeTokens (goldText zawsze przeliczany).
  // Tu asertujemy wartość FAKTYCZNIE emitowaną dla każdego presetu bez nadpisań.
  it.each(Object.keys(THEME_PRESETS) as ThemePresetKey[])(
    "%s: goldText po resolveThemeTokens (wartość emitowana) czytelny (>=4.5) w light i dark",
    (key) => {
      const { light, dark } = resolveThemeTokens({ ...DEFAULT_THEME_SETTINGS, preset: key });
      expect(contrastRatio(light.goldText, light.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.goldText, light.cardBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.goldText, dark.bg)).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe("buildThemeCss", () => {
  it("emituje :root:root i :root:root.dark z tokenami i fontami", () => {
    const css = buildThemeCss(DEFAULT_THEME_SETTINGS);
    expect(css).toContain(":root:root{");
    expect(css).toContain(":root:root.dark{");
    expect(css).toContain("--color-gold:#c9a84c");
    expect(css).toContain("--font-sans-active:var(--font-inter)");
    expect(css).toContain("--font-display-active:var(--font-playfair)");
  });

  it("para montserrat ustawia oba fonty na montserrat", () => {
    const css = buildThemeCss({ ...DEFAULT_THEME_SETTINGS, fontPair: "montserrat" });
    expect(css).toContain("--font-sans-active:var(--font-montserrat)");
    expect(css).toContain("--font-display-active:var(--font-montserrat)");
  });
});
