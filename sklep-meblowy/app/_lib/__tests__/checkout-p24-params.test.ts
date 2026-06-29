import { describe, it, expect } from "vitest";
import { buildP24RegisterParams } from "../../api/checkout/route";

describe("buildP24RegisterParams", () => {
  it("PL: PLN, język/kraj PL, kwota w groszach, urlReturn z order id", () => {
    const p = buildP24RegisterParams({
      orderId: "order-1", finalTotal: 1999.0, isDe: false,
      email: "k@e.pl", origin: "https://shop",
    });
    expect(p.currency).toBe("PLN");
    expect(p.amount).toBe(199900);
    expect(p.language).toBe("pl");
    expect(p.country).toBe("PL");
    expect(p.sessionId).toBe("order-1");
    expect(p.urlReturn).toBe("https://shop/checkout/success?order=order-1");
    expect(p.urlStatus).toBe("https://shop/api/p24/status");
  });

  it("DE: EUR, język/kraj DE, urlReturn z prefiksem /de", () => {
    const p = buildP24RegisterParams({
      orderId: "order-2", finalTotal: 499.5, isDe: true,
      email: "k@e.de", origin: "https://shop",
    });
    expect(p.currency).toBe("EUR");
    expect(p.amount).toBe(49950);
    expect(p.language).toBe("de");
    expect(p.country).toBe("DE");
    expect(p.urlReturn).toBe("https://shop/de/checkout/success?order=order-2");
  });
});
