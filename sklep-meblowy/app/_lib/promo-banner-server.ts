import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { normalizePromo, type PromoBannerData } from "./promo-banner";

export const PROMO_CACHE_TAG = "promo";

// Baner zmienia się WYŁĄCZNIE w /admin/strona-glowna (tam revalidateTag).
// Bare anon client (store_settings publiczny odczyt). Fallback per wywołanie:
// przy błędzie baner po prostu się nie pokaże (enabled=false).
const fetchPromo = unstable_cache(
  async (): Promise<PromoBannerData> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("promo_enabled, promo_text, promo_text_de, promo_link, promo_color")
      .eq("id", true)
      .single();
    if (error) throw error;
    return normalizePromo(data);
  },
  ["promo-banner"],
  { tags: [PROMO_CACHE_TAG], revalidate: 300 }
);

export async function getPromoBanner(): Promise<PromoBannerData> {
  try {
    return await fetchPromo();
  } catch (err) {
    console.error("[promo-banner-server] getPromoBanner failed, banner off", err);
    return { enabled: false, text: null, text_de: null, link: null, color: "gold" };
  }
}

export function invalidatePromoCache() {
  revalidateTag(PROMO_CACHE_TAG, "max");
}
