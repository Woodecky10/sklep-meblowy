import { describe, it, expect } from "vitest";
import { getDictionary } from "../dictionaries";
import { colorsLabel } from "../fabric-labels";

const pl = getDictionary("pl");
const de = getDictionary("de");

describe("colorsLabel — polska odmiana", () => {
  it("1 → kolor", () => {
    expect(colorsLabel(1, pl)).toBe("kolor");
  });

  it("2-4 → kolory", () => {
    expect(colorsLabel(2, pl)).toBe("kolory");
    expect(colorsLabel(3, pl)).toBe("kolory");
    expect(colorsLabel(4, pl)).toBe("kolory");
  });

  it("5 i wiecej → kolorow", () => {
    expect(colorsLabel(5, pl)).toBe("kolorów");
    expect(colorsLabel(7, pl)).toBe("kolorów");
    expect(colorsLabel(25, pl)).toBe("kolorów");
  });

  it("12-14 → kolorow, mimo koncowki 2-4", () => {
    expect(colorsLabel(12, pl)).toBe("kolorów");
    expect(colorsLabel(13, pl)).toBe("kolorów");
    expect(colorsLabel(14, pl)).toBe("kolorów");
  });

  it("22 → kolory, bo koncowka 2 poza zakresem 12-14", () => {
    expect(colorsLabel(22, pl)).toBe("kolory");
  });

  it("0 → kolorow", () => {
    expect(colorsLabel(0, pl)).toBe("kolorów");
  });
});

describe("DE — brak rozroznienia few/many", () => {
  it("kolory: 1 → Farbe, 2 i 7 → Farben", () => {
    expect(colorsLabel(1, de)).toBe("Farbe");
    expect(colorsLabel(2, de)).toBe("Farben");
    expect(colorsLabel(7, de)).toBe("Farben");
  });
});
