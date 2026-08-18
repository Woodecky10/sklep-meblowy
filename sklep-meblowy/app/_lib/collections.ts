// Helpery do tabeli collections — grupowanie produktów (np. "Kolekcja Lisbon").
// Edytowane przez admin panel /admin/kolekcje.
//
// Ten moduł ma server-only importy (next/cache, supabase/server → next/headers)
// — `import "server-only"` niżej zamienia ciche wysypanie builda Turbopacka na
// jawny błąd, gdyby ktoś zaimportował ten plik z komponentu klienckiego.
// Czysta logika kafelków (bez I/O) żyje w collection-tiles.ts — importuj
// stamtąd, NIE re-eksportu tutaj (patrz historia w commitach: re-eksport
// maskował, że collections.ts jest "zatruty" server-only importami).
import "server-only";

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeProduct, localizeCollection } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Collection, Product } from "./types";
import {
  buildCollectionTiles,
  COLLECTION_TILE_COLUMNS,
  type CollectionProductRow,
  type CollectionTile,
} from "./collection-tiles";

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
    // Kolejność ustawiona przez admina (migracja 75). Tu NIE ma parametrów
    // adresu, więc nie ma czego ustępować — sekcja „Pełna kolekcja" zawsze
    // pokazuje kolekcję tak, jak ułożył ją właściciel.
    .order("collection_sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}

// ============================================================
// Kafelki kolekcji na stronę główną
// ============================================================
// Cienka skorupa nad buildCollectionTiles (collection-tiles.ts): dwa
// zapytania i nic więcej — cała logika filtrowania/sortowania/liczenia jest
// w czystym module, testowana bez bazy.
export async function getCollectionTilesForHome(
  locale: Locale = DEFAULT_LOCALE
): Promise<CollectionTile[]> {
  const collections = await getAllCollections();
  if (collections.length === 0) return [];

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    // Lista kolumn z collection-tiles.ts (COLLECTION_TILE_COLUMNS) — musi
    // odpowiadać CollectionProductRow, patrz komentarz przy stałej.
    .select(COLLECTION_TILE_COLUMNS)
    // Optymalizacja pasma (nie ściągamy nieaktywnych produktów) — NIE jest
    // źródłem prawdy o aktywności. Źródło prawdy: isActiveProductRow w
    // collection-tiles.ts, którego Task 4 (panel, bez tego filtra SQL) też
    // używa. Nie usuwaj tego `.eq` myśląc, że jest zbędny — to tylko wydajność.
    .eq("is_active", true)
    .not("collection_id", "is", null)
    // Kolejność admina (migracja 75) decyduje, KTÓRE cztery zdjęcia trafią do
    // mozaiki kafelka — buildCollectionTiles bierze pierwsze cztery unikalne
    // z tego, co dostanie. Wcześniej rozstrzygała o tym nazwa produktu, czyli
    // przypadek. Sortowanie robi SQL, więc `collection_sort_order` NIE musi
    // być w COLLECTION_TILE_COLUMNS.
    .order("collection_sort_order", { ascending: true })
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
