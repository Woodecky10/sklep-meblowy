# Zamawianie próbek tkanin — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zalogowany klient zamawia próbki tkanin — pierwsze 3 kolory w roku gratis, każdy kolejny 15 zł, dostawa zawsze darmowa — a właścicielka obsługuje te zamówienia w osobnej sekcji panelu.

**Architecture:** Próbki są osobnym bytem obok zamówień mebli: własne tabele (`sample_orders`, `sample_order_items`, `sample_quota`), własny płaski status, własny endpoint notyfikacji P24. Ile sztuk jest darmowych, rozstrzyga atomowe RPC w bazie, a nie przeglądarka. `fabrics` i `orders` nie są zmieniane.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + RPC), Przelewy24 REST v1, Resend, Tailwind, vitest, Playwright.

## Global Constraints

- **To NIE jest Next.js z treningu** — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (`sklep-meblowy/AGENTS.md`)
- Wszystkie polecenia uruchamiać z katalogu `sklep-meblowy/`.
- Panel admina jest **PL-only** (bez i18n). Front dwujęzyczny, ale `/de` jest zamrożone flagą `DE_ENABLED` — próbki są **PLN-only**, bez EUR.
- Server actions: `"use server"` + `requireAdmin()` (dla panelu) + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult` (`{ ok: true; message?: string; data?: unknown } | { ok: false; error: string }` z `app/_lib/types.ts:6`), updaty castowane `as never`.
- **localhost i preview używają PRODUKCYJNEJ bazy Supabase** — każda mutacja dotyka żywego sklepu. Testowe zamówienia próbek kasować po sobie.
- Migracje **nie aplikują się automatycznie** — wgrywa je człowiek albo agent przez Supabase MCP (`apply_migration`), za zgodą właściciela.
- Stałe: `SAMPLE_FREE_LIMIT = 3`, `SAMPLE_UNIT_PRICE = 15`, okno odnowienia **12 miesięcy** — każda w jednym miejscu w kodzie.
- **Jednostką jest kolor tkaniny**, nie tkanina: `fabrics.colors` to numery, `fabrics.color_images` to zdjęcia per numer, a sklep operuje wartością w formacie `„Nazwa Numer"`.
- Nowe moduły nazywać `sample-*` / `samples.ts`. ⚠️ „Próbka" w istniejącym kodzie oznacza **zdjęcie wzornika** (`FabricSwatchGrid`, `fabric-swatch-images.ts`) — nie mieszać.
- Bramki przed każdym commitem: `npx tsc --noEmit` (0 błędów), `npm test` (wszystko zielone — stan wyjściowy **895 testów w 75 plikach**), `npm run build` (przechodzi).

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `supabase/migrations/67_fabric_samples.sql` | **Nowy.** Trzy tabele, indeksy, RLS, RPC `claim_free_samples` / `release_free_samples`. |
| `app/_lib/types.ts` | **Zmiana.** Typy `SampleOrderStatus`, `SamplePaymentStatus`, `SampleOrder`, `SampleOrderItem`. |
| `app/_lib/sample-pricing.ts` | **Nowy.** Czysty moduł: stałe, `normalizeEmailKey`, `splitFreePaid`, `sampleOrderTotal`. Zero importów serwerowych. |
| `app/_lib/__tests__/sample-pricing.test.ts` | **Nowy.** Testy czystych funkcji. |
| `app/_lib/samples.ts` | **Nowy.** `import "server-only"` — I/O: tworzenie zamówienia, odczyt dla panelu, zmiany statusu, rozliczenie płatności. |
| `app/probki/page.tsx` | **Nowy.** Server Component: bramka logowania, dane wzornika, prefill adresu. |
| `app/probki/SampleForm.tsx` | **Nowy.** Klient: wybór kolorów, pasek podsumowania, formularz adresu. |
| `app/probki/actions.ts` | **Nowy.** Server action składająca zamówienie (i rejestrująca P24, gdy kwota > 0). |
| `app/probki/sukces/page.tsx` | **Nowy.** Strona powrotu z bramki — czyta status z bazy, nie ufa powrotowi. |
| `app/logowanie/page.tsx` | **Zmiana.** Obsługa `?next=` (dziś zalogowany jest bezwarunkowo odsyłany na `/konto`). |
| `app/api/p24/probki-status/route.ts` | **Nowy.** Notyfikacja P24 dla próbek. |
| `app/admin/probki/page.tsx` | **Nowy.** Lista zamówień próbek w trzech grupach. |
| `app/admin/probki/SampleOrdersList.tsx` | **Nowy.** Karty zamówień z miniaturami wzornika i akcjami. |
| `app/admin/probki/actions.ts` | **Nowy.** Akcje: spakowane / wysłane / anuluj. |
| `app/admin/AdminShell.tsx` | **Zmiana.** Pozycja „Próbki" + licznik nowych (`navBadge`, linie 24-41). |
| `app/_lib/mail/templates/AdminNewSampleOrder.tsx`, `SampleOrderConfirmation.tsx`, `SampleOrderSent.tsx` | **Nowe.** Trzy szablony. |
| `app/_lib/mail/sample-notify.ts` | **Nowy.** Wysyłka trzech maili próbkowych. |
| `e2e/samples.spec.ts` | **Nowy.** Guard: bramka logowania i powrót z preselekcją. |

---

### Task 1: Migracja 67 — tabele, RPC, RLS

**Files:**
- Create: `supabase/migrations/67_fabric_samples.sql`
- Modify: `app/_lib/types.ts` (dopisanie typów na końcu pliku)

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces: tabele `sample_orders`, `sample_order_items`, `sample_quota`; funkcje `public.claim_free_samples(p_email_key text, p_qty int) returns int` i `public.release_free_samples(p_email_key text, p_qty int) returns void`; typy `SampleOrder`, `SampleOrderItem`, `SampleOrderStatus`, `SamplePaymentStatus`.

- [ ] **Step 1: Napisz plik migracji**

Utwórz `supabase/migrations/67_fabric_samples.sql`:

```sql
-- Migracja 67: zamawianie próbek tkanin.
-- Spec: docs/superpowers/specs/2026-08-01-probki-tkanin-design.md
--
-- Próbki są OSOBNYM bytem obok zamówień mebli: inny kanał wysyłki (list, nie
-- firma transportowa), inna maszyna stanów, inna definicja "gotowe".
-- `orders` i `fabrics` NIE są ruszane.

-- ============================================================
-- 1. Zamówienia próbek
-- ============================================================
create table if not exists public.sample_orders (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- Snapshot danych klienta: profil może się zmienić, zamówienie ma zostać czytelne.
  customer_name    text not null default '' check (char_length(customer_name) <= 200),
  customer_email   text not null check (char_length(customer_email) <= 200),
  customer_phone   text check (char_length(customer_phone) <= 40),
  shipping_address jsonb not null default '{}'::jsonb,
  -- DWIE NIEZALEŻNE OSIE STANU. Sklejenie ich w jedno pole jest tym samym
  -- błędem, przez który orders.processing przy pobraniu nie znaczy "opłacone".
  status           text not null default 'new'
                     check (status in ('new','packed','sent','cancelled')),
  payment_status   text not null default 'none'
                     check (payment_status in ('none','pending','paid')),
  amount_total     numeric(10,2) not null default 0,
  payment_ref      text,
  -- Ile sztuk poszło z darmowej puli — potrzebne, żeby anulowanie wiedziało,
  -- ile miejsc zwrócić (release_free_samples).
  free_count       integer not null default 0,
  paid_count       integer not null default 0,
  email_key        text not null,
  tracking         text check (char_length(tracking) <= 120),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sample_orders_status     on public.sample_orders (status);
create index if not exists idx_sample_orders_created_at on public.sample_orders (created_at desc);
create index if not exists idx_sample_orders_user       on public.sample_orders (user_id);

drop trigger if exists trg_sample_orders_updated on public.sample_orders;
create trigger trg_sample_orders_updated
  before update on public.sample_orders
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Pozycje = KOLORY tkanin, nie tkaniny
-- ============================================================
create table if not exists public.sample_order_items (
  id               uuid primary key default uuid_generate_v4(),
  sample_order_id  uuid not null references public.sample_orders(id) on delete cascade,
  fabric_id        uuid references public.fabrics(id) on delete set null,
  color            text not null default '' check (char_length(color) <= 40),
  -- Snapshot: katalog tkanin się zmienia, a zamówienie sprzed roku ma dalej
  -- mówić, co wysłano (ten sam wzorzec co product_inquiries.product_name).
  fabric_name      text not null default '',
  is_free          boolean not null default false,
  unit_price       numeric(10,2) not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_sample_items_order on public.sample_order_items (sample_order_id);

-- ============================================================
-- 3. Licznik darmowej puli
-- ============================================================
-- KLUCZEM JEST ZNORMALIZOWANY E-MAIL, nie user_id: założenie drugiego konta na
-- jan+1@gmail.com zajmuje 30 sekund i dałoby kolejne trzy darmowe paczki.
create table if not exists public.sample_quota (
  email_key    text primary key,
  user_id      uuid references auth.users(id) on delete set null,
  used_count   integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 4. RPC: atomowa rezerwacja darmowych sztuk
-- ============================================================
-- Limit MUSI być twardy. Odpowiednik przy kodach rabatowych
-- (increment_promo_usage) ma znany dług: dwa równoległe checkouty potrafią
-- przepchnąć nadmiarowe użycie. Tutaj blokada wiersza (for update) plus
-- policzenie przyznanych sztuk w tej samej transakcji zamyka ten wyścig.
--
-- Okno 12 miesięcy wygasa LENIWIE w tym samym wywołaniu — na Vercelu nie ma
-- crona (crons: [] w vercel.json), więc nic nie mogłoby go wyczyścić w tle.
create or replace function public.claim_free_samples(p_email_key text, p_qty int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used   int;
  v_window timestamptz;
  v_grant  int;
begin
  if p_qty is null or p_qty <= 0 then
    return 0;
  end if;

  insert into public.sample_quota (email_key, used_count, window_start)
  values (p_email_key, 0, now())
  on conflict (email_key) do nothing;

  select used_count, window_start
    into v_used, v_window
    from public.sample_quota
   where email_key = p_email_key
   for update;

  if v_window < now() - interval '12 months' then
    v_used := 0;
    v_window := now();
  end if;

  v_grant := least(p_qty, greatest(0, 3 - v_used));

  update public.sample_quota
     set used_count   = v_used + v_grant,
         -- Okno startuje od PIERWSZEJ darmowej próbki, nie od założenia konta.
         window_start = case when v_used = 0 and v_grant > 0 then now() else v_window end,
         updated_at   = now()
   where email_key = p_email_key;

  return v_grant;
end;
$$;

-- Zwrot miejsc przy anulowaniu zamówienia. Bez tego porzucone, nieopłacone
-- zamówienie zabrałoby klientowi darmową pulę na rok.
create or replace function public.release_free_samples(p_email_key text, p_qty int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  update public.sample_quota
     set used_count = greatest(0, used_count - p_qty),
         updated_at = now()
   where email_key = p_email_key;
end;
$$;

revoke all on function public.claim_free_samples(text, int) from public, anon, authenticated;
revoke all on function public.release_free_samples(text, int) from public, anon, authenticated;
grant execute on function public.claim_free_samples(text, int) to service_role;
grant execute on function public.release_free_samples(text, int) to service_role;

-- ============================================================
-- 5. RLS — wariant utwardzony (jak migracja 27)
-- ============================================================
-- Formularz wymaga logowania i tak, a zapis idzie wyłącznie przez server action
-- na service_role — dlatego NIE ma polityki INSERT dla anon/authenticated.
alter table public.sample_orders      enable row level security;
alter table public.sample_order_items enable row level security;
alter table public.sample_quota       enable row level security;

drop policy if exists "sample_orders: owner read" on public.sample_orders;
create policy "sample_orders: owner read"
  on public.sample_orders for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sample_orders: admin all" on public.sample_orders;
create policy "sample_orders: admin all"
  on public.sample_orders for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "sample_items: admin all" on public.sample_order_items;
create policy "sample_items: admin all"
  on public.sample_order_items for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Sprawdź kształt polityk RLS na sąsiedniej tabeli**

Run: `grep -n "app_metadata" supabase/migrations/*.sql | head -10`
Expected: istniejące polityki admina używają dokładnie tego samego wyrażenia. Jeśli w repo obowiązuje inny kształt (np. helper `public.is_admin()`), użyj tamtego zamiast wyrażenia powyżej — spójność jest ważniejsza niż literalne przepisanie tego bloku.

- [ ] **Step 3: Dopisz typy w `app/_lib/types.ts`**

Na końcu pliku:

```ts
export type SampleOrderStatus = "new" | "packed" | "sent" | "cancelled";
export type SamplePaymentStatus = "none" | "pending" | "paid";

export type SampleOrderItem = {
  id: string;
  sample_order_id: string;
  fabric_id: string | null;
  color: string;
  // Snapshot nazwy tkaniny z chwili zamówienia — katalog może się zmienić.
  fabric_name: string;
  is_free: boolean;
  unit_price: number;
  created_at: string;
};

export type SampleOrder = {
  id: string;
  user_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: Record<string, string>;
  status: SampleOrderStatus;
  // Osobna oś od `status`: "czy zapłacone" nie jest etapem realizacji.
  payment_status: SamplePaymentStatus;
  amount_total: number;
  payment_ref: string | null;
  free_count: number;
  paid_count: number;
  email_key: string;
  tracking: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Sprawdź bramkę typów**

Run: `npx tsc --noEmit`
Expected: 0 błędów.

- [ ] **Step 5: Zapytaj właściciela o zgodę i zaaplikuj migrację**

⚠️ **NIE aplikuj bez wyraźnej zgody.** Pokaż treść SQL-a, poczekaj na „tak", dopiero potem `mcp__supabase__apply_migration`.

Po zaaplikowaniu zweryfikuj po OBIEKTACH, nie po rejestrze migracji (rejestr w tym projekcie jest niepełny):

```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_name in ('sample_orders','sample_order_items','sample_quota');
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('claim_free_samples','release_free_samples');
```
Expected: `3` i `2`.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/supabase/migrations/67_fabric_samples.sql sklep-meblowy/app/_lib/types.ts
git commit -m "feat(probki): migracja 67 - tabele zamowien probek, pula i atomowe RPC"
```

---

### Task 2: Czysty moduł wyceny i tożsamości

**Files:**
- Create: `app/_lib/sample-pricing.ts`
- Test: `app/_lib/__tests__/sample-pricing.test.ts`

**Interfaces:**
- Consumes: nic z Taska 1 (moduł jest czysty, bez bazy).
- Produces: `SAMPLE_FREE_LIMIT: 3`, `SAMPLE_UNIT_PRICE: 15`, `type SampleSelection = { fabricId: string; fabricName: string; color: string }`, `normalizeEmailKey(email: string): string`, `splitFreePaid(count: number, freeGranted: number): { free: number; paid: number }`, `sampleOrderTotal(paidCount: number): number`, `dedupeSelections(items: SampleSelection[]): SampleSelection[]`.

- [ ] **Step 1: Napisz testy**

Utwórz `app/_lib/__tests__/sample-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SAMPLE_FREE_LIMIT,
  SAMPLE_UNIT_PRICE,
  normalizeEmailKey,
  splitFreePaid,
  sampleOrderTotal,
  dedupeSelections,
} from "../sample-pricing";

describe("normalizeEmailKey", () => {
  it("sprowadza do małych liter i obcina spacje", () => {
    expect(normalizeEmailKey("  Jan.Kowalski@Firma.PL ")).toBe("jan.kowalski@firma.pl");
  });

  it("dla Gmaila usuwa kropki i +tag — to najtańsza droga obejścia limitu", () => {
    expect(normalizeEmailKey("jan.kowalski+probki@gmail.com")).toBe("jankowalski@gmail.com");
    expect(normalizeEmailKey("j.a.n@googlemail.com")).toBe("jan@gmail.com");
  });

  it("poza Gmailem kropki są znaczące i zostają", () => {
    expect(normalizeEmailKey("jan.kowalski@firma.pl")).toBe("jan.kowalski@firma.pl");
  });

  it("poza Gmailem +tag też jest obcinany", () => {
    expect(normalizeEmailKey("jan+sklep@firma.pl")).toBe("jan@firma.pl");
  });
});

describe("splitFreePaid", () => {
  it("przy pełnej puli pierwsze trzy sztuki są darmowe", () => {
    expect(splitFreePaid(5, 3)).toEqual({ free: 3, paid: 2 });
  });

  it("gdy pula jest częściowo zużyta, płatnych jest więcej", () => {
    expect(splitFreePaid(5, 1)).toEqual({ free: 1, paid: 4 });
  });

  it("gdy pula jest wyczerpana, wszystko jest płatne", () => {
    expect(splitFreePaid(2, 0)).toEqual({ free: 0, paid: 2 });
  });

  it("nie przyznaje więcej darmowych, niż jest sztuk w zamówieniu", () => {
    expect(splitFreePaid(2, 3)).toEqual({ free: 2, paid: 0 });
  });

  it("pusty wybór nie daje nic", () => {
    expect(splitFreePaid(0, 3)).toEqual({ free: 0, paid: 0 });
  });
});

describe("sampleOrderTotal", () => {
  it("liczy 15 zł za każdą płatną sztukę", () => {
    expect(sampleOrderTotal(0)).toBe(0);
    expect(sampleOrderTotal(2)).toBe(30);
  });

  it("dostawa nigdy nic nie dodaje — jest zawsze darmowa", () => {
    // Regresja na wypadek, gdyby ktoś kiedyś doklejał tu koszt wysyłki.
    expect(sampleOrderTotal(10)).toBe(10 * SAMPLE_UNIT_PRICE);
  });
});

describe("dedupeSelections", () => {
  it("ten sam kolor tej samej tkaniny liczy się raz", () => {
    const out = dedupeSelections([
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "a", fabricName: "Riviera", color: "16" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("dwa różne kolory tej samej tkaniny to dwie próbki", () => {
    const out = dedupeSelections([
      { fabricId: "a", fabricName: "Riviera", color: "16" },
      { fabricId: "a", fabricName: "Riviera", color: "18" },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("stałe", () => {
  it("limit darmowych i cena są jednym źródłem prawdy", () => {
    expect(SAMPLE_FREE_LIMIT).toBe(3);
    expect(SAMPLE_UNIT_PRICE).toBe(15);
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `npx vitest run app/_lib/__tests__/sample-pricing.test.ts`
Expected: FAIL — „Failed to resolve import ../sample-pricing".

- [ ] **Step 3: Napisz moduł**

Utwórz `app/_lib/sample-pricing.ts`:

```ts
// Czysta logika próbek tkanin: wycena i klucz tożsamości darmowej puli.
// BEZ importów serwerowych (next/cache, next/headers, server-only) — ten moduł
// jest importowany wartościami z komponentu klienckiego SampleForm.tsx.
// I/O żyje w samples.ts, który ma `import "server-only"` jako guard.

// Ile próbek jest darmowych w oknie 12 miesięcy. Jedno źródło prawdy: baza
// (claim_free_samples) i front muszą mówić tę samą liczbę.
export const SAMPLE_FREE_LIMIT = 3;

// Cena każdej próbki ponad darmową pulę, w złotych. Dostawa jest zawsze
// darmowa i NIE wchodzi do tej kwoty.
export const SAMPLE_UNIT_PRICE = 15;

// Jednostką jest KOLOR tkaniny, nie tkanina: sklep operuje wartościami
// „Nazwa Numer" (np. „Riviera 16"), a właścicielka wycina konkretny kolor.
export type SampleSelection = {
  fabricId: string;
  fabricName: string;
  color: string;
};

// Klucz darmowej puli. user_id nie wystarcza: założenie konta na
// jan+1@gmail.com zajmuje 30 sekund i dawałoby kolejne trzy gratisy.
export function normalizeEmailKey(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  // +tag jest aliasem u każdego dostawcy, który go obsługuje.
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);

  // Kropki są nieznaczące TYLKO u Google. Gdzie indziej to inne skrzynki.
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");

  return `${local}@${domain}`;
}

// Ile sztuk zamówienia idzie z puli, a ile jest płatnych. `freeGranted` to
// liczba miejsc, które REALNIE przyznała baza — front może ją estymować, ale
// rozstrzyga wynik claim_free_samples.
export function splitFreePaid(
  count: number,
  freeGranted: number
): { free: number; paid: number } {
  const free = Math.max(0, Math.min(count, freeGranted));
  return { free, paid: Math.max(0, count - free) };
}

export function sampleOrderTotal(paidCount: number): number {
  return Math.max(0, paidCount) * SAMPLE_UNIT_PRICE;
}

// Ten sam kolor tej samej tkaniny to jedna próbka; dwa kolory tej samej
// tkaniny to dwie osobne próbki (każda liczy się do puli i do ceny).
export function dedupeSelections(items: SampleSelection[]): SampleSelection[] {
  const seen = new Set<string>();
  const out: SampleSelection[] = [];
  for (const item of items) {
    const key = `${item.fabricId}::${item.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
```

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npx vitest run app/_lib/__tests__/sample-pricing.test.ts`
Expected: PASS, 14 testów.

- [ ] **Step 5: Bramki i commit**

Run: `npx tsc --noEmit && npm test`
Expected: 0 błędów, wszystko zielone (895 + 14 nowych).

```bash
git add sklep-meblowy/app/_lib/sample-pricing.ts sklep-meblowy/app/_lib/__tests__/sample-pricing.test.ts
git commit -m "feat(probki): czysty modul wyceny probek i normalizacji e-maila"
```

---

### Task 3: Warstwa danych i składanie zamówienia

**Files:**
- Create: `app/_lib/samples.ts`
- Create: `app/probki/actions.ts`

**Interfaces:**
- Consumes: tabele i RPC z Taska 1; `SAMPLE_UNIT_PRICE`, `SampleSelection`, `normalizeEmailKey`, `splitFreePaid`, `sampleOrderTotal`, `dedupeSelections` z Taska 2.
- Produces:
  - `createSampleOrder(input: CreateSampleOrderInput): Promise<{ orderId: string; amountTotal: number; freeCount: number; paidCount: number }>`
  - `type CreateSampleOrderInput = { userId: string; email: string; name: string; phone: string | null; address: Record<string, string>; selections: SampleSelection[] }`
  - `getSampleQuotaLeft(emailKey: string): Promise<number>`
  - `getSampleOrders(): Promise<SampleOrderWithItems[]>` (dla panelu)
  - `getNewSampleOrdersCount(): Promise<number>`
  - `getSampleOrderById(id: string): Promise<SampleOrderWithItems | null>`
  - `setSampleOrderStatus(id: string, status: SampleOrderStatus, tracking?: string): Promise<void>`
  - `cancelSampleOrder(id: string): Promise<void>` — zwalnia pulę
  - `markSampleOrderPaid(id: string, paymentRef: string): Promise<boolean>` — idempotentne, `true` gdy to pierwsze rozliczenie
  - `type SampleOrderWithItems = SampleOrder & { items: SampleOrderItem[] }`
- Produces (akcja): `submitSampleOrder(formData: FormData): Promise<ActionResult>` — w `data` zwraca `{ orderId, redirectUrl }`, gdzie `redirectUrl` jest adresem bramki P24 albo `null` przy zamówieniu darmowym.

- [ ] **Step 1: Napisz `app/_lib/samples.ts`**

```ts
// I/O zamówień próbek. Czysta logika (wycena, klucz puli) siedzi w
// sample-pricing.ts — ten plik tylko rozmawia z bazą.
import "server-only";

import { createAdminClient } from "./supabase/server";
import {
  SAMPLE_UNIT_PRICE,
  SAMPLE_FREE_LIMIT,
  dedupeSelections,
  normalizeEmailKey,
  sampleOrderTotal,
  splitFreePaid,
  type SampleSelection,
} from "./sample-pricing";
import type {
  SampleOrder,
  SampleOrderItem,
  SampleOrderStatus,
} from "./types";

export type SampleOrderWithItems = SampleOrder & { items: SampleOrderItem[] };

export type CreateSampleOrderInput = {
  userId: string;
  email: string;
  name: string;
  phone: string | null;
  address: Record<string, string>;
  selections: SampleSelection[];
};

// Ile darmowych sztuk zostało — do pokazania PRZED wyborem. To odczyt
// poglądowy: rozstrzyga dopiero claim_free_samples przy składaniu zamówienia.
export async function getSampleQuotaLeft(emailKey: string): Promise<number> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_quota")
    .select("used_count, window_start")
    .eq("email_key", emailKey)
    .maybeSingle();

  if (error) {
    console.error("[probki] odczyt puli nieudany:", error.message);
    return 0; // Bezpiecznie w dół: lepiej pokazać mniej gratisów niż obiecać za dużo.
  }
  if (!data) return SAMPLE_FREE_LIMIT;

  const row = data as { used_count: number; window_start: string };
  const windowStart = new Date(row.window_start).getTime();
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  if (windowStart < yearAgo) return SAMPLE_FREE_LIMIT;

  return Math.max(0, SAMPLE_FREE_LIMIT - row.used_count);
}

export async function createSampleOrder(input: CreateSampleOrderInput) {
  const supabase = await createAdminClient();
  const selections = dedupeSelections(input.selections);
  if (selections.length === 0) throw new Error("Nie wybrano żadnej próbki");

  const emailKey = normalizeEmailKey(input.email);

  // REZERWACJA PRZY SKŁADANIU, nie po zapłacie. Inaczej klient złożyłby trzy
  // zamówienia naraz i w każdym dostał trzy gratisy.
  const { data: granted, error: claimError } = await supabase.rpc("claim_free_samples", {
    p_email_key: emailKey,
    p_qty: selections.length,
  });
  if (claimError) throw new Error(`Nie udało się sprawdzić puli: ${claimError.message}`);

  const { free, paid } = splitFreePaid(selections.length, Number(granted ?? 0));
  const amountTotal = sampleOrderTotal(paid);

  const { data: order, error: orderError } = await supabase
    .from("sample_orders")
    .insert({
      user_id: input.userId,
      customer_name: input.name,
      customer_email: input.email,
      customer_phone: input.phone,
      shipping_address: input.address,
      status: "new",
      payment_status: amountTotal > 0 ? "pending" : "none",
      amount_total: amountTotal,
      free_count: free,
      paid_count: paid,
      email_key: emailKey,
    } as never)
    .select("id")
    .single();

  if (orderError || !order) {
    // Zamówienie nie powstało — oddaj zarezerwowane miejsca, inaczej klient
    // straciłby gratisy za nic.
    await supabase.rpc("release_free_samples", { p_email_key: emailKey, p_qty: free });
    throw new Error(`Nie udało się zapisać zamówienia: ${orderError?.message ?? "brak danych"}`);
  }

  const orderId = (order as { id: string }).id;
  const items = selections.map((s, index) => ({
    sample_order_id: orderId,
    fabric_id: s.fabricId,
    color: s.color,
    fabric_name: s.fabricName,
    is_free: index < free,
    unit_price: index < free ? 0 : SAMPLE_UNIT_PRICE,
  }));

  const { error: itemsError } = await supabase.from("sample_order_items").insert(items as never);
  if (itemsError) {
    await supabase.from("sample_orders").delete().eq("id", orderId);
    await supabase.rpc("release_free_samples", { p_email_key: emailKey, p_qty: free });
    throw new Error(`Nie udało się zapisać pozycji: ${itemsError.message}`);
  }

  return { orderId, amountTotal, freeCount: free, paidCount: paid };
}

export async function getSampleOrders(): Promise<SampleOrderWithItems[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .select("*, items:sample_order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    // Nie połykamy po cichu: pusta lista w panelu wygląda jak "brak zamówień",
    // czyli kłamie dokładnie wtedy, gdy coś jest zepsute.
    console.error("[probki] odczyt zamowien nieudany:", error.message);
    return [];
  }
  return (data ?? []) as SampleOrderWithItems[];
}

export async function getSampleOrderById(id: string): Promise<SampleOrderWithItems | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .select("*, items:sample_order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[probki] odczyt zamowienia nieudany:", error.message);
    return null;
  }
  return (data as SampleOrderWithItems) ?? null;
}

// Licznik przy pozycji w nawigacji = "ile czeka na spakowanie". Nieopłacone
// świadomie NIE liczą się: właścicielka nie ma się nimi zajmować, dopóki
// klient nie zapłaci, a badge ma znaczyć pracę do zrobienia.
export async function getNewSampleOrdersCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count, error } = await supabase
    .from("sample_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .neq("payment_status", "pending");
  if (error) {
    console.error("[probki] licznik nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function setSampleOrderStatus(
  id: string,
  status: SampleOrderStatus,
  tracking?: string
): Promise<void> {
  const supabase = await createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "sent") {
    patch.sent_at = new Date().toISOString();
    if (tracking !== undefined) patch.tracking = tracking;
  }
  const { error } = await supabase.from("sample_orders").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cancelSampleOrder(id: string): Promise<void> {
  const supabase = await createAdminClient();
  const order = await getSampleOrderById(id);
  if (!order) throw new Error("Zamówienie nie istnieje");

  const { error } = await supabase
    .from("sample_orders")
    .update({ status: "cancelled" } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Zwrot darmowych miejsc — bez tego porzucone zamówienie blokuje pulę na rok.
  if (order.free_count > 0) {
    await supabase.rpc("release_free_samples", {
      p_email_key: order.email_key,
      p_qty: order.free_count,
    });
  }
}

// Idempotentne rozliczenie: powtórzona notyfikacja P24 nie może zapłacić dwa razy.
// Zwraca true tylko przy PIERWSZYM przejściu w stan opłacony — na tej podstawie
// wysyłamy maila.
export async function markSampleOrderPaid(id: string, paymentRef: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .update({ payment_status: "paid", payment_ref: paymentRef } as never)
    .eq("id", id)
    .neq("payment_status", "paid")
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
```

- [ ] **Step 2: Napisz akcję składającą zamówienie**

Utwórz `app/probki/actions.ts`:

```ts
"use server";

// ⚠️ W pliku z "use server" eksportuj WYŁĄCZNIE async funkcje. `export type`
// wywala się tu pod Turbopackiem runtime'owym ReferenceError.
import { createClient } from "@/app/_lib/supabase/server";
import { createSampleOrder } from "@/app/_lib/samples";
import { registerTransaction, trnRequestUrl } from "@/app/_lib/p24";
import type { SampleSelection } from "@/app/_lib/sample-pricing";
import type { ActionResult } from "@/app/_lib/types";
import { headers } from "next/headers";

export async function submitSampleOrder(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Bramka logowania jest też tutaj, nie tylko w UI: akcję da się wywołać
  // bezpośrednio, a darmowa pula bez tożsamości jest nieograniczona.
  if (!user?.email) {
    return { ok: false, error: "Zamawianie próbek wymaga zalogowania" };
  }

  let selections: SampleSelection[];
  try {
    selections = JSON.parse(String(formData.get("selections") ?? "[]")) as SampleSelection[];
  } catch {
    return { ok: false, error: "Nieprawidłowy wybór próbek" };
  }
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: "Wybierz przynajmniej jedną próbkę" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const street = String(formData.get("street") ?? "").trim();
  const postal = String(formData.get("postal_code") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!name || !street || !postal || !city) {
    return { ok: false, error: "Uzupełnij imię, nazwisko i adres" };
  }

  let created: Awaited<ReturnType<typeof createSampleOrder>>;
  try {
    created = await createSampleOrder({
      userId: user.id,
      email: user.email,
      name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: { street, postal_code: postal, city },
      selections,
    });
  } catch (err) {
    console.error("[probki] tworzenie zamowienia nieudane:", err);
    return { ok: false, error: "Nie udało się złożyć zamówienia. Spróbuj ponownie." };
  }

  // Zamówienie darmowe kończy się tutaj — bramka płatności się nie pojawia.
  if (created.amountTotal <= 0) {
    return { ok: true, data: { orderId: created.orderId, redirectUrl: null } };
  }

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.mollien.pl";

  try {
    const token = await registerTransaction({
      sessionId: created.orderId,
      amount: Math.round(created.amountTotal * 100), // grosze
      currency: "PLN",
      description: `Próbki tkanin (${created.paidCount} szt.)`,
      email: user.email,
      country: "PL",
      language: "pl",
      urlReturn: `${origin}/probki/sukces?zamowienie=${created.orderId}`,
      // ⚠️ OSOBNY endpoint. /api/p24/status zakłada sessionId == orders.id
      // i zgubiłby tę płatność, logując "zamówienie nie istnieje".
      urlStatus: `${origin}/api/p24/probki-status`,
    });
    return { ok: true, data: { orderId: created.orderId, redirectUrl: trnRequestUrl(token) } };
  } catch (err) {
    console.error("[probki] rejestracja P24 nieudana:", err);
    return {
      ok: false,
      error: "Zamówienie zapisane, ale nie udało się otworzyć płatności. Skontaktuj się z nami.",
    };
  }
}
```

- [ ] **Step 3: Sprawdź bramki**

Run: `npx tsc --noEmit && npm test`
Expected: 0 błędów, testy zielone.

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/_lib/samples.ts sklep-meblowy/app/probki/actions.ts
git commit -m "feat(probki): warstwa danych i akcja skladajaca zamowienie probek"
```

---

### Task 4: Strona `/probki` i bramka logowania

**Files:**
- Create: `app/probki/page.tsx`
- Create: `app/probki/SampleForm.tsx`
- Modify: `app/logowanie/page.tsx` (obsługa `?next=`)

**Interfaces:**
- Consumes: `submitSampleOrder` (Task 3), `getSampleQuotaLeft` (Task 3), `SAMPLE_FREE_LIMIT`, `SAMPLE_UNIT_PRICE`, `splitFreePaid`, `sampleOrderTotal`, `type SampleSelection` (Task 2), `getAllFabrics` (`app/_lib/fabrics.ts`).
- Produces: trasa `/probki` przyjmująca `?tkanina=<slug>` (preselekcja) oraz `/logowanie?next=<ścieżka>`.

- [ ] **Step 1: Dodaj obsługę `?next=` na stronie logowania**

W `app/logowanie/page.tsx` linia 22 wygląda dziś tak:

```tsx
  if (user) redirect(isAdmin(user) ? "/admin" : localizePath("/konto", de ? "de" : "pl"));
```

Zamień na:

```tsx
  // `next` pozwala wrócić tam, skąd klient przyszedł (np. /probki?tkanina=...).
  // Bez tego zalogowany trafiający tu z bramki próbek lądował na /konto i tracił
  // wybraną tkaninę — czyli dokładnie w miejscu, gdzie gubi się leady.
  // Tylko ścieżki względne: "//zly.host" i "https://…" są odrzucane.
  const rawNext = String((await searchParams)?.next ?? "");
  const safeNext = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  if (user) {
    redirect(safeNext ?? (isAdmin(user) ? "/admin" : localizePath("/konto", de ? "de" : "pl")));
  }
```

⚠️ Jeśli `page.tsx` nie przyjmuje jeszcze `searchParams`, dopisz je do sygnatury — w Next 16 to **Promise**:

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
```

Formularz logowania musi też przekazać `next` dalej po zalogowaniu — sprawdź `app/logowanie/LoginForm.tsx` i przekaż wartość do `redirectTo`/`router.push`, jeśli komponent sam decyduje, dokąd wraca.

- [ ] **Step 2: Napisz stronę serwerową**

Utwórz `app/probki/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getSampleQuotaLeft } from "@/app/_lib/samples";
import { normalizeEmailKey } from "@/app/_lib/sample-pricing";
import SampleForm from "./SampleForm";

export const metadata: Metadata = {
  title: "Zamów próbki tkanin",
  description: "Pierwsze 3 próbki gratis, dostawa zawsze darmowa.",
};

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ tkanina?: string }>;
}) {
  const { tkanina } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    const back = tkanina ? `/probki?tkanina=${encodeURIComponent(tkanina)}` : "/probki";
    redirect(`/logowanie?next=${encodeURIComponent(back)}`);
  }

  const [fabrics, groups, quotaLeft] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    getSampleQuotaLeft(normalizeEmailKey(user.email)),
  ]);

  // Prefill adresu: profil, a gdy pusty — ostatnie zamówienie mebli.
  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, address")
    .eq("id", user.id)
    .maybeSingle();
  const { data: lastOrder } = await admin
    .from("orders")
    .select("shipping_address")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prof = (profile ?? null) as { full_name: string | null; address: Record<string, string> | null } | null;
  const last = (lastOrder ?? null) as { shipping_address: Record<string, string> | null } | null;
  const address = prof?.address ?? last?.shipping_address ?? {};

  return (
    <SampleForm
      fabrics={fabrics}
      groups={groups}
      quotaLeft={quotaLeft}
      preselectedSlug={tkanina ?? null}
      defaultName={prof?.full_name ?? ""}
      defaultAddress={{
        street: address.street ?? "",
        postal_code: address.postal_code ?? "",
        city: address.city ?? "",
      }}
    />
  );
}
```

- [ ] **Step 3: Napisz komponent kliencki**

Utwórz `app/probki/SampleForm.tsx` — komponent `"use client"`. Wymagania, wszystkie obowiązkowe:

1. **Wzornik**: dla każdej tkaniny wypisz jej kolory (`fabric.colors`), każdy jako klikalny kafelek ze zdjęciem z `fabric.color_images[color]` (brak zdjęcia → sam numer na tle). Tkaniny pogrupowane po `group_id` (nazwy grup z propa `groups`). Nad listą pole wyszukiwania filtrujące po nazwie tkaniny funkcją `searchMatches` z `@/app/_lib/search-normalize` — ten sam mechanizm, co reszta wyszukiwarek w sklepie.
2. **Stan wyboru**: `useState<SampleSelection[]>`, klik przełącza kolor. Preselekcja: jeśli `preselectedSlug` pasuje do `fabric.slug`, zaznacz pierwszy kolor tej tkaniny przy montowaniu.
3. **Pasek podsumowania przyklejony u dołu** (`sticky bottom-0 z-40`), pokazujący w czasie rzeczywistym:
   `Wybrano {n} — {free} gratis + {paid} × 15 zł = {total} zł · dostawa 0 zł`,
   liczone przez `splitFreePaid(n, quotaLeft)` i `sampleOrderTotal(paid)`.
4. **Stan puli nad listą** — zawsze widoczny, także przy pustym wyborze:
   `Masz jeszcze {quotaLeft} z 3 darmowych próbek (pula odnawia się 12 miesięcy od pierwszego zamówienia)`.
   ⚠️ To musi być widoczne PRZED wyborem, inaczej klient z wyczerpaną pulą zaznaczy trzy próbki w przekonaniu, że są gratis.
5. **Formularz**: imię i nazwisko (`name`), ulica (`street`), kod (`postal_code`), miasto (`city`), telefon opcjonalny (`phone`) — wypełnione z propsów, edytowalne. Bez wyboru sposobu dostawy.
6. **Wysyłka**: `onSubmit` z `useTransition`, `formData.set("selections", JSON.stringify(selections))`, wywołanie `submitSampleOrder`. Przy `res.ok` i `data.redirectUrl` → `window.location.href = redirectUrl`; przy `res.ok` bez `redirectUrl` → `router.push('/probki/sukces?zamowienie=' + data.orderId)`. Przy błędzie — komunikat nad przyciskiem.
   ⚠️ Użyj `onSubmit`, **nie** `<form action={...}>`: React 19 po akcji w `action=` automatycznie resetuje formularz, co w tym projekcie wywołało już jednego produkcyjnego buga.
7. Przycisk nieaktywny, gdy wybór jest pusty albo trwa wysyłka.

- [ ] **Step 4: Sprawdź bramki**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 0 błędów, testy zielone, build przechodzi.

- [ ] **Step 5: Sprawdź ręcznie bramkę logowania**

Run: `npm run dev`, otwórz w trybie incognito `http://localhost:3000/probki?tkanina=<dowolny-slug-tkaniny>`
Expected: przekierowanie na `/logowanie?next=%2Fprobki%3Ftkanina%3D...`, a po zalogowaniu powrót na `/probki` z zaznaczonym kolorem tej tkaniny.

⚠️ Nie składaj zamówienia — to produkcyjna baza.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/probki/ sklep-meblowy/app/logowanie/page.tsx
git commit -m "feat(probki): strona zamawiania probek i powrot po logowaniu"
```

---

### Task 5: Płatność P24 i strona powrotu

**Files:**
- Create: `app/api/p24/probki-status/route.ts`
- Create: `app/probki/sukces/page.tsx`
- Modify: `scripts/p24-smoke.*` (dołożenie drugiego adresu notyfikacji — znajdź plik przez `grep -rn "p24:smoke" package.json`)

**Interfaces:**
- Consumes: `markSampleOrderPaid`, `getSampleOrderById` (Task 3); `verifyTransaction` i walidację podpisu z `app/_lib/p24.ts` / `app/_lib/p24-events.ts`.
- Produces: trasa `POST /api/p24/probki-status`, trasa `/probki/sukces?zamowienie=<id>`.

- [ ] **Step 1: Przeczytaj istniejący handler notyfikacji**

Run: `cat app/api/p24/status/route.ts`
Cel: skopiuj **kolejność kroków** (walidacja podpisu → sprawdzenie kwoty i waluty → `verify` → oznaczenie opłaconego → idempotencja) i te same komunikaty logów. Nie zmieniaj tamtego pliku.

- [ ] **Step 2: Napisz handler dla próbek**

Utwórz `app/api/p24/probki-status/route.ts`. Wymagania:

1. Walidacja podpisu notyfikacji tym samym helperem, co `/api/p24/status`.
2. `sessionId` to **`sample_orders.id`** — pobierz zamówienie przez `getSampleOrderById`. Gdy nie istnieje: `console.error("P24 probki: zamowienie ... nie istnieje")` i odpowiedź `200` (P24 nie ma czego ponawiać).
3. Porównaj kwotę i walutę z `amount_total` (w groszach) — niezgodność: log i **brak** rozliczenia.
4. `verifyTransaction` z tymi samymi parametrami co przy meblach.
5. `markSampleOrderPaid(id, ref)` — gdy zwróci `true`, to pierwsze rozliczenie (tu w Tasku 7 wejdzie mail).
6. Podrobiony podpis → `400`.

- [ ] **Step 3: Napisz stronę powrotu**

Utwórz `app/probki/sukces/page.tsx` — Server Component, który czyta `?zamowienie=<id>`, pobiera zamówienie przez `getSampleOrderById` i renderuje:

- gdy `payment_status === "none"` lub `"paid"` → „Dziękujemy, zamówienie przyjęte", lista zamówionych kolorów, informacja, że próbki wyślemy w ciągu kilku dni roboczych;
- gdy `payment_status === "pending"` → „Czekamy na potwierdzenie płatności" z prośbą o odświeżenie za chwilę.

⚠️ Strona **nie ufa powrotowi z bramki** — czyta wyłącznie stan z bazy. P24 potrafi odesłać klienta zanim dojdzie notyfikacja.

⚠️ Gdy zamówienie nie należy do zalogowanego użytkownika — pokaż komunikat ogólny, nie dane cudzego zamówienia.

- [ ] **Step 4: Dołóż adres do skryptu smoke**

W skrypcie obsługującym `npm run p24:smoke` dopisz sprawdzenie, że `POST /api/p24/probki-status` **nie** zwraca 200 z HTML-em.

⚠️ Powód: POST na nieistniejącą ścieżkę pod `/api/` zwraca w tym frameworku 200 z HTML-em, więc literówka w `urlStatus` daje **cichą** awarię — P24 uzna notyfikację za dostarczoną i nigdy jej nie ponowi.

- [ ] **Step 5: Bramki i commit**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: wszystko zielone.

```bash
git add sklep-meblowy/app/api/p24/probki-status/ sklep-meblowy/app/probki/sukces/ sklep-meblowy/scripts/
git commit -m "feat(probki): platnosc P24 dla probek i strona powrotu"
```

---

### Task 6: Panel właścicielki

**Files:**
- Create: `app/admin/probki/page.tsx`, `app/admin/probki/SampleOrdersList.tsx`, `app/admin/probki/actions.ts`
- Modify: `app/admin/AdminShell.tsx` (pozycja nawigacji, linia 24; `navBadge`, linie 30-41)

**Interfaces:**
- Consumes: `getSampleOrders`, `getNewSampleOrdersCount`, `setSampleOrderStatus`, `cancelSampleOrder` (Task 3); `getFabricImageMap` (`app/_lib/fabrics.ts`) do miniatur.
- Produces: `markSamplePacked(formData): Promise<ActionResult>`, `markSampleSent(formData): Promise<ActionResult>`, `cancelSample(formData): Promise<ActionResult>`.

- [ ] **Step 1: Napisz akcje panelu**

Utwórz `app/admin/probki/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { cancelSampleOrder, setSampleOrderStatus } from "@/app/_lib/samples";
import type { ActionResult } from "@/app/_lib/types";

export async function markSamplePacked(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };
  try {
    await setSampleOrderStatus(id, "packed");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się zapisać" };
  }
  revalidatePath("/admin/probki");
  return { ok: true, message: "Oznaczono jako spakowane" };
}

export async function markSampleSent(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const tracking = String(formData.get("tracking") ?? "").trim();
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };
  try {
    await setSampleOrderStatus(id, "sent", tracking);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się zapisać" };
  }
  revalidatePath("/admin/probki");
  return { ok: true, message: "Oznaczono jako wysłane" };
}

export async function cancelSample(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak identyfikatora zamówienia" };
  try {
    await cancelSampleOrder(id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Nie udało się anulować" };
  }
  revalidatePath("/admin/probki");
  return { ok: true, message: "Zamówienie anulowane, darmowe próbki wróciły do puli klienta" };
}
```

- [ ] **Step 2: Napisz stronę i listę**

`app/admin/probki/page.tsx` — Server Component z `await requireAdmin()`, pobiera `getSampleOrders()` oraz `getFabricImageMap()` i przekazuje do `SampleOrdersList`.

`app/admin/probki/SampleOrdersList.tsx` — komponent kliencki, wzorowany na `app/admin/zapytania/InquiriesList.tsx`. Wymagania:

1. **Trzy grupy**, w tej kolejności: „Do spakowania" (`status === "new"` i `payment_status !== "pending"`), „Nieopłacone" (`payment_status === "pending"`), „Wysłane" (`status === "sent"`). Zamówienia `cancelled` w osobnej, zwiniętej sekcji na dole.
2. Na karcie: data, imię i nazwisko, e-mail, telefon, **adres z przyciskiem „Kopiuj"**, kwota i stan płatności.
3. **Lista kolorów z miniaturami** — dla każdej pozycji miniatura z mapy zdjęć wzornika, pod nią `fabric_name` i numer koloru, oraz znacznik `gratis` albo `15 zł`.
   ⚠️ Sama nazwa („Riviera 16") nic nie mówi przy dwudziestu tkaninach — właścicielka wycina konkretny kolor i musi go zobaczyć.
4. Akcje: „Spakowane", „Wysłane" (z polem na numer nadania), „Anuluj" (z potwierdzeniem przez `useConfirm` z `@/app/_context/ConfirmContext`).
5. Przy „Anuluj" dla zamówienia z `payment_status === "paid"` pokaż ostrzeżenie:
   **„Anulowanie NIE zwraca pieniędzy — zwrot trzeba zrobić ręcznie w panelu Przelewy24."**
6. Toasty przez `ToastView` z `@/app/admin/_shared`, `useTransition` na akcjach.

- [ ] **Step 3: Dodaj pozycję w nawigacji panelu**

W `app/admin/AdminShell.tsx` po linii z `/admin/zapytania` dopisz pozycję `{ href: "/admin/probki", label: "Próbki", icon: <wybrana ikona z tego pliku> }`, a w `navBadge` (linie 30-41) dopisz trzeci licznik:

```tsx
function navBadge(
  href: string,
  counts: { newIssues: number; newOrders: number; newSamples: number }
): { count: number; label: string } | null {
  if (href === "/admin/reklamacje" && counts.newIssues > 0) {
    return { count: counts.newIssues, label: "nowe zgłoszenia" };
  }
  if (href === "/admin/zamowienia" && counts.newOrders > 0) {
    return { count: counts.newOrders, label: "nowe zamówienia" };
  }
  if (href === "/admin/probki" && counts.newSamples > 0) {
    return { count: counts.newSamples, label: "nowe zamówienia próbek" };
  }
  return null;
}
```

Znajdź miejsce, w którym `AdminShell` dostaje `newIssues`/`newOrders`, i dołóż tam `newSamples` z `getNewSampleOrdersCount()`.

- [ ] **Step 4: Bramki i commit**

Run: `npx tsc --noEmit && npm test && npm run build && npx eslint app/admin/probki`
Expected: wszystko czyste.

```bash
git add sklep-meblowy/app/admin/probki/ sklep-meblowy/app/admin/AdminShell.tsx
git commit -m "feat(admin): sekcja Probki - trzy grupy, miniatury kolorow i akcje wysylki"
```

---

### Task 7: Maile

**Files:**
- Create: `app/_lib/mail/templates/AdminNewSampleOrder.tsx`, `app/_lib/mail/templates/SampleOrderConfirmation.tsx`, `app/_lib/mail/templates/SampleOrderSent.tsx`
- Create: `app/_lib/mail/sample-notify.ts`
- Modify: `app/probki/actions.ts` (mail po złożeniu darmowego zamówienia), `app/api/p24/probki-status/route.ts` (mail po opłaceniu), `app/admin/probki/actions.ts` (mail przy „Wysłane")

**Interfaces:**
- Consumes: `sendMail` z `app/_lib/mail/send.ts` (`sendMail(payload): Promise<boolean>`), układ `templates/_Layout.tsx`, `SampleOrderWithItems` (Task 3).
- Produces: `notifyAdminNewSampleOrder(order)`, `notifyCustomerSampleOrder(order)`, `notifyCustomerSampleSent(order)` — wszystkie `Promise<void>`, żadna nie rzuca.

- [ ] **Step 1: Przeczytaj istniejące szablony**

Run: `cat app/_lib/mail/templates/AdminNewOrder.tsx app/_lib/mail/templates/OrderShipped.tsx`
Cel: te same komponenty układu, ten sam styl, ta sama stopka z brandingiem.

- [ ] **Step 2: Napisz trzy szablony**

- `AdminNewSampleOrder` — do właścicielki: lista kolorów (nazwa + numer), adres, kwota, informacja „opłacone / darmowe".
- `SampleOrderConfirmation` — do klienta: co zamówił, że dostawa jest darmowa, że wyślemy w ciągu kilku dni.
- `SampleOrderSent` — do klienta: „próbki wysłane" + numer nadania, gdy jest.

- [ ] **Step 3: Napisz moduł wysyłki**

Utwórz `app/_lib/mail/sample-notify.ts`:

```ts
// ⚠️ ŚWIADOME odstępstwo od reguły "mailujemy tylko przy shipped/cancelled"
// (NOTIFY_STATUSES w status-notify.ts). Tamta reguła dotyczy zamówień MEBLI
// i ich maszyny stanów. Próbki mają własną: darmowe zamówienie nie ma nawet
// potwierdzenia płatności, które mogłoby zastąpić potwierdzenie przyjęcia.
// To nie jest regres czystki mailowej.
import "server-only";
```

Każda funkcja: buduje payload, woła `sendMail`, łapie i loguje błąd. **Żadna nie rzuca** — padnięcie Resenda nie może zabrać klientowi paczki (`sendMail` sam też nie rzuca, tylko loguje).

- [ ] **Step 4: Wepnij maile w trzy miejsca**

1. `app/probki/actions.ts` — po utworzeniu zamówienia **darmowego** (`amountTotal <= 0`): `notifyAdminNewSampleOrder` + `notifyCustomerSampleOrder`.
2. `app/api/p24/probki-status/route.ts` — gdy `markSampleOrderPaid` zwróci `true`: `notifyAdminNewSampleOrder` + `notifyCustomerSampleOrder`.
   ⚠️ Przy zamówieniu płatnym potwierdzenie idzie **dopiero po zapłacie** — nie potwierdzamy zamówienia, które nie doszło do skutku.
3. `app/admin/probki/actions.ts` — w `markSampleSent`, po udanym zapisie: `notifyCustomerSampleSent`.

- [ ] **Step 5: Podejrzyj szablony lokalnie**

Run: `npm run preview:mail` (jeśli skrypt obsługuje wybór szablonu — dodaj do niego nowe trzy)
Expected: trzy nowe maile renderują się z poprawnymi danymi testowymi.

- [ ] **Step 6: Bramki i commit**

Run: `npx tsc --noEmit && npm test && npm run build`

```bash
git add sklep-meblowy/app/_lib/mail/ sklep-meblowy/app/probki/actions.ts sklep-meblowy/app/api/p24/probki-status/ sklep-meblowy/app/admin/probki/actions.ts
git commit -m "feat(probki): trzy maile - powiadomienie wlascicielki, potwierdzenie i wysylka"
```

---

### Task 8: Guard e2e i domknięcie

**Files:**
- Create: `e2e/samples.spec.ts`

**Interfaces:**
- Consumes: trasy `/probki` i `/logowanie` (Task 4).
- Produces: nic (test).

- [ ] **Step 1: Napisz test**

Utwórz `e2e/samples.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Guard bramki logowania na zamawianiu probek (spec 2026-08-01).
// Darmowa pula bez tozsamosci jest nieograniczona, wiec /probki MUSI odsylac
// niezalogowanego na logowanie — i MUSI zachowac wybrana tkanine, bo to
// miejsce, w ktorym gubi sie leady.
//
// URUCHAMIANIE: E2E_BASE_URL na localhost + --no-deps. Bez E2E_BASE_URL
// playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mollien.cookie-consent",
      JSON.stringify({ analytics: false, marketing: false, ts: Date.now(), version: 1 })
    );
  });
});

test("niezalogowany trafia na logowanie z zachowana tkanina", async ({ page }) => {
  await page.goto("/probki?tkanina=testowa-tkanina");

  await expect(page).toHaveURL(/\/logowanie/);
  const url = new URL(page.url());
  const next = url.searchParams.get("next");
  expect(next).toBeTruthy();
  expect(next).toContain("/probki");
  expect(next).toContain("tkanina=testowa-tkanina");
});

test("goly adres /probki tez odsyla na logowanie", async ({ page }) => {
  await page.goto("/probki");
  await expect(page).toHaveURL(/\/logowanie/);
});
```

⚠️ Payload zgody cookie **musi** mieć `version: 1` — `CookieBanner.getConsent()` odrzuca wpis bez tego pola i baner mimo wszystko się wyrenderuje, przechwytując kliknięcia.

- [ ] **Step 2: Uruchom test**

Run (dwa okna): `npm run dev`, potem
`E2E_BASE_URL=http://localhost:3000 npx playwright test samples --no-deps`
Expected: 2 passed.

- [ ] **Step 3: Bramki końcowe**

Run: `npx tsc --noEmit && npm test && npm run build && npm run lint`
Expected: 0 błędów, testy zielone, build przechodzi.

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/e2e/samples.spec.ts
git commit -m "test(e2e): guard bramki logowania na zamawianiu probek"
```

- [ ] **Step 5: Lista klik-testów dla właściciela**

Wypisz w opisie PR (nie w kodzie) scenariusze do sprawdzenia na żywo, bo panel próbek nie ma testów automatycznych:

1. Niezalogowany klika „Zamów próbkę" na `/tkaniny/[slug]` → logowanie Google → wraca z zaznaczonym kolorem.
2. Wybór 3 kolorów → podsumowanie pokazuje „0 zł" → zamówienie idzie bez bramki płatności → mail potwierdzający dochodzi.
3. Wybór 5 kolorów → podsumowanie „3 gratis + 2 × 15 zł = 30 zł" → płatność w P24 → status w panelu „opłacone", mail dochodzi.
4. Drugie zamówienie tego samego klienta → pula pokazuje 0 gratisów, wszystko płatne.
5. Konto na aliasie `imie+1@gmail.com` → pula **nie** odnawia się.
6. Panel: „Wysłane" z numerem nadania → klient dostaje maila z trackingiem.
7. Panel: „Anuluj" nieopłaconego zamówienia → darmowe sztuki wracają do puli klienta.
8. Panel: „Anuluj" opłaconego → widoczne ostrzeżenie, że zwrot pieniędzy trzeba zrobić ręcznie w P24.
9. Baner „TKANINY / Zamów darmowe próbki" na home → Ola przepina przycisk na `/probki` i poprawia treść na „Pierwsze 3 próbki gratis".

⚠️ Zamówienia testowe skasować z bazy po klik-testach — to produkcyjny Supabase.

---

## Self-review planu

**Pokrycie speca:**

| Wymaganie ze speca | Task |
|---|---|
| 3 gratis, okno 12 miesięcy, 15 zł za kolejne | 1 (RPC), 2 (wycena) |
| Dostawa zawsze darmowa | 2 (`sampleOrderTotal` nie dolicza wysyłki), 4 (UI) |
| Konto wymagane | 3 (guard w akcji), 4 (redirect + `?next=`), 8 (guard e2e) |
| Jednostka = kolor tkaniny | 1 (`color` w pozycjach), 2 (`SampleSelection`), 4 (wzornik), 6 (miniatury) |
| Brak stanu magazynowego, każda tkanina dostępna | 4 (lista z `getAllFabrics`, bez filtrów dostępności) |
| Brak limitu sztuk | 2, 4 (nigdzie nie ma górnego ograniczenia) |
| Klucz puli = znormalizowany e-mail | 2 (`normalizeEmailKey`), 1 (`sample_quota.email_key`) |
| Twardy limit, odporny na wyścig | 1 (`for update` + `RETURNING`) |
| Rezerwacja przy składaniu, zwrot przy anulowaniu | 3 (`createSampleOrder`, `cancelSampleOrder`) |
| Dwie osie stanu (realizacja / płatność) | 1 (dwie kolumny), 6 (trzy grupy w panelu) |
| Płatność tylko P24 | 3 (akcja), 5 (endpoint) |
| Osobny endpoint notyfikacji | 5 |
| Strona powrotu nie ufa bramce | 5 |
| Wejścia: baner home, `/tkaniny`, `/tkaniny/[slug]` | 4 (`?tkanina=`), 8 krok 5 (baner — zmiana treści przez Olę) |
| Panel: trzy grupy, miniatury, akcje | 6 |
| Trzy maile | 7 |
| Ostrzeżenie o braku automatycznego zwrotu | 6 |
| Guard e2e | 8 |

**Luka świadoma:** przyciski „Zamów próbkę" na `/tkaniny` i `/tkaniny/[slug]` to jedna linia linku każdy — wchodzą w Tasku 4 razem ze stroną, bez osobnego kroku.

**Placeholdery:** brak „TBD"/„TODO". Miejsca opisowe zamiast kodu (Task 4 krok 3, Task 5 krok 2, Task 6 krok 2, Task 7 krok 2) to komponenty UI i szablony maili — mają wyliczone twarde wymagania i wskazany plik do skopiowania wzorca, bo przepisywanie 300 linii JSX-a do planu dałoby kod gorszy niż ten, który powstanie z odczytania sąsiada.

**Spójność typów:** `SampleSelection` (Task 2) jest konsumowany w Tasku 3 (`CreateSampleOrderInput.selections`) i Tasku 4 (stan komponentu) pod tą samą nazwą. `SampleOrderWithItems` (Task 3) jest używany w Taskach 5, 6 i 7. `claim_free_samples` zwraca `int` i tak jest odczytywany (`Number(granted ?? 0)`). `navBadge` dostaje trzeci licznik w tym samym kształcie co dwa istniejące.
