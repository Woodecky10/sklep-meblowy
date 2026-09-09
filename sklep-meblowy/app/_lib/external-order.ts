// Walidacja formularza „Dodaj zamówienie" (zamówienia spoza sklepu). Moduł
// CZYSTY — bez server-only i bez bazy — żeby reguły dało się przetestować
// bez Supabase. Akcja serwerowa (app/admin/zamowienia/actions.ts) tylko
// przekazuje tu pola z FormData i zapisuje wynik.
import type { Address, PaymentMethod } from "./types";
import { resolveOrderSource } from "./order-source";

export type ExternalOrderItemInput = {
  // DOKŁADNIE JEDNO z dwóch jest wypełnione (patrz parseExternalOrderInput):
  // `product_id` = pozycja z naszego katalogu, `custom_name` = pozycja spoza
  // katalogu wpisana wolnym tekstem (zgłoszenie pracownicy 2026-09-09).
  product_id: string | null;
  custom_name: string | null;
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
  // „Opłacone w źródle" (`online`) albo „Płatność przy odbiorze" (`cod`).
  // Sterowanie statusem zamówienia zostaje w createExternalOrder — tu jest
  // sama, przetestowana decyzja: którą z dwóch metod wybrała pracownica.
  payment_method: PaymentMethod;
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
  payment?: unknown;
};

export type ParseResult =
  | { ok: true; value: ExternalOrderInput }
  | { ok: false; error: string };

export const NOTES_MAX_LENGTH = 500;
// Zgodne z CHECK `order_items_custom_name_dlugosc` w migracji 82.
export const CUSTOM_NAME_MAX_LENGTH = 200;
export const MAX_ITEMS = 50;

// Wartości pola „Płatność" w formularzu. Te same napisy co PaymentMethod, żeby
// nie tłumaczyć jednego słownika na drugi w akcji serwerowej.
function resolvePayment(v: unknown): { ok: true; value: PaymentMethod } | { ok: false; error: string } {
  // Brak pola = zachowanie sprzed 2026-09-09 (wszystko było „opłacone w
  // źródle"). Liczy się przy karcie formularza otwartej przed wdrożeniem —
  // taki zapis ma przejść, a nie wywalić się na walidacji.
  if (v === undefined || v === null || v === "") return { ok: true, value: "online" };
  if (v === "online" || v === "cod") return { ok: true, value: v };
  // Świadomie BŁĄD, nie cichy fallback na „online": zamówienie pobraniowe
  // zapisane jako opłacone twierdziłoby, że pieniądze są, a kurier dopiero ma
  // je pobrać.
  return { ok: false, error: "Wybierz sposób płatności" };
}

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

  const payment = resolvePayment(raw.payment);
  if (!payment.ok) return payment;

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
    const custom_name = text(row.custom_name, CUSTOM_NAME_MAX_LENGTH);
    // Dokładnie jedno z dwóch. Baza dopuszcza oba naraz (CHECK w migracji 82
    // jest OR-em), ale wtedy karta zamówienia musiałaby zgadywać, którą nazwę
    // pokazać — odrzucamy na wejściu, żeby taki wiersz nigdy nie powstał.
    if (product_id && custom_name) {
      return {
        ok: false,
        error: `Pozycja ${i + 1}: wybierz produkt z katalogu ALBO wpisz własną nazwę, nie oba naraz`,
      };
    }
    if (!product_id && !custom_name) {
      return {
        ok: false,
        error: `Pozycja ${i + 1}: wybierz produkt z katalogu albo wpisz nazwę pozycji`,
      };
    }
    const price = parsePrice(row.price);
    if (price === null) {
      return { ok: false, error: `Pozycja ${i + 1}: cena musi być liczbą nie mniejszą od 0` };
    }
    const quantity = parseQuantity(row.quantity);
    if (quantity === null) {
      return { ok: false, error: `Pozycja ${i + 1}: ilość musi być liczbą całkowitą od 1` };
    }
    const notes = text(row.notes, NOTES_MAX_LENGTH);
    items.push({
      product_id: product_id || null,
      custom_name: custom_name || null,
      price,
      quantity,
      notes: notes || null,
    });
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

  return {
    ok: true,
    value: { source: src.source, email, address, items, total, payment_method: payment.value },
  };
}
