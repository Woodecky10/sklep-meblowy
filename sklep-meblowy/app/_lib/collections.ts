// Helpery do tabeli collections — grupowanie produktów (np. "Kolekcja Lisbon").
// Edytowane przez admin panel /admin/kolekcje.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeProduct, localizeCollection } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Collection, Product } from "./types";
import {
  HOME_COLLECTIONS_VISIBLE,
  type CollectionProductRow,
  type CollectionTile,
} from "./collection-tiles-shared";

// Re-eksport: reszta kodu (testy, przyszli konsumenci) importuje te nazwy
// z "@/app/_lib/collections" jak dotąd. Definicje źródłowe są w
// collection-tiles-shared.ts, bo ten plik (collections.ts) ma server-only
// importy (next/cache, supabase/server → next/headers) i nie może być
// bezpiecznie importowany z komponentu klienckiego (HomeCollections.tsx).
export { HOME_COLLECTIONS_VISIBLE, type CollectionProductRow, type CollectionTile };

export const COLLECTIONS_CACHE_TAG = "collections";

// ============================================================
// Public read: wszystkie kolekcje (sortowane po nazwie)
// ============================================================
const fetchAllCollections = unstable_cache(
  async (): Promise<Collection[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("collections")
      .select("*")
      .order("label", { ascending: true });
    return (data ?? []) as Collection[];
  },
  ["collections-all"],
  { tags: [COLLECTIONS_CACHE_TAG], revalidate: 300 }
);

export const getAllCollections = cache(fetchAllCollections);

// ============================================================
// Pobierz pojedynczą kolekcję po slug lub id
// ============================================================
export async function getCollection(
  slugOrId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Collection | null> {
  const all = await getAllCollections();
  const found =
    all.find((c) => c.slug === slugOrId || c.id === slugOrId) ?? null;
  return found ? localizeCollection(found, locale) : null;
}

// ============================================================
// Produkty z tej samej kolekcji (oprócz aktualnego)
// ============================================================
// Używane w sekcji "Pełna kolekcja" na karcie produktu (pkt 9+12e).
export async function getCollectionSiblings(
  collectionId: string,
  excludeProductId: string,
  limit = 8,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("collection_id", collectionId)
    .neq("id", excludeProductId)
    .order("name", { ascending: true })
    .limit(limit);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

// ============================================================
// Kafelki kolekcji na stronę główną
// ============================================================
// HOME_COLLECTIONS_VISIBLE, CollectionProductRow, CollectionTile:
// definicje w collection-tiles-shared.ts (re-eksport wyżej).

// Wspólne dla strony głównej i panelu — żeby "aktywny produkt" miał jedną
// definicję po obu stronach i nie rozjechał się przy zmianie warunku.
export function countActiveProductsByCollection(
  rows: CollectionProductRow[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.collection_id) continue;
    counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
  }
  return counts;
}

// Cała logika składania kafelków — bez I/O, więc testowalna bez bazy.
export function buildCollectionTiles(
  collections: Collection[],
  rows: CollectionProductRow[],
  locale: Locale
): CollectionTile[] {
  const counts = countActiveProductsByCollection(rows);

  // Zdjęcia tylko z produktów, KTÓRE JE MAJĄ. Dotąd produkt bez zdjęcia
  // zajmował miejsce w mozaice i zostawał po nim szary prostokąt.
  const thumbnails = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.collection_id) continue;
    const first = r.images?.[0];
    if (!first) continue;
    const arr = thumbnails.get(r.collection_id) ?? [];
    if (arr.length < 4) arr.push(first);
    thumbnails.set(r.collection_id, arr);
  }

  return collections
    .filter((c) => c.show_on_home && (counts.get(c.id) ?? 0) > 0)
    .sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pl")
    )
    .map((c) => ({
      collection: localizeCollection(c, locale),
      thumbnails: thumbnails.get(c.id) ?? [],
      productCount: counts.get(c.id) ?? 0,
    }));
}

// Indeks pozycji, PO której panel rysuje kreskę "poniżej dopiero po
// rozwinięciu". Liczy tylko kolekcje, które realnie trafią na stronę —
// liczenie wszystkich wierszy pokazywałoby granicę w złym miejscu.
// null = widocznych jest 6 lub mniej, więc kreski nie ma.
export function foldAfterIndex(
  collections: Collection[],
  counts: Map<string, number>
): number | null {
  let shown = 0;
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    if (c.show_on_home && (counts.get(c.id) ?? 0) > 0) shown++;
    if (shown === HOME_COLLECTIONS_VISIBLE) return i;
  }
  return null;
}

// Cienka skorupa nad buildCollectionTiles: dwa zapytania i nic więcej.
export async function getCollectionTilesForHome(
  locale: Locale = DEFAULT_LOCALE
): Promise<CollectionTile[]> {
  const collections = await getAllCollections();
  if (collections.length === 0) return [];

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("collection_id, images")
    .eq("is_active", true)
    .not("collection_id", "is", null)
    .order("name", { ascending: true });

  // Dotąd błąd był ignorowany bez śladu: awaria bazy = sekcja znika ze strony
  // głównej i nikt nie wie dlaczego. Znikanie zostaje (jedenaście kafelków
  // z szarymi prostokątami wygląda na zepsute bardziej), ale z logiem.
  if (error) {
    console.error("[collections] produkty do kafelków niedostępne:", error);
    return [];
  }

  return buildCollectionTiles(
    collections,
    (data ?? []) as CollectionProductRow[],
    locale
  );
}

// ============================================================
// Inwalidacja cache
// ============================================================
export function invalidateCollectionsCache() {
  revalidateTag(COLLECTIONS_CACHE_TAG, "max");
}
