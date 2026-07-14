import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  RESERVED_SLUGS,
  PAGE_SLUG_RE,
  slugifyTitle,
  validatePageSlug,
  localizePageMeta,
  pageHasDe,
  canViewPage,
  type PageRow,
} from "@/app/_lib/pages";

const page = (over: Partial<PageRow>): PageRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  slug: "pielegnacja-mebli",
  title: "Pielęgnacja mebli",
  title_de: null,
  seo_description: null,
  seo_description_de: null,
  published: true,
  updated_at: "2026-07-14T00:00:00Z",
  ...over,
});

describe("slugifyTitle", () => {
  it("zdejmuje polskie znaki i robi kebab-case", () => {
    expect(slugifyTitle("Pielęgnacja mebli")).toBe("pielegnacja-mebli");
    expect(slugifyTitle("  Łóżka & Sofy!  ")).toBe("lozka-sofy");
  });
  it("tytuł bez znaków alfanumerycznych daje pusty slug", () => {
    expect(slugifyTitle("***")).toBe("");
  });
  it("obcina do 80 znaków bez wiszącego myślnika", () => {
    const title = "a".repeat(79) + " " + "b".repeat(30);
    const slug = slugifyTitle(title);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug).toBe("a".repeat(79));
  });
});

describe("validatePageSlug", () => {
  it("pusty slug odrzucony z polskim komunikatem", () => {
    const r = validatePageSlug("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Adres");
  });
  it("zły format odrzucony (wielkie litery, spacje, podkreślenia, skrajne myślniki)", () => {
    for (const bad of ["Duze-Litery", "ze spacja", "pod_kreslenie", "-od-myslnika", "do-myslnika-", "po--dwojnym"]) {
      expect(validatePageSlug(bad).ok).toBe(false);
    }
  });
  it("zarezerwowane slugi tras sklepu odrzucone", () => {
    for (const reserved of ["sklep", "admin", "de", "o-nas", "produkt"]) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
      expect(validatePageSlug(reserved).ok).toBe(false);
    }
  });
  it("za długi slug odrzucony (max 80)", () => {
    expect(validatePageSlug("a".repeat(81)).ok).toBe(false);
    expect(validatePageSlug("a".repeat(80)).ok).toBe(true);
  });
  it("poprawny slug przechodzi", () => {
    expect(validatePageSlug("pielegnacja-mebli-2")).toEqual({ ok: true });
    expect(PAGE_SLUG_RE.test("pielegnacja-mebli-2")).toBe(true);
  });
});

describe("localizePageMeta", () => {
  const row = page({
    title_de: "Möbelpflege",
    seo_description: "Opis PL",
    seo_description_de: "",
  });
  it("PL bierze pola PL", () => {
    expect(localizePageMeta(row, "pl")).toEqual({
      title: "Pielęgnacja mebli",
      seoDescription: "Opis PL",
    });
  });
  it("DE per pole z fallbackiem PL (pusty string DE = brak)", () => {
    expect(localizePageMeta(row, "de")).toEqual({
      title: "Möbelpflege",
      seoDescription: "Opis PL",
    });
  });
  it("brak opisu → null", () => {
    expect(localizePageMeta(page({}), "pl").seoDescription).toBeNull();
  });
});

describe("pageHasDe", () => {
  it("niepusty title_de → true; pusty/whitespace/null → false", () => {
    expect(pageHasDe(page({ title_de: "Über uns" }))).toBe(true);
    expect(pageHasDe(page({ title_de: "   " }))).toBe(false);
    expect(pageHasDe(page({ title_de: null }))).toBe(false);
  });
});

describe("canViewPage", () => {
  it("opublikowaną widzi każdy, szkic tylko admin", () => {
    expect(canViewPage(true, false)).toBe(true);
    expect(canViewPage(true, true)).toBe(true);
    expect(canViewPage(false, true)).toBe(true);
    expect(canViewPage(false, false)).toBe(false);
  });
});

describe("RESERVED_SLUGS — drift-guard tras top-level", () => {
  it("każdy statyczny segment app/ (w tym grupy) jest zarezerwowany", () => {
    const appDir = path.join(process.cwd(), "app");
    const topLevel = readdirSync(appDir).filter((name) => {
      if (name.startsWith("_") || name.startsWith("[")) return false;
      return statSync(path.join(appDir, name)).isDirectory();
    });
    const segments: string[] = [];
    for (const name of topLevel) {
      if (name.startsWith("(") && name.endsWith(")")) {
        // Grupa tras (np. (legal)) nie zmienia URL — liczą się jej dzieci.
        for (const child of readdirSync(path.join(appDir, name))) {
          if (statSync(path.join(appDir, name, child)).isDirectory()) {
            segments.push(child);
          }
        }
      } else {
        segments.push(name);
      }
    }
    for (const seg of segments) {
      expect(
        RESERVED_SLUGS.has(seg),
        `Segment "app/${seg}" nie jest w RESERVED_SLUGS (pages.ts) — nowa trasa statyczna przykryłaby podstronę o tym slugu`
      ).toBe(true);
    }
  });
});
