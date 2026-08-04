import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CategoryNode } from "@/app/_lib/category-tree";

// Warunek 3 recenzji gałęzi feat/kategorie-drzewo: FK 23503 (rodzic-widmo) nie
// może wyciekać jako surowy błąd Postgresa, a validateParent musi rozróżniać
// "rodzic w ogóle nie istnieje" od "rodzic istnieje, ale jest potomkiem" —
// dwie różne sytuacje, dwa różne komunikaty. Testujemy TYLKO tę gałąź logiki;
// resztę actions.ts (reorder, delete, sluggery) pokrywają istniejące testy
// czystej logiki w category-tree.test.ts.

type Result = { data?: unknown; error?: { code: string; message: string } | null };

type FakeClient = {
  ops: { table: string; op: string; args: unknown[] }[];
  from: (table: string) => unknown;
};

// Kolejka odpowiedzi per tabela — jeden wpis na jedno wywołanie `.from(table)`.
function makeClient(cfg: { tables?: Record<string, Result[]> }): FakeClient {
  const tableQueues: Record<string, Result[]> = { ...(cfg.tables ?? {}) };

  const client: FakeClient = {
    ops: [],
    from(table: string) {
      const result = tableQueues[table]?.shift() ?? {};
      const payload = { data: result.data ?? null, error: result.error ?? null };
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(payload).then(resolve, reject),
      };
      for (const method of ["select", "insert", "update", "delete", "eq", "single"]) {
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
let allNodes: CategoryNode[];

vi.mock("@/app/_lib/supabase/server", () => ({
  createAdminClient: async () => current,
  createClient: async () => current,
}));

vi.mock("@/app/_lib/admin", () => ({
  requireAdmin: async () => undefined,
  isAdmin: () => true,
}));

vi.mock("@/app/_lib/categories", () => ({
  getAllCategories: async () => allNodes,
  invalidateCategoriesCache: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCategory, updateCategory } from "../actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function node(over: Partial<CategoryNode>): CategoryNode {
  return {
    id: "id",
    slug: "slug",
    label: "Label",
    label_de: null,
    parent_id: null,
    sort_order: 0,
    active: true,
    crossSellCategories: [],
    ...over,
  };
}

const PARENT_NOT_FOUND = "Wybrana kategoria-rodzic już nie istnieje — odśwież stronę.";

beforeEach(() => {
  vi.clearAllMocks();
  // Drzewo: A (root) → B (dziecko A) → C (dziecko B); D osobny root.
  allNodes = [
    node({ id: "a", slug: "sofy", label: "Sofy", parent_id: null }),
    node({ id: "b", slug: "sofy-narozne", label: "Narożne", parent_id: "a" }),
    node({ id: "c", slug: "sofy-narozne-xl", label: "XL", parent_id: "b" }),
    node({ id: "d", slug: "fotele", label: "Fotele", parent_id: null }),
  ];
});

describe("createCategory — FK 23503 na parent_id", () => {
  it("rodzic zniknął tuż przed insertem → komunikat po polsku, nie surowy błąd Postgresa", async () => {
    current = makeClient({
      tables: {
        categories: [
          {
            error: {
              code: "23503",
              message:
                'insert or update on table "categories" violates foreign key constraint "categories_parent_id_fkey"',
            },
          },
        ],
      },
    });

    const res = await createCategory(
      formData({ label: "Komody", parent_id: "widmo-id" })
    );

    expect(res).toEqual({ ok: false, error: PARENT_NOT_FOUND });
  });

  it("kolizja sluga (23505) zostaje nietknięta — komunikat o duplikacie", async () => {
    current = makeClient({
      tables: {
        categories: [
          { error: { code: "23505", message: "duplicate key value violates ..." } },
        ],
      },
    });

    const res = await createCategory(formData({ label: "Sofy", slug: "sofy" }));

    expect(res).toEqual({ ok: false, error: 'Kategoria o slug "sofy" już istnieje' });
  });
});

describe("updateCategory — validateParent rozdziela dwa przypadki", () => {
  it("rodzic o podanym id nie istnieje w ogóle → PARENT_NOT_FOUND, baza NIE jest wołana", async () => {
    current = makeClient({ tables: {} });

    const res = await updateCategory(
      formData({ id: "a", label: "Sofy", parent_id: "widmo-id" })
    );

    expect(res).toEqual({ ok: false, error: PARENT_NOT_FOUND });
    // Walidacja musi odciąć zapis PRZED zapytaniem do bazy.
    expect(current.ops.some((o) => o.table === "categories" && o.op === "update")).toBe(
      false
    );
  });

  it("rodzic istnieje, ale jest własnym potomkiem → stary komunikat o cyklu, nie PARENT_NOT_FOUND", async () => {
    current = makeClient({ tables: {} });

    // "a" próbuje przenieść się pod "b", które jest DZIECKIEM "a".
    const res = await updateCategory(
      formData({ id: "a", label: "Sofy", parent_id: "b" })
    );

    expect(res).toEqual({
      ok: false,
      error:
        "Nie można przenieść kategorii pod jej własną podkategorię — najpierw przenieś podkategorię",
    });
    expect(current.ops.some((o) => o.table === "categories" && o.op === "update")).toBe(
      false
    );
  });

  it("rodzic istnieje i nie jest potomkiem → zapis przechodzi do bazy", async () => {
    current = makeClient({
      tables: { categories: [{ error: null }] },
    });

    const res = await updateCategory(
      formData({ id: "a", label: "Sofy", parent_id: "d" })
    );

    expect(res.ok).toBe(true);
    expect(current.ops.some((o) => o.table === "categories" && o.op === "update")).toBe(
      true
    );
  });

  it("wyścig: walidacja przeszła, ale baza i tak oddaje 23503 (rodzic zniknął w międzyczasie)", async () => {
    current = makeClient({
      tables: {
        categories: [
          {
            error: {
              code: "23503",
              message:
                'insert or update on table "categories" violates foreign key constraint "categories_parent_id_fkey"',
            },
          },
        ],
      },
    });

    const res = await updateCategory(
      formData({ id: "a", label: "Sofy", parent_id: "d" })
    );

    expect(res).toEqual({ ok: false, error: PARENT_NOT_FOUND });
  });
});
