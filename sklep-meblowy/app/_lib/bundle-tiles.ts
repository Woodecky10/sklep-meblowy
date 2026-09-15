// Czysta logika kafelków zestawów — lista /zestawy i sekcja na stronie głównej.
// BEZ server-only importów (wzorzec collection-tiles.ts ↔ collections.ts):
// I/O żyje w bundles-server.ts, tu tylko przekształcenie wyniku na dane
// kafelka, testowane bez bazy (bundle-tiles.test.ts).
import { effectivePrice } from "./pricing";
import { minBundlePricing } from "./bundles";
import type { Bundle, Product } from "./types";

// Kafelek czyta ze składnika TYLKO to (plus `id`, po którym bundles-server.ts
// dopasowuje skład do wierszy). BundleWithComponents (pełne produkty) też tu
// pasuje strukturalnie.
export type BundleTileComponent = Pick<Product, "id" | "images" | "price" | "sale_price">;

// Lista kolumn dla zapytania, które karmi BundleTileComponent — stoi TU, obok
// typu, a nie jako literał w bundles-server.ts (wzorzec COLLECTION_TILE_COLUMNS).
// Powód: skrócenie listy nie wywala tsc (wynik jest rzutowany), tylko cicho psuje
// stronę — bez `price` kafelek pokaże „NaN zł", bez `id` każdy zestaw wyjdzie
// „niekompletny" i sekcja zniknie. Test bundle-tiles.test.ts pilnuje zgodności.
// Dlaczego nie "*": sekcja stoi na stronie głównej, a pełne wiersze produktów
// niosą opisy HTML po kilka KB — Supabase FREE zablokował już projekt za egress
// (07.09.2026). Pełne produkty potrzebuje tylko konfigurator (/zestaw/[slug],
// box na karcie produktu).
export const TILE_COMPONENT_COLUMNS = "id, images, price, sale_price";
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

  // Number() to pas bezpieczeństwa (jak w BundleOffer): typ mówi number, ale
  // wiersz idzie przez rzutowanie z zapytania — gdyby numeric przyszedł jako
  // string, suma zmieniłaby się w sklejony tekst (test „sale_price jako string").
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
