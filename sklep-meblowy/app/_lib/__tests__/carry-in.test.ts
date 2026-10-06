import { describe, it, expect } from "vitest";
import {
  CARRY_IN_KEY,
  CARRY_IN_PRICE,
  carryInSurcharge,
  discountableSubtotal,
  hasCarryIn,
  setCarryIn,
} from "../carry-in";
import { formatVariantLabel } from "../variants";
import { cartReducer, type CartState } from "@/app/_context/CartContext";

describe("carryInSurcharge / hasCarryIn", () => {
  it("250 zł tylko przy wartości Tak", () => {
    expect(CARRY_IN_PRICE).toBe(250);
    expect(carryInSurcharge({ [CARRY_IN_KEY]: "Tak" })).toBe(250);
    expect(hasCarryIn({ [CARRY_IN_KEY]: "Tak" })).toBe(true);
  });
  it("0 przy innej wartości, braku klucza, null i undefined", () => {
    expect(carryInSurcharge({ [CARRY_IN_KEY]: "Nie" })).toBe(0);
    expect(carryInSurcharge({ Tkanina: "Riviera 16" })).toBe(0);
    expect(carryInSurcharge({})).toBe(0);
    expect(carryInSurcharge(null)).toBe(0);
    expect(carryInSurcharge(undefined)).toBe(0);
    expect(hasCarryIn(undefined)).toBe(false);
  });
});

describe("setCarryIn", () => {
  it("dodaje klucz, zachowuje resztę i nie mutuje wejścia", () => {
    const input = { Tkanina: "Riviera 16" };
    const out = setCarryIn(input, true);
    expect(out).toEqual({ Tkanina: "Riviera 16", [CARRY_IN_KEY]: "Tak" });
    expect(input).toEqual({ Tkanina: "Riviera 16" });
  });
  it("odznaczenie usuwa klucz zamiast zapisywać Nie", () => {
    const out = setCarryIn({ Tkanina: "Riviera 16", [CARRY_IN_KEY]: "Tak" }, false);
    expect(out).toEqual({ Tkanina: "Riviera 16" });
  });
});

describe("discountableSubtotal", () => {
  it("odejmuje wniesienie od ceny sztuki przed pomnożeniem przez ilość", () => {
    expect(discountableSubtotal(2900, 2, { [CARRY_IN_KEY]: "Tak" })).toBe(5300);
  });
  it("bez wniesienia = cena × ilość", () => {
    expect(discountableSubtotal(2900, 2, { Tkanina: "Riviera 16" })).toBe(5800);
    expect(discountableSubtotal(2900, 2, undefined)).toBe(5800);
  });
});

describe("etykieta w koszyku, zamówieniu i mailach", () => {
  it("PL: Wniesienie mebli do 4. piętra: Tak", () => {
    expect(formatVariantLabel({ [CARRY_IN_KEY]: "Tak" }, "pl")).toBe(
      "Wniesienie mebli do 4. piętra: Tak"
    );
  });
  it("DE: tłumaczenie klucza i wartości", () => {
    expect(formatVariantLabel({ [CARRY_IN_KEY]: "Tak" }, "de")).toBe(
      "Hineintragen bis zur 4. Etage: Ja"
    );
  });
});

describe("koszyk", () => {
  const empty: CartState = { items: [], appliedPromo: null, hydrated: true };
  const base = { id: "p1", name: "Fotel", image: "", quantity: 1 };
  it("ten sam mebel z wniesieniem i bez to dwie osobne pozycje", () => {
    let s = cartReducer(empty, { type: "ADD", item: { ...base, price: 1000 } });
    s = cartReducer(s, {
      type: "ADD",
      item: { ...base, price: 1250, variantValues: { [CARRY_IN_KEY]: "Tak" } },
    });
    expect(s.items).toHaveLength(2);
    s = cartReducer(s, { type: "REMOVE", id: "p1", variantValues: undefined });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].variantValues).toEqual({ [CARRY_IN_KEY]: "Tak" });
  });
});
