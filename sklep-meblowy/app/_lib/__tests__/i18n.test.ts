import { describe, it, expect } from "vitest";
import { stripLocale, localizePath, pickLocalized, isLocale } from "@/app/_lib/i18n";

describe("i18n helpery", () => {
  it("isLocale", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
  it("stripLocale — /de prefix", () => {
    expect(stripLocale("/de/sklep")).toEqual({ locale: "de", pathname: "/sklep" });
    expect(stripLocale("/de")).toEqual({ locale: "de", pathname: "/" });
    expect(stripLocale("/sklep")).toEqual({ locale: "pl", pathname: "/sklep" });
    expect(stripLocale("/")).toEqual({ locale: "pl", pathname: "/" });
    expect(stripLocale("/depilacja")).toEqual({ locale: "pl", pathname: "/depilacja" });
  });
  it("localizePath", () => {
    expect(localizePath("/sklep", "de")).toBe("/de/sklep");
    expect(localizePath("/", "de")).toBe("/de");
    expect(localizePath("/sklep", "pl")).toBe("/sklep");
  });
  it("pickLocalized — DE z fallbackiem PL", () => {
    expect(pickLocalized("Sofa", "Couch", "de")).toBe("Couch");
    expect(pickLocalized("Sofa", null, "de")).toBe("Sofa");
    expect(pickLocalized("Sofa", "", "de")).toBe("Sofa");
    expect(pickLocalized("Sofa", "Couch", "pl")).toBe("Sofa");
  });
});
