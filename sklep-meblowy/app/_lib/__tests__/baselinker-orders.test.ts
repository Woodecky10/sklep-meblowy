import { describe, it, expect } from "vitest";
import {
  buildBlOrderProducts,
  hasCompletedBlPush,
  toCountryCode,
} from "@/app/_lib/baselinker-orders";

// Minimalny element pozycji zamówienia (tyle, ile czyta buildBlOrderProducts).
const item = (over: Record<string, unknown> = {}) => ({
  product: { name: "Sofa", baselinker_id: "10", weight: 50 },
  variant_values: null,
  notes: null,
  price: 1000,
  quantity: 2,
  ...over,
});

describe("buildBlOrderProducts (K1 — rabat do BaseLinkera)", () => {
  it("bez rabatu (promoDiscount=0): same pozycje, brak linii Rabat", () => {
    const r = buildBlOrderProducts([item()], 0);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      name: "Sofa",
      price_brutto: 1000,
      quantity: 2,
      tax_rate: 23,
      product_id: "10",
    });
    expect(r.some((p) => p.name === "Rabat")).toBe(false);
  });

  it("z rabatem > 0: dokleja linię Rabat z ujemną ceną brutto", () => {
    const r = buildBlOrderProducts([item()], 150);
    expect(r).toHaveLength(2);
    expect(r[1]).toEqual({
      name: "Rabat",
      price_brutto: -150,
      tax_rate: 23,
      quantity: 1,
    });
  });

  it("suma price_brutto*qty (z rabatem) = itemsTotal − promo_discount (czyli order.total)", () => {
    const promo = 150;
    const r = buildBlOrderProducts(
      [
        item({ price: 1000, quantity: 2 }),
        item({ product: { name: "Fotel", baselinker_id: "11" }, price: 500, quantity: 1 }),
      ],
      promo
    );
    const sum = r.reduce((s, p) => s + p.price_brutto * (p.quantity ?? 1), 0);
    expect(sum).toBe(1000 * 2 + 500 * 1 - promo); // 2500 − 150 = 2350
  });

  it("promoDiscount <= 0 nie dodaje linii Rabat", () => {
    expect(buildBlOrderProducts([item()], 0).some((p) => p.name === "Rabat")).toBe(false);
    expect(buildBlOrderProducts([item()], -5).some((p) => p.name === "Rabat")).toBe(false);
  });

  it("regresja mapowania: wariant w nazwie + uwagi w attributes", () => {
    const r = buildBlOrderProducts(
      [item({ variant_values: { Kolor: "Beż" }, notes: "bez nóżek" })],
      0
    );
    expect(r[0].name).toContain("Sofa");
    expect(r[0].name).toContain("—"); // wariant doklejony do nazwy
    expect(r[0].attributes).toContain("Uwagi: bez nóżek");
  });
});

describe("toCountryCode — kraj z formularza → ISO-3166 alpha-2 dla BL", () => {
  it("gotowy kod 2-literowy przechodzi (uppercase)", () => {
    expect(toCountryCode("PL")).toBe("PL");
    expect(toCountryCode("de")).toBe("DE");
    expect(toCountryCode(" cz ")).toBe("CZ");
  });
  it("wolny tekst (Polska, Poland, cokolwiek) → PL", () => {
    expect(toCountryCode("Polska")).toBe("PL");
    expect(toCountryCode("Poland")).toBe("PL");
    expect(toCountryCode("Rzeczpospolita")).toBe("PL");
  });
  it("brak wartości → PL", () => {
    expect(toCountryCode(null)).toBe("PL");
    expect(toCountryCode(undefined)).toBe("PL");
    expect(toCountryCode("")).toBe("PL");
  });
});

describe("hasCompletedBlPush — odróżnia prawdziwe BL id od sentinela claimu", () => {
  it("null/undefined → false (push jeszcze nie wykonany)", () => {
    expect(hasCompletedBlPush(null)).toBe(false);
    expect(hasCompletedBlPush(undefined)).toBe(false);
  });
  it("sentinel pending:<ts> → false (push w toku / osierocony)", () => {
    expect(hasCompletedBlPush("pending:1718000000000")).toBe(false);
  });
  it("prawdziwe ID z BL → true", () => {
    expect(hasCompletedBlPush("123456")).toBe(true);
  });
});
