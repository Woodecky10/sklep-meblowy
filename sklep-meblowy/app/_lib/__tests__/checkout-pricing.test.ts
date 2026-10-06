import { describe, it, expect } from "vitest";
import type { Product } from "../types";
import { priceCheckoutItem } from "../checkout-pricing";
import { LEGACY_ITEM_CARRY_IN_KEY as OLD_KEY } from "../carry-in";

const plain = {
  id: "t1",
  name: "Topper",
  price: 400,
  sale_price: null,
  variants: null,
} as unknown as Product;

const sofa = {
  id: "s1",
  name: "Sofa",
  price: 2650,
  sale_price: null,
  variants: {
    options: [
      { name: "Tkanina", values: ["Riviera 16", "Sawana 21"], value_prices: { "Sawana 21": 150 } },
      { name: "Strona", values: ["Lewa", "Prawa"] },
    ],
  },
} as unknown as Product;

const sofaOnSale = { ...sofa, sale_price: 2400 } as unknown as Product;
const complete = { Tkanina: "Sawana 21", Strona: "Lewa" };

describe("priceCheckoutItem — produkt bez wariantów", () => {
  it("bez wartości: cena produktu, variantValues null (koszyk sprzed wdrożenia)", () => {
    expect(priceCheckoutItem(plain, undefined)).toEqual({ ok: true, unitPrice: 400, variantValues: null });
  });
});

describe("priceCheckoutItem — produkt z wariantami", () => {
  it("niekompletny wybór → odrzucenie", () => {
    expect(priceCheckoutItem(sofa, { Tkanina: "Sawana 21" })).toEqual({
      ok: false,
      reason: "variant_incomplete",
    });
    expect(priceCheckoutItem(sofa, undefined)).toEqual({ ok: false, reason: "variant_incomplete" });
  });
  it("wartość nie-tekstowa z przeglądarki nie zalicza wyboru wariantu", () => {
    const crafted = { Tkanina: 123, Strona: "Lewa" } as unknown as Record<string, string>;
    expect(priceCheckoutItem(sofa, crafted)).toEqual({ ok: false, reason: "variant_incomplete" });
  });
  it("obce klucze z przeglądarki odpadają", () => {
    const res = priceCheckoutItem(sofa, { ...complete, Hack: "x" });
    expect(res).toEqual({ ok: true, unitPrice: 2800, variantValues: complete });
  });
});

describe("priceCheckoutItem — stary klucz wniesienia (za sztukę) odpada", () => {
  it("produkt bez wariantów: klucz nie dolicza i nie trafia do zamówienia", () => {
    expect(priceCheckoutItem(plain, { [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 400,
      variantValues: null,
    });
  });
  it("puste options traktuje jak brak wariantów", () => {
    const legacy = { ...plain, variants: { options: [] } } as unknown as Product;
    expect(priceCheckoutItem(legacy, { [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 400,
      variantValues: null,
    });
  });
  it("z wariantami: dopłata wariantu tak, wniesienie nie", () => {
    expect(priceCheckoutItem(sofa, { ...complete, [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 2650 + 150,
      variantValues: complete,
    });
  });
  it("niekompletny wybór dalej odrzucany", () => {
    expect(priceCheckoutItem(sofa, { Tkanina: "Sawana 21", [OLD_KEY]: "Tak" })).toEqual({
      ok: false,
      reason: "variant_incomplete",
    });
  });
  it("promocja: effectivePrice(2800, 2550), bez +250", () => {
    expect(priceCheckoutItem(sofaOnSale, { ...complete, [OLD_KEY]: "Tak" })).toMatchObject({
      ok: true,
      unitPrice: 2550,
    });
  });
  it("cena z bazy jako string liczy się jak liczba", () => {
    const str = { ...plain, price: "400" } as unknown as Product;
    expect(priceCheckoutItem(str, { [OLD_KEY]: "Tak" })).toMatchObject({ unitPrice: 400 });
  });
});
