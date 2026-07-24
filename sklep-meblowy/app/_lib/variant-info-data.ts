import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { buildVariantInfoMap, type VariantInfoEntry, type VariantInfoRow } from "./variant-info";

export const VARIANT_INFO_CACHE_TAG = "variant_info";

const fetchVariantInfoRows = unstable_cache(
  async (): Promise<VariantInfoRow[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("variant_info")
      .select("option_name, value, info, info_de");
    return (data ?? []) as VariantInfoRow[];
  },
  ["variant-info-all"],
  { tags: [VARIANT_INFO_CACHE_TAG], revalidate: 300 }
);

// Globalna mapa (opcja+wartość) → {info, info_de}. Tabela mała → jeden odczyt.
export const getVariantInfoMap = cache(
  async (): Promise<Record<string, VariantInfoEntry>> =>
    buildVariantInfoMap(await fetchVariantInfoRows())
);

export function invalidateVariantInfoCache(): void {
  revalidateTag(VARIANT_INFO_CACHE_TAG, "max");
}
