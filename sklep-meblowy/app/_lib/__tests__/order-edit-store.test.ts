import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeOrderEditStore } from "../order-edit-store";

// Łańcuchowy mock klienta Supabase: każde wywołanie metody zapisuje się
// w `calls`, a `await` na łańcuchu daje { data, error }. Bez bazy — filtry
// order_id to ostatnia zapora przed zmianą pozycji z cudzego zamówienia.
function mockClient() {
  const calls: [string, ...unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "delete", "select", "eq", "in"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return chain;
    };
  }
  chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("makeOrderEditStore — filtry order_id", () => {
  it("update pozycji filtruje po id ORAZ order_id", async () => {
    const { client, calls } = mockClient();
    const err = await makeOrderEditStore(client, "o1").updateItem("it-1", { price: 10 });
    expect(err).toBeNull();
    expect(calls).toEqual([
      ["from", "order_items"],
      ["update", { price: 10 }],
      ["eq", "id", "it-1"],
      ["eq", "order_id", "o1"],
    ]);
  });

  it("delete pozycji filtruje po liście id ORAZ order_id", async () => {
    const { client, calls } = mockClient();
    const err = await makeOrderEditStore(client, "o1").deleteItems(["it-1", "it-2"]);
    expect(err).toBeNull();
    expect(calls).toEqual([
      ["from", "order_items"],
      ["delete"],
      ["in", "id", ["it-1", "it-2"]],
      ["eq", "order_id", "o1"],
    ]);
  });
});
