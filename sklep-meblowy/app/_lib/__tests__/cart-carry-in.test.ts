import { describe, it, expect } from "vitest";
import {
  cartReducer,
  migrateLegacyCarryIn,
  type CartItem,
  type CartState,
} from "@/app/_context/CartContext";
import { LEGACY_ITEM_CARRY_IN_KEY as OLD_KEY } from "../carry-in";

const empty: CartState = { items: [], appliedPromo: null, hydrated: true, carryIn: false };
const fotel = (over: Partial<CartItem> = {}): CartItem => ({
  id: "p1",
  name: "Fotel",
  price: 1000,
  image: "",
  quantity: 1,
  ...over,
});

describe("cartReducer — wniesienie", () => {
  it("SET_CARRY_IN włącza i wyłącza", () => {
    const on = cartReducer(empty, { type: "SET_CARRY_IN", on: true });
    expect(on.carryIn).toBe(true);
    expect(cartReducer(on, { type: "SET_CARRY_IN", on: false }).carryIn).toBe(false);
  });
  it("HYDRATE przenosi zapisany wybór", () => {
    const s = cartReducer(
      { ...empty, hydrated: false },
      { type: "HYDRATE", items: [fotel()], appliedPromo: null, carryIn: true }
    );
    expect(s).toMatchObject({ hydrated: true, carryIn: true });
    expect(s.items).toHaveLength(1);
  });
  it("CLEAR (po złożeniu zamówienia) odznacza wniesienie", () => {
    const s = cartReducer(
      { ...empty, items: [fotel()], carryIn: true },
      { type: "CLEAR" }
    );
    expect(s.carryIn).toBe(false);
    expect(s.items).toEqual([]);
  });
  it("CLEAR na pustym koszyku z zaznaczonym wniesieniem też odznacza", () => {
    expect(cartReducer({ ...empty, carryIn: true }, { type: "CLEAR" }).carryIn).toBe(false);
  });
});

describe("migrateLegacyCarryIn — koszyki z wersji „za sztukę”", () => {
  it("zdejmuje klucz, cena −250, flaga carryIn", () => {
    const out = migrateLegacyCarryIn([
      fotel({ price: 1250, variantValues: { Tkanina: "Riviera 16", [OLD_KEY]: "Tak" } }),
    ]);
    expect(out.carryIn).toBe(true);
    expect(out.items).toEqual([fotel({ price: 1000, variantValues: { Tkanina: "Riviera 16" } })]);
  });
  it("pusty słownik po zdjęciu klucza → variantValues undefined", () => {
    const out = migrateLegacyCarryIn([fotel({ price: 1250, variantValues: { [OLD_KEY]: "Tak" } })]);
    expect(out.items[0].variantValues).toBeUndefined();
    expect(out.items[0].price).toBe(1000);
  });
  it("koszyk bez klucza zostaje bez zmian, carryIn false", () => {
    const items = [fotel({ variantValues: { Tkanina: "Riviera 16" } }), fotel({ id: "p2" })];
    const out = migrateLegacyCarryIn(items);
    expect(out.carryIn).toBe(false);
    expect(out.items).toEqual(items);
  });
  it("klucz z wartością inną niż „Tak”: znika, cena bez zmian, carryIn false", () => {
    const out = migrateLegacyCarryIn([fotel({ variantValues: { [OLD_KEY]: "Nie" } })]);
    expect(out.carryIn).toBe(false);
    expect(out.items).toEqual([fotel()]);
  });
  it("ten sam mebel z wniesieniem i bez → jedna pozycja z sumą ilości", () => {
    const out = migrateLegacyCarryIn([
      fotel({ quantity: 1, variantValues: { Tkanina: "Riviera 16" } }),
      fotel({ quantity: 2, price: 1250, variantValues: { Tkanina: "Riviera 16", [OLD_KEY]: "Tak" } }),
    ]);
    expect(out.carryIn).toBe(true);
    expect(out.items).toEqual([fotel({ quantity: 3, variantValues: { Tkanina: "Riviera 16" } })]);
  });
});
