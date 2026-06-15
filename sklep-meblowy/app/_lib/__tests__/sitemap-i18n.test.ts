import { describe, it, expect } from "vitest";
import { alternatesFor, sitemapAlternates } from "@/app/_lib/sitemap-i18n";

describe("sitemap-i18n — alternatesFor (relative paths dla generateMetadata)", () => {
  it("hasDe=true → pl + de + x-default (de z prefiksem /de)", () => {
    expect(alternatesFor("/produkt/abc", { hasDe: true })).toEqual({
      languages: {
        pl: "/produkt/abc",
        de: "/de/produkt/abc",
        "x-default": "/produkt/abc",
      },
    });
  });

  it("hasDe=false → pl + x-default, BEZ de", () => {
    expect(alternatesFor("/produkt/abc", { hasDe: false })).toEqual({
      languages: {
        pl: "/produkt/abc",
        "x-default": "/produkt/abc",
      },
    });
  });

  it("ścieżka '/' → de = '/de'", () => {
    expect(alternatesFor("/", { hasDe: true })).toEqual({
      languages: {
        pl: "/",
        de: "/de",
        "x-default": "/",
      },
    });
  });

  it("x-default zawsze wskazuje na PL URL", () => {
    const a = alternatesFor("/sklep", { hasDe: true });
    expect(a.languages["x-default"]).toBe("/sklep");
    expect(a.languages.pl).toBe("/sklep");
  });
});

describe("sitemap-i18n — sitemapAlternates (absolutne URL-e z BASE dla MetadataRoute.Sitemap)", () => {
  const BASE = "https://mollien.pl";

  it("hasDe=true → absolutne pl + de + x-default", () => {
    expect(sitemapAlternates("/produkt/abc", { hasDe: true }, BASE)).toEqual({
      languages: {
        pl: `${BASE}/produkt/abc`,
        de: `${BASE}/de/produkt/abc`,
        "x-default": `${BASE}/produkt/abc`,
      },
    });
  });

  it("hasDe=false → absolutne pl + x-default, BEZ de", () => {
    expect(sitemapAlternates("/produkt/abc", { hasDe: false }, BASE)).toEqual({
      languages: {
        pl: `${BASE}/produkt/abc`,
        "x-default": `${BASE}/produkt/abc`,
      },
    });
  });

  it("'/' → absolutne de = BASE + '/de'", () => {
    expect(sitemapAlternates("/", { hasDe: true }, BASE)).toEqual({
      languages: {
        pl: `${BASE}/`,
        de: `${BASE}/de`,
        "x-default": `${BASE}/`,
      },
    });
  });
});
