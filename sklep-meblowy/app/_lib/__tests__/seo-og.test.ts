import { describe, expect, test } from "vitest";
import { COMPANY } from "@/app/_lib/company";
import { OG_BRAND_IMAGE, baseOpenGraph, ogBrandPalette } from "@/app/_lib/seo-og";
import {
  DEFAULT_THEME_SETTINGS,
  THEME_PRESETS,
  type ThemePresetKey,
} from "@/app/_lib/theme";
import { contrastRatio } from "@/app/_lib/color-utils";

// Tło: Next NADPISUJE całe pole `openGraph` w segmencie, który je eksportuje
// (resolve-metadata.js: `case "openGraph": newResolvedMetadata.openGraph = ...`).
// Strona, która ustawiała samo `openGraph.locale`, gubiła więc og:image i
// og:site_name z layoutu — link wklejony na FB/WhatsApp szedł bez obrazka.
// baseOpenGraph jest jedynym źródłem pełnego bloku OG dla wszystkich stron.
describe("baseOpenGraph", () => {
  test("zawsze niesie siteName i type (bo openGraph jest nadpisywane w całości)", () => {
    const og = baseOpenGraph("pl");
    expect(og.siteName).toBe(COMPANY.brandName);
    expect(og.type).toBe("website");
  });

  test("mapuje locale sklepu na og:locale", () => {
    expect(baseOpenGraph("pl").locale).toBe("pl_PL");
    expect(baseOpenGraph("de").locale).toBe("de_DE");
  });

  test("bez podanych zdjęć używa brandowego OG", () => {
    expect(baseOpenGraph("pl").images).toEqual([OG_BRAND_IMAGE]);
  });

  test("zdjęcie produktu wygrywa nad brandowym", () => {
    const og = baseOpenGraph("pl", { images: ["https://cdn.example/sofa.jpg"] });
    expect(og.images).toEqual([{ url: "https://cdn.example/sofa.jpg" }]);
  });

  test("produkt bez zdjęć degraduje do brandowego OG, nie do braku obrazka", () => {
    expect(baseOpenGraph("pl", { images: [] }).images).toEqual([OG_BRAND_IMAGE]);
    expect(baseOpenGraph("pl", { images: [undefined] }).images).toEqual([
      OG_BRAND_IMAGE,
    ]);
  });

  test("pomija puste wpisy między poprawnymi zdjęciami", () => {
    const og = baseOpenGraph("de", {
      images: [undefined, "https://cdn.example/a.jpg", "", null],
    });
    expect(og.images).toEqual([{ url: "https://cdn.example/a.jpg" }]);
  });
});

describe("OG_BRAND_IMAGE", () => {
  // Sedno bugu promocyjnego: og:image wskazywał /logo.svg, a Facebook,
  // LinkedIn i WhatsApp nie renderują SVG — udostępnienie szło bez obrazka.
  test("nie jest SVG-iem", () => {
    expect(OG_BRAND_IMAGE.url).not.toMatch(/\.svg$/i);
  });

  test("ma wymiary 1200x630 wymagane przez FB/Twitter", () => {
    expect(OG_BRAND_IMAGE.width).toBe(1200);
    expect(OG_BRAND_IMAGE.height).toBe(630);
  });

  test("ma alt (czytniki ekranu na podglądach linków)", () => {
    expect(OG_BRAND_IMAGE.alt.length).toBeGreaterThan(0);
  });
});

// Obrazek /og musi iść za motywem z /admin/wyglad — maile już tak robią
// (app/_lib/mail/branding.ts). Zaszyte hexy rozjechałyby się z brandem po
// zmianie palety przez Olę.
describe("ogBrandPalette", () => {
  test("domyślnie daje kolory presetu klasycznego", () => {
    const p = ogBrandPalette(DEFAULT_THEME_SETTINGS);
    expect(p.background).toBe(THEME_PRESETS.klasyczny.light.navy);
    expect(p.accent).toBe(THEME_PRESETS.klasyczny.light.gold);
    expect(p.text).toBe(THEME_PRESETS.klasyczny.light.cream);
  });

  test("idzie za wybranym presetem, nie za zaszytymi kolorami", () => {
    const p = ogBrandPalette({ ...DEFAULT_THEME_SETTINGS, preset: "grafit-miedz" });
    expect(p.background).toBe(THEME_PRESETS["grafit-miedz"].light.navy);
    expect(p.accent).toBe(THEME_PRESETS["grafit-miedz"].light.gold);
    expect(p.text).toBe(THEME_PRESETS["grafit-miedz"].light.cream);
  });

  test("respektuje nadpisania kolorów z /admin/wyglad", () => {
    const p = ogBrandPalette({
      ...DEFAULT_THEME_SETTINGS,
      overrides: { navy: "#102030", gold: "#ffcc00", cream: "#fffaf0" },
    });
    expect(p.background).toBe("#102030");
    expect(p.accent).toBe("#ffcc00");
    expect(p.text).toBe("#fffaf0");
  });

  test("w KAŻDYM presecie tekst jest czytelny na tle obrazka", () => {
    for (const preset of Object.keys(THEME_PRESETS) as ThemePresetKey[]) {
      const p = ogBrandPalette({ ...DEFAULT_THEME_SETTINGS, preset });
      expect(
        contrastRatio(p.text, p.background),
        `preset ${preset}: tekst na tle`
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.accent, p.background),
        `preset ${preset}: akcent na tle`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
