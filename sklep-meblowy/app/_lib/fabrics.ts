// Warstwa danych tabeli fabrics — katalog tkanin (admin: /admin/tkaniny).
// Czyste helpery (buildFabricDeMap, applyFabricSelection) są w variants.ts.
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { buildFabricDeMap, buildFabricImageMap, buildFabricMetaMap, type FabricValueMeta } from "./variants";
import type { Fabric, FabricPriceGroup } from "./types";

export const FABRICS_CACHE_TAG = "fabrics";

const fetchAllFabrics = unstable_cache(
  async (): Promise<Fabric[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("fabrics")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    return (data ?? []) as Fabric[];
  },
  ["fabrics-all"],
  { tags: [FABRICS_CACHE_TAG], revalidate: 300 }
);

// Lista wszystkich tkanin (cache per request + unstable_cache z tagiem).
export const getAllFabrics = cache(fetchAllFabrics);

// Mapa PL→DE do renderu wartości wariantu „Tkanina" na /de.
export async function getFabricDeMap(): Promise<Record<string, string>> {
  return buildFabricDeMap(await getAllFabrics());
}

// Mapa wartość „Nazwa Numer" → URL zdjęcia próbki (do próbek na sklepie).
export async function getFabricImageMap(): Promise<Record<string, string>> {
  return buildFabricImageMap(await getAllFabrics());
}

export function invalidateFabricsCache(): void {
  revalidateTag(FABRICS_CACHE_TAG, "max");
}

export const FABRIC_GROUPS_CACHE_TAG = "fabric-groups";

const fetchFabricPriceGroups = unstable_cache(
  async (): Promise<FabricPriceGroup[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("fabric_groups")
      .select("*")
      .order("sort_order", { ascending: true });
    return (data ?? []) as FabricPriceGroup[];
  },
  ["fabric-groups-all"],
  { tags: [FABRIC_GROUPS_CACHE_TAG], revalidate: 300 }
);

// Grupy cenowe tkanin (Standard/Premium/Premium High), rosnąco po sort_order.
export const getFabricPriceGroups = cache(fetchFabricPriceGroups);

export function invalidateFabricGroupsCache(): void {
  revalidateTag(FABRIC_GROUPS_CACHE_TAG, "max");
}

// Tkanina po slugu (strona /tkaniny/[slug]). Lookup w cache'owanej liście —
// przy ~200 tkaninach szybsze i prostsze niż osobne zapytanie.
export async function getFabricBySlug(slug: string): Promise<Fabric | null> {
  const fabrics = await getAllFabrics();
  return fabrics.find((f) => f.slug === slug) ?? null;
}

// Mapa wartość wariantu → metadane tkaniny (slug + grupa) — seed kontekstu
// klienckiego na karcie produktu (FabricMetaProvider).
export async function getFabricMetaMap(): Promise<Record<string, FabricValueMeta>> {
  const [fabrics, groups] = await Promise.all([getAllFabrics(), getFabricPriceGroups()]);
  return buildFabricMetaMap(fabrics, groups);
}
