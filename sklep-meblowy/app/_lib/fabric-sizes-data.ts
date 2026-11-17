// Odczyt rozmiarów mebli do dopłat za tkaninę (tabela fabric_sizes, migracja 86).
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { withFallback } from "./cache-fallback";
import { parseSurchargeByCode, type FabricSize } from "./fabric-sizes";

export const FABRIC_SIZES_CACHE_TAG = "fabric-sizes";

// Błąd bazy RZUCA (nie []) — patrz cache-fallback.ts.
const fetchFabricSizes = unstable_cache(
  async (): Promise<FabricSize[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("fabric_sizes")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as FabricSize[]).map((row) => ({
      ...row,
      surcharges: parseSurchargeByCode(row.surcharges) ?? {},
    }));
  },
  ["fabric-sizes-all"],
  { tags: [FABRIC_SIZES_CACHE_TAG], revalidate: 300 }
);

export const getFabricSizes = cache(
  (): Promise<FabricSize[]> => withFallback("fabric-sizes", fetchFabricSizes, [])
);

export function invalidateFabricSizesCache(): void {
  revalidateTag(FABRIC_SIZES_CACHE_TAG, "max");
}
