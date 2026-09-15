// Czysta logika kafelków zestawów — lista /zestawy i sekcja na stronie głównej.
// BEZ server-only importów (wzorzec collection-tiles.ts ↔ collections.ts):
// I/O żyje w bundles-server.ts, tu tylko przekształcenie wyniku na dane
// kafelka, testowane bez bazy (bundle-tiles.test.ts).
import { effectivePrice } from "./pricing";
import { minBundlePricing } from "./bundles";
import type { Bundle, Product } from "./types";

// Kafelek czyta ze składnika TYLKO to — bundles-server.ts dla ścieżki kafelków
// ściąga właśnie te kolumny (TILE_COMPONENT_COLUMNS), nie pełny produkt.
// BundleWithComponents (pełne produkty) też tu pasuje strukturalnie.
export type BundleTileComponent = Pick<Product, "images" | "price" | "sale_price">;
export type BundleTileSource = Bundle & { components: BundleTileComponent[] };

// Ile kafelków widać na stronie głównej. 3 = pełny rząd na desktopie
// (siatka 1/2/3 kolumny); reszta jest za linkiem „Zobacz wszystkie zestawy"
// na /zestawy — inaczej niż kolekcje, które nie mają własnej listy i zwijają
// nadwyżkę na miejscu.
export const HOME_BUNDLES_VISIBLE = 3;

// Mozaika ma miejsce na 4 zdjęcia (siatka 2×2, jak kafelek kolekcji).
const MAX_THUMBNAILS = 4;

export type BundleTile = {
  // Zlokalizowany zestaw BEZ składników — kafelek pokazuje nazwę i linkuje
  // do /zestaw/[slug]; pełne produkty potrzebuje dopiero konfigurator.
  bundle: Bundle;
  // Pierwsze zdjęcie każdego składnika, w kolejności składu, bez powtórzeń,
  // najwyżej MAX_THUMBNAILS. Dedupe PRZED obcięciem — ten sam URL potrafi
  // się powtórzyć między produktami (patrz collection-tiles.ts).
  thumbnails: string[];
  componentCount: number;
  // Cennik „od": suma cen efektywnych składników bez dopłat opcji, cena po
  // rabacie i oszczędność — ta sama funkcja, co box na karcie produktu.
  pricing: { base: number; discounted: number; savings: number };
};

export function buildBundleTile(b: BundleTileSource): BundleTile {
  const { components, ...bundle } = b;

  const thumbnails: string[] = [];
  for (const p of components) {
    const first = p.images?.[0];
    if (!first || thumbnails.includes(first)) continue;
    thumbnails.push(first);
    if (thumbnails.length === MAX_THUMBNAILS) break;
  }

  // numeric z Postgresa przychodzi jako string — Number() jak w BundleOffer.
  const pricing = minBundlePricing(
    components.map((p) =>
      effectivePrice(Number(p.price), p.sale_price == null ? null : Number(p.sale_price))
    ),
    bundle.discount_type,
    Number(bundle.discount_value)
  );

  return { bundle, thumbnails, componentCount: components.length, pricing };
}

export function buildBundleTiles(bundles: BundleTileSource[]): BundleTile[] {
  return bundles.map(buildBundleTile);
}
