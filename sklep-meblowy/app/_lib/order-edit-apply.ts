// Zapis edycji zamówienia (spec 2026-10-06) — orkiestracja BEZ bazy: operacje
// idą przez wstrzykiwany "magazyn" (adapter Supabase: order-edit-store.ts),
// żeby kolejność i liczenie sumy dało się przetestować. Brak transakcji
// (bez migracji): przy błędzie w połowie to, co weszło, zostaje — dlatego
// suma ZAWSZE liczy się z pozycji odczytanych z bazy po operacjach.
import { toOrderItemRows, type OrderItemRow } from "./order-items";
import {
  appendAdminNote,
  orderEditNoteLine,
  orderEditTotal,
  type OrderEditPlan,
  type OrderItemPatch,
} from "./order-edit";
import type { Address } from "./types";

export type OrderEditStore = {
  insertItems(rows: OrderItemRow[]): Promise<string | null>;
  updateItem(id: string, patch: OrderItemPatch): Promise<string | null>;
  deleteItems(ids: string[]): Promise<string | null>;
  readItems(): Promise<{ items: { price: number; quantity: number }[] } | { error: string }>;
  updateOrder(patch: Record<string, unknown>): Promise<string | null>;
};

export type OrderEditFields = {
  shipping_address: Address;
  // null = zamówienie wpisane ręcznie bez e-maila klienta (Task 9).
  guest_email?: string | null;
  bundle_discount: number;
  promo_discount: number;
};

// Adres porównywany bez kolejności kluczy; puste wartości = brak klucza
// (formularz pomija pusty telefon).
function sameAddress(a: Address | null | undefined, b: Address | null | undefined): boolean {
  const norm = (v: Address | null | undefined) =>
    JSON.stringify(
      Object.entries(v ?? {})
        .filter(([, x]) => x !== undefined && x !== null && x !== "")
        .sort(([x], [y]) => x.localeCompare(y))
    );
  return norm(a) === norm(b);
}

function sameFields(next: OrderEditFields, current: OrderEditFields): boolean {
  if ("guest_email" in next && (next.guest_email ?? null) !== (current.guest_email ?? null)) {
    return false;
  }
  return (
    next.bundle_discount === current.bundle_discount &&
    next.promo_discount === current.promo_discount &&
    sameAddress(next.shipping_address, current.shipping_address)
  );
}

export async function applyOrderEdit(
  store: OrderEditStore,
  args: {
    orderId: string;
    plan: OrderEditPlan;
    fields: OrderEditFields;
    // Stan zamówienia sprzed edycji. Podany i identyczny z `fields` przy
    // pustym planie i tej samej sumie = zapis bez zmian → bez linii śladu.
    currentFields?: OrderEditFields;
    oldTotal: number;
    currency: "pln" | "eur";
    adminNote: string | null;
    now: Date;
  }
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const { plan } = args;
  let itemsError: string | null = null;

  if (plan.inserts.length > 0) {
    itemsError = await store.insertItems(toOrderItemRows(plan.inserts, args.orderId));
  }
  if (!itemsError) {
    for (const u of plan.updates) {
      itemsError = await store.updateItem(u.id, u.patch);
      if (itemsError) break;
    }
  }
  if (!itemsError && plan.deletes.length > 0) {
    itemsError = await store.deleteItems(plan.deletes);
  }

  const read = await store.readItems();
  if ("error" in read) {
    const readError = `Nie udało się odczytać pozycji zamówienia (${read.error}) — sprawdź zamówienie.`;
    return {
      ok: false,
      error: itemsError ? `Zapis pozycji przerwany: ${itemsError}. ${readError}` : readError,
    };
  }

  const total = orderEditTotal(read.items, args.fields.bundle_discount, args.fields.promo_discount);
  const unchanged =
    itemsError === null &&
    plan.inserts.length === 0 &&
    plan.updates.length === 0 &&
    plan.deletes.length === 0 &&
    total === args.oldTotal &&
    args.currentFields !== undefined &&
    sameFields(args.fields, args.currentFields);
  const note = unchanged
    ? args.adminNote
    : appendAdminNote(
        args.adminNote,
        orderEditNoteLine(args.now, args.oldTotal, total, args.currency, itemsError !== null)
      );
  const orderError = await store.updateOrder({ ...args.fields, total, admin_note: note });

  if (itemsError && orderError) {
    return {
      ok: false,
      error: `Zapis pozycji przerwany: ${itemsError}. Nie udało się też zapisać zamówienia (${orderError}) — suma i notatka NIE są zaktualizowane, sprawdź zamówienie.`,
    };
  }
  if (itemsError) {
    return {
      ok: false,
      error: `Zapis pozycji przerwany: ${itemsError}. Suma przeliczona z pozycji, które są w bazie — sprawdź zamówienie.`,
    };
  }
  if (orderError) {
    return { ok: false, error: `Pozycje zapisane, ale nie udało się zapisać zamówienia: ${orderError}` };
  }
  return { ok: true, total };
}
