# Płatność za pobraniem (COD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient może złożyć zamówienie z płatnością przy odbiorze (PL i /de), zamiast płatności online Stripe.

**Architecture:** Wariant A ze specu: kolumna `orders.payment_method` (`online`/`cod`), rozgałęzienie w istniejącym `/api/checkout` (wspólna walidacja, dla COD zero wywołań Stripe, order od razu `processing`, promo inkrementowane przy złożeniu), radio metody płatności + nowe pole telefonu w CheckoutForm, wariant `?order_id=` strony success, badge „Pobranie" w adminie.

**Tech Stack:** Next.js 16.2.4 (App Router), Supabase (Postgres), Stripe (tylko ścieżka online), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-platnosc-pobranie-design.md`

## Global Constraints

- Next.js 16.2.4 z breaking changes — przy wątpliwościach czytać `node_modules/next/dist/docs/` (AGENTS.md).
- CheckoutForm i success page są dwujęzyczne INLINE (`de ? {…} : {…}`) — nowe teksty tym wzorcem, NIE przez słowniki.
- Kolory ze zmiennych motywu; komentarze po polsku (wyjaśniają „dlaczego").
- ⚠️ Dev łączy się z bazą PROD. Migracji NIE aplikuje implementer — robi to kontroler przez Supabase MCP po potwierdzeniu użytkownika. Zamówień testowych ze smoke NIE usuwa implementer — raportuje ich id, sprząta kontroler.
- Telefon COD: 7–15 cyfr po odfiltrowaniu nie-cyfr. Status zamówienia COD: `processing` od utworzenia. `markOrderPaid` i webhook Stripe NIETKNIĘTE.

---

### Task 1: Fundament — migracja 45, typy, isValidCodPhone (TDD), createOrder

**Files:**
- Create: `supabase/migrations/45_orders_payment_method.sql`
- Create: `app/_lib/cod.ts`
- Test: `app/_lib/__tests__/cod-phone.test.ts`
- Modify: `app/_lib/types.ts:177` (przy `OrderStatus`) i `:194` (typ `Order`, przy `stripe_payment_intent`)
- Modify: `app/_lib/orders.ts:4-20` (`CreateOrderInput`) i `:36-47` (insert)

**Interfaces:**
- Consumes: istniejący `OrderStatus` w `types.ts`, `createOrder` w `orders.ts`.
- Produces: `export type PaymentMethod = "online" | "cod"` (types.ts); `export function isValidCodPhone(phone: string | null | undefined): boolean` (`@/app/_lib/cod`); `CreateOrderInput.paymentMethod: PaymentMethod` (wymagane pole — Task 2 przekazuje je zawsze); `Order.payment_method: PaymentMethod`.

- [ ] **Step 1: Migracja (plik — NIE aplikować na bazę!)**

Create `supabase/migrations/45_orders_payment_method.sql`:

```sql
-- Migracja 45: metoda płatności zamówienia (online = Stripe, cod = pobranie).
-- Ortogonalna do statusu realizacji — dlatego kolumna, nie nowy status.
-- Historyczne zamówienia były wyłącznie online → default pokrywa backfill.
alter table public.orders
  add column payment_method text not null default 'online'
    check (payment_method in ('online','cod'));
```

- [ ] **Step 2: Failing test dla isValidCodPhone**

Create `app/_lib/__tests__/cod-phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isValidCodPhone } from "@/app/_lib/cod";

describe("isValidCodPhone — telefon wymagany przy pobraniu", () => {
  it("akceptuje polski numer ze spacjami i prefiksem", () => {
    expect(isValidCodPhone("+48 789 826 403")).toBe(true);
    expect(isValidCodPhone("789826403")).toBe(true);
    expect(isValidCodPhone("789-826-403")).toBe(true);
  });
  it("akceptuje niemiecki numer (dłuższy format)", () => {
    expect(isValidCodPhone("+49 30 123456789")).toBe(true);
  });
  it("odrzuca brak / pusty / za krótki / za długi / bez cyfr", () => {
    expect(isValidCodPhone(null)).toBe(false);
    expect(isValidCodPhone(undefined)).toBe(false);
    expect(isValidCodPhone("")).toBe(false);
    expect(isValidCodPhone("   ")).toBe(false);
    expect(isValidCodPhone("123456")).toBe(false); // 6 cyfr
    expect(isValidCodPhone("1234567890123456")).toBe(false); // 16 cyfr
    expect(isValidCodPhone("zadzwońcie wieczorem")).toBe(false);
  });
});
```

- [ ] **Step 3: Run — musi FAILować**

Run: `npx vitest run app/_lib/__tests__/cod-phone.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/cod'` (lub równoważny).

- [ ] **Step 4: Implementacja cod.ts**

Create `app/_lib/cod.ts`:

```ts
// Walidacja telefonu dla płatności za pobraniem. Kurier musi mieć kontakt,
// a wymóg numeru to też naturalna bariera przed fałszywymi zamówieniami.
// Luźny format międzynarodowy: liczy się liczba CYFR (7–15, E.164),
// separatory/+/nawiasy są ignorowane. Czysta funkcja — używana i w kliencie
// (CheckoutForm), i autorytatywnie w /api/checkout.
export function isValidCodPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
```

- [ ] **Step 5: Run — musi przechodzić**

Run: `npx vitest run app/_lib/__tests__/cod-phone.test.ts`
Expected: PASS (3 testy).

- [ ] **Step 6: Typy**

W `app/_lib/types.ts` bezpośrednio NAD `export type OrderStatus =` (linia ~177) dodaj:

```ts
export type PaymentMethod = "online" | "cod";
```

W typie `Order` po linii `stripe_payment_intent: string | null;` (~194) dodaj:

```ts
  // Metoda płatności (migracja 45): online = Stripe, cod = za pobraniem.
  payment_method: PaymentMethod;
```

- [ ] **Step 7: createOrder**

W `app/_lib/orders.ts`: do importu typów dodaj `PaymentMethod`:

```ts
import type { Address, Order, OrderItem, OrderStatus, PaymentMethod } from "./types";
```

W `CreateOrderInput` po `fxRate: number | null;` dodaj:

```ts
  paymentMethod: PaymentMethod;
```

W funkcji `createOrder` dodaj `paymentMethod` do destrukturyzacji parametrów, a insert (linie ~38-47) zamień na:

```ts
    .insert({
      user_id: userId,
      guest_email: guestEmail,
      total,
      shipping_address: shippingAddress as unknown as Record<string, unknown>,
      promo_code_id: promoCodeId ?? null,
      promo_discount: promoDiscount ?? 0,
      currency,
      fx_rate: fxRate,
      payment_method: paymentMethod,
      // COD nie ma etapu płatności — od razu "processing" (przyjęte do
      // realizacji). Dzięki temu nie miesza się z porzuconymi "pending"
      // (nieopłacone checkouty Stripe) i webhook Stripe go nie dotyczy.
      // Reguła TYLKO tu — caller nie przekazuje statusu.
      ...(paymentMethod === "cod" ? { status: "processing" } : {}),
    } as never)
```

UWAGA: `paymentMethod` jest polem WYMAGANYM — jedyny caller (`/api/checkout`, Task 2) zostanie zaktualizowany; do tego czasu tsc pokaże błąd w route.ts. Żeby Task 1 domknąć zielono, w `app/api/checkout/route.ts` w wywołaniu `createOrder({...})` (linia ~268) dodaj TYMCZASOWO wiersz `paymentMethod: "online",` (Task 2 go zastąpi logiką).

- [ ] **Step 8: Weryfikacja**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run test` → wszystkie (406 + 3 nowe = 409).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/45_orders_payment_method.sql app/_lib/cod.ts app/_lib/__tests__/cod-phone.test.ts app/_lib/types.ts app/_lib/orders.ts app/api/checkout/route.ts
git commit -m "feat(sklep): fundament platnosci za pobraniem - migracja 45, PaymentMethod, isValidCodPhone, createOrder"
```

---

### Task 2: Rozgałęzienie w /api/checkout

**Files:**
- Modify: `app/api/checkout/route.ts` (body type ~25-40, walidacja ~86-96, promo ~219-255, createOrder ~268-278, odpowiedź ~280-305)

**Interfaces:**
- Consumes: `isValidCodPhone` z `@/app/_lib/cod`; `CreateOrderInput.paymentMethod` (Task 1); `incrementPromoUsage` z `@/app/_lib/promo` (istnieje — używa go webhook).
- Produces: kontrakt HTTP dla Taska 3 — request z `paymentMethod?: "online" | "cod"` i `address.phone`; odpowiedź COD: `{ url: "<origin>[/de]/checkout/success?order_id=<uuid>" }` (ten sam kształt co Stripe → klient robi `window.location.href = url` bez zmian).

- [ ] **Step 1: Body + importy**

W `app/api/checkout/route.ts` dodaj importy:

```ts
import { validatePromoCode, incrementPromoUsage } from "@/app/_lib/promo";
import { isValidCodPhone } from "@/app/_lib/cod";
```

(`validatePromoCode` już jest importowany — rozszerz istniejący import.)

W typie `CheckoutBody` po `locale?: "pl" | "de";` dodaj:

```ts
  paymentMethod?: "online" | "cod";
```

Po linii `const isDe = locale === "de";` dodaj:

```ts
    // Brak pola = "online" — kompatybilnie ze starszym klientem (cache SW itp.).
    const isCod = body.paymentMethod === "cod";
```

- [ ] **Step 2: Walidacja telefonu dla COD**

Bezpośrednio PO istniejącym bloku walidacji adresu (po `return` dla „Brak pełnego adresu dostawy", linia ~96) dodaj:

```ts
    // Pobranie: kurier musi mieć telefon (i to zapora przed fałszywkami).
    // Walidacja autorytatywna — formularz waliduje tylko dla UX.
    if (isCod && !isValidCodPhone(shippingAddress.phone)) {
      return NextResponse.json(
        {
          error: tr(
            "Przy płatności za pobraniem wymagany jest numer telefonu (7–15 cyfr)",
            "Bei Nachnahme ist eine Telefonnummer erforderlich (7–15 Ziffern)"
          ),
        },
        { status: 400 }
      );
    }
```

- [ ] **Step 3: Kupon Stripe tylko dla online**

W bloku `if (body.promoCode) { … }` (linie ~223-255): walidacja `validatePromoCode` i przypisania `promoCodeId`/`promoDiscount` zostają wspólne. Fragment od komentarza `// Stripe Coupon (one-shot…` do końca `else { … }` (linie ~231-254) opakuj w `if (!isCod) { … }` z komentarzem:

```ts
      // Kupon Stripe tylko dla płatności online — przy pobraniu Stripe nie
      // uczestniczy, a rabat i tak siedzi w orders.total/promo_discount.
      // (Zeroing przy amount_off=0 gr to ograniczenie Stripe — przy COD
      // zostawiamy rabat wyliczony przez validatePromoCode bez zmian.)
      if (!isCod) {
        …istniejący kod kuponu bez zmian…
      }
```

- [ ] **Step 4: createOrder + gałąź COD**

W wywołaniu `createOrder({ … })` zamień tymczasowe `paymentMethod: "online",` (z Taska 1) na:

```ts
      paymentMethod: isCod ? "cod" : "online",
```

Blok wyliczenia `origin` i `localePrefix` (linie ~281-289) zostaje bez zmian — jest wspólny. PO nim, a PRZED `const session = await stripe.checkout.sessions.create({` wstaw:

```ts
    // ── Pobranie: bez Stripe. Zamówienie już utworzone (status "processing"),
    // klient płaci kurierowi. Promo inkrementujemy TERAZ (nie ma webhooka,
    // który by to zrobił po płatności) — best-effort jak w webhooku,
    // used_count to miękka statystyka.
    if (isCod) {
      if (promoCodeId) {
        try {
          await incrementPromoUsage(promoCodeId);
        } catch (err) {
          console.error("[promo] increment used_count (COD) nieudany:", err);
        }
      }
      return NextResponse.json({
        url: `${origin}${localePrefix}/checkout/success?order_id=${order.id}`,
      });
    }
```

- [ ] **Step 5: Weryfikacja**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run test` → 409 passed.
(Smoke całego przepływu jest w Tasku 3 — wymaga migracji na bazie i UI.)

- [ ] **Step 6: Commit**

```bash
git add app/api/checkout/route.ts
git commit -m "feat(sklep): /api/checkout - galaz pobrania (bez Stripe, telefon wymagany, promo przy zlozeniu)"
```

---

### Task 3: CheckoutForm (telefon + wybór metody) + success page + smoke

**Files:**
- Modify: `app/checkout/CheckoutForm.tsx` (słowniki inline ~35-103, stany ~105-117, submit ~131-208, JSX adres ~250-278, sekcja płatności + przycisk ~317-323, stopka sidebara ~407-410)
- Modify: `app/checkout/success/page.tsx` (searchParams, treści, pobranie danych)

**Interfaces:**
- Consumes: kontrakt HTTP Taska 2 (`paymentMethod`, `address.phone`, odpowiedź `{ url }`); `isValidCodPhone` z `@/app/_lib/cod`; `getOrderById` z `@/app/_lib/orders` (już importowany w success).
- Produces: UI końcowe — nic dalej nie konsumuje.

- [ ] **Step 1: CheckoutForm — teksty inline**

Do obiektu DE (po `defaultCountry: "Polen",`) dodaj:

```ts
        phone: "Telefon",
        phoneCodNote: "Bei Nachnahme erforderlich — der Kurier braucht Ihre Nummer.",
        paymentMethod: "Zahlungsart",
        payOnline: "Online-Zahlung",
        payOnlineDesc: "Karte, BLIK, Przelewy24 — sichere Zahlung über Stripe",
        payCod: "Nachnahme",
        payCodDesc: "Zahlung bei Lieferung an den Kurier",
        placeOrder: "Bestellung aufgeben →",
        codPhoneError: "Bei Nachnahme ist eine Telefonnummer erforderlich (7–15 Ziffern).",
        codSidebarNote: "💵 Zahlung bei Lieferung (Nachnahme)",
```

Do obiektu PL (po `defaultCountry: "Polska",`) dodaj:

```ts
        phone: "Telefon",
        phoneCodNote: "Wymagany przy pobraniu — kurier musi mieć kontakt.",
        paymentMethod: "Metoda płatności",
        payOnline: "Płatność online",
        payOnlineDesc: "Karta, BLIK, Przelewy24 — bezpieczna płatność Stripe",
        payCod: "Za pobraniem",
        payCodDesc: "Zapłacisz kurierowi przy odbiorze",
        placeOrder: "Złóż zamówienie →",
        codPhoneError: "Przy płatności za pobraniem wymagany jest numer telefonu (7–15 cyfr).",
        codSidebarNote: "💵 Płatność przy odbiorze (za pobraniem)",
```

- [ ] **Step 2: CheckoutForm — stany + import**

Import:

```ts
import { isValidCodPhone } from "@/app/_lib/cod";
```

Po stanie `country` (linia ~112) dodaj:

```ts
  const [phone, setPhone] = useState(defaultAddress?.phone ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cod">("online");
  const isCod = paymentMethod === "cod";
```

- [ ] **Step 3: CheckoutForm — submit**

W `onSubmit`, PO checku `acceptedTerms` a PRZED `setError(null)`, dodaj:

```ts
    // Walidacja UX — serwer i tak sprawdza autorytatywnie (isValidCodPhone).
    if (isCod && !isValidCodPhone(phone)) {
      setError(c.codPhoneError);
      return;
    }
```

W body fetcha: do obiektu `address` po `fullname: fullName,` dodaj:

```ts
            phone: phone.trim() || undefined,
```

a po `locale: de ? "de" : "pl",` dodaj:

```ts
          paymentMethod,
```

- [ ] **Step 4: CheckoutForm — pole telefonu w adresie**

W karcie adresu, PO gridzie kod pocztowy/miasto a PRZED polem `country` (linia ~271), wstaw:

```tsx
            <div>
              <Field
                label={c.phone}
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+48 600 000 000"
                required={isCod}
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">{c.phoneCodNote}</p>
            </div>
```

- [ ] **Step 5: CheckoutForm — sekcja wyboru metody płatności**

PO karcie adresu (po jej zamykającym `</div>` sekcji, linia ~278) a PRZED blokiem `{error && …}` wstaw nową kartę:

```tsx
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            {c.paymentMethod}
          </h2>
          <div className="flex flex-col gap-3">
            {(
              [
                { value: "online", label: c.payOnline, desc: c.payOnlineDesc },
                { value: "cod", label: c.payCod, desc: c.payCodDesc },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                  paymentMethod === opt.value
                    ? "border-[var(--color-gold)] bg-[var(--bg)]"
                    : "border-[var(--border)] hover:border-[var(--color-gold)]"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={opt.value}
                  checked={paymentMethod === opt.value}
                  onChange={() => setPaymentMethod(opt.value)}
                  className="mt-1 w-4 h-4 accent-[var(--color-gold)] shrink-0"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm text-[var(--fg)]">{opt.label}</span>
                  <span className="text-xs text-[var(--muted)]">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
```

- [ ] **Step 6: CheckoutForm — przycisk i stopka sidebara**

Tekst przycisku submit (linia ~322): `{loading ? c.redirecting : c.payNow}` zamień na:

```tsx
          {loading ? c.redirecting : isCod ? c.placeOrder : c.payNow}
```

W stopce sidebara `{c.payment}` (linia ~408) zamień na:

```tsx
            <p>{isCod ? c.codSidebarNote : c.payment}</p>
```

- [ ] **Step 7: success page — wariant COD**

W `app/checkout/success/page.tsx`:

1. `searchParams` typ: `Promise<{ session_id?: string; order_id?: string }>` i destrukturyzacja `const { session_id, order_id } = await searchParams;`.
2. Do obiektów treści dodaj pole `introCod` — DE:

```ts
        introCod:
          "Ihre Bestellung wurde angenommen. Sie zahlen bequem bei Lieferung an den Kurier (Nachnahme).",
```

PL:

```ts
        introCod:
          "Zamówienie zostało przyjęte do realizacji. Zapłacisz wygodnie kurierowi przy odbiorze (za pobraniem).",
```

3. Po bloku `if (session_id) { … }` dodaj gałąź COD i flagę:

```ts
  let isCod = false;

  if (!session_id && order_id) {
    try {
      const order = await getOrderById(order_id);
      // Szczegóły tylko dla zamówień pobraniowych — strona nie może być
      // wyrocznią do podglądania CUDZYCH zamówień online po id (UUID jest
      // niezgadywalny, ale zawężenie nic nie kosztuje).
      if (order.payment_method === "cod") {
        isCod = true;
        orderId = order.id;
        total = Number(order.total);
        orderCurrency = order.currency;
        email = order.guest_email; // null dla zalogowanych — wiersz się nie wyrenderuje
      }
    } catch {
      // nieistniejące id — pokaż ogólny komunikat bez szczegółów
    }
  }
```

(Deklarację `let isCod = false;` umieść przy pozostałych `let` nad blokiem `if (session_id)`.)

4. Intro w JSX: `{c.intro}` zamień na `{isCod ? c.introCod : c.intro}`.

- [ ] **Step 8: Weryfikacja statyczna**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run test` → 409 passed.

- [ ] **Step 9: STOP — migracja na bazę (kontroler, nie implementer!)**

Smoke wymaga kolumny `payment_method` na żywej bazie. NIE wykonuj SQL. Zgłoś kontrolerowi status DONE_WITH_CONCERNS z adnotacją „czekam na migrację 45", ALBO — jeśli kontroler już potwierdził w prompcie, że migracja jest zaaplikowana — przejdź do Step 10.

- [ ] **Step 10: Smoke end-to-end (dev serwer)**

`npm run dev` (background), poczekaj na 200. Weź id produktu:
`curl -s http://localhost:3000/sklep | grep -o '/produkt/[a-f0-9-]*' | head -1`.

POST z pobraniem (PL) — produkt BEZ wariantów może wymagać innego id; jeśli dostaniesz błąd „Brak wyboru wariantu", spróbuj kolejnych id z listy:

```bash
curl -s -X POST http://localhost:3000/api/checkout -H 'Content-Type: application/json' -d '{
  "items":[{"id":"<PRODUCT_ID>","name":"smoke","price":1,"quantity":1}],
  "email":"smoke-cod@test.local","fullName":"Test COD",
  "address":{"street":"Testowa 1","city":"Testowo","postal_code":"00-001","country":"Polska","fullname":"Test COD","phone":"+48 600 100 200"},
  "paymentMethod":"cod","locale":"pl"}'
```

Expected: `{"url":"http://localhost:3000/checkout/success?order_id=<uuid>"}`.

GET tego url → HTML zawiera „Zapłacisz wygodnie kurierowi" i numer zamówienia.

Negatywny: ten sam POST bez `phone` → 400 z „wymagany jest numer telefonu".

Online bez regresu: POST z `"paymentMethod":"online"` (i telefonem lub bez) → odpowiedź z `url` zawierającym `checkout.stripe.com` (sesja tworzy się; NIE płać).

Zanotuj `order_id` WSZYSTKICH utworzonych zamówień (COD i online-pending) do raportu — kontroler usunie je z bazy. Zabij dev serwer.

- [ ] **Step 11: Commit**

```bash
git add app/checkout/CheckoutForm.tsx app/checkout/success/page.tsx
git commit -m "feat(sklep): checkout z wyborem platnosci (online/pobranie), telefon, success dla COD"
```

---

### Task 4: Panel admina — badge „Pobranie"

**Files:**
- Modify: `app/admin/zamowienia/OrderRow.tsx` (props + kolumna statusu)
- Modify: `app/admin/zamowienia/page.tsx:131-149` (przekazanie propa)
- Modify: `app/admin/zamowienia/[id]/page.tsx:67-69` (badge przy statusie) i `:153-163` (karta Płatność)

**Interfaces:**
- Consumes: `Order.payment_method: "online" | "cod"` (Task 1; typ już w `AdminOrderRow` przez `Order`).
- Produces: UI końcowe.

- [ ] **Step 1: OrderRow — prop + chip**

Do propsów `OrderRow` dodaj (typ i destrukturyzacja):

```ts
  cod: boolean;
```

W komórce statusu (po istniejącym `<span>` z `statusLabel`, linie ~63-69) dodaj chip:

```tsx
        {cod && (
          <span
            className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest text-yellow-800 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300"
            title="Płatność przy odbiorze — kurier pobiera gotówkę"
          >
            Pobranie
          </span>
        )}
```

- [ ] **Step 2: Lista — przekaż prop**

W `app/admin/zamowienia/page.tsx` w `<OrderRow …>` (po `deliveryPaid={o.delivery_paid}`) dodaj:

```tsx
                    cod={o.payment_method === "cod"}
```

- [ ] **Step 3: Szczegóły — badge + karta Płatność**

W `app/admin/zamowienia/[id]/page.tsx` po badge'u statusu (`</span>` linii ~69) dodaj:

```tsx
        {order.payment_method === "cod" && (
          <span className="px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start text-yellow-800 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300">
            Pobranie
          </span>
        )}
```

Po istniejącym bloku `{order.stripe_payment_intent && ( <Card>…Płatność…</Card> )}` (linie ~153-163) dodaj kartę COD:

```tsx
          {order.payment_method === "cod" && (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Płatność</h3>
              <p className="text-sm text-[var(--fg)]">
                Za pobraniem — kurier pobiera{" "}
                <span className="font-semibold">
                  {formatOrderAmount(Number(order.total), order.currency)}
                </span>{" "}
                przy dostawie.
              </p>
            </Card>
          )}
```

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run test` → 409 passed.
Smoke wizualny robi kontroler (admin wymaga logowania) — na dev: `/admin/zamowienia` pokazuje chip „Pobranie" przy zamówieniu testowym z Taska 3 (jeśli jeszcze nie usunięte).

- [ ] **Step 5: Commit**

```bash
git add app/admin/zamowienia/OrderRow.tsx app/admin/zamowienia/page.tsx "app/admin/zamowienia/[id]/page.tsx"
git commit -m "feat(sklep): badge Pobranie w panelu zamowien (lista + szczegoly + karta platnosci)"
```
