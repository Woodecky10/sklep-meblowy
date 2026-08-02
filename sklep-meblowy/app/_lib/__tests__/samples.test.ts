import { describe, it, expect, vi, beforeEach } from "vitest";

// Testy warstwy I/O próbek BEZ żywej bazy: klient Supabase jest atrapą, która
// zapisuje wywołania i oddaje zaprogramowane odpowiedzi. Chodzi o rzeczy,
// których czysta logika (sample-pricing.ts) nie widzi, a które kosztują
// pieniądze: normalizacja klucza puli, komplet argumentów RPC i kompensacja
// rezerwacji na każdej ścieżce błędu.
// ⚠️ Wyścigu dwóch równoległych zamówień tu NIE testujemy — to wymagałoby
// produkcyjnej bazy; został sprawdzony smoke'iem przy migracji 67.

// `throws` odwzorowuje ZERWANE POŁĄCZENIE: klient Supabase oddaje błędy bazy
// w `error`, ale padnięty transport odrzuca promise — to zupełnie inna ścieżka
// w kodzie i tylko tak da się ją sprawdzić.
type Result = { data?: unknown; error?: unknown; count?: number; throws?: string };

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
      // Rzut na KONKRETNYM wywołaniu (n-ty wpis w kolejce), a nie na całej
      // tabeli — inaczej nie da się przetestować padnięcia dopiero przy DELETE,
      // po udanym INSERCIE do tej samej tabeli.
      if (result.throws) throw new Error(result.throws);
      const payload = {
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      };
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
        "or",
        "in",
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
  getNewSampleOrdersCount,
  getSampleQuotaLeft,
  markSampleOrderPaid,
  setSampleOrderStatus,
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
        // drugi wpis = wynik DELETE (bez błędu)
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

  it("nieudane kasowanie osieroconego zamówienia WSTRZYMUJE zwrot puli", async () => {
    // Zamówienie zostaje w bazie z free_count > 0. Gdybyśmy teraz zwolnili pulę,
    // późniejsze „Anuluj" w panelu zwolniłoby ją drugi raz = sześć gratisów.
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 2 }] },
      tables: {
        sample_orders: [{ data: { id: "ord-4" } }, { error: { message: "delete padl" } }],
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

    expect(current.rpcCalls.map((c) => c.name)).toEqual(["claim_free_samples"]);
  });

  it("RZUCONE kasowanie osieroconego zamówienia TEŻ wstrzymuje zwrot puli", async () => {
    // Ta sama sytuacja co wyżej, tylko delete nie oddaje błędu w `error`, lecz
    // ODRZUCA promise (zerwane połączenie). Bez try/catch wokół samego delete
    // wyjątek przeleciałby nad wyzerowaniem kompensacji: pula wróciłaby, mimo
    // że zamówienie z free_count > 0 mogło zostać w bazie, a „Anuluj" w panelu
    // zwolniłoby ją drugi raz.
    current = makeClient({
      rpc: { claim_free_samples: [{ data: 2 }] },
      tables: {
        sample_orders: [{ data: { id: "ord-5" } }, { throws: "delete: polaczenie padlo" }],
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
      // Wyjątek z delete NIE ZASTĘPUJE przyczyny — wyżej idzie błąd pozycji.
    ).rejects.toThrow(/Nie udało się zapisać pozycji/);

    expect(current.rpcCalls.map((c) => c.name)).toEqual(["claim_free_samples"]);
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
  // Kolejka `sample_orders` odpowiada trzem krokom akcji:
  //   [0] warunkowy flip dla new/packed, [1] flip dla sent, [2] sprawdzenie istnienia.
  it("zwraca pulę, gdy to wywołanie faktycznie anulowało zamówienie", async () => {
    current = makeClient({
      tables: { sample_orders: [{ data: [{ email_key: "a@example.com", free_count: 2 }] }] },
    });

    await cancelSampleOrder("ord-1");

    expect(current.rpcCalls).toEqual([
      { name: "release_free_samples", params: { p_email_key: "a@example.com", p_qty: 2 } },
    ]);
    // Zwrot dotyczy wyłącznie zamówień jeszcze niewysłanych — filtr jest w WHERE,
    // bo RETURNING po UPDATE oddałby już status "cancelled".
    const inOp = current.ops.find((o) => o.op === "in");
    expect(inOp?.args).toEqual(["status", ["new", "packed"]]);
  });

  it("anulowanie zamówienia JUŻ WYSŁANEGO nie oddaje gratisów", async () => {
    // Próbki fizycznie poszły pocztą — zwrot puli oznaczałby podwójny koszt.
    // Samo anulowanie ma działać (właścicielka zamyka sprawę).
    current = makeClient({
      tables: { sample_orders: [{ data: [] }, { data: [{ id: "ord-1" }] }] },
    });

    await cancelSampleOrder("ord-1");

    expect(current.rpcCalls).toEqual([]);
  });

  it("drugie anulowanie tego samego zamówienia NIE zwraca puli drugi raz", async () => {
    // Warunkowe update'y nie łapią wiersza (status już 'cancelled'), ale
    // zamówienie istnieje — release_free_samples nie jest idempotentne, więc
    // powtórka dałaby klientowi sześć gratisów zamiast trzech.
    current = makeClient({
      tables: { sample_orders: [{ data: [] }, { data: [] }, { data: { id: "ord-1" } }] },
    });

    await cancelSampleOrder("ord-1");

    expect(current.rpcCalls).toEqual([]);
  });

  it("nieistniejące zamówienie = błąd, nie cichy sukces", async () => {
    current = makeClient({
      tables: { sample_orders: [{ data: [] }, { data: [] }, { data: null }] },
    });
    await expect(cancelSampleOrder("ord-x")).rejects.toThrow(/nie istnieje/);
  });

  it("zamówienie bez darmowych sztuk nie woła RPC", async () => {
    current = makeClient({
      tables: { sample_orders: [{ data: [{ email_key: "a@example.com", free_count: 0 }] }] },
    });
    await cancelSampleOrder("ord-1");
    expect(current.rpcCalls).toEqual([]);
  });

  it("nieudany zwrot puli DOCHODZI do panelu (nic go później nie naprawi)", async () => {
    // Status jest już 'cancelled', więc ponowne „Anuluj" złapie 0 wierszy
    // i wyjdzie po cichu — cisza tutaj znaczyłaby bezpowrotną utratę gratisów.
    current = makeClient({
      tables: { sample_orders: [{ data: [{ email_key: "a@example.com", free_count: 3 }] }] },
      rpc: { release_free_samples: [{ error: { message: "timeout" } }] },
    });

    await expect(cancelSampleOrder("ord-1")).rejects.toThrow(/zwrot 3 darmowych próbek/);
  });
});

describe("getNewSampleOrdersCount", () => {
  it("liczy też ANULOWANE OPŁACONE — pieniądze klienta czekają na zwrot", async () => {
    // Bez tego jedynym sygnałem „oddaj pieniądze" jest czerwona sekcja widoczna
    // dopiero po wejściu na /admin/probki; maila o anulowanym nie ma.
    current = makeClient({ tables: { sample_orders: [{ count: 4 }] } });

    expect(await getNewSampleOrdersCount()).toBe(4);

    const or = current.ops.find((o) => o.table === "sample_orders" && o.op === "or");
    const filter = String(or?.args[0] ?? "");
    // Gałąź „do spakowania": nowe i NIE-czekające na wpłatę.
    expect(filter).toContain("and(status.eq.new,payment_status.neq.pending)");
    // Gałąź „do zwrotu pieniędzy".
    expect(filter).toContain("and(status.eq.cancelled,payment_status.eq.paid)");
  });

  it("błąd odczytu nie wywala layoutu panelu (badge renderuje się wszędzie)", async () => {
    current = makeClient({ tables: { sample_orders: [{ error: { message: "rls" } }] } });
    expect(await getNewSampleOrdersCount()).toBe(0);
  });
});

describe("setSampleOrderStatus — zapis warunkowy (CAS)", () => {
  it("na 'sent' zapisuje z filtrem .neq(status,'sent') i zwraca true przy trafieniu", async () => {
    current = makeClient({ tables: { sample_orders: [{ data: [{ id: "ord-1" }] }] } });

    expect(await setSampleOrderStatus("ord-1", "sent", "PX1")).toBe(true);

    const neq = current.ops.find((o) => o.table === "sample_orders" && o.op === "neq");
    expect(neq?.args).toEqual(["status", "sent"]);
    const update = current.ops.find((o) => o.table === "sample_orders" && o.op === "update");
    expect(update?.args[0]).toMatchObject({ status: "sent", tracking: "PX1" });
  });

  it("⚠️ przegrany wyścig (0 wierszy) zwraca false — to on decyduje o mailu", async () => {
    // Dwie karty panelu przechodzą strażnika w tym samym oknie. Bez CAS-a druga
    // nadpisałaby numer nadania pustym stringiem, przestawiła `sent_at`
    // i wysłała klientowi drugiego maila.
    current = makeClient({ tables: { sample_orders: [{ data: [] }] } });

    expect(await setSampleOrderStatus("ord-1", "sent", "")).toBe(false);
  });

  it("'packed' nie dotyka sent_at ani numeru nadania", async () => {
    current = makeClient({ tables: { sample_orders: [{ data: [{ id: "ord-1" }] }] } });

    expect(await setSampleOrderStatus("ord-1", "packed")).toBe(true);

    const update = current.ops.find((o) => o.table === "sample_orders" && o.op === "update");
    expect(update?.args[0]).toEqual({ status: "packed" });
  });

  it("błąd bazy rzuca (panel ma o nim powiedzieć, nie udawać sukcesu)", async () => {
    current = makeClient({ tables: { sample_orders: [{ error: { message: "db down" } }] } });
    await expect(setSampleOrderStatus("ord-1", "sent", "PX1")).rejects.toThrow(/db down/);
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
