import { describe, it, expect } from "vitest";
import { deliveryView } from "@/app/_lib/delivery";

describe("deliveryView", () => {
  it("carrier + tracking obecne → oba zwrócone, hasInfo=true", () => {
    expect(
      deliveryView({ carrier: "Transport Kowalski", tracking_number: "TK-2026-001" })
    ).toEqual({
      carrier: "Transport Kowalski",
      trackingNumber: "TK-2026-001",
      hasInfo: true,
    });
  });

  it("tylko carrier → trackingNumber=null, hasInfo=true", () => {
    expect(deliveryView({ carrier: "DPD", tracking_number: null })).toEqual({
      carrier: "DPD",
      trackingNumber: null,
      hasInfo: true,
    });
  });

  it("tylko tracking → carrier=null, hasInfo=true", () => {
    expect(deliveryView({ carrier: null, tracking_number: "123ABC" })).toEqual({
      carrier: null,
      trackingNumber: "123ABC",
      hasInfo: true,
    });
  });

  it("oba null → hasInfo=false", () => {
    expect(deliveryView({ carrier: null, tracking_number: null })).toEqual({
      carrier: null,
      trackingNumber: null,
      hasInfo: false,
    });
  });

  it("puste / whitespace stringi traktowane jak brak", () => {
    expect(deliveryView({ carrier: "   ", tracking_number: "" })).toEqual({
      carrier: null,
      trackingNumber: null,
      hasInfo: false,
    });
  });

  it("przycina białe znaki wokół wartości", () => {
    expect(deliveryView({ carrier: "  DPD  ", tracking_number: " 42 " })).toEqual({
      carrier: "DPD",
      trackingNumber: "42",
      hasInfo: true,
    });
  });
});
