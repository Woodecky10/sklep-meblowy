import { describe, it, expect } from "vitest";
import { siteText, type SiteTextsMap } from "@/app/_lib/site-texts";

describe("siteText", () => {
  const map: SiteTextsMap = {
    topbar_slogan: { value: "Polski producent", value_de: "Polnischer Hersteller" },
    footer_tagline: { value: "Tagline PL", value_de: "  " },
  };

  it("pl → value", () => {
    expect(siteText(map, "topbar_slogan", "pl", "fallback")).toBe("Polski producent");
  });

  it("de → value_de", () => {
    expect(siteText(map, "topbar_slogan", "de", "fallback")).toBe("Polnischer Hersteller");
  });

  it("de z pustym value_de → fallback na value PL", () => {
    expect(siteText(map, "footer_tagline", "de", "fallback")).toBe("Tagline PL");
  });

  it("brak klucza w mapie → fallback (słownik)", () => {
    expect(siteText({}, "topbar_slogan", "pl", "ze słownika")).toBe("ze słownika");
  });

  it("pusty value → fallback", () => {
    expect(
      siteText({ topbar_slogan: { value: " ", value_de: null } }, "topbar_slogan", "pl", "f")
    ).toBe("f");
  });
});
