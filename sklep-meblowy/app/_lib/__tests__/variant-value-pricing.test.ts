import { describe, it, expect } from "vitest";
import {
  sumValueSurcharges,
  usesValuePricing,
} from "@/app/_lib/variants";
import type { ProductOption } from "@/app/_lib/types";

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

