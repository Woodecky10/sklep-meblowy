# Ceny w EUR na wersji /de — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient na `/de` widzi ceny w EUR i faktycznie płaci w EUR; kurs PLN→EUR jest stały i edytowalny w `/admin` bez deploya.

**Architecture:** Jedno źródło prawdy = ceny w PLN (DB + koszyk zustand). Przeliczenie na EUR tylko w 2 miejscach: przy *formatowaniu do wyświetlenia* (`formatMoney`) i w *checkoutcie* (kwota pobrania). Każde zamówienie zapisuje walutę + użyty kurs (snapshot). Kwoty zamówień formatowane wg `order.currency`, nie wg locale przeglądającego.

**Tech Stack:** Next.js 16.2.4 (App Router, Server Actions), React 19.2.4, TypeScript, Vitest (node env), Tailwind v4, Supabase, Stripe.

**Spec:** `docs/superpowers/specs/2026-06-23-ceny-eur-de-design.md`

## Global Constraints

- **Konwersja:** `eur(pln, rate) = Math.ceil(pln * rate)` — pełne euro, w górę. `rate` = ile € za 1 zł (np. 0.23). Jedna globalna wartość.
- **Format:** `/de` → EUR (`"506 €"`, grupowanie de-DE), `/` → PLN (`"2 199 zł"`, bez zmian). Brak osobnego przełącznika walut — waluta związana z locale.
- **PL bez zmian:** ścieżka polska (`/`) renderuje i pobiera w PLN dokładnie jak dziś.
- **Panel admina PL-only** (bez i18n stringów UI); komentarze po polsku.
- **Kwoty zamówień** formatowane wg `order.currency` (nie wg locale przeglądającego) — zamówienie EUR pokazuje EUR także adminowi i na `/`.
- **BaseLinker — POZA ZAKRESEM (twardy warunek wstępny):** push BL (`pushOrderToBaseLinker`: cron `reconcile-bl` + route `push-order`) wysyła `price_brutto` jako PLN. **Push BL MUSI zostać wyłączony osobno PRZED wdrożeniem EUR na produkcję** (decyzja właściciela). Ten plan NIE dotyka kodu BL. Jeśli push BL nadal działałby przy wdrożeniu — zamówienia EUR poleciałyby do BL jako PLN (kwota OK liczbowo, ale waluta błędna).
- **Migracje uruchamia człowiek** w Supabase SQL Editorze (agent nie ma DDL). Wspólna baza — migracja 33 raz, z dowolnego miejsca. **Przed startem /de właścicielka ustawia realny kurs w `/admin/ustawienia`.**
- **Testy = czyste funkcje, środowisko node** (`vitest.config.mts`: `environment: "node"`, `include: app/**/__tests__/**/*.test.ts`). Komponentów React / akcji DB NIE testujemy jednostkowo — weryfikacja `npx tsc --noEmit` + `npm run lint` + `npm run build` + ręczny smoke.
- **Bramki uruchamiać z katalogu `sklep-meblowy/`** (appka w podfolderze). Manager paczek: npm. Praca na branchu `feat/ceny-eur-de` (spec już scommitowany, main wmergowany). Push/PR = osobno, za zgodą (konto Woodecky10).
- **Server actions:** `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult`, updaty castowane `as never`.

## File Structure

- **Create** `app/_lib/money.ts` — czyste helpery: `convertToEur`, `formatEur`, `formatMoney`, `formatOrderAmount`. Bez React/DB → node-test.
- **Create** `app/_lib/__tests__/money.test.ts` — testy powyższych.
- **Create** `supabase/migrations/33_eur_pricing.sql` — tabela `store_settings` (kurs) + kolumny `orders.currency`/`orders.fx_rate`.
- **Modify** `app/_lib/types.ts` — dodać `currency`/`fx_rate` do interfejsu `Order`.
- **Create** `app/_lib/store-settings.ts` — `getEurRate()` (server, cache per-request).
- **Create** `app/admin/ustawienia/actions.ts` — `updateEurRate(rate)` (server action).
- **Create** `app/_lib/rate-context.tsx` — `RateProvider` + `useEurRate()` (client).
- **Modify** `app/layout.tsx` — seed kursu z serwera do `RateProvider`.
- **Create** `app/admin/ustawienia/page.tsx` + `app/admin/ustawienia/SettingsForm.tsx` — ekran kursu.
- **Modify** `app/admin/page.tsx` — link do `/admin/ustawienia`.
- **Modify** (display storefront, formatMoney): `app/_components/ui/ProductCard.tsx`, `ProductMainSection.tsx`, `RecentlyViewed.tsx`, `app/_components/layout/SearchBox.tsx`, `app/koszyk/page.tsx`, `app/checkout/CheckoutForm.tsx`.
- **Modify** (checkout EUR): `app/api/checkout/route.ts`, `app/_lib/orders.ts`.
- **Modify** (display zamówień wg waluty): `app/checkout/success/page.tsx`, `app/konto/zamowienia/OrdersList.tsx`, `app/konto/zamowienia/[id]/page.tsx`, `app/admin/zamowienia/page.tsx`, `app/admin/zamowienia/[id]/page.tsx`.
- **Modify** (SEO): `app/produkt/[id]/page.tsx` — `priceCurrency` + cena JSON-LD dla /de.

Kolejność wg zależności: fundament (T1 money, T2 schema) → dostęp do kursu (T3 server, T4 client, T5 admin) → wyświetlanie (T6 katalog) → pobranie (T7 checkout) → wyświetlanie zamówień (T8) → SEO (T9) → bramki (T10).

---

### Task 1: Moduł `money` — czyste helpery + testy

Fundament: konwersja i formatowanie. Czyste funkcje, TDD, środowisko node.

**Files:**
- Create: `app/_lib/money.ts`
- Test: `app/_lib/__tests__/money.test.ts`

**Interfaces:**
- Consumes: `formatPrice(amount: number, locale: Locale): string` z `@/app/_lib/format`; typ `Locale` z `@/app/_lib/i18n`.
- Produces:
  - `convertToEur(pln: number, rate: number): number` — `Math.ceil(pln * rate)`.
  - `formatEur(eur: number): string` — `"506 €"` (grupowanie de-DE).
  - `formatMoney(plnAmount: number, locale: Locale, rate: number): string` — katalogowa cena (zawsze w PLN w DB): `de` → `formatEur(convertToEur(...))`, `pl` → `formatPrice(...)`.
  - `formatOrderAmount(amount: number, currency: "pln" | "eur"): string` — kwota zamówienia (już w walucie pobrania): `eur` → `formatEur`, `pln` → `formatPrice(amount, "pl")`.

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/money.test.ts
import { describe, it, expect } from "vitest";
import {
  convertToEur,
  formatEur,
  formatMoney,
  formatOrderAmount,
} from "@/app/_lib/money";

describe("convertToEur — pełne euro w górę", () => {
  it("zaokrągla w górę", () => {
    expect(convertToEur(2199, 0.23)).toBe(506); // 505.77 -> 506
  });
  it("wartość całkowita bez zmian", () => {
    expect(convertToEur(1000, 0.2)).toBe(200); // 200.0 -> 200
  });
  it("ułamek > 0 zaokrągla w górę", () => {
    expect(convertToEur(101, 0.23)).toBe(24); // 23.23 -> 24
  });
  it("zero -> zero", () => {
    expect(convertToEur(0, 0.23)).toBe(0);
  });
});

describe("formatEur — symbol € + grupowanie de-DE", () => {
  it("setki", () => {
    expect(formatEur(506)).toBe("506 €");
  });
  it("tysiące z separatorem de-DE", () => {
    expect(formatEur(2990)).toBe("2.990 €");
  });
  it("zero", () => {
    expect(formatEur(0)).toBe("0 €");
  });
});

describe("formatMoney — cena katalogowa (PLN w DB)", () => {
  it("de: konwersja + EUR", () => {
    expect(formatMoney(2199, "de", 0.23)).toBe("506 €");
  });
  it("pl: bez konwersji, zł (zachowanie formatPrice)", () => {
    expect(formatMoney(2199, "pl", 0.23)).toBe("2 199 zł");
  });
});

describe("formatOrderAmount — kwota w walucie zamówienia", () => {
  it("eur: kwota już w EUR, bez konwersji", () => {
    expect(formatOrderAmount(506, "eur")).toBe("506 €");
  });
  it("pln: zł, grupowanie pl-PL", () => {
    expect(formatOrderAmount(2199, "pln")).toBe("2 199 zł");
  });
});
```

> Uwaga: test `formatPrice(2199,"pl") === "2 199 zł"` zakłada, że `pl-PL` grupuje spacją (NBSP). `toLocaleString` w Node używa NBSP (` `). Jeśli test stringa nie przejdzie na dosłownej spacji — dopasuj asercję do faktycznego wyjścia `formatPrice` (skopiuj z istniejącego zachowania), NIE zmieniaj `formatPrice`.

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `npx vitest run app/_lib/__tests__/money.test.ts`
Expected: FAIL — brak modułu `@/app/_lib/money`.

- [ ] **Step 3: Implementacja**

```ts
// app/_lib/money.ts
// Warstwa pieniędzy dla /de. Ceny w DB i w koszyku są ZAWSZE w PLN — tu liczymy
// EUR tylko do wyświetlenia i do checkoutu. Konwersja: pełne euro w górę
// (drobny bufor na ryzyko kursowe). Format EUR = grupowanie de-DE + " €".
import { formatPrice } from "./format";
import type { Locale } from "./i18n";

export function convertToEur(pln: number, rate: number): number {
  return Math.ceil(pln * rate);
}

export function formatEur(eur: number): string {
  return `${eur.toLocaleString("de-DE")} €`;
}

// Cena katalogowa (w DB zawsze PLN). /de przelicza i pokazuje EUR; / zostaje PLN.
export function formatMoney(plnAmount: number, locale: Locale, rate: number): string {
  if (locale === "de") return formatEur(convertToEur(plnAmount, rate));
  return formatPrice(plnAmount, locale);
}

// Kwota zamówienia — już zapisana w walucie pobrania, więc TYLKO formatujemy
// (bez ponownej konwersji). Formatujemy wg waluty zamówienia, nie wg locale.
export function formatOrderAmount(amount: number, currency: "pln" | "eur"): string {
  if (currency === "eur") return formatEur(amount);
  return formatPrice(amount, "pl");
}
```

- [ ] **Step 4: Uruchom test — ma PRZECHODZIĆ**

Run: `npx vitest run app/_lib/__tests__/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/money.ts app/_lib/__tests__/money.test.ts
git commit -m "feat(eur): modul money — convertToEur/formatEur/formatMoney/formatOrderAmount + testy"
```

---

### Task 2: Migracja 33 (store_settings + waluta zamówień) + typ `Order`

Schemat: tabela kursu (1 wiersz) z RLS public-read/service-write + kolumny waluty/kursu na `orders`.

**Files:**
- Create: `supabase/migrations/33_eur_pricing.sql`
- Modify: `app/_lib/types.ts` (interfejs `Order` — pole `total` ~linia 165)

**Interfaces:**
- Produces: tabela `public.store_settings(id bool pk, eur_rate numeric>0, updated_at)`; kolumny `orders.currency text default 'pln' check in('pln','eur')`, `orders.fx_rate numeric null`. Typ `Order` zyskuje `currency: "pln" | "eur"` i `fx_rate: number | null`.

- [ ] **Step 1: Utwórz migrację**

```sql
-- supabase/migrations/33_eur_pricing.sql
-- Ceny w EUR na /de: tabela ustawien sklepu (kurs PLN->EUR) + waluta zamowien.

-- ── Ustawienia sklepu (pojedynczy wiersz) ───────────────────────────────────
-- eur_rate = ile EUR za 1 zl (np. 0.23). WARTOSC STARTOWA TYMCZASOWA 0.23 —
-- wlascicielka ustawia realny kurs w /admin/ustawienia PRZED startem /de.
create table if not exists public.store_settings (
  id boolean primary key default true,
  eur_rate numeric not null default 0.23 check (eur_rate > 0),
  updated_at timestamptz not null default now(),
  constraint store_settings_singleton check (id = true)
);

insert into public.store_settings (id, eur_rate)
values (true, 0.23)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

-- Odczyt publiczny — kurs jest potrzebny do renderu cen takze dla anon.
drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings
  for select using (true);

-- Zapis tylko service_role (createAdminClient ma BYPASSRLS). Klient bez write.
revoke insert, update, delete on public.store_settings from anon, authenticated;

-- ── Waluta zamowienia + snapshot kursu ──────────────────────────────────────
-- Wstecznie zgodne: istniejace zamowienia = 'pln', fx_rate NULL.
alter table public.orders
  add column if not exists currency text not null default 'pln'
    check (currency in ('pln','eur')),
  add column if not exists fx_rate numeric;
```

- [ ] **Step 2: Dodaj pola do interfejsu `Order` w `types.ts`**

W `app/_lib/types.ts`, w interfejsie `Order` (przy `total: number;` ~linia 165) dodaj:
```ts
  total: number;
  currency: "pln" | "eur";
  fx_rate: number | null;
```

- [ ] **Step 3: Bramka typów**

Run: `npx tsc --noEmit`
Expected: 0 błędów. (Pola opcjonalne w odczytach pojawią się w kolejnych taskach; sam dodany typ nie psuje istniejących miejsc, bo `Order` budujemy castem `as Order`.)
> Jeśli `tsc` wskaże miejsce, które konstruuje `Order` literałem bez `currency`/`fx_rate` — odłóż jego naprawę do taska, który to miejsce i tak modyfikuje (T7/T8). Jeśli to miejsce nietknięte przez plan — dodaj tam `currency: "pln", fx_rate: null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/33_eur_pricing.sql app/_lib/types.ts
git commit -m "feat(eur): migracja 33 (store_settings + orders.currency/fx_rate) + typ Order"
```

> **DEPLOY (człowiek):** uruchom `33_eur_pricing.sql` w Supabase SQL Editorze. Bez niej `getEurRate`/checkout EUR nie zadziałają w runtime.

---

### Task 3: `getEurRate()` — odczyt kursu po stronie serwera

Server-only helper z cache per-request (React `cache`) + obronny fallback.

**Files:**
- Create: `app/_lib/store-settings.ts`

**Interfaces:**
- Consumes: `createClient` z `@/app/_lib/supabase/server` (klient serwerowy z anon key — `store_settings` ma publiczny SELECT).
- Produces: `getEurRate(): Promise<number>` — kurs z DB; fallback `DEFAULT_EUR_RATE = 0.23` gdy brak/0/błąd. Eksport `DEFAULT_EUR_RATE`.

- [ ] **Step 1: Utwórz moduł**

```ts
// app/_lib/store-settings.ts
import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

// Fallback gdy DB nie zwróci sensownego kursu (np. migracja jeszcze nie odpalona).
// Ta sama wartość co seed migracji 33.
export const DEFAULT_EUR_RATE = 0.23;

// Kurs PLN->EUR (ile € za 1 zł). cache() => jeden odczyt na request, niezależnie
// od liczby komponentów serwerowych, które go wołają.
export const getEurRate = cache(async (): Promise<number> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("store_settings")
      .select("eur_rate")
      .eq("id", true)
      .single();
    const rate = data ? Number((data as { eur_rate: number }).eur_rate) : NaN;
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_RATE;
  } catch {
    return DEFAULT_EUR_RATE;
  }
});
```

- [ ] **Step 2: Bramka typów**

Run: `npx tsc --noEmit`
Expected: 0 błędów.
> Jeśli `createClient` w tym repo nie jest async (`await createClient()` zgłosi błąd) — sprawdź sygnaturę w `app/_lib/supabase/server.ts` i dopasuj (z/bez `await`).

- [ ] **Step 3: Commit**

```bash
git add app/_lib/store-settings.ts
git commit -m "feat(eur): getEurRate() — serwerowy odczyt kursu z cache + fallback"
```

---

### Task 4: `RateProvider` + `useEurRate()` + seed w layout

Kurs trafia do komponentów klienckich kontekstem (analogia jak Cart/Theme/Toast), seedowany raz w root layout z serwera.

**Files:**
- Create: `app/_lib/rate-context.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `getEurRate()` (T3), `DEFAULT_EUR_RATE` (T3).
- Produces: `RateProvider({ rate, children })` (client) i `useEurRate(): number` (client hook). Komponenty klienckie czytają kurs przez `useEurRate()`.

- [ ] **Step 1: Utwórz kontekst**

```tsx
// app/_lib/rate-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_EUR_RATE } from "./store-settings";

// Kurs PLN->EUR dostarczony z serwera (seed w root layout). Komponenty klienckie
// pokazujące ceny biorą go stąd, zamiast wołać DB.
const RateContext = createContext<number>(DEFAULT_EUR_RATE);

export function RateProvider({
  rate,
  children,
}: {
  rate: number;
  children: ReactNode;
}) {
  return <RateContext.Provider value={rate}>{children}</RateContext.Provider>;
}

export function useEurRate(): number {
  return useContext(RateContext);
}
```
> Import `DEFAULT_EUR_RATE` z `store-settings.ts` (oznaczonego `server-only`) do pliku klienckiego: importujemy TYLKO stałą liczbową, nie funkcję serwerową — bundler to przepuści. Jeśli `server-only` wywali build na tym imporcie, przenieś `export const DEFAULT_EUR_RATE = 0.23;` do osobnego, neutralnego pliku `app/_lib/eur-constants.ts` i importuj z niego w obu miejscach.

- [ ] **Step 2: Seed w `app/layout.tsx`**

W root layoutcie (server component) pobierz kurs i owiń drzewo `RateProvider`em — wewnątrz istniejących providerów (Cart/Theme/Toast), tak by klienty miały dostęp.

Dodaj importy:
```ts
import { getEurRate } from "@/app/_lib/store-settings";
import { RateProvider } from "@/app/_lib/rate-context";
```
W ciele komponentu (przed `return`):
```ts
  const eurRate = await getEurRate();
```
Owiń `{children}` (najlepiej tuż obok `CartProvider`/`ToastProvider`):
```tsx
        <RateProvider rate={eurRate}>
          {/* ...istniejące providery i children... */}
        </RateProvider>
```
> Root layout musi być `async` (jest, bo używa innych `await`). Zachowaj istniejącą kolejność providerów; `RateProvider` może być na zewnątrz lub wewnątrz nich — nie ma zależności między nimi.

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run build` → przechodzi (Turbopack; duży timeout).

- [ ] **Step 4: Commit**

```bash
git add app/_lib/rate-context.tsx app/layout.tsx
git commit -m "feat(eur): RateProvider + useEurRate + seed kursu w root layout"
```

---

### Task 5: Ekran `/admin/ustawienia` — edycja kursu

Akcja zapisu (server) + mały ekran z polem kursu. PL-only.

**Files:**
- Create: `app/admin/ustawienia/actions.ts`
- Create: `app/admin/ustawienia/page.tsx`
- Create: `app/admin/ustawienia/SettingsForm.tsx`
- Modify: `app/admin/page.tsx` (link do `/admin/ustawienia`)

**Interfaces:**
- Consumes: `getEurRate()` (T3); `requireAdmin`, `createAdminClient`, typ `ActionResult` — **skopiuj importy z nagłówka `app/admin/produkty/actions.ts`** (te same ścieżki). Komponenty UI: `Card`/`Field`/`ToastView`/`inputCls` z `app/admin/_shared` (wzorzec jak inne ekrany admina — sprawdź dokładne nazwy w `app/admin/_shared`).
- Produces: `updateEurRate(rate: number): Promise<ActionResult>` (server action).

- [ ] **Step 1: Akcja zapisu kursu**

```ts
// app/admin/ustawienia/actions.ts
"use server";

import { revalidatePath } from "next/cache";
// Skopiuj DOKŁADNIE te importy z nagłówka app/admin/produkty/actions.ts:
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { ActionResult } from "@/app/_lib/types";

// Zapis globalnego kursu PLN->EUR. Walidacja > 0. Po zapisie revaliduje layout,
// bo ceny EUR są renderowane wszędzie (seed kursu w root layout).
export async function updateEurRate(rate: number): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: "Kurs musi być liczbą większą od 0" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ eur_rate: rate, updated_at: new Date().toISOString() } as never)
    .eq("id", true);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin/ustawienia");
  return { ok: true, message: "Zapisano kurs EUR" };
}
```
> Jeśli `ActionResult` / `requireAdmin` / `createAdminClient` są importowane z innych ścieżek niż wyżej — użyj DOKŁADNIE tych z `app/admin/produkty/actions.ts` (otwórz plik i skopiuj nagłówek importów). NIE zgaduj.

- [ ] **Step 2: Ekran (server) + formularz (client)**

```tsx
// app/admin/ustawienia/page.tsx
import { getEurRate } from "@/app/_lib/store-settings";
import SettingsForm from "./SettingsForm";

// Panel admina jest PL-only.
export default async function AdminSettingsPage() {
  const rate = await getEurRate();
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl font-semibold mb-6">Ustawienia sklepu</h1>
      <SettingsForm initialRate={rate} />
    </div>
  );
}
```

```tsx
// app/admin/ustawienia/SettingsForm.tsx
"use client";

import { useState, useTransition } from "react";
import { updateEurRate } from "./actions";

// Pole kursu PLN->EUR. Liczba > 0. Przykład: 0.23 => 1 zł = 0,23 €.
export default function SettingsForm({ initialRate }: { initialRate: number }) {
  const [value, setValue] = useState(String(initialRate));
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    setMsg(null);
    const rate = Number(value.replace(",", "."));
    startSave(async () => {
      const res = await updateEurRate(rate);
      setMsg(
        res.ok
          ? { ok: true, text: res.message ?? "Zapisano" }
          : { ok: false, text: res.error }
      );
    });
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-sans uppercase tracking-widest text-[var(--muted)]">
          Kurs EUR (1 zł = … €)
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] w-40"
        />
      </label>
      <p className="text-xs text-[var(--muted)]">
        Ceny na <strong>/de</strong> = zaokrąglone w górę do pełnych euro
        (cena_zł × kurs). Przykład przy 0,23: 2&nbsp;199 zł → 506 €.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz kurs"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-600 text-sm" : "text-red-600 text-sm"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
```
> Jeśli repo ma wspólny `ToastView`/`Card` w `app/admin/_shared` i inne ekrany go używają — możesz przepiąć komunikat na toast dla spójności. MVP: prosty inline `msg` jak wyżej (działa bez znajomości API toasta).

- [ ] **Step 3: Link w `app/admin/page.tsx`**

Dołóż do listy linków admina (obok istniejących: zamówienia, produkty, kolekcje, kody rabatowe…) pozycję:
```tsx
<Link href="/admin/ustawienia">Ustawienia (kurs EUR)</Link>
```
> Dopasuj do faktycznego wzorca renderu kafelków/linków w `app/admin/page.tsx` (skopiuj strukturę sąsiedniego linku, podmień href/label).

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0.

- [ ] **Step 5: Ręczny smoke**

`npm run dev` → `/admin/ustawienia`: zmień kurs na 0.24, „Zapisz kurs" → komunikat sukcesu; odśwież → wartość trzyma się.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ustawienia/ app/admin/page.tsx
git commit -m "feat(eur): ekran /admin/ustawienia z edycja kursu PLN->EUR"
```

---

### Task 6: Wyświetlanie cen katalogowych w EUR (storefront)

Podmiana `formatPrice` → `formatMoney` na cenach KATALOGOWYCH (w DB w PLN). Klient: `useEurRate()`. Serwer: `getEurRate()`. **Bez** cen zamówień (te są w T8) i **bez** admina (zostaje PL).

**Files:**
- Modify (client, `useEurRate()`): `app/_components/ui/ProductMainSection.tsx` (:102), `app/_components/ui/RecentlyViewed.tsx` (:97), `app/_components/layout/SearchBox.tsx` (:370), `app/koszyk/page.tsx` (:203,261,266,281), `app/checkout/CheckoutForm.tsx` (:355,359,374,387)
- Modify (server): `app/_components/ui/ProductCard.tsx` (:85)

**Interfaces:**
- Consumes: `formatMoney` (T1), `useEurRate` (T4, client), `getEurRate` (T3, server). `locale` w tych komponentach już istnieje (z `useClientLocale()` lub propa).

- [ ] **Step 1: Komponenty klienckie — wstrzyknij `useEurRate` i podmień format**

W każdym z: `ProductMainSection.tsx`, `RecentlyViewed.tsx`, `SearchBox.tsx`, `koszyk/page.tsx`, `CheckoutForm.tsx`:

1. Dodaj importy:
```ts
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";
```
2. W ciele komponentu (obok pobrania `locale`):
```ts
  const rate = useEurRate();
```
3. Zamień każde `formatPrice(X, locale)` na `formatMoney(X, locale, rate)`. Usuń import `formatPrice`, jeśli przestał być używany w pliku.

Dokładne miejsca (z rozpoznania):
- `ProductMainSection.tsx:102` — `formatPrice(currentPrice, locale)` → `formatMoney(currentPrice, locale, rate)`.
- `RecentlyViewed.tsx:97` — `formatPrice(p.price, locale)` → `formatMoney(p.price, locale, rate)`.
- `SearchBox.tsx:370` — `formatPrice(s.price, locale)` → `formatMoney(s.price, locale, rate)`.
- `koszyk/page.tsx:203,261,266,281` — kolejno `item.price*qty`, `total`, `discount`, `grandTotal` → każdy owinięty `formatMoney(..., locale, rate)`.
- `CheckoutForm.tsx:355,359,374,387` — `item.price`, `item.price*qty`, `discount`, `grandTotal` → `formatMoney(..., locale, rate)`.

> Te kwoty to wartości katalogowe/koszykowe w PLN (zustand trzyma PLN — bez zmian). Konwersja następuje TYLKO przy wyświetleniu. Wartość pobierana w checkoutcie liczona jest osobno serwerowo (T7) tym samym kursem.

- [ ] **Step 2: `ProductCard.tsx` (serwerowy) — `getEurRate()`**

W `ProductCard.tsx`:
1. Dodaj importy:
```ts
import { formatMoney } from "@/app/_lib/money";
import { getEurRate } from "@/app/_lib/store-settings";
```
2. Komponent jest serwerowy — zrób go `async` (jeśli nie jest) i pobierz kurs:
```ts
  const rate = await getEurRate();
```
3. Linia :85 — `formatPrice(product.price, locale)` → `formatMoney(product.price, locale, rate)`. Usuń nieużywany import `formatPrice`.

> `getEurRate` ma `cache()` (T3) — wiele kart = jeden odczyt DB na request.
> ⚠️ Jeśli `ProductCard` jest renderowany jako dziecko komponentu KLIENCKIEGO (build zgłosi błąd: async server component w kliencie) — wtedy NIE rób go async; zamiast tego dodaj prop `rate: number` do `ProductCard` i przekaż go z serwerowego rodzica listy (który woła `getEurRate()` raz). Sprawdź, gdzie `ProductCard` jest używany, zanim wybierzesz wariant.

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 4: Ręczny smoke**

`npm run dev`:
- `/sklep` (PL) — ceny w „zł" bez zmian.
- `/de/sklep` — ceny w „€" (zaokrąglone w górę), karta produktu, wyszukiwarka, koszyk, „ostatnio oglądane".
- Zmień kurs w `/admin/ustawienia` → ceny EUR aktualizują się po revalidacji.

- [ ] **Step 5: Commit**

```bash
git add app/_components app/koszyk/page.tsx app/checkout/CheckoutForm.tsx
git commit -m "feat(eur): wyswietlanie cen katalogowych w EUR na /de (formatMoney + kurs)"
```

---

### Task 7: Checkout — pobranie w EUR + zapis waluty/kursu na zamówieniu

Gdy `locale === "de"`: sesja Stripe w EUR, kwoty przeliczone tym samym kursem, `createOrder` zapisuje walutę + snapshot kursu. PL bez zmian.

**Files:**
- Modify: `app/api/checkout/route.ts` (currency :199, unit_amount :200, finalTotal :252-256, sesja Stripe ~:277+, wywołanie `createOrder`)
- Modify: `app/_lib/orders.ts` (`CreateOrderInput` + `createOrder`)

**Interfaces:**
- Consumes: `convertToEur` (T1), `getEurRate` (T3). `locale` w route — z `getLocale()` (już używane w #41 dla `localePrefix`).
- Produces: `createOrder` przyjmuje dodatkowo `currency: "pln" | "eur"` i `fxRate: number | null`; zapisuje je do `orders`. `order_items.price` zapisywane w walucie pobrania.

- [ ] **Step 1: Rozszerz `CreateOrderInput` + `createOrder` (`orders.ts`)**

W `app/_lib/orders.ts`, w typie `CreateOrderInput` dodaj pola:
```ts
  currency: "pln" | "eur";
  fxRate: number | null;
```
W `createOrder`, w `insert({...})` dla tabeli `orders` dodaj:
```ts
      currency,
      fx_rate: fxRate,
```
(destrukturyzuj `currency`, `fxRate` z argumentu). Pozostała logika `order_items` bez zmian — ceny pozycji przychodzą już w walucie pobrania z route (Step 2).

- [ ] **Step 2: Przeliczenie EUR w `route.ts`**

W `app/api/checkout/route.ts`, w handlerze POST:

1. Po ustaleniu `locale` (jest już `const localePrefix = locale === "de" ? "/de" : "";` z #41) wyznacz kurs i walutę:
```ts
    const isDe = locale === "de";
    const rate = isDe ? await getEurRate() : 1;
    const currency: "pln" | "eur" = isDe ? "eur" : "pln";
    const toCharge = (pln: number) => (isDe ? convertToEur(pln, rate) : pln);
```
Dodaj importy na górze pliku:
```ts
import { getEurRate } from "@/app/_lib/store-settings";
import { convertToEur } from "@/app/_lib/money";
```

2. Budowanie `stripeLineItems` (okolice :199-200): waluta i kwota wg `currency`/`toCharge`. Zamień:
```ts
        currency: "pln",
        unit_amount: Math.round(unitPrice * 100),
```
na:
```ts
        currency,
        unit_amount: Math.round(toCharge(unitPrice) * 100),
```
> `toCharge` dla EUR daje pełne euro (całkowite), więc `*100` to pełne centy — spójne z wyświetlaną ceną.

3. Rabat promo (`amount_off`, ~tam gdzie `stripeCouponId`/kupon): kwota rabatu również przez `toCharge(...)` i `currency`. Znajdź budowę kuponu Stripe i zamień `amount_off`/`currency` na wersję przeliczoną. (Jeśli rabat liczony jest jako kwota PLN — owiń `toCharge`.)

4. Lokalizacja UI Stripe (dziś `locale: "pl"` na sztywno ~:288) → wg locale:
```ts
      locale: isDe ? "de" : "pl",
```

5. `finalTotal` i pozycje do `createOrder` w walucie pobrania:
```ts
    const finalTotal = toCharge(Math.max(0, total - promoDiscount));
```
oraz w wywołaniu `createOrder({...})` dodaj/ustaw:
```ts
      total: finalTotal,
      currency,
      fxRate: isDe ? rate : null,
      promoDiscount: toCharge(promoDiscount),
      items: items.map((it) => ({ ...it, price: toCharge(it.price) })),
```
> Dopasuj kształt `items.map` do faktycznego typu pozycji przekazywanego do `createOrder` (zachowaj pozostałe pola pozycji; przelicz tylko `price`). Cel: `order_items.price` i `orders.total` w EUR dla DE, w PLN dla PL.

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 4: Ręczny smoke (Stripe test mode)**

`npm run dev`:
- `/de` → dodaj produkt → checkout → sesja Stripe w **EUR**, UI po niemiecku, kwota = cena EUR z karty (spójność widać==płacisz).
- Dokończ płatność (karta testowa) → w DB `orders.currency='eur'`, `fx_rate` ustawione, `total`/`order_items.price` w EUR.
- `/` → checkout nadal PLN, `locale: "pl"`, `currency='pln'`, `fx_rate` NULL.

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/route.ts app/_lib/orders.ts
git commit -m "feat(eur): checkout pobiera w EUR na /de + zapis currency/fx_rate na zamowieniu"
```

---

### Task 8: Wyświetlanie zamówień wg waluty zamówienia

Kwoty zamówień formatowane wg `order.currency` (nie locale). Dotyczy: sukces checkoutu, panel konta, panel admina. Wymaga, by zapytania zwracały `currency`.

**Files:**
- Modify: `app/checkout/success/page.tsx` (:109)
- Modify: `app/konto/zamowienia/OrdersList.tsx` (:148)
- Modify: `app/konto/zamowienia/[id]/page.tsx` (:176,205,215,227,234,244)
- Modify: `app/admin/zamowienia/page.tsx` (:161)
- Modify: `app/admin/zamowienia/[id]/page.tsx` (:98,102,111,121,126)

**Interfaces:**
- Consumes: `formatOrderAmount(amount, currency)` (T1). `order.currency` z DB (kolumna z T2).

- [ ] **Step 1: Upewnij się, że zapytania zwracają `currency`**

W każdym z plików sprawdź `select(...)` dla `orders`. Jeśli używa jawnej listy kolumn (nie `*`) — dodaj `currency`. Jeśli `*` — `currency` przychodzi automatycznie. (Detal pozycji `order_items.price` jest już w walucie zamówienia — formatujemy wg `order.currency`.)

- [ ] **Step 2: success/page.tsx**

Dodaj import:
```ts
import { formatOrderAmount } from "@/app/_lib/money";
```
Linia :109 — zamień `formatPrice(total, locale)` na:
```ts
formatOrderAmount(Number(total), order.currency)
```
(`order` jest tu dostępny — to z niego bierzemy `total`; użyj `order.currency`.) Usuń nieużywany `formatPrice`, jeśli zniknął ostatni.

- [ ] **Step 3: konto/zamowienia/OrdersList.tsx**

Dodaj import `formatOrderAmount`. Linia :148 — zamień:
```tsx
{Number(order.total).toLocaleString(locale)} zł
```
na:
```tsx
{formatOrderAmount(Number(order.total), order.currency)}
```

- [ ] **Step 4: konto/zamowienia/[id]/page.tsx**

Dodaj import `formatOrderAmount`. Zamień surowe `…toLocaleString(locale) + " zł"` na `formatOrderAmount(…, order.currency)` w liniach:
- :176 `{item.quantity} × {Number(item.price).toLocaleString(locale)} zł` → `{item.quantity} × {formatOrderAmount(Number(item.price), order.currency)}`
- :205 `{(Number(item.price) * item.quantity).toLocaleString(locale)} zł` → `{formatOrderAmount(Number(item.price) * item.quantity, order.currency)}`
- :215 `{subtotal.toLocaleString(locale)} zł` → `{formatOrderAmount(subtotal, order.currency)}`
- :227 `−{promoDiscount.toLocaleString(locale)} zł` → `−{formatOrderAmount(promoDiscount, order.currency)}`
- :234 `${shipping.toLocaleString(locale)} zł` → `${formatOrderAmount(shipping, order.currency)}`
- :244 `{Number(order.total).toLocaleString(locale)} zł` → `{formatOrderAmount(Number(order.total), order.currency)}`

> `shipping`/`delivery_cost` to kwota wpisana ręcznie przez admina (migr. 31). Dla zamówień EUR admin wpisuje EUR — formatowana wg `order.currency` jest spójna.

- [ ] **Step 5: admin/zamowienia/page.tsx + [id]/page.tsx**

Dodaj import `formatOrderAmount`. Zamień wszystkie `formatPrice(Number(...), "pl")` na `formatOrderAmount(Number(...), o.currency)` (lista, :161) / `order.currency` (detal, :98,102,111,121,126). **Admin ZAWSZE widzi zamówienie w jego walucie** — zamówienie EUR pokazuje €, nawet w panelu PL.

- [ ] **Step 6: Bramki + smoke**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.
Smoke: zamówienie EUR (z T7) → `/konto/zamowienia` i `/admin/zamowienia` pokazują „€"; stare zamówienie PLN → nadal „zł".

- [ ] **Step 7: Commit**

```bash
git add app/checkout/success/page.tsx app/konto/zamowienia app/admin/zamowienia
git commit -m "feat(eur): wyswietlanie zamowien wg waluty zamowienia (EUR/PLN)"
```

---

### Task 9: JSON-LD `priceCurrency` dla /de

SEO: cena w structured data zgodna z walutą wyświetlaną.

**Files:**
- Modify: `app/produkt/[id]/page.tsx` (JSON-LD `offers`/`priceCurrency`)

**Interfaces:**
- Consumes: `convertToEur` (T1), `getEurRate` (T3). `locale` (już w pliku — #41 importuje `localizePath, localizeHref`).

- [ ] **Step 1: Przelicz cenę i walutę w JSON-LD**

W `produkt/[id]/page.tsx` znajdź budowę JSON-LD z `priceCurrency: "PLN"` i `price`. Dodaj importy:
```ts
import { convertToEur } from "@/app/_lib/money";
import { getEurRate } from "@/app/_lib/store-settings";
```
Przed budową obiektu JSON-LD:
```ts
  const eurRate = await getEurRate();
  const isDe = locale === "de";
  const jsonLdPrice = isDe ? convertToEur(product.price, eurRate) : product.price;
  const jsonLdCurrency = isDe ? "EUR" : "PLN";
```
W obiekcie `offers` użyj `price: jsonLdPrice` i `priceCurrency: jsonLdCurrency` (zamiast literałów). Strona jest serwerowa i `async` — `await getEurRate()` jest OK.

- [ ] **Step 2: Bramki + smoke**

Run: `npx tsc --noEmit` → 0. `npm run build` → przechodzi.
Smoke: `/de/produkt/[id]` — w źródle strony JSON-LD ma `"priceCurrency":"EUR"` i przeliczoną cenę; `/produkt/[id]` — `"PLN"`.

- [ ] **Step 3: Commit**

```bash
git add app/produkt/[id]/page.tsx
git commit -m "feat(eur): JSON-LD priceCurrency EUR + przeliczona cena na /de"
```

---

### Task 10: Pełne bramki + smoke końcowy

**Files:** brak zmian (chyba że bramki coś wykażą).

- [ ] **Step 1: Pełny zestaw bramek (z `sklep-meblowy/`)**

```bash
npx tsc --noEmit      # 0
npm run lint          # 0
npm test              # vitest — zielony (w tym money.test.ts)
npm run build         # Turbopack przechodzi
```

- [ ] **Step 2: Smoke end-to-end (`npm run dev`)**

- [ ] `/de/sklep`, karta, wyszukiwarka, koszyk, checkout — ceny EUR (zaokrąglone w górę), spójne między sobą.
- [ ] `/sklep` itd. (PL) — bez zmian, „zł".
- [ ] Checkout `/de` → Stripe w EUR + UI „de"; płatność testowa → `orders.currency='eur'`, `fx_rate` zapisany, `order_items.price`/`total` w EUR.
- [ ] `/konto/zamowienia` + `/admin/zamowienia` — zamówienie EUR pokazuje „€" (także w panelu PL); stare PLN → „zł".
- [ ] `/admin/ustawienia` — zmiana kursu → ceny EUR aktualizują się (po revalidacji layoutu).
- [ ] JSON-LD `/de/produkt/[id]` → `"EUR"`.
- [ ] **Kontrola BL:** potwierdź, że push BaseLinkera jest wyłączony (warunek wstępny) — żadne zamówienie EUR nie zostało wypchnięte do BL jako PLN.

- [ ] **Step 3: Commit (jeśli bramki coś poprawiły)**

```bash
git add -A
git commit -m "chore(eur): domkniecie bramek cen w EUR"
```

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** pełne EUR + płatność w EUR (T6 display + T7 checkout); stały kurs w DB edytowalny w /admin (T2 migracja + T3 odczyt + T5 ekran); `convertToEur=ceil` (T1); `formatMoney` de/pl (T1, T6); dostarczenie kursu serwer (`getEurRate` T3) + klient (`RateProvider`/`useEurRate` T4); checkout currency/unit_amount/promo/Stripe locale/createOrder (T7); zamówienia `currency`+`fx_rate` zapis (T2/T7) i wyświetlanie wg waluty (T8); JSON-LD priceCurrency (T9). Koszt dostawy — z rozpoznania NIE jest pozycją checkoutu (ustalany ręcznie po zamówieniu), więc otwarte pytanie o próg EUR jest bezprzedmiotowe (udokumentowane w T8 Step 4). BaseLinker — poza zakresem, twardy warunek wstępny (Global Constraints + T10 Step 2). Mail potwierdzenia — brak własnego szablonu w repo; Stripe wysyła paragon w walucie sesji (ustawionej w T7), więc bez zmian.

**Placeholder scan:** brak TBD/„handle errors". Każdy krok ma realny kod/komendę. Numery linii oznaczone z rozpoznania (przesuną się — kotwice kontekstowe podane). Miejsca z koniecznością weryfikacji importów/ścieżek mają konkretną instrukcję „skopiuj z pliku X", nie zgadywanie.

**Type consistency:** `convertToEur(number,number):number`, `formatEur(number):string`, `formatMoney(number,Locale,number):string`, `formatOrderAmount(number,"pln"|"eur"):string` — spójne T1↔T6/T8/T9. `getEurRate():Promise<number>` spójne T3↔T4/T6/T7/T9. `useEurRate():number` T4↔T6. `updateEurRate(number):Promise<ActionResult>` T5. `Order.currency:"pln"|"eur"`, `Order.fx_rate:number|null` (T2) zgodne z `createOrder` input `currency`/`fxRate` (T7) i odczytami `order.currency` (T8). Kolumny DB `orders.currency`/`orders.fx_rate`, `store_settings.eur_rate` (T2) zgodne z odczytami/zapisami (T3/T5/T7).

## Otwarte do potwierdzenia przed/po implementacji
- **Realny kurs startowy** — migracja seeduje tymczasowo `0.23`; właścicielka ustawia faktyczny w `/admin/ustawienia` przed startem /de (lub podmień seed w `33_eur_pricing.sql` na podaną wartość przed uruchomieniem migracji).
- **VAT/OSS/faktury przy sprzedaży EUR do DE** — flaga ryzyka biznesowo-księgowego (spec §5); poza zakresem kodu.
- **Wyłączenie pushu BaseLinker** — warunek wstępny deployu EUR (decyzja właściciela).

## Execution Handoff

Plan zapisany w `docs/superpowers/plans/2026-06-24-ceny-eur-de.md`. Dwie opcje wykonania:

1. **Subagent-Driven (zalecane)** — świeży subagent na każdy task, recenzja między taskami, szybka iteracja.
2. **Inline Execution** — wykonanie w tej sesji (executing-plans), batch z checkpointami.
