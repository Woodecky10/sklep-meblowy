import { describe, it, expect } from "vitest";
import {
  GROUP_LABEL_DE,
  CATEGORY_LABEL_DE,
  mapDe,
  VARIANT_OPTION_DE,
  BADGE_OPTIONS,
  BADGE_DE,
} from "@/app/_lib/de-content-maps";

// Slugi obecne w produkcyjnej DB (category_groups / categories) — gdyby ktoś
// usunął wpis z mapy, kategoria renderowałaby się po polsku na /de. Ten test
// pilnuje pełnego pokrycia bieżącego katalogu.
const DB_GROUP_SLUGS = ["salon", "sofy", "inne", "sypialnia", "dostepne-od-reki"];
const DB_CATEGORY_SLUGS = [
  "lozko-kontynentalne",
  "narozniki",
  "sofy",
  "lozka",
  "lozko-tapicerowane",
  "sofa-3-osobowa",
  "materace-piankowe",
  "pufy",
  "naroznik-l",
  "materace-sprezynowe",
  "materace",
  "lozka-dzieciece",
  "fotele",
];

describe("de-content-maps — pokrycie kategorii", () => {
  it("każda grupa z DB ma niemiecką etykietę", () => {
    const missing = DB_GROUP_SLUGS.filter((s) => !GROUP_LABEL_DE[s]?.trim());
    expect(missing).toEqual([]);
  });
  it("każda kategoria z DB ma niemiecką etykietę", () => {
    const missing = DB_CATEGORY_SLUGS.filter((s) => !CATEGORY_LABEL_DE[s]?.trim());
    expect(missing).toEqual([]);
  });
});

describe("badge — zamknięta lista z tłumaczeniem DE", () => {
  it("każda opcja badge z dropdownu ma tłumaczenie DE (brak wycieku)", () => {
    const missing = BADGE_OPTIONS.filter((b) => !BADGE_DE[b]?.trim());
    expect(missing).toEqual([]);
  });
});

describe("mapDe", () => {
  it("zwraca tłumaczenie gdy istnieje", () => {
    expect(mapDe(VARIANT_OPTION_DE, "Kolor")).toBe("Farbe");
  });
  it("zwraca wartość bez zmian gdy brak w mapie (kody/wymiary)", () => {
    expect(mapDe(VARIANT_OPTION_DE, "MANILA 01")).toBe("MANILA 01");
  });
  it("przepuszcza null/undefined", () => {
    expect(mapDe(VARIANT_OPTION_DE, null)).toBeNull();
    expect(mapDe(VARIANT_OPTION_DE, undefined)).toBeUndefined();
  });
});
