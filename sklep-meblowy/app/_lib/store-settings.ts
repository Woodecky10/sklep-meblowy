import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

// Fallback gdy DB nie zwróci sensownego kursu (np. migracja jeszcze nie odpalona).
// Ta sama wartość co seed migracji 33.
export const DEFAULT_EUR_RATE = 0.23;

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
