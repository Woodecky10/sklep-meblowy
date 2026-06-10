// Czysta orchestracja rekoncyliacji pushów BL — bez Supabase i HTTP, w pełni
// testowalna. Route handler dostarcza listę id + funkcję pushOne (zwykle
// pushOrderToBaseLinker). Patrz docs/reconcile-bl-cron-design.md.

export type ReconcileOutcome = "pushed" | "in_progress" | "skipped" | "failed";

export type ReconcileResultRow = {
  orderId: string;
  outcome: ReconcileOutcome;
  baselinker_order_id?: number | null;
  reason?: string;
};

export type ReconcileSummary = {
  scanned: number;
  pushed: number;
  in_progress: number;
  skipped: number;
  failed: number;
  results: ReconcileResultRow[];
};

// Kształt zgodny z tym, co zwraca pushOrderToBaseLinker.
export type PushResult = { baselinker_order_id: number | null; reason?: string };
export type PushOne = (orderId: string) => Promise<PushResult>;

// "push w toku" w reason = świeży sentinel / przegrany CAS → spróbujemy ponownie
// w następnym przebiegu; to NIE jest skip ani fail.
function classify(orderId: string, res: PushResult): ReconcileResultRow {
  if (res.baselinker_order_id != null) {
    return { orderId, outcome: "pushed", baselinker_order_id: res.baselinker_order_id };
  }
  if (res.reason && res.reason.includes("push w toku")) {
    return { orderId, outcome: "in_progress", reason: res.reason };
  }
  return { orderId, outcome: "skipped", reason: res.reason };
}

export async function reconcileOrders(
  orderIds: string[],
  pushOne: PushOne
): Promise<ReconcileSummary> {
  const results: ReconcileResultRow[] = [];
  // Sekwencyjnie — szanujemy limity API BaseLinkera; błąd jednego zamówienia
  // nie przerywa sweepa pozostałych.
  for (const orderId of orderIds) {
    try {
      results.push(classify(orderId, await pushOne(orderId)));
    } catch (err) {
      results.push({
        orderId,
        outcome: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const count = (o: ReconcileOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    scanned: results.length,
    pushed: count("pushed"),
    in_progress: count("in_progress"),
    skipped: count("skipped"),
    failed: count("failed"),
    results,
  };
}
