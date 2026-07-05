import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { DEFAULT_EUR_RATE } from "./eur-constants";

// Re-export so existing importers of DEFAULT_EUR_RATE from store-settings keep working.
export { DEFAULT_EUR_RATE };

export const EUR_RATE_CACHE_TAG = "eur-rate";

// Kurs PLN->EUR (ile € za 1 zł). Kurs zmienia się WYŁĄCZNIE w /admin/ustawienia
// (tam revalidateTag) → unstable_cache (300 s = siatka bezpieczeństwa) zamiast
// odczytu DB per request. Wewnątrz unstable_cache nie wolno używać cookies()
// → czysty klient anon (store_settings ma publiczny odczyt RLS — dotąd też
// czytane anon-kluczem).
export const getEurRate = unstable_cache(
  async (): Promise<number> => {
    try {
      const supabase = createBareAnonClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("store_settings")
        .select("eur_rate")
        .eq("id", true)
        .single();
      const rate = data ? Number((data as { eur_rate: number }).eur_rate) : NaN;
      return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_RATE;
    } catch (err) {
      console.error("[store-settings] getEurRate failed, using DEFAULT_EUR_RATE", err);
      return DEFAULT_EUR_RATE;
    }
  },
  ["eur-rate"],
  { tags: [EUR_RATE_CACHE_TAG], revalidate: 300 }
);
