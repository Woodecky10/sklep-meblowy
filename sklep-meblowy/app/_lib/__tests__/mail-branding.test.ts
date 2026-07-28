import { describe, it, expect } from "vitest";
import { brandingFromRaw } from "../mail/branding";
import { mailLocale } from "../mail/locale";
import { THEME_PRESETS } from "../theme";

describe("brandingFromRaw", () => {
  it("bez wiersza store_settings daje paletę 'klasyczny' i nie rzuca", () => {
    const b = brandingFromRaw(null);
    expect(b.colors.fg).toBe(THEME_PRESETS.klasyczny.light.fg);
    expect(b.fonts.display).toContain("Playfair");
  });

  it("nadpisanie navy wygrywa nad presetem (produkcja ma czarny)", () => {
    const b = brandingFromRaw({
      theme_preset: "klasyczny",
      theme_overrides: { navy: "#000000" },
      font_pair: "inter-playfair",
    });
    expect(b.colors.fg).toBe("#000000");
    expect(b.colors.navy).toBe("#000000");
  });

  it("preset inny niż domyślny zmienia paletę", () => {
    const b = brandingFromRaw({
      theme_preset: "grafit-miedz",
      theme_overrides: {},
      font_pair: "montserrat",
    });
    expect(b.colors.gold).toBe(THEME_PRESETS["grafit-miedz"].light.gold);
    expect(b.fonts.display).toContain("Montserrat");
  });

  it("nieznana para fontów spada na domyślny stack", () => {
    const b = brandingFromRaw({
      theme_preset: "klasyczny",
      theme_overrides: {},
      font_pair: "nie-istnieje",
    });
    expect(b.fonts.display).toContain("Playfair");
  });

  it("stack fontów ma fallback dostępny wszędzie — webfontów w mailu nie ma", () => {
    const b = brandingFromRaw(null);
    expect(b.fonts.display).toContain("Georgia");
    expect(b.fonts.sans).toContain("Arial");
  });

  it("kolory są literalnymi hexami, nie zmiennymi CSS", () => {
    const b = brandingFromRaw(null);
    for (const value of Object.values(b.colors)) {
      expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(b.fonts.sans).not.toContain("var(");
    expect(b.fonts.display).not.toContain("var(");
  });
});

describe("mailLocale", () => {
  it("eur => de (EUR występuje tylko na /de)", () => {
    expect(mailLocale("eur")).toBe("de");
  });
  it("pln => pl", () => {
    expect(mailLocale("pln")).toBe("pl");
  });
  it("wielkie litery też rozpoznaje", () => {
    expect(mailLocale("EUR")).toBe("de");
  });
  it("null / undefined / śmieci => pl (fallback)", () => {
    expect(mailLocale(null)).toBe("pl");
    expect(mailLocale(undefined)).toBe("pl");
    expect(mailLocale("usd")).toBe("pl");
  });
});
