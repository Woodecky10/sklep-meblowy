// Edycja zamówienia w panelu admina (spec 2026-10-06). Moduł CZYSTY — bez
// server-only i bez bazy — żeby reguły dało się przetestować bez Supabase.
// Limity i parsowanie cen/ilości wspólne z „Dodaj zamówienie"
// (app/_lib/external-order.ts).
import type { Address } from "./types";
import type { OrderItemInput } from "./order-items";
import { formatOrderAmount } from "./money";
import {
  CUSTOM_NAME_MAX_LENGTH,
  EMAIL_RE,
  MAX_ITEMS,
  NOTES_MAX_LENGTH,
  parsePrice,
  parseQuantity,
  text,
} from "./external-order";

export const EDIT_MAX_QUANTITY = 99;
// Jeden limit długości kraju dla formularza (maxLength) i serwera.
export const COUNTRY_MAX_LENGTH = 60;

const VARIANT_MAX_ENTRIES = 20;
const VARIANT_KEY_MAX = 100;
const VARIANT_VALUE_MAX = 200;

export type OrderEditItem = {
  // null = nowa pozycja (jeszcze nie ma wiersza w order_items).
  id: string | null;
  product_id: string | null;
  custom_name: string | null;
  price: number;
  quantity: number;
  notes: string | null;
  variant_values: Record<string, string> | null;
};

export type OrderEditInput = {
  // null = e-mail nie podlega zmianie (zamówienie klienta z kontem).
  email: string | null;
  address: Address;
  items: OrderEditItem[];
  bundle_discount: number;
  promo_discount: number;
  notify: boolean;
  fingerprint: string;
};

export type RawOrderEdit = {
  email?: unknown;
  no_email?: unknown;
  fullname?: unknown;
  phone?: unknown;
  street?: unknown;
  postal_code?: unknown;
  city?: unknown;
  country?: unknown;
  items?: unknown;
  bundle_discount?: unknown;
  promo_discount?: unknown;
  notify?: unknown;
  fingerprint?: unknown;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parseVariants(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, VARIANT_MAX_ENTRIES)) {
    const key = text(k, VARIANT_KEY_MAX);
    const value = text(val, VARIANT_VALUE_MAX);
    if (key && value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseDiscount(v: unknown): number | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return 0;
  return parsePrice(v);
}

export function parseOrderEditInput(
  raw: RawOrderEdit,
  opts: { emailEditable: boolean; allowNoEmail?: boolean }
): Result<OrderEditInput> {
  const fingerprint = text(raw.fingerprint, 4000);
  if (!fingerprint) return { ok: false, error: "Brak stanu formularza — odśwież stronę edycji" };

  let email: string | null = null;
  // allowNoEmail = zamówienie wpisane ręcznie (Allegro, OLX…): klient mógł nie
  // podać adresu. Zamówienie ze sklepu ma e-mail zawsze — tam no_email nic nie znaczy.
  const noEmail = opts.allowNoEmail === true && raw.no_email === "1";
  if (opts.emailEditable && !noEmail) {
    // Małe litery — spójne z checkoutem i z linkGuestOrders (ilike po e-mailu).
    email = text(raw.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Podaj poprawny adres e-mail klienta" };
  }

  const fullname = text(raw.fullname, 200);
  const street = text(raw.street, 200);
  const postal_code = text(raw.postal_code, 20);
  const city = text(raw.city, 120);
  const country = text(raw.country, COUNTRY_MAX_LENGTH) || "Polska";
  const phone = text(raw.phone, 40);
  if (!fullname) return { ok: false, error: "Podaj imię i nazwisko klienta" };
  if (!street || !postal_code || !city) {
    return { ok: false, error: "Uzupełnij adres: ulica, kod pocztowy i miasto" };
  }

  // Formularz wysyła pozycje jako tekst JSON — cokolwiek innego to nie on.
  const unreadableItems = "Nieczytelna lista pozycji — odśwież stronę i spróbuj ponownie";
  if (typeof raw.items !== "string") return { ok: false, error: unreadableItems };
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(raw.items);
  } catch {
    return { ok: false, error: unreadableItems };
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: "Zamówienie musi mieć co najmniej jedną pozycję" };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `Najwyżej ${MAX_ITEMS} pozycji w jednym zamówieniu` };
  }

  const items: OrderEditItem[] = [];
  for (const [i, it] of rawItems.entries()) {
    const row = (it ?? {}) as Record<string, unknown>;
    const id = text(row.id, 64) || null;
    const product_id = text(row.product_id, 64) || null;
    const custom_name = text(row.custom_name, CUSTOM_NAME_MAX_LENGTH) || null;
    if (product_id && custom_name) {
      return {
        ok: false,
        error: `Pozycja ${i + 1}: wybierz produkt z katalogu ALBO wpisz własną nazwę, nie oba naraz`,
      };
    }
    if (!product_id && !custom_name) {
      return { ok: false, error: `Pozycja ${i + 1}: wybierz produkt z katalogu albo wpisz nazwę pozycji` };
    }
    const price = parsePrice(row.price);
    if (price === null) {
      return { ok: false, error: `Pozycja ${i + 1}: cena musi być liczbą nie mniejszą od 0` };
    }
    const quantity = parseQuantity(row.quantity);
    if (quantity === null || quantity > EDIT_MAX_QUANTITY) {
      return {
        ok: false,
        error: `Pozycja ${i + 1}: ilość musi być liczbą całkowitą od 1 do ${EDIT_MAX_QUANTITY}`,
      };
    }
    const notes = text(row.notes, NOTES_MAX_LENGTH) || null;
    items.push({
      id,
      product_id,
      custom_name,
      price,
      quantity,
      notes,
      // Pozycja spoza katalogu nie ma opcji produktu — warianty tylko przy katalogu.
      variant_values: product_id ? parseVariants(row.variant_values) : null,
    });
  }

  const bundle_discount = parseDiscount(raw.bundle_discount);
  const promo_discount = parseDiscount(raw.promo_discount);
  if (bundle_discount === null || promo_discount === null) {
    return { ok: false, error: "Rabat musi być liczbą nie mniejszą od 0" };
  }

  const address: Address = {
    fullname,
    street,
    postal_code,
    city,
    country,
    ...(phone ? { phone } : {}),
  };

  return {
    ok: true,
    value: {
      email,
      address,
      items,
      bundle_discount,
      promo_discount,
      notify: raw.notify === "1",
      fingerprint,
    },
  };
}

export type CurrentOrderItem = {
  id: string;
  product_id: string | null;
  custom_name: string;
  price: number;
  quantity: number;
  notes: string | null;
  variant_values: Record<string, string> | null;
};

export type OrderItemPatch = Partial<{
  price: number;
  quantity: number;
  notes: string | null;
  variant_values: Record<string, string> | null;
  custom_name: string;
}>;

export type OrderEditPlan = {
  inserts: OrderItemInput[];
  updates: { id: string; patch: OrderItemPatch }[];
  deletes: string[];
};

function sameVariants(
  a: Record<string, string> | null,
  b: Record<string, string> | null
): boolean {
  const norm = (v: Record<string, string> | null) =>
    JSON.stringify(Object.entries(v ?? {}).sort(([x], [y]) => x.localeCompare(y)));
  return norm(a) === norm(b);
}

// Porównanie stanu z bazy z formularzem → co dodać, co zmienić, co usunąć.
// Istniejąca pozycja nie zmienia produktu (ani znacznika zestawu) — żeby
// zamienić mebel, usuwa się pozycję i dodaje nową.
export function planOrderEdit(
  current: CurrentOrderItem[],
  edited: OrderEditItem[]
): { ok: true; value: OrderEditPlan } | { ok: false; error: string } {
  const byId = new Map(current.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const plan: OrderEditPlan = { inserts: [], updates: [], deletes: [] };

  for (const e of edited) {
    if (e.id === null) {
      plan.inserts.push({
        product_id: e.product_id,
        custom_name: e.custom_name,
        price: e.price,
        quantity: e.quantity,
        notes: e.notes,
        variant_values: e.variant_values,
        bundle_id: null,
        bundle_label: null,
      });
      continue;
    }
    const c = byId.get(e.id);
    if (!c) return { ok: false, error: "Pozycja nie należy do tego zamówienia — odśwież stronę" };
    if (seen.has(e.id)) return { ok: false, error: "Ta sama pozycja występuje dwa razy — odśwież stronę" };
    seen.add(e.id);
    if ((c.product_id ?? null) !== (e.product_id ?? null)) {
      return {
        ok: false,
        error: "Nie można zmienić produktu w istniejącej pozycji — usuń ją i dodaj nową",
      };
    }
    const patch: OrderItemPatch = {};
    if (Number(c.price) !== e.price) patch.price = e.price;
    if (c.quantity !== e.quantity) patch.quantity = e.quantity;
    if ((c.notes ?? null) !== (e.notes ?? null)) patch.notes = e.notes;
    if (c.product_id && !sameVariants(c.variant_values, e.variant_values)) {
      patch.variant_values = e.variant_values;
    }
    if (!c.product_id && (c.custom_name ?? "") !== (e.custom_name ?? "")) {
      patch.custom_name = e.custom_name ?? "";
    }
    if (Object.keys(patch).length > 0) plan.updates.push({ id: e.id, patch });
  }

  for (const c of current) if (!seen.has(c.id)) plan.deletes.push(c.id);
  return { ok: true, value: plan };
}

export function orderEditTotal(
  items: { price: number; quantity: number }[],
  bundleDiscount: number,
  promoDiscount: number
): number {
  const sum = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  return Math.max(0, Math.round((sum - bundleDiscount - promoDiscount) * 100) / 100);
}

export function orderEditNoteLine(
  at: Date,
  oldTotal: number,
  newTotal: number,
  currency: "pln" | "eur",
  interrupted = false
): string {
  const when = at.toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const line = `${when} — edycja zamówienia: suma ${formatOrderAmount(oldTotal, currency)} → ${formatOrderAmount(newTotal, currency)}`;
  return interrupted ? `${line} (zapis przerwany — sprawdź pozycje)` : line;
}

export function appendAdminNote(existing: string | null, line: string): string {
  return existing && existing.trim() ? `${existing}\n${line}` : line;
}

// Skrót stanu zamówienia z chwili otwarcia edycji — formularz go niesie,
// akcja porównuje z bazą. Inny skrót = ktoś zmienił zamówienie w międzyczasie.
// Status też: zamówienie, które w międzyczasie zostało opłacone (pending → paid),
// trzeba otworzyć od nowa — inaczej ostrzeżenie o płatności byłoby nieaktualne.
export function orderEditFingerprint(
  total: number,
  items: { id: string; quantity: number; price: number }[],
  status: string
): string {
  const parts = items.map((i) => `${i.id}:${i.quantity}:${Number(i.price)}`).sort();
  return `${status}|${Math.round(Number(total) * 100) / 100}|${parts.join(",")}`;
}
