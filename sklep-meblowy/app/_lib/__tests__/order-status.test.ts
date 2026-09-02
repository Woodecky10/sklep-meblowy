import { describe, it, expect } from "vitest";
import { canTransition, nextStatuses, adminStatusLabel, ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";

describe("canTransition", () => {
  it("pozwala iść do przodu po osi paid→processing→shipped→delivered", () => {
    expect(canTransition("paid", "processing")).toBe(true);
    expect(canTransition("processing", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("pozwala na skok do przodu (paid→delivered, paid→shipped)", () => {
    expect(canTransition("paid", "delivered")).toBe(true);
    expect(canTransition("paid", "shipped")).toBe(true);
  });

  it("zabrania cofania", () => {
    expect(canTransition("shipped", "processing")).toBe(false);
    expect(canTransition("processing", "paid")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
  });

  it("pozwala anulować z każdego stanu poza delivered/cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
    expect(canTransition("processing", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(true);
  });

  it("stany końcowe (delivered/cancelled) nie zmieniają się", () => {
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("delivered", "processing")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("nigdy nie wraca do pending ani nie zmienia na ten sam status", () => {
    expect(canTransition("paid", "pending")).toBe(false);
    expect(canTransition("paid", "paid")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("paid → processing, shipped, delivered, cancelled", () => {
    expect(nextStatuses("paid")).toEqual([
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ]);
  });

  it("shipped → delivered, cancelled", () => {
    expect(nextStatuses("shipped")).toEqual(["delivered", "cancelled"]);
  });

  it("delivered i cancelled → [] (stany końcowe)", () => {
    expect(nextStatuses("delivered")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });
});

describe("adminStatusLabel", () => {
  it("sklep: to samo co ADMIN_STATUS_LABELS", () => {
    for (const s of ["pending", "paid", "processing", "shipped", "delivered", "cancelled"] as const) {
      expect(adminStatusLabel(s, null)).toEqual(ADMIN_STATUS_LABELS[s]);
    }
  });

  it("zewnetrzne + paid: zwraca Oplacone (zewn.) - aby nie sugerowac wplaty przez P24", () => {
    const l = adminStatusLabel("paid", "Allegro");
    expect(l.label).toBe("Opłacone (zewn.)");
    expect(l.className).toBe(ADMIN_STATUS_LABELS.paid.className);
  });

  it("zewnętrzne + inne statusy: bez zmian", () => {
    expect(adminStatusLabel("processing", "Allegro")).toEqual(ADMIN_STATUS_LABELS.processing);
    expect(adminStatusLabel("shipped", "OLX")).toEqual(ADMIN_STATUS_LABELS.shipped);
  });
});
