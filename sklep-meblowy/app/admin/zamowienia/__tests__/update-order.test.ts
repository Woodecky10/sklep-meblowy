import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderEditStore } from "@/app/_lib/order-edit-apply";

const requireAdminMock = vi.fn();
const getOrderByIdMock = vi.fn();
const notifyUpdatedMock = vi.fn();
const storeCalls: string[] = [];
const orderPatches: Record<string, unknown>[] = [];
// Błąd zwracany przez magazyn przy aktualizacji pozycji (null = sukces).
let updateItemError: string | null = null;

vi.mock("@/app/_lib/admin", () => ({ requireAdmin: (...a: unknown[]) => requireAdminMock(...a) }));
vi.mock("@/app/_lib/orders", () => ({ getOrderById: (...a: unknown[]) => getOrderByIdMock(...a) }));
vi.mock("@/app/_lib/supabase/server", () => ({ createAdminClient: async () => ({}) }));
vi.mock("@/app/_lib/mail/notify-order", () => ({
  notifyOrderUpdated: (...a: unknown[]) => notifyUpdatedMock(...a),
  notifyStatusChange: vi.fn(),
  sendExternalOrderAcceptedMail: vi.fn(),
}));
vi.mock("@/app/_lib/mail/review-request", () => ({ requestReviews: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterTasks: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (t: () => unknown) => void afterTasks.push(t) };
});
vi.mock("@/app/_lib/order-edit-store", () => ({
  makeOrderEditStore: (): OrderEditStore => ({
    insertItems: async () => (storeCalls.push("insert"), null),
    updateItem: async () => (storeCalls.push("update"), updateItemError),
    deleteItems: async () => (storeCalls.push("delete"), null),
    readItems: async () => (storeCalls.push("read"), { items: [{ price: 2400, quantity: 1 }] }),
    updateOrder: async (patch) => (storeCalls.push("order"), orderPatches.push(patch), null),
  }),
}));

import { updateOrder } from "../actions";
import { orderEditFingerprint } from "@/app/_lib/order-edit";

const ITEM = {
  id: "it-1",
  order_id: "o1",
  product_id: "p-1",
  custom_name: "",
  quantity: 1,
  price: 2650,
  variant_values: null,
  notes: null,
  bundle_id: null,
  bundle_label: null,
};
const ORDER = {
  id: "o1",
  user_id: null,
  guest_email: "stary@example.com",
  status: "paid",
  total: 2650,
  currency: "pln",
  admin_note: null,
  items: [ITEM],
};
const FP = orderEditFingerprint(2650, [ITEM], "paid");

function fd(over: Record<string, string> = {}) {
  const f = new FormData();
  const fields: Record<string, string> = {
    orderId: "o1",
    fingerprint: FP,
    email: "nowy@example.com",
    fullname: "Jan",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    items: JSON.stringify([{ id: "it-1", product_id: "p-1", price: "2400", quantity: "1" }]),
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  storeCalls.length = 0;
  orderPatches.length = 0;
  afterTasks.length = 0;
  updateItemError = null;
  requireAdminMock.mockResolvedValue(undefined);
  getOrderByIdMock.mockResolvedValue(ORDER);
});

describe("updateOrder", () => {
  it("zapisuje zmiany gościa (e-mail małymi literami) i nie wysyła maila bez zaznaczenia", async () => {
    const res = await updateOrder(fd());
    expect(res).toEqual({ ok: true, message: "Zamówienie zapisane" });
    expect(storeCalls).toEqual(["update", "read", "order"]);
    expect(orderPatches[0]).toMatchObject({ guest_email: "nowy@example.com", total: 2400 });
    expect(afterTasks).toHaveLength(0);
  });

  it("zaznaczony mail → after(notifyOrderUpdated)", async () => {
    const res = await updateOrder(fd({ notify: "1" }));
    expect(res).toMatchObject({ ok: true });
    for (const t of afterTasks) await t();
    expect(notifyUpdatedMock).toHaveBeenCalledWith("o1");
  });

  it("zamówienie zmieniło się w międzyczasie → odmowa, magazyn nietknięty", async () => {
    getOrderByIdMock.mockResolvedValue({ ...ORDER, total: 3000 });
    const res = await updateOrder(fd());
    expect(res).toEqual({
      ok: false,
      error: "Zamówienie zmieniło się w międzyczasie — odśwież stronę i wprowadź zmiany ponownie",
    });
    expect(storeCalls).toEqual([]);
  });

  it("status zmienił się w międzyczasie (np. klient zapłacił) → odmowa, magazyn nietknięty", async () => {
    getOrderByIdMock.mockResolvedValue({ ...ORDER, status: "processing" });
    const res = await updateOrder(fd({ notify: "1" }));
    expect(res).toEqual({
      ok: false,
      error: "Zamówienie zmieniło się w międzyczasie — odśwież stronę i wprowadź zmiany ponownie",
    });
    expect(storeCalls).toEqual([]);
    expect(afterTasks).toHaveLength(0);
  });

  it("błąd zapisu w magazynie → ok:false i mail NIE planowany mimo zaznaczenia", async () => {
    updateItemError = "timeout";
    const res = await updateOrder(fd({ notify: "1" }));
    expect(res).toMatchObject({ ok: false });
    expect(storeCalls).toEqual(["update", "read", "order"]);
    expect(afterTasks).toHaveLength(0);
  });

  it("zamówienie z kontem: e-mail z formularza NIE trafia do guest_email", async () => {
    getOrderByIdMock.mockResolvedValue({ ...ORDER, user_id: "u1", guest_email: null });
    const res = await updateOrder(fd({ email: "podrobiony@example.com" }));
    expect(res).toMatchObject({ ok: true });
    expect(orderPatches[0]).not.toHaveProperty("guest_email");
  });

  it("pozycja z innego zamówienia → błąd, nic nie zapisane", async () => {
    const res = await updateOrder(
      fd({ items: JSON.stringify([{ id: "obce", product_id: "p-1", price: "1", quantity: "1" }]) })
    );
    expect(res).toEqual({ ok: false, error: "Pozycja nie należy do tego zamówienia — odśwież stronę" });
    expect(storeCalls).toEqual([]);
  });

  it("brak zamówienia → błąd", async () => {
    getOrderByIdMock.mockRejectedValue(new Error("not found"));
    expect(await updateOrder(fd())).toEqual({ ok: false, error: "Zamówienie nie znalezione" });
  });

  it("zamówienie ręczne + brak maila → guest_email null, mail nie planowany mimo zaznaczenia", async () => {
    getOrderByIdMock.mockResolvedValue({ ...ORDER, source: "Allegro" });
    const res = await updateOrder(fd({ email: "", no_email: "1", notify: "1" }));
    expect(res).toEqual({ ok: true, message: "Zamówienie zapisane" });
    expect(orderPatches[0]).toMatchObject({ guest_email: null });
    expect(afterTasks).toHaveLength(0);
  });

  it("zamówienie gościa ze sklepu: no_email ignorowane, e-mail wymagany", async () => {
    const res = await updateOrder(fd({ email: "", no_email: "1" }));
    expect(res).toEqual({ ok: false, error: "Podaj poprawny adres e-mail klienta" });
    expect(storeCalls).toEqual([]);
  });
});
