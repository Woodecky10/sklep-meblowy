import { describe, it, expect } from "vitest";
import type { Product } from "../types";
import { priceCheckoutItem } from "../checkout-pricing";
import { CARRY_IN_KEY } from "../carry-in";

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
  it("z wniesieniem: +250 i klucz zostaje (dziś serwer by go wyrzucił)", () => {
    expect(priceCheckoutItem(plain, { [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 650,
      variantValues: { [CARRY_IN_KEY]: "Tak" },
    });
  });
  it("wartość inna niż 'Tak' nie dolicza i nie trafia do zamówienia", () => {
    expect(priceCheckoutItem(plain, { [CARRY_IN_KEY]: "Nie" })).toEqual({ ok: true, unitPrice: 400, variantValues: null });
  });
  it("puste options traktuje jak brak wariantów", () => {
    const legacy = { ...plain, variants: { options: [] } } as unknown as Product;
    expect(priceCheckoutItem(legacy, { [CARRY_IN_KEY]: "Tak" })).toMatchObject({ ok: true, unitPrice: 650 });
  });
});

describe("priceCheckoutItem — produkt z wariantami", () => {
  it("dopłata wariantu + wniesienie", () => {
    expect(priceCheckoutItem(sofa, { ...complete, [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 2650 + 150 + 250,
      variantValues: { ...complete, [CARRY_IN_KEY]: "Tak" },
    });
  });
  it("niekompletny wybór → odrzucenie, nawet z wniesieniem", () => {
    expect(priceCheckoutItem(sofa, { Tkanina: "Sawana 21", [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: false,
      reason: "variant_incomplete",
    });
    expect(priceCheckoutItem(sofa, undefined)).toEqual({ ok: false, reason: "variant_incomplete" });
  });
  it("promocja nie obniża wniesienia: effectivePrice(2800, 2550) + 250", () => {
    expect(priceCheckoutItem(sofaOnSale, { ...complete, [CARRY_IN_KEY]: "Tak" })).toMatchObject({
      ok: true,
      unitPrice: 2550 + 250,
    });
  });
  it("obce klucze z przeglądarki odpadają", () => {
    const res = priceCheckoutItem(sofa, { ...complete, Hack: "x" });
    expect(res).toEqual({ ok: true, unitPrice: 2800, variantValues: complete });
  });
  it("cena z bazy jako string (numeric z PostgREST) liczy się jak liczba", () => {
    const str = { ...plain, price: "400" } as unknown as Product;
    expect(priceCheckoutItem(str, { [CARRY_IN_KEY]: "Tak" })).toMatchObject({ unitPrice: 650 });
  });
});
