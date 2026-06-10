# Sync statusów BL → sklep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ciągnąć aktualny status zamówienia z BaseLinkera do `orders.status`, żeby klient widział „Wysłane/Dostarczone/Anulowane".

**Architecture:** Czysta logika (mapowanie env + forward-only + orchestrator) w `baselinker-status-sync.ts`; cienki `getOrders` w `baselinker.ts`; guarded update w `orders.ts`; wiring w istniejącym cronie `reconcile-bl`. Status BL pobierany per zamówienie (`getOrders({ order_id })`).

**Tech Stack:** Next.js 16 route handler, Supabase (createAdminClient), BaseLinker API (blRequest), vitest.

Spec: `docs/bl-status-sync-design.md`.

---

### Task 1: Czysta logika status-sync + testy (TDD)

**Files:**
- Create: `app/_lib/baselinker-status-sync.ts`
- Test: `app/_lib/__tests__/baselinker-status-sync.test.ts`

- [ ] **Step 1: Napisz failujący test**

```typescript
import { describe, it, expect } from "vitest";
import {
  parseStatusIdConfig,
  isStatusConfigEmpty,
  mapBlStatusToShop,
  decideStatusUpdate,
  reconcileOrderStatuses,
  type InflightOrder,
} from "../baselinker-status-sync";

const cfg = parseStatusIdConfig({
  BL_STATUS_PROCESSING_IDS: "1, 2",
  BL_STATUS_SHIPPED_IDS: "3",
  BL_STATUS_DELIVERED_IDS: "4",
  BL_STATUS_CANCELLED_IDS: "9",
});

describe("parseStatusIdConfig / isStatusConfigEmpty", () => {
  it("parsuje CSV, ignoruje puste/śmieci/spacje", () => {
    const c = parseStatusIdConfig({ BL_STATUS_SHIPPED_IDS: " 3, x, ,4 " });
    expect([...c.shipped].sort((a, b) => a - b)).toEqual([3, 4]);
    expect(c.delivered.size).toBe(0);
  });
  it("isStatusConfigEmpty true gdy nic nie ustawione", () => {
    expect(isStatusConfigEmpty(parseStatusIdConfig({}))).toBe(true);
    expect(isStatusConfigEmpty(cfg)).toBe(false);
  });
});

describe("mapBlStatusToShop", () => {
  it("mapuje każdy stan", () => {
    expect(mapBlStatusToShop(1, cfg)).toBe("processing");
    expect(mapBlStatusToShop(3, cfg)).toBe("shipped");
    expect(mapBlStatusToShop(4, cfg)).toBe("delivered");
    expect(mapBlStatusToShop(9, cfg)).toBe("cancelled");
  });
  it("brak mapowania → null", () => {
    expect(mapBlStatusToShop(999, cfg)).toBeNull();
  });
});

describe("decideStatusUpdate", () => {
  it("forward OK", () => {
    expect(decideStatusUpdate("paid", "shipped")).toBe("shipped");
    expect(decideStatusUpdate("paid", "processing")).toBe("processing");
    expect(decideStatusUpdate("shipped", "delivered")).toBe("delivered");
  });
  it("backward / ten sam → null", () => {
    expect(decideStatusUpdate("shipped", "processing")).toBeNull();
    expect(decideStatusUpdate("shipped", "shipped")).toBeNull();
  });
  it("cancelled z in-flight, nie z terminalnych", () => {
    expect(decideStatusUpdate("paid", "cancelled")).toBe("cancelled");
    expect(decideStatusUpdate("shipped", "cancelled")).toBe("cancelled");
    expect(decideStatusUpdate("cancelled", "cancelled")).toBeNull();
    expect(decideStatusUpdate("delivered", "cancelled")).toBeNull();
  });
  it("terminalne (delivered) nie rusza się; brak mapowania → null", () => {
    expect(decideStatusUpdate("delivered", "shipped")).toBeNull();
    expect(decideStatusUpdate("paid", null)).toBeNull();
  });
});

describe("reconcileOrderStatuses", () => {
  const orders: InflightOrder[] = [
    { id: "o1", status: "paid", baselinker_order_id: "101" },
    { id: "o2", status: "shipped", baselinker_order_id: "102" },
    { id: "o3", status: "paid", baselinker_order_id: "103" },
    { id: "o4", status: "paid", baselinker_order_id: "104" },
    { id: "o5", status: "shipped", baselinker_order_id: "105" },
  ];
  const blStatus: Record<string, number | null> = { "101": 3, "102": 1, "103": null, "105": 9 };

  it("kategoryzuje i nie przerywa po błędzie", async () => {
    const applied: Array<[string, string, string]> = [];
    const summary = await reconcileOrderStatuses(
      orders,
      cfg,
      async (blId) => {
        if (blId === "104") throw new Error("BL timeout");
        return blStatus[blId] ?? null;
      },
      async (id, from, to) => {
        applied.push([id, from, to]);
        return true;
      }
    );
    expect(summary.scanned).toBe(5);
    expect(summary.updated).toBe(2);
    expect(summary.notFoundInBl).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.breakdown.shipped).toBe(1);
    expect(summary.breakdown.cancelled).toBe(1);
    expect(applied).toContainEqual(["o1", "paid", "shipped"]);
    expect(applied).toContainEqual(["o5", "shipped", "cancelled"]);
  });

  it("applyUpdate=false (CAS przegrał) nie liczy jako updated", async () => {
    const summary = await reconcileOrderStatuses(
      [{ id: "o1", status: "paid", baselinker_order_id: "101" }],
      cfg,
      async () => 3,
      async () => false
    );
    expect(summary.updated).toBe(0);
  });
});
```

- [ ] **Step 2: Uruchom — ma failować**

Run: `npm test -- baselinker-status-sync`
Expected: FAIL — `Cannot find module '../baselinker-status-sync'`.

- [ ] **Step 3: Zaimplementuj lib**

```typescript
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
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `npm test -- baselinker-status-sync`
Expected: PASS (wszystkie bloki).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/baselinker-status-sync.ts app/_lib/__tests__/baselinker-status-sync.test.ts
git commit -m "feat(bl): czysta logika sync statusów (mapowanie env + forward-only) + testy"
```

---

### Task 2: `getOrders` w BL API

**Files:**
- Modify: `app/_lib/baselinker.ts` (dodaj po `getOrderStatusList`, ~linia 264)

- [ ] **Step 1: Dodaj typ i funkcję**

```typescript
// Zamówienie z getOrders — tylko pola których używamy (BL zwraca więcej).
export type BLOrder = {
  order_id: number;
  status_id: number;
  date_add?: number;
  date_confirmed?: number;
  email?: string;
};

// getOrders — z order_id zwraca to jedno zamówienie z aktualnym status_id.
// (Bez order_id zwraca do 100 od date_confirmed_from — nieużywane tutaj.)
export async function getOrders(
  params: { orderId?: number; dateConfirmedFrom?: number; getUnconfirmed?: boolean },
  retry?: BlRetryOptions
): Promise<BLOrder[]> {
  const blParams: Record<string, unknown> = {};
  if (params.orderId != null) blParams.order_id = params.orderId;
  if (params.dateConfirmedFrom != null) blParams.date_confirmed_from = params.dateConfirmedFrom;
  if (params.getUnconfirmed) blParams.get_unconfirmed_orders = true;
  const res = await blRequest<{ orders: BLOrder[] }>("getOrders", blParams, retry);
  return res.orders ?? [];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero błędów.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/baselinker.ts
git commit -m "feat(bl): getOrders (odczyt aktualnego status_id zamówienia)"
```

---

### Task 3: Guarded update statusu w `orders.ts`

**Files:**
- Modify: `app/_lib/orders.ts` (import OrderStatus + nowa funkcja)

- [ ] **Step 1: Rozszerz import typu**

Zmień linię importu z `./types`:

```typescript
import type { Address, Order, OrderItem, OrderStatus } from "./types";
```

- [ ] **Step 2: Dodaj `applyBlStatus` (na końcu pliku)**

```typescript
// Przepnij status z BL (sync statusów). CAS na odczytanym statusie — nie
// nadpisujemy równoległej zmiany (np. webhook pending→paid). Zwraca true gdy
// faktycznie zmienił.
export async function applyBlStatus(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: toStatus } as never)
    .eq("id", orderId)
    .eq("status", fromStatus)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero błędów.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/orders.ts
git commit -m "feat(orders): applyBlStatus — guarded update statusu z BL (CAS)"
```

---

### Task 4: Wiring w cronie `reconcile-bl`

**Files:**
- Modify: `app/api/cron/reconcile-bl/route.ts`

- [ ] **Step 1: Dodaj importy (na górze)**

```typescript
import { getOrders } from "@/app/_lib/baselinker";
import { hasCompletedBlPush } from "@/app/_lib/baselinker-orders";
import { applyBlStatus } from "@/app/_lib/orders";
import {
  parseStatusIdConfig,
  isStatusConfigEmpty,
  reconcileOrderStatuses,
  type InflightOrder,
} from "@/app/_lib/baselinker-status-sync";
```

(`pushOrderToBaseLinker` i `reconcileOrders` zostają.)

- [ ] **Step 2: Dodaj stałe (obok BATCH_LIMIT)**

```typescript
const STATUS_BATCH_LIMIT = 100;
const INFLIGHT_STATUSES = ["paid", "processing", "shipped"];
const BL_READ_RETRY = { attempts: 3, baseDelayMs: 500 };
```

- [ ] **Step 3: Wstaw blok status-sync PRZED końcowym `return` (po `const summary = await reconcileOrders(...)` i jego `console.log`)**

```typescript
  // --- Pull statusów z BL (po push-sierot) ---
  const cfg = parseStatusIdConfig({
    BL_STATUS_PROCESSING_IDS: process.env.BL_STATUS_PROCESSING_IDS,
    BL_STATUS_SHIPPED_IDS: process.env.BL_STATUS_SHIPPED_IDS,
    BL_STATUS_DELIVERED_IDS: process.env.BL_STATUS_DELIVERED_IDS,
    BL_STATUS_CANCELLED_IDS: process.env.BL_STATUS_CANCELLED_IDS,
  });

  let statusSync: Record<string, unknown> = { configured: false };
  if (!isStatusConfigEmpty(cfg)) {
    const { data: inflightRows, error: inflightErr } = await supabase
      .from("orders")
      .select("id, status, baselinker_order_id")
      .in("status", INFLIGHT_STATUSES)
      .not("baselinker_order_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(STATUS_BATCH_LIMIT + 1);

    if (inflightErr) {
      console.error("[reconcile-bl] zapytanie in-flight nieudane:", inflightErr.message);
      statusSync = { configured: true, error: "Błąd zapytania in-flight" };
    } else {
      // Tylko prawdziwe BL id (nie sentinel pending:%).
      const inflight = ((inflightRows ?? []) as InflightOrder[]).filter((r) =>
        hasCompletedBlPush(r.baselinker_order_id)
      );
      const statusBacklog = inflight.length > STATUS_BATCH_LIMIT;
      const batch = inflight.slice(0, STATUS_BATCH_LIMIT);

      const fetchStatus = async (blOrderId: string): Promise<number | null> => {
        const orders = await getOrders(
          { orderId: Number(blOrderId), getUnconfirmed: true },
          BL_READ_RETRY
        );
        return orders[0]?.status_id ?? null;
      };

      const sync = await reconcileOrderStatuses(batch, cfg, fetchStatus, applyBlStatus);
      statusSync = { configured: true, backlog: statusBacklog, ...sync };
    }
  }

  console.log(`[reconcile-bl] status-sync ${JSON.stringify(statusSync)}`);
```

- [ ] **Step 4: Zmień końcowy `return`**

Z:
```typescript
  return NextResponse.json({ ...summary, backlog });
```
Na:
```typescript
  return NextResponse.json({ push: { ...summary, backlog }, statusSync });
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` oraz `npx eslint app/api/cron/reconcile-bl/route.ts`
Expected: zero błędów.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/reconcile-bl/route.ts
git commit -m "feat(bl): cron reconcile-bl ciągnie też statusy zamówień z BL"
```

---

### Task 5: Env w `.env.example`

**Files:**
- Modify: `app/../.env.example` (tj. `sklep-meblowy/.env.example`)

- [ ] **Step 1: Dodaj po bloku `CRON_SECRET`**

```
# Mapowanie statusów BaseLinker → status sklepu (sync statusów zamówień przez
# cron reconcile-bl). Listy numerycznych status_id BL po przecinku — id-ki z
# /api/baselinker/test (getOrderStatusList). Puste = sync statusów wyłączony.
BL_STATUS_PROCESSING_IDS=
BL_STATUS_SHIPPED_IDS=
BL_STATUS_DELIVERED_IDS=
BL_STATUS_CANCELLED_IDS=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(bl): env mapowania statusów BL → sklep"
```

---

### Task 6: Pełna weryfikacja

- [ ] **Step 1: Testy + typecheck + lint + build**

Run: `npm test` ; `npx tsc --noEmit` ; `npm run lint` ; `npm run build`
Expected: wszystko zielone (43 dotychczasowe + nowe testy status-sync); build OK, `/api/cron/reconcile-bl` w liście tras.

---

## Self-Review

- **Spec coverage:** getOrders (T2), mapowanie env + parse (T1), forward-only + cancelled-exception + terminalne (T1 decideStatusUpdate), in-flight + hasCompletedBlPush + limit/backlog (T4), per-order fetch getOrders({order_id}) (T4 fetchStatus), guarded CAS update (T3 applyBlStatus), rozszerzenie crona + kształt odpowiedzi (T4), graceful gdy env puste (T4 isStatusConfigEmpty), env (T5), testy czystej logiki + orchestratora (T1). Pokryte.
- **Placeholder scan:** brak TBD/TODO; cały kod kompletny.
- **Type consistency:** `StatusIdConfig`/`ShopTargetStatus`/`InflightOrder`/`StatusFetcher`/`StatusApplier`/`StatusSyncSummary` z T1 użyte spójnie w T4. `applyBlStatus(orderId, fromStatus: OrderStatus, toStatus: OrderStatus)` (T3) pasuje do `StatusApplier` (toStatus: ShopTargetStatus ⊆ OrderStatus). `getOrders` (T2) zwraca `BLOrder[]`, `fetchStatus` czyta `orders[0]?.status_id`. Zgodne.
- **Uwaga:** `INFLIGHT_STATUSES`/limit/backlog to logika route'a (T4), bez unit-testu — spójnie z repo (route handlery i wrappery Supabase/BL nietestowane jednostkowo).
