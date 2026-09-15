import { describe, it, expect } from "vitest";
import { buildBundleTiles, HOME_BUNDLES_VISIBLE } from "@/app/_lib/bundle-tiles";
import type { BundleWithComponents, Product } from "@/app/_lib/types";

// Fabryki — pełny typ przez cast (jak w collection-tiles.test.ts), żeby test
// nie rozjechał się przy dodaniu pola do Product/Bundle.
function product(
  id: string,
  over: Partial<Product> & { images?: string[] } = {}
): Product {
  return {
    id,
    name: `Produkt ${id}`,
    price: 1000,
    sale_price: null,
    images: [`${id}.jpg`],
    is_active: true,
    ...over,
  } as Product;
}

function bundle(
  components: Product[],
  over: Partial<BundleWithComponents> = {}
): BundleWithComponents {
  return {
    id: "b1",
    slug: "zestaw-testowy",
    name: "Zestaw testowy",
    description: null,
    discount_type: "percent",
    discount_value: 10,
    is_active: true,
    created_at: "2026-09-14T00:00:00Z",
    components,
    ...over,
  } as BundleWithComponents;
}

describe("buildBundleTiles", () => {
  it("mozaika = pierwsze zdjęcie każdego składnika, w kolejności składu", () => {
    const [tile] = buildBundleTiles([
      bundle([product("fotel", { images: ["f1.jpg", "f2.jpg"] }), product("sofa")]),
    ]);
    expect(tile.thumbnails).toEqual(["f1.jpg", "sofa.jpg"]);
  });

  it("składnik bez zdjęcia nie wchodzi do mozaiki, ale liczy się do liczby mebli", () => {
    const [tile] = buildBundleTiles([
      bundle([product("fotel", { images: [] }), product("sofa")]),
    ]);
    expect(tile.thumbnails).toEqual(["sofa.jpg"]);
    expect(tile.componentCount).toBe(2);
  });

  it("powtórzone zdjęcia odpadają PRZED obcięciem do 4", () => {
    const [tile] = buildBundleTiles([
      bundle([
        product("a", { images: ["x.jpg"] }),
        product("b", { images: ["x.jpg"] }),
        product("c", { images: ["y.jpg"] }),
        product("d", { images: ["z.jpg"] }),
        product("e", { images: ["w.jpg"] }),
        product("f", { images: ["v.jpg"] }),
      ]),
    ]);
    expect(tile.thumbnails).toEqual(["x.jpg", "y.jpg", "z.jpg", "w.jpg"]);
    expect(tile.componentCount).toBe(6);
  });

  it("cennik liczy od cen EFEKTYWNYCH składników (promocja) i rabatu procentowego", () => {
    const [tile] = buildBundleTiles([
      bundle([product("fotel", { price: 1000, sale_price: 800 }), product("sofa", { price: 2000 })]),
    ]);
    expect(tile.pricing).toEqual({ base: 2800, discounted: 2520, savings: 280 });
  });

  it("rabat kwotowy odejmuje kwotę od sumy", () => {
    const [tile] = buildBundleTiles([
      bundle([product("fotel"), product("sofa")], {
        discount_type: "amount",
        discount_value: 100,
      }),
    ]);
    expect(tile.pricing).toEqual({ base: 2000, discounted: 1900, savings: 100 });
  });

  it("sale_price jako string z bazy też liczy się jako liczba (nie sklejenie tekstu)", () => {
    const [tile] = buildBundleTiles([
      bundle([
        product("fotel", { price: 1000, sale_price: "800" as unknown as number }),
        product("sofa", { price: 2000 }),
      ]),
    ]);
    expect(tile.pricing.base).toBe(2800);
  });

  it("numeric z bazy przychodzi jako string — price i discount_value są rzutowane", () => {
    const [tile] = buildBundleTiles([
      bundle(
        [
          product("fotel", { price: "1500" as unknown as number }),
          product("sofa", { price: "2500" as unknown as number }),
        ],
        { discount_value: "10" as unknown as number }
      ),
    ]);
    expect(tile.pricing).toEqual({ base: 4000, discounted: 3600, savings: 400 });
  });

  it("zwraca zlokalizowany zestaw bez składników (kafelek nie potrzebuje pełnych produktów)", () => {
    const [tile] = buildBundleTiles([bundle([product("a"), product("b")])]);
    expect(tile.bundle.slug).toBe("zestaw-testowy");
    expect(tile.bundle.name).toBe("Zestaw testowy");
    expect("components" in tile.bundle).toBe(false);
  });

  it("zachowuje kolejność wejścia (o porządku decyduje warstwa serwera)", () => {
    const tiles = buildBundleTiles([
      bundle([product("a"), product("b")], { id: "b1", slug: "pierwszy" }),
      bundle([product("c"), product("d")], { id: "b2", slug: "drugi" }),
    ]);
    expect(tiles.map((t) => t.bundle.slug)).toEqual(["pierwszy", "drugi"]);
  });
});

describe("HOME_BUNDLES_VISIBLE", () => {
  it("pełny rząd siatki na desktopie (3 kolumny) — reszta za linkiem na /zestawy", () => {
    expect(HOME_BUNDLES_VISIBLE).toBe(3);
  });
});
