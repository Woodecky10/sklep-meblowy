import { describe, it, expect } from "vitest";
import { isValidGaId, gaConsentSignals } from "@/app/_lib/analytics";

describe("isValidGaId", () => {
  it("przyjmuje realny identyfikator GA4", () => {
    expect(isValidGaId("G-GL6DBHYQYT")).toBe(true);
  });

  it("odrzuca pusty, kontener GTM i stary Universal Analytics", () => {
    expect(isValidGaId("")).toBe(false);
    expect(isValidGaId("GTM-ABC1234")).toBe(false);
    expect(isValidGaId("UA-12345-1")).toBe(false);
  });

  it("odrzuca wartości z białymi znakami i małymi literami", () => {
    // Typowa literówka przy wklejaniu z maila — ma wyłączyć GA, nie wpuścić
    // bezsensownego id do adresu skryptu.
    expect(isValidGaId(" G-GL6DBHYQYT")).toBe(false);
    expect(isValidGaId("G-GL6DBHYQYT ")).toBe(false);
    expect(isValidGaId("g-gl6dbhyqyt")).toBe(false);
  });
});

describe("gaConsentSignals", () => {
  it("zgoda analityczna NIE włącza sygnałów reklamowych", () => {
    expect(gaConsentSignals({ analytics: true, marketing: false })).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });

  it("zgoda marketingowa włącza całą trójkę reklamową", () => {
    expect(gaConsentSignals({ analytics: true, marketing: true })).toEqual({
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  });

  it("odmowa obu = wszystko denied", () => {
    expect(gaConsentSignals({ analytics: false, marketing: false })).toEqual({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });
});
