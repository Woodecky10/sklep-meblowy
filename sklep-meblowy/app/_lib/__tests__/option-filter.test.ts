import { describe, it, expect } from "vitest";
import {
  normalizeOptionName,
  displayOptionName,
  optionParamSlug,
  OPTION_PARAM_PREFIX,
  EXCLUDED_OPTION_SLUGS,
} from "@/app/_lib/option-filter";

describe("normalizeOptionName", () => {
  it("trimuje, zbija spacje i lowercase'uje", () => {
    expect(normalizeOptionName("  POWIERZCHNIA   SPANIA ")).toBe(
      "powierzchnia spania"
    );
  });
  it("ROZMIAR i Rozmiar dają ten sam klucz", () => {
    expect(normalizeOptionName("ROZMIAR")).toBe(normalizeOptionName("Rozmiar"));
  });
});

describe("displayOptionName", () => {
  it("pierwsza litera wielka, reszta mała", () => {
    expect(displayOptionName("ROZMIAR")).toBe("Rozmiar");
    expect(displayOptionName("powierzchnia spania")).toBe("Powierzchnia spania");
  });
  it("pusty string zostaje pusty", () => {
    expect(displayOptionName("   ")).toBe("");
  });
});

describe("optionParamSlug", () => {
  it("zdejmuje polskie znaki i robi kebab-case", () => {
    expect(optionParamSlug("STELAŻ")).toBe("stelaz");
    expect(optionParamSlug("POWIERZCHNIA SPANIA")).toBe("powierzchnia-spania");
    expect(optionParamSlug("Rozmiar")).toBe("rozmiar");
  });
  it("znaki spoza a-z0-9 zamienia na myślnik bez wiodących/końcowych", () => {
    expect(optionParamSlug(" Kolor / Odcień ")).toBe("kolor-odcien");
  });
  it("nazwa z samych symboli daje pusty slug", () => {
    expect(optionParamSlug("***")).toBe("");
  });
});

describe("stałe", () => {
  it("prefiks parametru i wykluczenie tkaniny", () => {
    expect(OPTION_PARAM_PREFIX).toBe("opcja_");
    expect(EXCLUDED_OPTION_SLUGS.has("tkanina")).toBe(true);
  });
});
