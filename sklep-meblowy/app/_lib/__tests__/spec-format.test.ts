import { describe, it, expect } from "vitest";
import {
  polishYearWord,
  normalizeDeliveryTime,
  normalizeWarranty,
  formatDeliveryTimeDe,
  formatWarrantyDe,
} from "@/app/_lib/spec-format";

describe("polishYearWord — odmiana 'rok/lata/lat'", () => {
  it("1 → rok", () => expect(polishYearWord(1)).toBe("rok"));
  it("2,3,4 → lata", () => {
    expect(polishYearWord(2)).toBe("lata");
    expect(polishYearWord(3)).toBe("lata");
    expect(polishYearWord(4)).toBe("lata");
  });
  it("5–21 → lat", () => {
    expect(polishYearWord(5)).toBe("lat");
    expect(polishYearWord(10)).toBe("lat");
    expect(polishYearWord(11)).toBe("lat");
    expect(polishYearWord(14)).toBe("lat");
    expect(polishYearWord(21)).toBe("lat");
  });
  it("22,23,24 → lata (dziesiątki)", () => {
    expect(polishYearWord(22)).toBe("lata");
    expect(polishYearWord(23)).toBe("lata");
  });
  it("12,13,14 → lat (wyjątek nastek)", () => {
    expect(polishYearWord(12)).toBe("lat");
    expect(polishYearWord(13)).toBe("lat");
  });
});

describe("normalizeDeliveryTime — kanoniczny format PL", () => {
  it("sama liczba → 'N dni roboczych'", () => {
    expect(normalizeDeliveryTime("21")).toBe("21 dni roboczych");
    expect(normalizeDeliveryTime("28")).toBe("28 dni roboczych");
  });
  it("'N dni' → 'N dni roboczych'", () => {
    expect(normalizeDeliveryTime("21 dni")).toBe("21 dni roboczych");
    expect(normalizeDeliveryTime("28 dni")).toBe("28 dni roboczych");
  });
  it("już kanoniczne → bez zmian (idempotencja)", () => {
    expect(normalizeDeliveryTime("21 dni roboczych")).toBe("21 dni roboczych");
    expect(normalizeDeliveryTime("14 dni roboczych")).toBe("14 dni roboczych");
  });
  it("zakres → 'a–b dni roboczych' (en-dash)", () => {
    expect(normalizeDeliveryTime("14-21")).toBe("14–21 dni roboczych");
    expect(normalizeDeliveryTime("14–21 dni roboczych")).toBe("14–21 dni roboczych");
  });
  it("nadmiarowe spacje i wielkość liter", () => {
    expect(normalizeDeliveryTime("  21   Dni  Roboczych ")).toBe("21 dni roboczych");
  });
  it("intencjonalny wolny tekst przechodzi bez zmian", () => {
    expect(normalizeDeliveryTime("od ręki")).toBe("od ręki");
    expect(normalizeDeliveryTime("21 dni kalendarzowych")).toBe("21 dni kalendarzowych");
  });
  it("pusty → pusty (caller robi emptyToNull)", () => {
    expect(normalizeDeliveryTime("")).toBe("");
    expect(normalizeDeliveryTime("   ")).toBe("");
  });
});

describe("normalizeWarranty — kanoniczny format PL z odmianą", () => {
  it("sama liczba → 'N ' + odmiana", () => {
    expect(normalizeWarranty("2")).toBe("2 lata");
    expect(normalizeWarranty("1")).toBe("1 rok");
    expect(normalizeWarranty("5")).toBe("5 lat");
    expect(normalizeWarranty("10")).toBe("10 lat");
    expect(normalizeWarranty("3")).toBe("3 lata");
  });
  it("błędna odmiana '2 lat' → '2 lata'", () => {
    expect(normalizeWarranty("2 lat")).toBe("2 lata");
  });
  it("poprawna odmiana zachowana / przeliczona", () => {
    expect(normalizeWarranty("2 lata")).toBe("2 lata");
    expect(normalizeWarranty("5 lat")).toBe("5 lat");
    expect(normalizeWarranty("5 lata")).toBe("5 lat");
  });
  it("wielkość liter i spacje", () => {
    expect(normalizeWarranty(" 2  LATA ")).toBe("2 lata");
  });
  it("intencjonalny wolny tekst przechodzi bez zmian", () => {
    expect(normalizeWarranty("dożywotnia")).toBe("dożywotnia");
  });
  it("pusty → pusty", () => {
    expect(normalizeWarranty("")).toBe("");
  });
});

describe("formatDeliveryTimeDe — ogólny fallback DE", () => {
  it("'N dni roboczych' → 'N Werktage'", () => {
    expect(formatDeliveryTimeDe("21 dni roboczych")).toBe("21 Werktage");
    expect(formatDeliveryTimeDe("30 dni roboczych")).toBe("30 Werktage");
  });
  it("zakres → 'a–b Werktage'", () => {
    expect(formatDeliveryTimeDe("14–21 dni roboczych")).toBe("14–21 Werktage");
  });
  it("'N dni' → 'N Tage'", () => {
    expect(formatDeliveryTimeDe("21 dni")).toBe("21 Tage");
  });
  it("nieznany format → null (caller robi passthrough)", () => {
    expect(formatDeliveryTimeDe("od ręki")).toBeNull();
  });
});

describe("formatWarrantyDe — ogólny fallback DE", () => {
  it("'N lata/lat' → 'N Jahre'", () => {
    expect(formatWarrantyDe("2 lata")).toBe("2 Jahre");
    expect(formatWarrantyDe("5 lat")).toBe("5 Jahre");
    expect(formatWarrantyDe("6 lat")).toBe("6 Jahre");
  });
  it("'1 rok' → '1 Jahr'", () => {
    expect(formatWarrantyDe("1 rok")).toBe("1 Jahr");
  });
  it("nieznany format → null", () => {
    expect(formatWarrantyDe("dożywotnia")).toBeNull();
  });
});
