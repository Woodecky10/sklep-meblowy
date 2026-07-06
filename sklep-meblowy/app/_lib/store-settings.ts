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
const fetchEurRate = unstable_cache(
  async (): Promise<number> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("eur_rate")
      .eq("id", true)
      .single();
    if (error) throw error;
    const rate = Number((data as { eur_rate: number }).eur_rate);
    // Rzucamy (zamiast zwracać fallback), żeby unstable_cache NIE zapisał
    // wartości awaryjnej na 300 s — kurs trafia m.in. do wyceny w checkout.
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("invalid eur_rate");
    return rate;
  },
  ["eur-rate"],
  { tags: [EUR_RATE_CACHE_TAG], revalidate: 300 }
);

// Fallback per WYWOŁANIE (nie per wpis cache): błąd odczytu nie zamraża
// DEFAULT_EUR_RATE dla wszystkich — kolejne żądania ponawiają odczyt.
export async function getEurRate(): Promise<number> {
  try {
    return await fetchEurRate();
  } catch (err) {
    console.error("[store-settings] getEurRate failed, using DEFAULT_EUR_RATE", err);
    return DEFAULT_EUR_RATE;
  }
}
