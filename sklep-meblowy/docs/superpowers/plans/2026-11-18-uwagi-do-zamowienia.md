# Uwagi do całego zamówienia — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient może w checkoucie wpisać uwagi do całego zamówienia; widać je w panelu, w obu mailach i na koncie klienta, a w panelu można je poprawić.

**Architecture:** Kolumna `orders.customer_note` (migracja 87). Czysty helper normalizuje tekst (trim, limit 1000, puste → null) i jest używany przez API checkoutu i edycję zamówienia. Insert dodaje klucz tylko przy niepustej uwadze, więc zamówienia bez uwag działają też przed migracją.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), React Email, Vitest (`environment: "node"`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-uwagi-do-zamowienia-design.md`

## Global Constraints

- Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (`AGENTS.md`).
- Limit 1000 znaków (`CUSTOMER_NOTE_MAX = 1000`); trim; pusty lub same białe znaki → `null` (nic nie zapisujemy).
- Teksty PL: nagłówek `Uwagi do zamówienia (opcjonalnie)`, placeholder `np. proszę o telefon dzień przed dostawą, domofon nie działa`, licznik `N / 1000 znaków`, etykieta w mailach/panelu/koncie `Uwagi do zamówienia`. DE: `Anmerkungen zur Bestellung (optional)` / `Anmerkungen zur Bestellung`.
- Uwagi do produktów (`order_items.notes`) i `admin_note` bez zmian.
- `Order.customer_note?: string | null` — opcjonalne, bo `select("*")` przed migracją daje `undefined`.
- Baza jest wspólna z produkcją; testy e2e niczego nie wysyłają (nie klikają „Zamawiam"). Lokalnie: `npm run build` + `npm start`, `E2E_BASE_URL=http://localhost:3000`, `--no-deps`.
- Pliki mają CRLF, w repo nie ma prettiera — po commicie `git show --stat` bez zmian samych końców linii.
- Gałąź `feat/uwagi-do-zamowienia`; migracja 87 musi być na produkcji PRZED merge.

## Review Focus

1. Klient wpisze same spacje albo enter → nic nie zapisane, nigdzie nie pokazuje się pusta sekcja „Uwagi" (testy helpera w Zadaniu 1, warunki renderu w Zadaniu 3).
2. Tekst dłuższy niż 1000 znaków wysłany z pominięciem formularza → przycięty do 1000 na serwerze (test w Zadaniu 1).
3. Uwagi z wieloma liniami → w panelu, na koncie i w mailach łamią się tak jak wpisał klient (`whitespace-pre-line` / `<br>`; test maila w Zadaniu 3).
4. Zamówienie bez uwag przed migracją 87 → insert bez klucza `customer_note` (test w Zadaniu 1).
5. Edycja zamówienia bez zmiany uwag → nie nadpisuje uwag i nie dopisuje śladu (test w Zadaniu 4).

---

### Task 1: Migracja, typ, helper i zapis z checkoutu

**Files:**
- Create: `supabase/migrations/87_orders_customer_note.sql`
- Create: `app/_lib/customer-note.ts`
- Modify: `app/_lib/types.ts` (typ `Order`)
- Modify: `app/_lib/orders.ts` (`CreateOrderInput`, `createOrder` insert ~linia 47)
- Modify: `app/api/checkout/route.ts` (`CheckoutBody` ~linia 26, wywołanie `createOrder` ~linia 356)
- Test: `app/_lib/__tests__/customer-note.test.ts`

**Interfaces:**
- Produces:

```ts
// app/_lib/customer-note.ts (czysty)
export const CUSTOMER_NOTE_MAX = 1000;
export function normalizeCustomerNote(input: unknown): string | null;
export function customerNoteInsert(note: string | null): { customer_note?: string };
// Order
customer_note?: string | null;
// CreateOrderInput
customerNote?: string | null;
// CheckoutBody
customerNote?: string;
```

- [ ] **Step 1: Napisz testy, które nie przechodzą**

```ts
describe("normalizeCustomerNote", () => {
  it("przycina białe znaki na brzegach, zachowuje nowe linie w środku", () =>
    expect(normalizeCustomerNote("  dzwonić po 16\ndomofon 12  ")).toBe("dzwonić po 16\ndomofon 12"));
  it("pusty, same spacje i entery → null", () => {
    expect(normalizeCustomerNote("")).toBeNull();
    expect(normalizeCustomerNote("   \n\t ")).toBeNull();
  });
  it("nie-string → null", () => {
    expect(normalizeCustomerNote(undefined)).toBeNull();
    expect(normalizeCustomerNote(null)).toBeNull();
    expect(normalizeCustomerNote(123)).toBeNull();
  });
  it("tnie do 1000 znaków", () => expect(normalizeCustomerNote("a".repeat(1500))).toHaveLength(1000));
});
describe("customerNoteInsert", () => {
  it("brak uwag → pusty obiekt (insert bez klucza, działa przed migracją)", () =>
    expect(customerNoteInsert(null)).toEqual({}));
  it("uwagi → klucz customer_note", () =>
    expect(customerNoteInsert("dzwonić")).toEqual({ customer_note: "dzwonić" }));
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run app/_lib/__tests__/customer-note.test.ts` — Expected: FAIL (brak modułu).

- [ ] **Step 3: Zaimplementuj helper, migrację, typ, zapis**

Migracja 87:

```sql
-- Migracja 87: uwagi klienta do całego zamówienia (spec 2026-11-18).
alter table public.orders add column if not exists customer_note text;
```

`createOrder` przyjmuje `customerNote` i w insercie robi `...customerNoteInsert(customerNote ?? null)` (wzorzec jak `bundle_discount` obok). Route: `customerNote: normalizeCustomerNote(body.customerNote)`.

- [ ] **Step 4: Testy i typy**

Run: `npx vitest run && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/87_orders_customer_note.sql app/_lib/customer-note.ts app/_lib/__tests__/customer-note.test.ts app/_lib/types.ts app/_lib/orders.ts app/api/checkout/route.ts
git commit -m "feat(zamówienia): uwagi klienta do całego zamówienia — zapis"
```

---

### Task 2: Pole w checkoucie

**Files:**
- Modify: `app/checkout/CheckoutForm.tsx` (teksty PL/DE w obiekcie `c` ~linia 40–130; nowa sekcja po sekcji `c.carryInHeading` ~linia 345–370; body `fetch("/api/checkout")` ~linia 197)
- Create: `e2e/uwagi-do-zamowienia.spec.ts`

**Interfaces:**
- Consumes: `CUSTOMER_NOTE_MAX` (Zadanie 1); pole body `customerNote` (Zadanie 1).

- [ ] **Step 1: Napisz e2e, który nie przechodzi** (bez wysyłania zamówienia)

Wzoruj się na `e2e/wniesienie.spec.ts` (zgoda cookie, produkt bez wariantów z `/sklep?q=nawierzchniowy` do koszyka, `/checkout`). Asercje:

```ts
const note = page.getByLabel("Uwagi do zamówienia (opcjonalnie)");
await expect(note).toBeVisible();
await expect(note).toHaveAttribute("maxlength", "1000");
await expect(page.getByText("0 / 1000 znaków")).toBeVisible();
await note.fill("proszę o telefon");
await expect(page.getByText("16 / 1000 znaków")).toBeVisible();
// sekcja stoi między wniesieniem a płatnością
const order = await page.evaluate(() =>
  [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim()));
expect(order.indexOf("Uwagi do zamówienia (opcjonalnie)")).toBeGreaterThan(order.indexOf("Wniesienie mebli"));
expect(order.indexOf("Uwagi do zamówienia (opcjonalnie)")).toBeLessThan(order.indexOf("Metoda płatności")); // rzeczywisty nagłówek (CheckoutForm.tsx:124), nie „Płatność…" — R3
```

Jeśli nagłówek sekcji jest `<h2>`, a pole ma etykietę z tym samym tekstem, użyj `aria-labelledby` na textarea wskazującego nagłówek (jedna etykieta, bez powtarzania tekstu).

Run (lokalny build): `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/uwagi-do-zamowienia.spec.ts --no-deps` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj sekcję**

`<textarea>` (4 wiersze, `maxLength={CUSTOMER_NOTE_MAX}`, placeholder z Global Constraints), stan w komponencie, licznik `{note.length} / 1000 znaków` (DE `Zeichen`). Styl jak sąsiednie sekcje (karta + `h2` `font-display text-xl font-bold`). Body: `customerNote: note`. Stan nie musi przeżyć odświeżenia strony.

- [ ] **Step 3: Testy, typy, lint, build, e2e na buildzie**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`, potem e2e z kroku 1 i `e2e/wniesienie.spec.ts` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/checkout/CheckoutForm.tsx e2e/uwagi-do-zamowienia.spec.ts
git commit -m "feat(checkout): pole uwag do zamówienia"
```

---

### Task 3: Uwagi w panelu, mailach i na koncie

**Files:**
- Modify: `app/admin/zamowienia/[id]/page.tsx` (nowa karta po karcie „Adres dostawy" ~linia 268–279)
- Modify: `app/_lib/mail/templates/OrderConfirmation.tsx` (teksty PL/DE ~linie 28–60; blok po adresie ~linia 205–209)
- Modify: `app/_lib/mail/templates/AdminNewOrder.tsx` (wiersz po „Adres:" ~linia 43)
- Modify: `app/konto/zamowienia/[id]/page.tsx` (teksty PL/DE ~linie 58–97; karta po „Adres dostawy" ~linia 329–342)
- Test: `app/_lib/__tests__/mail-customer-note.test.ts`

**Interfaces:**
- Consumes: `Order.customer_note` (Zadanie 1).

- [ ] **Step 1: Napisz testy maili, które nie przechodzą**

Renderuj szablony do HTML tak jak istniejące testy maili (`app/_lib/__tests__/mail-notify-order.test.ts`, `render` z `@react-email/components`), na minimalnym zamówieniu:

```ts
it("potwierdzenie dla klienta pokazuje uwagi z łamaniem linii", async () => {
  const html = await renderConfirmation({ ...order, customer_note: "dzwonić po 16\ndomofon 12" });
  expect(html).toContain("Uwagi do zamówienia");
  expect(html).toMatch(/dzwonić po 16(<br\s*\/?>)\s*domofon 12/);
});
it("bez uwag (null i undefined) nie ma sekcji", async () => {
  expect(await renderConfirmation({ ...order, customer_note: null })).not.toContain("Uwagi do zamówienia");
  expect(await renderConfirmation({ ...order })).not.toContain("Uwagi do zamówienia");
});
it("mail dla sklepu pokazuje uwagi", async () =>
  expect(await renderAdminNewOrder({ ...order, customer_note: "dzwonić po 16" })).toContain("Uwagi do zamówienia: dzwonić po 16"));
it("DE: nagłówek Anmerkungen zur Bestellung", async () =>
  expect(await renderConfirmation({ ...order, customer_note: "x" }, "de")).toContain("Anmerkungen zur Bestellung"));
```

(`renderConfirmation` / `renderAdminNewOrder` to lokalne pomocniki testu wokół `render(<OrderConfirmation …/>)` z propsami jak w istniejących testach.)

Run: `npx vitest run app/_lib/__tests__/mail-customer-note.test.ts` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj**

- Maile: w potwierdzeniu etykieta (styl `labelStyle`) i tekst z liniami rozbitymi na `<br/>`; w mailu dla sklepu wiersz `Uwagi do zamówienia: …` (styl `rowStyle`). Bez uwag — nic.
- Panel: karta `Uwagi do zamówienia` z tekstem w `whitespace-pre-line`, tylko gdy jest uwaga.
- Konto: karta jak „Adres dostawy", tylko gdy jest uwaga, `whitespace-pre-line`; teksty PL/DE.

- [ ] **Step 3: Testy, typy, build**

Run: `npx vitest run && npx tsc --noEmit && npm run build` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/zamowienia/[id]/page.tsx" app/_lib/mail/templates/OrderConfirmation.tsx app/_lib/mail/templates/AdminNewOrder.tsx "app/konto/zamowienia/[id]/page.tsx" app/_lib/__tests__/mail-customer-note.test.ts
git commit -m "feat(zamówienia): uwagi klienta w panelu, mailach i na koncie"
```

---

### Task 4: Poprawianie uwag w edycji zamówienia

**Files:**
- Modify: `app/_lib/order-edit.ts` (`OrderEditInput`, `RawOrderEdit`, `parseOrderEditInput`)
- Modify: `app/_lib/order-edit-apply.ts` (`OrderEditFields`, `sameFields`)
- Modify: `app/admin/zamowienia/actions.ts` (`updateOrder` ~linia 402–480)
- Modify: `app/admin/zamowienia/[id]/edytuj/EditOrderForm.tsx` (nowa karta przed „Pozycje" ~linia 228), `app/admin/zamowienia/[id]/edytuj/page.tsx` (przekazanie wartości)
- Test: `app/_lib/__tests__/order-edit.test.ts`, `app/_lib/__tests__/order-edit-apply.test.ts`

**Interfaces:**
- Consumes: `normalizeCustomerNote` (Zadanie 1).
- Produces:

```ts
// RawOrderEdit
customer_note?: unknown;
// OrderEditInput — undefined = formularz bez pola (nie ruszamy kolumny)
customer_note?: string | null;
// OrderEditFields
customer_note?: string | null;
```

- [ ] **Step 1: Napisz testy, które nie przechodzą**

W `order-edit.test.ts` (na bazie istniejącego poprawnego formularza gościa):

```ts
it("customer_note: normalizowane; brak pola → undefined", () => {
  expect(parse({ ...ok, customer_note: "  dzwonić  " }).value.customer_note).toBe("dzwonić");
  expect(parse({ ...ok, customer_note: "   " }).value.customer_note).toBeNull();
  expect("customer_note" in parse({ ...ok }).value).toBe(false);
});
```

W `order-edit-apply.test.ts`:

```ts
it("zmiana samej uwagi: zapis bez linii śladu w notatce admina", async () => { /* pusty plan, ta sama suma,
  fields.customer_note "nowa" vs currentFields.customer_note "stara" → updateOrder dostał customer_note: "nowa",
  admin_note bez nowej linii */ });
it("ta sama uwaga i nic więcej: zapis bez zmian nie dopisuje śladu", async () => { /* jak istniejący test zapisu bez zmian, z customer_note w obu */ });
```

Run: `npx vitest run app/_lib/__tests__/order-edit.test.ts app/_lib/__tests__/order-edit-apply.test.ts` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj**

- Parser: `customer_note` w wyniku tylko gdy pole jest w formularzu (`raw.customer_note !== undefined`), przez `normalizeCustomerNote`.
- `sameFields`: NIE porównuje `customer_note` (R4). `sameFields` bramkuje wyłącznie linię śladu w notatce; `store.updateOrder({ ...args.fields })` zapisuje zawsze, więc zmiana samej uwagi zapisuje się bez śladu — zgodnie ze specyfikacją.
- `updateOrder`: `customer_note: formData.get("customer_note")` do parsera; gdy wynik ma `customer_note`, dodaj go do `fields` i `currentFields` (`order.customer_note ?? null`).
- Formularz: karta „Uwagi do zamówienia (od klienta)" z `<textarea name="customer_note" maxLength={1000}>` i `defaultValue` z zamówienia; pola nie renderuj, gdy `order.customer_note === undefined` (baza bez kolumny).

- [ ] **Step 3: Testy, typy, lint, build, e2e edycji**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`, potem na buildzie `e2e/edycja-zamowienia.spec.ts` (jeśli wymaga sesji admina: `e2e/.auth/admin.json` ma ciasteczka dla `localhost`, `--no-deps`) — Expected: PASS, spec nic nie zapisuje.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/order-edit.ts app/_lib/order-edit-apply.ts app/admin/zamowienia/actions.ts "app/admin/zamowienia/[id]/edytuj" app/_lib/__tests__/order-edit.test.ts app/_lib/__tests__/order-edit-apply.test.ts
git commit -m "feat(panel): poprawianie uwag klienta w edycji zamówienia"
```

---

### Task 5: Migracja na produkcji i wdrożenie

- [ ] **Step 1:** Właściciel wkleja SQL migracji 87 w SQL Editorze (albo agent przez MCP/Management API, jeśli token działa) i dopisuje wpis `('20261118120000', '87_orders_customer_note')` do `supabase_migrations.schema_migrations`. Sprawdzenie odczytem: `orders?select=id,customer_note&limit=1` kluczem service_role zwraca wiersz, nie `42703`.
- [ ] **Step 2:** Push gałęzi jako Woodecky10, PR, `git log FETCH_HEAD..<gałąź>` puste, merge (= wdrożenie).
- [ ] **Step 3:** Po wdrożeniu e2e `uwagi-do-zamowienia.spec.ts` i `wniesienie.spec.ts` na produkcji (bez wysyłania zamówienia).

---

## STAN WYKONANIA

Zadania 1–4 wykonane na gałęzi `feat/uwagi-do-zamowienia` (`git log --oneline fc43709..HEAD`):
- 0a6fd96 feat(zamówienia): uwagi klienta do całego zamówienia — zapis
- 039d1cd feat(checkout): pole uwag do zamówienia
- cc0bfb5 feat(zamówienia): uwagi klienta w panelu, mailach i na koncie
- 8ba4dde feat(panel): poprawianie uwag klienta w edycji zamówienia
- potem poprawki po przeglądzie całej gałęzi (zawijanie długich tekstów, osierocony surogat, testy akcji, e2e, plan).

Migracja 87 napisana, NIEZAAPLIKOWANA — musi być na bazie PRZED merge. Przed nią: zamówienia Z uwagą padają przy insercie, bez uwagi działają; formularz edycji ukrywa pole.

Zadanie 5 (migracja na produkcji, push/PR/merge) czeka na właściciela.

Rozstrzygnięcia:
- R1: praca na miejscu na gałęzi feat/uwagi-do-zamowienia (norma repo).
- R2: w Zadaniu 5 prosimy właściciela o wklejenie SQL migracji 87 (tokeny 401); po jego potwierdzeniu i sprawdzeniu odczytem push/PR/merge wg jego praktyki.
- R3: e2e Zadania 2 porównuje kolejność z nagłówkiem „Metoda płatności", nie „Płatność…".
- R4: `sameFields` tylko bramkuje linię śladu, `updateOrder` zapisuje zawsze — uwaga zapisuje się, zmiana samej uwagi nie zostawia śladu (zgodnie ze specyfikacją).
- R5: fala poprawek: plan, zawijanie, surogat + test, testy akcji, usunięte nieużywane `currentFields.customer_note`, strażnik indeksów w e2e; ponowienie insertu i utwardzenie e2e odłożone.

NIESPRAWDZONE NA ŻYWO: nie złożono prawdziwego zamówienia z uwagą, żaden z dwóch maili nie był widziany w prawdziwej skrzynce. Propozycja: jedno zamówienie za pobraniem z dwuliniową uwagą na adres jednorazowy (NIE ggpf), potem anulować.

Otwarte follow-upy: utwardzić sprawdzenie pola w e2e edycji po migracji 87; licznik znaków nie jest zapowiadany czytnikom ekranu; opcjonalne ponowienie insertu bez klucza przy błędzie brakującej kolumny.
