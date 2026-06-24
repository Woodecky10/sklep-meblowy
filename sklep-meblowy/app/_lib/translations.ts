// app/_lib/translations.ts
import { createAdminClient } from "@/app/_lib/supabase/server";

// Ile produktów czeka na ręczne tłumaczenie DE (needs_translation=true).
// Brak kolumny (migracja 29 nieodpalona) → zwracamy 0.
export async function getPendingTranslationCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("needs_translation", true);
  if (error) {
    console.error("[i18n] odczyt needs_translation count nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}
