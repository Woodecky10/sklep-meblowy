# Edycja zamówienia w panelu admina — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin może edytować każde zamówienie: dane klienta i adres, e-mail gościa, pozycje (dodaj/usuń, ilość, cena, warianty, uwagi), kwoty rabatów; suma liczy się sama, opcjonalny mail do klienta, ślad w notatce.

**Architecture:** Czyste moduły: walidacja i plan zmian (`app/_lib/order-edit.ts`), orkiestracja zapisu przez wstrzykiwany „magazyn" (`app/_lib/order-edit-apply.ts`, testowalna bez bazy); cienki adapter Supabase (`app/_lib/order-edit-store.ts`); akcja `updateOrder`; wspólny edytor pozycji wydzielony z formularza „Dodaj zamówienie"; strona `/admin/zamowienia/[id]/edytuj`. Bez migracji.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, Supabase (postgrest-js), Vitest (`environment: "node"`, testy w `app/**/__tests__/**/*.test.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-edycja-zamowienia-design.md`

Komendy z katalogu `sklep-meblowy/` (tam `package.json`; korzeń repo piętro wyżej). Gałąź: `feat/edycja-zamowienia`.

## Global Constraints

- Bez migracji bazy. Status, `delivery_*`, `promo_code_id`, `payment_*` edycja NIE zmienia.
- `orders.total = max(0, round2(Σ cena × ilość − bundle_discount − promo_discount))`; ceny w walucie zamówienia (`pln`/`eur`).
- E-mail edytowalny tylko gdy `order.user_id === null` (zapis do `guest_email`, małe litery); przy koncie — tylko odczyt, wartość z formularza ignorowana.
- Brak e-maila (`guest_email: null`) tylko w zamówieniu wpisanym ręcznie (`source`) i tylko po jawnym zaznaczeniu „Klient nie podał e-maila" (Task 9).
- Limity jak w „Dodaj zamówienie": `MAX_ITEMS = 50`, `NOTES_MAX_LENGTH = 500`, `CUSTOM_NAME_MAX_LENGTH = 200`, `parsePrice`; ilość całkowita 1–99; co najmniej 1 pozycja.
- Pozycja ma ALBO `product_id` ALBO `custom_name`. Istniejąca pozycja nie zmienia `product_id`, `bundle_id`, `bundle_label`.
- Wstawianie pozycji wyłącznie przez `toOrderItemRows` (`app/_lib/order-items.ts`).
- Zapis: insert → update → delete → odczyt pozycji → suma → update `orders` (także po błędzie pozycji; wtedy dopisek „(zapis przerwany — sprawdź pozycje)").
- Ochrona przed nadpisaniem: `orderEditFingerprint` z chwili otwarcia musi się zgadzać, inaczej nic nie zapisujemy.
- Mail tylko gdy zaznaczono pole i tylko do klienta (`notifyOrderUpdated`), przez `after()`.
- Pliki w repo mają CRLF w kopii roboczej (`core.autocrlf=true`, indeks LF): istniejące pliki edytuj narzędziem Edit; nigdy `sed -i`/`perl -pi`/PowerShell `Set-Content`. Po commicie: brak całoplikowych zmian, `git ls-files --eol` = `i/lf`, brak BOM. W nowych tekstach UI bez cudzysłowów typograficznych.
- Każdy commit kończy się pustą linią i `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Baza wspólna z produkcją: testy automatyczne nigdy nie zapisują zamówień (e2e nie klika „Zapisz").

## Review Focus

1. Druga karta panelu zapisuje zamówienie, które ktoś już zmienił → odmowa, nic nie zapisane. Test: Task 5 (fingerprint mismatch → magazyn nietknięty).
2. Insert pozycji pada w połowie → suma przeliczona z tego, co jest w bazie, notatka z dopiskiem przerwania. Test: Task 3.
3. Zamówienie klienta z kontem, formularz (podrobiony) wysyła e-mail → `guest_email` się nie zmienia. Test: Task 1 i Task 5.
4. Formularz wysyła `id` pozycji z innego zamówienia → błąd, nic nie zapisane; adapter dodatkowo filtruje `order_id`. Test: Task 2 (`planOrderEdit`), adapter — przegląd Task 4.
5. Usunięcie wszystkich pozycji → walidacja odrzuca (zamówienie bez pozycji). Test: Task 1.

---

### Task 1: Walidacja formularza edycji

**Files:**
- Modify: `app/_lib/external-order.ts` (eksport `text`, `parseQuantity`, `EMAIL_RE` — dziś prywatne)
- Create: `app/_lib/order-edit.ts`
- Test: `app/_lib/__tests__/order-edit.test.ts`

**Interfaces:**
- Produces:
  - `EDIT_MAX_QUANTITY = 99`
  - `type OrderEditItem = { id: string | null; product_id: string | null; custom_name: string | null; price: number; quantity: number; notes: string | null; variant_values: Record<string, string> | null }`
  - `type OrderEditInput = { email: string | null; address: Address; items: OrderEditItem[]; bundle_discount: number; promo_discount: number; notify: boolean; fingerprint: string }`
  - `type RawOrderEdit` (pola `unknown`: `email, fullname, phone, street, postal_code, city, country, items, bundle_discount, promo_discount, notify, fingerprint`)
  - `parseOrderEditInput(raw: RawOrderEdit, opts: { emailEditable: boolean }): { ok: true; value: OrderEditInput } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

`app/_lib/__tests__/order-edit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOrderEditInput, EDIT_MAX_QUANTITY, type RawOrderEdit } from "../order-edit";

const base = (over: Partial<RawOrderEdit> = {}): RawOrderEdit => ({
  email: "Klient@Example.com",
  fullname: "Jan Kowalski",
  phone: "500600700",
  street: "Testowa 1",
  postal_code: "00-001",
  city: "Warszawa",
  country: "Polska",
  items: JSON.stringify([
    { id: "it-1", product_id: "p-1", custom_name: null, price: "2 650,00", quantity: "1", notes: "", variant_values: { Tkanina: "Riviera 16" } },
  ]),
  bundle_discount: "",
  promo_discount: "100",
  notify: "1",
  fingerprint: "fp",
  ...over,
});

describe("parseOrderEditInput", () => {
  it("poprawny formularz gościa → wartości znormalizowane", () => {
    const res = parseOrderEditInput(base(), { emailEditable: true });
    expect(res).toEqual({
      ok: true,
      value: {
        email: "klient@example.com",
        address: {
          fullname: "Jan Kowalski",
          street: "Testowa 1",
          postal_code: "00-001",
          city: "Warszawa",
          country: "Polska",
          phone: "500600700",
        },
        items: [
          {
            id: "it-1",
            product_id: "p-1",
            custom_name: null,
            price: 2650,
            quantity: 1,
            notes: null,
            variant_values: { Tkanina: "Riviera 16" },
          },
        ],
        bundle_discount: 0,
        promo_discount: 100,
        notify: true,
        fingerprint: "fp",
      },
    });
  });

  it("zamówienie z kontem: e-mail z formularza ignorowany (null), nawet gdy błędny", () => {
    const res = parseOrderEditInput(base({ email: "nie-mail" }), { emailEditable: false });
    expect(res.ok && res.value.email).toBeNull();
  });

  it("gość: błędny e-mail → błąd", () => {
    expect(parseOrderEditInput(base({ email: "jan@" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Podaj poprawny adres e-mail klienta",
    });
  });

  it("brak kraju → Polska; brak telefonu → bez klucza phone", () => {
    const res = parseOrderEditInput(base({ country: "", phone: "" }), { emailEditable: true });
    expect(res.ok && res.value.address).toEqual({
      fullname: "Jan Kowalski",
      street: "Testowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "Polska",
    });
  });

  it("wymagane: imię i nazwisko, adres", () => {
    expect(parseOrderEditInput(base({ fullname: " " }), { emailEditable: true })).toMatchObject({ ok: false });
    expect(parseOrderEditInput(base({ city: "" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Uzupełnij adres: ulica, kod pocztowy i miasto",
    });
  });

  it("zero pozycji → błąd (zamówienie nie może zostać puste)", () => {
    expect(parseOrderEditInput(base({ items: "[]" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Zamówienie musi mieć co najmniej jedną pozycję",
    });
  });

  it("ilość 1–99, cena ≥ 0, ALBO produkt ALBO nazwa", () => {
    const item = (o: Record<string, unknown>) =>
      JSON.stringify([{ id: null, product_id: "p-1", custom_name: null, price: "10", quantity: "1", ...o }]);
    expect(parseOrderEditInput(base({ items: item({ quantity: String(EDIT_MAX_QUANTITY + 1) }) }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Pozycja 1: ilość musi być liczbą całkowitą od 1 do 99",
    });
    expect(parseOrderEditInput(base({ items: item({ price: "-5" }) }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Pozycja 1: cena musi być liczbą nie mniejszą od 0",
    });
    expect(parseOrderEditInput(base({ items: item({ custom_name: "Pufa" }) }), { emailEditable: true })).toMatchObject({ ok: false });
    expect(parseOrderEditInput(base({ items: item({ product_id: null }) }), { emailEditable: true })).toMatchObject({ ok: false });
  });

  it("pozycja spoza katalogu: warianty zawsze null; nowa pozycja ma id null", () => {
    const res = parseOrderEditInput(
      base({
        items: JSON.stringify([
          { id: "", product_id: null, custom_name: "Wniesienie mebli do 4. piętra", price: "250", quantity: "1", variant_values: { X: "Y" } },
        ]),
      }),
      { emailEditable: true }
    );
    expect(res.ok && res.value.items[0]).toEqual({
      id: null,
      product_id: null,
      custom_name: "Wniesienie mebli do 4. piętra",
      price: 250,
      quantity: 1,
      notes: null,
      variant_values: null,
    });
  });

  it("warianty: tylko pary tekst→tekst, puste wartości odpadają, pusty słownik → null", () => {
    const res = parseOrderEditInput(
      base({
        items: JSON.stringify([
          { id: "it-1", product_id: "p-1", custom_name: null, price: "1", quantity: "1", variant_values: { Tkanina: "Riviera 16", Strona: "", Liczba: 5 } },
        ]),
      }),
      { emailEditable: true }
    );
    expect(res.ok && res.value.items[0].variant_values).toEqual({ Tkanina: "Riviera 16" });
    const empty = parseOrderEditInput(
      base({ items: JSON.stringify([{ id: "it-1", product_id: "p-1", price: "1", quantity: "1", variant_values: { Strona: "" } }]) }),
      { emailEditable: true }
    );
    expect(empty.ok && empty.value.items[0].variant_values).toBeNull();
  });

  it("rabaty: puste → 0, ujemne → błąd", () => {
    expect(parseOrderEditInput(base({ promo_discount: "-1" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Rabat musi być liczbą nie mniejszą od 0",
    });
  });

  it("notify tylko przy \"1\"; brak fingerprintu → błąd", () => {
    const res = parseOrderEditInput(base({ notify: undefined }), { emailEditable: true });
    expect(res.ok && res.value.notify).toBe(false);
    expect(parseOrderEditInput(base({ fingerprint: "" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Brak stanu formularza — odśwież stronę edycji",
    });
  });

  it("nieczytelny JSON pozycji → błąd", () => {
    expect(parseOrderEditInput(base({ items: "{" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Nieczytelna lista pozycji — odśwież stronę i spróbuj ponownie",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/order-edit.test.ts`
Expected: FAIL — `Failed to resolve import "../order-edit"`.

- [ ] **Step 3: Export helpers from `external-order.ts`**

W `app/_lib/external-order.ts` zmień `function text(` → `export function text(`, `function parseQuantity(` → `export function parseQuantity(`, `const EMAIL_RE =` → `export const EMAIL_RE =`. Nic więcej w tym pliku.

- [ ] **Step 4: Implement `app/_lib/order-edit.ts`**

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run app/_lib/__tests__/order-edit.test.ts app/_lib/__tests__/external-order.test.ts` → PASS.
Run: `npx tsc --noEmit` → brak błędów. Run: `npx eslint app/_lib/order-edit.ts app/_lib/external-order.ts` → brak błędów.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/order-edit.ts app/_lib/__tests__/order-edit.test.ts app/_lib/external-order.ts
git commit -m "feat(zamowienia): walidacja formularza edycji zamówienia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Plan zmian, suma, ślad, fingerprint

**Files:**
- Modify: `app/_lib/order-edit.ts` (dopisanie na końcu)
- Test: `app/_lib/__tests__/order-edit.test.ts` (dopisanie)

**Interfaces:**
- Consumes: `OrderEditItem` (Task 1); `OrderItemInput` z `app/_lib/order-items.ts`; `formatOrderAmount` z `app/_lib/money.ts`.
- Produces:
  - `type CurrentOrderItem = { id: string; product_id: string | null; custom_name: string; price: number; quantity: number; notes: string | null; variant_values: Record<string, string> | null }`
  - `type OrderItemPatch = Partial<{ price: number; quantity: number; notes: string | null; variant_values: Record<string, string> | null; custom_name: string }>`
  - `type OrderEditPlan = { inserts: OrderItemInput[]; updates: { id: string; patch: OrderItemPatch }[]; deletes: string[] }`
  - `planOrderEdit(current: CurrentOrderItem[], edited: OrderEditItem[]): { ok: true; value: OrderEditPlan } | { ok: false; error: string }`
  - `orderEditTotal(items: { price: number; quantity: number }[], bundleDiscount: number, promoDiscount: number): number`
  - `orderEditNoteLine(at: Date, oldTotal: number, newTotal: number, currency: "pln" | "eur", interrupted?: boolean): string`
  - `appendAdminNote(existing: string | null, line: string): string`
  - `orderEditFingerprint(total: number, items: { id: string; quantity: number; price: number }[]): string`

- [ ] **Step 1: Write the failing tests**

Dopisz do `app/_lib/__tests__/order-edit.test.ts` (rozszerz import z `"../order-edit"` o: `planOrderEdit`, `orderEditTotal`, `orderEditNoteLine`, `appendAdminNote`, `orderEditFingerprint`, `type CurrentOrderItem`, `type OrderEditItem`):

```ts
const cur = (over: Partial<CurrentOrderItem> = {}): CurrentOrderItem => ({
  id: "it-1",
  product_id: "p-1",
  custom_name: "",
  price: 2650,
  quantity: 1,
  notes: null,
  variant_values: { Tkanina: "Riviera 16" },
  ...over,
});
const ed = (over: Partial<OrderEditItem> = {}): OrderEditItem => ({
  id: "it-1",
  product_id: "p-1",
  custom_name: null,
  price: 2650,
  quantity: 1,
  notes: null,
  variant_values: { Tkanina: "Riviera 16" },
  ...over,
});

describe("planOrderEdit", () => {
  it("bez zmian → pusty plan", () => {
    expect(planOrderEdit([cur()], [ed()])).toEqual({ ok: true, value: { inserts: [], updates: [], deletes: [] } });
  });

  it("zmiana ceny, ilości, uwag i wariantu → jeden update z samymi zmienionymi polami", () => {
    const res = planOrderEdit(
      [cur()],
      [ed({ price: 2400, quantity: 2, notes: "pilne", variant_values: { Tkanina: "Sawana 21" } })]
    );
    expect(res).toEqual({
      ok: true,
      value: {
        inserts: [],
        updates: [
          {
            id: "it-1",
            patch: { price: 2400, quantity: 2, notes: "pilne", variant_values: { Tkanina: "Sawana 21" } },
          },
        ],
        deletes: [],
      },
    });
  });

  it("kolejność kluczy wariantu i null vs {} nie są zmianą", () => {
    const a = cur({ variant_values: { Tkanina: "R", Strona: "Lewa" } });
    expect(planOrderEdit([a], [ed({ variant_values: { Strona: "Lewa", Tkanina: "R" } })])).toMatchObject({
      ok: true,
      value: { updates: [] },
    });
    expect(planOrderEdit([cur({ variant_values: null })], [ed({ variant_values: null })])).toMatchObject({
      ok: true,
      value: { updates: [] },
    });
  });

  it("nowa pozycja (id null) → insert; brak w edycji → delete", () => {
    const res = planOrderEdit(
      [cur(), cur({ id: "it-2", product_id: null, custom_name: "Pufa", variant_values: null })],
      [ed(), ed({ id: null, product_id: null, custom_name: "Wniesienie mebli do 4. piętra", price: 250, variant_values: null })]
    );
    expect(res).toEqual({
      ok: true,
      value: {
        inserts: [
          {
            product_id: null,
            custom_name: "Wniesienie mebli do 4. piętra",
            price: 250,
            quantity: 1,
            notes: null,
            variant_values: null,
            bundle_id: null,
            bundle_label: null,
          },
        ],
        updates: [],
        deletes: ["it-2"],
      },
    });
  });

  it("zmiana nazwy pozycji spoza katalogu → update custom_name", () => {
    const res = planOrderEdit(
      [cur({ product_id: null, custom_name: "Pufa", variant_values: null })],
      [ed({ product_id: null, custom_name: "Pufa Vena", variant_values: null })]
    );
    expect(res).toMatchObject({ ok: true, value: { updates: [{ id: "it-1", patch: { custom_name: "Pufa Vena" } }] } });
  });

  it("id spoza zamówienia, zdublowane id albo zmieniony produkt → błąd", () => {
    expect(planOrderEdit([cur()], [ed({ id: "obce" })])).toEqual({
      ok: false,
      error: "Pozycja nie należy do tego zamówienia — odśwież stronę",
    });
    expect(planOrderEdit([cur()], [ed(), ed()])).toMatchObject({ ok: false });
    expect(planOrderEdit([cur()], [ed({ product_id: "p-2" })])).toEqual({
      ok: false,
      error: "Nie można zmienić produktu w istniejącej pozycji — usuń ją i dodaj nową",
    });
  });
});

describe("orderEditTotal", () => {
  it("Σ cena × ilość − rabaty, do grosza, nie mniej niż 0", () => {
    expect(orderEditTotal([{ price: 2650, quantity: 1 }, { price: 250, quantity: 1 }], 0, 100)).toBe(2800);
    expect(orderEditTotal([{ price: 0.1, quantity: 3 }], 0, 0)).toBe(0.3);
    expect(orderEditTotal([{ price: 100, quantity: 1 }], 50, 80)).toBe(0);
  });
});

describe("ślad edycji w notatce", () => {
  it("linijka z datą w strefie Europe/Warsaw i sumami", () => {
    const at = new Date("2026-10-06T12:22:00Z"); // 14:22 czasu polskiego (CEST)
    expect(orderEditNoteLine(at, 2900, 3150, "pln")).toBe(
      "06.10.2026, 14:22 — edycja zamówienia: suma 2900 zł → 3150 zł"
    );
    expect(orderEditNoteLine(at, 2900, 3150, "pln", true)).toBe(
      "06.10.2026, 14:22 — edycja zamówienia: suma 2900 zł → 3150 zł (zapis przerwany — sprawdź pozycje)"
    );
  });
  it("appendAdminNote: dopisuje w nowej linii, pusta notatka → sama linijka", () => {
    expect(appendAdminNote(null, "L")).toBe("L");
    expect(appendAdminNote("  ", "L")).toBe("L");
    expect(appendAdminNote("stara", "L")).toBe("stara\nL");
  });
});

describe("orderEditFingerprint", () => {
  it("kolejność pozycji bez znaczenia; zmiana ceny, ilości albo sumy zmienia skrót", () => {
    const a = orderEditFingerprint(2900, [
      { id: "a", quantity: 1, price: 2650 },
      { id: "b", quantity: 1, price: 250 },
    ]);
    const b = orderEditFingerprint(2900, [
      { id: "b", quantity: 1, price: 250 },
      { id: "a", quantity: 1, price: 2650 },
    ]);
    expect(a).toBe(b);
    expect(orderEditFingerprint(2900, [{ id: "a", quantity: 2, price: 2650 }])).not.toBe(
      orderEditFingerprint(2900, [{ id: "a", quantity: 1, price: 2650 }])
    );
    expect(orderEditFingerprint(2901, [{ id: "a", quantity: 1, price: 2650 }])).not.toBe(
      orderEditFingerprint(2900, [{ id: "a", quantity: 1, price: 2650 }])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/order-edit.test.ts` → FAIL (`planOrderEdit is not a function` itd.).

- [ ] **Step 3: Implement — dopisz na końcu `app/_lib/order-edit.ts`**

Dodaj importy na górze: `import type { OrderItemInput } from "./order-items";` i `import { formatOrderAmount } from "./money";`. Na końcu pliku:

```ts
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
export function orderEditFingerprint(
  total: number,
  items: { id: string; quantity: number; price: number }[]
): string {
  const parts = items.map((i) => `${i.id}:${i.quantity}:${Number(i.price)}`).sort();
  return `${Math.round(Number(total) * 100) / 100}|${parts.join(",")}`;
}
```

Jeśli wynik `orderEditNoteLine` w teście różni się wyłącznie separatorem (np. ICU zwraca `06.10.2026, 14:22` z innym znakiem), dostosuj FORMAT KODU tak, by dawał dokładnie `06.10.2026, 14:22` (np. złóż datę z `formatToParts`), a nie test.

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/order-edit.test.ts` → PASS. `npx tsc --noEmit`, `npx eslint app/_lib/order-edit.ts` → czyste.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-edit.ts app/_lib/__tests__/order-edit.test.ts
git commit -m "feat(zamowienia): plan zmian pozycji, suma, ślad edycji i fingerprint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Orkiestracja zapisu (bez bazy)

**Files:**
- Create: `app/_lib/order-edit-apply.ts`
- Test: `app/_lib/__tests__/order-edit-apply.test.ts`

**Interfaces:**
- Consumes: `OrderEditPlan`, `OrderItemPatch`, `orderEditTotal`, `orderEditNoteLine`, `appendAdminNote` (Task 2); `toOrderItemRows`, `OrderItemRow` (`order-items.ts`); `Address` (`types.ts`).
- Produces:
  - `type OrderEditStore = { insertItems(rows: OrderItemRow[]): Promise<string | null>; updateItem(id: string, patch: OrderItemPatch): Promise<string | null>; deleteItems(ids: string[]): Promise<string | null>; readItems(): Promise<{ items: { price: number; quantity: number }[] } | { error: string }>; updateOrder(patch: Record<string, unknown>): Promise<string | null> }` (zwracany `string` = komunikat błędu, `null` = OK)
  - `type OrderEditFields = { shipping_address: Address; guest_email?: string; bundle_discount: number; promo_discount: number }`
  - `applyOrderEdit(store: OrderEditStore, args: { orderId: string; plan: OrderEditPlan; fields: OrderEditFields; oldTotal: number; currency: "pln" | "eur"; adminNote: string | null; now: Date }): Promise<{ ok: true; total: number } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test**

`app/_lib/__tests__/order-edit-apply.test.ts`:

```ts
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
  return { store, calls, orderPatches, rows: () => rows };
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/order-edit-apply.test.ts` → FAIL (`Failed to resolve import "../order-edit-apply"`).

- [ ] **Step 3: Implement `app/_lib/order-edit-apply.ts`**

```ts
// Zapis edycji zamówienia (spec 2026-10-06) — orkiestracja BEZ bazy: operacje
// idą przez wstrzykiwany „magazyn" (adapter Supabase: order-edit-store.ts),
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
  guest_email?: string;
  bundle_discount: number;
  promo_discount: number;
};

export async function applyOrderEdit(
  store: OrderEditStore,
  args: {
    orderId: string;
    plan: OrderEditPlan;
    fields: OrderEditFields;
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
    return {
      ok: false,
      error: `Nie udało się odczytać pozycji zamówienia (${read.error}) — sprawdź zamówienie.`,
    };
  }

  const total = orderEditTotal(read.items, args.fields.bundle_discount, args.fields.promo_discount);
  const note = appendAdminNote(
    args.adminNote,
    orderEditNoteLine(args.now, args.oldTotal, total, args.currency, itemsError !== null)
  );
  const orderError = await store.updateOrder({ ...args.fields, total, admin_note: note });

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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/order-edit-apply.test.ts` → PASS. `npx tsc --noEmit`, `npx eslint app/_lib/order-edit-apply.ts` → czyste.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/order-edit-apply.ts app/_lib/__tests__/order-edit-apply.test.ts
git commit -m "feat(zamowienia): orkiestracja zapisu edycji zamówienia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mail „Zaktualizowaliśmy Twoje zamówienie" + adapter Supabase

**Files:**
- Modify: `app/_lib/mail/templates/OrderConfirmation.tsx` (COPY + prop `kind`)
- Modify: `app/_lib/mail/notify-order.ts` (nowa funkcja `notifyOrderUpdated`)
- Create: `app/_lib/order-edit-store.ts`
- Test: `app/_lib/__tests__/mail-notify-order.test.ts` (dopisanie)

**Interfaces:**
- Consumes: `OrderEditStore` (Task 3), `OrderItemPatch` (Task 2).
- Produces:
  - `OrderConfirmation({ …, kind?: "placed" | "updated" })` (domyślnie `"placed"` — dotychczasowe zachowanie bez zmian)
  - `notifyOrderUpdated(orderId: string): Promise<void>` — tylko do klienta, nigdy nie rzuca
  - `makeOrderEditStore(supabase: SupabaseClient, orderId: string): OrderEditStore`

- [ ] **Step 1: Write the failing test**

W `app/_lib/__tests__/mail-notify-order.test.ts` dopisz `notifyOrderUpdated` do importu z `"../mail/notify-order"` i na końcu pliku:

```ts
describe("notifyOrderUpdated — mail po edycji w panelu", () => {
  beforeEach(() => {
    getOrderByIdMock.mockReset();
    getProfilesByIdsMock.mockReset();
    sendMailMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("idzie TYLKO do klienta (nie do admina), z tytułem o aktualizacji i nagłówkiem", async () => {
    getOrderByIdMock.mockResolvedValue(MINIMAL_ORDER);
    sendMailMock.mockResolvedValue(true);
    vi.stubEnv("MAIL_ADMIN_TO", "wlascicielka@mollien.pl");

    await notifyOrderUpdated(MINIMAL_ORDER.id);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe(MINIMAL_ORDER.guest_email);
    expect(call.subject).toBe(`Zaktualizowaliśmy Twoje zamówienie #${MINIMAL_ORDER.order_number}`);
    expect(call.html).toContain("Zaktualizowaliśmy Twoje zamówienie");
    expect(call.html).not.toContain("Dziękujemy za zamówienie");
  });

  it("zamówienie w EUR → tytuł po niemiecku", async () => {
    getOrderByIdMock.mockResolvedValue({ ...MINIMAL_ORDER, currency: "eur", fx_rate: 4.3 });
    sendMailMock.mockResolvedValue(true);
    await notifyOrderUpdated(MINIMAL_ORDER.id);
    expect(sendMailMock.mock.calls[0][0].subject).toBe(
      `Ihre Bestellung #${MINIMAL_ORDER.order_number} wurde aktualisiert`
    );
  });

  it("błąd odczytu nie rzuca; brak e-maila → nic nie wysyła", async () => {
    getOrderByIdMock.mockRejectedValue(new Error("DB"));
    await expect(notifyOrderUpdated("x")).resolves.toBeUndefined();
    getOrderByIdMock.mockResolvedValue({ ...MINIMAL_ORDER, guest_email: null, user_id: null });
    await notifyOrderUpdated(MINIMAL_ORDER.id);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/mail-notify-order.test.ts` → FAIL (`notifyOrderUpdated is not a function`).

- [ ] **Step 3: Szablon**

W `app/_lib/mail/templates/OrderConfirmation.tsx`:
- w `COPY.pl` po `heading` dodaj:
```ts
    previewUpdated: (nr: number) => `Zaktualizowaliśmy zamówienie #${nr}`,
    headingUpdated: "Zaktualizowaliśmy Twoje zamówienie",
    introUpdated: (nr: number) =>
      `Zmieniliśmy Twoje zamówienie numer #${nr}. Poniżej aktualne podsumowanie.`,
```
- w `COPY.de` po `heading`:
```ts
    previewUpdated: (nr: number) => `Bestellung #${nr} aktualisiert`,
    headingUpdated: "Wir haben Ihre Bestellung aktualisiert",
    introUpdated: (nr: number) =>
      `Wir haben Ihre Bestellung Nummer #${nr} geändert. Hier ist die aktuelle Zusammenfassung.`,
```
- w propsach dodaj `kind = "placed",` do destrukturyzacji i `// "updated" = mail po edycji zamówienia w panelu (spec 2026-10-06).\n  kind?: "placed" | "updated";` do typu;
- w `<MailLayout … preview={…} heading={…}>` i w akapicie intro użyj:
```tsx
      preview={kind === "updated" ? t.previewUpdated(order.order_number) : t.preview(order.order_number)}
      heading={kind === "updated" ? t.headingUpdated : t.heading}
```
```tsx
        {kind === "updated" ? t.introUpdated(order.order_number) : t.intro(order.order_number)}
```

- [ ] **Step 4: `notifyOrderUpdated`**

W `app/_lib/mail/notify-order.ts`, pod `notifyOrderPlaced`:

```ts
// Mail po edycji zamówienia w panelu (spec 2026-10-06) — wysyłany tylko, gdy
// admin zaznaczył „Powiadom klienta". Tylko do klienta: admin sam edytował.
// Jak notifyOrderPlaced: nigdy nie rzuca (wołany przez after()).
export async function notifyOrderUpdated(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const items = order.items ?? [];
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const prefix = locale === "de" ? "/de" : "";

    const to = await customerEmailOf(order);
    if (!to) {
      console.error(`[mail] zamówienie ${orderId} bez adresu e-mail — pomijam mail o zmianach`);
      return;
    }
    const html = await render(
      OrderConfirmation({
        order,
        items,
        branding,
        locale,
        orderUrl: `${base}${prefix}/konto/zamowienia/${order.id}`,
        hasAccount: order.user_id !== null,
        kind: "updated",
      })
    );
    await sendMail({
      to,
      subject:
        locale === "de"
          ? `Ihre Bestellung #${order.order_number} wurde aktualisiert`
          : `Zaktualizowaliśmy Twoje zamówienie #${order.order_number}`,
      html,
    });
  } catch (err) {
    console.error("[mail] notifyOrderUpdated nieudane:", err);
  }
}
```
(Jeśli `notifyOrderPlaced` łapie błąd innym idiomem — np. własnym `catch` z inną treścią logu — zastosuj ten sam idiom.)

- [ ] **Step 5: Adapter `app/_lib/order-edit-store.ts`**

```ts
// Adapter Supabase dla applyOrderEdit (order-edit-apply.ts). Każda operacja
// na pozycjach filtruje też po order_id — id pozycji z innego zamówienia
// niczego nie zmieni, nawet gdyby przeszło walidację.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderEditStore } from "./order-edit-apply";

export function makeOrderEditStore(supabase: SupabaseClient, orderId: string): OrderEditStore {
  return {
    async insertItems(rows) {
      const { error } = await supabase.from("order_items").insert(rows as never[]);
      return error ? error.message : null;
    },
    async updateItem(id, patch) {
      const { error } = await supabase
        .from("order_items")
        .update(patch as never)
        .eq("id", id)
        .eq("order_id", orderId);
      return error ? error.message : null;
    },
    async deleteItems(ids) {
      const { error } = await supabase
        .from("order_items")
        .delete()
        .in("id", ids)
        .eq("order_id", orderId);
      return error ? error.message : null;
    },
    async readItems() {
      const { data, error } = await supabase
        .from("order_items")
        .select("price, quantity")
        .eq("order_id", orderId);
      if (error) return { error: error.message };
      return {
        items: ((data ?? []) as { price: number | string; quantity: number }[]).map((r) => ({
          price: Number(r.price),
          quantity: r.quantity,
        })),
      };
    },
    async updateOrder(patch) {
      const { error } = await supabase.from("orders").update(patch as never).eq("id", orderId);
      return error ? error.message : null;
    },
  };
}
```
Sprawdź typ zwracany przez `createAdminClient()` (`app/_lib/supabase/server.ts`); jeśli to nie `SupabaseClient` z `@supabase/supabase-js`, użyj w sygnaturze `Awaited<ReturnType<typeof createAdminClient>>` (import typu).

- [ ] **Step 6: Verify**

Run: `npx vitest run app/_lib/__tests__/mail-notify-order.test.ts` → PASS. `npx tsc --noEmit`, `npx eslint app/_lib/mail/templates/OrderConfirmation.tsx app/_lib/mail/notify-order.ts app/_lib/order-edit-store.ts` → czyste. `npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/mail/templates/OrderConfirmation.tsx app/_lib/mail/notify-order.ts app/_lib/order-edit-store.ts app/_lib/__tests__/mail-notify-order.test.ts
git commit -m "feat(zamowienia): mail o zmianach zamówienia i adapter zapisu edycji" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Akcja `updateOrder`

**Files:**
- Modify: `app/admin/zamowienia/actions.ts`
- Test: `app/admin/zamowienia/__tests__/update-order.test.ts` (nowy katalog `__tests__`)

**Interfaces:**
- Consumes: `parseOrderEditInput`, `planOrderEdit`, `orderEditFingerprint`, `CurrentOrderItem` (Tasks 1–2); `applyOrderEdit` (Task 3); `makeOrderEditStore`, `notifyOrderUpdated` (Task 4); `getOrderById` (`app/_lib/orders.ts`).
- Produces: `updateOrder(formData: FormData): Promise<ActionResult>`; pola formularza: `orderId, fingerprint, email, fullname, phone, street, postal_code, city, country, items (JSON), bundle_discount, promo_discount, notify ("1")`.

- [ ] **Step 1: Write the failing test**

`app/admin/zamowienia/__tests__/update-order.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderEditStore } from "@/app/_lib/order-edit-apply";

const requireAdminMock = vi.fn();
const getOrderByIdMock = vi.fn();
const notifyUpdatedMock = vi.fn();
const storeCalls: string[] = [];
const orderPatches: Record<string, unknown>[] = [];

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
    updateItem: async () => (storeCalls.push("update"), null),
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
  total: 2650,
  currency: "pln",
  admin_note: null,
  items: [ITEM],
};
const FP = orderEditFingerprint(2650, [ITEM]);

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/admin/zamowienia/__tests__/update-order.test.ts` → FAIL (`updateOrder` nie istnieje). Jeśli import `../actions` pada na innych zależnościach modułu (np. dodatkowym imporcie, którego nie zamockowano), dodaj brakujący `vi.mock` w teście — NIE zmieniaj importów `actions.ts`.

- [ ] **Step 3: Implement — dopisz do `app/admin/zamowienia/actions.ts`**

Importy (do istniejących):
```ts
import { getOrderById } from "@/app/_lib/orders";
import {
  orderEditFingerprint,
  parseOrderEditInput,
  planOrderEdit,
  type CurrentOrderItem,
} from "@/app/_lib/order-edit";
import { applyOrderEdit } from "@/app/_lib/order-edit-apply";
import { makeOrderEditStore } from "@/app/_lib/order-edit-store";
```
i dodaj `notifyOrderUpdated` do istniejącego importu z `"@/app/_lib/mail/notify-order"`.

Na końcu pliku:
```ts
// Edycja zamówienia z panelu (spec 2026-10-06). Walidacja i plan w czystym
// order-edit.ts, kolejność zapisu w order-edit-apply.ts; tu tylko odczyt,
// strażnik „ktoś zmienił w międzyczasie" i wywołanie. Status, płatność,
// dostawa i kod rabatowy — bez zmian.
export async function updateOrder(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  let order: Awaited<ReturnType<typeof getOrderById>>;
  try {
    order = await getOrderById(orderId);
  } catch {
    return { ok: false, error: "Zamówienie nie znalezione" };
  }

  // E-mail konta należy do konta — w zamówieniu z kontem pola nie ruszamy,
  // cokolwiek przyszło w formularzu.
  const emailEditable = order.user_id === null;
  const parsed = parseOrderEditInput(
    {
      email: formData.get("email"),
      fullname: formData.get("fullname"),
      phone: formData.get("phone"),
      street: formData.get("street"),
      postal_code: formData.get("postal_code"),
      city: formData.get("city"),
      country: formData.get("country"),
      items: formData.get("items"),
      bundle_discount: formData.get("bundle_discount"),
      promo_discount: formData.get("promo_discount"),
      notify: formData.get("notify"),
      fingerprint: formData.get("fingerprint"),
    },
    { emailEditable }
  );
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  const items = order.items ?? [];
  if (orderEditFingerprint(Number(order.total), items) !== input.fingerprint) {
    return {
      ok: false,
      error: "Zamówienie zmieniło się w międzyczasie — odśwież stronę i wprowadź zmiany ponownie",
    };
  }

  const current: CurrentOrderItem[] = items.map((i) => ({
    id: i.id,
    product_id: i.product_id,
    custom_name: i.custom_name ?? "",
    price: Number(i.price),
    quantity: i.quantity,
    notes: i.notes,
    variant_values: i.variant_values,
  }));
  const planned = planOrderEdit(current, input.items);
  if (!planned.ok) return planned;

  const supabase = await createAdminClient();
  const res = await applyOrderEdit(makeOrderEditStore(supabase, orderId), {
    orderId,
    plan: planned.value,
    fields: {
      shipping_address: input.address,
      ...(emailEditable && input.email ? { guest_email: input.email } : {}),
      bundle_discount: input.bundle_discount,
      promo_discount: input.promo_discount,
    },
    oldTotal: Number(order.total),
    currency: order.currency,
    adminNote: order.admin_note,
    now: new Date(),
  });

  revalidatePath("/admin/zamowienia");
  revalidatePath(`/admin/zamowienia/${orderId}`);
  revalidatePath(`/konto/zamowienia/${orderId}`);
  if (!res.ok) return res;

  if (input.notify) after(() => notifyOrderUpdated(orderId));
  return {
    ok: true,
    message: input.notify ? "Zamówienie zapisane, mail do klienta w drodze" : "Zamówienie zapisane",
  };
}
```
Jeśli `makeOrderEditStore` przyjmuje inny typ klienta niż zwraca `createAdminClient` (patrz Task 4 krok 5), dopasuj wywołanie bez rzutowania na `any`.

- [ ] **Step 4: Verify**

Run: `npx vitest run app/admin/zamowienia/__tests__/update-order.test.ts` → PASS. `npx tsc --noEmit`, `npx eslint app/admin/zamowienia/actions.ts app/admin/zamowienia/__tests__/update-order.test.ts` → czyste. `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/zamowienia/actions.ts app/admin/zamowienia/__tests__/update-order.test.ts
git commit -m "feat(zamowienia): akcja zapisu edycji zamówienia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wspólny edytor pozycji (wydzielenie z „Dodaj zamówienie")

**Files:**
- Create: `app/admin/zamowienia/_components/OrderItemsEditor.tsx`
- Modify: `app/admin/zamowienia/nowe/ExternalOrderForm.tsx`

**Interfaces:**
- Consumes: `CARRY_IN_LINE_NAME`, `CARRY_IN_PRICE` (`app/_lib/carry-in.ts`); `getVariantEffectivePrice` (`app/_lib/variants.ts`); `CUSTOM_NAME_MAX_LENGTH`, `NOTES_MAX_LENGTH` (`external-order.ts`); `Field`, `inputCls` (`app/admin/_shared`).
- Produces:
  - `type EditorProduct = { id: string; name: string; price: number; sale_price: number | null; images: string[] | null; variants?: ProductVariants | null }`
  - `type EditorRow = { key: number; id: string | null; product_id: string | null; name: string; price: string; quantity: string; notes: string; variant_values: Record<string, string> | null; bundle_label: string | null }`
  - `OrderItemsEditor(props: { products: EditorProduct[]; rows: EditorRow[]; setRows: (fn: (prev: EditorRow[]) => EditorRow[]) => void; newKey: () => number; priceLabel: string; priceHint?: string; withVariants?: boolean; catalogHint?: boolean; withCarryIn?: boolean })` — renderuje wyszukiwarkę, przyciski dodawania i listę wierszy (BEZ sumy — sumę pokazuje rodzic).
  - `ExternalOrderForm` re-eksportuje `export type { EditorProduct as ProductOption }` (żeby `nowe/page.tsx` się nie zmieniał).

- [ ] **Step 1: Baseline e2e formularza „Dodaj zamówienie" (zielony PRZED zmianą)**

Porty 3000/3100 wolne; `npm run build`; w tle `PORT=3100 npm start`; `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/zamowienie-zewnetrzne-form.spec.ts --project=chromium` → PASS (test nie klika „Zapisz"). Zatrzymaj serwer.

- [ ] **Step 2: Utwórz `OrderItemsEditor.tsx`**

Przenieś do niego z `ExternalOrderForm.tsx` 1:1 (z tym samym markupem i klasami): stan `query` + `filtered` (filterBySearch), `addProduct`, `addCustomRow`, `updateRow`, `removeRow`, blok „Dodaj produkt" + „+ Pozycja spoza katalogu" + podpowiedź + lista wyników wyszukiwania + lista wierszy (bez akapitu „Razem" i bez `<Card>`/nagłówka „Pozycje" — zostają w rodzicu). Zmiany względem oryginału:
- wiersze z `EditorRow` (nowe pola `id`, `variant_values`, `bundle_label`; `addProduct`/`addCustomRow` ustawiają je na `null`);
- pole ceny: `label={priceLabel}` i `hint={priceHint}` z propsów;
- `withCarryIn`: obok „+ Pozycja spoza katalogu" przycisk `+ Wniesienie (+{formatPrice(CARRY_IN_PRICE, "pl")})`, dodający wiersz `{ product_id: null, name: CARRY_IN_LINE_NAME, price: String(CARRY_IN_PRICE), quantity: "1", notes: "", id: null, variant_values: null, bundle_label: null }`; `disabled` gdy któryś wiersz ma `product_id === null && name === CARRY_IN_LINE_NAME`;
- przy wierszu z `bundle_label` mały znacznik `Zestaw: {bundle_label}` obok nazwy;
- `withVariants` i wiersz z katalogu, którego produkt (`products.find(p => p.id === r.product_id)`) ma `variants?.options.length`: pod ceną siatka `<Field label={opt.name}>` z `<select>` dla każdej opcji: pierwsza opcja `<option value="">— wybierz —</option>`, potem `opt.values`; jeśli bieżąca wartość `r.variant_values?.[opt.name]` nie należy do `opt.values`, dodaj ją jako `<option value={v}>{v} (spoza katalogu)</option>`. Zmiana: `updateRow(r.key, { variant_values: next })`, gdzie `next` = kopia bez klucza przy `""`, a pusty słownik → `null`;
- `catalogHint` i wiersz z katalogu z produktem na liście: pod polem ceny tekst `cennik: {formatPrice(getVariantEffectivePrice(product, r.variant_values ?? {}), "pl")}` i przycisk-link `wstaw z cennika` (ustawia `price` na `String(…)`). Zmiana wariantu NIE zmienia `price`.
Komentarz nagłówka komponentu: skąd wydzielony i że oba formularze (Dodaj / Edytuj) z niego korzystają.

- [ ] **Step 3: Przepnij `ExternalOrderForm` na edytor**

W `ExternalOrderForm.tsx`: usuń przeniesione funkcje i markup; `rows` jako `EditorRow[]`; `nextKey` zostaje w rodzicu i trafia jako `newKey={() => nextKey.current++}`; w karcie „Pozycje" zostaje nagłówek, `<OrderItemsEditor products={products} rows={rows} setRows={setRows} newKey={…} priceLabel="Cena (zł)" priceHint="Cena z tamtego sklepu." />` i akapit „Razem" z `data-testid="external-order-total"`. Mapowanie przy `submit` bez zmian (pola `product_id, custom_name, price, quantity, notes`). Typ `ProductOption` zastąp re-eksportem `export type { EditorProduct as ProductOption } from "../_components/OrderItemsEditor";`. Zachowanie formularza ma być identyczne (bez wariantów, bez podpowiedzi cennika, bez przycisku wniesienia).

- [ ] **Step 4: Verify**

`npx tsc --noEmit`, `npx eslint app/admin/zamowienia/_components/OrderItemsEditor.tsx app/admin/zamowienia/nowe/ExternalOrderForm.tsx`, `npm test` → czyste. `npm run build`, serwer na 3100, ten sam e2e co w kroku 1 → PASS. Zatrzymaj serwer, port 3100 wolny.

- [ ] **Step 5: Commit**

```bash
git add app/admin/zamowienia/_components/OrderItemsEditor.tsx app/admin/zamowienia/nowe/ExternalOrderForm.tsx
git commit -m "refactor(zamowienia): wspólny edytor pozycji z formularza „Dodaj zamówienie”" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Strona „Edytuj zamówienie"

**Files:**
- Create: `app/admin/zamowienia/[id]/edytuj/page.tsx`
- Create: `app/admin/zamowienia/[id]/edytuj/EditOrderForm.tsx`
- Modify: `app/admin/zamowienia/[id]/page.tsx` (przycisk + komunikat po zapisie)
- Test: `e2e/edycja-zamowienia.spec.ts`

**Interfaces:**
- Consumes: `OrderItemsEditor`, `EditorProduct`, `EditorRow` (Task 6); `updateOrder` (Task 5); `orderEditFingerprint` (Task 2); `parsePrice` (`external-order.ts`); `orderItemDisplayName` (`order-items.ts`); `formatOrderAmount` (`money.ts`); `getOrderById`, `getProfilesByIds` (`orders.ts`).

- [ ] **Step 1: Write the e2e (read-only)**

`e2e/edycja-zamowienia.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Edycja zamówienia (spec 2026-10-06). Baza wspólna z produkcją — test
// NIGDY nie klika „Zapisz zmiany". Sprawdza: przycisk na karcie, formularz
// wypełniony danymi zamówienia, przeliczanie sumy po zmianie ilości.

test("karta zamówienia → Edytuj zamówienie → formularz z danymi, suma się przelicza", async ({ page }) => {
  await page.goto("/admin/zamowienia");
  const first = page.locator('a[href^="/admin/zamowienia/"]').filter({ hasText: /#\d+/ }).first();
  const href = await first.getAttribute("href", { timeout: 15_000 }).catch(() => null);
  test.skip(!href, "brak zamówień na liście");
  await page.goto(href!);

  await page.getByRole("link", { name: "Edytuj zamówienie" }).click();
  await expect(page).toHaveURL(/\/edytuj$/);
  await expect(page.getByRole("heading", { name: /Edytuj zamówienie #\d+/ })).toBeVisible();

  await expect(page.getByLabel("Imię i nazwisko")).not.toHaveValue("");
  await expect(page.getByLabel("Ulica i numer")).not.toHaveValue("");

  const total = page.getByTestId("edit-order-total");
  const before = await total.innerText();
  const qty = page.getByLabel("Ilość").first();
  const q = Number(await qty.inputValue());
  await qty.fill(String(q + 1));
  await expect(total).not.toHaveText(before);

  await expect(page.getByRole("button", { name: "Zapisz zmiany" })).toBeEnabled();
  // NIE klikamy „Zapisz zmiany".
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (produkcja, tylko odczyt): `npx playwright test e2e/edycja-zamowienia.spec.ts --project=chromium` → FAIL (brak linku „Edytuj zamówienie").

- [ ] **Step 3: Strona serwerowa `edytuj/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getOrderById, getProfilesByIds } from "@/app/_lib/orders";
import { orderEditFingerprint } from "@/app/_lib/order-edit";
import { orderItemDisplayName } from "@/app/_lib/order-items";
import type { EditorProduct, EditorRow } from "../../_components/OrderItemsEditor";
import EditOrderForm from "./EditOrderForm";
import type { Order, OrderItem } from "@/app/_lib/types";

export const metadata = { title: "Edytuj zamówienie" };

// Edycja zamówienia (spec 2026-10-06). Lista produktów jak w „Dodaj
// zamówienie" (aktywne, filtrowane w przeglądarce) + produkty z pozycji
// zamówienia, nawet nieaktywne — ich warianty są potrzebne w edytorze.
export default async function AdminEditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  let order: (Order & { items: OrderItem[] }) | null = null;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  const supabase = await createAdminClient();
  const { data: active, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, sale_price, images, variants")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (productsError) {
    console.error("[admin] lista produktów do edycji zamówienia nieudana:", productsError.message);
  }
  const products = new Map<string, EditorProduct>(
    ((active ?? []) as EditorProduct[]).map((p) => [p.id, p])
  );
  for (const it of order.items ?? []) {
    if (it.product && !products.has(it.product.id)) {
      const p = it.product;
      products.set(p.id, {
        id: p.id,
        name: p.name,
        price: Number(p.price),
        sale_price: p.sale_price,
        images: p.images,
        variants: p.variants,
      });
    }
  }

  const accountEmail = order.user_id
    ? (await getProfilesByIds([order.user_id]))[order.user_id]?.email ?? null
    : null;

  const rows: EditorRow[] = (order.items ?? []).map((it, i) => ({
    key: i + 1,
    id: it.id,
    product_id: it.product_id,
    name: orderItemDisplayName(it, "Produkt"),
    price: String(Number(it.price)),
    quantity: String(it.quantity),
    notes: it.notes ?? "",
    variant_values: it.variant_values,
    bundle_label: it.bundle_label,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/admin/zamowienia/${order.id}`}
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Wróć do zamówienia
        </Link>
      </div>
      <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
        Edytuj zamówienie #{order.order_number}
      </h1>
      {productsError && (
        <p className="text-sm text-red-600" role="alert">
          Nie udało się pobrać listy produktów — odśwież stronę.
        </p>
      )}
      <EditOrderForm
        orderId={order.id}
        fingerprint={orderEditFingerprint(Number(order.total), order.items ?? [])}
        currency={order.currency}
        total={Number(order.total)}
        paidOnline={order.payment_method === "online" && order.status !== "pending"}
        guestEmail={order.user_id === null ? order.guest_email ?? "" : null}
        accountEmail={accountEmail}
        address={order.shipping_address}
        bundleDiscount={Number(order.bundle_discount ?? 0)}
        promoDiscount={Number(order.promo_discount ?? 0)}
        products={[...products.values()]}
        initialRows={rows}
      />
    </div>
  );
}
```
(Typy `Product` z `types.ts`: jeśli `sale_price`/`images`/`variants` mają inne nazwy lub nullowalność, dopasuj mapowanie — bez `any`.)

- [ ] **Step 4: Formularz `EditOrderForm.tsx`**

Komponent kliencki (`"use client"`), wzorem `ExternalOrderForm` (te same `Card`, `Field`, `inputCls`, `ToastView`; ten sam `onKeyDown` blokujący Enter poza `TEXTAREA`). Props jak w kroku 3. Zawartość `<form action={submit}>`:
1. ukryte pola `orderId`, `fingerprint`;
2. karta „Klient": `Imię i nazwisko` (`name="fullname"`, `defaultValue={address.fullname ?? ""}`, required), `Telefon` (`name="phone"`), e-mail: gdy `guestEmail !== null` — `Field label="E-mail" required` z `<input name="email" type="email" defaultValue={guestEmail}>` i `hint="Na ten adres pójdą maile o zamówieniu."`; gdy `null` — `Field label="E-mail"` z `<input value={accountEmail ?? "—"} readOnly disabled>` i `hint="E-mail konta klienta — zmienia go klient w swoim koncie."` (bez atrybutu `name`);
3. karta „Adres dostawy": `Ulica i numer`, `Kod pocztowy`, `Miasto` (required), `Kraj` (`defaultValue={address.country || "Polska"}`), nazwy pól `street`, `postal_code`, `city`, `country`;
4. karta „Pozycje": `<OrderItemsEditor products={products} rows={rows} setRows={setRows} newKey={…} priceLabel={currency === "eur" ? "Cena (EUR)" : "Cena (zł)"} withVariants catalogHint={currency === "pln"} withCarryIn />`;
5. karta „Rabaty": `Rabat za zestaw` (`name="bundle_discount"`, `defaultValue` z props, `inputMode="decimal"`), `Rabat z kodu` (`name="promo_discount"`); obie wartości trzymane też w stanie do podglądu sumy;
6. karta „Podsumowanie": `Pozycje: {Σ}` , `Rabaty: −{…}`, `Nowa suma` z `data-testid="edit-order-total"` (= `max(0, round2(Σ − rabaty))`, `parsePrice(...) ?? 0` jak w `ExternalOrderForm`), obok `było {formatOrderAmount(total, currency)}`; gdy `paidOnline`: ramka ostrzegawcza `Przelewy24 pobrały {formatOrderAmount(total, currency)}. Zmiana sumy nie zmienia pobranej kwoty — dopłatę lub zwrot rozlicz ręcznie.`;
7. `<label>` z checkboxem `name="notify" value="1"` i tekstem `Powiadom klienta mailem o zmianach` (domyślnie odznaczony);
8. przyciski: `Zapisz zmiany` (`type="submit"`, `disabled={pending || rows.length === 0}`) i link `Anuluj` do karty zamówienia.

`submit(formData)`: `formData.set("items", JSON.stringify(rows.map((r) => ({ id: r.id, product_id: r.product_id, custom_name: r.product_id === null ? r.name : null, price: r.price, quantity: r.quantity, notes: r.notes, variant_values: r.variant_values }))))`; `startTransition(async () => { const res = await updateOrder(formData); if (res.ok) { router.push(`/admin/zamowienia/${orderId}?edytowano=1`); router.refresh(); } else setToast({ type: "error", message: res.error }); })`.

- [ ] **Step 5: Karta zamówienia**

W `app/admin/zamowienia/[id]/page.tsx`:
- sygnatura: `{ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edytowano?: string }> }` i `const { edytowano } = await searchParams;`;
- w nagłówku (obok plakietek statusu) link: `<Link href={`/admin/zamowienia/${order.id}/edytuj`} className="px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors">Edytuj zamówienie</Link>`;
- pod nagłówkiem, gdy `edytowano === "1"`: `<p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Zmiany w zamówieniu zapisane.</p>`.

- [ ] **Step 6: Build + e2e zielony + zrzuty**

`npx tsc --noEmit`, `npx eslint` na nowych/zmienionych plikach, `npm test` → czyste. Porty wolne; `npm run build`; w tle `PORT=3100 npm start`; `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/edycja-zamowienia.spec.ts e2e/zamowienie-zewnetrzne-form.spec.ts --project=chromium` → PASS. Zrzut strony edycji (jasny i ciemny motyw, sesja admina z `e2e/.auth/admin.json`, NIE klikać zapisu) do scratchpada — obejrzyj. Zatrzymaj serwer, port 3100 wolny.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/zamowienia/[id]/edytuj/page.tsx" "app/admin/zamowienia/[id]/edytuj/EditOrderForm.tsx" "app/admin/zamowienia/[id]/page.tsx" e2e/edycja-zamowienia.spec.ts
git commit -m "feat(zamowienia): strona „Edytuj zamówienie” w panelu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: „Brak maila" w zamówieniach ręcznych (dopisane 2026-10-06 — wykonywane po Task 7, przed Task 8)

Prośba właściciela w trakcie realizacji: zamówienia zewnętrzne (Allegro, OLX…) wpisywane ręcznie mogą nie mieć e-maila klienta. Spec: sekcja „Dodatek — brak maila".

**Files:**
- Modify: `app/_lib/external-order.ts` (`RawExternalOrder.no_email`, `ExternalOrderInput.email: string | null`)
- Modify: `app/_lib/order-edit.ts` (`RawOrderEdit.no_email`, opcja `allowNoEmail`)
- Modify: `app/admin/zamowienia/actions.ts` (`createExternalOrder`, `updateOrder`)
- Modify: `app/admin/zamowienia/nowe/ExternalOrderForm.tsx`
- Modify: `app/admin/zamowienia/[id]/edytuj/page.tsx`, `app/admin/zamowienia/[id]/edytuj/EditOrderForm.tsx`
- Modify: `app/admin/zamowienia/[id]/CustomerMailCard.tsx`, `app/admin/zamowienia/[id]/page.tsx`
- Test: `app/_lib/__tests__/external-order.test.ts`, `app/_lib/__tests__/order-edit.test.ts`, `app/admin/zamowienia/__tests__/update-order.test.ts`, `e2e/zamowienie-zewnetrzne-form.spec.ts`

**Zasady:**
- Brak e-maila tylko JAWNIE: pole `no_email = "1"` (checkbox „Klient nie podał e-maila"). Bez niego e-mail wymagany jak dotąd — zapomniane pole nie przechodzi po cichu.
- „Dodaj zamówienie": zawsze dostępne. Edycja: tylko gdy `order.user_id === null && !!order.source` (zamówienie ręczne; warunek prawdziwościowy — `select("*")` bez kolumny daje `undefined`). Zamówienie gościa ze sklepu: `no_email` ignorowane, e-mail wymagany.
- Brak e-maila = `guest_email: null`. Bez migracji: w bazie nie ma CHECK na `guest_email`, a polityka RLS „orders: guest insert" dotyczy tylko roli `anon` (panel pisze kluczem serwisowym).
- Maile automatyczne (zmiana statusu, prośba o opinię) już pomijają zamówienie bez adresu (`customerEmailOf` → null). W edycji przy braku e-maila pole „Powiadom klienta" jest nieaktywne, a serwer nie planuje maila.

**Interfaces:**
- Consumes: `parseExternalOrderInput`, `RawExternalOrder`, `ExternalOrderInput` (istniejące); `parseOrderEditInput`, `RawOrderEdit` (Task 1); `updateOrder` (Task 5); `EditOrderForm` + `edytuj/page.tsx` (Task 7).
- Produces: `RawExternalOrder.no_email?: unknown`; `ExternalOrderInput.email: string | null`; `RawOrderEdit.no_email?: unknown`; `parseOrderEditInput(raw, { emailEditable: boolean; allowNoEmail?: boolean })`; prop `allowNoEmail: boolean` w `EditOrderForm`.

- [ ] **Step 1: Write the failing tests**

`app/_lib/__tests__/external-order.test.ts`, w `describe("parseExternalOrderInput", …)`:
```ts
  it("brak maila zaznaczony → email null, pole e-mail ignorowane", () => {
    const pusty = parseExternalOrderInput(raw({ no_email: "1", email: "" }));
    expect(pusty.ok && pusty.value.email).toBe(null);
    const zSmieciem = parseExternalOrderInput(raw({ no_email: "1", email: "jan@" }));
    expect(zSmieciem.ok && zSmieciem.value.email).toBe(null);
  });

  it("bez zaznaczenia pusty e-mail nadal odrzucony", () => {
    expect(parseExternalOrderInput(raw({ email: "", no_email: "" }))).toEqual({
      ok: false,
      error: "Podaj poprawny adres e-mail klienta",
    });
  });
```

`app/_lib/__tests__/order-edit.test.ts` (helper `base` z początku pliku), na końcu:
```ts
describe("parseOrderEditInput — brak maila (zamówienie ręczne)", () => {
  it("allowNoEmail + no_email → email null", () => {
    const res = parseOrderEditInput(base({ email: "", no_email: "1" }), { emailEditable: true, allowNoEmail: true });
    expect(res.ok && res.value.email).toBe(null);
  });

  it("bez allowNoEmail no_email jest ignorowane — e-mail wymagany", () => {
    expect(parseOrderEditInput(base({ email: "", no_email: "1" }), { emailEditable: true })).toEqual({
      ok: false,
      error: "Podaj poprawny adres e-mail klienta",
    });
  });

  it("allowNoEmail bez zaznaczenia → e-mail walidowany", () => {
    expect(parseOrderEditInput(base({ email: "jan@" }), { emailEditable: true, allowNoEmail: true }).ok).toBe(false);
  });
});
```

`app/admin/zamowienia/__tests__/update-order.test.ts`, w `describe("updateOrder", …)`:
```ts
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
```

`e2e/zamowienie-zewnetrzne-form.spec.ts`, nowy test (NIE klika „Zapisz"; `getByLabel("E-mail")` łapie też etykietę checkboxa i podpowiedź — stąd lokator po `name`):
```ts
test("brak maila wyłącza pole e-mail, „Zapisz” NIE jest klikane", async ({ page }) => {
  await page.goto("/admin/zamowienia/nowe");
  const email = page.locator('input[name="email"]');
  const brak = page.getByRole("checkbox", { name: "Klient nie podał e-maila" });
  await expect(email).toBeEnabled();
  await brak.check();
  await expect(email).toBeDisabled();
  await brak.uncheck();
  await expect(email).toBeEnabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/external-order.test.ts app/_lib/__tests__/order-edit.test.ts app/admin/zamowienia/__tests__/update-order.test.ts` → FAIL (nowe przypadki).

- [ ] **Step 3: Parsery**

`app/_lib/external-order.ts`:
- w `ExternalOrderInput`: `email: string | null;` z komentarzem `// null = klient nie podał e-maila (zaznaczone w panelu, Task 9 planu edycji).`;
- w `RawExternalOrder`: `no_email?: unknown;`;
- zamiast dwóch linii z e-mailem:
```ts
  // Małe litery — spójne z checkoutem i z linkGuestOrders (ilike po e-mailu).
  // null tylko po jawnym zaznaczeniu „Klient nie podał e-maila" — puste pole
  // bez zaznaczenia to pomyłka, nie brak adresu.
  const email = raw.no_email === "1" ? null : text(raw.email, 200).toLowerCase();
  if (email !== null && !EMAIL_RE.test(email)) {
    return { ok: false, error: "Podaj poprawny adres e-mail klienta" };
  }
```

`app/_lib/order-edit.ts`:
- w `RawOrderEdit`: `no_email?: unknown;`;
- sygnatura: `opts: { emailEditable: boolean; allowNoEmail?: boolean }`;
- blok e-maila:
```ts
  let email: string | null = null;
  // allowNoEmail = zamówienie wpisane ręcznie (Allegro, OLX…): klient mógł nie
  // podać adresu. Zamówienie ze sklepu ma e-mail zawsze — tam no_email nic nie znaczy.
  const noEmail = opts.allowNoEmail === true && raw.no_email === "1";
  if (opts.emailEditable && !noEmail) {
    // Małe litery — spójne z checkoutem i z linkGuestOrders (ilike po e-mailu).
    email = text(raw.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: "Podaj poprawny adres e-mail klienta" };
  }
```

- [ ] **Step 4: Akcje (`app/admin/zamowienia/actions.ts`)**

- `createExternalOrder`: do wywołania `parseExternalOrderInput({...})` dopisz `no_email: formData.get("no_email"),` (reszta bez zmian; `guest_email: input.email` przyjmuje `null`). Jeśli `tsc` wskaże inne miejsce, które zakłada `email: string`, obsłuż `null` jawnie.
- `updateOrder`:
```ts
  const emailEditable = order.user_id === null;
  // Zamówienie wpisane ręcznie może nie mieć e-maila. Warunek prawdziwościowy:
  // select("*") na bazie bez kolumny `source` daje undefined, nie null.
  const allowNoEmail = emailEditable && !!order.source;
```
  w `parseOrderEditInput({...}, { emailEditable, allowNoEmail })` dopisz `no_email: formData.get("no_email"),`; w `fields` zamień `...(emailEditable && input.email ? { guest_email: input.email } : {})` na `...(emailEditable ? { guest_email: input.email } : {})`; przed `after`:
```ts
  // Bez adresu nie ma do kogo pisać — formularz blokuje pole, serwer też.
  const notify = input.notify && !(emailEditable && input.email === null);
```
  i użyj `notify` zamiast `input.notify` w `after(…)` i w komunikacie.

- [ ] **Step 5: Formularze**

`ExternalOrderForm.tsx`: stan `const [noEmail, setNoEmail] = useState(false);`; pole e-mail:
```tsx
          <div className="flex flex-col gap-2">
            <Field
              label="E-mail"
              required={!noEmail}
              hint={noEmail ? "Bez e-maila klient nie dostanie żadnej wiadomości ze sklepu." : "Na ten adres pójdą maile o zamówieniu."}
            >
              <input name="email" type="email" required={!noEmail} disabled={noEmail} maxLength={200} className={inputCls} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
              <input type="checkbox" name="no_email" value="1" checked={noEmail} onChange={(e) => setNoEmail(e.target.checked)} />
              Klient nie podał e-maila
            </label>
          </div>
```
(checkbox POZA `<Field>` — `Field` to `<label>`, który aktywuje pierwszy element w środku).

`edytuj/page.tsx`: do `<EditOrderForm>` dopisz `allowNoEmail={order.user_id === null && !!order.source}`.

`EditOrderForm.tsx`: prop `allowNoEmail: boolean`; stan `const [noEmail, setNoEmail] = useState(allowNoEmail && !guestEmail);`; przy `guestEmail !== null` pole e-mail jak w `ExternalOrderForm` powyżej, ale z `defaultValue={guestEmail}`, a checkbox renderowany tylko gdy `allowNoEmail`; checkbox „Powiadom klienta mailem o zmianach" dostaje `disabled={noEmail}`, a gdy `noEmail` — pod nim `<span className="text-xs text-[var(--muted)]">Zamówienie bez e-maila — nie ma do kogo wysłać.</span>`.

- [ ] **Step 6: Karta zamówienia**

`CustomerMailCard.tsx`: gdy `customerEmail === null` — nad polem treści `<p role="note" className="text-sm text-amber-700 dark:text-amber-400 mb-4">To zamówienie nie ma adresu e-mail klienta — wiadomości nie wyślesz. Dopisz adres w edycji zamówienia.</p>`; przycisk wysyłki `disabled={isPending || body.trim() === "" || !customerEmail}`.

`[id]/page.tsx`, karta „Klient": zamiast `{customer.email && <p …>{customer.email}</p>}`:
```tsx
            {customer.email ? (
              <p className="text-sm text-[var(--muted)]">{customer.email}</p>
            ) : order.source ? (
              <p className="text-sm text-[var(--muted)]">brak e-maila</p>
            ) : null}
```

- [ ] **Step 7: Verify**

`npx vitest run` (całość) → PASS; `npx tsc --noEmit`, `npx eslint` na zmienionych plikach → czyste. Porty wolne; `npm run build`; w tle `PORT=3100 npm start`; `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/zamowienie-zewnetrzne-form.spec.ts e2e/edycja-zamowienia.spec.ts --project=chromium` → PASS. Zatrzymaj serwer.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/external-order.ts app/_lib/order-edit.ts app/admin/zamowienia/actions.ts app/admin/zamowienia/nowe/ExternalOrderForm.tsx "app/admin/zamowienia/[id]/edytuj/page.tsx" "app/admin/zamowienia/[id]/edytuj/EditOrderForm.tsx" "app/admin/zamowienia/[id]/CustomerMailCard.tsx" "app/admin/zamowienia/[id]/page.tsx" app/_lib/__tests__/external-order.test.ts app/_lib/__tests__/order-edit.test.ts app/admin/zamowienia/__tests__/update-order.test.ts e2e/zamowienie-zewnetrzne-form.spec.ts
git commit -m "feat(zamowienia): brak maila w zamówieniach wpisywanych ręcznie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Integracja i weryfikacja na żywo

- [ ] **Step 1:** Recenzja całej gałęzi (`git diff origin/main..feat/edycja-zamowienia`) pod kątem Review Focus.
- [ ] **Step 2:** Decyzja właściciela o integracji; push/PR/merge z Woodecky10 wg pamięci `push-auth-woodecky10`; przed mergem `git fetch origin <branch>` + `git log --oneline FETCH_HEAD..<branch>` puste.
- [ ] **Step 3:** Po statusie Vercela „success": `npx playwright test e2e/edycja-zamowienia.spec.ts e2e/zamowienie-zewnetrzne-form.spec.ts e2e/wniesienie.spec.ts --project=chromium` na produkcji — wszystkie „passed".
- [ ] **Step 4 (zapis w żywej bazie — tylko za potwierdzeniem właściciela):** testowe zamówienie przez „Dodaj zamówienie" (jednorazowy e-mail, dane „TEST … do usunięcia"); edycja: zmiana e-maila na inny jednorazowy, dodanie produktu z wariantami i wybór wariantu, zmiana ceny, „Dodaj wniesienie", zaznaczony mail; sprawdzenie w bazie (pozycje, suma, notatka) i na karcie; usunięcie zamówienia.

---

## STAN WYKONANIA

(uzupełniane w trakcie — jedyny trwały nośnik stanu, `.superpowers/sdd/` jest gitignorowany)

**Wznowione 2026-10-06 na drugim komputerze: Task 9, recenzja całej gałęzi i fala poprawek zrobione; gałąź czeka na decyzję o Task 8.** Wcześniej: **przerwane 2026-10-06 na prośbę właściciela po Task 7** („zapisz tak, żebym na innym komputerze mógł lecieć dalej"). Gałąź `feat/edycja-zamowienia` wypchnięta na origin, NIE zmergowana, bez PR-a. Nic z tej gałęzi nie jest na produkcji.

- [x] Task 1 — `210d1a7..6f75c73`, recenzja czysta
- [x] Task 2 — `6f75c73..ee1467c`, recenzja czysta
- [x] Task 3 — `ee1467c..818e3b9`; runda poprawek 1/5: podwójny błąd (pozycje + zapis zamówienia) dawał fałszywe „suma przeliczona"; dopisane testy błędu insert/delete
- [x] Task 4 — `818e3b9..19ff303`, recenzja czysta
- [x] Task 5 — `19ff303..1888a49`, recenzja czysta
- [x] Task 6 — `1888a49..6dcfeca`, recenzja czysta; e2e „Dodaj zamówienie" 3/3 przed i po
- [x] Task 7 — `0344a2f..9493797`, recenzja czysta; e2e na buildzie 4/4, zrzut strony edycji (zamówienie #57) obejrzany
- [x] Task 9 (brak maila) — `8cf05c7..ee0baec`, recenzja czysta (wznowione 2026-10-06 na drugim komputerze); dodatkowo `order-edit-apply.ts`: `OrderEditFields.guest_email: string | null`. **e2e NIEURUCHOMIONE** — na tym komputerze brak `.env.e2e`, a `e2e/.auth/admin.json` pusty; do Task 8 krok 3
- [x] Recenzja całej gałęzi (Fable 5.1): „With fixes", 0 krytycznych, 3 ważne, Review Focus 1–5 trzyma; fala poprawek `ee0baec..8b22c5e` (2 commity), ponowna recenzja: wszystko poprawione, bez nowych błędów. Pełna suita 127 plików / 1930 testów, tsc, eslint, build czyste
- [ ] **Task 8 — NASTĘPNY:** decyzja właściciela o mergu, wdrożenie, e2e na prodzie, test na żywo TYLKO za zgodą

**Fala poprawek po recenzji całej gałęzi (2026-10-06):**

- Ostrzeżenie P24 w edycji tylko dla zamówień rozliczonych przez P24 (`payment_provider === "p24"`, nie `pending`) — wcześniej odpalało na każdym zamówieniu Allegro/OLX „opłacone w źródle”.
- Nowa notka dla zamówienia ze sklepu czekającego na płatność online: zmiana sumy przed zapłatą sprawi, że `api/p24/status` nie rozliczy płatności (porównuje kwotę z `orders.total`).
- `status` w `orderEditFingerprint` — zapis edycji otwartej przed zmianą statusu jest odrzucany jak przy zmianie pozycji (odstępstwo od specu, który definiował odcisk jako pozycje + suma).
- Mail „Zaktualizowaliśmy Twoje zamówienie": suma jako „Razem”/„Gesamt” zamiast „Zapłacono”, neutralne zdanie końcowe zamiast „ustalimy termin dostawy” (odstępstwo od „reszta szablonu bez zmian” — mail nie może podawać klientowi zapłaconej kwoty, której nie zapłacił).
- Edycja zamówienia w EUR nie wstawia ceny katalogowej PLN do pola „Cena (EUR)” (prop `suggestCatalogPrice` w `OrderItemsEditor`).
- Wiersz wniesienia: nazwa jako tekst, ilość zablokowana; zapis bez zmian nie dopisuje śladu do notatki; wspólny limit kraju `COUNTRY_MAX_LENGTH = 60`; „Klient nie podał e-maila” odznacza „Powiadom klienta”; ceny z cennika zaokrąglone do groszy; `items` jako tablica (i brak pola) → „Nieczytelna lista pozycji…”.
- Nowe testy: adapter `order-edit-store` filtruje `order_id` przy update i delete; `after()` nie leci, gdy zapis się nie uda; limity MAX_ITEMS i ilość 99/100.
- Odłożone świadomie: wpisanie ręcznie dokładnej nazwy wniesienia w wiersz spoza katalogu blokuje nazwę i ilość (odwracalne „Usuń”); szerszy odcisk (adres, rabaty, e-mail, uwagi); odchudzenie listy produktów przekazywanej do edytora; limit 2000 znaków notatki vs rosnący ślad; strażnik niezapisanych zmian ślepy na dodanie/usunięcie wiersza; `?edytowano=1` zostaje w adresie. Pozostałe pozycje „Odroczone” niżej: recenzent ocenił wszystkie jako „może poczekać”.

**Rozstrzygnięcia (z dziennika wykonania — nie „naprawiać" z powrotem):**

- Task 3: przy błędzie pozycji I błędzie zapisu zamówienia komunikat brzmi „Zapis pozycji przerwany: X. Nie udało się też zapisać zamówienia (Y) — suma i notatka NIE są zaktualizowane, sprawdź zamówienie."; przy błędzie pozycji i potem błędzie odczytu — „Zapis pozycji przerwany: X. " + komunikat odczytu. Spec milczał o podwójnych błędach; adminowi trzeba powiedzieć prawdę.
- Task 4: w nowym bloku testów maila `console.error` wyciszony zapamiętanym szpiegiem (ścieżka błędu loguje celowo) — czyste wyjście testów.
- Task 7: licznik kluczy wierszy w formularzu startuje od `initialRows.length + 1` (wczytane wiersze mają klucze 1..N).
- Task 9 — zakres „brak maila": odpowiedź właściciela „głównie chodzi o ręczne dodawanie zamówienia w panelu admina dla tych zewnętrznych zamówień" = opcja przy „Dodaj zamówienie" + w edycji TYLKO zamówień ręcznych (`source`), żeby dało się dopisać e-mail później. Zamówienia ze sklepu bez zmian.

**Odroczone (do fali poprawek po recenzji całej gałęzi):**

- Task 1: `parseVariants` tnie do 20 wpisów PRZED odrzuceniem pustych; `id` i fingerprint obcinane po cichu (64/4000); testy ALBO-ALBO sprawdzają tylko `ok: false`; brak testów > MAX_ITEMS, `items` jako tablica, `variant_values` jako tablica, ilość = 99.
- Task 2: tytuły testów obiecują więcej niż sprawdzają (`{}` vs `null` w wariantach; zmiana ceny w fingerprincie); test daty tylko CEST (dodać CET i przejście doby); duplikat `id` sprawdza tylko `ok: false`; brak testu zmiany samych uwag; `appendAdminNote` przy notatce kończącej się `\n` robi pustą linię.
- Task 4: rzutowania `as never` w adapterze (z planu); test 3 łączy dwa scenariusze; nieasertowane intro/podgląd „updated" i HTML po niemiecku.
- Task 5: nieprzetestowana ścieżka częściowej porażki i `revalidatePath`; brak asercji, że `after()` nie leci przy błędzie.
- Task 6: „wstaw z cennika" może wstawić szum zmiennoprzecinkowy (zaokrąglić do 2 miejsc); wiersz, którego produktu nie ma na liście, nie pozwala edytować wariantów.
- Task 7: Enter zablokowany też na przycisku „Zapisz" (jak w „Dodaj zamówienie"); `router.refresh()` po `push` zbędne; `?edytowano=1` zostaje w adresie.

**Nie sprawdzone na żywo (do Task 8):** ciemny motyw strony edycji (zrzut „dark" wyszedł jasny — panel nie bierze `prefers-color-scheme`, trzeba przełączyć motyw w panelu); stare zamówienia z `variant_values = null` (selecty pokazują „— wybierz —"; nietknięte zostają `null`, bo plan zmian porównuje warianty — potwierdzić na jednym starym zamówieniu bez zapisu); ostrzeżenie P24; zamówienie w EUR; mail „Zaktualizowaliśmy Twoje zamówienie".

**Jak kontynuować na innym komputerze:**

1. `git fetch origin && git checkout feat/edycja-zamowienia` (repo `Woodecky10/sklep-meblowy`; komendy npm z katalogu `sklep-meblowy/`), `npm ci`.
2. Pliki spoza gita, które trzeba mieć lokalnie: `sklep-meblowy/.env.local` (Supabase, Resend…), `sklep-meblowy/.env.e2e` + `sklep-meblowy/e2e/.auth/admin.json` (sesja admina do e2e; projekt `setup` w Playwright ją odświeża z `.env.e2e`), `sklep-meblowy/.mcp.json` (token MCP Supabase — dziś zwraca 401, do odnowienia).
3. Agent: „kontynuuj plan `docs/superpowers/plans/2026-10-06-edycja-zamowienia.md` od Task 9, subagent-driven". Ledger SDD (`.superpowers/sdd/…/progress.md`) jest gitignorowany i go tam NIE BĘDZIE — ta sekcja go zastępuje; nowy ledger zaczyna się od „Task 1–7: complete" wg listy wyżej.
4. Zasady, które kosztowały w tym projekcie: baza wspólna z produkcją — e2e NIGDY nie klika „Zapisz"; Playwright na buildzie (`npm run build`, `PORT=3100 npm start`, `E2E_BASE_URL=http://localhost:3100`), nie na `next dev`; bez `E2E_BASE_URL` testy idą na produkcję; pliki CRLF w kopii roboczej — istniejące edytować narzędziem Edit, nie `sed -i`/`perl -pi`; tani model (haiku) psuje CRLF i cudzysłowy „” — przy edycji istniejących plików dawać sonnet.
5. Push: konto gh **Woodecky10** (domyślne mwlo1403 dostaje 403). Działało: `gh auth switch -u Woodecky10`, potem `git -c credential.helper='!gh auth git-credential' push origin feat/edycja-zamowienia`; po pracy `gh auth switch -u mwlo1403`. Przed mergem: `git fetch origin <gałąź>` i `git log --oneline FETCH_HEAD..<gałąź>` puste.

**Zgłoszone przy okazji, poza planem (właściciel 2026-10-06: „nie teraz"):**

- „Nie ma kategorii… teraz chyba są": `app/_lib/categories.ts` nie sprawdza `error` z Supabase, zwraca `[]`, a `unstable_cache` (300 s) zapamiętuje pustą listę → chwilowa awaria bazy = strona bez kategorii ~5 min, bez śladu w logach. Ten sam wzorzec w ~20 loaderach `app/_lib/*` z `unstable_cache`. Naprawa: w środku cache rzucać przy błędzie (Next nie zapisze wyjątku i zostawi stary wpis), na zewnątrz `console.error` + `[]` tylko dla tego żądania.
- `/feed.xml`: 31 ofert bez `google_product_category` (`meble-modulowe`, `fotele-tapicerowane-do-salonu`) — dopisać do `_lib/gpc.ts` z oficjalnej taksonomii.
- CSP blokuje tag Google Ads `AW-18385749236` (`pagead2.googlesyndication.com` poza `connect-src`/`img-src`).
