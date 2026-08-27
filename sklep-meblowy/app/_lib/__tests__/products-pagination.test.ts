import { describe, it, expect } from "vitest";
import {
  clampPage,
  clampLimit,
  jestStronaZaZakresem,
  PRODUCTS_PAGE_LIMIT_MAX,
} from "@/app/_lib/products";

describe("clampPage — odporność na NaN/0/ujemne (audyt MED: 500/DoS na /sklep)", () => {
  it("poprawna strona zostaje", () => {
    expect(clampPage(1)).toBe(1);
    expect(clampPage(5)).toBe(5);
  });
  it("NaN (?strona=abc) → 1", () => {
    expect(clampPage(Number("abc"))).toBe(1);
  });
  it("0 i ujemne → 1", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
  });
  it("ułamek → floor", () => {
    expect(clampPage(2.7)).toBe(2);
  });
  it("undefined → 1", () => {
    expect(clampPage(undefined)).toBe(1);
  });
});

describe("clampLimit — bezpieczny limit", () => {
  it("poprawny limit zostaje", () => {
    expect(clampLimit(12)).toBe(12);
    expect(clampLimit(24)).toBe(24);
  });
  it("NaN/0/ujemne → fallback 12", () => {
    expect(clampLimit(Number("x"))).toBe(12);
    expect(clampLimit(0)).toBe(12);
    expect(clampLimit(-3)).toBe(12);
  });
  it("przekroczony max → clamp do MAX", () => {
    expect(clampLimit(9999)).toBe(PRODUCTS_PAGE_LIMIT_MAX);
  });
  it("undefined → fallback 12", () => {
    expect(clampLimit(undefined)).toBe(12);
  });
});

// Regresja z logów Vercela (21-26.08.2026, 4×): `/sklep?strona=9` przy 83
// produktach i 12 na stronę dawało offset 96 i PostgREST odrzucał zakres, a
// cała /sklep zwracała 500. clampPage tego nie łapie — pilnuje tylko dolnej
// granicy.
describe("jestStronaZaZakresem", () => {
  it("rozpoznaje PGRST103", () => {
    expect(
      jestStronaZaZakresem({
        code: "PGRST103",
        message: "Requested range not satisfiable",
        details: "An offset of 96 was requested, but there are only 83 rows.",
      })
    ).toBe(true);
  });

  it("nie bierze innego błędu bazy za koniec zakresu", () => {
    expect(jestStronaZaZakresem({ code: "PGRST116", message: "cokolwiek" })).toBe(false);
  });

  it("znosi śmieci zamiast błędu", () => {
    expect(jestStronaZaZakresem(null)).toBe(false);
    expect(jestStronaZaZakresem(undefined)).toBe(false);
    expect(jestStronaZaZakresem("PGRST103")).toBe(false);
    expect(jestStronaZaZakresem(new Error("boom"))).toBe(false);
  });

  // clampPage zostaje odpowiedzialny wyłącznie za dolną granicę — ten test
  // pilnuje, że naprawa górnej granicy go nie zmieniła.
  it("clampPage nadal broni dolnej granicy", () => {
    expect(clampPage(Number("abc"))).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage(9)).toBe(9);
  });
});
