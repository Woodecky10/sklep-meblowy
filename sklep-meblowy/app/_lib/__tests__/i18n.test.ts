import { describe, it, expect } from "vitest";
import {
  stripLocale,
  localizePath,
  pickLocalized,
  isLocale,
  localizeHref,
  frozenDeRedirectPath,
  DE_ENABLED,
} from "@/app/_lib/i18n";

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
  it("localizeHref — internal path, de prefixes", () => {
    expect(localizeHref("/sklep", "de")).toBe("/de/sklep");
    expect(localizeHref("/", "de")).toBe("/de");
    expect(localizeHref("/sklep", "pl")).toBe("/sklep");
  });
  it("localizeHref — zachowuje query string", () => {
    expect(localizeHref("/sklep?strona=2", "de")).toBe("/de/sklep?strona=2");
    expect(localizeHref("/sklep?strona=2", "pl")).toBe("/sklep?strona=2");
  });
  it("localizeHref — nie podwaja istniejącego prefiksu /de", () => {
    expect(localizeHref("/de/sklep", "de")).toBe("/de/sklep");
    expect(localizeHref("/de/sklep", "pl")).toBe("/sklep");
  });
  it("localizeHref — przepuszcza external/hash/mailto bez zmian", () => {
    expect(localizeHref("https://x.com", "de")).toBe("https://x.com");
    expect(localizeHref("#sekcja", "de")).toBe("#sekcja");
    expect(localizeHref("mailto:a@b.pl", "de")).toBe("mailto:a@b.pl");
  });
});

// Zamrożenie wersji niemieckiej (DE_ENABLED w i18n.ts). Testy są napisane pod
// AKTUALNĄ wartość flagi, żeby po odmrożeniu wywaliły się i wymusiły przegląd
// tych oczekiwań, zamiast cicho przepuścić stary stan.
describe("frozenDeRedirectPath — zamrożenie DE", () => {
  it("flaga jest wyłączona (sprzedaż tylko PL, brak niemieckiego NIP)", () => {
    expect(DE_ENABLED).toBe(false);
  });

  it("/de/... → odpowiednik PL z zachowaną ścieżką", () => {
    expect(frozenDeRedirectPath("/de/sklep")).toBe("/sklep");
    expect(frozenDeRedirectPath("/de/produkt/abc")).toBe("/produkt/abc");
    expect(frozenDeRedirectPath("/de/tkaniny/nova")).toBe("/tkaniny/nova");
  });

  it("samo /de → korzeń", () => {
    expect(frozenDeRedirectPath("/de")).toBe("/");
  });

  it("ścieżki PL nie są przekierowywane", () => {
    expect(frozenDeRedirectPath("/sklep")).toBeNull();
    expect(frozenDeRedirectPath("/")).toBeNull();
  });

  it("NIE łapie ścieżek zaczynających się na 'de' bez granicy segmentu", () => {
    // Regresja: naiwne startsWith('/de') przekierowałoby '/depilacja' → '/pilacja'.
    expect(frozenDeRedirectPath("/depilacja")).toBeNull();
    expect(frozenDeRedirectPath("/dekoracje")).toBeNull();
  });
});
