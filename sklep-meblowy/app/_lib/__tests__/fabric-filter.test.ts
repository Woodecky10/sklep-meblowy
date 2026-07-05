import { describe, it, expect } from "vitest";
import {
  deriveFabricFamilies,
  productMatchesFabric,
} from "@/app/_lib/fabric-filter";
import type { ProductVariants } from "@/app/_lib/types";

const FAMILIES = [
  "Chill Me",
  "Inari",
  "Monolith",
  "Poso",
  "Quelle",
  "Solar",
  "Tilia",
  "Trinity",
  "Vena",
  "Woolly",
];

function v(options: { name: string; values: string[] }[]): ProductVariants {
  return { options };
}

describe("deriveFabricFamilies — rodziny tkanin z wartości opcji", () => {
  it("„Poso 105\" w opcji Tkanina → [Poso]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Tkanina", values: ["Poso 105", "Poso 32"] }]), FAMILIES)
    ).toEqual(["Poso"]);
  });

  it("wartość tkaniny wykrywana w dowolnie nazwanej opcji (np. TKANINA)", () => {
    expect(
      deriveFabricFamilies(v([{ name: "TKANINA", values: ["Trinity 01 Cream"] }]), FAMILIES)
    ).toEqual(["Trinity"]);
  });

  it("opcja „Wariant\" z combo „Monolith 84 + Solar 99\" → [Monolith, Solar]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Wariant", values: ["Monolith 84 + Solar 99"] }]), FAMILIES)
    ).toEqual(["Monolith", "Solar"]);
  });

  it("rodzina dwuwyrazowa: „Chill Me 22\" → [Chill Me]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Tkanina", values: ["Chill Me 22"] }]), FAMILIES)
    ).toEqual(["Chill Me"]);
  });

  it("wartość równa samej nazwie rodziny → pasuje", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["Vena"] }]), FAMILIES)).toEqual([
      "Vena",
    ]);
  });

  it("case-insensitive: „poso 105\" → [Poso] (kanoniczna pisownia z katalogu)", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["poso 105"] }]), FAMILIES)).toEqual(
      ["Poso"]
    );
  });

  it("granica słowa: „Solaris 3\" NIE pasuje do Solar", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["Solaris 3"] }]), FAMILIES)).toEqual(
      []
    );
  });

  it("null / brak opcji / opcje bez tkanin → []", () => {
    expect(deriveFabricFamilies(null, FAMILIES)).toEqual([]);
    expect(deriveFabricFamilies(v([]), FAMILIES)).toEqual([]);
    expect(
      deriveFabricFamilies(v([{ name: "Strona", values: ["Lewostronny", "Prawostronny"] }]), FAMILIES)
    ).toEqual([]);
  });

  it("wiele opcji naraz: Strona + Tkanina → tylko rodziny tkanin, kolejność katalogu", () => {
    expect(
      deriveFabricFamilies(
        v([
          { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
          { name: "Tkanina", values: ["Woolly 03", "Inari 91"] },
        ]),
        FAMILIES
      )
    ).toEqual(["Inari", "Woolly"]);
  });

  it("puste familyNames → []", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["Poso 105"] }]), [])).toEqual([]);
  });

  it("wielokrotne spacje w wartości → nadal pasuje", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Tkanina", values: ["Chill   Me   22"] }]), FAMILIES)
    ).toEqual(["Chill Me"]);
  });
});

describe("productMatchesFabric — unia: rodziny z wariantów LUB legacy material", () => {
  const fabricProduct = v([{ name: "Tkanina", values: ["Poso 105"] }]);

  it("match po rodzinie z wariantów", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Poso"], FAMILIES)).toBe(true);
  });

  it("match po legacy material (exact, po trim)", () => {
    expect(productMatchesFabric(null, "sztruks", ["sztruks"], FAMILIES)).toBe(true);
    expect(productMatchesFabric(null, " sztruks ", ["sztruks"], FAMILIES)).toBe(true);
  });

  it("OR wielu wartości: jedna pasująca wystarczy", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Trinity", "Poso"], FAMILIES)).toBe(true);
  });

  it("brak matcha → false (legacy material to exact, nie substring)", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Trinity"], FAMILIES)).toBe(false);
    expect(productMatchesFabric(null, "Monolith + Solar", ["Monolith"], FAMILIES)).toBe(false);
    expect(productMatchesFabric(null, null, ["Poso"], FAMILIES)).toBe(false);
  });

  it("legacy sklejone „Monolith + Solar\" pasuje tylko do dokładnie tej wartości", () => {
    expect(
      productMatchesFabric(null, "Monolith + Solar", ["Monolith + Solar"], FAMILIES)
    ).toBe(true);
  });

  it("selected puste → false", () => {
    expect(productMatchesFabric(fabricProduct, "Poso", [], FAMILIES)).toBe(false);
  });
});
