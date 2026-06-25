// Warstwa danych tabeli fabrics — katalog tkanin (admin: /admin/tkaniny).
// Czyste helpery (buildFabricDeMap, applyFabricSelection) są w variants.ts.
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { buildFabricDeMap } from "./variants";
import type { Fabric } from "./types";

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

export function invalidateFabricsCache(): void {
  revalidateTag(FABRICS_CACHE_TAG, "max");
}
