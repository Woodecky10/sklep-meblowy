import { describe, it, expect, vi, beforeEach } from "vitest";

// Testy warstwy I/O próbek BEZ żywej bazy: klient Supabase jest atrapą, która
// zapisuje wywołania i oddaje zaprogramowane odpowiedzi. Chodzi o rzeczy,
// których czysta logika (sample-pricing.ts) nie widzi, a które kosztują
// pieniądze: normalizacja klucza puli, komplet argumentów RPC i kompensacja
// rezerwacji na każdej ścieżce błędu.
// ⚠️ Wyścigu dwóch równoległych zamówień tu NIE testujemy — to wymagałoby
// produkcyjnej bazy; został sprawdzony smoke'iem przy migracji 67.

type Result = { data?: unknown; error?: unknown };

type FakeClient = {
  rpcCalls: { name: string; params: Record<string, unknown> }[];
  ops: { table: string; op: string; args: unknown[] }[];
  rpc: (name: string, params: Record<string, unknown>) => Promise<Result>;
  from: (table: string) => unknown;
};

// Kolejki odpowiedzi per tabela / per RPC — kolejne wywołania tej samej tabeli
// (np. warunkowy update, a potem sprawdzenie istnienia) dostają kolejne wpisy.
function makeClient(cfg: {
  rpc?: Record<string, Result[]>;
  tables?: Record<string, Result[]>;
  throwOnFrom?: string;
}): FakeClient {
  const rpcQueues: Record<string, Result[]> = { ...(cfg.rpc ?? {}) };
  const tableQueues: Record<string, Result[]> = { ...(cfg.tables ?? {}) };

  const client: FakeClient = {
    rpcCalls: [],
    ops: [],
    async rpc(name, params) {
      client.rpcCalls.push({ name, params });
      const next = rpcQueues[name]?.shift() ?? {};
      return { data: next.data ?? null, error: next.error ?? null };
    },
    from(table: string) {
      if (cfg.throwOnFrom === table) throw new Error("boom: polaczenie padlo");
      const result = tableQueues[table]?.shift() ?? {};
      const payload = { data: result.data ?? null, error: result.error ?? null };
      // Każda metoda buildera zwraca ten sam obiekt, a obiekt jest thenable —
      // dzięki temu działa zarówno `await from(x).insert(y)`, jak i dłuższe
      // łańcuchy zakończone .single()/.maybeSingle()/.select().
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(payload).then(resolve, reject),
      };
      for (const method of [
        "select",
        "insert",
        "update",
        "delete",
        "eq",
        "neq",
        "order",
        "single",
        "maybeSingle",
      ]) {
        builder[method] = (...args: unknown[]) => {
          client.ops.push({ table, op: method, args });
          return builder;
        };
      }
      return builder;
    },
  };
  return client;
}

let current: FakeClient;

vi.mock("../supabase/server", () => ({
  createAdminClient: async () => current,
}));

import {
  cancelSampleOrder,
  createSampleOrder,
  getSampleQuotaLeft,
  markSampleOrderPaid,
} from "../samples";

const SELECTION = (n: number) => ({
  fabricId: `fab-${n}`,
  fabricName: `Tkanina ${n}`,
  color: String(n),
});

function insertedItems(client: FakeClient) {
  const op = client.ops.find((o) => o.table === "sample_order_items" && o.op === "insert");
  return (op?.args[0] ?? []) as Record<string, unknown>[];
}

function insertedOrder(client: FakeClient) {
  const op = client.ops.find((o) => o.table === "sample_orders" && o.op === "insert");
  return (op?.args[0] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createSampleOrder — rezerwacja puli", () => {
  it("woła claim_free_samples znormalizowanym kluczem i z p_user_id", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 3 }] },
      tables: { sample_orders: [{ data: { id: "ord-1" } }], sample_order_items: [{}] },
    });

    await createSampleOrder({
      userId: "user-1",
      email: "Jan.Kowalski+probki@GMail.com",
      name: "Jan Kowalski",
      phone: null,
      address: { street: "Testowa 1", postal_code: "00-001", city: "Warszawa" },
      selections: [SELECTION(1), SELECTION(2)],
    });

    expect(current.rpcCalls[0]).toEqual({
      name: "claim_free_samples",
      params: { p_email_key: "jankowalski@gmail.com", p_qty: 2, p_user_id: "user-1" },
    });
  });

  it("ten sam znormalizowany klucz ląduje w email_key zamówienia", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 2 }] },
      tables: { sample_orders: [{ data: { id: "ord-1" } }], sample_order_items: [{}] },
    });

    await createSampleOrder({
      userId: "user-1",
      email: "JAN.kowalski@googlemail.com",
      name: "Jan",
      phone: null,
      address: {},
      selections: [SELECTION(1), SELECTION(2)],
    });

    expect(insertedOrder(current).email_key).toBe("jankowalski@gmail.com");
    expect(insertedOrder(current).customer_email).toBe("JAN.kowalski@googlemail.com");
  });

  it("duplikaty tego samego koloru nie zjadają puli (p_qty po dedupe)", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 1 }] },
      tables: { sample_orders: [{ data: { id: "ord-1" } }], sample_order_items: [{}] },
    });

    const res = await createSampleOrder({
      userId: "user-1",
      email: "a@example.com",
      name: "A",
      phone: null,
      address: {},
      selections: [SELECTION(1), SELECTION(1)],
    });

    expect(current.rpcCalls[0].params.p_qty).toBe(1);
    expect(res).toEqual({ orderId: "ord-1", amountTotal: 0, freeCount: 1, paidCount: 0 });
  });

  it("5 sztuk przy 3 przyznanych: 2 × 15 zł, pending, pierwsze trzy pozycje gratis", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 3 }] },
      tables: { sample_orders: [{ data: { id: "ord-9" } }], sample_order_items: [{}] },
    });

    const res = await createSampleOrder({
      userId: "user-1",
      email: "a@example.com",
      name: "A",
      phone: "500600700",
      address: { street: "Testowa 1" },
      selections: [1, 2, 3, 4, 5].map(SELECTION),
    });

    expect(res).toEqual({ orderId: "ord-9", amountTotal: 30, freeCount: 3, paidCount: 2 });
    expect(insertedOrder(current).payment_status).toBe("pending");
    expect(insertedItems(current).map((i) => i.is_free)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(insertedItems(current).map((i) => i.unit_price)).toEqual([0, 0, 0, 15, 15]);
  });

  it("zamówienie w całości darmowe ma payment_status 'none'", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 3 }] },
      tables: { sample_orders: [{ data: { id: "ord-2" } }], sample_order_items: [{}] },
    });

    await createSampleOrder({
      userId: "user-1",
      email: "a@example.com",
      name: "A",
      phone: null,
      address: {},
      selections: [1, 2, 3].map(SELECTION),
    });

    expect(insertedOrder(current).payment_status).toBe("none");
    expect(insertedOrder(current).amount_total).toBe(0);
  });

  it("pusty wybór nie dotyka bazy", async () => {
    current = makeClient({});
    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "a@example.com",
        name: "A",
        phone: null,
        address: {},
        selections: [],
      })
    ).rejects.toThrow(/Nie wybrano/);
    expect(current.rpcCalls).toEqual([]);
  });
});

describe("createSampleOrder — kompensacja puli po udanym claim", () => {
  it("błąd insertu zamówienia zwraca dokładnie przyznane sztuki", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 3 }] },
      tables: { sample_orders: [{ error: { message: "constraint" } }] },
    });

    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "Jan+x@gmail.com",
        name: "A",
        phone: null,
        address: {},
        selections: [1, 2, 3, 4].map(SELECTION),
      })
    ).rejects.toThrow(/Nie udało się zapisać zamówienia/);

    expect(current.rpcCalls[1]).toEqual({
      name: "release_free_samples",
      params: { p_email_key: "jan@gmail.com", p_qty: 3 },
    });
  });

  it("błąd insertu pozycji kasuje zamówienie i zwraca pulę", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 2 }] },
      tables: {
        sample_orders: [{ data: { id: "ord-3" } }, {}],
        sample_order_items: [{ error: { message: "fk violation" } }],
      },
    });

    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "a@example.com",
        name: "A",
        phone: null,
        address: {},
        selections: [1, 2].map(SELECTION),
      })
    ).rejects.toThrow(/Nie udało się zapisać pozycji/);

    expect(current.ops.some((o) => o.table === "sample_orders" && o.op === "delete")).toBe(true);
    expect(current.rpcCalls[1]).toEqual({
      name: "release_free_samples",
      params: { p_email_key: "a@example.com", p_qty: 2 },
    });
  });

  it("RZUCONY wyjątek po claim też kompensuje (claim commituje osobną transakcją)", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 1 }] },
      throwOnFrom: "sample_orders",
    });

    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "a@example.com",
        name: "A",
        phone: null,
        address: {},
        selections: [SELECTION(1)],
      })
    ).rejects.toThrow(/boom/);

    expect(current.rpcCalls[1]).toEqual({
      name: "release_free_samples",
      params: { p_email_key: "a@example.com", p_qty: 1 },
    });
  });

  it("nieudany claim NIE kompensuje (nic nie zarezerwowano) i wysadza zamówienie", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ error: { message: "sample_quota row missing" } }] },
    });

    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "a@example.com",
        name: "A",
        phone: null,
        address: {},
        selections: [SELECTION(1)],
      })
    ).rejects.toThrow(/Nie udało się sprawdzić puli/);

    expect(current.rpcCalls.map((c) => c.name)).toEqual(["claim_free_samples"]);
  });

  it("zero przyznanych sztuk nie woła zwrotu przy błędzie", async () => {
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 0 }] },
      tables: { sample_orders: [{ error: { message: "constraint" } }] },
    });

    await expect(
      createSampleOrder({
        userId: "user-1",
        email: "a@example.com",
        name: "A",
        phone: null,
        address: {},
        selections: [SELECTION(1)],
      })
    ).rejects.toThrow();

    expect(current.rpcCalls.map((c) => c.name)).toEqual(["claim_free_samples"]);
  });
});

describe("getSampleQuotaLeft", () => {
  it("odpytuje o klucz znormalizowany, nie o surowy e-mail", async () => {
    current = makeClient({ tables: { sample_quota: [{ data: { used_count: 1, window_start: new Date().toISOString() } }] } });

    const left = await getSampleQuotaLeft("Jan.Kowalski+x@gmail.com");

    const eq = current.ops.find((o) => o.table === "sample_quota" && o.op === "eq");
    expect(eq?.args).toEqual(["email_key", "jankowalski@gmail.com"]);
    expect(left).toBe(2);
  });

  it("brak wiersza = pełna pula", async () => {
    current = makeClient({ tables: { sample_quota: [{ data: null }] } });
    expect(await getSampleQuotaLeft("a@example.com")).toBe(3);
  });

  it("okno starsze niż rok = pula odnowiona", async () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    current = makeClient({
      tables: { sample_quota: [{ data: { used_count: 3, window_start: old } }] },
    });
    expect(await getSampleQuotaLeft("a@example.com")).toBe(3);
  });

  it("błąd odczytu = 0 (bezpiecznie w dół, żeby nie obiecać gratisów)", async () => {
    current = makeClient({ tables: { sample_quota: [{ error: { message: "rls" } }] } });
    expect(await getSampleQuotaLeft("a@example.com")).toBe(0);
  });
});

describe("cancelSampleOrder", () => {
  it("zwraca pulę, gdy to wywołanie faktycznie anulowało zamówienie", async () => {
    current = makeClient({
      tables: { sample_orders: [{ data: [{ email_key: "a@example.com", free_count: 2 }] }] },
    });

    await cancelSampleOrder("ord-1");

    expect(current.rpcCalls).toEqual([
      { name: "release_free_samples", params: { p_email_key: "a@example.com", p_qty: 2 } },
    ]);
  });

  it("drugie anulowanie tego samego zamówienia NIE zwraca puli drugi raz", async () => {
    // Warunkowy update nie łapie wiersza (status już 'cancelled'), ale
    // zamówienie istnieje — release_free_samples nie jest idempotentne, więc
    // powtórka dałaby klientowi sześć gratisów zamiast trzech.
    current = makeClient({
      tables: { sample_orders: [{ data: [] }, { data: { id: "ord-1" } }] },
    });

    await cancelSampleOrder("ord-1");

    expect(current.rpcCalls).toEqual([]);
  });

  it("nieistniejące zamówienie = błąd, nie cichy sukces", async () => {
    current = makeClient({ tables: { sample_orders: [{ data: [] }, { data: null }] } });
    await expect(cancelSampleOrder("ord-x")).rejects.toThrow(/nie istnieje/);
  });

  it("zamówienie bez darmowych sztuk nie woła RPC", async () => {
    current = makeClient({
      tables: { sample_orders: [{ data: [{ email_key: "a@example.com", free_count: 0 }] }] },
    });
    await cancelSampleOrder("ord-1");
    expect(current.rpcCalls).toEqual([]);
  });
});

describe("markSampleOrderPaid", () => {
  it("pierwsze rozliczenie zwraca true", async () => {
    current = makeClient({ tables: { sample_orders: [{ data: [{ id: "ord-1" }] }] } });
    expect(await markSampleOrderPaid("ord-1", "ref-1")).toBe(true);
  });

  it("powtórzona notyfikacja zwraca false (idempotencja)", async () => {
    current = makeClient({ tables: { sample_orders: [{ data: [] }] } });
    expect(await markSampleOrderPaid("ord-1", "ref-1")).toBe(false);
  });
});
