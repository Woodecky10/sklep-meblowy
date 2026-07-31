# Migracja płatności Stripe → bezpośredni Przelewy24/PayPro — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić warstwę płatności Stripe Checkout bezpośrednią integracją Przelewy24/PayPro (REST API v1), zachowując całą logikę zamówień, promocji i EUR `/de`.

**Architecture:** Przepływ `register → redirect → notyfikacja(status) → verify → markOrderPaid`. `verify` (serwer-do-serwera, z asercją kwoty/waluty) jest jedyną bramką do statusu `paid`. Pure-logika (podpisy CRC SHA-384, walidacja notyfikacji) wydzielona do testowalnych helperów; route'y to cienkie spinacze.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, Supabase (service role), Vitest, Node `crypto` (SHA-384). Bramka: Przelewy24 REST API v1.

## Global Constraints

- **Katalog aplikacji:** `sklep-meblowy/` (repo-root to nadrzędny `sklep-meblowy/`). Wszystkie ścieżki `app/...` są względem `sklep-meblowy/`.
- **Migracje SQL:** najnowsze leżą w **repo-root `supabase/migrations/`** (37, 38). Nowe pliki tam, lowercase SQL, nagłówek `-- Migracja NN: opis`.
- **Migracji NIE uruchamia implementer.** `.env.local` wskazuje PRODUKCYJNĄ Supabase (jedna instancja, brak staging) — `next dev` PISZE do prod DB. Migrację `39` (addytywną, bezpieczną) odpala właścicielka. Implementer tylko tworzy plik `.sql`.
- **Test runner:** `npm test` = `vitest run`; testy w `app/_lib/__tests__/*.test.ts`. Zestaw musi zostać zielony (obecnie 229 testów).
- **Strategia migracji = expand-contract** (KOREKTA vs spec, dla bezpieczeństwa): NIE renamujemy `stripe_payment_intent`. Dodajemy `payment_ref` + `payment_provider`; starą kolumnę dropuje osobna migracja `40` PO oknie zwrotów Stripe. Dzięki temu żywy Stripe na Vercel działa nieprzerwanie i da się testować E2E.
- **Kwoty:** P24 operuje groszami/eurocentami (int). `order.total` jest w jednostkach głównych (z konwersją EUR dla `/de` już zrobioną w checkoucie). Konwersja: `Math.round(total * 100)`. Waluta do P24 wielkimi literami: `"PLN"` / `"EUR"`.
- **Podpis P24:** `sign = sha384(JSON.stringify(fieldsWObjekcieWNarzuconejKolejności))` — kolejność kluczy ma znaczenie; budujemy obiekt z kluczami w kolejności wg dokumentacji P24.
- **Env:** `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_BASE_URL` (`https://sandbox.przelewy24.pl` w dev, `https://secure.przelewy24.pl` na prod).

---

### Task 1: Migracja `39` (addytywna) + typy + `markOrderPaid`

**Files:**
- Create: `supabase/migrations/39_p24_payment_ref.sql` (repo-root)
- Modify: `sklep-meblowy/app/_lib/types.ts` (Order ~184-210, `OrderInsert` ~240-248)
- Modify: `sklep-meblowy/app/_lib/orders.ts:82-100` (`markOrderPaid`)

**Interfaces:**
- Produces: kolumny `orders.payment_ref text`, `orders.payment_provider text`; `markOrderPaid(orderId: string, paymentRef: string): Promise<boolean>` (po zmianie pisze `payment_ref` + `payment_provider='p24'`).

- [ ] **Step 1: Napisz plik migracji**

Create `supabase/migrations/39_p24_payment_ref.sql`:

```sql
-- Migracja 39: bezpośrednia integracja Przelewy24 (expand-contract).
-- Addytywna i BEZPIECZNA przy żywym kodzie Stripe — nie rusza stripe_payment_intent.
-- Stara kolumna zostanie usunięta osobną migracją 40 po oknie zwrotów Stripe.
alter table public.orders add column if not exists payment_ref text;
alter table public.orders add column if not exists payment_provider text;

-- Backfill: istniejące opłacone zamówienia pochodzą ze Stripe. Spójny odczyt w panelu.
update public.orders
  set payment_provider = 'stripe',
      payment_ref = stripe_payment_intent
  where stripe_payment_intent is not null
    and payment_ref is null;
```

- [ ] **Step 2: Zaktualizuj typy**

In `app/_lib/types.ts`, w typie `Order` (po `stripe_payment_intent: string | null;`) dodaj:

```typescript
  stripe_payment_intent: string | null; // legacy (Stripe) — usuwane w migracji 40
  payment_ref: string | null;
  payment_provider: "stripe" | "p24" | null;
```

W `OrderInsert` (po `stripe_payment_intent?`) dodaj:

```typescript
  stripe_payment_intent?: string | null;
  payment_ref?: string | null;
  payment_provider?: "stripe" | "p24" | null;
```

- [ ] **Step 3: Zmień `markOrderPaid`**

In `app/_lib/orders.ts`, podmień ciało update w `markOrderPaid` (zmień też nazwę parametru):

```typescript
export async function markOrderPaid(
  orderId: string,
  paymentRef: string
): Promise<boolean> {
  const supabase = await createAdminClient();
  // CAS: aktualizuj TYLKO przy przejściu pending→paid. Zwraca true, jeśli TO
  // wywołanie faktycznie przestawiło status — zwycięzca wyścigu duplikatów
  // notyfikacji P24. Caller używa tego do JEDNOKROTNEGO incrementu used_count.
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_ref: paymentRef,
      payment_provider: "p24",
      status: "paid",
    } as never)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Sprawdź, że projekt się buduje (typecheck)**

Run: `cd sklep-meblowy && npm run build`
Expected: build przechodzi (brak błędów TS). UWAGA: webhook Stripe (`api/webhook/route.ts`) nadal woła `markOrderPaid(orderId, paymentIntent ?? session.id)` — sygnatura się zgadza (string), więc kompiluje się do czasu Task 9.

- [ ] **Step 5: Uruchom testy (regresja)**

Run: `cd sklep-meblowy && npm test`
Expected: PASS (229), żaden test nie czyta `payment_ref`/`payment_provider` jeszcze.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/39_p24_payment_ref.sql sklep-meblowy/app/_lib/types.ts sklep-meblowy/app/_lib/orders.ts
git commit -m "feat(p24): migracja 39 (payment_ref+payment_provider) + markOrderPaid pisze P24"
```

> **Po tym tasku, ZANIM ruszą testy E2E (Task 6+):** właścicielka odpala migrację `39` na prod Supabase (addytywna, nie psuje żywego Stripe).

---

### Task 2: Helper podpisu CRC (SHA-384) + konfiguracja P24

**Files:**
- Create: `sklep-meblowy/app/_lib/p24.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/p24.test.ts`

**Interfaces:**
- Produces:
  - `p24Sign(fields: Record<string, unknown>): string` — SHA-384 hex z `JSON.stringify(fields)`.
  - `getP24Config(): { merchantId: number; posId: number; apiKey: string; crc: string; baseUrl: string }` — lazy z env, rzuca przy braku.

- [ ] **Step 1: Napisz failing test**

Create `app/_lib/__tests__/p24.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { p24Sign } from "../p24";

describe("p24Sign", () => {
  it("liczy SHA-384 z JSON-a pól w narzuconej kolejności (register)", () => {
    const sign = p24Sign({
      sessionId: "order-abc-123",
      merchantId: 12345,
      amount: 199900,
      currency: "PLN",
      crc: "a1b2c3d4e5f60718",
    });
    expect(sign).toBe(
      "118d99ab8caecc6f58db02b76296257f5ccf0dbda1dbe079fcc8fc594898b2bf8591569aac6b40caf7744da33e3e57ae"
    );
  });

  it("zmiana kolejności pól zmienia podpis", () => {
    const a = p24Sign({ amount: 100, currency: "PLN" });
    const b = p24Sign({ currency: "PLN", amount: 100 });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24.test.ts`
Expected: FAIL — `p24Sign is not a function` / brak modułu.

- [ ] **Step 3: Zaimplementuj `p24.ts` (config + sign)**

Create `app/_lib/p24.ts`:

```typescript
import { createHash } from "node:crypto";

// Podpis P24: SHA-384 z JSON-a pól w kolejności narzuconej przez dokumentację.
// JSON.stringify zachowuje kolejność wstawiania kluczy — budujemy obiekty
// z kluczami w odpowiedniej kolejności w miejscu wywołania.
export function p24Sign(fields: Record<string, unknown>): string {
  return createHash("sha384").update(JSON.stringify(fields)).digest("hex");
}

export type P24Config = {
  merchantId: number;
  posId: number;
  apiKey: string;
  crc: string;
  baseUrl: string;
};

let _cfg: P24Config | null = null;

// Lazy-init: czytamy env przy pierwszym użyciu, nie przy imporcie (jak stripe.ts).
export function getP24Config(): P24Config {
  if (!_cfg) {
    const merchantId = Number(process.env.P24_MERCHANT_ID);
    const posId = Number(process.env.P24_POS_ID);
    const apiKey = process.env.P24_API_KEY;
    const crc = process.env.P24_CRC;
    const baseUrl = process.env.P24_BASE_URL;
    if (!merchantId || !posId || !apiKey || !crc || !baseUrl) {
      throw new Error("Brak konfiguracji P24 w env (P24_MERCHANT_ID/POS_ID/API_KEY/CRC/BASE_URL)");
    }
    _cfg = { merchantId, posId, apiKey, crc, baseUrl };
  }
  return _cfg;
}
```

- [ ] **Step 4: Uruchom test — ma PRZEJŚĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24.test.ts`
Expected: PASS (2 testy).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/p24.ts sklep-meblowy/app/_lib/__tests__/p24.test.ts
git commit -m "feat(p24): helper podpisu CRC SHA-384 + lazy config"
```

---

### Task 3: Klient HTTP P24 — `registerTransaction` / `verifyTransaction` / `refundTransaction`

**Files:**
- Modify: `sklep-meblowy/app/_lib/p24.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/p24.test.ts`

**Interfaces:**
- Consumes: `p24Sign`, `getP24Config` (Task 2).
- Produces:
  - `type P24RegisterParams = { sessionId: string; amount: number; currency: "PLN" | "EUR"; description: string; email: string; country: string; language: string; urlReturn: string; urlStatus: string }`
  - `registerTransaction(p: P24RegisterParams): Promise<string>` — zwraca `token` do redirectu.
  - `verifyTransaction(p: { sessionId: string; orderId: number; amount: number; currency: "PLN" | "EUR" }): Promise<boolean>` — `true` gdy P24 potwierdzi.
  - `refundTransaction(p: { sessionId: string; orderId: number; amount: number; requestId: string }): Promise<boolean>` — pod przyszły zwrot in-app.
  - `trnRequestUrl(token: string): string` — pełny URL redirectu.

- [ ] **Step 1: Napisz failing testy (mock fetch)**

Dodaj do `app/_lib/__tests__/p24.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { p24Sign, registerTransaction, verifyTransaction, trnRequestUrl } from "../p24";

describe("registerTransaction", () => {
  beforeEach(() => {
    process.env.P24_MERCHANT_ID = "12345";
    process.env.P24_POS_ID = "12345";
    process.env.P24_API_KEY = "test-api-key";
    process.env.P24_CRC = "a1b2c3d4e5f60718";
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
  });
  afterEach(() => vi.restoreAllMocks());

  it("POST-uje na /api/v1/transaction/register z poprawnym podpisem i zwraca token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: "TOKEN123" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await registerTransaction({
      sessionId: "order-abc-123",
      amount: 199900,
      currency: "PLN",
      description: "Zamówienie",
      email: "k@example.com",
      country: "PL",
      language: "pl",
      urlReturn: "https://shop/checkout/success?order=order-abc-123",
      urlStatus: "https://shop/api/p24/status",
    });

    expect(token).toBe("TOKEN123");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/register");
    const body = JSON.parse(opts.body);
    expect(body.sign).toBe(
      p24Sign({ sessionId: "order-abc-123", merchantId: 12345, amount: 199900, currency: "PLN", crc: "a1b2c3d4e5f60718" })
    );
    expect(opts.headers.Authorization).toMatch(/^Basic /);
  });

  it("rzuca przy odpowiedzi nie-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "err" }));
    await expect(
      registerTransaction({
        sessionId: "s", amount: 100, currency: "PLN", description: "d",
        email: "e@e.pl", country: "PL", language: "pl", urlReturn: "u", urlStatus: "u",
      })
    ).rejects.toThrow();
  });
});

describe("verifyTransaction", () => {
  beforeEach(() => {
    process.env.P24_MERCHANT_ID = "12345";
    process.env.P24_POS_ID = "12345";
    process.env.P24_API_KEY = "test-api-key";
    process.env.P24_CRC = "a1b2c3d4e5f60718";
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
  });
  afterEach(() => vi.restoreAllMocks());

  it("zwraca true gdy P24 potwierdzi status success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "success" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const ok = await verifyTransaction({ sessionId: "order-abc-123", orderId: 888777, amount: 199900, currency: "PLN" });
    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sign).toBe(
      p24Sign({ sessionId: "order-abc-123", orderId: 888777, amount: 199900, currency: "PLN", crc: "a1b2c3d4e5f60718" })
    );
  });

  it("zwraca false gdy status != success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { status: "error" } }) }));
    const ok = await verifyTransaction({ sessionId: "s", orderId: 1, amount: 1, currency: "PLN" });
    expect(ok).toBe(false);
  });
});

describe("trnRequestUrl", () => {
  it("buduje URL redirectu z tokena", () => {
    process.env.P24_BASE_URL = "https://sandbox.przelewy24.pl";
    expect(trnRequestUrl("TOKEN123")).toBe("https://sandbox.przelewy24.pl/trnRequest/TOKEN123");
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24.test.ts`
Expected: FAIL — `registerTransaction is not a function` itd.

- [ ] **Step 3: Zaimplementuj klienta HTTP**

Dodaj do `app/_lib/p24.ts`:

```typescript
function authHeader(cfg: P24Config): string {
  // Basic Auth: login = posId, hasło = klucz API z panelu P24.
  const token = Buffer.from(`${cfg.posId}:${cfg.apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export type P24RegisterParams = {
  sessionId: string;
  amount: number; // grosze/eurocenty
  currency: "PLN" | "EUR";
  description: string;
  email: string;
  country: string;
  language: string;
  urlReturn: string;
  urlStatus: string;
};

export async function registerTransaction(p: P24RegisterParams): Promise<string> {
  const cfg = getP24Config();
  const sign = p24Sign({
    sessionId: p.sessionId,
    merchantId: cfg.merchantId,
    amount: p.amount,
    currency: p.currency,
    crc: cfg.crc,
  });
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: p.sessionId,
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      email: p.email,
      country: p.country,
      language: p.language,
      urlReturn: p.urlReturn,
      urlStatus: p.urlStatus,
      sign,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`P24 register nieudany (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { data?: { token?: string } };
  const token = json.data?.token;
  if (!token) throw new Error("P24 register: brak tokena w odpowiedzi");
  return token;
}

export async function verifyTransaction(p: {
  sessionId: string;
  orderId: number;
  amount: number;
  currency: "PLN" | "EUR";
}): Promise<boolean> {
  const cfg = getP24Config();
  const sign = p24Sign({
    sessionId: p.sessionId,
    orderId: p.orderId,
    amount: p.amount,
    currency: p.currency,
    crc: cfg.crc,
  });
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/verify`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify({
      merchantId: cfg.merchantId,
      posId: cfg.posId,
      sessionId: p.sessionId,
      amount: p.amount,
      currency: p.currency,
      orderId: p.orderId,
      sign,
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { data?: { status?: string } };
  return json.data?.status === "success";
}

export async function refundTransaction(p: {
  sessionId: string;
  orderId: number;
  amount: number;
  requestId: string;
}): Promise<boolean> {
  const cfg = getP24Config();
  const res = await fetch(`${cfg.baseUrl}/api/v1/transaction/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify({
      requestId: p.requestId,
      refunds: [{ sessionId: p.sessionId, amount: p.amount }],
      refundsUuid: p.requestId,
    }),
  });
  return res.ok;
}

export function trnRequestUrl(token: string): string {
  return `${getP24Config().baseUrl}/trnRequest/${token}`;
}
```

- [ ] **Step 4: Uruchom — ma PRZEJŚĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/p24.ts sklep-meblowy/app/_lib/__tests__/p24.test.ts
git commit -m "feat(p24): klient HTTP register/verify/refund + trnRequestUrl"
```

---

### Task 4: Walidacja notyfikacji P24 (pure) — odpowiednik `stripe-events`

**Files:**
- Create: `sklep-meblowy/app/_lib/p24-events.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/p24-events.test.ts`

**Interfaces:**
- Consumes: `p24Sign` (Task 2).
- Produces:
  - `type P24Notification = { merchantId: number; posId: number; sessionId: string; amount: number; originAmount: number; currency: string; orderId: number; methodId: number; statement: string; sign: string }`
  - `expectedNotificationSign(n: P24Notification, crc: string): string`
  - `isValidNotification(n: P24Notification, crc: string): boolean` — porównuje przysłany `sign` z policzonym.

- [ ] **Step 1: Napisz failing test**

Create `app/_lib/__tests__/p24-events.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isValidNotification, expectedNotificationSign, type P24Notification } from "../p24-events";

const CRC = "a1b2c3d4e5f60718";
const base: Omit<P24Notification, "sign"> = {
  merchantId: 12345, posId: 12345, sessionId: "order-abc-123",
  amount: 199900, originAmount: 199900, currency: "PLN",
  orderId: 888777, methodId: 25, statement: "stmt-xyz",
};

describe("isValidNotification", () => {
  it("akceptuje notyfikację z poprawnym podpisem", () => {
    const sign = expectedNotificationSign({ ...base, sign: "" }, CRC);
    expect(isValidNotification({ ...base, sign }, CRC)).toBe(true);
  });

  it("odrzuca podrobiony/niezgodny podpis", () => {
    expect(isValidNotification({ ...base, sign: "deadbeef" }, CRC)).toBe(false);
  });

  it("podpis zgadza się z prekalkulowanym wektorem", () => {
    expect(expectedNotificationSign({ ...base, sign: "" }, CRC)).toBe(
      "e7cdddf8cdfc0bec4442efe89fc8c468e28fd076268e4d5cedeb2486881071bb83f649d5f1da2effd0878e104064ad0b"
    );
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24-events.test.ts`
Expected: FAIL — brak modułu.

- [ ] **Step 3: Zaimplementuj**

Create `app/_lib/p24-events.ts`:

```typescript
// Czysta walidacja notyfikacji P24 — testowalna osobno od route handlera.
// P24 wysyła notyfikację (urlStatus) z podpisem; MUSIMY go zweryfikować, bo
// endpoint jest publiczny (każdy mógłby go wywołać). To pierwsza bramka; drugą
// (autorytatywną) jest serwerowy verifyTransaction z asercją kwoty.
import { p24Sign } from "./p24";

export type P24Notification = {
  merchantId: number;
  posId: number;
  sessionId: string;
  amount: number;
  originAmount: number;
  currency: string;
  orderId: number;
  methodId: number;
  statement: string;
  sign: string;
};

export function expectedNotificationSign(n: P24Notification, crc: string): string {
  // Kolejność pól wg dokumentacji P24 dla notyfikacji.
  return p24Sign({
    merchantId: n.merchantId,
    posId: n.posId,
    sessionId: n.sessionId,
    amount: n.amount,
    originAmount: n.originAmount,
    currency: n.currency,
    orderId: n.orderId,
    methodId: n.methodId,
    statement: n.statement,
    crc,
  });
}

export function isValidNotification(n: P24Notification, crc: string): boolean {
  return n.sign === expectedNotificationSign(n, crc);
}
```

- [ ] **Step 4: Uruchom — ma PRZEJŚĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24-events.test.ts`
Expected: PASS (3 testy).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/p24-events.ts sklep-meblowy/app/_lib/__tests__/p24-events.test.ts
git commit -m "feat(p24): walidacja podpisu notyfikacji (pure)"
```

---

### Task 5: Endpoint notyfikacji `POST /api/p24/status`

**Files:**
- Create: `sklep-meblowy/app/api/p24/status/route.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/p24-settle.test.ts`

**Interfaces:**
- Consumes: `isValidNotification`/`P24Notification` (Task 4), `verifyTransaction` (Task 3), `markOrderPaid` (Task 1), `incrementPromoUsage`, `createAdminClient`, `getP24Config`.
- Produces: route handler `POST`. Wydzielona pure-funkcja `expectedVerifyAmount(orderTotal: number): number` = `Math.round(orderTotal * 100)` (testowalna).

- [ ] **Step 1: Napisz failing test dla kontroli kwoty**

Create `app/_lib/__tests__/p24-settle.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { expectedVerifyAmount } from "../../api/p24/status/route";

describe("expectedVerifyAmount", () => {
  it("przelicza jednostki główne na grosze (zaokrąglenie)", () => {
    expect(expectedVerifyAmount(1999)).toBe(199900);
    expect(expectedVerifyAmount(19.99)).toBe(1999);
    expect(expectedVerifyAmount(0.1 + 0.2)).toBe(30); // bez błędu floata
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24-settle.test.ts`
Expected: FAIL — brak eksportu/modułu.

- [ ] **Step 3: Zaimplementuj route**

Create `app/api/p24/status/route.ts` (logika dedup/CAS/promo/anulowane przeniesiona 1:1 z `api/webhook/route.ts`):

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getP24Config, verifyTransaction } from "@/app/_lib/p24";
import { isValidNotification, type P24Notification } from "@/app/_lib/p24-events";
import { markOrderPaid, getOrderById } from "@/app/_lib/orders";
import { incrementPromoUsage } from "@/app/_lib/promo";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { OrderStatus } from "@/app/_lib/types";

// Oczekiwana kwota transakcji w groszach/eurocentach z total zamówienia
// (jednostki główne). Wydzielone do testu.
export function expectedVerifyAmount(orderTotal: number): number {
  return Math.round(orderTotal * 100);
}

export async function POST(request: NextRequest) {
  const cfg = getP24Config();

  let n: P24Notification;
  try {
    n = (await request.json()) as P24Notification;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // BRAMKA 1: podpis notyfikacji (endpoint publiczny — odrzucamy obce POST-y).
  if (!isValidNotification(n, cfg.crc)) {
    console.error(`P24 status: niezgodny podpis notyfikacji (sessionId=${n.sessionId})`);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  // sessionId == order.id (ustawiane w checkoucie).
  const orderId = n.sessionId;
  const supabase = await createAdminClient();
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("id, status, promo_code_id, total, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("P24 status: błąd odczytu zamówienia:", orderErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }
  if (!orderRow) {
    console.error(`P24 status: zamówienie ${orderId} nie istnieje`);
    return NextResponse.json({ received: true });
  }

  const ord = orderRow as unknown as {
    status: OrderStatus;
    promo_code_id: string | null;
    total: number;
    currency: "pln" | "eur";
  };

  // Anulowane, a płatność doszła — ślad do ręcznej obsługi (jak w Stripe).
  if (ord.status === "cancelled") {
    console.error(`P24 status: płatność za ANULOWANE zamówienie ${orderId} — ręczna obsługa`);
    await supabase
      .from("orders")
      .update({
        payment_ref: String(n.orderId),
        payment_provider: "p24",
        admin_note: "płatność P24 doszła po anulowaniu — wymaga ręcznej obsługi (zwrot/przywrócenie)",
      } as never)
      .eq("id", orderId);
    return NextResponse.json({ received: true });
  }

  // Dedup: już rozliczone → idempotentnie OK.
  if (ord.status !== "pending") {
    return NextResponse.json({ received: true });
  }

  // BRAMKA 2 (autorytatywna): verify z asercją kwoty i waluty.
  const expectedAmount = expectedVerifyAmount(Number(ord.total));
  const expectedCurrency = ord.currency.toUpperCase() as "PLN" | "EUR";
  if (n.amount !== expectedAmount || n.currency !== expectedCurrency) {
    console.error(
      `P24 status: NIEZGODNA kwota/waluta dla ${orderId} (notif ${n.amount}/${n.currency} vs oczek. ${expectedAmount}/${expectedCurrency}) — NIE rozliczam`
    );
    await supabase
      .from("orders")
      .update({ admin_note: `P24: niezgodna kwota/waluta (${n.amount}/${n.currency}) — weryfikacja ręczna` } as never)
      .eq("id", orderId);
    return NextResponse.json({ received: true });
  }

  const verified = await verifyTransaction({
    sessionId: orderId,
    orderId: n.orderId,
    amount: expectedAmount,
    currency: expectedCurrency,
  });
  if (!verified) {
    console.error(`P24 status: verify nieudany dla ${orderId} — zostaje pending`);
    return NextResponse.json({ received: true });
  }

  // Atomowy claim pending→paid (zwycięzca incrementuje promo).
  let claimedFirst = false;
  try {
    claimedFirst = await markOrderPaid(orderId, String(n.orderId));
  } catch (err) {
    console.error("P24 status: błąd markOrderPaid:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }

  if (claimedFirst && ord.promo_code_id) {
    try {
      await incrementPromoUsage(ord.promo_code_id);
    } catch (err) {
      console.error("[promo] increment used_count nieudany:", err);
    }
  }

  return NextResponse.json({ received: true });
}
```

> Uwaga: `getOrderById` zaimportowany na wszelki wypadek nie jest tu używany — USUŃ go z importu, jeśli linter zgłosi `no-unused`. (Odczyt robimy inline, bo potrzebujemy tylko kilku kolumn + statusu.)

- [ ] **Step 4: Popraw import (usuń nieużywany `getOrderById`)**

In `app/api/p24/status/route.ts` zmień import na:

```typescript
import { markOrderPaid } from "@/app/_lib/orders";
```

- [ ] **Step 5: Uruchom test + lint**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/p24-settle.test.ts && npm run lint`
Expected: test PASS; lint bez błędów w nowym pliku.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/api/p24/status/route.ts sklep-meblowy/app/_lib/__tests__/p24-settle.test.ts
git commit -m "feat(p24): endpoint notyfikacji /api/p24/status (verify+CAS+promo+anti-tamper)"
```

---

### Task 6: Przełączenie `POST /api/checkout` na P24

**Files:**
- Modify: `sklep-meblowy/app/api/checkout/route.ts`
- Create: `sklep-meblowy/app/_lib/__tests__/checkout-p24-params.test.ts`

**Interfaces:**
- Consumes: `registerTransaction`, `trnRequestUrl` (Task 3), `createOrder` (istn.).
- Produces: wydzielona pure-funkcja `buildP24RegisterParams(args)` (testowalna), eksportowana z route.

- [ ] **Step 1: Napisz failing test buildera parametrów**

Create `app/_lib/__tests__/checkout-p24-params.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildP24RegisterParams } from "../../api/checkout/route";

describe("buildP24RegisterParams", () => {
  it("PL: PLN, język/kraj PL, kwota w groszach, urlReturn z order id", () => {
    const p = buildP24RegisterParams({
      orderId: "order-1", finalTotal: 1999.0, isDe: false,
      email: "k@e.pl", origin: "https://shop",
    });
    expect(p.currency).toBe("PLN");
    expect(p.amount).toBe(199900);
    expect(p.language).toBe("pl");
    expect(p.country).toBe("PL");
    expect(p.sessionId).toBe("order-1");
    expect(p.urlReturn).toBe("https://shop/checkout/success?order=order-1");
    expect(p.urlStatus).toBe("https://shop/api/p24/status");
  });

  it("DE: EUR, język/kraj DE, urlReturn z prefiksem /de", () => {
    const p = buildP24RegisterParams({
      orderId: "order-2", finalTotal: 499.5, isDe: true,
      email: "k@e.de", origin: "https://shop",
    });
    expect(p.currency).toBe("EUR");
    expect(p.amount).toBe(49950);
    expect(p.language).toBe("de");
    expect(p.country).toBe("DE");
    expect(p.urlReturn).toBe("https://shop/de/checkout/success?order=order-2");
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/checkout-p24-params.test.ts`
Expected: FAIL — brak eksportu.

- [ ] **Step 3: Dodaj builder + przełącz route**

In `app/api/checkout/route.ts`:

1. Zmień importy — usuń `import type Stripe`, `getStripe`; dodaj:

```typescript
import { registerTransaction, trnRequestUrl, type P24RegisterParams } from "@/app/_lib/p24";
```

2. Usuń lokalny typ `LineItem` i budowanie `stripeLineItems` (nie są potrzebne — P24 dostaje tylko sumę). Zachowaj pętlę walidacji/cen, ale zamiast `stripeLineItems.push(...)` nic nie pushuj (usuń tablicę i jej wypełnianie).

3. Usuń cały blok tworzenia `stripe.coupons.create` / `stripeCouponId` — rabat jest już w `finalTotal`.

4. Dodaj eksportowany builder (nad `POST` albo pod nim):

```typescript
export function buildP24RegisterParams(args: {
  orderId: string;
  finalTotal: number;
  isDe: boolean;
  email: string;
  origin: string;
}): P24RegisterParams {
  const localePrefix = args.isDe ? "/de" : "";
  return {
    sessionId: args.orderId,
    amount: Math.round(args.finalTotal * 100),
    currency: args.isDe ? "EUR" : "PLN",
    description: `Zamówienie ${args.orderId.slice(0, 8).toUpperCase()}`,
    email: args.email,
    country: args.isDe ? "DE" : "PL",
    language: args.isDe ? "de" : "pl",
    urlReturn: `${args.origin}${localePrefix}/checkout/success?order=${args.orderId}`,
    urlStatus: `${args.origin}/api/p24/status`,
  };
}
```

5. Zamień finalny blok (po `createOrder`) tworzący sesję Stripe na:

```typescript
    const origin =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    const token = await registerTransaction(
      buildP24RegisterParams({
        orderId: order.id,
        finalTotal,
        isDe,
        email: body.email,
        origin,
      })
    );

    return NextResponse.json({ url: trnRequestUrl(token) });
```

(`finalTotal` już istnieje w route; `isDe` już istnieje. Klient i tak czyta `data.url` i robi redirect — kontrakt frontu bez zmian.)

- [ ] **Step 4: Uruchom test + build**

Run: `cd sklep-meblowy && npx vitest run app/_lib/__tests__/checkout-p24-params.test.ts && npm run build`
Expected: test PASS; build przechodzi (brak odwołań do Stripe w checkoucie).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/api/checkout/route.ts sklep-meblowy/app/_lib/__tests__/checkout-p24-params.test.ts
git commit -m "feat(p24): checkout rejestruje transakcje P24 zamiast sesji Stripe"
```

---

### Task 7: Strona `success` (status-aware) + panel admina (referencja P24)

**Files:**
- Modify: `sklep-meblowy/app/checkout/success/page.tsx`
- Modify: `sklep-meblowy/app/admin/zamowienia/[id]/page.tsx:150-165`

**Interfaces:**
- Consumes: `getOrderById` (istn.), `order.status`, `order.payment_ref`, `order.payment_provider`.

- [ ] **Step 1: Przebuduj success page na param `order` + stan „w toku"**

In `app/checkout/success/page.tsx`:

1. Usuń `import { getStripe }`.
2. Zmień sygnaturę searchParams i logikę pobrania:

```typescript
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderParam } = await searchParams;
  const locale = await getLocale();
  const de = locale === "de";
```

3. Dodaj do obu słowników (`de` i `pl`) klucz dla stanu oczekiwania, np. w PL:

```typescript
        headingPending: "Płatność w toku",
        introPending:
          "Trwa potwierdzanie płatności przez operatora. Gdy środki wpłyną, wyślemy potwierdzenie na podany adres email. Tę stronę można zamknąć.",
```

i analogicznie DE:

```typescript
        headingPending: "Zahlung wird verarbeitet",
        introPending:
          "Die Zahlung wird vom Anbieter bestätigt. Sobald der Betrag eingegangen ist, senden wir eine Bestätigung an Ihre E-Mail. Sie können diese Seite schließen.",
```

4. Zamień blok `if (session_id) { ... getStripe()... }` na odczyt zamówienia + status:

```typescript
  let orderId: string | null = null;
  let total: number | null = null;
  let email: string | null = null;
  let orderCurrency: "pln" | "eur" = "pln";
  let isPaid = false;

  if (orderParam) {
    try {
      const order = await getOrderById(orderParam);
      orderId = order.id;
      total = Number(order.total);
      orderCurrency = order.currency;
      email = order.guest_email;
      isPaid = order.status !== "pending";
    } catch {
      // brak zamówienia — pokaż ogólny komunikat
    }
  }

  const heading = isPaid ? c.heading : c.headingPending;
  const intro = isPaid ? c.intro : c.introPending;
```

5. W JSX podmień `{c.heading}` → `{heading}`, `{c.intro}` → `{intro}`. Ikonę „checkmark" pokaż tylko gdy `isPaid` (gdy pending — neutralna/zegar; minimalnie: zostaw, ale to opcjonalne).

- [ ] **Step 2: Panel admina — pokaż referencję P24 + providera**

In `app/admin/zamowienia/[id]/page.tsx` (blok ~150-165, obecnie warunek `order.stripe_payment_intent`):

```tsx
          {(order.payment_ref || order.stripe_payment_intent) && (
            <div className="...">  {/* zachowaj istniejące klasy */}
              <span className="...">
                {order.payment_provider === "stripe"
                  ? "Stripe payment_intent (zwroty w panelu Stripe):"
                  : "Referencja P24 (zwroty w panelu Przelewy24):"}
              </span>
              <span className="...">
                {order.payment_ref ?? order.stripe_payment_intent}
              </span>
            </div>
          )}
```

(Zachowaj oryginalne `className` z pliku — podmień tylko logikę etykiety i wartości.)

- [ ] **Step 3: Build**

Run: `cd sklep-meblowy && npm run build`
Expected: PASS (brak odwołań do Stripe w success/admin).

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/checkout/success/page.tsx sklep-meblowy/app/admin/zamowienia/[id]/page.tsx
git commit -m "feat(p24): success page status-aware (param order) + admin pokazuje providera/ref"
```

---

### Task 8: Przywrócenie klauzuli #12 (regulamin) + paska logotypów #13 (stopka)

**Files:**
- Modify: `sklep-meblowy/app/(legal)/regulamin/page.tsx`
- Modify: `sklep-meblowy/app/_components/layout/Footer.tsx`
- Modify: `sklep-meblowy/app/_lib/dictionaries/pl.ts`, `.../de.ts`
- Create: `sklep-meblowy/public/payments/{przelewy24,visa,mastercard,blik}.svg`

**Interfaces:** brak (treść statyczna). Źródło prawdy: commity `336d036` (#12) i `600131c` (#13).

- [ ] **Step 1: Przywróć pliki #13 z commita 600131c**

```bash
git checkout 600131c -- sklep-meblowy/app/_components/layout/Footer.tsx \
  sklep-meblowy/app/_lib/dictionaries/pl.ts \
  sklep-meblowy/app/_lib/dictionaries/de.ts \
  sklep-meblowy/public/payments/przelewy24.svg \
  sklep-meblowy/public/payments/visa.svg \
  sklep-meblowy/public/payments/mastercard.svg \
  sklep-meblowy/public/payments/blik.svg
```

> Uwaga: SVG to placeholdery (szare prostokąty z tekstem). Wymianę na oficjalne logo Przelewy24 ujmuje Task 10 (do dostarczenia przez właścicielkę/brand). Jeśli od czasu commita Footer/dykcjonarze zmieniły się inaczej (sprawdź `git status`), rozwiąż konflikt ręcznie zachowując oba zestawy zmian.

- [ ] **Step 2: Przywróć klauzulę #12 w regulaminie**

In `app/(legal)/regulamin/page.tsx` dodaj klucz `s4_5` w obu sekcjach językowych (po `s4_4`) i wyrenderuj `<li>{c.s4_5}</li>` po `<li>{c.s4_4}</li>` (jak w commicie `336d036`).

DE `s4_5`:
```
"Zahlungsdienstleister im Shop ist Przelewy24 (PayPro SA). Betreiber der Kartenzahlungen ist PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, eingetragen im Unternehmerregister des Landesgerichtsregisters (KRS) unter der Nummer KRS 0000347935, NIP 7792369887, REGON 301345068."
```
PL `s4_5`:
```
"Operatorem płatności w Sklepie jest Przelewy24 (PayPro SA). Operatorem kart płatniczych jest PayPro SA Agent Rozliczeniowy, ul. Pastelowa 8, 60-198 Poznań, wpisany do Rejestru Przedsiębiorców Krajowego Rejestru Sądowego prowadzonego przez Sąd Rejonowy Poznań – Nowe Miasto i Wilda w Poznaniu, VIII Wydział Gospodarczy Krajowego Rejestru Sądowego pod numerem KRS 0000347935, NIP 7792369887, REGON 301345068."
```

(Najprościej: `git show 336d036 -- "sklep-meblowy/app/(legal)/regulamin/page.tsx"` i nanieś TYLKO dodanie `s4_5` + `<li>`; pomiń hunki §4.2/§5.3 — one są już na prod.)

- [ ] **Step 3: Build + lint**

Run: `cd sklep-meblowy && npm run build && npm run lint`
Expected: PASS (Footer używa `<Image>` z `next/image` — upewnij się, że import jest obecny po przywróceniu).

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/\(legal\)/regulamin/page.tsx sklep-meblowy/app/_components/layout/Footer.tsx sklep-meblowy/app/_lib/dictionaries/pl.ts sklep-meblowy/app/_lib/dictionaries/de.ts sklep-meblowy/public/payments/
git commit -m "feat(p24): przywroc klauzule operatora PayPro (#12) + pasek logotypow (#13)"
```

---

### Task 9: Usunięcie Stripe

**Files:**
- Delete: `sklep-meblowy/app/_lib/stripe.ts`, `sklep-meblowy/app/api/webhook/route.ts`, `sklep-meblowy/app/_lib/stripe-events.ts`, `sklep-meblowy/app/_lib/__tests__/stripe-events.test.ts`
- Modify: `sklep-meblowy/package.json` (usuń dep `stripe`)

**Interfaces:** po tym tasku żaden plik nie importuje `stripe` ani `@/app/_lib/stripe*`.

- [ ] **Step 1: Potwierdź brak innych odwołań do Stripe w kodzie**

Run: `cd sklep-meblowy && grep -rln "stripe" app/ --include=*.ts --include=*.tsx`
Expected: tylko pliki do usunięcia (`stripe.ts`, `webhook/route.ts`, `stripe-events.ts`, `stripe-events.test.ts`). Pole `stripe_payment_intent` w `types.ts`/`orders.ts`-admin zostaje (legacy do migracji 40) — to NIE odwołanie do biblioteki.
Jeśli pojawi się coś innego — najpierw to odepnij, dopiero potem usuwaj.

- [ ] **Step 2: Usuń pliki Stripe**

```bash
git rm sklep-meblowy/app/_lib/stripe.ts \
  sklep-meblowy/app/api/webhook/route.ts \
  sklep-meblowy/app/_lib/stripe-events.ts \
  sklep-meblowy/app/_lib/__tests__/stripe-events.test.ts
```

- [ ] **Step 3: Usuń zależność `stripe`**

Run: `cd sklep-meblowy && npm uninstall stripe`
Expected: znika z `package.json` i `package-lock.json`.

- [ ] **Step 4: Pełny build + testy + lint**

Run: `cd sklep-meblowy && npm run build && npm test && npm run lint`
Expected: build PASS; testy PASS (zestaw bez `stripe-events.test.ts`, z nowymi p24-testami); lint czysty. Brak błędów „cannot find module stripe".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(p24): usun Stripe (lib, webhook, events, dependency)"
```

---

### Task 10: Env, dokumentacja, migracja 40 (cleanup) + weryfikacja końcowa

**Files:**
- Modify: `sklep-meblowy/.env.local` (lokalnie — sandbox; NIE commitowane, gitignored) oraz `sklep-meblowy/.env.example` jeśli istnieje
- Create: `supabase/migrations/40_drop_stripe_payment_intent.sql` (repo-root; do odpalenia PO oknie zwrotów Stripe)
- Modify: `ONBOARDING.md` (sekcja płatności)

**Interfaces:** brak kodu wykonawczego.

- [ ] **Step 1: Env — ustaw klucze sandbox P24 lokalnie**

W `sklep-meblowy/.env.local` dodaj (wartości z sandboxa `sandbox.przelewy24.pl`):
```
P24_MERCHANT_ID=...
P24_POS_ID=...
P24_API_KEY=...
P24_CRC=...
P24_BASE_URL=https://sandbox.przelewy24.pl
```
Usuń `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`. Jeśli jest `.env.example` — odzwierciedl tam te same klucze (bez wartości).

- [ ] **Step 2: Plik migracji 40 (cleanup — NIE odpalać teraz)**

Create `supabase/migrations/40_drop_stripe_payment_intent.sql`:
```sql
-- Migracja 40: usunięcie legacy kolumny Stripe. ODPALIĆ DOPIERO po oknie
-- zwrotów/reklamacji ostatniego zamówienia opłaconego Stripe (~30 dni po cutoverze).
-- Do tego czasu kolumna jest źródłem referencji do zwrotów w panelu Stripe.
alter table public.orders drop column if exists stripe_payment_intent;
```

> Po odpaleniu migracji 40: usunąć `stripe_payment_intent` z `types.ts` (`Order` i `OrderInsert`) oraz z fallbacku w panelu admina (Task 7 Step 2) — osobny, późniejszy commit.

- [ ] **Step 3: ONBOARDING.md — sekcja płatności**

Zaktualizuj opis płatności: operator = Przelewy24/PayPro (direct REST), env `P24_*`, endpoint notyfikacji `/api/p24/status`, sandbox `sandbox.przelewy24.pl`, cutover/expand-contract + migracje 39/40. Usuń wzmianki o Stripe jako aktywnym operatorze.

- [ ] **Step 4: Manualne testy E2E w sandboxie P24** (wymaga: odpalonej migracji 39 + kluczy sandbox)

Uruchom `cd sklep-meblowy && npm run dev` i wykonaj checklistę (każdą jako osobny zakup):
- [ ] Karta PL (`/`): płatność kończy się `paid`, success pokazuje „przyjęte".
- [ ] BLIK PL i przelew PL: jw.
- [ ] Karta EUR (`/de`): kwota w EUR, success po niemiecku.
- [ ] Płatność porzucona/nieudana: zamówienie zostaje `pending`, success pokazuje „w toku".
- [ ] Duplikat notyfikacji (P24 ponawia / ręcznie przez panel): status nie cofa się, `used_count` promo nie rośnie podwójnie.
- [ ] Podrobiona notyfikacja (curl z błędnym `sign` na `/api/p24/status`): HTTP 400, zamówienie bez zmian.

> Testy tworzą realne pending-zamówienia w prod DB (jedna instancja). Po testach oznacz je `cancelled`/wyczyść (jak skrypty test-data).

- [ ] **Step 5: Weryfikacja końcowa + commit dokumentacji**

Run: `cd sklep-meblowy && npm test && npm run build && npm run lint`
Expected: wszystko zielone.

```bash
git add supabase/migrations/40_drop_stripe_payment_intent.sql ONBOARDING.md
git commit -m "docs(p24): env sandbox, migracja 40 (cleanup), onboarding platnosci"
```

---

## Self-Review (autor planu)

**Pokrycie speca:**
- Przepływ register→verify→markOrderPaid → Task 3,5,6 ✅
- `verify` z kontrolą kwoty jako jedyna bramka → Task 5 (BRAMKA 2) ✅
- Migracja danych (`payment_ref`+`payment_provider`) → Task 1 (jako expand-contract; KOREKTA vs spec — oznaczona) ✅
- Podpisy CRC (3 miejsca) → Task 2 (sign), 3 (register/verify), 4 (notyfikacja) ✅
- Idempotencja/dedup/CAS → Task 5 ✅
- Powrót bez zaufania (success „w toku") → Task 7 ✅
- EUR `/de` (karta) → Task 6 (builder) ✅
- Refundy ręczne + `refundTransaction` w lib → Task 3 + Task 7 (panel) ✅
- Przywrócenie #12/#13 → Task 8 ✅
- Usunięcie Stripe → Task 9 ✅
- Cutover/env/sandbox/migracja 40 → Task 10 ✅
- Testy (jednostkowe + E2E sandbox) → Task 2-6 (unit) + Task 10 (E2E) ✅

**Placeholdery:** brak „TBD/TODO" w krokach kodu; jedyne odłożenie to oficjalne logo P24 (Task 8/10) — zależność od brandu, nie luka implementacyjna.

**Spójność typów:** `markOrderPaid(orderId, paymentRef)`, `registerTransaction→string(token)`, `verifyTransaction→boolean`, `P24Notification`, `expectedVerifyAmount`, `buildP24RegisterParams` — nazwy i sygnatury użyte spójnie między Task 1,3,4,5,6.

**KOREKTA vs spec (do potwierdzenia przez usera):** migracja jako **expand-contract** (add kolumny → cutover → drop w migracji 40) zamiast rename-w-lockstep. Powód: rename psuje żywy Stripe na Vercel i blokuje testy E2E; expand-contract jest bezpieczny i testowalny.
