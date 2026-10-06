import { describe, it, expect } from "vitest";
import {
  CARRY_IN_PRICE,
  CARRY_IN_LINE_NAME,
  LEGACY_ITEM_CARRY_IN_KEY,
  applyCarryIn,
  carryInOrderLine,
  isCarryInLine,
} from "../carry-in";

describe("wniesienie raz na zamówienie — pozycja zamówienia", () => {
  it("nazwa pozycji i klucz migracji mają dokładne wartości (klucze zapisu)", () => {
    expect(CARRY_IN_PRICE).toBe(250);
    expect(CARRY_IN_LINE_NAME).toBe("Wniesienie mebli do 4. piętra");
    expect(LEGACY_ITEM_CARRY_IN_KEY).toBe("Wniesienie mebli do 4. piętra");
  });

  it("carryInOrderLine: pozycja spoza katalogu 1 × 250 zł", () => {
    expect(carryInOrderLine()).toEqual({
      product_id: null,
      custom_name: "Wniesienie mebli do 4. piętra",
      quantity: 1,
      price: 250,
      variant_values: null,
      notes: null,
    });
  });

  it("isCarryInLine: tylko wiersz bez produktu z dokładną nazwą", () => {
    expect(isCarryInLine({ product_id: null, custom_name: CARRY_IN_LINE_NAME })).toBe(true);
    expect(isCarryInLine({ product_id: undefined, custom_name: CARRY_IN_LINE_NAME })).toBe(true);
    expect(isCarryInLine({ product_id: "p1", custom_name: CARRY_IN_LINE_NAME })).toBe(false);
    expect(isCarryInLine({ product_id: null, custom_name: "Stolik z Allegro" })).toBe(false);
    expect(isCarryInLine({ product_id: null, custom_name: null })).toBe(false);
    expect(isCarryInLine({ product_id: "p1" })).toBe(false);
  });

  it("applyCarryIn(true): dopisuje pozycję i 250 zł do sumy PO rabatach", () => {
    const items = [{ product_id: "p1", price: 1000 }];
    const out = applyCarryIn(items, 900, true);
    expect(out.total).toBe(1150);
    expect(out.items).toEqual([{ product_id: "p1", price: 1000 }, carryInOrderLine()]);
    expect(items).toHaveLength(1); // nie mutuje wejścia
  });

  it("applyCarryIn: wszystko poza dokładnym true = brak wniesienia", () => {
    const items = [{ product_id: "p1", price: 1000 }];
    for (const requested of [false, undefined, null, "true", 1, {}]) {
      const out = applyCarryIn(items, 900, requested);
      expect(out.total).toBe(900);
      expect(out.items).toEqual(items);
    }
  });
});
