import { describe, it, expect } from "vitest";
import {
  normalizePromo,
  promoKey,
  PROMO_COLOR_CLASSES,
  PROMO_COLORS,
} from "@/app/_lib/promo-banner";

describe("normalizePromo", () => {
  it("pełny wiersz → znormalizowane pola", () => {
    expect(
      normalizePromo({
        promo_enabled: true,
        promo_text: "-20% do niedzieli",
        promo_text_de: "-20% bis Sonntag",
        promo_link: "/sklep",
        promo_color: "red",
      })
    ).toEqual({
      enabled: true,
      text: "-20% do niedzieli",
      text_de: "-20% bis Sonntag",
      link: "/sklep",
      color: "red",
    });
  });
  it("enabled=true ale pusty tekst → enabled=false", () => {
    expect(normalizePromo({ promo_enabled: true, promo_text: "  " }).enabled).toBe(false);
  });
  it("kolor spoza listy → gold", () => {
    expect(normalizePromo({ promo_enabled: true, promo_text: "x", promo_color: "pink" }).color).toBe("gold");
    expect(normalizePromo({ promo_enabled: true, promo_text: "x" }).color).toBe("gold");
  });
  it("puste/whitespace stringi → null; przycinanie", () => {
    const r = normalizePromo({ promo_enabled: true, promo_text: "  Hej  ", promo_text_de: "", promo_link: "   " });
    expect(r.text).toBe("Hej");
    expect(r.text_de).toBeNull();
    expect(r.link).toBeNull();
  });
  it("null/śmieciowe wejście → wyłączony baner", () => {
    expect(normalizePromo(null)).toEqual({ enabled: false, text: null, text_de: null, link: null, color: "gold" });
    expect(normalizePromo("x").enabled).toBe(false);
  });
});

describe("promoKey", () => {
  it("deterministyczny i różny dla różnych tekstów", () => {
    expect(promoKey("A")).toBe(promoKey("A"));
    expect(promoKey("A")).not.toBe(promoKey("B"));
  });
  it("null i pusty → stabilny klucz", () => {
    expect(promoKey(null)).toBe(promoKey(""));
    expect(typeof promoKey(null)).toBe("string");
  });
});

describe("PROMO_COLOR_CLASSES", () => {
  it("każdy dozwolony kolor mapuje na niepustą klasę", () => {
    for (const c of PROMO_COLORS) {
      expect(PROMO_COLOR_CLASSES[c]).toBeTruthy();
    }
  });
});
