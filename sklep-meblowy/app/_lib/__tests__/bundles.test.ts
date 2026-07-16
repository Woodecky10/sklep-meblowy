// app/_lib/__tests__/bundles.test.ts
import { describe, it, expect } from "vitest";
import {
  computeBundleDiscount,
  bundleUnitKey,
  groupBundleUnits,
  verifyBundleGroup,
  eligiblePromoBase,
  minBundleSavings,
  groupCartBundles,
} from "../bundles";

describe("computeBundleDiscount", () => {
  it("percent: liczy od bazy i zaokrągla do groszy", () => {
    expect(computeBundleDiscount(5200, 1, "percent", 10)).toBe(520);
    expect(computeBundleDiscount(999.99, 1, "percent", 7)).toBe(70);
  });
  it("amount: kwota jest per sztuka zestawu (mnożona przez qty)", () => {
    expect(computeBundleDiscount(5200, 1, "amount", 500)).toBe(500);
    expect(computeBundleDiscount(10400, 2, "amount", 500)).toBe(1000);
  });
  it("percent: baza już zawiera qty — NIE mnoży drugi raz", () => {
    // 2 szt. zestawu o bazie jednostkowej 5200 → base=10400, 10% = 1040
    expect(computeBundleDiscount(10400, 2, "percent", 10)).toBe(1040);
  });
  it("clamp: rabat nigdy nie przekracza bazy ani nie schodzi poniżej 0", () => {
    expect(computeBundleDiscount(300, 1, "amount", 500)).toBe(300);
    expect(computeBundleDiscount(300, 1, "amount", -50)).toBe(0);
    expect(computeBundleDiscount(0, 1, "percent", 10)).toBe(0);
    expect(computeBundleDiscount(NaN, 1, "percent", 10)).toBe(0);
  });
});

describe("bundleUnitKey", () => {
  it("identyczna konfiguracja daje ten sam klucz niezależnie od kolejności", () => {
    const a = bundleUnitKey("b1", [
      { productId: "p1", variantValues: { Tkanina: "Sawana 21", Strona: "Lewa" } },
      { productId: "p2", variantValues: { Tkanina: "Riviera 16" } },
    ]);
    const b = bundleUnitKey("b1", [
      { productId: "p2", variantValues: { Tkanina: "Riviera 16" } },
      { productId: "p1", variantValues: { Strona: "Lewa", Tkanina: "Sawana 21" } },
    ]);
    expect(a).toBe(b);
  });
  it("inna tkanina / inny zestaw = inny klucz", () => {
    const base = bundleUnitKey("b1", [{ productId: "p1", variantValues: { Tkanina: "Sawana 21" } }]);
    expect(bundleUnitKey("b1", [{ productId: "p1", variantValues: { Tkanina: "Sawana 05" } }])).not.toBe(base);
    expect(bundleUnitKey("b2", [{ productId: "p1", variantValues: { Tkanina: "Sawana 21" } }])).not.toBe(base);
  });
  it("brak wariantów działa", () => {
    expect(bundleUnitKey("b1", [{ productId: "p1" }, { productId: "p2" }])).toContain("b1");
  });
});

describe("groupBundleUnits", () => {
  it("grupuje po unitKey, pomija pozycje solo", () => {
    const groups = groupBundleUnits([
      { productId: "p1", quantity: 1, subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } },
      { productId: "solo", quantity: 2, subtotal: 400, bundle: null },
      { productId: "p2", quantity: 1, subtotal: 2200, bundle: { id: "b1", unitKey: "k1" } },
      { productId: "p1", quantity: 1, subtotal: 3100, bundle: { id: "b1", unitKey: "k2" } },
      { productId: "p2", quantity: 1, subtotal: 2200, bundle: { id: "b1", unitKey: "k2" } },
    ]);
    expect(groups).toHaveLength(2);
    const g1 = groups.find((g) => g.unitKey === "k1")!;
    expect(g1.bundleId).toBe("b1");
    expect(g1.items.map((i) => i.productId).sort()).toEqual(["p1", "p2"]);
  });
});

describe("verifyBundleGroup", () => {
  const group = {
    bundleId: "b1",
    unitKey: "k1",
    items: [
      { productId: "p1", quantity: 1, subtotal: 3000 },
      { productId: "p2", quantity: 1, subtotal: 2200 },
    ],
  };
  it("ok gdy skład i ilości się zgadzają", () => {
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p2", "p1"] })
    ).toEqual({ ok: true });
  });
  it("odrzuca: brak zestawu / nieaktywny / zły skład / nierówne ilości / < 2 składniki", () => {
    expect(verifyBundleGroup(group, null)).toEqual({ ok: false, reason: "not_found" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: false, productIds: ["p1", "p2"] })
    ).toEqual({ ok: false, reason: "inactive" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p1", "p3"] })
    ).toEqual({ ok: false, reason: "wrong_products" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p1", "p2", "p3"] })
    ).toEqual({ ok: false, reason: "wrong_products" });
    expect(
      verifyBundleGroup(
        { ...group, items: [group.items[0], { ...group.items[1], quantity: 2 }] },
        { id: "b1", is_active: true, productIds: ["p1", "p2"] }
      )
    ).toEqual({ ok: false, reason: "unequal_quantities" });
    expect(
      verifyBundleGroup(
        { ...group, items: [group.items[0]] },
        { id: "b1", is_active: true, productIds: ["p1"] }
      )
    ).toEqual({ ok: false, reason: "wrong_products" });
  });
});

describe("eligiblePromoBase", () => {
  it("sumuje TYLKO pozycje spoza zestawów", () => {
    expect(
      eligiblePromoBase([
        { subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } },
        { subtotal: 400 },
        { subtotal: 150, bundle: null },
      ])
    ).toBe(550);
  });
  it("koszyk tylko-zestawy → 0", () => {
    expect(eligiblePromoBase([{ subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } }])).toBe(0);
  });
});

describe("minBundleSavings", () => {
  it("percent liczy od sumy cen bazowych, amount zwraca kwotę", () => {
    expect(minBundleSavings([3000, 2200], "percent", 10)).toBe(520);
    expect(minBundleSavings([3000, 2200], "amount", 500)).toBe(500);
  });
});

describe("groupCartBundles", () => {
  const mk = (id: string, price: number, qty: number, unitKey?: string) => ({
    id,
    price,
    quantity: qty,
    bundle: unitKey
      ? { id: "b1", name: "Zestaw Loft", unitKey, discountType: "percent" as const, discountValue: 10 }
      : undefined,
  });
  it("zwraca grupy z bazą, qty i rabatem", () => {
    const groups = groupCartBundles([mk("p1", 3000, 2, "k1"), mk("p2", 2200, 2, "k1"), mk("solo", 100, 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Zestaw Loft");
    expect(groups[0].qty).toBe(2);
    expect(groups[0].base).toBe(10400);
    expect(groups[0].discount).toBe(1040);
    expect(groups[0].items).toHaveLength(2);
  });
});
