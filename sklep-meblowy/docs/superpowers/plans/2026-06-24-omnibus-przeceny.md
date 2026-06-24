# Omnibus — przeceny per wariant + najniższa cena z 30 dni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić zgodne z dyrektywą Omnibus (UOKiK) przeceny per wariant i per produkt — z automatyczną historią cen, wyliczaną „najniższą ceną z 30 dni przed obniżką", poprawnym wyświetlaniem (PL/DE/EUR) i realnym pobraniem ceny promocyjnej w checkoutcie.

**Architecture:** `price_history` (log ceny efektywnej) jest źródłem prawdy; przy każdym zapisie ceny serwer dopisuje zmianę i **denormalizuje** wyliczone `omnibus_price` na produkt/kombinację, więc odczyt na froncie jest darmowy. Czysta logika (cena efektywna, Omnibus, planowanie zmian) w testowalnych modułach bez zależności server-only; cienki wrapper IO na serwerze.

**Tech Stack:** Next.js (App Router, wersja w `node_modules/next/dist/docs` — patrz Global Constraints), TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind (zmienne CSS `var(--…)`).

**Spec:** `docs/superpowers/specs/2026-06-24-omnibus-przeceny-design.md`

## Global Constraints

- **Next.js inny niż znany** — przed kodem Next-specyficznym przeczytaj guide w `node_modules/next/dist/docs/`; heed deprecation notices (z `AGENTS.md`).
- **Pliki `"use server"`** mogą eksportować WYŁĄCZNIE async server actions — nie re-eksportuj typów (`export type { X }` → ReferenceError pod Turbopack). Typy importuj ze źródła.
- **i18n PL/DE** — każdy nowy string widoczny dla klienta MUSI mieć wpis PL i DE; `de.ts` zgodny z typem z `pl.ts` (tsc to wymusza).
- **Admin UX trywialny** — zwykłe pola liczbowe + jasny hint po polsku.
- **Migracje ręcznie** — Mikołaj aplikuje pliki migracji na Supabase (dev + prod) sam; plan tworzy tylko plik. Feature działa end-to-end po zastosowaniu migracji.
- **Ceny w DB i koszyku zawsze w PLN** — EUR liczone tylko do wyświetlenia/checkoutu przez `formatMoney`/`convertToEur` (Math.ceil do pełnych euro).
- **Cena efektywna** = `sale_price` gdy ustawiona i **ściśle niższa** od regularnej, inaczej regularna.
- **Najniższa cena z 30 dni** liczona względem startu bieżącej obniżki (`t0` = ostatni wpis historii jednostki), stała w trakcie promocji.
- **Zakres:** promocja per kombinacja dla produktów z wariantami; per produkt dla bez wariantów (pole produktowe wyłączone gdy są warianty).

---

### Task 1: Migracja 36 + typy

**Files:**
- Create: `supabase/migrations/36_omnibus_pricing.sql`
- Modify: `app/_lib/types.ts` (Product + ProductVariant)

**Interfaces:**
- Produces: kolumny `products.sale_price`, `products.omnibus_price`; tabela `price_history(product_id, variant_key, effective_price, recorded_at)`; pola typu `Product.sale_price: number | null`, `Product.omnibus_price: number | null`, `ProductVariant.sale_price?: number`, `ProductVariant.omnibus_price?: number`.

- [ ] **Step 1: Utwórz migrację**

`supabase/migrations/36_omnibus_pricing.sql`:
```sql
-- Migracja 36: Omnibus — przeceny per produkt/wariant + historia cen.
-- sale_price: cena promocyjna produktu (dla produktów BEZ wariantów; przy
--   wariantach promocja jest per kombinacja w JSON variants).
-- omnibus_price: zdenormalizowana najniższa cena z 30 dni (liczona przy zapisie).
alter table public.products
  add column if not exists sale_price    numeric(10,2) check (sale_price >= 0),
  add column if not exists omnibus_price numeric(10,2) check (omnibus_price >= 0);

-- Historia cen efektywnych — źródło do liczenia najniższej-z-30-dni.
create table if not exists public.price_history (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_key     text,                       -- null = poziom produktu
  effective_price numeric(10,2) not null check (effective_price >= 0),
  recorded_at     timestamptz not null default now()
);
create index if not exists idx_price_history_unit
  on public.price_history (product_id, variant_key, recorded_at);

-- RLS: tabela dotykana wyłącznie server-side przez createAdminClient (omija RLS).
-- Front czyta zdenormalizowane products.omnibus_price, NIE tę tabelę → brak public read.
alter table public.price_history enable row level security;
create policy "price_history: admin all"
  on public.price_history for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Seed: bieżąca cena każdego istniejącego produktu (poziom produktu) jako
-- punkt startowy historii — pierwsza obniżka dostanie referencję = cena regularna.
insert into public.price_history (product_id, variant_key, effective_price, recorded_at)
select id, null, price, created_at from public.products;
```

- [ ] **Step 2: Dodaj pola do typów**

W `app/_lib/types.ts`, w `ProductVariant` (po `price_modifier?: number;`):
```ts
  // Omnibus (migracja 36): cena promocyjna i najniższa-z-30-dni per kombinacja.
  sale_price?: number;
  omnibus_price?: number;
```
W `Product` (po `collection_id: string | null;` i polach size_group — przed `is_active`):
```ts
  // Omnibus (migracja 36) — poziom produktu (dla produktów bez wariantów).
  sale_price: number | null;
  omnibus_price: number | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/36_omnibus_pricing.sql app/_lib/types.ts
git commit -m "feat(omnibus): migracja 36 (sale_price/omnibus_price/price_history) + typy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Czyste prymitywy cenowe — `pricing.ts` (TDD)

**Files:**
- Create: `app/_lib/pricing.ts`
- Test: `app/_lib/__tests__/pricing.test.ts`

**Interfaces:**
- Produces:
  - `effectivePrice(regular: number, salePrice: number | null | undefined): number`
  - `isOnSale(regular: number, salePrice: number | null | undefined): boolean`
  - `type PriceHistoryRow = { effective_price: number; recorded_at: string }`
  - `computeOmnibus(history: PriceHistoryRow[]): number | null`

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/pricing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { effectivePrice, isOnSale, computeOmnibus } from "@/app/_lib/pricing";

describe("effectivePrice / isOnSale", () => {
  it("sale niższa od regularnej → sale i on-sale", () => {
    expect(effectivePrice(1000, 800)).toBe(800);
    expect(isOnSale(1000, 800)).toBe(true);
  });
  it("sale >= regularna → regularna i NIE on-sale", () => {
    expect(effectivePrice(1000, 1000)).toBe(1000);
    expect(effectivePrice(1000, 1200)).toBe(1000);
    expect(isOnSale(1000, 1000)).toBe(false);
  });
  it("sale null/undefined → regularna, nie on-sale", () => {
    expect(effectivePrice(1000, null)).toBe(1000);
    expect(effectivePrice(1000, undefined)).toBe(1000);
    expect(isOnSale(1000, null)).toBe(false);
  });
});

describe("computeOmnibus — najniższa cena z 30 dni przed obniżką", () => {
  const d = (iso: string) => iso;
  it("cena stała >30 dni, potem obniżka → referencja = cena sprzed obniżki (atWindowStart)", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-04-01T00:00:00Z") },
      { effective_price: 800, recorded_at: d("2026-06-01T00:00:00Z") },
    ];
    expect(computeOmnibus(h)).toBe(1000);
  });
  it("kilka zmian w oknie 30 dni → MIN z okna", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-05-20T00:00:00Z") },
      { effective_price: 900, recorded_at: d("2026-05-25T00:00:00Z") },
      { effective_price: 700, recorded_at: d("2026-06-10T00:00:00Z") }, // obniżka (t0)
    ];
    expect(computeOmnibus(h)).toBe(900);
  });
  it("wcześniejsza promocja w oknie niższa niż regularna → MIN łapie tę promocję", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-05-22T00:00:00Z") },
      { effective_price: 850, recorded_at: d("2026-05-28T00:00:00Z") }, // krótka promo
      { effective_price: 1000, recorded_at: d("2026-05-30T00:00:00Z") }, // powrót
      { effective_price: 750, recorded_at: d("2026-06-12T00:00:00Z") }, // nowa obniżka (t0)
    ];
    expect(computeOmnibus(h)).toBe(850);
  });
  it("brak wcześniejszej historii (tylko bieżący wiersz) → null", () => {
    expect(computeOmnibus([{ effective_price: 800, recorded_at: d("2026-06-10T00:00:00Z") }])).toBeNull();
    expect(computeOmnibus([])).toBeNull();
  });
  it("kolejność wejścia bez znaczenia (sortuje po recorded_at)", () => {
    const h = [
      { effective_price: 700, recorded_at: d("2026-06-10T00:00:00Z") },
      { effective_price: 1000, recorded_at: d("2026-04-01T00:00:00Z") },
    ];
    expect(computeOmnibus(h)).toBe(1000);
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL**

Run: `npx vitest run app/_lib/__tests__/pricing.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/pricing"`.

- [ ] **Step 3: Zaimplementuj `pricing.ts`**

`app/_lib/pricing.ts`:
```ts
// Czysta logika cen Omnibus — bez zależności server-only (testowalne bez Supabase).
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Cena efektywna = promocyjna jeśli ustawiona i ŚCIŚLE niższa od regularnej.
export function effectivePrice(
  regular: number,
  salePrice: number | null | undefined
): number {
  return salePrice != null && salePrice < regular ? salePrice : regular;
}

export function isOnSale(
  regular: number,
  salePrice: number | null | undefined
): boolean {
  return salePrice != null && salePrice < regular;
}

export type PriceHistoryRow = { effective_price: number; recorded_at: string };

// Najniższa cena efektywna z 30 dni PRZED wprowadzeniem bieżącej obniżki.
// t0 = recorded_at najnowszego wiersza (DANE, nie zegar → deterministyczne).
// Referencja = MIN po cenach w [t0-30d, t0) + cena obowiązująca na początku okna.
// Brak wcześniejszej historii → null (wołający użyje ceny regularnej).
export function computeOmnibus(history: PriceHistoryRow[]): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const t0 = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const windowStart = t0 - THIRTY_DAYS_MS;
  const prior = sorted.slice(0, -1);
  if (prior.length === 0) return null;
  const inWindow = prior.filter(
    (r) => new Date(r.recorded_at).getTime() >= windowStart
  );
  const beforeWindow = prior.filter(
    (r) => new Date(r.recorded_at).getTime() < windowStart
  );
  const candidates = inWindow.map((r) => r.effective_price);
  if (beforeWindow.length > 0) {
    candidates.push(beforeWindow[beforeWindow.length - 1].effective_price);
  }
  return candidates.length ? Math.min(...candidates) : null;
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/pricing.test.ts`
Expected: PASS (wszystkie).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/pricing.ts app/_lib/__tests__/pricing.test.ts
git commit -m "feat(omnibus): czyste prymitywy effectivePrice/isOnSale/computeOmnibus + testy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Planer zmian cen — `computePriceUpdates` (TDD)

**Files:**
- Modify: `app/_lib/pricing.ts` (dodaj planer)
- Test: `app/_lib/__tests__/pricing.test.ts` (dopisz bloki)

**Interfaces:**
- Consumes: `effectivePrice`, `isOnSale`, `computeOmnibus` (Task 2).
- Produces:
  - `type PriceUnit = { variant_key: string | null; regular: number; sale: number | null | undefined }`
  - `type PriceUpdatePlan = { inserts: { variant_key: string | null; effective_price: number }[]; omnibus: { variant_key: string | null; value: number | null }[] }`
  - `computePriceUpdates(units: PriceUnit[], history: { variant_key: string | null; effective_price: number; recorded_at: string }[], now: string): PriceUpdatePlan`

- [ ] **Step 1: Dopisz failing test**

Dopisz na końcu `app/_lib/__tests__/pricing.test.ts`:
```ts
import { computePriceUpdates } from "@/app/_lib/pricing";

describe("computePriceUpdates", () => {
  it("wstawia wiersz tylko gdy cena efektywna jednostki się zmieniła", () => {
    const units = [{ variant_key: null, regular: 1000, sale: 800 }];
    const history = [
      { variant_key: null, effective_price: 1000, recorded_at: "2026-05-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: null, effective_price: 800 }]);
    expect(plan.omnibus).toEqual([{ variant_key: null, value: 1000 }]);
  });
  it("brak zmiany ceny → brak insertu i brak zmiany omnibus", () => {
    const units = [{ variant_key: null, regular: 1000, sale: null }];
    const history = [
      { variant_key: null, effective_price: 1000, recorded_at: "2026-05-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([]);
    expect(plan.omnibus).toEqual([]);
  });
  it("zejście z promocji (sale usunięte) → omnibus = null dla tej jednostki", () => {
    const units = [{ variant_key: "Kolor=Beż", regular: 1000, sale: null }];
    const history = [
      { variant_key: "Kolor=Beż", effective_price: 1000, recorded_at: "2026-04-01T00:00:00Z" },
      { variant_key: "Kolor=Beż", effective_price: 800, recorded_at: "2026-06-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-15T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: "Kolor=Beż", effective_price: 1000 }]);
    expect(plan.omnibus).toEqual([{ variant_key: "Kolor=Beż", value: null }]);
  });
  it("dwie kombinacje — tylko zmieniona trafia do planu", () => {
    const units = [
      { variant_key: "Kolor=Beż", regular: 1000, sale: 700 },
      { variant_key: "Kolor=Granat", regular: 1000, sale: null },
    ];
    const history = [
      { variant_key: "Kolor=Beż", effective_price: 1000, recorded_at: "2026-05-20T00:00:00Z" },
      { variant_key: "Kolor=Granat", effective_price: 1000, recorded_at: "2026-05-20T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: "Kolor=Beż", effective_price: 700 }]);
    expect(plan.omnibus).toEqual([{ variant_key: "Kolor=Beż", value: 1000 }]);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/_lib/__tests__/pricing.test.ts`
Expected: FAIL — `computePriceUpdates is not a function`.

- [ ] **Step 3: Dopisz planer do `pricing.ts`**

Na końcu `app/_lib/pricing.ts`:
```ts
export type PriceUnit = {
  variant_key: string | null;
  regular: number;
  sale: number | null | undefined;
};

export type PriceUpdatePlan = {
  inserts: { variant_key: string | null; effective_price: number }[];
  // tylko dla jednostek, których cena się zmieniła (null = wyczyść omnibus)
  omnibus: { variant_key: string | null; value: number | null }[];
};

// Czysto: dla każdej jednostki porównuje cenę efektywną z ostatnim wpisem
// historii; gdy się zmieniła — planuje insert i przelicza omnibus (z nowym
// wierszem jako t0). `now` przekazywane (deterministyczne testy).
export function computePriceUpdates(
  units: PriceUnit[],
  history: { variant_key: string | null; effective_price: number; recorded_at: string }[],
  now: string
): PriceUpdatePlan {
  const byKey = new Map<string | null, PriceHistoryRow[]>();
  for (const r of history) {
    const arr = byKey.get(r.variant_key) ?? [];
    arr.push({ effective_price: r.effective_price, recorded_at: r.recorded_at });
    byKey.set(r.variant_key, arr);
  }
  const inserts: PriceUpdatePlan["inserts"] = [];
  const omnibus: PriceUpdatePlan["omnibus"] = [];
  for (const u of units) {
    const eff = effectivePrice(u.regular, u.sale);
    const hist = (byKey.get(u.variant_key) ?? [])
      .slice()
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const latest = hist.length ? hist[hist.length - 1].effective_price : null;
    if (latest !== null && latest === eff) continue; // bez zmiany
    inserts.push({ variant_key: u.variant_key, effective_price: eff });
    const withNew = [...hist, { effective_price: eff, recorded_at: now }];
    const value = isOnSale(u.regular, u.sale)
      ? computeOmnibus(withNew) ?? u.regular
      : null;
    omnibus.push({ variant_key: u.variant_key, value });
  }
  return { inserts, omnibus };
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/_lib/__tests__/pricing.test.ts`
Expected: PASS (Task 2 + Task 3 bloki).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/pricing.ts app/_lib/__tests__/pricing.test.ts
git commit -m "feat(omnibus): planer computePriceUpdates (insert+omnibus przy zmianie) + testy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Helpery wariantowe + ekstrakcja `variantKey` (TDD)

**Files:**
- Modify: `app/_lib/variants.ts` (dodaj `variantKey` + helpery cenowe)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (importuj `variantKey` zamiast lokalnej kopii)
- Test: `app/_lib/__tests__/variants.test.ts` (dopisz blok)

**Interfaces:**
- Consumes: `effectivePrice`, `isOnSale` (Task 2); `findVariant`, `hasVariants`, `getVariantPrice`, `isVariantSelectionComplete` (istniejące w variants.ts); `Product` (Task 1).
- Produces (w `variants.ts`):
  - `variantKey(values: Record<string, string>): string` — deterministyczny klucz (nazwy posortowane, `k=v|k=v`).
  - `getVariantSalePrice(product, selected): number | null`
  - `getVariantOmnibus(product, selected): number | null`
  - `isVariantOnSale(product, selected): boolean`
  - `getVariantEffectivePrice(product, selected): number`

- [ ] **Step 1: Dopisz failing test**

Dopisz na końcu `app/_lib/__tests__/variants.test.ts`:
```ts
import {
  variantKey,
  getVariantSalePrice,
  getVariantOmnibus,
  isVariantOnSale,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";

describe("variantKey", () => {
  it("deterministyczny niezależnie od kolejności kluczy", () => {
    expect(variantKey({ Kolor: "Beż", Strona: "Lewa" })).toBe(
      variantKey({ Strona: "Lewa", Kolor: "Beż" })
    );
    expect(variantKey({ Kolor: "Beż" })).toBe("Kolor=Beż");
  });
});

const noVar = {
  price: 1000, sale_price: 800, omnibus_price: 1000, variants: null,
} as unknown as Product;

const withVar = {
  price: 1000, sale_price: null, omnibus_price: null,
  variants: {
    options: [{ name: "Kolor", values: ["Beż", "Granat"] }],
    combinations: [
      { values: { Kolor: "Beż" }, stock: 1, price_modifier: 0, sale_price: 700, omnibus_price: 1000 },
      { values: { Kolor: "Granat" }, stock: 1, price_modifier: 200 },
    ],
  },
} as unknown as Product;

describe("helpery promocji wariantu", () => {
  it("produkt bez wariantów → poziom produktu", () => {
    expect(getVariantSalePrice(noVar, {})).toBe(800);
    expect(getVariantOmnibus(noVar, {})).toBe(1000);
    expect(isVariantOnSale(noVar, {})).toBe(true);
    expect(getVariantEffectivePrice(noVar, {})).toBe(800);
  });
  it("kombinacja w promocji → jej sale/omnibus, cena efektywna = sale", () => {
    expect(getVariantSalePrice(withVar, { Kolor: "Beż" })).toBe(700);
    expect(getVariantOmnibus(withVar, { Kolor: "Beż" })).toBe(1000);
    expect(isVariantOnSale(withVar, { Kolor: "Beż" })).toBe(true);
    expect(getVariantEffectivePrice(withVar, { Kolor: "Beż" })).toBe(700);
  });
  it("kombinacja bez promocji → regularna (price+modifier), nie on-sale", () => {
    expect(getVariantSalePrice(withVar, { Kolor: "Granat" })).toBeNull();
    expect(isVariantOnSale(withVar, { Kolor: "Granat" })).toBe(false);
    expect(getVariantEffectivePrice(withVar, { Kolor: "Granat" })).toBe(1200);
  });
  it("niekompletny wybór wariantu → nie on-sale (brak dopasowanej kombinacji)", () => {
    expect(isVariantOnSale(withVar, {})).toBe(false);
    expect(getVariantSalePrice(withVar, {})).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — `variantKey is not a function` / brak eksportów.

- [ ] **Step 3: Dodaj `variantKey` + helpery do `variants.ts`**

Na górze `app/_lib/variants.ts` dodaj import:
```ts
import { effectivePrice, isOnSale } from "./pricing";
```
Na końcu `app/_lib/variants.ts` dodaj:
```ts
// Deterministyczny klucz kombinacji (nazwy opcji posortowane). Współdzielony
// z VariantsEditor i price-history, żeby kluczowanie było spójne.
export function variantKey(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

// Cena promocyjna wybranej jednostki (kombinacja lub poziom produktu).
export function getVariantSalePrice(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (!hasVariants(product)) return product.sale_price ?? null;
  const variant = findVariant(product, selectedValues);
  return variant?.sale_price ?? null;
}

// Najniższa cena z 30 dni dla wybranej jednostki (zdenormalizowana).
export function getVariantOmnibus(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (!hasVariants(product)) return product.omnibus_price ?? null;
  const variant = findVariant(product, selectedValues);
  return variant?.omnibus_price ?? null;
}

// Czy wybrana jednostka jest w promocji (sale < regularna).
export function isVariantOnSale(
  product: Product,
  selectedValues: Record<string, string>
): boolean {
  return isOnSale(
    getVariantPrice(product, selectedValues),
    getVariantSalePrice(product, selectedValues)
  );
}

// Cena efektywna wybranej jednostki (promocyjna gdy w promocji, inaczej regularna).
export function getVariantEffectivePrice(
  product: Product,
  selectedValues: Record<string, string>
): number {
  return effectivePrice(
    getVariantPrice(product, selectedValues),
    getVariantSalePrice(product, selectedValues)
  );
}
```
Uwaga: `getVariantPrice` (istniejące) zwraca cenę regularną (`price + modifier`); używamy go jako „regularnej".

- [ ] **Step 4: Przełącz `VariantsEditor` na współdzielony `variantKey`**

W `app/admin/produkty/[id]/VariantsEditor.tsx`:
- usuń lokalną funkcję `variantKey` (blok `function variantKey(values...) { ... }`).
- dodaj do importu z `@/app/_lib/variants` (obok `formatVariantLabel`): `variantKey`.
  Tj.: `import { formatVariantLabel, variantKey } from "@/app/_lib/variants";`

- [ ] **Step 5: Uruchom testy + tsc**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: PASS (istniejące + nowy blok).
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/variants.ts app/_lib/__tests__/variants.test.ts "app/admin/produkty/[id]/VariantsEditor.tsx"
git commit -m "feat(omnibus): variantKey współdzielony + helpery sale/omnibus/effective wariantu + testy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Server — `recordPriceHistory` (wrapper IO)

**Files:**
- Create: `app/_lib/price-history.ts`

**Interfaces:**
- Consumes: `computePriceUpdates`, `PriceUnit` (Task 3); `variantKey` (Task 4); `createAdminClient` (`./supabase/server`); `Product`, `ProductVariants` (Task 1).
- Produces: `recordPriceHistory(productId: string): Promise<void>`.

- [ ] **Step 1: Zaimplementuj `price-history.ts`**

`app/_lib/price-history.ts`:
```ts
// Server-side: po każdym zapisie ceny dopisuje zmianę ceny efektywnej do
// price_history i denormalizuje wyliczone omnibus_price na produkt/kombinację.
// Czysta logika (computePriceUpdates) jest w pricing.ts; tu tylko IO.
import { createAdminClient } from "./supabase/server";
import { variantKey } from "./variants";
import { computePriceUpdates, type PriceUnit } from "./pricing";
import type { Product, ProductVariants } from "./types";

export async function recordPriceHistory(productId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("id, price, sale_price, variants")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return;
  const product = data as Pick<Product, "id" | "price" | "sale_price" | "variants">;
  const variants = product.variants as ProductVariants | null;
  const basePrice = Number(product.price);

  const units: PriceUnit[] = [];
  if (!variants || variants.combinations.length === 0) {
    units.push({ variant_key: null, regular: basePrice, sale: product.sale_price });
  } else {
    for (const c of variants.combinations) {
      units.push({
        variant_key: variantKey(c.values),
        regular: basePrice + (c.price_modifier ?? 0),
        sale: c.sale_price ?? null,
      });
    }
  }

  const { data: histRows } = await supabase
    .from("price_history")
    .select("variant_key, effective_price, recorded_at")
    .eq("product_id", productId);
  const history = ((histRows ?? []) as {
    variant_key: string | null;
    effective_price: number | string;
    recorded_at: string;
  }[]).map((r) => ({
    variant_key: r.variant_key,
    effective_price: Number(r.effective_price),
    recorded_at: r.recorded_at,
  }));

  const now = new Date().toISOString();
  const plan = computePriceUpdates(units, history, now);
  if (plan.inserts.length === 0) return;

  await supabase.from("price_history").insert(
    plan.inserts.map((i) => ({
      product_id: productId,
      variant_key: i.variant_key,
      effective_price: i.effective_price,
      recorded_at: now,
    })) as never
  );

  // Denormalizacja omnibus na produkt/kombinacje.
  const omniByKey = new Map(plan.omnibus.map((o) => [o.variant_key, o.value]));
  const update: Record<string, unknown> = {};
  if (omniByKey.has(null)) update.omnibus_price = omniByKey.get(null);
  if (variants && variants.combinations.length > 0) {
    const nextCombos = variants.combinations.map((c) => {
      const k = variantKey(c.values);
      if (!omniByKey.has(k)) return c;
      const v = omniByKey.get(k);
      // number → ustaw; null → wyczyść (pomijamy pole)
      const { omnibus_price: _drop, ...rest } = c;
      return v == null ? rest : { ...rest, omnibus_price: v };
    });
    update.variants = { ...variants, combinations: nextCombos };
  }
  if (Object.keys(update).length > 0) {
    await supabase.from("products").update(update as never).eq("id", productId);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/price-history.ts
git commit -m "feat(omnibus): recordPriceHistory — log ceny efektywnej + denormalizacja omnibus

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Admin — ceny promocyjne (produkt + warianty) + wpięcie historii

**Files:**
- Modify: `app/admin/produkty/actions.ts` (`updateProductBasics`, `updateProductVariants`, `createProduct`)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (pole `sale_price` produktu)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (pole `sale_price` per kombinacja)
- Modify: `app/_lib/new-product.ts` (payload: `sale_price`, `omnibus_price`)

**Interfaces:**
- Consumes: `recordPriceHistory` (Task 5); `effectivePrice`/`isOnSale` niepotrzebne tu — walidacja przez proste porównanie; `hasVariants` (istn.).
- Produces: zapis `products.sale_price` i `variants[].sale_price`; po każdym zapisie woła `recordPriceHistory`.

- [ ] **Step 1: `new-product.ts` — dodaj pola do payloadu**

W `app/_lib/new-product.ts`, w typie `NewProductPayload` dodaj:
```ts
  sale_price: null;
  omnibus_price: null;
```
W zwracanym `payload` (obiekt w `return { ok: true, payload: { ... } }`) dodaj:
```ts
      sale_price: null,
      omnibus_price: null,
```

- [ ] **Step 2: `actions.ts` — import + `updateProductBasics`**

W `app/admin/produkty/actions.ts`:
- Dodaj import: `import { recordPriceHistory } from "@/app/_lib/price-history";`
- W `updateProductBasics`, po walidacji `price` (po linii ustawiającej `const price = ...`), dodaj walidację i pole:
```ts
  // Cena promocyjna (Omnibus). Puste = brak. Jeśli ustawiona, musi być < cena regularna.
  const salePriceRaw = parseNumber(formData.get("sale_price"));
  if (salePriceRaw !== null) {
    if (salePriceRaw < 0) return { ok: false, error: "Cena promocyjna nie może być ujemna" };
    if (salePriceRaw >= price)
      return { ok: false, error: "Cena promocyjna musi być niższa od ceny regularnej" };
  }
```
- W obiekcie `updates` dodaj:
```ts
    sale_price: salePriceRaw,
```
- Po udanym zapisie (po `if (error) return ...;`, przed `revalidatePath`) dodaj:
```ts
  await recordPriceHistory(id);
```

- [ ] **Step 3: `actions.ts` — `updateProductVariants` (walidacja sale per kombinacja + historia)**

W `updateProductVariants`, w pętli walidującej kombinacje (`for (const c of variants.combinations) { ... }`) dodaj walidację `sale_price`:
```ts
      if (c.sale_price !== undefined && c.sale_price !== null) {
        if (typeof c.sale_price !== "number" || c.sale_price < 0) {
          return { ok: false, error: "Cena promocyjna kombinacji musi być liczbą ≥ 0" };
        }
        // regularna kombinacji = price bazowa NIE jest tu znana z formularza wariantów;
        // walidujemy względem modyfikatora: sale musi być < (price_modifier-skorygowana
        // cena). Pełną regularną zna recordPriceHistory; tu pilnujemy tylko nieujemności
        // i porównania z modyfikatorem nie robimy (brak ceny bazowej w tym payloadzie).
      }
```
- Po udanym zapisie variants (po `if (error) return ...;`, przed `revalidatePath`) dodaj:
```ts
  await recordPriceHistory(productId);
```

- [ ] **Step 4: `actions.ts` — `createProduct` (seed historii)**

W `createProduct`, po udanym insercie (po pobraniu `data.id`, przed `revalidatePath`) dodaj:
```ts
  await recordPriceHistory((data as { id: string }).id);
```

- [ ] **Step 5: `ProductEditor.tsx` — pole „Cena promocyjna (zł)" produktu**

W `app/admin/produkty/[id]/ProductEditor.tsx`, w formularzu „Podstawowe dane", zaraz po polu `Cena (zł)` (`<Field label="Cena (zł)" required> ... </Field>`) dodaj:
```tsx
          <Field
            label="Cena promocyjna (zł)"
            hint={
              hasVariants(product)
                ? "Produkt ma warianty — ustaw promocję per kombinacja w sekcji Warianty."
                : "Zostaw puste = brak promocji. Musi być niższa od ceny regularnej."
            }
          >
            <input
              name="sale_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.sale_price ?? ""}
              className={inputClass}
              disabled={hasVariants(product)}
            />
          </Field>
```

- [ ] **Step 6: `VariantsEditor.tsx` — pole „Cena promocyjna (zł)" per kombinacja**

W `app/admin/produkty/[id]/VariantsEditor.tsx`:
- W `CombinationRow` dodaj prop `onSalePriceChange: (v: number | null) => void;` (do bloku typów props) i renderuj pole obok „Modyfikator ceny (zł)" (w `<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">` zmień na `sm:grid-cols-3` i dodaj trzecie `Field`):
```tsx
        <Field label="Cena promocyjna (zł)" hint="Puste = brak. < regularnej.">
          <input
            type="number"
            step="0.01"
            min="0"
            value={combo.sale_price ?? ""}
            onChange={(e) =>
              onSalePriceChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className={inputClass}
          />
        </Field>
```
- W `VariantsEditor`, gdzie renderowany jest `<CombinationRow ... />`, dodaj handler:
```tsx
                  onSalePriceChange={(sale_price) =>
                    patchCombination(i, sale_price === null ? { sale_price: undefined } : { sale_price })
                  }
```
- Zmień grid w `CombinationRow` ze `sm:grid-cols-2` na `sm:grid-cols-3` (linia z polami stock/modyfikator).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/admin/produkty/actions.ts "app/admin/produkty/[id]/ProductEditor.tsx" "app/admin/produkty/[id]/VariantsEditor.tsx" app/_lib/new-product.ts
git commit -m "feat(omnibus): admin — cena promocyjna (produkt + per kombinacja) + wpięcie recordPriceHistory

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wyświetlanie — strona produktu, karta, koszyk + i18n

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (`omnibusLabel`, `saleBadge`)
- Modify: `app/_components/ui/ProductMainSection.tsx` (regularna/promo/omnibus per wybór)
- Modify: `app/_components/ui/ProductActions.tsx` (currentPrice = efektywna)
- Modify: `app/_components/ui/AddToCartButton.tsx` (fallback efektywna)
- Modify: `app/_components/ui/ProductCard.tsx` (promocja produktowa + linia 30-dni)

**Interfaces:**
- Consumes: `getVariantEffectivePrice`, `getVariantSalePrice`, `getVariantOmnibus`, `isVariantOnSale`, `getVariantPrice` (Task 4); `effectivePrice` (Task 2); `formatMoney` (istn.); `t.product.omnibusLabel/saleBadge`.

- [ ] **Step 1: i18n — typ + wartości**

W `app/_lib/dictionaries/pl.ts`, w bloku typu `product` (po `sizeLabel: string;`) dodaj:
```ts
    omnibusLabel: string;
    saleBadge: string;
```
W wartościach `pl` (po `sizeLabel: "Rozmiar",`) dodaj:
```ts
    omnibusLabel: "Najniższa cena z 30 dni przed obniżką",
    saleBadge: "Promocja",
```
W `app/_lib/dictionaries/de.ts` (po `sizeLabel: "Größe",`) dodaj:
```ts
    omnibusLabel: "Niedrigster Preis der letzten 30 Tage vor der Ermäßigung",
    saleBadge: "Sale",
```

- [ ] **Step 2: `ProductActions.tsx` — przekaż cenę efektywną**

W `app/_components/ui/ProductActions.tsx`:
- W imporcie z `@/app/_lib/variants` dodaj `getVariantEffectivePrice` (obok istniejących).
- Zmień `const price = getVariantPrice(product, selected);` na:
```ts
  const price = getVariantEffectivePrice(product, selected);
```
(reszta bez zmian — `currentPrice={price}` trafia do AddToCartButton).

- [ ] **Step 3: `AddToCartButton.tsx` — fallback efektywny**

W `app/_components/ui/AddToCartButton.tsx`:
- Dodaj import: `import { effectivePrice } from "@/app/_lib/pricing";`
- Zmień `const price = currentPrice ?? product.price;` na:
```ts
  const price = currentPrice ?? effectivePrice(product.price, product.sale_price);
```

- [ ] **Step 4: `ProductMainSection.tsx` — render regularna/promo/omnibus**

W `app/_components/ui/ProductMainSection.tsx`:
- W imporcie z `@/app/_lib/variants` zmień na:
```tsx
import {
  getVariantImages,
  getVariantPrice,
  getVariantEffectivePrice,
  getVariantSalePrice,
  getVariantOmnibus,
  isVariantOnSale,
} from "@/app/_lib/variants";
```
- Zamień blok `const currentPrice = getVariantPrice(product, selected);` na:
```tsx
  const regularPrice = getVariantPrice(product, selected);
  const effective = getVariantEffectivePrice(product, selected);
  const onSale = isVariantOnSale(product, selected);
  const omnibus = getVariantOmnibus(product, selected);
```
- Zamień blok ceny (`<p className="font-sans text-3xl font-bold text-[var(--fg)]">{formatMoney(currentPrice, locale, rate)}</p>`) na:
```tsx
          {onSale ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-sans text-3xl font-bold text-[var(--fg)]">
                  {formatMoney(effective, locale, rate)}
                </span>
                <span className="font-sans text-lg text-[var(--muted)] line-through">
                  {formatMoney(regularPrice, locale, rate)}
                </span>
                <span className="px-2 py-0.5 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-sans font-semibold uppercase tracking-widest rounded-full">
                  {t.product.saleBadge}
                </span>
              </div>
              {omnibus !== null && (
                <span className="text-xs text-[var(--muted)]">
                  {t.product.omnibusLabel}: {formatMoney(omnibus, locale, rate)}
                </span>
              )}
            </div>
          ) : (
            <p className="font-sans text-3xl font-bold text-[var(--fg)]">
              {formatMoney(regularPrice, locale, rate)}
            </p>
          )}
```

- [ ] **Step 5: `ProductCard.tsx` — promocja produktowa + linia 30-dni**

W `app/_components/ui/ProductCard.tsx`:
- Dodaj import: `import { effectivePrice, isOnSale } from "@/app/_lib/pricing";`
- Zamień blok ceny (`<p className="font-sans font-bold text-[var(--fg)]">{formatMoney(product.price, locale, rate)}</p>`) na:
```tsx
        {isOnSale(product.price, product.sale_price) ? (
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-sans font-bold text-[var(--fg)]">
                {formatMoney(effectivePrice(product.price, product.sale_price), locale, rate)}
              </span>
              <span className="font-sans text-sm text-[var(--muted)] line-through">
                {formatMoney(product.price, locale, rate)}
              </span>
            </div>
            {product.omnibus_price !== null && (
              <span className="text-[10px] text-[var(--muted)] leading-tight">
                {t.product.omnibusLabel}: {formatMoney(product.omnibus_price, locale, rate)}
              </span>
            )}
          </div>
        ) : (
          <p className="font-sans font-bold text-[var(--fg)]">
            {formatMoney(product.price, locale, rate)}
          </p>
        )}
```
(Blok ceny jest w `<div className="flex items-center justify-between mt-auto">` obok `<AddToCartButton />` — zamieniamy tylko `<p>` ceny, `AddToCartButton` zostaje.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_components/ui/ProductMainSection.tsx app/_components/ui/ProductActions.tsx app/_components/ui/AddToCartButton.tsx app/_components/ui/ProductCard.tsx
git commit -m "feat(omnibus): wyświetlanie promocji + linia 30-dni (strona, karta, koszyk) + i18n PL/DE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Checkout — realne pobranie ceny efektywnej

**Files:**
- Modify: `app/api/checkout/route.ts`

**Interfaces:**
- Consumes: `effectivePrice` (Task 2); `findVariant`, `hasVariants`, `isVariantSelectionComplete` (istn.).

- [ ] **Step 1: `route.ts` — select sale_price + cena efektywna**

W `app/api/checkout/route.ts`:
- Dodaj import: `import { effectivePrice } from "@/app/_lib/pricing";`
- W zapytaniu po produkty zmień `select(...)` dodając `sale_price`:
```ts
      .select("id, name, price, sale_price, stock, images, variants")
```
- Zamień ustalanie `unitPrice`. Obecnie:
```ts
      let unitPrice = Number(product.price);
      ...
        unitPrice += variant.price_modifier ?? 0;
```
  na: dla produktu BEZ wariantu — cena efektywna produktu; dla wariantu — efektywna z regularnej kombinacji:
```ts
      let unitPrice = effectivePrice(Number(product.price), product.sale_price);
      let variantValues: Record<string, string> | null = null;

      if (hasVariants(product)) {
        if (!item.variantValues || !isVariantSelectionComplete(product, item.variantValues)) {
          return NextResponse.json(
            { error: tr(`Brak wyboru wariantu dla: ${product.name}`, `Keine Variante ausgewählt für: ${product.name}`) },
            { status: 400 }
          );
        }
        const variant = findVariant(product, item.variantValues);
        if (!variant) {
          return NextResponse.json(
            { error: tr(`Nieprawidłowy wariant dla: ${product.name}`, `Ungültige Variante für: ${product.name}`) },
            { status: 400 }
          );
        }
        const regular = Number(product.price) + (variant.price_modifier ?? 0);
        unitPrice = effectivePrice(regular, variant.sale_price);
        variantValues = item.variantValues;
      }
```
  (Zastąp istniejący blok `let unitPrice = ...` + `let variantValues ...` + cały `if (hasVariants(product)) { ... unitPrice += ... }` tym powyżej — usuwając stare `unitPrice += variant.price_modifier ?? 0;`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/checkout/route.ts
git commit -m "feat(omnibus): checkout pobiera cenę efektywną (promocyjną) per produkt/wariant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Weryfikacja end-to-end

**Files:** brak zmian (uruchomienia + ewentualne poprawki).

- [ ] **Step 1: Bramki**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run lint` → brak nowych błędów.
Run: `npm run test` → cały zestaw PASS (w tym nowe `pricing` + dopis `variants`).

- [ ] **Step 2: Zastosuj migrację 36 na bazie dev**

⚠️ Ręcznie zastosuj `supabase/migrations/36_omnibus_pricing.sql` na bazie dev (i prod — Mikołaj). Bez tego zapis ceny promocyjnej padnie na nieistniejących kolumnach.

- [ ] **Step 3: Smoke manualny (PL)**

1. `/admin/produkty` → produkt BEZ wariantów: ustaw „Cena promocyjna (zł)" niższą od ceny, zapisz. Sprawdź na `/produkt/[id]` i na liście `/sklep`: cena regularna przekreślona, promocyjna wyróżniona, linia „Najniższa cena z 30 dni przed obniżką: …".
2. Produkt Z wariantami: pole produktowe wyłączone; w sekcji Warianty ustaw cenę promocyjną dla jednej kombinacji. Na `/produkt/[id]` po wyborze tej kombinacji → promocja + Omnibus; inna kombinacja → cena regularna.
3. Walidacja: cena promo ≥ regularna → błąd zapisu.
4. Dodaj promowany produkt do koszyka → kwota = promocyjna; przejdź do checkout → kwota pobrania = promocyjna.

- [ ] **Step 4: Smoke manualny (DE)**

`/de/produkt/[id]` promowanego produktu → etykieta „Niedrigster Preis der letzten 30 Tage vor der Ermäßigung", wszystkie kwoty w EUR.

- [ ] **Step 5: Commit ewentualnych poprawek** (jeśli były).

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:**
- Sekcja 1 (model) → Task 1 ✓
- Sekcja 2 (logika: effective/isOnSale/computeOmnibus) → Task 2 ✓
- Sekcja 3 (logowanie + denormalizacja) → Task 3 (planer) + Task 5 (recordPriceHistory) + Task 6 (wpięcie) ✓
- Sekcja 4 (wyświetlanie strona/karta + helpery wariantowe) → Task 4 (helpery) + Task 7 ✓
- Sekcja 5 (koszyk/checkout) → Task 7 (koszyk) + Task 8 (checkout) ✓
- Sekcja 6 (admin UX) → Task 6 ✓
- Sekcja 7 (i18n) → Task 7 ✓
- Sekcja 8 (testy) → Task 2/3/4 (czyste helpery) ✓
- Sekcja 9 (poza zakresem) → świadomie pominięte ✓

**Placeholder scan:** brak TBD/TODO; każdy krok ma konkretny kod/komendę.

**Type consistency:** `PriceUnit`/`PriceUpdatePlan`/`computePriceUpdates` zdefiniowane w Task 3 i użyte tymi samymi nazwami w Task 5; `variantKey` z Task 4 użyte w Task 5; helpery `getVariant*` z Task 4 użyte w Task 7; `effectivePrice`/`isOnSale` z Task 2 użyte w Task 4/7/8; pola `sale_price`/`omnibus_price` z Task 1 spójne wszędzie.

**Uwaga wdrożeniowa:** walidacja sale per kombinacja w `updateProductVariants` (Task 6 krok 3) pilnuje tylko nieujemności i typu — pełne porównanie z ceną regularną (price+modifier) robi się przy wyświetlaniu (`isOnSale`/`effectivePrice` traktują sale ≥ regularna jak brak promocji), więc błędnie wpisana sale ≥ regularna nie zaszkodzi (po prostu nie zadziała jako promocja). Świadomy kompromis (payload wariantów nie zawiera ceny bazowej).
