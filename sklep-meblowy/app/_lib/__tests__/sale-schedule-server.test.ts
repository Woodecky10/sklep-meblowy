import { describe, it, expect, vi, beforeEach } from "vitest";

// Testy warstwy I/O przełącznika promocji BEZ żywej bazy: klient Supabase i
// recordPriceHistory są atrapami. Sedno testów: sale_price i wiersz historii
// (price_history + omnibus_price) muszą zmieniać się RAZEM. Gdy recordPriceHistory
// padnie, sale_price musi wrócić do poprzedniej wartości — inaczej sklep pokazuje
// obniżkę bez ceny referencyjnej wymaganej przez Omnibus, i to NA STAŁE (kolejne
// przebiegi widzą już zgodny stan i nigdy nie ponowią zapisu historii, patrz
// komentarz w sale-schedule-server.ts).

type Result = { data?: unknown; error?: unknown };

type FakeClient = {
  ops: { table: string; op: string; args: unknown[] }[];
  from: (table: string) => unknown;
};

// Kolejka odpowiedzi per tabela — kolejne wywołania `from("products")`
// (select, potem update, potem ewentualny update-cofnięcie) dostają kolejne wpisy.
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
      for (const method of ["select", "update", "eq", "or", "in"]) {
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

const recordPriceHistoryMock = vi.fn();
vi.mock("../price-history", () => ({
  recordPriceHistory: (...args: unknown[]) => recordPriceHistoryMock(...args),
}));

import { applySaleSchedule } from "../sale-schedule-server";

function productRow(over: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    price: 1000,
    sale_price: null,
    sale_price_planned: 800,
    sale_from: null,
    sale_to: null,
    promo_badge: null,
    ...over,
  };
}

function updateOps(client: FakeClient) {
  return client.ops.filter((o) => o.table === "products" && o.op === "update");
}

beforeEach(() => {
  recordPriceHistoryMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applySaleSchedule — spójność sale_price i historii cen", () => {
  it("recordPriceHistory rzuca → sale_price wraca do poprzedniej wartości, błąd wymienia id produktu", async () => {
    current = makeClient({
      tables: {
        products: [
          { data: [productRow({ sale_price: null })] }, // select — poprzednia wartość: null
          {}, // update → ustawia 800
          {}, // update → cofnięcie do null (udane)
        ],
      },
    });
    recordPriceHistoryMock.mockRejectedValue(new Error("apply_price_changes failed: timeout"));

    await expect(applySaleSchedule(["prod-1"])).rejects.toThrow(/prod-1/);

    const updates = updateOps(current);
    expect(updates).toHaveLength(2);
    expect(updates[0].args[0]).toEqual({ sale_price: 800 });
    expect(updates[1].args[0]).toEqual({ sale_price: null }); // powrót do poprzedniej wartości
  });

  it("gdy SAMO cofnięcie też się nie uda, komunikat jednoznacznie mówi o niespójnym stanie", async () => {
    current = makeClient({
      tables: {
        products: [
          { data: [productRow({ sale_price: null })] }, // select
          {}, // update → ustawia 800
          { error: { message: "revert timeout" } }, // update-cofnięcie → PADA
        ],
      },
    });
    recordPriceHistoryMock.mockRejectedValue(new Error("apply_price_changes failed: timeout"));

    let thrown: Error | null = null;
    try {
      await applySaleSchedule(["prod-1"]);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/prod-1/);
    // Komunikat MUSI odróżniać ten przypadek od udanego cofnięcia — to jedyny
    // sygnał operatora, że produkt ma teraz sale_price niezgodny z historią.
    expect(thrown!.message).toMatch(/cofnię/i);
    expect(thrown!.message).toMatch(/nie (się )?powiodł|nie udał/i);
  });

  it("happy path: sale_price zapisany raz, recordPriceHistory wywołane raz na zmieniony wiersz", async () => {
    current = makeClient({
      tables: {
        products: [
          { data: [productRow()] }, // select
          {}, // update → ustawia 800
        ],
      },
    });
    recordPriceHistoryMock.mockResolvedValue(undefined);

    const result = await applySaleSchedule(["prod-1"]);

    expect(result).toEqual([{ id: "prod-1", sale_price: 800 }]);
    expect(updateOps(current)).toHaveLength(1);
    expect(recordPriceHistoryMock).toHaveBeenCalledTimes(1);
    expect(recordPriceHistoryMock).toHaveBeenCalledWith("prod-1");
  });

  it("applySaleSchedule([]) jest no-opem: zawężenie do PUSTEJ listy, nie pełny przebieg", async () => {
    // Pusta tablica id to wciąż `ids` != undefined, więc kod NIE MOŻE wpaść w
    // gałąź crona (.or(...) po całej tabeli) — inaczej pusty formularz w panelu
    // przypadkiem przełączyłby wszystkie zaplanowane promocje w sklepie.
    current = makeClient({ tables: { products: [{ data: [] }] } });

    const result = await applySaleSchedule([]);

    expect(result).toEqual([]);
    const productOps = current.ops.filter((o) => o.table === "products");
    expect(
      productOps.some((o) => o.op === "in" && JSON.stringify(o.args) === JSON.stringify(["id", []]))
    ).toBe(true);
    expect(productOps.some((o) => o.op === "or")).toBe(false);
    expect(recordPriceHistoryMock).not.toHaveBeenCalled();
  });
});
