# Zamówienia zewnętrzne — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin może wpisać w panelu zamówienie z Allegro/OLX/itp. (klient, źródło, produkty z wyszukiwarki, ceny zewnętrzne), a ręczna zmiana statusu na „W realizacji" wysyła klientowi mail „Dziękujemy za zamówienie – Mollien 🤍" z nazwą źródła.

**Architecture:** Zamówienie zewnętrzne to zwykły wiersz `orders` z nową kolumną `source` (`null` = sklep). Formularz `/admin/zamowienia/nowe` zapisuje przez server action; walidacja i przeliczenie sumy siedzą w czystym module `external-order.ts`. Reguła „kiedy mailować" (`status-notify.ts`) dostaje `source` jako drugi argument, a `notifyStatusChange` renderuje nowy szablon dla `processing` + źródło.

**Tech Stack:** Next 16 (App Router, Server Actions, `after()`), Supabase (service role), React Email + Resend, Vitest (`environment: node`, tylko `*.test.ts`), Playwright na buildzie.

**Spec:** `docs/superpowers/specs/2026-09-02-zamowienia-zewnetrzne-design.md`

## Global Constraints

- Katalog roboczy poleceń: `sklep-meblowy/` (podkatalog repo). Wszystkie ścieżki niżej są względem niego.
- Teksty w panelu i mailach po polsku; komentarze w kodzie po polsku, jak w sąsiednich plikach.
- Testy jednostkowe TYLKO jako `app/_lib/__tests__/*.test.ts` (nie `.tsx`) — taki jest `include` w `vitest.config.mts`; komponenty renderuj przez `createElement`/`render`, nie JSX.
- Vitest wczytuje `.env*`, więc każdy test dotykający `getMailBranding`/`getOrderById` MUSI je mockować (wzór: `mail-notify-order.test.ts`) — inaczej czyta produkcyjną bazę.
- Baza jest **wspólna z produkcją**: żaden test (vitest ani Playwright) nie może zapisać zamówienia. Spec Playwrighta NIE klika „Zapisz".
- Lista źródeł: `Allegro`, `OLX`, `Empik`, `Facebook / Instagram`, `Telefon / e-mail`, `Inne` (z obowiązkową nazwą, ≤ 60 znaków). Etykieta idzie 1:1 do maila.
- Temat maila dokładnie: `Dziękujemy za zamówienie – Mollien 🤍` (półpauza `–`, białe serce).
- Kraj w adresie zamówienia zewnętrznego: `"Polska"` — tak zapisuje checkout sklepu (`CheckoutForm.tsx` `defaultCountry`) i tak drukuje karta zamówienia.
- Migrację 81 po merge aplikuje się **ręcznie przez MCP** (`apply_migration`); auto-apply w tym projekcie nie działa.
- Commity małe, po każdym zielonym tasku. Bez pusha bez polecenia właściciela.

## Struktura plików

| plik | rola |
|---|---|
| `supabase/migrations/81_orders_source.sql` | **nowy** — kolumna `orders.source` + indeks częściowy |
| `app/_lib/types.ts` | `Order.source`, `OrderInsert.source` |
| `app/_lib/order-source.ts` | **nowy** — lista źródeł, `resolveOrderSource` (czysty) |
| `app/_lib/external-order.ts` | **nowy** — `parseExternalOrderInput` (czysty): walidacja, ceny „1 299,50", suma |
| `app/_lib/mail/status-notify.ts` | `shouldNotifyCustomer(status, source)`, `wasOrderPaid(pm, prev, source)`, `mayNotifyCustomer(status)` |
| `app/_lib/mail/templates/ExternalOrderAccepted.tsx` | **nowy** — szablon „Dziękujemy" + `EXTERNAL_ORDER_ACCEPTED_SUBJECT` |
| `app/_lib/mail/notify-order.ts` | `notifyStatusChange` czyta `order.source`, renderuje nowy szablon dla `processing` |
| `app/_lib/order-status.ts` | `adminStatusLabel(status, source)` — „Opłacone (zewn.)" |
| `app/_lib/orders.ts` | `getAdminOrders({ external })` |
| `app/admin/zamowienia/actions.ts` | `createExternalOrder(formData)` |
| `app/admin/zamowienia/nowe/page.tsx` | **nowy** — strona z listą produktów dla formularza |
| `app/admin/zamowienia/nowe/ExternalOrderForm.tsx` | **nowy** — formularz klientowy (źródło, klient, pozycje z wyszukiwarką) |
| `app/admin/zamowienia/page.tsx`, `OrderRow.tsx` | przycisk „Dodaj zamówienie", filtr „Zewnętrzne", plakietka źródła |
| `app/admin/zamowienia/[id]/page.tsx` | wiersz „Źródło", etykieta „Zapłacono (Allegro)", status przez `adminStatusLabel` |
| `app/_lib/__tests__/order-source.test.ts`, `external-order.test.ts`, `mail-external-order-accepted.test.ts` | **nowe** testy |
| `app/_lib/__tests__/mail-status-notify.test.ts`, `order-status.test.ts` | rozszerzenia |
| `e2e/zamowienie-zewnetrzne-form.spec.ts` | **nowy** — spec niezapisujący na buildzie |

---

### Task 1: Migracja 81 i typ `Order.source`

**Files:**
- Create: `supabase/migrations/81_orders_source.sql`
- Modify: `app/_lib/types.ts:288-319` (typ `Order`), `app/_lib/types.ts:383-391` (typ `OrderInsert`)

**Interfaces:**
- Produces: `Order.source: string | null` — czytane przez Taski 4, 5, 6, 8, 9; `OrderInsert.source?: string | null`.

- [ ] **Step 1: Napisz migrację**

```sql
-- 81: Zamówienia spoza sklepu (Allegro, OLX, …) wpisywane ręcznie w panelu.
-- Spec: docs/superpowers/specs/2026-09-02-zamowienia-zewnetrzne-design.md
--
-- `source` = nazwa źródła pokazywana klientowi w mailu „Dziękujemy za
-- zamówienie" (idzie 1:1, więc to tekst dla człowieka, nie klucz).
-- NULL = zamówienie złożone przez stronę — istniejących wierszy nie ruszamy,
-- a cała dotychczasowa logika (checkout, P24, maile) nie zna tej kolumny.
alter table public.orders
  add column if not exists source text
    check (source is null or char_length(source) between 1 and 60);

-- Filtr „Zewnętrzne" na liście zamówień. Częściowy: sklepowe (null) nie
-- wchodzą do indeksu, a to one stanowią ogromną większość wierszy.
create index if not exists idx_orders_source
  on public.orders (source)
  where source is not null;
```

- [ ] **Step 2: Dodaj pole do typów**

W `app/_lib/types.ts` w typie `Order`, tuż po `status_updated_at: string | null;`:

```ts
  // Zamówienia spoza sklepu (migracja 81): nazwa źródła („Allegro") pokazywana
  // klientowi w mailu. null = złożone przez stronę.
  source: string | null;
```

W typie `OrderInsert`, po `payment_provider?: "p24" | null;`:

```ts
  source?: string | null;
```

- [ ] **Step 3: Sprawdź, że kompilacja przechodzi**

Run: `npx tsc --noEmit -p . 2>&1 | head -30`
Expected: brak błędów (fikstury w testach nie są typowane jako `Order`, więc nowe wymagane pole ich nie psuje; gdyby coś krzyknęło, dopisz `source: null` w tej fiksturze).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/81_orders_source.sql app/_lib/types.ts
git commit -m "feat(zamowienia): migracja 81 — kolumna orders.source dla zamowien zewnetrznych"
```

---

### Task 2: Lista źródeł — `order-source.ts`

**Files:**
- Create: `app/_lib/order-source.ts`
- Test: `app/_lib/__tests__/order-source.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ORDER_SOURCES: readonly ["Allegro", "OLX", "Empik", "Facebook / Instagram", "Telefon / e-mail"];
  export const OTHER_SOURCE = "Inne";
  export const SOURCE_MAX_LENGTH = 60;
  export type SourceResolution = { ok: true; source: string } | { ok: false; error: string };
  export function resolveOrderSource(selected: unknown, customName: unknown): SourceResolution;
  ```
  Używane przez Task 3 (walidacja) i Task 8 (opcje `<select>`).

- [ ] **Step 1: Napisz test**

`app/_lib/__tests__/order-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ORDER_SOURCES,
  OTHER_SOURCE,
  SOURCE_MAX_LENGTH,
  resolveOrderSource,
} from "../order-source";

describe("ORDER_SOURCES", () => {
  it("ma pięć źródeł z listy właściciela, bez „Inne” (to osobna opcja)", () => {
    expect([...ORDER_SOURCES]).toEqual([
      "Allegro",
      "OLX",
      "Empik",
      "Facebook / Instagram",
      "Telefon / e-mail",
    ]);
    expect(ORDER_SOURCES).not.toContain(OTHER_SOURCE);
  });
});

describe("resolveOrderSource", () => {
  it("pozycja z listy → ta sama etykieta, wpisana nazwa jest ignorowana", () => {
    expect(resolveOrderSource("Allegro", "cokolwiek")).toEqual({ ok: true, source: "Allegro" });
  });

  it("„Inne” bez nazwy → błąd (nazwa jest obowiązkowa — decyzja właściciela 2026-09-02)", () => {
    expect(resolveOrderSource(OTHER_SOURCE, "")).toEqual({
      ok: false,
      error: "Podaj nazwę źródła przy opcji „Inne”",
    });
    expect(resolveOrderSource(OTHER_SOURCE, "   ").ok).toBe(false);
    expect(resolveOrderSource(OTHER_SOURCE, undefined).ok).toBe(false);
  });

  it("„Inne” z nazwą → nazwa po trim", () => {
    expect(resolveOrderSource(OTHER_SOURCE, "  Vinted ")).toEqual({ ok: true, source: "Vinted" });
  });

  it("„Inne” z nazwą dłuższą niż limit → błąd", () => {
    const tooLong = "x".repeat(SOURCE_MAX_LENGTH + 1);
    expect(resolveOrderSource(OTHER_SOURCE, tooLong).ok).toBe(false);
    expect(resolveOrderSource(OTHER_SOURCE, "x".repeat(SOURCE_MAX_LENGTH)).ok).toBe(true);
  });

  it("wartość spoza listy albo nie-string → błąd", () => {
    expect(resolveOrderSource("Amazon", "")).toEqual({ ok: false, error: "Wybierz źródło zamówienia" });
    expect(resolveOrderSource(undefined, "").ok).toBe(false);
    expect(resolveOrderSource(42, "").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `npx vitest run app/_lib/__tests__/order-source.test.ts`
Expected: FAIL — `Failed to resolve import "../order-source"`.

- [ ] **Step 3: Napisz moduł**

`app/_lib/order-source.ts`:

```ts
// Źródła zamówień spoza sklepu (spec 2026-09-02). Etykieta idzie 1:1 do maila
// „Dziękujemy za zamówienie" w miejsce „[Allegro]" — to, co tu stoi, czyta
// klient. W `orders.source` null oznacza zamówienie złożone przez stronę.
//
// Lista jest w kodzie, nie w panelu — decyzja właściciela: nazwa w mailu ma być
// zawsze jednolita, a nowy marketplace to jedna linijka tutaj.
export const ORDER_SOURCES = [
  "Allegro",
  "OLX",
  "Empik",
  "Facebook / Instagram",
  "Telefon / e-mail",
] as const;

// Opcja „Inne" w <select>: wtedy nazwę wpisuje admin i ona jest obowiązkowa.
export const OTHER_SOURCE = "Inne";

// Zgodne z CHECK w migracji 81.
export const SOURCE_MAX_LENGTH = 60;

export type SourceResolution =
  | { ok: true; source: string }
  | { ok: false; error: string };

// `selected` to wartość z <select> (jedna z ORDER_SOURCES albo OTHER_SOURCE),
// `customName` to pole „Nazwa źródła" widoczne tylko przy „Inne".
export function resolveOrderSource(selected: unknown, customName: unknown): SourceResolution {
  if (typeof selected !== "string") return { ok: false, error: "Wybierz źródło zamówienia" };
  if ((ORDER_SOURCES as readonly string[]).includes(selected)) {
    return { ok: true, source: selected };
  }
  if (selected !== OTHER_SOURCE) return { ok: false, error: "Wybierz źródło zamówienia" };

  const name = typeof customName === "string" ? customName.trim() : "";
  if (!name) return { ok: false, error: "Podaj nazwę źródła przy opcji „Inne”" };
  if (name.length > SOURCE_MAX_LENGTH) {
    return { ok: false, error: `Nazwa źródła może mieć najwyżej ${SOURCE_MAX_LENGTH} znaków` };
  }
  return { ok: true, source: name };
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/order-source.test.ts`
Expected: PASS (6 testów).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-source.ts app/_lib/__tests__/order-source.test.ts
git commit -m "feat(zamowienia): lista zrodel zamowien zewnetrznych i resolveOrderSource"
```

---

### Task 3: Walidacja formularza — `external-order.ts`

**Files:**
- Create: `app/_lib/external-order.ts`
- Test: `app/_lib/__tests__/external-order.test.ts`

**Interfaces:**
- Consumes: `resolveOrderSource` (Task 2), `Address` z `types.ts`.
- Produces:
  ```ts
  export type ExternalOrderItemInput = { product_id: string; price: number; quantity: number; notes: string | null };
  export type ExternalOrderInput = { source: string; email: string; address: Address; items: ExternalOrderItemInput[]; total: number };
  export type RawExternalOrder = { source?: unknown; source_name?: unknown; email?: unknown; fullname?: unknown; phone?: unknown; street?: unknown; postal_code?: unknown; city?: unknown; items?: unknown };
  export type ParseResult = { ok: true; value: ExternalOrderInput } | { ok: false; error: string };
  export function parseExternalOrderInput(raw: RawExternalOrder): ParseResult;
  export function parsePrice(v: unknown): number | null;
  export const NOTES_MAX_LENGTH = 500;
  export const MAX_ITEMS = 50;
  ```
  `items` w `RawExternalOrder` to **JSON string** z FormData (tablica `{product_id, price, quantity, notes}`) — formularz (Task 8) serializuje pozycje do jednego ukrytego pola; Task 7 (akcja) podaje `formData.get("items")`.

- [ ] **Step 1: Napisz test**

`app/_lib/__tests__/external-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseExternalOrderInput,
  parsePrice,
  NOTES_MAX_LENGTH,
  type RawExternalOrder,
} from "../external-order";

// Komplet poprawnych pól; testy nadpisują to, o co pytają.
function raw(over: Partial<RawExternalOrder> = {}): RawExternalOrder {
  return {
    source: "Allegro",
    source_name: "",
    email: "  Jan.Kowalski@Example.com ",
    fullname: " Jan Kowalski ",
    phone: "500 600 700",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    items: JSON.stringify([
      { product_id: "prod-1", price: "1 299,50", quantity: "2", notes: " Vena 12, lewy " },
      { product_id: "prod-2", price: 400, quantity: 1, notes: "" },
    ]),
    ...over,
  };
}

describe("parsePrice", () => {
  it("przyjmuje zapis z Allegro: spacja tysięcy i przecinek", () => {
    expect(parsePrice("1 299,50")).toBe(1299.5);
    expect(parsePrice("399")).toBe(399);
    expect(parsePrice(0)).toBe(0);
  });

  it("zaokrągla do grosza", () => {
    expect(parsePrice("10.005")).toBe(10.01);
  });

  it("odrzuca puste, ujemne i nieliczbowe", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-1")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe("parseExternalOrderInput", () => {
  it("komplet → znormalizowane dane i suma Σ cena × ilość", () => {
    const res = parseExternalOrderInput(raw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.source).toBe("Allegro");
    expect(res.value.email).toBe("jan.kowalski@example.com");
    expect(res.value.address).toEqual({
      fullname: "Jan Kowalski",
      phone: "500 600 700",
      street: "Testowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "Polska",
    });
    expect(res.value.items).toEqual([
      { product_id: "prod-1", price: 1299.5, quantity: 2, notes: "Vena 12, lewy" },
      { product_id: "prod-2", price: 400, quantity: 1, notes: null },
    ]);
    // 2 × 1299.50 + 400 = 2999.00
    expect(res.value.total).toBe(2999);
  });

  it("suma zaokrąglona do grosza (0.1 × 3 nie daje 0.30000000000000004)", () => {
    const res = parseExternalOrderInput(
      raw({ items: JSON.stringify([{ product_id: "p", price: "0.1", quantity: 3 }]) })
    );
    expect(res.ok && res.value.total).toBe(0.3);
  });

  it("pusty telefon → adres bez pola phone", () => {
    const res = parseExternalOrderInput(raw({ phone: "" }));
    expect(res.ok && "phone" in res.value.address).toBe(false);
  });

  it("„Inne” bez nazwy → błąd ze źródła", () => {
    const res = parseExternalOrderInput(raw({ source: "Inne", source_name: "" }));
    expect(res).toEqual({ ok: false, error: "Podaj nazwę źródła przy opcji „Inne”" });
  });

  it("„Inne” z nazwą → nazwa jako źródło", () => {
    const res = parseExternalOrderInput(raw({ source: "Inne", source_name: "Vinted" }));
    expect(res.ok && res.value.source).toBe("Vinted");
  });

  it("zły e-mail → błąd", () => {
    expect(parseExternalOrderInput(raw({ email: "jan@" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ email: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ email: "jan kowalski@example.com" })).ok).toBe(false);
  });

  it("brak nazwiska albo adresu → błąd", () => {
    expect(parseExternalOrderInput(raw({ fullname: " " })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ street: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ postal_code: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ city: "" })).ok).toBe(false);
  });

  it("brak pozycji → błąd", () => {
    expect(parseExternalOrderInput(raw({ items: "[]" }))).toEqual({
      ok: false,
      error: "Dodaj co najmniej jedną pozycję",
    });
    expect(parseExternalOrderInput(raw({ items: undefined })).ok).toBe(false);
  });

  it("nieczytelny JSON pozycji → błąd zamiast wyjątku", () => {
    expect(parseExternalOrderInput(raw({ items: "{nie json" })).ok).toBe(false);
  });

  it("ilość 0, ułamkowa albo ujemna → błąd z numerem pozycji", () => {
    for (const quantity of ["0", "1.5", "-2", ""]) {
      const res = parseExternalOrderInput(
        raw({ items: JSON.stringify([{ product_id: "p", price: "10", quantity }]) })
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("Pozycja 1");
    }
  });

  it("cena ujemna albo pusta → błąd", () => {
    for (const price of ["-5", "", "abc"]) {
      const res = parseExternalOrderInput(
        raw({ items: JSON.stringify([{ product_id: "p", price, quantity: 1 }]) })
      );
      expect(res.ok).toBe(false);
    }
  });

  it("pozycja bez product_id → błąd", () => {
    const res = parseExternalOrderInput(
      raw({ items: JSON.stringify([{ price: "10", quantity: 1 }]) })
    );
    expect(res.ok).toBe(false);
  });

  it("notatka ucinana do limitu", () => {
    const res = parseExternalOrderInput(
      raw({
        items: JSON.stringify([
          { product_id: "p", price: "10", quantity: 1, notes: "x".repeat(NOTES_MAX_LENGTH + 50) },
        ]),
      })
    );
    expect(res.ok && res.value.items[0].notes?.length).toBe(NOTES_MAX_LENGTH);
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `npx vitest run app/_lib/__tests__/external-order.test.ts`
Expected: FAIL — `Failed to resolve import "../external-order"`.

- [ ] **Step 3: Napisz moduł**

`app/_lib/external-order.ts`:

```ts
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
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/external-order.test.ts`
Expected: PASS (wszystkie testy w pliku).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/external-order.ts app/_lib/__tests__/external-order.test.ts
git commit -m "feat(zamowienia): czysta walidacja zamowienia zewnetrznego (parseExternalOrderInput)"
```

---

### Task 4: Reguła „kiedy mailować" ze źródłem — `status-notify.ts`

**Files:**
- Modify: `app/_lib/mail/status-notify.ts` (cały plik)
- Modify: `app/_lib/mail/notify-order.ts:97-113` (wywołania `shouldNotifyCustomer`, `wasOrderPaid`)
- Test: `app/_lib/__tests__/mail-status-notify.test.ts` (cały plik)

**Interfaces:**
- Consumes: `Order.source` (Task 1).
- Produces:
  ```ts
  export function shouldNotifyCustomer(status: OrderStatus, source: string | null): boolean;
  export function mayNotifyCustomer(status: OrderStatus): boolean;   // tani filtr PRZED odczytem zamówienia
  export function wasOrderPaid(paymentMethod: PaymentMethod, previousStatus: OrderStatus, source: string | null): boolean;
  ```
  Task 5 dopina szablon do gałęzi `processing` w `notifyStatusChange`.

- [ ] **Step 1: Przepisz test**

Zastąp całą zawartość `app/_lib/__tests__/mail-status-notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer, mayNotifyCustomer, wasOrderPaid } from "../mail/status-notify";

describe("shouldNotifyCustomer — zamówienie ze sklepu (source = null)", () => {
  it("shipped wysyła — o tym klient musi wiedzieć", () => {
    expect(shouldNotifyCustomer("shipped", null)).toBe(true);
  });

  it("cancelled wysyła — dziś klient nie dowiedziałby się w żaden sposób", () => {
    expect(shouldNotifyCustomer("cancelled", null)).toBe(true);
  });

  it("processing NIE wysyła — to klik gaszący licznik nowych zamowien (PR #100)", () => {
    expect(shouldNotifyCustomer("processing", null)).toBe(false);
  });

  it("paid NIE wysyła — koliduje z mailem o zakupie z webhooka", () => {
    expect(shouldNotifyCustomer("paid", null)).toBe(false);
  });

  it("delivered NIE wysyła — decyzja 2026-07-28", () => {
    expect(shouldNotifyCustomer("delivered", null)).toBe(false);
  });

  it("pending NIE wysyła", () => {
    expect(shouldNotifyCustomer("pending", null)).toBe(false);
  });
});

describe("shouldNotifyCustomer — zamówienie zewnętrzne (source = „Allegro”)", () => {
  it("processing WYSYŁA — to jedyny moment, w którym klient z Allegro dowiaduje się od nas o przyjęciu", () => {
    expect(shouldNotifyCustomer("processing", "Allegro")).toBe(true);
  });

  it("shipped i cancelled wysyłają jak w sklepie (decyzja właściciela 2026-09-02)", () => {
    expect(shouldNotifyCustomer("shipped", "Allegro")).toBe(true);
    expect(shouldNotifyCustomer("cancelled", "Allegro")).toBe(true);
  });

  it("paid NIE wysyła — z tym statusem zamówienie jest zapisywane, mail idzie dopiero przy „W realizacji”", () => {
    expect(shouldNotifyCustomer("paid", "Allegro")).toBe(false);
  });

  it("delivered i pending NIE wysyłają", () => {
    expect(shouldNotifyCustomer("delivered", "Allegro")).toBe(false);
    expect(shouldNotifyCustomer("pending", "Allegro")).toBe(false);
  });
});

describe("mayNotifyCustomer — tani filtr przed odczytem zamówienia", () => {
  it("true dla każdego statusu, przy którym JAKIKOLWIEK rodzaj zamówienia mailuje", () => {
    expect(mayNotifyCustomer("processing")).toBe(true);
    expect(mayNotifyCustomer("shipped")).toBe(true);
    expect(mayNotifyCustomer("cancelled")).toBe(true);
  });

  it("false tam, gdzie nikt nie mailuje — bez zbędnego zapytania do bazy", () => {
    expect(mayNotifyCustomer("paid")).toBe(false);
    expect(mayNotifyCustomer("delivered")).toBe(false);
    expect(mayNotifyCustomer("pending")).toBe(false);
  });

  it("jest nadzbiorem shouldNotifyCustomer dla obu rodzajów zamówień", () => {
    for (const s of ["pending", "paid", "processing", "shipped", "delivered", "cancelled"] as const) {
      if (shouldNotifyCustomer(s, null) || shouldNotifyCustomer(s, "Allegro")) {
        expect(mayNotifyCustomer(s)).toBe(true);
      }
    }
  });
});

describe("wasOrderPaid", () => {
  // Błąd który to naprawia: COD nigdy nie przechodzi przez "pending" (createOrder
  // nadaje mu "processing" od razu), więc bez wyjątku na płatność `previousStatus
  // !== "pending"` byłoby dla każdego COD prawdziwe — mail obiecywałby zwrot
  // gotówki, której sklep nigdy nie wziął.
  it('("cod", "processing") → false — pobranie płaci się gotówką przy dostawie, nie wcześniej', () => {
    expect(wasOrderPaid("cod", "processing", null)).toBe(false);
  });

  it('("cod", "shipped") → false — pobranie można anulować też po wysyłce, wciąż bez zwrotu', () => {
    expect(wasOrderPaid("cod", "shipped", null)).toBe(false);
  });

  it('("cod", "pending") → false', () => {
    expect(wasOrderPaid("cod", "pending", null)).toBe(false);
  });

  it('("online", "pending") → false — nigdy nie opłacone, bez tekstu o zwrocie', () => {
    expect(wasOrderPaid("online", "pending", null)).toBe(false);
  });

  it('("online", "paid") → true', () => {
    expect(wasOrderPaid("online", "paid", null)).toBe(true);
  });

  it('("online", "shipped") → true — opłacone wcześniej, admin przesunął dalej przed anulowaniem', () => {
    expect(wasOrderPaid("online", "shipped", null)).toBe(true);
  });

  it("zamówienie zewnętrzne → ZAWSZE false — zwrot idzie przez marketplace, sklep nie obiecuje pieniędzy", () => {
    expect(wasOrderPaid("online", "paid", "Allegro")).toBe(false);
    expect(wasOrderPaid("online", "shipped", "Allegro")).toBe(false);
    expect(wasOrderPaid("online", "processing", "OLX")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `npx vitest run app/_lib/__tests__/mail-status-notify.test.ts`
Expected: FAIL — `mayNotifyCustomer is not a function`, a testy zewnętrzne dla `processing` → `false` zamiast `true`.

- [ ] **Step 3: Przepisz moduł**

Zastąp całą zawartość `app/_lib/mail/status-notify.ts`:

```ts
import type { OrderStatus, PaymentMethod } from "../types";

// Które przejścia statusu wysyłają mail do klienta. Reguła wyciągnięta
// osobno, żeby dała się przetestować bez bazy i bez Resenda.
//
// Zamówienia ZE SKLEPU (source = null). Świadomie POZA listą:
// - `processing` — ten status admin ustawia, żeby zabrać zamówienie do
//   realizacji, czyli tym samym klikiem gasi licznik nowych zamówień
//   (PR #100). Mail tutaj strzelałby do klienta przy każdym odhaczeniu.
//   Dodatkowo createOrder nadaje `processing` zamówieniom COD od razu.
// - `paid` — webhook ustawia go sekundy po zakupie; potwierdzenie zakupu
//   JEST powiadomieniem o tym statusie.
// - `delivered` — przy meblach klient kwituje odbiór u kierowcy.
const SHOP_NOTIFY_STATUSES: OrderStatus[] = ["shipped", "cancelled"];

// Zamówienia ZEWNĘTRZNE (source = „Allegro" itp., spec 2026-09-02). Tu
// `processing` MAILUJE: takie zamówienie admin wpisuje ręcznie ze statusem
// `paid` (zapłacone na marketplace) i nie przechodzi przez checkout, więc
// klient nie dostał od nas żadnego potwierdzenia. Ręczne „W realizacji" jest
// jedynym momentem, w którym dowiaduje się, że przyjęliśmy zamówienie —
// stąd mail „Dziękujemy za zamówienie" właśnie tutaj.
const EXTERNAL_NOTIFY_STATUSES: OrderStatus[] = ["processing", "shipped", "cancelled"];

export function shouldNotifyCustomer(status: OrderStatus, source: string | null): boolean {
  const list = source === null ? SHOP_NOTIFY_STATUSES : EXTERNAL_NOTIFY_STATUSES;
  return list.includes(status);
}

// Tani filtr PRZED odczytem zamówienia z bazy: `source` znamy dopiero po
// getOrderById, a nie chcemy odpytywać bazy przy każdym `delivered`. Musi być
// nadzbiorem shouldNotifyCustomer dla obu rodzajów zamówień (test pilnuje).
export function mayNotifyCustomer(status: OrderStatus): boolean {
  return EXTERNAL_NOTIFY_STATUSES.includes(status);
}

// Czy zamowienie bylo REALNIE oplacone przed anulowaniem — decyduje o tym, czy
// mail o anulowaniu wspomina zwrot srodkow. Po CAS-ie status to juz "cancelled",
// wiec plactnosc trzeba wywnioskowac z metody i POPRZEDNIEGO statusu.
//
// Zamówienie ZEWNĘTRZNE nigdy nie jest tu „opłacone": pieniądze wziął
// marketplace i on robi zwrot — mail od sklepu nie ma prawa obiecywać
// „skontaktujemy się w sprawie zwrotu środków".
//
// Pobranie NIGDY nie jest tu "oplacone": createOrder nadaje COD status
// "processing" od razu, a "paid" pisze wylacznie markOrderPaid, ktorego COD nie
// dotyka — wiec sam warunek `previousStatus !== "pending"` bylby dla kazdego
// COD prawdziwy i mail obiecywalby zwrot gotowki, ktorej sklep nie wzial.
//
// Znane, swiadomie zaakceptowane ograniczenie: admin moze przestawic
// NIEOPLACONE zamowienie online z "pending" na "processing" (canTransition to
// dopuszcza) i anulowac je dopiero potem — wtedy wyjdzie wasPaid=true. Dokladne
// rozstrzygniecie wymagaloby oparcia sie o kolumne platnosci, ktora otwarty
// PR #48 (migracja na Przelewy24) usuwa — nie wiazemy sie z nia teraz.
export function wasOrderPaid(
  paymentMethod: PaymentMethod,
  previousStatus: OrderStatus,
  source: string | null
): boolean {
  if (source !== null) return false;
  if (paymentMethod === "cod") return false;
  return previousStatus !== "pending";
}
```

- [ ] **Step 4: Popraw wywołania w `notify-order.ts`**

W `app/_lib/mail/notify-order.ts`:

Import — dopisz `mayNotifyCustomer`:

```ts
import { mayNotifyCustomer, shouldNotifyCustomer, wasOrderPaid } from "./status-notify";
```

W `notifyStatusChange` zamień początek funkcji:

```ts
  if (!shouldNotifyCustomer(status)) return;
  try {
    const order = await getOrderById(orderId);
```

na:

```ts
  // Tani filtr bez bazy; właściwa decyzja wymaga `order.source`, więc zapada
  // dopiero po odczycie zamówienia.
  if (!mayNotifyCustomer(status)) return;
  try {
    const order = await getOrderById(orderId);
    if (!shouldNotifyCustomer(status, order.source)) return;
```

Dalej w tej samej funkcji zamień:

```ts
    const wasPaid = wasOrderPaid(order.payment_method, previousStatus);
```

na:

```ts
    const wasPaid = wasOrderPaid(order.payment_method, previousStatus, order.source);
```

Gałąź `processing` (nowy szablon) dochodzi w Task 5 — na razie dla `processing` + źródło funkcja doszłaby do gałęzi „cancelled", więc **tymczasowo** przed `// cancelled — jedyny pozostały status` dodaj:

```ts
    if (status === "processing") return; // szablon dochodzi w Task 5
```

- [ ] **Step 5: Popraw skrypt podglądu maili**

`scripts/preview-mail.mjs` to JavaScript (tsc go nie sprawdzi) i woła `wasOrderPaid("cod", "processing")` z dwoma argumentami — po zmianie sygnatury `source` byłoby `undefined`, a `undefined !== null` dałoby `false` z niewłaściwego powodu. W linii ok. 221 zamień:

```js
      wasPaid: wasOrderPaid("cod", "processing"),
```

na:

```js
      wasPaid: wasOrderPaid("cod", "processing", null),
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/mail-status-notify.test.ts app/_lib/__tests__/mail-notify-order.test.ts && npx tsc --noEmit -p . 2>&1 | head`
Expected: PASS (oba pliki), tsc bez błędów. Jeśli tsc krzyczy, że `shouldNotifyCustomer` jest gdzieś wołane z jednym argumentem — to jedyne miejsce to `notify-order.ts`; popraw je.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/mail/status-notify.ts app/_lib/mail/notify-order.ts app/_lib/__tests__/mail-status-notify.test.ts scripts/preview-mail.mjs
git commit -m "feat(maile): regula powiadomien zna zrodlo zamowienia — processing mailuje tylko zewnetrzne"
```

---

### Task 5: Szablon „Dziękujemy za zamówienie" i podpięcie do `notifyStatusChange`

**Files:**
- Create: `app/_lib/mail/templates/ExternalOrderAccepted.tsx`
- Modify: `app/_lib/mail/notify-order.ts` (gałąź `processing` w `notifyStatusChange`)
- Test: `app/_lib/__tests__/mail-external-order-accepted.test.ts`

**Interfaces:**
- Consumes: `MailLayout`, `MailButton` z `./_Layout`; `MailBranding`; `Order.source`.
- Produces:
  ```ts
  export const EXTERNAL_ORDER_ACCEPTED_SUBJECT = "Dziękujemy za zamówienie – Mollien 🤍";
  export function ExternalOrderAccepted(props: { order: Order; branding: MailBranding; shopUrl: string }): JSX.Element;
  ```

- [ ] **Step 1: Napisz test**

`app/_lib/__tests__/mail-external-order-accepted.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { brandingFromRaw } from "../mail/branding";
import {
  ExternalOrderAccepted,
  EXTERNAL_ORDER_ACCEPTED_SUBJECT,
} from "../mail/templates/ExternalOrderAccepted";
import type { Order } from "../types";

// Szablon czyta z zamówienia wyłącznie `source`; reszta to komplet pól typu.
const ORDER: Order = {
  id: "ext-1",
  user_id: null,
  guest_email: "klient@example.com",
  status: "processing",
  total: 1299.5,
  currency: "pln",
  fx_rate: null,
  shipping_address: {
    fullname: "Jan Kowalski",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    country: "Polska",
  },
  payment_ref: null,
  payment_provider: null,
  payment_method: "online",
  promo_code_id: null,
  promo_discount: 0,
  bundle_discount: 0,
  created_at: "2026-09-02T10:00:00.000Z",
  order_number: 501,
  admin_note: null,
  carrier: null,
  tracking_number: null,
  delivery_cost: null,
  delivery_paid: false,
  status_updated_at: null,
  source: "Allegro",
};

async function html(over: Partial<Order> = {}) {
  return render(
    ExternalOrderAccepted({
      order: { ...ORDER, ...over },
      branding: brandingFromRaw(null),
      shopUrl: "https://www.mollien.pl",
    })
  );
}

describe("ExternalOrderAccepted", () => {
  it("temat dokładnie jak w zgłoszeniu właściciela (półpauza, białe serce)", () => {
    expect(EXTERNAL_ORDER_ACCEPTED_SUBJECT).toBe("Dziękujemy za zamówienie – Mollien 🤍");
  });

  it("podstawia nazwę źródła w miejsce „[Allegro]”", async () => {
    expect(await html()).toContain("Źródło zamówienia: Allegro");
    expect(await html({ source: "Vinted" })).toContain("Źródło zamówienia: Vinted");
  });

  it("zawiera treść ze zgłoszenia: przyjęcie, 21 dni roboczych, podpis", async () => {
    const out = await html();
    expect(out).toContain("dziękujemy za zakup i wybór Mollien");
    expect(out).toContain("przyjęte i przekazane do realizacji");
    expect(out).toContain("do 21 dni roboczych");
    expect(out).toContain("Zespół Mollien");
  });

  it("przycisk „Odwiedź sklep Mollien” prowadzi do sklepu", async () => {
    const out = await html();
    expect(out).toContain("Odwiedź sklep Mollien");
    expect(out).toContain('href="https://www.mollien.pl"');
  });

  it("NIE pokazuje numeru zamówienia sklepu — klient zna numer z marketplace", async () => {
    expect(await html()).not.toContain("#501");
  });
});
```

- [ ] **Step 2: Uruchom test — ma paść**

Run: `npx vitest run app/_lib/__tests__/mail-external-order-accepted.test.ts`
Expected: FAIL — `Failed to resolve import "../mail/templates/ExternalOrderAccepted"`.

- [ ] **Step 3: Napisz szablon**

`app/_lib/mail/templates/ExternalOrderAccepted.tsx`:

```tsx
import { Text } from "@react-email/components";
import type { Order } from "../../types";
import type { MailBranding } from "../branding";
import { MailButton, MailLayout } from "./_Layout";

// Mail do klienta, który kupił POZA sklepem (Allegro, OLX, …), wysyłany gdy
// admin ręcznie przestawia zamówienie zewnętrzne na „W realizacji" (spec
// 2026-09-02). Treść 1:1 od właściciela; jedyna zmienna to nazwa źródła.
// Tylko PL — zamówienia zewnętrzne są wyłącznie polskie.
//
// Świadomie bez numeru zamówienia i bez listy pozycji: klient zna numer
// z marketplace, a nasz #N nic mu nie mówi.
export const EXTERNAL_ORDER_ACCEPTED_SUBJECT = "Dziękujemy za zamówienie – Mollien 🤍";

export function ExternalOrderAccepted({
  order,
  branding,
  shopUrl,
}: {
  order: Order;
  branding: MailBranding;
  // Strona główna sklepu (NEXT_PUBLIC_APP_URL) — cel przycisku „Odwiedź sklep".
  shopUrl: string;
}) {
  const c = branding.colors;
  const p = { color: c.fg, fontSize: "14px", lineHeight: "1.6", margin: "0 0 16px" };

  return (
    <MailLayout
      branding={branding}
      locale="pl"
      preview="Dziękujemy za zakup i wybór Mollien"
      heading="Dziękujemy za zamówienie"
    >
      <Text style={p}>Dzień dobry,</Text>
      <Text style={p}>dziękujemy za zakup i wybór Mollien! 🤍</Text>
      <Text style={p}>
        Potwierdzamy, że Państwa zamówienie zostało przyjęte i przekazane do realizacji.
      </Text>
      <Text style={{ ...p, fontWeight: 600 }}>Źródło zamówienia: {order.source}</Text>
      <Text style={p}>Mebel zostanie przygotowany zgodnie z wybranym przez Państwa wariantem.</Text>
      <Text style={p}>🛋️ Przewidywany czas realizacji: do 21 dni roboczych.</Text>
      <Text style={p}>O kolejnych etapach realizacji będziemy informować na bieżąco.</Text>
      <Text style={{ ...p, margin: "0 0 20px" }}>
        Jeżeli chcą Państwo zobaczyć więcej naszych modeli, dostępne kolekcje, tkaniny oraz
        pozostałe produkty znajdą Państwo w naszym sklepie:
      </Text>
      {/* Przycisk poza <Text>, jak w OrderShipped — <Button> ma własny blok. */}
      <MailButton branding={branding} href={shopUrl}>
        👉 Odwiedź sklep Mollien
      </MailButton>
      <Text style={{ ...p, margin: "24px 0 16px" }}>Dziękujemy za zaufanie i wybór Mollien!</Text>
      <Text style={p}>
        Mamy nadzieję, że nowy mebel będzie pięknym elementem Państwa wnętrza. 🤍
      </Text>
      <Text style={{ ...p, margin: 0 }}>
        Pozdrawiamy,
        <br />
        Zespół Mollien.
      </Text>
    </MailLayout>
  );
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/mail-external-order-accepted.test.ts`
Expected: PASS (5 testów).

- [ ] **Step 4a: Dopisz szablon do podglądu maili**

W `scripts/preview-mail.mjs` dodaj import obok pozostałych szablonów:

```js
import { ExternalOrderAccepted } from "../app/_lib/mail/templates/ExternalOrderAccepted.tsx";
```

i wpis w tablicy `cases` (np. po `order-cancelled-cod-pl`):

```js
  {
    name: "external-order-accepted-pl",
    el: ExternalOrderAccepted({
      order: { ...order, source: "Allegro" },
      branding,
      shopUrl: "https://www.mollien.pl",
    }),
  },
```

Run: `npm run preview:mail && ls mail-preview | grep external`
Expected: `external-order-accepted-pl.html`. Otwórz plik (Read) i sprawdź, że przycisk stoi pod akapitem o sklepie, a nie jest wciśnięty w tekst.

- [ ] **Step 5: Podpnij szablon w `notifyStatusChange`**

W `app/_lib/mail/notify-order.ts` dopisz import:

```ts
import {
  ExternalOrderAccepted,
  EXTERNAL_ORDER_ACCEPTED_SUBJECT,
} from "./templates/ExternalOrderAccepted";
```

Usuń tymczasową linię `if (status === "processing") return; // szablon dochodzi w Task 5` i w jej miejsce (PRZED `if (status === "shipped")`) wstaw:

```ts
    // processing przechodzi przez shouldNotifyCustomer TYLKO dla zamówień
    // zewnętrznych — klient z marketplace dostaje tu jedyne od nas
    // potwierdzenie przyjęcia (spec 2026-09-02).
    if (status === "processing") {
      const html = await render(
        ExternalOrderAccepted({ order, branding, shopUrl: base })
      );
      await sendMail({ to, subject: EXTERNAL_ORDER_ACCEPTED_SUBJECT, html });
      return;
    }
```

(`base` to już istniejąca stała `process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl"` kilka linii wyżej w tej funkcji.)

- [ ] **Step 6: Dopisz test integracyjny `notifyStatusChange`**

Na końcu `app/_lib/__tests__/mail-notify-order.test.ts` (mocki `getOrderById`, `sendMail`, `branding-server` już tam są) dodaj:

```ts
import { notifyStatusChange } from "../mail/notify-order";

describe("notifyStatusChange — zamówienie zewnętrzne", () => {
  const EXTERNAL_ORDER = { ...MINIMAL_ORDER, source: "Allegro", status: "processing" };

  beforeEach(() => {
    getOrderByIdMock.mockReset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(true);
  });

  it("processing + źródło → mail „Dziękujemy” ze źródłem w treści", async () => {
    getOrderByIdMock.mockResolvedValue(EXTERNAL_ORDER);

    await notifyStatusChange(EXTERNAL_ORDER.id, "processing", "paid");

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe(EXTERNAL_ORDER.guest_email);
    expect(payload.subject).toBe("Dziękujemy za zamówienie – Mollien 🤍");
    expect(payload.html).toContain("Źródło zamówienia: Allegro");
  });

  it("processing BEZ źródła (sklep) → nic nie wysyła i nie odpytuje bazy o nic więcej", async () => {
    getOrderByIdMock.mockResolvedValue({ ...MINIMAL_ORDER, source: null });

    await notifyStatusChange(MINIMAL_ORDER.id, "processing", "paid");

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("delivered → nie czyta nawet zamówienia (tani filtr)", async () => {
    await notifyStatusChange("any", "delivered", "shipped");

    expect(getOrderByIdMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("cancelled + źródło → mail o anulowaniu BEZ obietnicy zwrotu", async () => {
    getOrderByIdMock.mockResolvedValue({ ...EXTERNAL_ORDER, status: "cancelled" });

    await notifyStatusChange(EXTERNAL_ORDER.id, "cancelled", "paid");

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0].html).not.toContain("zwrotu środków");
  });
});
```

Import `notifyStatusChange` przenieś do istniejącej linii `import { notifyOrderPlaced } from "../mail/notify-order";` (jeden import: `import { notifyOrderPlaced, notifyStatusChange } from "../mail/notify-order";`). `MINIMAL_ORDER` w tym pliku nie ma pola `source` — dopisz do niego `source: null,` po `status_updated_at: null,`.

- [ ] **Step 7: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/mail-notify-order.test.ts app/_lib/__tests__/mail-external-order-accepted.test.ts app/_lib/__tests__/mail-status-notify.test.ts && npx tsc --noEmit -p . 2>&1 | head`
Expected: PASS wszystkie; tsc czysty.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/mail/templates/ExternalOrderAccepted.tsx app/_lib/mail/notify-order.ts app/_lib/__tests__/mail-external-order-accepted.test.ts app/_lib/__tests__/mail-notify-order.test.ts scripts/preview-mail.mjs
git commit -m "feat(maile): szablon „Dziekujemy za zamowienie” dla zamowien zewnetrznych przy W realizacji"
```

---

### Task 6: Etykieta statusu ze źródłem — `adminStatusLabel`

**Files:**
- Modify: `app/_lib/order-status.ts` (dopisz na końcu)
- Test: `app/_lib/__tests__/order-status.test.ts` (dopisz na końcu)

**Interfaces:**
- Produces: `export function adminStatusLabel(status: OrderStatus, source: string | null): { label: string; className: string }` — Task 9 używa na liście i karcie zamiast bezpośredniego `ADMIN_STATUS_LABELS[status]`.

- [ ] **Step 1: Dopisz test**

Na końcu `app/_lib/__tests__/order-status.test.ts`:

```ts
import { adminStatusLabel, ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";

describe("adminStatusLabel", () => {
  it("sklep: to samo co ADMIN_STATUS_LABELS", () => {
    for (const s of ["pending", "paid", "processing", "shipped", "delivered", "cancelled"] as const) {
      expect(adminStatusLabel(s, null)).toEqual(ADMIN_STATUS_LABELS[s]);
    }
  });

  it("zewnętrzne + paid: „Opłacone (zewn.)” — żeby nie sugerowało wpłaty przez P24", () => {
    const l = adminStatusLabel("paid", "Allegro");
    expect(l.label).toBe("Opłacone (zewn.)");
    expect(l.className).toBe(ADMIN_STATUS_LABELS.paid.className);
  });

  it("zewnętrzne + inne statusy: bez zmian", () => {
    expect(adminStatusLabel("processing", "Allegro")).toEqual(ADMIN_STATUS_LABELS.processing);
    expect(adminStatusLabel("shipped", "OLX")).toEqual(ADMIN_STATUS_LABELS.shipped);
  });
});
```

Import `adminStatusLabel, ADMIN_STATUS_LABELS` dołącz do istniejącej linii `import { canTransition, nextStatuses } from "@/app/_lib/order-status";` (jeden import).

- [ ] **Step 2: Uruchom test — ma paść**

Run: `npx vitest run app/_lib/__tests__/order-status.test.ts`
Expected: FAIL — `adminStatusLabel is not a function`.

- [ ] **Step 3: Dopisz funkcję**

Na końcu `app/_lib/order-status.ts`:

```ts
// Etykieta statusu z uwzględnieniem źródła zamówienia. Zamówienie zewnętrzne
// (Allegro itp.) wpisane ręcznie startuje jako `paid`, ale pieniądze wziął
// marketplace, nie P24 — „Opłacone" bez dopisku sugerowałoby wpłatę, której
// w panelu Przelewy24 nie ma. Pozostałe statusy znaczą to samo dla obu.
export function adminStatusLabel(
  status: OrderStatus,
  source: string | null
): { label: string; className: string } {
  const base = ADMIN_STATUS_LABELS[status];
  if (status === "paid" && source !== null) return { ...base, label: "Opłacone (zewn.)" };
  return base;
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/order-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-status.ts app/_lib/__tests__/order-status.test.ts
git commit -m "feat(zamowienia): adminStatusLabel — „Oplacone (zewn.)” dla zamowien zewnetrznych"
```

---

### Task 7: Server action `createExternalOrder` i filtr `external` w `getAdminOrders`

**Files:**
- Modify: `app/admin/zamowienia/actions.ts` (dopisz na końcu + import)
- Modify: `app/_lib/orders.ts:139-187` (`getAdminOrders`)

**Interfaces:**
- Consumes: `parseExternalOrderInput` (Task 3).
- Produces:
  ```ts
  export type CreateExternalOrderResult = { ok: true; orderId: string } | { ok: false; error: string };
  export async function createExternalOrder(formData: FormData): Promise<CreateExternalOrderResult>;
  // orders.ts
  getAdminOrders({ status, search, page, external }: { …; external?: boolean })
  ```
  Formularz (Task 8) wysyła FormData z polami: `source`, `source_name`, `email`, `fullname`, `phone`, `street`, `postal_code`, `city`, `items` (JSON).

Brak testu jednostkowego — akcja jest cienką warstwą nad bazą (wzór: pozostałe akcje w tym pliku); logika siedzi w Task 3. Weryfikacja: `tsc` + `lint` tutaj, zachowanie na żywo w Task 10.

- [ ] **Step 1: Dopisz akcję**

W `app/admin/zamowienia/actions.ts` dodaj import:

```ts
import { parseExternalOrderInput } from "@/app/_lib/external-order";
```

Na końcu pliku:

```ts
export type CreateExternalOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

// Ręczne dodanie zamówienia spoza sklepu (Allegro, OLX, …) — spec 2026-09-02.
// Walidacja i suma w czystym parseExternalOrderInput; tu tylko zapis.
// Zamówienie startuje jako `paid` (zapłacone na marketplace) z
// status_updated_at = null, więc wpada do licznika „nowe zamówienia" jak zakup
// ze sklepu i gaśnie przy „W realizacji" — a ta zmiana wysyła klientowi mail
// „Dziękujemy za zamówienie" (notifyStatusChange). Tu maila NIE wysyłamy.
export async function createExternalOrder(
  formData: FormData
): Promise<CreateExternalOrderResult> {
  await requireAdmin();
  const parsed = parseExternalOrderInput({
    source: formData.get("source"),
    source_name: formData.get("source_name"),
    email: formData.get("email"),
    fullname: formData.get("fullname"),
    phone: formData.get("phone"),
    street: formData.get("street"),
    postal_code: formData.get("postal_code"),
    city: formData.get("city"),
    items: formData.get("items"),
  });
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  const supabase = await createAdminClient();

  // Produkty muszą istnieć: FK i tak by odrzucił, ale komunikat ma być po
  // polsku, a nie z Postgresa — i zanim zajmiemy numer zamówienia.
  const ids = [...new Set(input.items.map((i) => i.product_id))];
  const { data: found, error: prodErr } = await supabase
    .from("products")
    .select("id")
    .in("id", ids);
  if (prodErr) return { ok: false, error: prodErr.message };
  if ((found ?? []).length !== ids.length) {
    return { ok: false, error: "Któryś z produktów już nie istnieje — odśwież stronę" };
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: null,
      guest_email: input.email,
      source: input.source,
      status: "paid",
      total: input.total,
      shipping_address: input.address as unknown as Record<string, unknown>,
      // 'online' bez nowej wartości CHECK — rozróżnienie daje `source`.
      payment_method: "online",
      payment_provider: null,
      payment_ref: null,
      currency: "pln",
      fx_rate: null,
      promo_code_id: null,
      promo_discount: 0,
      bundle_discount: 0,
    } as never)
    .select("id")
    .single();
  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? "Nie udało się zapisać zamówienia" };
  }
  const orderId = (order as { id: string }).id;

  const { error: itemsErr } = await supabase.from("order_items").insert(
    input.items.map((it) => ({
      order_id: orderId,
      product_id: it.product_id,
      quantity: it.quantity,
      price: it.price,
      notes: it.notes,
      variant_values: null,
    })) as never[]
  );
  if (itemsErr) {
    // Zamówienie bez pozycji to śmieć z zajętym numerem — sprzątamy, żeby admin
    // mógł poprawić dane i zapisać od nowa bez dziury w numeracji na liście.
    const { error: cleanupErr } = await supabase.from("orders").delete().eq("id", orderId);
    if (cleanupErr) {
      // Sprzątanie też padło, więc puste zamówienie ZOSTAJE w bazie. Admin musi
      // o tym wiedzieć — inaczej zobaczy na liście pozycję znikąd i nie będzie
      // miał jak powiązać jej z tym błędem.
      console.error(
        "[zamowienia] sprzatanie po nieudanym zapisie pozycji nieudane:",
        cleanupErr.message
      );
      return {
        ok: false,
        error: `${itemsErr.message}. Uwaga: nie udało się usunąć pustego zamówienia — sprawdź listę zamówień.`,
      };
    }
    return { ok: false, error: itemsErr.message };
  }

  revalidatePath("/admin/zamowienia");
  return { ok: true, orderId };
}
```

- [ ] **Step 2: Filtr „Zewnętrzne" w `getAdminOrders`**

W `app/_lib/orders.ts` zmień sygnaturę i zapytanie:

```ts
export async function getAdminOrders({
  status,
  search,
  page = 1,
  external = false,
}: {
  status?: OrderStatus | "all";
  search?: string;
  page?: number;
  // Tylko zamówienia spoza sklepu (orders.source is not null) — filtr
  // „Zewnętrzne" na liście w panelu.
  external?: boolean;
}): Promise<{ orders: AdminOrderRow[]; total: number; pages: number; page: number }> {
```

Po bloku `if (status && status !== "all") { … }` dodaj:

```ts
  if (external) {
    query = query.not("source", "is", null);
  }
```

- [ ] **Step 3: Kompilacja i lint**

Run: `npx tsc --noEmit -p . 2>&1 | head && npx eslint app/admin/zamowienia/actions.ts app/_lib/orders.ts`
Expected: bez błędów.

- [ ] **Step 4: Commit**

```bash
git add app/admin/zamowienia/actions.ts app/_lib/orders.ts
git commit -m "feat(zamowienia): akcja createExternalOrder i filtr zewnetrznych w getAdminOrders"
```

---

### Task 8: Formularz `/admin/zamowienia/nowe`

**Files:**
- Create: `app/admin/zamowienia/nowe/page.tsx`
- Create: `app/admin/zamowienia/nowe/ExternalOrderForm.tsx`
- Modify: `app/admin/zamowienia/page.tsx:62-80` (przycisk obok szukajki)

**Interfaces:**
- Consumes: `createExternalOrder` (Task 7), `ORDER_SOURCES`/`OTHER_SOURCE`/`SOURCE_MAX_LENGTH` (Task 2), `NOTES_MAX_LENGTH` (Task 3), `filterBySearch`, `effectivePrice`, `formatPrice`, `Field`/`Card`/`inputCls`/`ToastView`.
- Produces: `export type ProductOption = { id: string; name: string; price: number; sale_price: number | null; images: string[] | null }` (eksport z `ExternalOrderForm.tsx`, jak `PickerProduct` w zestawach).

- [ ] **Step 1: Strona serwerowa**

`app/admin/zamowienia/nowe/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import ExternalOrderForm, { type ProductOption } from "./ExternalOrderForm";

export const metadata = { title: "Dodaj zamówienie — Admin" };

// Ręczne dodanie zamówienia spoza sklepu (Allegro, OLX, …) — spec 2026-09-02.
// Lista produktów idzie raz, w całości: picker filtruje w przeglądarce
// (filterBySearch), jak edytor zestawów. Tylko aktywne — nieaktywnego nikt
// już nie sprzedaje.
export default async function AdminNewExternalOrderPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, sale_price, images, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/zamowienia"
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Wszystkie zamówienia
        </Link>
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)]">Dodaj zamówienie</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Zamówienie spoza sklepu (Allegro, OLX itp.). Cena to kwota z tamtego sklepu — może
          się różnić od naszej. Po zapisaniu zamówienie ma status „Opłacone (zewn.)"; gdy
          przestawisz je na „W realizacji", klient dostanie mail „Dziękujemy za zamówienie".
        </p>
      </div>
      <ExternalOrderForm products={(products ?? []) as ProductOption[]} />
    </div>
  );
}
```

- [ ] **Step 2: Formularz klientowy**

`app/admin/zamowienia/nowe/ExternalOrderForm.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { filterBySearch } from "@/app/_lib/search-normalize";
import { effectivePrice } from "@/app/_lib/pricing";
import { formatPrice } from "@/app/_lib/format";
import { ORDER_SOURCES, OTHER_SOURCE, SOURCE_MAX_LENGTH } from "@/app/_lib/order-source";
import { NOTES_MAX_LENGTH, parsePrice } from "@/app/_lib/external-order";
import { createExternalOrder } from "../actions";

// Minimalny kształt produktu do pickera (page.tsx nie ciągnie pełnych wierszy).
export type ProductOption = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
};

// Wiersz pozycji w formularzu. Cena i ilość jako TEKST — admin wpisuje
// „1 299,50", a parsowanie robi parseExternalOrderInput po stronie serwera;
// tu tylko podgląd sumy. `key` bo ten sam produkt może być dwa razy (dwa
// warianty), więc product_id nie nadaje się na klucz Reacta.
type Row = {
  key: number;
  product_id: string;
  name: string;
  price: string;
  quantity: string;
  notes: string;
};

export default function ExternalOrderForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [source, setSource] = useState<string>(ORDER_SOURCES[0]);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [pending, startTransition] = useTransition();
  // Licznik kluczy wierszy — ref, bo zmiana nie ma renderować.
  const nextKey = useRef(1);

  // Wyszukiwarka jak w /admin/zestawy — filtr kliencki po znormalizowanym tekście.
  const filtered = useMemo(
    () => (query.trim() ? filterBySearch(products, query, (p) => [p.name]).slice(0, 20) : []),
    [products, query]
  );

  // Podgląd sumy: to samo parsowanie co na serwerze, więc nie rozjedzie się
  // z tym, co trafi do bazy. Wiersz z nieczytelną ceną liczy się jako 0.
  const total = rows.reduce((s, r) => {
    const price = parsePrice(r.price) ?? 0;
    const qty = Number(r.quantity);
    return s + price * (Number.isInteger(qty) && qty > 0 ? qty : 0);
  }, 0);

  function addProduct(p: ProductOption) {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey.current++,
        product_id: p.id,
        name: p.name,
        // Podpowiedź: cena sklepowa. Admin nadpisuje ją ceną z marketplace.
        price: String(effectivePrice(Number(p.price), p.sale_price)),
        quantity: "1",
        notes: "",
      },
    ]);
    setQuery("");
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function submit(formData: FormData) {
    setToast(null);
    // Pozycje jako jeden JSON — patrz RawExternalOrder w external-order.ts.
    formData.set(
      "items",
      JSON.stringify(
        rows.map((r) => ({
          product_id: r.product_id,
          price: r.price,
          quantity: r.quantity,
          notes: r.notes,
        }))
      )
    );
    startTransition(async () => {
      const res = await createExternalOrder(formData);
      if (res.ok) {
        router.push(`/admin/zamowienia/${res.orderId}`);
      } else {
        setToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Źródło */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Źródło zamówienia</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Skąd przyszło zamówienie" required>
            <select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={inputCls}
            >
              {ORDER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={OTHER_SOURCE}>{OTHER_SOURCE}</option>
            </select>
          </Field>
          {source === OTHER_SOURCE && (
            <Field
              label="Nazwa źródła"
              required
              hint="Ta nazwa trafi do maila dla klienta (np. „Vinted”)."
            >
              <input
                name="source_name"
                required
                maxLength={SOURCE_MAX_LENGTH}
                placeholder="np. Vinted"
                className={inputCls}
              />
            </Field>
          )}
        </div>
      </Card>

      {/* Klient */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Klient</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Imię i nazwisko" required>
            <input name="fullname" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="E-mail" required hint="Na ten adres pójdą maile o zamówieniu.">
            <input name="email" type="email" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="Telefon">
            <input name="phone" maxLength={40} className={inputCls} />
          </Field>
          <Field label="Ulica i numer" required>
            <input name="street" required maxLength={200} className={inputCls} />
          </Field>
          <Field label="Kod pocztowy" required>
            <input name="postal_code" required maxLength={20} placeholder="00-001" className={inputCls} />
          </Field>
          <Field label="Miasto" required>
            <input name="city" required maxLength={120} className={inputCls} />
          </Field>
        </div>
      </Card>

      {/* Pozycje */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Pozycje</h3>

        <Field label="Dodaj produkt" hint="Wpisz fragment nazwy, potem kliknij produkt na liście.">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj produktu…"
            className={inputCls}
            autoComplete="off"
          />
        </Field>
        {query.trim() && (
          <ul
            aria-label="Wyniki wyszukiwania"
            className="mt-2 max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]"
          >
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center gap-3 p-2 text-left hover:bg-[var(--bg)] transition-colors"
                >
                  <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                    {p.images?.[0] ? (
                      <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    ) : null}
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">{p.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    u nas: {formatPrice(effectivePrice(Number(p.price), p.sale_price), "pl")}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
            )}
          </ul>
        )}

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Brak pozycji — wyszukaj produkt powyżej.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-[var(--border)]" aria-label="Pozycje zamówienia">
            {rows.map((r, idx) => (
              <li key={r.key} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[var(--fg)]">
                    {idx + 1}. {r.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Usuń
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[10rem_6rem_1fr] gap-3">
                  <Field label="Cena (zł)" required hint="Cena z tamtego sklepu.">
                    <input
                      value={r.price}
                      onChange={(e) => updateRow(r.key, { price: e.target.value })}
                      inputMode="decimal"
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Ilość" required>
                    <input
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                      type="number"
                      min={1}
                      step={1}
                      required
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Wariant / uwagi" hint="np. „Vena 12, narożnik lewy”.">
                    <input
                      value={r.notes}
                      onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                      maxLength={NOTES_MAX_LENGTH}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between text-base font-bold text-[var(--fg)]">
          <span>Razem</span>
          <span data-testid="external-order-total">{formatPrice(total, "pl")}</span>
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || rows.length === 0}
          className="px-6 py-2.5 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Zapisywanie…" : "Zapisz zamówienie"}
        </button>
        {rows.length === 0 && (
          <span className="text-xs text-[var(--muted)]">Dodaj co najmniej jedną pozycję.</span>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Przycisk na liście**

W `app/admin/zamowienia/page.tsx` dopisz link obok szukajki. Zamień otwierający tag formularza szukajki:

```tsx
      {/* Szukajka — natywny formularz GET (działa bez JS) */}
      <form action="/admin/zamowienia" data-guard-ignore className="flex gap-2 max-w-lg">
```

na blok:

```tsx
      <div className="flex flex-wrap items-center gap-3">
      {/* Szukajka — natywny formularz GET (działa bez JS) */}
      <form action="/admin/zamowienia" data-guard-ignore className="flex gap-2 flex-1 min-w-[280px] max-w-lg">
```

a po zamykającym `</form>` szukajki dodaj:

```tsx
      <Link
        href="/admin/zamowienia/nowe"
        className="shrink-0 px-5 py-2 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj zamówienie
      </Link>
      </div>
```

(`Link` jest już importowany w tym pliku.)

- [ ] **Step 4: Kompilacja, lint, build**

Run: `npx tsc --noEmit -p . 2>&1 | head && npx eslint app/admin/zamowienia && npm run build 2>&1 | tail -15`
Expected: bez błędów; w wyjściu buildu trasa `/admin/zamowienia/nowe`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/zamowienia/nowe app/admin/zamowienia/page.tsx
git commit -m "feat(panel): formularz „Dodaj zamowienie” dla zamowien spoza sklepu"
```

---

### Task 9: Lista i karta — plakietka źródła, filtr „Zewnętrzne", etykiety

**Files:**
- Modify: `app/admin/zamowienia/page.tsx` (FILTERS, parsowanie `status`, przekazanie `source`)
- Modify: `app/admin/zamowienia/OrderRow.tsx` (prop `source`)
- Modify: `app/admin/zamowienia/[id]/page.tsx` (wiersz „Źródło", etykiety)

**Interfaces:**
- Consumes: `adminStatusLabel` (Task 6), `getAdminOrders({ external })` (Task 7), `Order.source` (Task 1).

- [ ] **Step 1: Filtr „Zewnętrzne" na liście**

W `app/admin/zamowienia/page.tsx`:

Zmień typ i listę filtrów:

```ts
type FilterValue = OrderStatus | "all" | "external";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "external", label: "Zewnętrzne" },
  { value: "paid", label: "Opłacone" },
  { value: "processing", label: "W realizacji" },
  { value: "shipped", label: "Wysłane" },
  { value: "delivered", label: "Dostarczone" },
  { value: "cancelled", label: "Anulowane" },
  { value: "pending", label: "Oczekujące" },
];
```

Zamień parsowanie parametru `status`:

```ts
  const status = (FILTERS.some((f) => f.value === sp.status) ? sp.status : "all") as
    | OrderStatus
    | "all";
```

na:

```ts
  // „external" jedzie w tym samym parametrze `status`, żeby linki filtrów i
  // paginacja nie musiały znać drugiego parametru. Dla zapytania to
  // status=all + source is not null.
  const filter = (FILTERS.some((f) => f.value === sp.status) ? sp.status : "all") as FilterValue;
  const external = filter === "external";
  const status: OrderStatus | "all" = external ? "all" : filter;
```

W wywołaniu `getAdminOrders({ status, search, page })` dodaj `external`:

```ts
  const { orders, total, pages, page: currentPage } = await getAdminOrders({
    status,
    search,
    page,
    external,
  });
```

Zamień `if (status !== "all") rawParams.status = status;` na `if (filter !== "all") rawParams.status = filter;`.

W szukajce zamień `{status !== "all" && <input type="hidden" name="status" value={status} />}` na `{filter !== "all" && <input type="hidden" name="status" value={filter} />}`.

W pętli filtrów zamień `const active = f.value === status;` na `const active = f.value === filter;`.

W renderze wierszy zamień `const s = ADMIN_STATUS_LABELS[o.status];` na `const s = adminStatusLabel(o.status, o.source);` i do `<OrderRow …>` dodaj prop `source={o.source}`. Import: zamień `ADMIN_STATUS_LABELS` na `adminStatusLabel` w linii importu z `@/app/_lib/order-status`.

- [ ] **Step 2: Plakietka w wierszu**

W `app/admin/zamowienia/OrderRow.tsx` dodaj prop `source: string | null` (do destrukturyzacji i do typu propsów) i po plakietce `Pobranie` wstaw:

```tsx
        {source && (
          <span
            className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest text-sky-800 bg-sky-100 dark:bg-sky-950 dark:text-sky-300"
            title={`Zamówienie spoza sklepu: ${source}`}
          >
            {source}
          </span>
        )}
```

- [ ] **Step 3: Karta zamówienia**

W `app/admin/zamowienia/[id]/page.tsx`:

Import: zamień `ADMIN_STATUS_LABELS, nextStatuses` na `adminStatusLabel, nextStatuses`, a `const s = ADMIN_STATUS_LABELS[order.status];` na `const s = adminStatusLabel(order.status, order.source);`.

Pod `<p className="text-xs text-[var(--muted)] mt-1">{new Date(order.created_at)…}</p>` (wewnątrz tego samego `<div>`) dodaj:

```tsx
          {order.source && (
            <p className="text-xs text-[var(--muted)] mt-1">
              Źródło: <span className="font-semibold text-[var(--fg)]">{order.source}</span>{" "}
              (zamówienie spoza sklepu)
            </p>
          )}
```

Etykieta kwoty — zamień:

```tsx
                <dt>{order.payment_method === "cod" ? "Do pobrania" : "Zapłacono"}</dt>
```

na:

```tsx
                <dt>
                  {order.payment_method === "cod"
                    ? "Do pobrania"
                    : order.source
                      ? `Zapłacono (${order.source})`
                      : "Zapłacono"}
                </dt>
```

Karta „Klient" — zamień:

```tsx
              {customer.isGuest ? "Zamówienie gościa" : "Konto zarejestrowane"}
```

na:

```tsx
              {order.source
                ? `Zamówienie zewnętrzne — ${order.source}`
                : customer.isGuest
                  ? "Zamówienie gościa"
                  : "Konto zarejestrowane"}
```

- [ ] **Step 4: Kompilacja, lint, testy**

Run: `npx tsc --noEmit -p . 2>&1 | head && npx eslint app/admin/zamowienia && npm test 2>&1 | tail -8`
Expected: tsc czysty, lint czysty, wszystkie testy PASS. Jeśli `admin-orders.test.ts` czy inne fikstury typowane jako `Order` krzyczą o brak `source` — dopisz `source: null`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/zamowienia/page.tsx app/admin/zamowienia/OrderRow.tsx "app/admin/zamowienia/[id]/page.tsx"
git commit -m "feat(panel): filtr Zewnetrzne, plakietka zrodla i etykiety dla zamowien zewnetrznych"
```

---

### Task 10: Spec Playwrighta (niezapisujący) i weryfikacja na buildzie

**Files:**
- Create: `e2e/zamowienie-zewnetrzne-form.spec.ts`

**Interfaces:**
- Consumes: formularz z Task 8 (`aria-label="Wyniki wyszukiwania"`, `aria-label="Pozycje zamówienia"`, `data-testid="external-order-total"`, przycisk „Zapisz zamówienie").

- [ ] **Step 1: Napisz spec**

`e2e/zamowienie-zewnetrzne-form.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Formularz „Dodaj zamówienie" (zamówienia spoza sklepu) — spec 2026-09-02.
//
// ⚠️ TEST JEST NIEZAPISUJĄCY i to warunek jego istnienia: baza jest jedna dla
// wszystkich środowisk (localhost łączy się z produkcyjnym Supabase), więc klik
// w „Zapisz zamówienie" dodałby PRAWDZIWE zamówienie z numerem na liście
// i wysłałby maile przy zmianie statusu. Sprawdzamy wyłącznie stan formularza:
// wyszukiwarkę, dodanie wiersza z podpowiedzianą ceną, przeliczenie sumy
// i pole „Nazwa źródła" przy „Inne".
//
// Wymaga sesji admina (storageState z auth.setup + .env.e2e). Uruchamiaj
// z E2E_BASE_URL na buildzie (`npm run build && PORT=3100 npm run start`).

test("wyszukiwarka dodaje wiersz z ceną, suma się przelicza, „Zapisz” NIE jest klikane", async ({ page }) => {
  await page.goto("/admin/zamowienia/nowe");
  await expect(page).not.toHaveURL(/\/logowanie/);
  await expect(page.getByRole("heading", { name: "Dodaj zamówienie" })).toBeVisible();

  // Przycisk zapisu zablokowany bez pozycji.
  const save = page.getByRole("button", { name: "Zapisz zamówienie" });
  await expect(save).toBeDisabled();

  // Szukaj po fragmencie — lista produktów w sklepie zmienia się, więc
  // bierzemy pierwszy wynik dla samogłoski, nie konkretną nazwę.
  await page.getByPlaceholder("Szukaj produktu…").fill("a");
  const results = page.getByLabel("Wyniki wyszukiwania").getByRole("button");
  await expect(results.first()).toBeVisible();
  // Pierwszy <span> w przycisku to nazwa produktu (drugi to „u nas: cena”).
  const firstName = (await results.first().locator("span").first().innerText()).trim();
  await results.first().click();

  const rows = page.getByLabel("Pozycje zamówienia").getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(firstName);

  // Cena podpowiedziana ze sklepu → nadpisujemy ceną „z Allegro" z przecinkiem.
  const price = rows.first().getByLabel("Cena (zł)");
  await expect(price).not.toHaveValue("");
  await price.fill("1 299,50");
  await rows.first().getByLabel("Ilość").fill("2");
  await expect(page.getByTestId("external-order-total")).toContainText("2599");

  // Z pozycją przycisk jest aktywny — ale NIE KLIKAMY (żywa baza).
  await expect(save).toBeEnabled();

  // „Inne" odsłania wymagane pole nazwy.
  await page.getByLabel("Skąd przyszło zamówienie").selectOption("Inne");
  await expect(page.getByLabel("Nazwa źródła")).toBeVisible();

  await page.screenshot({ path: "e2e/screens/zamowienie-zewnetrzne-form.png", fullPage: true });
});
```

- [ ] **Step 2: Build i start**

Run (w tle, w osobnym terminalu albo `run_in_background`): `npm run build && PORT=3100 npm run start`
Expected: build bez błędów, serwer słucha na 3100. Nie używaj `next dev` (pada po pierwszym teście — patrz pamięć `playwright-na-buildzie-nie-devie`).

- [ ] **Step 3: Uruchom spec**

Run: `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/zamowienie-zewnetrzne-form.spec.ts`
Expected: PASS; zrzut w `e2e/screens/zamowienie-zewnetrzne-form.png`. Obejrzyj zrzut (Read) — trzy karty, wiersz pozycji, suma „2599 zł" (pl-PL nie grupuje liczb czterocyfrowych), pole „Nazwa źródła". Jeśli `getByLabel("Cena (zł)")` nie trafia (Field owija input w `<label>`, więc powinno) — użyj `rows.first().locator('input[inputmode="decimal"]')`.

- [ ] **Step 4: Zatrzymaj serwer, commit**

Ubij proces na porcie 3100 (sprawdź `netstat -ano | findstr :3100` / `Get-NetTCPConnection -LocalPort 3100`), potem:

```bash
git add e2e/zamowienie-zewnetrzne-form.spec.ts
git commit -m "test(e2e): formularz zamowienia zewnetrznego — wyszukiwarka, suma, Inne (bez zapisu)"
```

---

### Task 11: Domknięcie — pełne testy, lint, stan wykonania w planie

**Files:**
- Modify: `docs/superpowers/plans/2026-09-02-zamowienia-zewnetrzne.md` (sekcja „STAN WYKONANIA" niżej)

- [ ] **Step 1: Pełny przebieg**

Run: `npm test 2>&1 | tail -8 && npx eslint . && npx tsc --noEmit -p .`
Expected: wszystkie testy PASS, lint i tsc czyste.

- [ ] **Step 2: Uzupełnij „STAN WYKONANIA"** (sekcja na końcu tego pliku): odhacz taski, wpisz, czego NIE sprawdzono na żywo (zapis zamówienia i wysyłka maila — obie wymagają produkcyjnej bazy, więc pierwszą próbę robi właściciel po wdrożeniu, na własnym adresie, NIE na m.wlodarczyk@ggpf.pl).

- [ ] **Step 3: Commit, PR**

```bash
git add docs/superpowers/plans/2026-09-02-zamowienia-zewnetrzne.md
git commit -m "docs(plan): stan wykonania — zamowienia zewnetrzne"
```

PR z `feat/zamowienia-zewnetrzne` do `main` przez `gh` (konto Woodecky10 — patrz pamięć `push-auth-woodecky10`), **tylko po poleceniu właściciela**. W opisie PR: „Po merge zaaplikować migrację 81 ręcznie przez MCP `apply_migration`; potem test na żywo: dodać zamówienie testowe na własny adres, przestawić na W realizacji, sprawdzić mail, usunąć zamówienie".

---

## Po merge (poza kodem)

1. `apply_migration` 81 przez MCP Supabase (auto-apply nie działa); `list_tables`/`execute_sql` → `select column_name from information_schema.columns where table_name='orders' and column_name='source'`.
2. Właściciel: na produkcji dodaje zamówienie testowe (własny adres), przestawia na „W realizacji" → sprawdza mail „Dziękujemy za zamówienie – Mollien 🤍" (nadawca `MAIL_FROM`, temat z sercem), potem usuwa zamówienie przyciskiem „Usuń".
3. Sprawdzić, że licznik „nowe zamówienia" wzrósł po dodaniu i zgasł po „W realizacji".

## STAN WYKONANIA

_(uzupełniane w trakcie — jedyny nośnik stanu między komputerami, bo `.superpowers/sdd/` jest gitignorowany)_

- [ ] Task 1 — migracja 81, `Order.source`
- [ ] Task 2 — `order-source.ts`
- [ ] Task 3 — `external-order.ts`
- [ ] Task 4 — `status-notify.ts` ze źródłem
- [ ] Task 5 — szablon `ExternalOrderAccepted` + `notifyStatusChange`
- [ ] Task 6 — `adminStatusLabel`
- [ ] Task 7 — `createExternalOrder`, filtr `external`
- [ ] Task 8 — formularz `/admin/zamowienia/nowe`
- [ ] Task 9 — lista, karta, etykiety
- [ ] Task 10 — spec Playwrighta na buildzie
- [ ] Task 11 — pełne testy, lint, PR

**Nie sprawdzono na żywo:** zapis zamówienia do bazy i wysyłka maila (wymagają produkcyjnej bazy i Resenda — próba właściciela po merge, patrz „Po merge").

**Rozstrzygnięcia w trakcie:** _(brak)_
