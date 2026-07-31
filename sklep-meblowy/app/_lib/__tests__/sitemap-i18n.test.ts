import { describe, it, expect } from "vitest";
import { alternatesFor, buildAlternates, sitemapAlternates } from "@/app/_lib/sitemap-i18n";
import { DE_ENABLED } from "@/app/_lib/i18n";

// UWAGA na podział ról:
// - `buildAlternates` to czysty kształt mapy hreflang — kontrakt „jak ma
//   wyglądać po odmrożeniu DE". Nie patrzy na DE_ENABLED.
// - `alternatesFor` / `sitemapAlternates` to wejścia używane produkcyjnie —
//   przy zamrożonym DE (DE_ENABLED=false) NIE MOGĄ wypuścić alternaty `de`,
//   nawet gdy wywołujący poda hasDe:true.

describe("sitemap-i18n — buildAlternates (czysty kształt, kontrakt po odmrożeniu)", () => {
  it("hasDe=true → pl + de + x-default (de z prefiksem /de)", () => {
    expect(buildAlternates("/produkt/abc", { hasDe: true })).toEqual({
      languages: {
        pl: "/produkt/abc",
        de: "/de/produkt/abc",
        "x-default": "/produkt/abc",
      },
    });
  });

  it("hasDe=false → pl + x-default, BEZ de", () => {
    expect(buildAlternates("/produkt/abc", { hasDe: false })).toEqual({
      languages: {
        pl: "/produkt/abc",
        "x-default": "/produkt/abc",
      },
    });
  });

  it("ścieżka '/' → de = '/de'", () => {
    expect(buildAlternates("/", { hasDe: true })).toEqual({
      languages: {
        pl: "/",
        de: "/de",
        "x-default": "/",
      },
    });
  });

  it("x-default zawsze wskazuje na PL URL", () => {
    const a = buildAlternates("/sklep", { hasDe: true });
    expect(a.languages["x-default"]).toBe("/sklep");
    expect(a.languages.pl).toBe("/sklep");
  });
});

describe("sitemap-i18n — alternatesFor przy zamrożonym DE", () => {
  it("flaga jest wyłączona", () => {
    expect(DE_ENABLED).toBe(false);
  });

  it("hasDe=true NIE wypuszcza alternaty de", () => {
    expect(alternatesFor("/produkt/abc", { hasDe: true })).toEqual({
      languages: {
        pl: "/produkt/abc",
        "x-default": "/produkt/abc",
      },
    });
  });

  it("hasDe=false też nie", () => {
    expect(alternatesFor("/produkt/abc", { hasDe: false }).languages).not.toHaveProperty("de");
  });

  it("x-default i pl zostają nietknięte", () => {
    const a = alternatesFor("/sklep", { hasDe: true });
    expect(a.languages.pl).toBe("/sklep");
    expect(a.languages["x-default"]).toBe("/sklep");
  });
});

describe("sitemap-i18n — sitemapAlternates (absolutne URL-e z BASE dla MetadataRoute.Sitemap)", () => {
  const BASE = "https://mollien.pl";

  it("prefiksuje BASE-em i przy zamrożonym DE nie dodaje de", () => {
    expect(sitemapAlternates("/produkt/abc", { hasDe: true }, BASE)).toEqual({
      languages: {
        pl: `${BASE}/produkt/abc`,
        "x-default": `${BASE}/produkt/abc`,
      },
    });
  });

  it("'/' → absolutny pl = BASE + '/'", () => {
    expect(sitemapAlternates("/", { hasDe: true }, BASE).languages.pl).toBe(`${BASE}/`);
  });
});
