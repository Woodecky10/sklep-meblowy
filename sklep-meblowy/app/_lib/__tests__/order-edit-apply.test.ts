import { describe, it, expect } from "vitest";
import { applyOrderEdit, type OrderEditStore } from "../order-edit-apply";
import type { OrderEditPlan } from "../order-edit";

type Row = { id: string; price: number; quantity: number };

function fakeStore(initial: Row[], fail: Partial<Record<"insert" | "update" | "delete" | "read" | "order", string>> = {}) {
  let rows = [...initial];
  let seq = 0;
  const calls: string[] = [];
  const orderPatches: Record<string, unknown>[] = [];
  const store: OrderEditStore = {
    async insertItems(newRows) {
      calls.push(`insert:${newRows.length}`);
      if (fail.insert) return fail.insert;
      rows = [...rows, ...newRows.map((r) => ({ id: `new-${++seq}`, price: r.price, quantity: r.quantity }))];
      return null;
    },
    async updateItem(id, patch) {
      calls.push(`update:${id}`);
      if (fail.update) return fail.update;
      rows = rows.map((r) => (r.id === id ? { ...r, ...patch } as Row : r));
      return null;
    },
    async deleteItems(ids) {
      calls.push(`delete:${ids.join(",")}`);
      if (fail.delete) return fail.delete;
      rows = rows.filter((r) => !ids.includes(r.id));
      return null;
    },
    async readItems() {
      calls.push("read");
      if (fail.read) return { error: fail.read };
      return { items: rows.map(({ price, quantity }) => ({ price, quantity })) };
    },
    async updateOrder(patch) {
      calls.push("order");
      orderPatches.push(patch);
      return fail.order ?? null;
    },
  };
  return { store, calls, orderPatches };
}

const fields = {
  shipping_address: { street: "Testowa 1", city: "Warszawa", postal_code: "00-001", country: "Polska", fullname: "Jan" },
  guest_email: "jan@example.com",
  bundle_discount: 0,
  promo_discount: 100,
};
const at = new Date("2026-10-06T12:22:00Z");

const plan: OrderEditPlan = {
  inserts: [{ product_id: null, custom_name: "Wniesienie mebli do 4. piętra", price: 250, quantity: 1, notes: null, variant_values: null, bundle_id: null, bundle_label: null }],
  updates: [{ id: "a", patch: { price: 2400 } }],
  deletes: ["b"],
};

describe("applyOrderEdit", () => {
  it("kolejność: insert → update → delete → odczyt → zamówienie; suma z bazy", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }]);
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: "stara", now: at });
    expect(res).toEqual({ ok: true, total: 2400 + 250 - 100 });
    expect(f.calls).toEqual(["insert:1", "update:a", "delete:b", "read", "order"]);
    expect(f.orderPatches[0]).toEqual({
      ...fields,
      total: 2550,
      admin_note: "stara\n06.10.2026, 14:22 — edycja zamówienia: suma 3050 zł → 2550 zł",
    });
  });

  it("pusty plan: bez operacji na pozycjach, ale zamówienie (dane klienta, rabaty) zapisane", async () => {
    const f = fakeStore([{ id: "a", price: 1000, quantity: 1 }]);
    const res = await applyOrderEdit(f.store, {
      orderId: "o1",
      plan: { inserts: [], updates: [], deletes: [] },
      fields,
      oldTotal: 1000,
      currency: "pln",
      adminNote: null,
      now: at,
    });
    expect(res).toEqual({ ok: true, total: 900 });
    expect(f.calls).toEqual(["read", "order"]);
  });

  it("błąd przy update: delete pominięty, suma przeliczona z bazy, notatka z dopiskiem, wynik = błąd", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }], { update: "timeout" });
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: null, now: at });
    expect(f.calls).toEqual(["insert:1", "update:a", "read", "order"]);
    // w bazie: a=2650 (bez zmiany), b=500, nowe wniesienie 250 → 3400 − 100
    expect(f.orderPatches[0]).toMatchObject({
      total: 3300,
      admin_note: "06.10.2026, 14:22 — edycja zamówienia: suma 3050 zł → 3300 zł (zapis przerwany — sprawdź pozycje)",
    });
    expect(res).toEqual({
      ok: false,
      error: "Zapis pozycji przerwany: timeout. Suma przeliczona z pozycji, które są w bazie — sprawdź zamówienie.",
    });
  });

  it("błąd odczytu pozycji: zamówienie NIE jest aktualizowane", async () => {
    const f = fakeStore([{ id: "a", price: 1, quantity: 1 }], { read: "down" });
    const res = await applyOrderEdit(f.store, {
      orderId: "o1",
      plan: { inserts: [], updates: [], deletes: [] },
      fields,
      oldTotal: 1,
      currency: "pln",
      adminNote: null,
      now: at,
    });
    expect(f.calls).toEqual(["read"]);
    expect(res).toEqual({ ok: false, error: "Nie udało się odczytać pozycji zamówienia (down) — sprawdź zamówienie." });
  });

  it("błąd zapisu zamówienia po udanych pozycjach → komunikat o tym", async () => {
    const f = fakeStore([{ id: "a", price: 1000, quantity: 1 }], { order: "rls" });
    const res = await applyOrderEdit(f.store, {
      orderId: "o1",
      plan: { inserts: [], updates: [], deletes: [] },
      fields,
      oldTotal: 1000,
      currency: "pln",
      adminNote: null,
      now: at,
    });
    expect(res).toEqual({ ok: false, error: "Pozycje zapisane, ale nie udało się zapisać zamówienia: rls" });
  });

  it("błąd przy insert: update i delete pominięte, zamówienie zapisane z sumą z bazy", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }], { insert: "dup" });
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: null, now: at });
    expect(f.calls).toEqual(["insert:1", "read", "order"]);
    expect(f.orderPatches[0]).toMatchObject({ total: 3050 });
    expect(res).toEqual({
      ok: false,
      error: "Zapis pozycji przerwany: dup. Suma przeliczona z pozycji, które są w bazie — sprawdź zamówienie.",
    });
  });

  it("błąd przy delete: insert i update zostają, suma z bazy", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }], { delete: "fk" });
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: null, now: at });
    expect(f.calls).toEqual(["insert:1", "update:a", "delete:b", "read", "order"]);
    // w bazie: a=2400, b=500 (nieusunięte), wniesienie 250 → 3150 − 100
    expect(f.orderPatches[0]).toMatchObject({ total: 3050 });
    expect(res).toEqual({
      ok: false,
      error: "Zapis pozycji przerwany: fk. Suma przeliczona z pozycji, które są w bazie — sprawdź zamówienie.",
    });
  });

  it("błąd pozycji I zapisu zamówienia: komunikat mówi, że suma i notatka NIE są zapisane", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }], { update: "timeout", order: "rls" });
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: null, now: at });
    expect(res).toEqual({
      ok: false,
      error: "Zapis pozycji przerwany: timeout. Nie udało się też zapisać zamówienia (rls) — suma i notatka NIE są zaktualizowane, sprawdź zamówienie.",
    });
  });

  it("błąd pozycji, potem błąd odczytu: oba w komunikacie, zamówienie nietknięte", async () => {
    const f = fakeStore([{ id: "a", price: 2650, quantity: 1 }, { id: "b", price: 500, quantity: 1 }], { update: "timeout", read: "down" });
    const res = await applyOrderEdit(f.store, { orderId: "o1", plan, fields, oldTotal: 3050, currency: "pln", adminNote: null, now: at });
    expect(f.calls).toEqual(["insert:1", "update:a", "read"]);
    expect(res).toEqual({
      ok: false,
      error: "Zapis pozycji przerwany: timeout. Nie udało się odczytać pozycji zamówienia (down) — sprawdź zamówienie.",
    });
  });
});
