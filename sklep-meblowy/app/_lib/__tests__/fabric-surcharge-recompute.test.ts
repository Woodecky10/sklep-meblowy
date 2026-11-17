import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/supabase/server", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/products", () => ({ invalidateFacetsCache: vi.fn() }));

import { createAdminClient } from "@/app/_lib/supabase/server";
import { planFabricSurchargeUpdates, recomputeFabricSurcharges } from "../fabric-surcharge-recompute";

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

// Atrapa klienta Supabase: odczyt tabeli zwraca `reads[tabela]`, zapis
// update().eq("id", x) — błąd z `updateErrors[x]` albo sukces; `updates`
// zbiera id produktów, do których poszedł zapis.
function fakeClient(
  reads: Record<string, { data?: unknown; error?: { message: string } }>,
  updateErrors: Record<string, string> = {}
) {
  const updates: string[] = [];
  const client = {
    from(table: string) {
      let updateId: string | null = null;
      let isUpdate = false;
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "not", "in"]) builder[m] = () => builder;
      builder.update = () => {
        isUpdate = true;
        return builder;
      };
      builder.eq = (_col: string, value: string) => {
        if (isUpdate) {
          updateId = value;
          updates.push(value);
        }
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const payload = isUpdate
          ? { data: null, error: updateId && updateErrors[updateId] ? { message: updateErrors[updateId] } : null }
          : { data: reads[table]?.data ?? null, error: reads[table]?.error ?? null };
        return Promise.resolve(payload).then(resolve, reject);
      };
      return builder;
    },
  };
  return { client, updates };
}

const READS = {
  fabrics: { data: FABRICS },
  fabric_groups: { data: GROUPS },
  fabric_sizes: { data: [FOTEL] },
  categories: { data: [{ slug: "fotele", default_fabric_size_id: "s-fotel" }] },
  products: {
    data: [
      { id: "a", category: "fotele", variants: tkanina() },
      { id: "b", category: "fotele", variants: tkanina() },
    ],
  },
};

describe("recomputeFabricSurcharges — wynik dla wołającego", () => {
  it("błąd odczytu → żadnego zapisu, ok: false", async () => {
    const { client, updates } = fakeClient({ ...READS, products: { error: { message: "boom" } } });
    vi.mocked(createAdminClient).mockResolvedValue(client as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recomputeFabricSurcharges()).resolves.toEqual({ updated: 0, ok: false });
    expect(updates).toEqual([]);
  });

  it("nieudany zapis jednego produktu → ok: false, licznik tylko udanych", async () => {
    const { client, updates } = fakeClient(READS, { b: "write failed" });
    vi.mocked(createAdminClient).mockResolvedValue(client as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recomputeFabricSurcharges()).resolves.toEqual({ updated: 1, ok: false });
    expect(updates.sort()).toEqual(["a", "b"]);
  });

  it("wszystkie zapisy udane → ok: true", async () => {
    const { client } = fakeClient(READS);
    vi.mocked(createAdminClient).mockResolvedValue(client as never);
    await expect(recomputeFabricSurcharges()).resolves.toEqual({ updated: 2, ok: true });
  });
});
