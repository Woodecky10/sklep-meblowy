"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  syncProductsFromBaseLinker,
  logSyncOutcome,
  type SyncOutcome,
} from "@/app/_lib/baselinker-sync";

export type SyncActionResult =
  | {
      ok: true;
      duration_ms: number;
      outcome: Extract<SyncOutcome, { ok: true }>;
    }
  // duration_ms spójnie z gałęzią sukcesu i kolumną DB (wcześniej camelCase
  // durationMs tylko w gałęzi błędu — rozjazd nazw UI↔API).
  | { ok: false; error: string; duration_ms: number };

// ============================================================
// Wywoływane z admin panelu — przycisk "Synchronizuj teraz"
// ============================================================
export async function syncProductsAction(): Promise<SyncActionResult> {
  await requireAdmin();

  // Pobierz user_id żeby zalogować kto wywołał sync
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const triggeredBy = user?.id ?? null;

  const startedAt = Date.now();
  const outcome = await syncProductsFromBaseLinker();
  const durationMs = Date.now() - startedAt;

  // Best-effort log
  await logSyncOutcome(outcome, durationMs, triggeredBy).catch((err) => {
    console.error("[BL sync] zapis logu nieudany:", err);
  });

  // Inwalidacja stron które pokazują produkty
  revalidatePath("/admin/baselinker");
  revalidatePath("/sklep");
  revalidatePath("/");

  if (!outcome.ok) {
    return { ok: false, error: outcome.error, duration_ms: durationMs };
  }

  return { ok: true, duration_ms: durationMs, outcome };
}

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
