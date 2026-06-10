import { describe, it, expect } from "vitest";
import { reconcileOrders, type PushResult } from "../baselinker-reconcile";

describe("reconcileOrders", () => {
  it("kategoryzuje pushed / in_progress / skipped / failed i nie przerywa pętli", async () => {
    const responses: Record<string, () => Promise<PushResult>> = {
      a: async () => ({ baselinker_order_id: 123 }),
      b: async () => ({
        baselinker_order_id: null,
        reason: "push w toku (równoległe wywołanie)",
      }),
      c: async () => ({ baselinker_order_id: null, reason: "brak emaila klienta" }),
      d: async () => {
        throw new Error("BL padło");
      },
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
    expect(summary).toMatchObject({
      scanned: 0,
      pushed: 0,
      in_progress: 0,
      skipped: 0,
      failed: 0,
    });
  });
});
