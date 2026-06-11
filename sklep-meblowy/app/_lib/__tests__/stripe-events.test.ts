import { describe, it, expect } from "vitest";
import { shouldSettleOrder } from "@/app/_lib/stripe-events";

describe("shouldSettleOrder — kiedy zamówienie jest FAKTYCZNIE opłacone", () => {
  it("completed + 'paid' → true (płatność synchroniczna, np. karta)", () => {
    expect(shouldSettleOrder("checkout.session.completed", "paid")).toBe(true);
  });

  it("completed + 'unpaid' → false (P24/async — completed przychodzi przed wpłatą)", () => {
    expect(shouldSettleOrder("checkout.session.completed", "unpaid")).toBe(false);
  });

  it("completed + 'no_payment_required'/'processing' → false", () => {
    expect(shouldSettleOrder("checkout.session.completed", "processing")).toBe(false);
    expect(shouldSettleOrder("checkout.session.completed", "no_payment_required")).toBe(false);
  });

  it("completed + brak payment_status → false (konserwatywnie)", () => {
    expect(shouldSettleOrder("checkout.session.completed", null)).toBe(false);
    expect(shouldSettleOrder("checkout.session.completed", undefined)).toBe(false);
  });

  it("async_payment_succeeded → true (autorytatywne potwierdzenie async)", () => {
    expect(shouldSettleOrder("checkout.session.async_payment_succeeded", "paid")).toBe(true);
    expect(shouldSettleOrder("checkout.session.async_payment_succeeded", "unpaid")).toBe(true);
  });

  it("async_payment_failed → false", () => {
    expect(shouldSettleOrder("checkout.session.async_payment_failed", "unpaid")).toBe(false);
  });

  it("nieobsługiwany event → false", () => {
    expect(shouldSettleOrder("payment_intent.succeeded", "paid")).toBe(false);
  });
});
