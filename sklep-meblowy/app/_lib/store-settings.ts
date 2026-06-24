import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { DEFAULT_EUR_RATE } from "./eur-constants";

// Re-export so existing importers of DEFAULT_EUR_RATE from store-settings keep working.
export { DEFAULT_EUR_RATE };

// Kurs PLN->EUR (ile € za 1 zł). cache() => jeden odczyt na request, niezależnie
// od liczby komponentów serwerowych, które go wołają.
export const getEurRate = cache(async (): Promise<number> => {
  try {
    const supabase = await createClient();
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
});
