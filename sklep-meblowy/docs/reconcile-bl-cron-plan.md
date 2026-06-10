# Cron rekoncyliacyjny BaseLinker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cykliczny endpoint, który znajduje opłacone zamówienia bez prawdziwego `baselinker_order_id` i ponawia push do BaseLinkera — auto-recovery dla znaleziska HIGH z code review.

**Architecture:** Cienki cron reużywający istniejącą `pushOrderToBaseLinker`. Czysta, testowalna orchestracja w `baselinker-reconcile.ts`; route handler robi auth + zapytanie (dwa proste filtry zamiast `.or()`+like) + wywołanie orchestratora. Vercel Cron (vercel.json) wyzwala endpoint.

**Tech Stack:** Next.js 16 route handler (GET), Supabase (createAdminClient), vitest, Vercel Cron.

Spec: `docs/reconcile-bl-cron-design.md`.

---

### Task 1: Czysty orchestrator + testy (TDD)

**Files:**
- Create: `app/_lib/baselinker-reconcile.ts`
- Test: `app/_lib/__tests__/baselinker-reconcile.test.ts`

- [ ] **Step 1: Napisz failujący test**

```typescript
import { describe, it, expect } from "vitest";
import { reconcileOrders, type PushResult } from "../baselinker-reconcile";

describe("reconcileOrders", () => {
  it("kategoryzuje pushed / in_progress / skipped / failed i nie przerywa pętli", async () => {
    const responses: Record<string, () => Promise<PushResult>> = {
      a: async () => ({ baselinker_order_id: 123 }),
      b: async () => ({ baselinker_order_id: null, reason: "push w toku (równoległe wywołanie)" }),
      c: async () => ({ baselinker_order_id: null, reason: "brak emaila klienta" }),
      d: async () => { throw new Error("BL padło"); },
    };
    const summary = await reconcileOrders(["a", "b", "c", "d"], (id) => responses[id]());

    expect(summary.scanned).toBe(4);
    expect(summary.pushed).toBe(1);
    expect(summary.in_progress).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results.find((r) => r.orderId === "a")?.baselinker_order_id).toBe(123);
    expect(summary.results.find((r) => r.orderId === "d")?.outcome).toBe("failed");
  });

  it("zachowuje kolejność i kontynuuje po błędzie", async () => {
    const summary = await reconcileOrders(["d", "e"], async (id) => {
      if (id === "d") throw new Error("boom");
      return { baselinker_order_id: 999 };
    });
    expect(summary.results.map((r) => r.outcome)).toEqual(["failed", "pushed"]);
    expect(summary.pushed).toBe(1);
  });

  it("pusta lista → zero wszystkiego", async () => {
    const summary = await reconcileOrders([], async () => ({ baselinker_order_id: 1 }));
    expect(summary).toMatchObject({ scanned: 0, pushed: 0, in_progress: 0, skipped: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm test -- baselinker-reconcile`
Expected: FAIL — `Cannot find module '../baselinker-reconcile'`.

- [ ] **Step 3: Zaimplementuj orchestrator**

```typescript
// Czysta orchestracja rekoncyliacji pushów BL — bez Supabase i HTTP, w pełni
// testowalna. Route handler dostarcza listę id + funkcję pushOne (zwykle
// pushOrderToBaseLinker).

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
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- baselinker-reconcile`
Expected: PASS (3 testy).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/baselinker-reconcile.ts app/_lib/__tests__/baselinker-reconcile.test.ts
git commit -m "feat(bl): czysty orchestrator rekoncyliacji pushów + testy"
```

---

### Task 2: Route handler crona

**Files:**
- Create: `app/api/cron/reconcile-bl/route.ts`

- [ ] **Step 1: Sprawdź konwencje Next 16 route handlerów**

Przeczytaj `node_modules/next/dist/docs/` (route handlers): sygnatura GET, czy GET jest cache'owany domyślnie (jeśli tak → `export const dynamic = "force-dynamic"`), kształt `NextRequest`/`NextResponse`. Cron MUSI działać świeżo (zero cache).

- [ ] **Step 2: Zaimplementuj endpoint**

```typescript
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
// Szczegóły: docs/reconcile-bl-cron-design.md

export const dynamic = "force-dynamic"; // potwierdź/dostosuj wg docs Next 16

const BATCH_LIMIT = 50;
const RECONCILE_STATUSES = ["paid", "processing", "shipped", "delivered"];

function isAuthorized(request: NextRequest, cronSecret?: string, syncSecret?: string): boolean {
  // Vercel Cron: Authorization: Bearer $CRON_SECRET.
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) return true;
  // Ręczny curl — spójnie z /api/baselinker/push-order.
  if (syncSecret && request.headers.get("x-sync-secret") === syncSecret) return true;
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
  // Dwa proste zapytania (równolegle) zamiast .or()+like — pewna składnia,
  // zero zgadywania wildcardów PostgREST. LIMIT+1 = detekcja zaległości.
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
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit` oraz `npx eslint app/api/cron/reconcile-bl/route.ts app/_lib/baselinker-reconcile.ts`
Expected: zero błędów. (Zweryfikuj, że `createAdminClient` jest faktycznie w `@/app/_lib/supabase/server` — popraw import jeśli inna ścieżka.)

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/reconcile-bl/route.ts
git commit -m "feat(bl): endpoint crona /api/cron/reconcile-bl (auth + zapytanie + sweep)"
```

---

### Task 3: Harmonogram Vercel + env

**Files:**
- Create: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Utwórz `vercel.json` (w katalogu projektu `sklep-meblowy/`)**

```json
{
  "crons": [
    {
      "path": "/api/cron/reconcile-bl",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Hobby = max raz dziennie (`0 3 * * *`). Po przejściu na Pro zmień `schedule` na `*/15 * * * *`.

- [ ] **Step 2: Dodaj `CRON_SECRET` do `.env.example`**

Wstaw w sekcji „Aplikacja":

```
# Sekret dla Vercel Cron (/api/cron/reconcile-bl). Vercel dokleja go jako
# `Authorization: Bearer`. Ustaw w panelu Vercel → Settings → Environment Variables
# (i w .env.local do ręcznego testu przez nagłówek Authorization albo x-sync-secret).
CRON_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json .env.example
git commit -m "chore(bl): harmonogram Vercel Cron + env CRON_SECRET dla rekoncyliacji"
```

---

### Task 4: Pełna weryfikacja

- [ ] **Step 1: Cały zestaw testów + typecheck + lint**

Run: `npm test` ; `npx tsc --noEmit` ; `npm run lint`
Expected: wszystko zielone (poprzednie 40 testów + 3 nowe = 43).

- [ ] **Step 2: (opcjonalnie) build**

Run: `npm run build`
Expected: sukces; route `/api/cron/reconcile-bl` w liście tras.

---

## Self-Review

- **Spec coverage:** endpoint (T2), auth dual-secret (T2), zapytanie paid+/NULL+sentinel (T2), pętla+kategoryzacja+reużycie pushOrderToBaseLinker (T1/T2), trade-off sentineli = auto-fix przez reużycie funkcji (T2, bez dodatkowego kodu — funkcja sama przejmuje stale sentinel), limit+backlog (T2, route-level), harmonogram (T3), env CRON_SECRET (T3), testy orchestratora (T1). Pokryte.
- **Uwaga (odstępstwo od spec):** `backlog`/limit są logiką route'a, nie orchestratora — dlatego testy T1 ich nie sprawdzają (route bez unit-testu, spójnie z repo). Spec wymieniał je w „testy" — świadomie route-level.
- **Placeholder scan:** brak TBD/TODO; cały kod kompletny.
- **Type consistency:** `PushResult`/`PushOne`/`ReconcileSummary` zdefiniowane w T1 i użyte w T2 (`reconcileOrders(orderIds, pushOrderToBaseLinker)` — `pushOrderToBaseLinker` zwraca `{baselinker_order_id:number|null, reason?:string}` = `PushResult`). Zgodne.
