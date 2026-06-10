import type { OrderStatus } from "./types";

// ============================================================
// Sync statusów zamówień BaseLinker → sklep
// ============================================================
// Mapowanie status_id BL (dowolne, per konto) → nasz enum, przez env (set-once).
// Forward-only z wyjątkiem cancelled. Patrz docs/bl-status-sync-design.md.

export type ShopTargetStatus = "processing" | "shipped" | "delivered" | "cancelled";

export type StatusIdConfig = {
  processing: Set<number>;
  shipped: Set<number>;
  delivered: Set<number>;
  cancelled: Set<number>;
};

// CSV id-ków ("12, 34 ,56") → Set<number>; ignoruje puste/śmieci.
function parseIds(csv: string | undefined): Set<number> {
  const out = new Set<number>();
  for (const part of (csv ?? "").split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return out;
}

export function parseStatusIdConfig(env: {
  BL_STATUS_PROCESSING_IDS?: string;
  BL_STATUS_SHIPPED_IDS?: string;
  BL_STATUS_DELIVERED_IDS?: string;
  BL_STATUS_CANCELLED_IDS?: string;
}): StatusIdConfig {
  return {
    processing: parseIds(env.BL_STATUS_PROCESSING_IDS),
    shipped: parseIds(env.BL_STATUS_SHIPPED_IDS),
    delivered: parseIds(env.BL_STATUS_DELIVERED_IDS),
    cancelled: parseIds(env.BL_STATUS_CANCELLED_IDS),
  };
}

export function isStatusConfigEmpty(cfg: StatusIdConfig): boolean {
  return (
    cfg.processing.size === 0 &&
    cfg.shipped.size === 0 &&
    cfg.delivered.size === 0 &&
    cfg.cancelled.size === 0
  );
}

// BL status_id → nasz stan docelowy (null = brak mapowania).
export function mapBlStatusToShop(
  statusId: number,
  cfg: StatusIdConfig
): ShopTargetStatus | null {
  if (cfg.cancelled.has(statusId)) return "cancelled";
  if (cfg.delivered.has(statusId)) return "delivered";
  if (cfg.shipped.has(statusId)) return "shipped";
  if (cfg.processing.has(statusId)) return "processing";
  return null;
}

const RANK: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

// Decyzja: na jaki status przepiąć (null = nie ruszaj). Terminalne
// (delivered/cancelled) nietykalne; cancelled z dowolnego in-flight; reszta
// tylko „do przodu".
export function decideStatusUpdate(
  current: OrderStatus,
  target: ShopTargetStatus | null
): ShopTargetStatus | null {
  if (target === null) return null;
  if (current === "cancelled" || current === "delivered") return null;
  if (target === "cancelled") return "cancelled";
  return (RANK[target] ?? 0) > (RANK[current] ?? 0) ? target : null;
}

// --- Orchestrator ---

export type InflightOrder = {
  id: string;
  status: OrderStatus;
  baselinker_order_id: string;
};
export type StatusFetcher = (blOrderId: string) => Promise<number | null>;
export type StatusApplier = (
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: ShopTargetStatus
) => Promise<boolean>;

export type StatusSyncSummary = {
  scanned: number;
  updated: number;
  notFoundInBl: number;
  failed: number;
  breakdown: Record<ShopTargetStatus, number>;
};

export async function reconcileOrderStatuses(
  orders: InflightOrder[],
  cfg: StatusIdConfig,
  fetchStatus: StatusFetcher,
  applyUpdate: StatusApplier
): Promise<StatusSyncSummary> {
  const breakdown: Record<ShopTargetStatus, number> = {
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  let updated = 0;
  let notFoundInBl = 0;
  let failed = 0;

  // Sekwencyjnie — limity API BL; błąd jednego zamówienia nie przerywa sweepa.
  for (const order of orders) {
    try {
      const statusId = await fetchStatus(order.baselinker_order_id);
      if (statusId == null) {
        notFoundInBl += 1;
        continue;
      }
      const next = decideStatusUpdate(order.status, mapBlStatusToShop(statusId, cfg));
      if (!next) continue;
      const ok = await applyUpdate(order.id, order.status, next);
      if (ok) {
        updated += 1;
        breakdown[next] += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { scanned: orders.length, updated, notFoundInBl, failed, breakdown };
}
