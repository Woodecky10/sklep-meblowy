// Edycja zamówienia w panelu admina (spec 2026-10-06). Moduł CZYSTY — bez
// server-only i bez bazy — żeby reguły dało się przetestować bez Supabase.
// Limity i parsowanie cen/ilości wspólne z „Dodaj zamówienie"
// (app/_lib/external-order.ts).
import type { Address } from "./types";
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
  opts: { emailEditable: boolean }
): Result<OrderEditInput> {
  const fingerprint = text(raw.fingerprint, 4000);
  if (!fingerprint) return { ok: false, error: "Brak stanu formularza — odśwież stronę edycji" };

  let email: string | null = null;
  if (opts.emailEditable) {
    // Małe litery — spójne z checkoutem i z linkGuestOrders (ilike po e-mailu).
    email = text(raw.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Podaj poprawny adres e-mail klienta" };
  }

  const fullname = text(raw.fullname, 200);
  const street = text(raw.street, 200);
  const postal_code = text(raw.postal_code, 20);
  const city = text(raw.city, 120);
  const country = text(raw.country, 60) || "Polska";
  const phone = text(raw.phone, 40);
  if (!fullname) return { ok: false, error: "Podaj imię i nazwisko klienta" };
  if (!street || !postal_code || !city) {
    return { ok: false, error: "Uzupełnij adres: ulica, kod pocztowy i miasto" };
  }

  let rawItems: unknown = raw.items;
  if (typeof raw.items === "string") {
    try {
      rawItems = JSON.parse(raw.items);
    } catch {
      return { ok: false, error: "Nieczytelna lista pozycji — odśwież stronę i spróbuj ponownie" };
    }
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
