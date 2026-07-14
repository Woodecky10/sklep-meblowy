import { describe, it, expect } from "vitest";
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
