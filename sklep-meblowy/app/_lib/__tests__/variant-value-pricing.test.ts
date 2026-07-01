import { describe, it, expect } from "vitest";
import {
  sumValueSurcharges,
  usesValuePricing,
  applyValuePricing,
} from "@/app/_lib/variants";
import type { ProductOption, ProductVariant } from "@/app/_lib/types";

describe("sumValueSurcharges", () => {
  const options: ProductOption[] = [
    { name: "Rozmiar", values: ["140", "160"], value_prices: { "160": 50 } },
    { name: "Pianka", values: ["Klasyk", "Premium"], value_prices: { Premium: 200 } },
  ];

  it("sumuje dopłaty wybranych wartości (wiele opcji)", () => {
    expect(sumValueSurcharges(options, { Rozmiar: "160", Pianka: "Premium" })).toBe(250);
    expect(sumValueSurcharges(options, { Rozmiar: "140", Pianka: "Premium" })).toBe(200);
    expect(sumValueSurcharges(options, { Rozmiar: "140", Pianka: "Klasyk" })).toBe(0);
  });

  it("wartość bez dopłaty liczy się jako 0", () => {
    const one: ProductOption[] = [
      { name: "Pianka", values: ["A", "B"], value_prices: { B: 100 } },
    ];
    expect(sumValueSurcharges(one, { Pianka: "A" })).toBe(0);
    expect(sumValueSurcharges(one, { Pianka: "B" })).toBe(100);
  });

  it("dopłaty ujemne (rabat) też się sumują", () => {
    const opts: ProductOption[] = [
      { name: "Wykończenie", values: ["Standard", "Eko"], value_prices: { Eko: -80 } },
    ];
    expect(sumValueSurcharges(opts, { Wykończenie: "Eko" })).toBe(-80);
  });
});

describe("usesValuePricing", () => {
  it("true gdy jakakolwiek opcja ma niepustą mapę dopłat", () => {
    expect(
      usesValuePricing([{ name: "P", values: ["A"], value_prices: { A: 10 } }])
    ).toBe(true);
  });
  it("false gdy brak dopłat lub puste mapy", () => {
    expect(usesValuePricing([{ name: "P", values: ["A"] }])).toBe(false);
    expect(usesValuePricing([{ name: "P", values: ["A"], value_prices: {} }])).toBe(false);
  });
});

describe("applyValuePricing", () => {
  it("przelicza price_modifier = suma dopłat gdy produkt używa dopłat", () => {
    const options: ProductOption[] = [
      { name: "Pianka", values: ["Klasyk", "Premium"], value_prices: { Premium: 200 } },
    ];
    const combos: ProductVariant[] = [
      { values: { Pianka: "Klasyk" }, stock: 5, price_modifier: 999 },
      { values: { Pianka: "Premium" }, stock: 3, price_modifier: 0 },
    ];
    const out = applyValuePricing(options, combos);
    expect(out[0].price_modifier).toBe(0); // nadpisuje stary 999
    expect(out[1].price_modifier).toBe(200);
    // zachowuje pozostałe pola
    expect(out[0].stock).toBe(5);
    expect(out[1].stock).toBe(3);
  });

  it("NIE rusza kombinacji gdy brak dopłat (zgodność wsteczna z ręcznymi modyfikatorami)", () => {
    const options: ProductOption[] = [{ name: "Rozmiar", values: ["140", "160"] }];
    const combos: ProductVariant[] = [
      { values: { Rozmiar: "140" }, stock: 1, price_modifier: 0 },
      { values: { Rozmiar: "160" }, stock: 1, price_modifier: 300 }, // ręczny modyfikator
    ];
    const out = applyValuePricing(options, combos);
    expect(out).toBe(combos); // ta sama referencja — bez zmian
    expect(out[1].price_modifier).toBe(300);
  });
});
