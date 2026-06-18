"use server";

import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";

// Sync produktów z BaseLinker jest wyłączony (produkty zarządzane natywnie
// w sklepie) — dawna akcja `syncProductsAction` została usunięta. Panel BL to
// teraz read-only archiwum: poniżej zostaje tylko odczyt historii synchronizacji.

// ============================================================
// Pobiera log historii sync (do tabeli w admin)
// ============================================================

export type SyncLogRow = {
  id: string;
  triggered_by: string | null;
  triggered_by_email: string | null;
  triggered_at: string;
  duration_ms: number | null;
  status: "success" | "partial" | "error";
  total_in_bl: number;
  inserted: number;
  updated: number;
  skipped_count: number;
  results: unknown;
  report: unknown;
  error_message: string | null;
};

export async function getSyncLog(limit = 20): Promise<SyncLogRow[]> {
  await requireAdmin();
  const supabase = await createAdminClient();

  const { data: logs, error } = await supabase
    .from("baselinker_sync_log")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(limit);

  // Awaria odczytu nie może wyglądać jak pusta historia — zostaw ślad w logu
  // serwera (UI i tak pokaże pustkę, ale przyczyna jest diagnozowalna).
  if (error) {
    console.error("[BL] odczyt baselinker_sync_log nieudany:", error.message);
  }

  const rows = (logs ?? []) as Array<Omit<SyncLogRow, "triggered_by_email">>;
  if (rows.length === 0) return [];

  // Dociągnij maile triggered_by — admin/auth.users z service role
  const userIds = Array.from(
    new Set(rows.map((r) => r.triggered_by).filter((v): v is string => !!v))
  );

  const idToEmail = new Map<string, string | null>();
  for (const id of userIds) {
    const { data } = await supabase.auth.admin.getUserById(id);
    idToEmail.set(id, data.user?.email ?? null);
  }

  return rows.map((r) => ({
    ...r,
    triggered_by_email: r.triggered_by ? idToEmail.get(r.triggered_by) ?? null : null,
  }));
}
