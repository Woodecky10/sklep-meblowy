import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { pushOrderToBaseLinker } from "@/app/_lib/baselinker-orders";
import { reconcileOrders } from "@/app/_lib/baselinker-reconcile";

// ============================================================
// GET /api/cron/reconcile-bl
// ============================================================
// Siatka bezpieczeństwa pod best-effort pushem zamówień do BL. Znajduje
// opłacone zamówienia bez PRAWDZIWEGO baselinker_order_id (NULL albo osierocony
// sentinel pending:<ts>) i ponawia push. Wołane przez Vercel Cron (vercel.json)
// — Vercel dokleja Authorization: Bearer $CRON_SECRET.
// Szczegóły i decyzje: docs/reconcile-bl-cron-design.md
//
// Next 16: route handlery NIE są cache'owane domyślnie, a ten czyta nagłówki +
// pyta DB (API request-time) → zawsze leci świeżo. Żaden `dynamic` nie trzeba.

const BATCH_LIMIT = 50;
const RECONCILE_STATUSES = ["paid", "processing", "shipped", "delivered"];

function isAuthorized(
  request: NextRequest,
  cronSecret?: string,
  syncSecret?: string
): boolean {
  // Vercel Cron: Authorization: Bearer $CRON_SECRET.
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }
  // Ręczny curl — spójnie z /api/baselinker/push-order.
  if (syncSecret && request.headers.get("x-sync-secret") === syncSecret) {
    return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.BASELINKER_SYNC_SECRET;
  if (!cronSecret && !syncSecret) {
    return NextResponse.json(
      { error: "Brak CRON_SECRET i BASELINKER_SYNC_SECRET — nic nie autoryzuje crona" },
      { status: 500 }
    );
  }
  if (!isAuthorized(request, cronSecret, syncSecret)) {
    return NextResponse.json({ error: "Nieautoryzowany" }, { status: 401 });
  }

  const supabase = await createAdminClient();
  const sel = "id, created_at";
  // NULL i sentinel pending:% to dwa rozłączne zbiory „push niedokończony".
  // Dwa proste zapytania (równolegle) zamiast .or()+like — pewna składnia, zero
  // zgadywania wildcardów PostgREST. LIMIT+1 = detekcja zaległości bez 2. query.
  const [nullRes, sentinelRes] = await Promise.all([
    supabase
      .from("orders")
      .select(sel)
      .in("status", RECONCILE_STATUSES)
      .is("baselinker_order_id", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT + 1),
    supabase
      .from("orders")
      .select(sel)
      .in("status", RECONCILE_STATUSES)
      .like("baselinker_order_id", "pending:%")
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT + 1),
  ]);

  if (nullRes.error || sentinelRes.error) {
    const msg = nullRes.error?.message ?? sentinelRes.error?.message;
    console.error("[reconcile-bl] zapytanie o kandydatów nieudane:", msg);
    return NextResponse.json({ error: "Błąd zapytania" }, { status: 500 });
  }

  const merged = [...(nullRes.data ?? []), ...(sentinelRes.data ?? [])] as {
    id: string;
    created_at: string;
  }[];
  // Najstarsze orphany najpierw (ISO timestamp → porównanie leksykalne OK), dedup po id.
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const uniqueIds = Array.from(new Set(merged.map((r) => r.id)));
  const backlog = uniqueIds.length > BATCH_LIMIT;
  const orderIds = uniqueIds.slice(0, BATCH_LIMIT);

  const summary = await reconcileOrders(orderIds, pushOrderToBaseLinker);

  console.log(
    `[reconcile-bl] scanned=${summary.scanned} pushed=${summary.pushed} ` +
      `in_progress=${summary.in_progress} skipped=${summary.skipped} ` +
      `failed=${summary.failed} backlog=${backlog}`
  );

  return NextResponse.json({ ...summary, backlog });
}
