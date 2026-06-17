# Panel zarządzania zamówieniami w adminie + wygaszenie pushu BL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać adminowi pełną obsługę zamówień w panelu sklepu (lista, szczegóły, ręczna zmiana statusu, dane wysyłki, rozliczenie dostawy, notatki) i wyłączyć push zamówień do BaseLinkera.

**Architecture:** Nowa sekcja `/admin/zamowienia` (lista = server component z filtrami URL; szczegóły = server component + kliencki `OrderControls` wołający server actions). Czysta logika (reguła przejść statusów, wyprowadzenie danych klienta) w osobnych, testowanych modułach `app/_lib/*`. Warstwa DB w `app/_lib/orders.ts`. Push do BL znika z webhooka, cron `reconcile-bl` z `vercel.json`; kod i kolumny BL zostają jako legacy.

**Tech Stack:** Next.js 16.2.4 (App Router, Server Components, Server Actions), React 19.2.4, Supabase (PostgREST + service role), TypeScript, vitest 4, ESLint 9, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-17-panel-zamowien-admin-design.md`

## Global Constraints

- **Katalog aplikacji:** wszystkie komendy (`npm`, `git`, `tsc`) uruchamiaj z `sklep-meblowy/` (tam jest `package.json`). Ścieżki w `git add` są względem korzenia repo (`sklep-meblowy/app/...`).
- **Next.js 16 to NIE Next.js z treningu** (`AGENTS.md`): przed pisaniem kodu Server Component/Action sprawdź przewodnik w `node_modules/next/dist/docs/`. `params` i `searchParams` w stronach są **Promise** — zawsze `await`. Heed deprecation notices.
- **Panel admina jest PL-only** — żadnego i18n/słowników w nowych widokach admina. Ceny: `formatPrice(amount, "pl")`.
- **DDL uruchamia ręcznie admin (Mikołaj)** w Supabase SQL Editorze — Claude/agent NIE ma dostępu DDL (tylko PostgREST przez service role). Agent tworzy plik migracji i zatrzymuje się z instrukcją uruchomienia; testy/integracja zakładają, że migracja jest już zaaplikowana.
- **Wzorce repo:** server actions → `"use server"`, `await requireAdmin()`, `createAdminClient()`, zwracają `ActionResult`, `revalidatePath`. Updaty castowane `as never` (zgodnie z istniejącym kodem). Komponenty klienckie używają `_shared` (`Card`, `Field`, `ToastView`, `inputCls`, `Toast`) i wzorca `useTransition` + `router.refresh()`.
- **Bramki (jak w repo):** `npx tsc --noEmit` = 0 błędów, `npm run lint` = 0, `npm test` zielony, `npm run build` przechodzi.

---

### Task 1: Migracja 31 — pola admina na `orders` + rozszerzenie typu `Order`

**Files:**
- Create: `sklep-meblowy/supabase/migrations/31_orders_admin_fields.sql`
- Modify: `sklep-meblowy/supabase/schema.sql` (blok `create table ... orders`)
- Modify: `sklep-meblowy/app/_lib/types.ts` (typ `Order`)

**Interfaces:**
- Produces: kolumny `orders.order_number` (bigint, NOT NULL, unique, sekwencja), `admin_note` (text), `carrier` (text), `tracking_number` (text), `delivery_cost` (numeric(10,2)), `delivery_paid` (boolean NOT NULL default false), `status_updated_at` (timestamptz). Typ `Order` z tymi polami — konsumowany przez Tasks 3–7.

- [ ] **Step 1: Utwórz plik migracji 31**

Create `sklep-meblowy/supabase/migrations/31_orders_admin_fields.sql`:

```sql
-- 31: pola admina dla zamówień (panel zarządzania, etap 1a zastąpienia BaseLinker)
-- Uruchomić RĘCZNIE w Supabase SQL Editorze (DDL).

alter table public.orders add column if not exists admin_note       text;
alter table public.orders add column if not exists carrier          text;
alter table public.orders add column if not exists tracking_number  text;
alter table public.orders add column if not exists delivery_cost    numeric(10, 2);
alter table public.orders add column if not exists delivery_paid    boolean not null default false;
alter table public.orders add column if not exists status_updated_at timestamptz;

-- Czytelny, monotoniczny numer zamówienia.
create sequence if not exists public.orders_order_number_seq;
alter table public.orders add column if not exists order_number bigint;

-- Backfill istniejących wierszy wg kolejności utworzenia (tylko tam, gdzie NULL).
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.orders
  where order_number is null
)
update public.orders o
set order_number = ordered.rn
from ordered
where o.id = ordered.id;

-- Sekwencja zaczyna ponad maksymalnym istniejącym numerem.
select setval(
  'public.orders_order_number_seq',
  coalesce((select max(order_number) from public.orders), 0) + 1,
  false
);

-- Domyślna wartość + NOT NULL + unikalność dla przyszłych zamówień.
alter table public.orders alter column order_number set default nextval('public.orders_order_number_seq');
alter table public.orders alter column order_number set not null;
create unique index if not exists idx_orders_order_number on public.orders (order_number);
```

- [ ] **Step 2: Zaktualizuj `schema.sql` (baseline dla świeżej bazy)**

W `sklep-meblowy/supabase/schema.sql` znajdź blok `create table if not exists public.orders (...)`. Dodaj **przed** nim:

```sql
-- Sekwencja numeru zamówienia (panel admina, migracja 31)
create sequence if not exists public.orders_order_number_seq;
```

i rozszerz definicję tabeli o nowe kolumny (po `created_at`):

```sql
create table if not exists public.orders (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references auth.users(id) on delete restrict,
  status                 text not null default 'pending'
                           check (status in ('pending','paid','processing','shipped','delivered','cancelled')),
  total                  numeric(10, 2) not null check (total >= 0),
  shipping_address       jsonb not null,
  stripe_payment_intent  text,
  created_at             timestamptz not null default now(),
  -- Panel admina (migracja 31)
  order_number           bigint not null default nextval('public.orders_order_number_seq') unique,
  admin_note             text,
  carrier                text,
  tracking_number        text,
  delivery_cost          numeric(10, 2),
  delivery_paid          boolean not null default false,
  status_updated_at      timestamptz
);
```

> Uwaga: jeśli w `schema.sql` blok `orders` zawiera już inne kolumny dodane wcześniejszymi migracjami (np. `guest_email`, `promo_code_id`, `promo_discount`, `baselinker_*`), ZACHOWAJ je — dopisz tylko brakujące pola z migracji 31. Nie usuwaj istniejących linii.

- [ ] **Step 3: Rozszerz typ `Order` w `types.ts`**

W `sklep-meblowy/app/_lib/types.ts`, w typie `Order`, dodaj pola po `created_at: string;` (przed `items?`):

```ts
  // Panel admina (migracja 31)
  order_number: number;
  admin_note: string | null;
  carrier: string | null;
  tracking_number: string | null;
  delivery_cost: number | null;
  delivery_paid: boolean;
  status_updated_at: string | null;
```

(`Database.public.Tables.orders.Row = Omit<Order,"items">` automatycznie dziedziczy nowe pola — nic więcej nie zmieniaj. Updaty admina pójdą castem `as never`, więc `OrderInsert` zostaje bez zmian.)

- [ ] **Step 4: Sprawdź typy**

Run: `npx tsc --noEmit`
Expected: 0 błędów (nowe pola nie mają jeszcze konsumentów — kompiluje się).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/supabase/migrations/31_orders_admin_fields.sql sklep-meblowy/supabase/schema.sql sklep-meblowy/app/_lib/types.ts
git commit -m "feat(orders): migracja 31 — pola admina (order_number, dostawa, notatka, status_updated_at)"
```

> **STOP / akcja admina:** poinformuj użytkownika, że migrację `31_orders_admin_fields.sql` trzeba uruchomić ręcznie w Supabase SQL Editorze przed wdrożeniem. Dalsze taski nie wymagają jej do `tsc`/`vitest`, ale runtime panelu jej wymaga.

---

### Task 2: Reguła przejść statusów (pure, TDD)

**Files:**
- Create: `sklep-meblowy/app/_lib/order-status.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/order-status.test.ts`

**Interfaces:**
- Produces:
  - `canTransition(from: OrderStatus, to: OrderStatus): boolean`
  - `nextStatuses(from: OrderStatus): OrderStatus[]`
  - `ADMIN_STATUS_LABELS: Record<OrderStatus, { label: string; className: string }>` (PL)
- Consumes: `OrderStatus` z `@/app/_lib/types`.

- [ ] **Step 1: Napisz failujący test**

Create `sklep-meblowy/app/_lib/__tests__/order-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, nextStatuses } from "@/app/_lib/order-status";

describe("canTransition", () => {
  it("pozwala iść do przodu po osi paid→processing→shipped→delivered", () => {
    expect(canTransition("paid", "processing")).toBe(true);
    expect(canTransition("processing", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
  });

  it("pozwala na skok do przodu (paid→delivered, paid→shipped)", () => {
    expect(canTransition("paid", "delivered")).toBe(true);
    expect(canTransition("paid", "shipped")).toBe(true);
  });

  it("zabrania cofania", () => {
    expect(canTransition("shipped", "processing")).toBe(false);
    expect(canTransition("processing", "paid")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
  });

  it("pozwala anulować z każdego stanu poza delivered/cancelled", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
    expect(canTransition("processing", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(true);
  });

  it("stany końcowe (delivered/cancelled) nie zmieniają się", () => {
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("delivered", "processing")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("nigdy nie wraca do pending ani nie zmienia na ten sam status", () => {
    expect(canTransition("paid", "pending")).toBe(false);
    expect(canTransition("paid", "paid")).toBe(false);
  });
});

describe("nextStatuses", () => {
  it("paid → processing, shipped, delivered, cancelled", () => {
    expect(nextStatuses("paid")).toEqual([
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ]);
  });

  it("shipped → delivered, cancelled", () => {
    expect(nextStatuses("shipped")).toEqual(["delivered", "cancelled"]);
  });

  it("delivered i cancelled → [] (stany końcowe)", () => {
    expect(nextStatuses("delivered")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm test -- app/_lib/__tests__/order-status.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/order-status"` / `canTransition is not a function`.

- [ ] **Step 3: Zaimplementuj `order-status.ts`**

Create `sklep-meblowy/app/_lib/order-status.ts`:

```ts
import type { OrderStatus } from "./types";

// Oś postępu realizacji. `cancelled` jest poza osią — to boczny stan końcowy.
const PROGRESS_AXIS: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

const TERMINAL: OrderStatus[] = ["delivered", "cancelled"];

// Dozwolone RĘCZNE przejście statusu w panelu admina.
// - tylko do przodu po osi (skoki dozwolone, np. paid→delivered),
// - cancelled z każdego stanu poza delivered/cancelled,
// - nigdy powrót do pending, nigdy zmiana na ten sam status,
// - stany końcowe (delivered, cancelled) są zamknięte.
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (TERMINAL.includes(from)) return false;
  if (to === "cancelled") return true;
  if (to === "pending") return false;
  const fi = PROGRESS_AXIS.indexOf(from);
  const ti = PROGRESS_AXIS.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti > fi;
}

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

// Lista statusów, na które admin może przejść z bieżącego (dla <select>).
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ALL_STATUSES.filter((to) => canTransition(from, to));
}

// Etykiety + kolory dla panelu (PL). Klasy spójne z widokiem klienta.
export const ADMIN_STATUS_LABELS: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: { label: "Oczekuje na płatność", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- app/_lib/__tests__/order-status.test.ts`
Expected: PASS (wszystkie przypadki).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/order-status.ts sklep-meblowy/app/_lib/__tests__/order-status.test.ts
git commit -m "feat(orders): reguła przejść statusów + etykiety PL (canTransition, nextStatuses)"
```

---

### Task 3: Wyprowadzenie danych klienta (pure, TDD) + warstwa DB listy

**Files:**
- Create: `sklep-meblowy/app/_lib/admin-orders.ts` (PURE — bez importu supabase)
- Test: `sklep-meblowy/app/_lib/__tests__/admin-orders.test.ts`
- Modify: `sklep-meblowy/app/_lib/orders.ts` (dodaj funkcje DB)

**Interfaces:**
- Produces (pure, `admin-orders.ts`):
  - `type OrderCustomer = { name: string | null; email: string | null; isGuest: boolean }`
  - `orderCustomerDisplay(order: Pick<Order,"user_id"|"guest_email"|"shipping_address">, profile: Pick<Profile,"email"|"full_name"> | null): OrderCustomer`
- Produces (DB, `orders.ts`):
  - `type AdminOrderRow = Order & { items: { quantity: number }[] }`
  - `getAdminOrders(opts: { status?: OrderStatus | "all"; search?: string; page?: number }): Promise<{ orders: AdminOrderRow[]; total: number; pages: number; page: number }>`
  - `getProfilesByIds(ids: string[]): Promise<Record<string, { email: string; full_name: string | null }>>`
- Consumes: `Order`, `OrderStatus`, `Profile`, `Address` z types; `createAdminClient` (już importowany w `orders.ts`).

> Rozdział pure/DB jest celowy: test importuje TYLKO `admin-orders.ts` (czysty, bez `next/headers`), więc nie wciąga `supabase/server`.

- [ ] **Step 1: Napisz failujący test (pure)**

Create `sklep-meblowy/app/_lib/__tests__/admin-orders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
import type { Address } from "@/app/_lib/types";

const addr: Address = {
  street: "ul. Meblowa 1",
  city: "Warszawa",
  postal_code: "00-001",
  country: "Polska",
  fullname: "Jan Kowalski",
};

describe("orderCustomerDisplay", () => {
  it("zarejestrowany: email i nazwisko z profilu", () => {
    const r = orderCustomerDisplay(
      { user_id: "u1", guest_email: null, shipping_address: addr },
      { email: "jan@example.com", full_name: "Jan K." }
    );
    expect(r).toEqual({ name: "Jan K.", email: "jan@example.com", isGuest: false });
  });

  it("zarejestrowany bez profilu: fallback nazwiska do adresu, email null", () => {
    const r = orderCustomerDisplay(
      { user_id: "u1", guest_email: null, shipping_address: addr },
      null
    );
    expect(r).toEqual({ name: "Jan Kowalski", email: null, isGuest: false });
  });

  it("gość: email z guest_email, nazwisko z adresu, isGuest=true", () => {
    const r = orderCustomerDisplay(
      { user_id: null, guest_email: "gosc@example.com", shipping_address: addr },
      null
    );
    expect(r).toEqual({ name: "Jan Kowalski", email: "gosc@example.com", isGuest: true });
  });

  it("brak nazwiska w adresie → name null", () => {
    const r = orderCustomerDisplay(
      { user_id: null, guest_email: "g@e.pl", shipping_address: { ...addr, fullname: undefined } },
      null
    );
    expect(r.name).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npm test -- app/_lib/__tests__/admin-orders.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/admin-orders"`.

- [ ] **Step 3: Zaimplementuj `admin-orders.ts` (pure)**

Create `sklep-meblowy/app/_lib/admin-orders.ts`:

```ts
import type { Order, Profile } from "./types";

export type OrderCustomer = {
  name: string | null;
  email: string | null;
  isGuest: boolean;
};

// Wyprowadzenie danych klienta do wyświetlenia w panelu.
// Zarejestrowany (user_id) → profil (email + full_name), z fallbackiem
// nazwiska do adresu dostawy. Gość → guest_email + nazwisko z adresu.
export function orderCustomerDisplay(
  order: Pick<Order, "user_id" | "guest_email" | "shipping_address">,
  profile: Pick<Profile, "email" | "full_name"> | null
): OrderCustomer {
  const addrName = order.shipping_address?.fullname ?? null;
  if (order.user_id) {
    return {
      name: profile?.full_name ?? addrName,
      email: profile?.email ?? null,
      isGuest: false,
    };
  }
  return {
    name: addrName,
    email: order.guest_email ?? null,
    isGuest: true,
  };
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- app/_lib/__tests__/admin-orders.test.ts`
Expected: PASS.

- [ ] **Step 5: Dodaj funkcje DB do `orders.ts`**

W `sklep-meblowy/app/_lib/orders.ts` dodaj na końcu pliku:

```ts
const ADMIN_ORDERS_PAGE_SIZE = 30;

export type AdminOrderRow = Order & { items: { quantity: number }[] };

// Lista zamówień dla panelu admina — filtr statusu, szukajka (numer / e-mail
// gościa / nazwisko z adresu), paginacja po dacie malejąco. `items` to tylko
// ilości (do policzenia liczby pozycji) — szczegóły ładuje getOrderById.
export async function getAdminOrders({
  status,
  search,
  page = 1,
}: {
  status?: OrderStatus | "all";
  search?: string;
  page?: number;
}): Promise<{ orders: AdminOrderRow[]; total: number; pages: number; page: number }> {
  const supabase = await createAdminClient();
  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const from = (safePage - 1) * ADMIN_ORDERS_PAGE_SIZE;
  const to = from + ADMIN_ORDERS_PAGE_SIZE - 1;

  let query = supabase
    .from("orders")
    .select("*, items:order_items(quantity)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const term = search?.trim();
  if (term) {
    const numeric = term.replace(/^#/, "");
    if (/^\d+$/.test(numeric)) {
      query = query.eq("order_number", Number(numeric));
    } else {
      // Usuwamy znaki łamiące składnię filtra `or` PostgREST.
      const esc = term.replace(/[%,()*]/g, " ").trim();
      query = query.or(
        `guest_email.ilike.%${esc}%,shipping_address->>fullname.ilike.%${esc}%`
      );
    }
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const orders = (data ?? []) as unknown as AdminOrderRow[];
  const total = count ?? 0;
  return {
    orders,
    total,
    pages: Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE)),
    page: safePage,
  };
}

// Mapa profili (email + nazwisko) po id usera — do wyświetlenia klienta na liście.
export async function getProfilesByIds(
  ids: string[]
): Promise<Record<string, { email: string; full_name: string | null }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, { email: string; full_name: string | null }> = {};
  for (const p of (data ?? []) as { id: string; email: string; full_name: string | null }[]) {
    map[p.id] = { email: p.email, full_name: p.full_name };
  }
  return map;
}
```

- [ ] **Step 6: Sprawdź typy + cały suite**

Run: `npx tsc --noEmit`
Expected: 0 błędów.
Run: `npm test`
Expected: cały suite zielony (nowe testy + dotychczasowe).

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/_lib/admin-orders.ts sklep-meblowy/app/_lib/__tests__/admin-orders.test.ts sklep-meblowy/app/_lib/orders.ts
git commit -m "feat(orders): dane klienta (pure) + warstwa DB listy admina (getAdminOrders, getProfilesByIds)"
```

---

### Task 4: Server actions panelu zamówień

**Files:**
- Create: `sklep-meblowy/app/admin/zamowienia/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminClient`, `canTransition`, `revalidatePath`, `OrderStatus`.
- Produces:
  - `type ActionResult = { ok: true; message?: string } | { ok: false; error: string }`
  - `updateOrderStatus(orderId: string, newStatus: string): Promise<ActionResult>`
  - `updateOrderFulfillment(formData: FormData): Promise<ActionResult>`
  - `updateOrderNote(formData: FormData): Promise<ActionResult>`

- [ ] **Step 1: Utwórz `actions.ts`**

Create `sklep-meblowy/app/admin/zamowienia/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { canTransition } from "@/app/_lib/order-status";
import type { OrderStatus } from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function sanitizeText(input: unknown, max: number): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

// Koszt dostawy: pusty → null, liczba >= 0 → liczba (2 miejsca), inaczej null.
function parseCost(input: unknown): number | null {
  if (typeof input !== "string" || input.trim() === "") return null;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };
  if (!ALL_STATUSES.includes(newStatus as OrderStatus)) {
    return { ok: false, error: "Nieprawidłowy status" };
  }
  const to = newStatus as OrderStatus;

  const supabase = await createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Zamówienie nie znalezione" };

  const from = (row as { status: OrderStatus }).status;
  if (!canTransition(from, to)) {
    return { ok: false, error: `Niedozwolona zmiana statusu: ${from} → ${to}` };
  }

  // CAS po odczytanym statusie — nie nadpisujemy równoległej zmiany.
  const { error } = await supabase
    .from("orders")
    .update({ status: to, status_updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", from);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Status zaktualizowany" };
}

export async function updateOrderFulfillment(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const carrier = sanitizeText(formData.get("carrier"), 120);
  const trackingNumber = sanitizeText(formData.get("tracking_number"), 120);
  const deliveryCost = parseCost(formData.get("delivery_cost"));
  const deliveryPaid = formData.get("delivery_paid") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      carrier: carrier || null,
      tracking_number: trackingNumber || null,
      delivery_cost: deliveryCost,
      delivery_paid: deliveryPaid,
    } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Zapisano dane dostawy" };
}

export async function updateOrderNote(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const note = sanitizeText(formData.get("admin_note"), 2000);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ admin_note: note || null } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Notatka zapisana" };
}
```

- [ ] **Step 2: Sprawdź typy + lint**

Run: `npx tsc --noEmit`
Expected: 0 błędów.
Run: `npm run lint`
Expected: 0 błędów/ostrzeżeń w nowym pliku.

- [ ] **Step 3: Commit**

```bash
git add sklep-meblowy/app/admin/zamowienia/actions.ts
git commit -m "feat(orders): server actions panelu — status (z walidacją przejść), dostawa, notatka"
```

---

### Task 5: Lista zamówień + wpięcie do nawigacji admina

**Files:**
- Modify: `sklep-meblowy/app/_components/ui/Pagination.tsx` (dodaj prop `basePath`)
- Create: `sklep-meblowy/app/admin/zamowienia/page.tsx`
- Modify: `sklep-meblowy/app/admin/page.tsx` (dodaj kafelek „Zamówienia”)
- Modify: `sklep-meblowy/app/admin/layout.tsx` (dodaj pozycję nawigacji „Zamówienia” + ikonę)

**Interfaces:**
- Consumes: `getAdminOrders`, `getProfilesByIds` (z `orders.ts`), `orderCustomerDisplay` (z `admin-orders.ts`), `ADMIN_STATUS_LABELS` (z `order-status.ts`), `formatPrice`, `Pagination`, `EmptyState`/`inputCls` (z `_shared`).
- Produces: trasa `/admin/zamowienia` (server component czytający `searchParams: { status?, q?, strona? }`).

- [ ] **Step 1: Uogólnij `Pagination` o `basePath`**

W `sklep-meblowy/app/_components/ui/Pagination.tsx`:

Zmień typ `Props` — dodaj `basePath`:

```ts
type Props = {
  page: number;
  pages: number;
  searchParams: Record<string, string>;
  locale?: Locale;
  basePath?: string;
};
```

Zmień sygnaturę i `pageHref`:

```ts
export default function Pagination({ page, pages, searchParams, locale = DEFAULT_LOCALE, basePath = "/sklep" }: Props) {
  if (pages <= 1) return null;

  const t = getDictionary(locale);

  function pageHref(p: number) {
    const params = new URLSearchParams({ ...searchParams, strona: String(p) });
    return `${basePath}?${params.toString()}`;
  }
  // ...reszta bez zmian
```

(Domyślny `basePath = "/sklep"` zachowuje dotychczasowe działanie sklepu.)

- [ ] **Step 2: Utwórz stronę listy**

Create `sklep-meblowy/app/admin/zamowienia/page.tsx`:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { getAdminOrders, getProfilesByIds } from "@/app/_lib/orders";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
import { ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";
import { formatPrice } from "@/app/_lib/format";
import { EmptyState, inputCls } from "@/app/admin/_shared";
import Pagination from "@/app/_components/ui/Pagination";
import type { OrderStatus } from "@/app/_lib/types";

export const metadata = { title: "Zamówienia — Admin" };

const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "paid", label: "Opłacone" },
  { value: "processing", label: "W realizacji" },
  { value: "shipped", label: "Wysłane" },
  { value: "delivered", label: "Dostarczone" },
  { value: "cancelled", label: "Anulowane" },
  { value: "pending", label: "Oczekujące" },
];

type SearchParams = Promise<{ status?: string; q?: string; strona?: string }>;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (FILTERS.some((f) => f.value === sp.status) ? sp.status : "all") as
    | OrderStatus
    | "all";
  const search = sp.q?.trim() || undefined;
  const page = Number(sp.strona ?? 1);

  const { orders, total, pages, page: currentPage } = await getAdminOrders({
    status,
    search,
    page,
  });
  const profiles = await getProfilesByIds(
    orders.map((o) => o.user_id).filter((id): id is string => !!id)
  );

  const rawParams: Record<string, string> = {};
  if (status !== "all") rawParams.status = status;
  if (search) rawParams.q = search;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Zamówienia</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          {total} {total === 1 ? "zamówienie" : "zamówień"}
        </p>
      </div>

      {/* Szukajka — natywny formularz GET (działa bez JS) */}
      <form action="/admin/zamowienia" className="flex gap-2 max-w-lg">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={search ?? ""}
          placeholder="Szukaj: numer, e-mail lub nazwisko"
          className={inputCls}
        />
        <button
          type="submit"
          className="shrink-0 px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors"
        >
          Szukaj
        </button>
      </form>

      {/* Filtry statusu — linki z zachowaniem szukajki */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (f.value !== "all") params.set("status", f.value);
          if (search) params.set("q", search);
          const qs = params.toString();
          const href = `/admin/zamowienia${qs ? `?${qs}` : ""}`;
          const active = f.value === status;
          return (
            <Link
              key={f.value}
              href={href}
              className={`px-4 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
                active
                  ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <EmptyState message="Brak zamówień w tym filtrze." />
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-2xl bg-[var(--card-bg)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-[var(--muted)] border-b border-[var(--border)]">
                <th className="px-4 py-3">Nr</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Kwota</th>
                <th className="px-4 py-3 text-center">Dostawa</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cust = orderCustomerDisplay(
                  o,
                  o.user_id ? profiles[o.user_id] ?? null : null
                );
                const s = ADMIN_STATUS_LABELS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/zamowienia/${o.id}`}
                        className="font-mono font-semibold text-[var(--color-gold)] hover:underline"
                      >
                        #{o.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--fg)]">{cust.name ?? "—"}</span>
                      {cust.email && (
                        <span className="block text-xs text-[var(--muted)]">{cust.email}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--fg)] whitespace-nowrap">
                      {formatPrice(Number(o.total), "pl")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {o.delivery_paid ? (
                        <span className="text-emerald-600" title="Dostawa opłacona">✓</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={currentPage}
        pages={pages}
        searchParams={rawParams}
        basePath="/admin/zamowienia"
      />
    </div>
  );
}
```

- [ ] **Step 3: Dodaj kafelek „Zamówienia” na pulpicie**

W `sklep-meblowy/app/admin/page.tsx`, w tablicy `CARDS`, dodaj jako pierwszą pozycję:

```ts
  { href: "/admin/zamowienia", title: "Zamówienia", cta: "Zarządzaj zamówieniami" },
```

- [ ] **Step 4: Dodaj pozycję nawigacji + ikonę**

W `sklep-meblowy/app/admin/layout.tsx`, w `NAV_ITEMS`, dodaj po pozycji „Pulpit”:

```ts
  { href: "/admin/zamowienia", label: "Zamówienia", icon: OrdersIcon },
```

i dodaj funkcję ikony (obok pozostałych `function ...Icon()`):

```tsx
function OrdersIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}
```

- [ ] **Step 5: Sprawdź typy, lint, build**

Run: `npx tsc --noEmit`
Expected: 0 błędów.
Run: `npm run lint`
Expected: 0 błędów.
Run: `npm run build`
Expected: build przechodzi, trasa `/admin/zamowienia` skompilowana.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_components/ui/Pagination.tsx sklep-meblowy/app/admin/zamowienia/page.tsx sklep-meblowy/app/admin/page.tsx sklep-meblowy/app/admin/layout.tsx
git commit -m "feat(orders): lista zamówień w adminie (filtry/szukajka/paginacja) + nawigacja"
```

---

### Task 6: Szczegóły zamówienia + kontrolki (status/dostawa/notatka)

**Files:**
- Create: `sklep-meblowy/app/admin/zamowienia/[id]/page.tsx`
- Create: `sklep-meblowy/app/admin/zamowienia/[id]/OrderControls.tsx`

**Interfaces:**
- Consumes: `getOrderById` (z `orders.ts`), `getProfilesByIds`, `orderCustomerDisplay`, `ADMIN_STATUS_LABELS`, `nextStatuses`, `formatPrice`, `formatVariantLabel`, server actions z Task 4, `_shared` (`Card`, `Field`, `ToastView`, `inputCls`, `Toast`).
- Produces: trasa `/admin/zamowienia/[id]`.

- [ ] **Step 1: Utwórz kliencki `OrderControls`**

Create `sklep-meblowy/app/admin/zamowienia/[id]/OrderControls.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";
import {
  updateOrderStatus,
  updateOrderFulfillment,
  updateOrderNote,
  type ActionResult,
} from "../actions";
import type { OrderStatus } from "@/app/_lib/types";

type Props = {
  orderId: string;
  allowedStatuses: OrderStatus[];
  carrier: string | null;
  trackingNumber: string | null;
  deliveryCost: number | null;
  deliveryPaid: boolean;
  adminNote: string | null;
};

export default function OrderControls(props: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<OrderStatus | "">("");

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handle(res: ActionResult) {
    if (res.ok) {
      showToast({ type: "success", message: res.message ?? "Zapisano" });
      router.refresh();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Status */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Status zamówienia</h3>
        {props.allowedStatuses.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Stan końcowy — brak dalszych zmian statusu.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value as OrderStatus | "")}
              className={inputCls}
            >
              <option value="">— wybierz nowy status —</option>
              {props.allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {ADMIN_STATUS_LABELS[s].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected || isPending}
              onClick={() => {
                if (!selected) return;
                startTransition(async () => {
                  handle(await updateOrderStatus(props.orderId, selected));
                  setSelected("");
                });
              }}
              className="shrink-0 px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Zmień status
            </button>
          </div>
        )}
      </Card>

      {/* Dostawa */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Dostawa</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("orderId", props.orderId);
            startTransition(async () => handle(await updateOrderFulfillment(fd)));
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Przewoźnik">
            <input name="carrier" defaultValue={props.carrier ?? ""} className={inputCls} placeholder="np. DPD, własny transport" />
          </Field>
          <Field label="Numer śledzenia">
            <input name="tracking_number" defaultValue={props.trackingNumber ?? ""} className={inputCls} />
          </Field>
          <Field label="Koszt dostawy (zł)">
            <input
              name="delivery_cost"
              type="number"
              step="0.01"
              min="0"
              defaultValue={props.deliveryCost ?? ""}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input type="checkbox" name="delivery_paid" value="1" defaultChecked={props.deliveryPaid} />
            Dostawa opłacona
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Zapisz dostawę
          </button>
        </form>
      </Card>

      {/* Notatka */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Notatka wewnętrzna</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("orderId", props.orderId);
            startTransition(async () => handle(await updateOrderNote(fd)));
          }}
          className="flex flex-col gap-3"
        >
          <textarea
            name="admin_note"
            defaultValue={props.adminNote ?? ""}
            rows={4}
            className={inputCls}
            placeholder="Widoczne tylko dla admina"
          />
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Zapisz notatkę
          </button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Utwórz stronę szczegółów**

Create `sklep-meblowy/app/admin/zamowienia/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getOrderById, getProfilesByIds } from "@/app/_lib/orders";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
import { ADMIN_STATUS_LABELS, nextStatuses } from "@/app/_lib/order-status";
import { formatPrice } from "@/app/_lib/format";
import { formatVariantLabel } from "@/app/_lib/variants";
import { Card } from "@/app/admin/_shared";
import OrderControls from "./OrderControls";
import type { Order, OrderItem } from "@/app/_lib/types";

export const metadata = { title: "Zamówienie — Admin" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  let order: (Order & { items: OrderItem[] }) | null = null;
  try {
    order = await getOrderById(id);
  } catch {
    notFound();
  }
  if (!order) notFound();

  const profiles = order.user_id ? await getProfilesByIds([order.user_id]) : {};
  const customer = orderCustomerDisplay(
    order,
    order.user_id ? profiles[order.user_id] ?? null : null
  );

  const items = order.items ?? [];
  const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const promoDiscount = Number(order.promo_discount ?? 0);
  const s = ADMIN_STATUS_LABELS[order.status];
  const addr = order.shipping_address;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/zamowienia" className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors">
          ← Wszystkie zamówienia
        </Link>
      </div>

      {/* Nagłówek + status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
            Zamówienie #{order.order_number}
          </h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {new Date(order.created_at).toLocaleString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest self-start ${s.className}`}>
          {s.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lewa kolumna: pozycje + podsumowanie + klient + adres */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card>
            <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Pozycje</h3>
            <div className="flex flex-col gap-4">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4 border-b border-[var(--border)] last:border-0 pb-4 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/produkt/${item.product_id}`}
                      className="font-semibold text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
                    >
                      {item.product?.name ?? "Produkt"}
                    </Link>
                    {item.variant_values && (
                      <p className="text-xs text-[var(--color-gold)] mt-0.5">
                        {formatVariantLabel(item.variant_values, "pl")}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-1.5 text-xs text-[var(--muted)] whitespace-pre-wrap">
                        Uwagi: {item.notes}
                      </p>
                    )}
                    <p className="text-sm text-[var(--muted)] mt-1">
                      {item.quantity} × {formatPrice(Number(item.price), "pl")}
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--fg)] whitespace-nowrap">
                    {formatPrice(Number(item.price) * item.quantity, "pl")}
                  </p>
                </div>
              ))}
            </div>

            <dl className="border-t border-[var(--border)] mt-4 pt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-[var(--muted)]">
                <dt>Produkty</dt>
                <dd>{formatPrice(subtotal, "pl")}</dd>
              </div>
              {promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>
                    Rabat
                    {order.promo_code?.code && (
                      <span className="ml-1 font-mono text-xs">({order.promo_code.code})</span>
                    )}
                  </dt>
                  <dd>−{formatPrice(promoDiscount, "pl")}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 font-bold text-base text-[var(--fg)]">
                <dt>Zapłacono</dt>
                <dd>{formatPrice(Number(order.total), "pl")}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Klient</h3>
            <p className="text-sm text-[var(--fg)]">{customer.name ?? "—"}</p>
            {customer.email && <p className="text-sm text-[var(--muted)]">{customer.email}</p>}
            <p className="text-xs text-[var(--muted)] mt-1">
              {customer.isGuest ? "Zamówienie gościa" : "Konto zarejestrowane"}
            </p>
            {addr?.phone && <p className="text-sm text-[var(--muted)] mt-2">tel. {addr.phone}</p>}
          </Card>

          {addr && (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Adres dostawy</h3>
              <address className="not-italic text-sm text-[var(--fg)] leading-relaxed">
                {addr.fullname && <>{addr.fullname}<br /></>}
                {addr.street}<br />
                {addr.postal_code} {addr.city}<br />
                {addr.country}
              </address>
            </Card>
          )}

          {order.stripe_payment_intent && (
            <Card>
              <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-3">Płatność</h3>
              <p className="text-xs text-[var(--muted)]">
                Stripe payment_intent (referencja do zwrotów):
              </p>
              <p className="font-mono text-sm text-[var(--fg)] break-all">
                {order.stripe_payment_intent}
              </p>
            </Card>
          )}
        </div>

        {/* Prawa kolumna: kontrolki admina */}
        <div className="lg:col-span-1">
          <OrderControls
            orderId={order.id}
            allowedStatuses={nextStatuses(order.status)}
            carrier={order.carrier}
            trackingNumber={order.tracking_number}
            deliveryCost={order.delivery_cost}
            deliveryPaid={order.delivery_paid}
            adminNote={order.admin_note}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Sprawdź typy, lint, build**

Run: `npx tsc --noEmit`
Expected: 0 błędów.
Run: `npm run lint`
Expected: 0 błędów.
Run: `npm run build`
Expected: build przechodzi; trasy `/admin/zamowienia` i `/admin/zamowienia/[id]` skompilowane.

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/admin/zamowienia/[id]/page.tsx sklep-meblowy/app/admin/zamowienia/[id]/OrderControls.tsx
git commit -m "feat(orders): szczegóły zamówienia + kontrolki (status/dostawa/notatka)"
```

---

### Task 7: Wygaszenie pushu BaseLinker

**Files:**
- Modify: `sklep-meblowy/app/api/webhook/route.ts`
- Modify: `sklep-meblowy/vercel.json`
- Modify: `sklep-meblowy/app/admin/page.tsx` (usuń kafelek „BaseLinker”)
- Modify: `sklep-meblowy/app/admin/layout.tsx` (usuń pozycję „BaseLinker” + `BLIcon`)

**Interfaces:**
- Consumes: nic nowego. Usuwa zależność webhooka od `pushOrderToBaseLinker`/`hasCompletedBlPush`.
- Produces: webhook bez pushu do BL; brak crona; nawigacja bez BL.

> **Nie usuwamy** plików `baselinker*.ts`, `app/admin/baselinker/*`, `app/api/baselinker/*`, kolumn `baselinker_*` ani tabeli `baselinker_sync_log` — to legacy do osobnego cleanupu.

- [ ] **Step 1: Webhook — usuń importy BL**

W `sklep-meblowy/app/api/webhook/route.ts` usuń dwie linie importu:

```ts
import { pushOrderToBaseLinker } from "@/app/_lib/baselinker-orders";
import { hasCompletedBlPush } from "@/app/_lib/baselinker-orders";
```

W komentarzu nagłówkowym `settlePaidOrder` (linie ~12–19) usuń wzmiankę o pushu — zmień zdanie:

```ts
// markOrderPaid (CAS), increment promo (zwycięzca claimu), push do BaseLinker.
```
na:
```ts
// markOrderPaid (CAS) oraz increment promo (zwycięzca claimu).
```

- [ ] **Step 2: Webhook — uprość select i dedup, przenieś ślad do `admin_note`**

W `settlePaidOrder` zmień zapytanie odczytu (usuń `baselinker_order_id`):

```ts
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("id, status, promo_code_id")
    .eq("id", orderId)
    .maybeSingle();
```

Zmień cast `ord` (usuń pole `baselinker_order_id`):

```ts
  const ord = orderRow as unknown as {
    status: OrderStatus;
    promo_code_id: string | null;
  };
```

W bloku obsługi płatności za ANULOWANE zamówienie zmień update — zamiast `baselinker_push_error` użyj `admin_note`:

```ts
    const { error: cancelTraceErr } = await supabase
      .from("orders")
      .update({
        stripe_payment_intent: paymentIntent ?? session.id,
        admin_note:
          "płatność Stripe doszła po anulowaniu zamówienia — wymaga ręcznej obsługi (zwrot/przywrócenie)",
      } as never)
      .eq("id", orderId);
```

Zmień guard deduplikacji (usuń zależność od `hasCompletedBlPush`):

```ts
  // Status != pending oznacza, że zamówienie zostało już rozliczone
  // (markOrderPaid przeszedł). Duplikaty eventu Stripe pomijamy idempotentnie.
  if (ord.status !== "pending") {
    return NextResponse.json({ received: true });
  }
```

- [ ] **Step 3: Webhook — usuń blok pushu do BL**

Usuń cały blok (komentarz + `try/catch` z `pushOrderToBaseLinker`), zostawiając tylko końcowe `return`:

```ts
  // Push do BaseLinker — best-effort, nie blokuje webhooka jeśli zawiedzie.
  // Nieudany push można zsynchronizować później (cron reconcile-bl).
  try {
    const result = await pushOrderToBaseLinker(orderId);
    if (result.baselinker_order_id) {
      console.log(
        `[BL] order ${orderId} → BaseLinker order_id=${result.baselinker_order_id}`
      );
    } else {
      console.warn(`[BL] push pominięty: ${result.reason}`);
    }
  } catch (err) {
    console.error("[BL] push do BaseLinker nieudany:", err);
  }

  return NextResponse.json({ received: true });
```

zostaje:

```ts
  return NextResponse.json({ received: true });
```

- [ ] **Step 4: Usuń crona z `vercel.json`**

Zmień `sklep-meblowy/vercel.json` na:

```json
{
  "crons": []
}
```

- [ ] **Step 5: Usuń BaseLinker z nawigacji admina**

W `sklep-meblowy/app/admin/page.tsx` usuń z `CARDS` linię:

```ts
  { href: "/admin/baselinker", title: "BaseLinker", cta: "Otwórz" },
```

W `sklep-meblowy/app/admin/layout.tsx` usuń z `NAV_ITEMS` linię:

```ts
  { href: "/admin/baselinker", label: "BaseLinker", icon: BLIcon },
```

oraz usuń teraz nieużywaną funkcję `function BLIcon() { ... }` (inaczej ESLint zgłosi `no-unused-vars`).

- [ ] **Step 6: Sprawdź typy, lint, build**

Run: `npx tsc --noEmit`
Expected: 0 błędów (brak osieroconych referencji do usuniętych importów/`BLIcon`).
Run: `npm run lint`
Expected: 0 błędów.
Run: `npm run build`
Expected: build przechodzi.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/api/webhook/route.ts sklep-meblowy/vercel.json sklep-meblowy/app/admin/page.tsx sklep-meblowy/app/admin/layout.tsx
git commit -m "feat(orders): wygaszenie pushu BaseLinker (webhook, cron, nawigacja) — kod BL jako legacy"
```

---

### Task 8: Bramki końcowe

**Files:** brak (weryfikacja całości).

- [ ] **Step 1: Pełny suite testów**

Run: `npm test`
Expected: wszystkie pliki zielone (w tym `order-status.test.ts`, `admin-orders.test.ts` i dotychczasowe).

- [ ] **Step 2: Typy + lint + build**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run lint` → 0 błędów.
Run: `npm run build` → przechodzi.

- [ ] **Step 3: Smoke (opcjonalnie, lokalnie)**

Po zaaplikowaniu migracji 31 przez admina: `npm run dev`, zaloguj jako admin, wejdź `/admin/zamowienia`, otwórz zamówienie, zmień status (np. paid→processing), zapisz dostawę i notatkę — sprawdź, że status klienta w `/konto/zamowienia` się aktualizuje.

- [ ] **Step 4: Przypomnienie deployu**

Przypomnij użytkownikowi: przed deployem uruchomić w Supabase migracje **29, 30** (zaległe) oraz **31** (ten etap). Usunięcie crona z `vercel.json` zatrzyma `reconcile-bl` po deployu.

---

## Self-Review (wykonane przy pisaniu planu)

**Pokrycie specu:** Architektura → T4–T6. Model danych/migracja 31 → T1. Lista → T5. Szczegóły → T6. Reguła przejść → T2. Server actions + dostęp do danych → T3–T4. Wygaszenie BL → T7. Testy → T2/T3 (pure) + bramki T8. Uwaga Next.js → Global Constraints. Wszystkie sekcje pokryte.

**Placeholdery:** brak — każdy krok z kodem ma pełny kod; komendy z oczekiwanym wynikiem.

**Spójność typów:** `canTransition`/`nextStatuses`/`ADMIN_STATUS_LABELS` (T2) zgodne z użyciem w T4/T5/T6. `orderCustomerDisplay` (T3) zgodne z użyciem w T5/T6. `getAdminOrders`/`getProfilesByIds`/`AdminOrderRow` (T3) zgodne z importami w T5/T6. `ActionResult` i sygnatury akcji (T4) zgodne z `OrderControls` (T6). Pola `Order` (T1) konsumowane spójnie (`order_number`, `delivery_*`, `carrier`, `tracking_number`, `admin_note`).

**Uwaga o ryzyku:** szukajka po nazwisku używa `shipping_address->>fullname` w filtrze `or` PostgREST — jeśli w praktyce zawiedzie na jsonb, fallback: zostaw tylko `order_number.eq` (numer) + `guest_email.ilike` (e-mail). E-mail zarejestrowanego usera nie jest na wierszu zamówienia (jest w `profiles`) — wyszukiwanie po nim świadomie pominięte (nazwisko pokrywa adres dostawy).
