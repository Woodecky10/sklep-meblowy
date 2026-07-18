import { describe, it, expect } from "vitest";
import { parseTopBarSettings, normalizePromoLink } from "@/app/_lib/topbar-settings";

describe("parseTopBarSettings — FormData → wiersz store_settings", () => {
  it("pełne wejście", () => {
    expect(
      parseTopBarSettings({
        contact_phone: "  +48 111 222 333 ",
        contact_email: "kontakt@x.pl",
        promo_enabled: "1",
        promo_text: "  -20%  ",
        promo_text_de: "-20% DE",
        promo_link: "/sklep",
        promo_color: "red",
      })
    ).toEqual({
      contact_phone: "+48 111 222 333",
      contact_email: "kontakt@x.pl",
      promo_enabled: true,
      promo_text: "-20%",
      promo_text_de: "-20% DE",
      promo_link: "/sklep",
      promo_color: "red",
    });
  });
  it("puste stringi → null; brak checkboxa → enabled=false", () => {
    expect(
      parseTopBarSettings({
        contact_phone: "",
        contact_email: "   ",
        promo_enabled: null,
        promo_text: "",
        promo_text_de: "",
        promo_link: "",
        promo_color: "gold",
      })
    ).toEqual({
      contact_phone: null,
      contact_email: null,
      promo_enabled: false,
      promo_text: null,
      promo_text_de: null,
      promo_link: null,
      promo_color: "gold",
    });
  });
  it("kolor spoza listy → gold", () => {
    expect(parseTopBarSettings({ promo_color: "pink" }).promo_color).toBe("gold");
    expect(parseTopBarSettings({}).promo_color).toBe("gold");
  });
  it("promo_enabled='1' → true, inne → false", () => {
    expect(parseTopBarSettings({ promo_enabled: "1" }).promo_enabled).toBe(true);
    expect(parseTopBarSettings({ promo_enabled: "on" }).promo_enabled).toBe(false);
  });
});

describe("normalizePromoLink", () => {
  it("null/pusty → null", () => {
    expect(normalizePromoLink(null)).toBeNull();
    expect(normalizePromoLink("   ")).toBeNull();
  });
  it("wewnętrzna ścieżka /... bez zmian", () => {
    expect(normalizePromoLink("/sklep")).toBe("/sklep");
  });
  it("pełny http(s) bez zmian", () => {
    expect(normalizePromoLink("https://x.pl/a")).toBe("https://x.pl/a");
    expect(normalizePromoLink("http://x.pl")).toBe("http://x.pl");
  });
  it("goła domena → dopina https://", () => {
    expect(normalizePromoLink("mollien.pl/wyprzedaz")).toBe("https://mollien.pl/wyprzedaz");
    expect(normalizePromoLink("www.x.pl")).toBe("https://www.x.pl");
  });
  it("protocol-relative // → https:", () => {
    expect(normalizePromoLink("//evil.example.com")).toBe("https://evil.example.com");
  });
  it("niebezpieczne/inne schematy → null", () => {
    expect(normalizePromoLink("javascript:alert(1)")).toBeNull();
    expect(normalizePromoLink("data:text/html,x")).toBeNull();
    expect(normalizePromoLink("mailto:x@y.pl")).toBeNull();
  });
});
