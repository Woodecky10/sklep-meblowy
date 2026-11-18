import { describe, it, expect } from "vitest";
import { shouldAwaitPayment, PAYMENT_RECHECK_DELAYS_MS } from "../order-events";

describe("shouldAwaitPayment", () => {
  it("czeka tylko na płatność online, która jest jeszcze w toku", () => {
    expect(shouldAwaitPayment("pending", "online")).toBe(true);
  });

  it("nie czeka przy pobraniu — tam nie ma na co", () => {
    expect(shouldAwaitPayment("pending", "cod")).toBe(false);
  });

  it("nie czeka, gdy status już się rozstrzygnął", () => {
    for (const status of ["paid", "processing", "shipped", "delivered", "cancelled"] as const) {
      expect(shouldAwaitPayment(status, "online")).toBe(false);
    }
  });
});

describe("PAYMENT_RECHECK_DELAYS_MS", () => {
  it("pierwsze sprawdzenie w kilka sekund, całość kończy się po ok. 2 minutach", () => {
    expect(PAYMENT_RECHECK_DELAYS_MS[0]).toBeLessThanOrEqual(3000);
    const total = PAYMENT_RECHECK_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(90_000);
    expect(total).toBeLessThanOrEqual(180_000);
    expect(PAYMENT_RECHECK_DELAYS_MS.length).toBeLessThanOrEqual(12);
  });
});
