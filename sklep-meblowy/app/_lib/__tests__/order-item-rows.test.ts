import { describe, it, expect } from "vitest";
import { toOrderItemRows } from "../order-items";
import { carryInOrderLine, CARRY_IN_LINE_NAME } from "../carry-in";

const catalogItem = {
  product_id: "p-1",
  quantity: 2,
  price: 1200,
  variant_values: { Tkanina: "Velvet 17" },
  notes: "bez nóżek",
};
const bundleItem = {
  product_id: "p-2",
  quantity: 1,
  price: 800,
  bundle_id: "b-1",
  bundle_label: "Zestaw A",
};

describe("toOrderItemRows — jednolity zestaw kluczy (postgrest-js bulk insert)", () => {
  const rows = toOrderItemRows([catalogItem, bundleItem, carryInOrderLine()], "o-1");

  it("wszystkie wiersze mają identyczny zestaw kluczy", () => {
    const keys = rows.map((r) => Object.keys(r).sort().join(","));
    expect(new Set(keys).size).toBe(1);
  });

  it("pozycja z katalogu ma custom_name \"\" (NOT NULL) i product_id", () => {
    expect(rows[0].custom_name).toBe("");
    expect(rows[0].product_id).toBe("p-1");
    expect(rows[0].variant_values).toEqual({ Tkanina: "Velvet 17" });
    expect(rows[1].custom_name).toBe("");
    expect(rows[1].bundle_id).toBe("b-1");
    expect(rows[1].notes).toBeNull();
  });

  it("wniesienie zachowuje product_id null i swoją nazwę", () => {
    expect(rows[2].product_id).toBeNull();
    expect(rows[2].custom_name).toBe(CARRY_IN_LINE_NAME);
    expect(rows[2].price).toBe(250);
  });

  it("order_id na każdym wierszu", () => {
    expect(rows.every((r) => r.order_id === "o-1")).toBe(true);
  });

  it("null w custom_name przy pozycji spoza katalogu w zamówieniu zamieniany na \"\"", () => {
    const [r] = toOrderItemRows(
      [{ ...catalogItem, custom_name: null }, carryInOrderLine()],
      "o-1"
    );
    expect(r.custom_name).toBe("");
  });

  it("zamówienie bez pozycji spoza katalogu: klucza custom_name nie ma w żadnym wierszu", () => {
    const plain = toOrderItemRows([catalogItem, bundleItem], "o-1");
    expect(plain.every((r) => !("custom_name" in r))).toBe(true);
    expect(new Set(plain.map((r) => Object.keys(r).sort().join(","))).size).toBe(1);
  });
});
