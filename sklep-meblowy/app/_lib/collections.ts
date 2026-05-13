// Helpery do tabeli collections — grupowanie produktów (np. "Kolekcja Lisbon").
// Edytowane przez admin panel /admin/kolekcje.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { Collection, Product } from "./types";

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
  slugOrId: string
): Promise<Collection | null> {
  const all = await getAllCollections();
  return (
    all.find((c) => c.slug === slugOrId || c.id === slugOrId) ?? null
  );
}

// ============================================================
// Produkty z tej samej kolekcji (oprócz aktualnego)
// ============================================================
// Używane w sekcji "Pełna kolekcja" na karcie produktu (pkt 9+12e).
export async function getCollectionSiblings(
  collectionId: string,
  excludeProductId: string,
  limit = 8
): Promise<Product[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("collection_id", collectionId)
    .neq("id", excludeProductId)
    .order("name", { ascending: true })
    .limit(limit);
  return (data ?? []) as Product[];
}

// ============================================================
// Kolekcje + sample produkty dla home page (auto-display)
// ============================================================
// Zwraca tylko kolekcje które mają co najmniej jeden produkt — puste kolekcje
// nie pokazują się klientom. Dla każdej dodaje do 4 sample produktów żeby
// front mógł zrobić mozaikę miniaturek.
export async function getCollectionsForHome(): Promise<
  Array<{ collection: Collection; sampleProducts: Product[] }>
> {
  const supabase = await createAdminClient();
  const collections = await getAllCollections();
  if (collections.length === 0) return [];

  // Pobierz wszystkie produkty należące do dowolnej kolekcji jednym query
  const { data } = await supabase
    .from("products")
    .select("*")
    .not("collection_id", "is", null)
    .order("name", { ascending: true });

  const byCollection = new Map<string, Product[]>();
  for (const p of (data ?? []) as Product[]) {
    if (!p.collection_id) continue;
    const arr = byCollection.get(p.collection_id) ?? [];
    if (arr.length < 4) arr.push(p);
    byCollection.set(p.collection_id, arr);
  }

  return collections
    .map((collection) => ({
      collection,
      sampleProducts: byCollection.get(collection.id) ?? [],
    }))
    .filter((row) => row.sampleProducts.length > 0);
}

// ============================================================
// Inwalidacja cache
// ============================================================
export function invalidateCollectionsCache() {
  revalidateTag(COLLECTIONS_CACHE_TAG, "max");
}
