import { describe, it, expect } from "vitest";
import {
  DEFAULT_HOME_SECTIONS,
  mergeHomeSections,
  localizeHomeSection,
  isHomeSectionKey,
  type HomeSectionRow,
} from "@/app/_lib/home-sections";
import { pl } from "@/app/_lib/dictionaries/pl";
import type { PlShape } from "@/app/_lib/dictionaries/pl";
import { de } from "@/app/_lib/dictionaries/de";

const deFull = de as PlShape;

describe("DEFAULT_HOME_SECTIONS", () => {
  it("zawiera 5 sekcji w dzisiejszej kolejności strony", () => {
    expect(DEFAULT_HOME_SECTIONS.map((s) => s.key)).toEqual([
      "hero",
      "tiles",
      "featured",
      "trust_bar",
      "collections",
    ]);
  });

  it("nagłówki domyślne = wartości ze słowników (jedno źródło prawdy)", () => {
    const tiles = DEFAULT_HOME_SECTIONS.find((s) => s.key === "tiles")!;
    expect(tiles.heading).toBe(pl.home.collectionsHeading);
    expect(tiles.heading_de).toBe(deFull.home.collectionsHeading);
    expect(tiles.subheading).toBe(pl.home.collectionsEyebrow);
    const trust = DEFAULT_HOME_SECTIONS.find((s) => s.key === "trust_bar")!;
    expect(trust.heading).toBe(pl.trustBar.heading);
    expect(trust.subheading_de).toBe(deFull.trustBar.eyebrow);
  });

  it("hero nie ma nagłówków (slajdy mają własne teksty)", () => {
    const hero = DEFAULT_HOME_SECTIONS.find((s) => s.key === "hero")!;
    expect(hero.heading).toBeNull();
    expect(hero.subheading).toBeNull();
  });
});

describe("mergeHomeSections", () => {
  it("pusta/null lista → defaulty", () => {
    expect(mergeHomeSections([])).toEqual(DEFAULT_HOME_SECTIONS);
    expect(mergeHomeSections(null)).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it("wiersz z bazy nadpisuje default (visible, heading), sortuje po sort_order", () => {
    const rows: HomeSectionRow[] = [
      {
        key: "collections",
        sort_order: 0,
        visible: false,
        heading: "Serie",
        heading_de: null,
        subheading: null,
        subheading_de: null,
      },
    ];
    const merged = mergeHomeSections(rows);
    // collections z sort_order=0 wskakuje na początek
    expect(merged[0].key).toBe("collections");
    expect(merged[0].visible).toBe(false);
    expect(merged[0].heading).toBe("Serie");
    // pozostałe sekcje obecne z defaultów
    expect(merged).toHaveLength(5);
    expect(merged.map((s) => s.key)).toContain("hero");
  });

  it("ignoruje nieznane klucze z bazy", () => {
    const rows = [
      { key: "newsletter", sort_order: 0, visible: true, heading: null, heading_de: null, subheading: null, subheading_de: null },
    ] as unknown as HomeSectionRow[];
    expect(mergeHomeSections(rows)).toEqual(DEFAULT_HOME_SECTIONS);
  });
});

describe("localizeHomeSection", () => {
  const row: HomeSectionRow = {
    key: "tiles",
    sort_order: 1,
    visible: true,
    heading: "Znajdź swój styl",
    heading_de: "Finden Sie Ihren Stil",
    subheading: "Kolekcje",
    subheading_de: "",
  };

  it("pl → kolumny bazowe", () => {
    const l = localizeHomeSection(row, "pl");
    expect(l.heading).toBe("Znajdź swój styl");
    expect(l.subheading).toBe("Kolekcje");
  });

  it("de → kolumna _de, pusty string _de → fallback PL", () => {
    const l = localizeHomeSection(row, "de");
    expect(l.heading).toBe("Finden Sie Ihren Stil");
    expect(l.subheading).toBe("Kolekcje"); // "" → fallback
  });
});

describe("isHomeSectionKey", () => {
  it("rozpoznaje znane klucze i odrzuca nieznane", () => {
    expect(isHomeSectionKey("hero")).toBe(true);
    expect(isHomeSectionKey("trust_bar")).toBe(true);
    expect(isHomeSectionKey("newsletter")).toBe(false);
    expect(isHomeSectionKey("")).toBe(false);
  });
});
