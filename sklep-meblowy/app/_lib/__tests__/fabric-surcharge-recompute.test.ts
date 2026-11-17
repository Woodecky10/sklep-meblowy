import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/products", () => ({ invalidateFacetsCache: vi.fn() }));

import { planFabricSurchargeUpdates } from "../fabric-surcharge-recompute";

const GROUPS = [
  { id: "g-std", code: "standard", surcharge: 0 },
  { id: "g-pre", code: "premium", surcharge: 250 },
];
const FABRICS = [{ name: "Riviera", colors: ["16"], price: 20, group_id: "g-pre" }];
const FOTEL = { id: "s-fotel", name: "Fotel", sort_order: 0, created_at: "", surcharges: { premium: 100 } };
const tkanina = (vp?: Record<string, number>) => ({
  options: [{ name: "Tkanina", values: ["Riviera 16", "Stara 1"], value_prices: vp }],
});

describe("planFabricSurchargeUpdates", () => {
  it("ten sam materiał: narożnik dostaje globalną dopłatę, fotel dopłatę rozmiaru (+ korekta)", () => {
    const out = planFabricSurchargeUpdates({
      products: [
        { id: "naroznik", category: "narozniki", variants: tkanina() },
        { id: "fotel", category: "fotele", variants: tkanina() },
      ],
      fabrics: FABRICS,
      groups: GROUPS,
      sizes: [FOTEL],
      categories: [
        { slug: "fotele", defaultFabricSizeId: "s-fotel" },
        { slug: "narozniki", defaultFabricSizeId: null },
      ],
    });
    const vp = (id: string) => out.find((p) => p.id === id)!.variants.options[0].value_prices;
    expect(vp("naroznik")).toEqual({ "Riviera 16": 270 });
    expect(vp("fotel")).toEqual({ "Riviera 16": 120 });
  });

  it("wartość spoza katalogu zachowuje swoją dopłatę", () => {
    const out = planFabricSurchargeUpdates({
      products: [{ id: "fotel", category: "fotele", variants: tkanina({ "Stara 1": 77 }) }],
      fabrics: FABRICS,
      groups: GROUPS,
      sizes: [FOTEL],
      categories: [{ slug: "fotele", defaultFabricSizeId: "s-fotel" }],
    });
    expect(out[0].variants.options[0].value_prices).toEqual({ "Riviera 16": 120, "Stara 1": 77 });
  });

  it("po usunięciu rozmiaru produkt wraca do globalnej dopłaty", () => {
    const out = planFabricSurchargeUpdates({
      products: [
        { id: "fotel", category: "fotele", fabric_size_id: "s-fotel", variants: tkanina({ "Riviera 16": 120 }) },
      ],
      fabrics: FABRICS,
      groups: GROUPS,
      sizes: [],
      categories: [{ slug: "fotele", defaultFabricSizeId: null }],
    });
    expect(out[0].variants.options[0].value_prices).toEqual({ "Riviera 16": 270 });
  });

  it("pomija produkty bez zmian i bez opcji Tkanina", () => {
    const out = planFabricSurchargeUpdates({
      products: [
        { id: "ok", category: "x", variants: tkanina({ "Riviera 16": 270 }) },
        { id: "bez", category: "x", variants: { options: [{ name: "Strona", values: ["Lewa"] }] } },
        { id: "null", category: "x", variants: null },
      ],
      fabrics: FABRICS,
      groups: GROUPS,
      sizes: [],
      categories: [],
    });
    expect(out).toEqual([]);
  });
});
