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
