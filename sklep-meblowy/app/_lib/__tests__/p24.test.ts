import { describe, it, expect } from "vitest";
import { p24Sign } from "../p24";

describe("p24Sign", () => {
  it("liczy SHA-384 z JSON-a pól w narzuconej kolejności (register)", () => {
    const sign = p24Sign({
      sessionId: "order-abc-123",
      merchantId: 12345,
      amount: 199900,
      currency: "PLN",
      crc: "a1b2c3d4e5f60718",
    });
    expect(sign).toBe(
      "118d99ab8caecc6f58db02b76296257f5ccf0dbda1dbe079fcc8fc594898b2bf8591569aac6b40caf7744da33e3e57ae"
    );
  });

  it("zmiana kolejności pól zmienia podpis", () => {
    const a = p24Sign({ amount: 100, currency: "PLN" });
    const b = p24Sign({ currency: "PLN", amount: 100 });
    expect(a).not.toBe(b);
  });
});
