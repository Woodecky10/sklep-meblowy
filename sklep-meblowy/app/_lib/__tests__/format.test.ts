import { describe, it, expect } from "vitest";
import { formatPrice } from "@/app/_lib/format";

// UWAGA: dokładny separator tysięcy zależy od danych ICU w danym runtime
// (full-ICU vs small-ICU). Dlatego asercje są tolerancyjne — sprawdzamy
// konwencje wizualne (separator dziesiętny, sufiks " zł"), a nie exact match
// grupowania tysięcy, które różni się Node-vs-przeglądarka.

describe("formatPrice", () => {
  it("zawsze dokleja sufiks ' zł' (PLN, niezależnie od locale)", () => {
    expect(formatPrice(1299, "pl")).toMatch(/ zł$/);
    expect(formatPrice(1299, "de")).toMatch(/ zł$/);
  });

  it("de-DE używa kropki jako separatora tysięcy", () => {
    // 1.299 — kropka grupująca to cecha niemieckiego formatu
    expect(formatPrice(1299, "de")).toBe("1.299 zł");
  });

  it("oba locale używają przecinka jako separatora dziesiętnego", () => {
    expect(formatPrice(1299.5, "pl")).toMatch(/1.?299,5 zł/);
    expect(formatPrice(1299.5, "de")).toBe("1.299,5 zł");
  });

  it("liczby całkowite bez części dziesiętnej (toLocaleString nie dokleja groszy)", () => {
    expect(formatPrice(1299, "pl")).not.toContain(",");
    expect(formatPrice(1299, "de")).not.toContain(",");
  });

  it("zero formatuje się poprawnie", () => {
    expect(formatPrice(0, "pl")).toBe("0 zł");
    expect(formatPrice(0, "de")).toBe("0 zł");
  });
});
