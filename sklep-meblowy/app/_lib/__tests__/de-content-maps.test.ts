import { describe, it, expect } from "vitest";
import {
  GROUP_LABEL_DE,
  CATEGORY_LABEL_DE,
  mapDe,
  VARIANT_OPTION_DE,
  VARIANT_VALUE_DE,
  CONSTRUCTION_DE,
  DELIVERY_TIME_DE,
  WARRANTY_DE,
  FEATURE_KEY_DE,
  FEATURE_VALUE_DE,
  HOME_TEXT_DE,
  BADGE_OPTIONS,
  BADGE_DE,
  PROMO_ERROR_DE,
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

// ============================================================
// #4 — siatka drift: wykrywanie niezmapowanych treści PL→DE
// ============================================================
// KONTRAKT UTRZYMANIOWY: pola produktu construction/delivery_time/warranty,
// cechy (key/value) i warianty (option/value) NIE mają kolumn _de — polegają
// WYŁĄCZNIE na mapach poniżej. Dodając produkt/wariant z nową tłumaczalną
// wartością PL → dopisz ją do mapy w de-content-maps.ts ORAZ do snapshotu tutaj.
// Brak → na /de przeciekłby polski. Kody/wymiary/nazwy własne (MANILA 01,
// 180x200, SISI) celowo NIE wchodzą — przechodzą bez tłumaczenia (mapDe zwraca je
// bez zmian). Snapshot łapie też usunięcie wpisu z mapy (regresja → czerwony test).

// Integralność: żadne tłumaczenie w żadnej mapie nie jest puste/whitespace.
const ALL_MAPS: Record<string, Record<string, string>> = {
  GROUP_LABEL_DE,
  CATEGORY_LABEL_DE,
  CONSTRUCTION_DE,
  DELIVERY_TIME_DE,
  WARRANTY_DE,
  FEATURE_KEY_DE,
  FEATURE_VALUE_DE,
  VARIANT_OPTION_DE,
  VARIANT_VALUE_DE,
  HOME_TEXT_DE,
  BADGE_DE,
  PROMO_ERROR_DE,
};

describe("de-content-maps — integralność map", () => {
  for (const [name, map] of Object.entries(ALL_MAPS)) {
    it(`${name}: każda wartość to niepusty string`, () => {
      const broken = Object.entries(map)
        .filter(([, v]) => typeof v !== "string" || v.trim() === "")
        .map(([k]) => k);
      expect(broken).toEqual([]);
    });
  }
});

// Wartości obecne w produkcyjnym katalogu (DB products/variants). Niezależny
// snapshot — gdyby ktoś usunął wpis z mapy, test złapie nieprzetłumaczoną wartość.
const DB_CONSTRUCTIONS = [
  "Lite drewno dębowe, niska bryła, bez zagłówka",
  "Rama drewniana, tkanina z domieszką poliestru, sprężyny falowe",
  "Rama z litego dębu, sprężyny bonell, wypełnienie pianką HR i puchem",
  "Stelaż drewniany, sprężyny bonell, wypełnienie pianka HR, obicie welurowe",
  "Tapicerka z kaszmiru, rama z giętej sklejki, podstawa obrotowa",
];
const DB_DELIVERY_TIMES = [
  "14 dni roboczych",
  "21 dni",
  "21 dni roboczych",
  "28 dni",
  "28 dni roboczych",
];
const DB_WARRANTIES = ["10 lat", "2 lat", "2 lata", "3 lata", "5 lat"];
const DB_FEATURE_KEYS = [
  "Głębokość mebla",
  "Kolekcja",
  "Kolor",
  "Kolor obicia",
  "Model",
  "Powierzchnia spania",
  "Powłoka",
  "Rodzaj Łóżka",
  "Styl",
  "System Boxspring",
  "Szerokość mebla",
  "Tkanina",
  "Waga produktu z opakowaniem jednostkowym",
  "Wysokość mebla",
  "Wysokość zagłowia",
];
const DB_FEATURE_VALUES = [
  "tapicerowane",
  "Sztruks",
  "Podwójne",
  "Kontynentalne",
  "Tak",
  "Nie",
  "Brązowy",
];
const DB_VARIANT_OPTIONS = [
  "Kolor",
  "POWIERZCHNIA SPANIA",
  "ROZMIAR",
  "STELAŻ",
  "STRONA",
  "STRONA MEBLA",
  "Strona",
  "TKANINA",
  "Wariant",
];
const DB_VARIANT_VALUES = [
  "Beżowy",
  "Ciemnoszary",
  "DREWNIANY",
  "Granatowy",
  "Kremowy",
  "LEWOSTRONNY",
  "Lewa",
  "METALOWY",
  "PRAWOSTRONNY",
  "Prawa",
  "Szary",
  "Terrakota",
  "biały",
  "brązowy",
  "jasnobrązowy",
  "jasnoszary",
];

describe("de-content-maps — pokrycie pól produktu (brak kolumn _de)", () => {
  const cases: Array<[string, string[], Record<string, string>]> = [
    ["construction", DB_CONSTRUCTIONS, CONSTRUCTION_DE],
    ["delivery_time", DB_DELIVERY_TIMES, DELIVERY_TIME_DE],
    ["warranty", DB_WARRANTIES, WARRANTY_DE],
    ["feature key", DB_FEATURE_KEYS, FEATURE_KEY_DE],
    ["feature value", DB_FEATURE_VALUES, FEATURE_VALUE_DE],
    ["variant option", DB_VARIANT_OPTIONS, VARIANT_OPTION_DE],
    ["variant value", DB_VARIANT_VALUES, VARIANT_VALUE_DE],
  ];
  for (const [name, snapshot, map] of cases) {
    it(`${name}: każda wartość z katalogu ma tłumaczenie DE`, () => {
      const missing = snapshot.filter((v) => !map[v]?.trim());
      expect(missing).toEqual([]);
    });
  }
});

// Komunikaty błędów kodu rabatowego — źródło ZAMKNIĘTE w kodzie (promo.ts).
// Lista = dokładnie to, co validatePromoCode może zwrócić; każdy musi mieć DE.
const PROMO_ERROR_MESSAGES = [
  "Wpisz kod rabatowy",
  "Koszyk jest pusty",
  "Błąd weryfikacji kodu",
  "Nieprawidłowy kod rabatowy",
  "Kod jest nieaktywny",
  "Kod jeszcze nie obowiązuje",
  "Kod wygasł",
  "Limit użyć tego kodu został wyczerpany",
];

describe("de-content-maps — pokrycie błędów promo (zamknięty zbiór z promo.ts)", () => {
  it("każdy komunikat błędu promo ma tłumaczenie DE", () => {
    const missing = PROMO_ERROR_MESSAGES.filter((m) => !PROMO_ERROR_DE[m]?.trim());
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
