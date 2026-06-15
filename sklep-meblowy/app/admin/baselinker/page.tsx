import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getSyncLog } from "./actions";
import BaseLinkerSyncPanel from "./BaseLinkerSyncPanel";

export const metadata = { title: "BaseLinker — Admin" };

export default async function AdminBaseLinkerPage() {
  await requireAdmin();
  const [logs, pendingTranslations] = await Promise.all([
    getSyncLog(20),
    getPendingTranslationCount(),
  ]);

  return (
    <BaseLinkerSyncPanel
      initialLogs={logs}
      pendingTranslations={pendingTranslations}
    />
  );
}

// Ile produktów czeka na tłumaczenie DE (needs_translation=true). Pokazywane
// w panelu nad przyciskiem "Przetłumacz zaległe (DE)". Brak migracji 29 →
// kolumna nie istnieje → zwracamy 0 (panel pokaże "0 zaległych").
async function getPendingTranslationCount(): Promise<number> {
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
