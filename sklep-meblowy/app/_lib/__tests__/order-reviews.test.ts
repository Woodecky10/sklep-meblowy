import { describe, it, expect } from "vitest";
import { productsToReview } from "@/app/_lib/order-reviews";
import type { OrderStatus } from "@/app/_lib/types";

const item = (
  product_id: string | null,
  is_active = true,
  extra: { variant_values?: Record<string, string>; custom_name?: string } = {}
) => ({
  product_id,
  product: product_id ? { id: product_id, name: `Produkt ${product_id}`, is_active } : null,
  ...extra,
});

describe("productsToReview", () => {
  it("zamówienie dostarczone → każdy produkt z zamówienia, w kolejności pozycji", () => {
    const wynik = productsToReview("delivered", [item("a"), item("b")]);
    expect(wynik.map((i) => i.product_id)).toEqual(["a", "b"]);
  });

  it.each<OrderStatus>(["pending", "paid", "processing", "shipped", "cancelled"])(
    "zamówienie %s → nic, przycisk dopiero po dostarczeniu (jak mail z prośbą o opinię)",
    (status) => {
      expect(productsToReview(status, [item("a")])).toEqual([]);
    }
  );

  it("ten sam produkt w dwóch wariantach → jeden wpis, bo opinia dotyczy produktu", () => {
    const wynik = productsToReview("delivered", [
      item("a", true, { variant_values: { Kolor: "Szary" } }),
      item("b"),
      item("a", true, { variant_values: { Kolor: "Beżowy" } }),
    ]);
    expect(wynik.map((i) => i.product_id)).toEqual(["a", "b"]);
    // Zostaje PIERWSZA pozycja — jej zdjęcie i nazwa trafiają na listę.
    expect(wynik[0].variant_values).toEqual({ Kolor: "Szary" });
  });

  it("pozycja spoza katalogu (wniesienie mebli, ręczna pozycja z Allegro/OLX) → pominięta", () => {
    const wynik = productsToReview("delivered", [item(null, true, { custom_name: "Wniesienie mebli" }), item("a")]);
    expect(wynik.map((i) => i.product_id)).toEqual(["a"]);
  });

  it("produkt ukryty w sklepie → pominięty, bo jego karta odpowiada 404", () => {
    const wynik = productsToReview("delivered", [item("a", false), item("b")]);
    expect(wynik.map((i) => i.product_id)).toEqual(["b"]);
  });

  it("produkt_id bez dociągniętego produktu → pominięty, nie ma dokąd prowadzić", () => {
    const wynik = productsToReview("delivered", [{ product_id: "a", product: null }, item("b")]);
    expect(wynik.map((i) => i.product_id)).toEqual(["b"]);
  });
});
