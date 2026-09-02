// Walidacja formularza „Dodaj zamówienie" (zamówienia spoza sklepu). Moduł
// CZYSTY — bez server-only i bez bazy — żeby reguły dało się przetestować
// bez Supabase. Akcja serwerowa (app/admin/zamowienia/actions.ts) tylko
// przekazuje tu pola z FormData i zapisuje wynik.
import type { Address } from "./types";
import { resolveOrderSource } from "./order-source";

export type ExternalOrderItemInput = {
  product_id: string;
  // Cena ZEWNĘTRZNA (z Allegro itp.), nie sklepowa — dlatego wpisywana ręcznie.
  price: number;
  quantity: number;
  // Wariant/uwagi jako wolny tekst (decyzja właściciela: bez opcji strukturalnych).
  notes: string | null;
};

export type ExternalOrderInput = {
  source: string;
  email: string;
  address: Address;
  items: ExternalOrderItemInput[];
  // Σ cena × ilość, do grosza. Dostawa jak w sklepie — osobno, na karcie zamówienia.
  total: number;
};

// Surowe pola z FormData. `items` to JSON z tablicą pozycji — formularz jest
// klientowy i wiersze zmieniają się dynamicznie, więc jedno pole zamiast N nazw
// indeksowanych.
export type RawExternalOrder = {
  source?: unknown;
  source_name?: unknown;
  email?: unknown;
  fullname?: unknown;
  phone?: unknown;
  street?: unknown;
  postal_code?: unknown;
  city?: unknown;
  items?: unknown;
};

export type ParseResult =
  | { ok: true; value: ExternalOrderInput }
  | { ok: false; error: string };

export const NOTES_MAX_LENGTH = 500;
export const MAX_ITEMS = 50;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// „1 299,50" → 1299.5. Admin przepisuje cenę z Allegro, gdzie spacja tysięcy
// i przecinek są normą; liczba (z JSON) też przechodzi.
export function parsePrice(v: unknown): number | null {
  const s =
    typeof v === "number"
      ? String(v)
      : typeof v === "string"
        ? v.replace(/\s/g, "").replace(",", ".")
        : "";
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseQuantity(v: unknown): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

// Celowo luźne: chodzi o złapanie literówki („jan@"), nie o pełny RFC.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseExternalOrderInput(raw: RawExternalOrder): ParseResult {
  const src = resolveOrderSource(raw.source, raw.source_name);
  if (!src.ok) return src;

  // Małe litery — spójne z checkoutem i z linkGuestOrders (ilike po e-mailu).
  const email = text(raw.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Podaj poprawny adres e-mail klienta" };

  const fullname = text(raw.fullname, 200);
  const street = text(raw.street, 200);
  const postal_code = text(raw.postal_code, 20);
  const city = text(raw.city, 120);
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
    return { ok: false, error: "Dodaj co najmniej jedną pozycję" };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `Najwyżej ${MAX_ITEMS} pozycji w jednym zamówieniu` };
  }

  const items: ExternalOrderItemInput[] = [];
  for (const [i, it] of rawItems.entries()) {
    const row = (it ?? {}) as Record<string, unknown>;
    const product_id = text(row.product_id, 64);
    if (!product_id) return { ok: false, error: `Pozycja ${i + 1}: brak produktu` };
    const price = parsePrice(row.price);
    if (price === null) {
      return { ok: false, error: `Pozycja ${i + 1}: cena musi być liczbą nie mniejszą od 0` };
    }
    const quantity = parseQuantity(row.quantity);
    if (quantity === null) {
      return { ok: false, error: `Pozycja ${i + 1}: ilość musi być liczbą całkowitą od 1` };
    }
    const notes = text(row.notes, NOTES_MAX_LENGTH);
    items.push({ product_id, price, quantity, notes: notes || null });
  }

  const total = Math.round(items.reduce((s, it) => s + it.price * it.quantity, 0) * 100) / 100;

  // Kraj „Polska" — tak zapisuje checkout sklepu (CheckoutForm.defaultCountry)
  // i tak drukuje karta zamówienia; zamówienia zewnętrzne są tylko PL.
  const address: Address = {
    fullname,
    street,
    postal_code,
    city,
    country: "Polska",
    ...(phone ? { phone } : {}),
  };

  return { ok: true, value: { source: src.source, email, address, items, total } };
}
