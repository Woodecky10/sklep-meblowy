import { describe, it, expect } from "vitest";
import { getDictionary } from "../dictionaries";
import { colorsLabel, fabricsLabel } from "../fabric-labels";

const pl = getDictionary("pl");
const de = getDictionary("de");

describe("fabricsLabel — polska odmiana", () => {
  it("1 → tkanina", () => {
    expect(fabricsLabel(1, pl)).toBe("tkanina");
  });

  it("2-4 → tkaniny", () => {
    expect(fabricsLabel(2, pl)).toBe("tkaniny");
    expect(fabricsLabel(3, pl)).toBe("tkaniny");
    expect(fabricsLabel(4, pl)).toBe("tkaniny");
  });

  it("5 i wiecej → tkanin", () => {
    expect(fabricsLabel(5, pl)).toBe("tkanin");
    expect(fabricsLabel(11, pl)).toBe("tkanin");
    expect(fabricsLabel(25, pl)).toBe("tkanin");
  });

  it("12-14 → tkanin, mimo koncowki 2-4", () => {
    expect(fabricsLabel(12, pl)).toBe("tkanin");
    expect(fabricsLabel(13, pl)).toBe("tkanin");
    expect(fabricsLabel(14, pl)).toBe("tkanin");
  });

  it("22 → tkaniny, bo koncowka 2 poza zakresem 12-14", () => {
    expect(fabricsLabel(22, pl)).toBe("tkaniny");
  });

  it("0 → tkanin", () => {
    expect(fabricsLabel(0, pl)).toBe("tkanin");
  });
});

describe("colorsLabel — polska odmiana", () => {
  it("1 → kolor", () => {
    expect(colorsLabel(1, pl)).toBe("kolor");
  });

  it("2-4 → kolory", () => {
    expect(colorsLabel(3, pl)).toBe("kolory");
  });

  it("5 i wiecej → kolorow", () => {
    expect(colorsLabel(7, pl)).toBe("kolorów");
  });

  it("13 → kolorow, nie kolory", () => {
    expect(colorsLabel(13, pl)).toBe("kolorów");
  });
});

describe("DE — brak rozroznienia few/many", () => {
  it("tkaniny: 1 → Stoff, 2 i 7 → Stoffe", () => {
    expect(fabricsLabel(1, de)).toBe("Stoff");
    expect(fabricsLabel(2, de)).toBe("Stoffe");
    expect(fabricsLabel(7, de)).toBe("Stoffe");
  });

  it("kolory: 1 → Farbe, 2 i 7 → Farben", () => {
    expect(colorsLabel(1, de)).toBe("Farbe");
    expect(colorsLabel(2, de)).toBe("Farben");
    expect(colorsLabel(7, de)).toBe("Farben");
  });
});
