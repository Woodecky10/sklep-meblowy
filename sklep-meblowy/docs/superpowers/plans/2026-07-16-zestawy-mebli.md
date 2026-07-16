# Zestawy mebli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin łączy 2+ produktów w zestaw z rabatem (% lub kwota); klient widzi ofertę zestawu na karcie produktu (above the fold), konfiguruje składniki w modalu lub na stronie `/zestaw/[slug]` i kupuje całość taniej; rabat liczony i weryfikowany wyłącznie serwerowo.

**Architecture:** Zestaw = grupa zwykłych pozycji koszyka ze wspólnym znacznikiem (`bundle.unitKey`). Czysta logika (rabaty, grupowanie, weryfikacja) w `app/_lib/bundles.ts` (klient+serwer), odczyt z cache w `app/_lib/bundles-server.ts` (tag `bundles`), checkout weryfikuje skład i sam liczy rabat. Spec: `docs/superpowers/specs/2026-07-16-zestawy-mebli-design.md`.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Supabase (Postgres + RLS), vitest, Tailwind (klasy w stylu repo).

## Global Constraints

- **To NIE jest znany Ci Next.js** — przed pisaniem kodu Next przeczytaj odpowiedni guide w `node_modules/next/dist/docs/` (AGENTS.md).
- Branch roboczy: `feat/zestawy-mebli` (już istnieje, spec zacommitowany).
- Ceny w DB/koszyku ZAWSZE w PLN; EUR tylko przy wyświetleniu (`formatMoney(pln, locale, rate)`) i w checkout (`toCharge`).
- Każde nowe pole tekstowe widoczne dla klienta ma odpowiednik `_de` (DB) albo wpis w obu słownikach `app/_lib/dictionaries/{pl,de}.ts`.
- Server actions: zaczynają od `await requireAdmin()`, używają `createAdminClient()`, zwracają `ActionResult`, komunikaty po polsku; mutacje kończą się inwalidacją cache.
- W plikach `"use server"` NIE wolno `export type` (Turbopack → runtime ReferenceError). Typy importuj/eksportuj ze zwykłych modułów.
- Wewnątrz `unstable_cache` zero `cookies()` — `createAdminClient()` jest bezpieczny (service role, bez sesji).
- Migracja 55 NIE jest aplikowana na prod w ramach tasków — tylko plik w repo (aplikacja przez Supabase MCP za potwierdzeniem przy wdrożeniu).
- Nie dotykaj plików PR #48 (P24) ponad wskazane zmiany w `/api/checkout` — logika zestawów ma być w `bundles.ts`, wpięcie w route minimalne.
- Po zapisaniu pliku z polskimi/niemieckimi znakami sprawdź (Read fragmentu), że diakrytyki i cudzysłowy nie są zepsute.
- Komendy: `npx tsc --noEmit`, `npm test`, `npm run build` (Windows/PowerShell).
- Commit po każdym tasku, stopka: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migracja 55 + typy TS

**Files:**
- Create: `supabase/migrations/55_bundles.sql`
- Modify: `app/_lib/types.ts` (typ `Bundle` po `Collection` ~linia 140; pola w `Order`/`OrderItem` ~linie 190–228; `OrderItemInsert` ~linia 256)

**Interfaces:**
- Produces: tabele `bundles`, `bundle_items`, RPC `save_bundle`; typy `Bundle`, `BundleWithComponents`, `Order.bundle_discount: number`, `OrderItem.bundle_id: string | null`, `OrderItem.bundle_label: string | null`.

- [ ] **Step 1: Napisz migrację**

```sql
-- supabase/migrations/55_bundles.sql
-- Zestawy mebli (spec 2026-07-16): admin łączy 2+ produktów w zestaw z rabatem
-- (% lub kwota od sumy cen efektywnych). Składniki pozostają zwykłymi
-- produktami; rabat liczony i weryfikowany serwerowo w /api/checkout.

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_de text,
  description text,
  description_de text,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value numeric not null check (discount_value > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint bundles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Skład zestawu (M2M): usunięcie produktu usuwa wpis (zestaw z < 2 aktywnymi
-- składnikami jest ukrywany w warstwie odczytu), usunięcie zestawu czyści skład.
create table if not exists public.bundle_items (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position int not null default 0,
  primary key (bundle_id, product_id)
);

alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;

-- Odczyt publiczny TYLKO aktywnych (wzorzec pages.published, migr. 53).
drop policy if exists bundles_read on public.bundles;
create policy bundles_read on public.bundles
  for select using (is_active);

drop policy if exists bundle_items_read on public.bundle_items;
create policy bundle_items_read on public.bundle_items
  for select using (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and b.is_active
    )
  );

revoke insert, update, delete on public.bundles from anon, authenticated;
revoke insert, update, delete on public.bundle_items from anon, authenticated;

-- Ślad zestawu na zamówieniu: FK SET NULL (usunięcie zestawu nie rusza
-- historii) + zdenormalizowana nazwa z chwili zakupu do widoków zamówień.
alter table public.order_items
  add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
alter table public.order_items
  add column if not exists bundle_label text;
alter table public.orders
  add column if not exists bundle_discount numeric not null default 0;

-- Atomowy zapis metadanych + składu (wzorzec save_collection, migr. 32).
create or replace function public.save_bundle(
  p_id uuid,
  p_name text,
  p_name_de text,
  p_description text,
  p_description_de text,
  p_discount_type text,
  p_discount_value numeric,
  p_is_active boolean,
  p_product_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bundles set
    name = p_name,
    name_de = p_name_de,
    description = p_description,
    description_de = p_description_de,
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    is_active = p_is_active
  where id = p_id;

  delete from public.bundle_items where bundle_id = p_id;
  insert into public.bundle_items (bundle_id, product_id, position)
  select p_id, pid, ord - 1
  from unnest(p_product_ids) with ordinality as t(pid, ord);
end;
$$;

revoke execute on function public.save_bundle(uuid, text, text, text, text, text, numeric, boolean, uuid[])
  from public, anon, authenticated;
```

- [ ] **Step 2: Dodaj typy w `app/_lib/types.ts`**

Po definicji `Collection` (ok. linii 140) dodaj:

```ts
// Zestaw mebli (spec 2026-07-16) — admin łączy 2+ produktów, rabat % lub
// kwotowy od sumy cen efektywnych składników. Tabele bundles/bundle_items.
export type Bundle = {
  id: string;
  slug: string;
  name: string;
  name_de?: string | null;
  description: string | null;
  description_de?: string | null;
  discount_type: "percent" | "amount";
  discount_value: number;
  is_active: boolean;
  created_at: string;
};

// Zestaw z dociągniętymi (aktywnymi, zlokalizowanymi) produktami-składnikami,
// w kolejności position. Warstwa odczytu zwraca TYLKO komplety (>= 2 składniki,
// wszystkie aktywne) — patrz bundles-server.ts.
export type BundleWithComponents = Bundle & { components: Product[] };
```

W typie `Order` (po `promo_discount: number;`) dodaj:

```ts
  // Suma rabatów zestawów tego zamówienia, w walucie zamówienia (migracja 55).
  bundle_discount: number;
```

W typie `OrderItem` (po `notes: string | null;`) dodaj:

```ts
  // Pozycja kupiona w zestawie: id (FK SET NULL) + nazwa z chwili zakupu.
  bundle_id: string | null;
  bundle_label: string | null;
```

W `OrderItemInsert` (po `notes?: string | null;`) dodaj:

```ts
  bundle_id?: string | null;
  bundle_label?: string | null;
```

- [ ] **Step 3: Zweryfikuj typy**

Run: `npx tsc --noEmit`
Expected: bez błędów (nowe pola `OrderItem` są non-optional — jeśli tsc zgłosi miejsca konstruujące `OrderItem` literalnie, uzupełnij tam `bundle_id: null, bundle_label: null`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/55_bundles.sql app/_lib/types.ts
git commit -m "feat(zestawy): migracja 55 (bundles, bundle_items, slady na zamowieniach) + typy"
```

---

### Task 2: Czysta logika `app/_lib/bundles.ts` (TDD)

**Files:**
- Create: `app/_lib/bundles.ts`
- Test: `app/_lib/__tests__/bundles.test.ts`

**Interfaces:**
- Consumes: typ `Bundle` z Task 1 (import type).
- Produces (używane przez Taski 5–9):
  - `computeBundleDiscount(base: number, qty: number, type: "percent"|"amount", value: number): number`
  - `bundleUnitKey(bundleId: string, components: { productId: string; variantValues?: Record<string,string> }[]): string`
  - `groupBundleUnits(items: { productId: string; quantity: number; subtotal: number; bundle?: { id: string; unitKey: string } | null }[]): BundleGroup[]`
  - `verifyBundleGroup(group: BundleGroup, bundle: { id: string; is_active: boolean; productIds: string[] } | null): BundleVerification`
  - `eligiblePromoBase(items: { subtotal: number; bundle?: { id: string; unitKey: string } | null }[]): number`
  - `minBundleSavings(componentBasePrices: number[], type, value): number`
  - `groupCartBundles<T extends CartBundleItemLike>(items: T[]): CartBundleGroup<T>[]` (dla UI koszyka)
  - typ `CartItemBundle = { id: string; name: string; unitKey: string; discountType: "percent"|"amount"; discountValue: number }`

- [ ] **Step 1: Napisz failing testy**

```ts
// app/_lib/__tests__/bundles.test.ts
import { describe, it, expect } from "vitest";
import {
  computeBundleDiscount,
  bundleUnitKey,
  groupBundleUnits,
  verifyBundleGroup,
  eligiblePromoBase,
  minBundleSavings,
  groupCartBundles,
} from "../bundles";

describe("computeBundleDiscount", () => {
  it("percent: liczy od bazy i zaokrągla do groszy", () => {
    expect(computeBundleDiscount(5200, 1, "percent", 10)).toBe(520);
    expect(computeBundleDiscount(999.99, 1, "percent", 7)).toBe(70);
  });
  it("amount: kwota jest per sztuka zestawu (mnożona przez qty)", () => {
    expect(computeBundleDiscount(5200, 1, "amount", 500)).toBe(500);
    expect(computeBundleDiscount(10400, 2, "amount", 500)).toBe(1000);
  });
  it("percent: baza już zawiera qty — NIE mnoży drugi raz", () => {
    // 2 szt. zestawu o bazie jednostkowej 5200 → base=10400, 10% = 1040
    expect(computeBundleDiscount(10400, 2, "percent", 10)).toBe(1040);
  });
  it("clamp: rabat nigdy nie przekracza bazy ani nie schodzi poniżej 0", () => {
    expect(computeBundleDiscount(300, 1, "amount", 500)).toBe(300);
    expect(computeBundleDiscount(300, 1, "amount", -50)).toBe(0);
    expect(computeBundleDiscount(0, 1, "percent", 10)).toBe(0);
    expect(computeBundleDiscount(NaN, 1, "percent", 10)).toBe(0);
  });
});

describe("bundleUnitKey", () => {
  it("identyczna konfiguracja daje ten sam klucz niezależnie od kolejności", () => {
    const a = bundleUnitKey("b1", [
      { productId: "p1", variantValues: { Tkanina: "Sawana 21", Strona: "Lewa" } },
      { productId: "p2", variantValues: { Tkanina: "Riviera 16" } },
    ]);
    const b = bundleUnitKey("b1", [
      { productId: "p2", variantValues: { Tkanina: "Riviera 16" } },
      { productId: "p1", variantValues: { Strona: "Lewa", Tkanina: "Sawana 21" } },
    ]);
    expect(a).toBe(b);
  });
  it("inna tkanina / inny zestaw = inny klucz", () => {
    const base = bundleUnitKey("b1", [{ productId: "p1", variantValues: { Tkanina: "Sawana 21" } }]);
    expect(bundleUnitKey("b1", [{ productId: "p1", variantValues: { Tkanina: "Sawana 05" } }])).not.toBe(base);
    expect(bundleUnitKey("b2", [{ productId: "p1", variantValues: { Tkanina: "Sawana 21" } }])).not.toBe(base);
  });
  it("brak wariantów działa", () => {
    expect(bundleUnitKey("b1", [{ productId: "p1" }, { productId: "p2" }])).toContain("b1");
  });
});

describe("groupBundleUnits", () => {
  it("grupuje po unitKey, pomija pozycje solo", () => {
    const groups = groupBundleUnits([
      { productId: "p1", quantity: 1, subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } },
      { productId: "solo", quantity: 2, subtotal: 400, bundle: null },
      { productId: "p2", quantity: 1, subtotal: 2200, bundle: { id: "b1", unitKey: "k1" } },
      { productId: "p1", quantity: 1, subtotal: 3100, bundle: { id: "b1", unitKey: "k2" } },
      { productId: "p2", quantity: 1, subtotal: 2200, bundle: { id: "b1", unitKey: "k2" } },
    ]);
    expect(groups).toHaveLength(2);
    const g1 = groups.find((g) => g.unitKey === "k1")!;
    expect(g1.bundleId).toBe("b1");
    expect(g1.items.map((i) => i.productId).sort()).toEqual(["p1", "p2"]);
  });
});

describe("verifyBundleGroup", () => {
  const group = {
    bundleId: "b1",
    unitKey: "k1",
    items: [
      { productId: "p1", quantity: 1, subtotal: 3000 },
      { productId: "p2", quantity: 1, subtotal: 2200 },
    ],
  };
  it("ok gdy skład i ilości się zgadzają", () => {
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p2", "p1"] })
    ).toEqual({ ok: true });
  });
  it("odrzuca: brak zestawu / nieaktywny / zły skład / nierówne ilości / < 2 składniki", () => {
    expect(verifyBundleGroup(group, null)).toEqual({ ok: false, reason: "not_found" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: false, productIds: ["p1", "p2"] })
    ).toEqual({ ok: false, reason: "inactive" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p1", "p3"] })
    ).toEqual({ ok: false, reason: "wrong_products" });
    expect(
      verifyBundleGroup(group, { id: "b1", is_active: true, productIds: ["p1", "p2", "p3"] })
    ).toEqual({ ok: false, reason: "wrong_products" });
    expect(
      verifyBundleGroup(
        { ...group, items: [group.items[0], { ...group.items[1], quantity: 2 }] },
        { id: "b1", is_active: true, productIds: ["p1", "p2"] }
      )
    ).toEqual({ ok: false, reason: "unequal_quantities" });
    expect(
      verifyBundleGroup(
        { ...group, items: [group.items[0]] },
        { id: "b1", is_active: true, productIds: ["p1"] }
      )
    ).toEqual({ ok: false, reason: "wrong_products" });
  });
});

describe("eligiblePromoBase", () => {
  it("sumuje TYLKO pozycje spoza zestawów", () => {
    expect(
      eligiblePromoBase([
        { subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } },
        { subtotal: 400 },
        { subtotal: 150, bundle: null },
      ])
    ).toBe(550);
  });
  it("koszyk tylko-zestawy → 0", () => {
    expect(eligiblePromoBase([{ subtotal: 3000, bundle: { id: "b1", unitKey: "k1" } }])).toBe(0);
  });
});

describe("minBundleSavings", () => {
  it("percent liczy od sumy cen bazowych, amount zwraca kwotę", () => {
    expect(minBundleSavings([3000, 2200], "percent", 10)).toBe(520);
    expect(minBundleSavings([3000, 2200], "amount", 500)).toBe(500);
  });
});

describe("groupCartBundles", () => {
  const mk = (id: string, price: number, qty: number, unitKey?: string) => ({
    id,
    price,
    quantity: qty,
    bundle: unitKey
      ? { id: "b1", name: "Zestaw Loft", unitKey, discountType: "percent" as const, discountValue: 10 }
      : undefined,
  });
  it("zwraca grupy z bazą, qty i rabatem", () => {
    const groups = groupCartBundles([mk("p1", 3000, 2, "k1"), mk("p2", 2200, 2, "k1"), mk("solo", 100, 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Zestaw Loft");
    expect(groups[0].qty).toBe(2);
    expect(groups[0].base).toBe(10400);
    expect(groups[0].discount).toBe(1040);
    expect(groups[0].items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają FAILować**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts`
Expected: FAIL — `Cannot find module '../bundles'` (lub podobny błąd importu).

- [ ] **Step 3: Zaimplementuj `app/_lib/bundles.ts`**

```ts
// Czysta logika zestawów mebli (spec 2026-07-16) — bez zależności server-only.
// Używana przez klienta (koszyk, konfigurator) i serwer (/api/checkout), więc
// wszystko tutaj musi być deterministyczne i wolne od Supabase/next-server.

export type BundleDiscountType = "percent" | "amount";

// Znacznik zestawu na pozycji koszyka. discountType/Value zdublowane z DB,
// żeby koszyk (client-side) mógł pokazać rabat bez requestu; serwer i tak
// liczy od zera z własnych danych.
export type CartItemBundle = {
  id: string;
  name: string;
  unitKey: string;
  discountType: BundleDiscountType;
  discountValue: number;
};

// Rabat grupy zestawu. `base` = suma subtotali składników grupy (ceny
// efektywne z dopłatami opcji, JUŻ pomnożone przez ilość); `qty` = ilość
// zestawu. Kwota rabatu jest „per sztuka zestawu" → mnożona przez qty;
// procent liczy się od bazy (która qty już zawiera). Clamp do [0, base],
// zaokrąglenie do groszy.
export function computeBundleDiscount(
  base: number,
  qty: number,
  type: BundleDiscountType,
  value: number
): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  const q = Math.max(1, Math.trunc(qty));
  const raw = type === "percent" ? (base * value) / 100 : value * q;
  const clamped = Math.min(Math.max(0, raw), base);
  return Math.round(clamped * 100) / 100;
}

// Deterministyczny klucz egzemplarza zestawu: bundleId + posortowane pary
// produkt::warianty. Identyczna konfiguracja dodana drugi raz → ten sam klucz
// (koszyk zwiększy ilość istniejącej grupy zamiast tworzyć nową).
export function bundleUnitKey(
  bundleId: string,
  components: { productId: string; variantValues?: Record<string, string> }[]
): string {
  const parts = components
    .map((c) => {
      const vv = c.variantValues ?? {};
      const vk = Object.keys(vv)
        .sort()
        .map((k) => `${k}=${vv[k]}`)
        .join("|");
      return `${c.productId}::${vk}`;
    })
    .sort();
  return `${bundleId}##${parts.join("||")}`;
}

export type BundleGroupItem = {
  productId: string;
  quantity: number;
  subtotal: number;
};

export type BundleGroup = {
  bundleId: string;
  unitKey: string;
  items: BundleGroupItem[];
};

// Grupuje pozycje (checkout payload / koszyk) po unitKey. Pozycje bez bundle
// są pomijane — to zwykłe zakupy.
export function groupBundleUnits(
  items: {
    productId: string;
    quantity: number;
    subtotal: number;
    bundle?: { id: string; unitKey: string } | null;
  }[]
): BundleGroup[] {
  const map = new Map<string, BundleGroup>();
  for (const it of items) {
    if (!it.bundle) continue;
    const g = map.get(it.bundle.unitKey) ?? {
      bundleId: it.bundle.id,
      unitKey: it.bundle.unitKey,
      items: [],
    };
    g.items.push({ productId: it.productId, quantity: it.quantity, subtotal: it.subtotal });
    map.set(it.bundle.unitKey, g);
  }
  return Array.from(map.values());
}

export type BundleVerification =
  | { ok: true }
  | { ok: false; reason: "not_found" | "inactive" | "wrong_products" | "unequal_quantities" };

// Autorytatywna weryfikacja grupy względem definicji z DB: zestaw istnieje,
// jest aktywny, skład grupy == skład zestawu (dokładnie, bez braków i
// nadmiarów, min 2 produkty), ilości wszystkich składników równe.
export function verifyBundleGroup(
  group: BundleGroup,
  bundle: { id: string; is_active: boolean; productIds: string[] } | null
): BundleVerification {
  if (!bundle) return { ok: false, reason: "not_found" };
  if (!bundle.is_active) return { ok: false, reason: "inactive" };
  const got = group.items.map((i) => i.productId).sort();
  const want = [...bundle.productIds].sort();
  if (
    want.length < 2 ||
    got.length !== want.length ||
    got.some((id, i) => id !== want[i])
  ) {
    return { ok: false, reason: "wrong_products" };
  }
  const q = group.items[0]?.quantity ?? 0;
  if (!Number.isInteger(q) || q < 1 || group.items.some((i) => i.quantity !== q)) {
    return { ok: false, reason: "unequal_quantities" };
  }
  return { ok: true };
}

// Podstawa kodu rabatowego: kod NIE obejmuje pozycji z zestawów (decyzja
// użytkownika w specu) — suma subtotali pozycji bez bundle.
export function eligiblePromoBase(
  items: { subtotal: number; bundle?: { id: string; unitKey: string } | null }[]
): number {
  return items.reduce((s, i) => (i.bundle ? s : s + i.subtotal), 0);
}

// „Oszczędzasz od X zł" na kartach produktów: minimalny rabat liczony od sumy
// bazowych cen efektywnych składników (bez dopłat opcji), qty = 1.
export function minBundleSavings(
  componentBasePrices: number[],
  type: BundleDiscountType,
  value: number
): number {
  const base = componentBasePrices.reduce((s, p) => s + p, 0);
  return computeBundleDiscount(base, 1, type, value);
}

export type CartBundleGroup<T> = {
  bundleId: string;
  unitKey: string;
  name: string;
  discountType: BundleDiscountType;
  discountValue: number;
  qty: number;
  base: number;
  discount: number;
  items: T[];
};

// Grupowanie pozycji koszyka do UI + rabat client-side. Generic, żeby koszyk
// dostał z powrotem swoje pełne CartItem-y (zdjęcia, notes itd.).
export function groupCartBundles<
  T extends { price: number; quantity: number; bundle?: CartItemBundle | null }
>(items: T[]): CartBundleGroup<T>[] {
  const map = new Map<string, CartBundleGroup<T>>();
  for (const it of items) {
    if (!it.bundle) continue;
    const g = map.get(it.bundle.unitKey) ?? {
      bundleId: it.bundle.id,
      unitKey: it.bundle.unitKey,
      name: it.bundle.name,
      discountType: it.bundle.discountType,
      discountValue: it.bundle.discountValue,
      qty: it.quantity,
      base: 0,
      discount: 0,
      items: [],
    };
    g.base += it.price * it.quantity;
    g.qty = it.quantity;
    g.items.push(it);
    map.set(it.bundle.unitKey, g);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.discount = computeBundleDiscount(g.base, g.qty, g.discountType, g.discountValue);
  }
  return groups;
}
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts`
Expected: PASS (wszystkie describe zielone).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/bundles.ts app/_lib/__tests__/bundles.test.ts
git commit -m "feat(zestawy): czysta logika rabatow, grupowania i weryfikacji + testy"
```

---

### Task 3: Warstwa odczytu `bundles-server.ts` + `localizeBundle`

**Files:**
- Create: `app/_lib/bundles-server.ts`
- Modify: `app/_lib/localize.ts` (dodaj `localizeBundle` na końcu pliku)

**Interfaces:**
- Consumes: `Bundle`, `BundleWithComponents` (Task 1), `localizeProduct` (istniejący).
- Produces:
  - `BUNDLES_CACHE_TAG = "bundles"`
  - `getBundlesForProduct(productId: string, locale?: Locale, limit = 3): Promise<BundleWithComponents[]>`
  - `getBundleBySlug(slug: string, locale?: Locale): Promise<BundleWithComponents | null>`
  - `getActiveBundleSlugs(): Promise<string[]>` (sitemap)
  - `getAllBundlesAdmin(): Promise<(Bundle & { product_ids: string[] })[]>` (panel)
  - `invalidateBundlesCache(): void`

- [ ] **Step 1: Dodaj `localizeBundle` w `app/_lib/localize.ts`**

Na końcu pliku (wzorzec `localizeCollection`, linie 113–132):

```ts
type BundleLocalizable = {
  name: string;
  name_de?: string | null;
  description: string | null;
  description_de?: string | null;
};

// Zestaw: name (fallback PL) + description (nullable, jak kolekcja).
export function localizeBundle<T extends BundleLocalizable>(
  row: T,
  locale: Locale
): T {
  if (locale !== "de") return row;
  return {
    ...row,
    name: pickLocalized(row.name, row.name_de, locale),
    description: pickNullable(row.description, row.description_de),
  };
}
```

- [ ] **Step 2: Stwórz `app/_lib/bundles-server.ts`**

```ts
// Warstwa odczytu zestawów (wzorzec collections.ts): definicje z unstable_cache
// (tag "bundles"), składniki-produkty dociągane per wywołanie i lokalizowane.
// Zestaw jest WIDOCZNY tylko gdy: is_active ORAZ wszystkie składniki istnieją
// i są aktywne ORAZ składników >= 2 — inaczej znika z frontu (self-healing po
// usunięciu/ukryciu produktu).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeProduct, localizeBundle } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Bundle, BundleWithComponents, Product } from "./types";

export const BUNDLES_CACHE_TAG = "bundles";

type BundleRow = Bundle & { bundle_items: { product_id: string; position: number }[] };

const fetchAllBundles = unstable_cache(
  async (): Promise<BundleRow[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("bundles")
      .select("*, bundle_items(product_id, position)")
      .order("created_at", { ascending: false });
    return (data ?? []) as BundleRow[];
  },
  ["bundles-all"],
  { tags: [BUNDLES_CACHE_TAG], revalidate: 300 }
);

const getAllBundlesRaw = cache(fetchAllBundles);

// Dociąga aktywne produkty-składniki i odfiltrowuje niekompletne zestawy.
async function buildWithComponents(
  rows: BundleRow[],
  locale: Locale
): Promise<BundleWithComponents[]> {
  if (rows.length === 0) return [];
  const productIds = Array.from(
    new Set(rows.flatMap((r) => r.bundle_items.map((i) => i.product_id)))
  );
  if (productIds.length === 0) return [];
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)
    .eq("is_active", true);
  const byId = new Map(
    ((data ?? []) as Product[]).map((p) => [p.id, localizeProduct(p, locale)])
  );
  const out: BundleWithComponents[] = [];
  for (const r of rows) {
    const ordered = [...r.bundle_items].sort((a, b) => a.position - b.position);
    const components = ordered
      .map((i) => byId.get(i.product_id))
      .filter((p): p is Product => !!p);
    // Komplet = każdy wpis składu ma aktywny produkt i jest ich >= 2.
    if (components.length < 2 || components.length !== ordered.length) continue;
    const { bundle_items: _drop, ...bundle } = r;
    out.push({ ...localizeBundle(bundle, locale), components });
  }
  return out;
}

// Aktywne, kompletne zestawy zawierające produkt — do boxu na karcie produktu.
export async function getBundlesForProduct(
  productId: string,
  locale: Locale = DEFAULT_LOCALE,
  limit = 3
): Promise<BundleWithComponents[]> {
  const all = await getAllBundlesRaw();
  const rows = all.filter(
    (b) => b.is_active && b.bundle_items.some((i) => i.product_id === productId)
  );
  return (await buildWithComponents(rows, locale)).slice(0, limit);
}

// Pojedynczy zestaw do strony /zestaw/[slug]. Null gdy brak/nieaktywny/niekompletny.
export async function getBundleBySlug(
  slug: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<BundleWithComponents | null> {
  const all = await getAllBundlesRaw();
  const row = all.find((b) => b.slug === slug && b.is_active);
  if (!row) return null;
  const built = await buildWithComponents([row], locale);
  return built[0] ?? null;
}

// Slugi widocznych zestawów — do sitemapy.
export async function getActiveBundleSlugs(): Promise<string[]> {
  const all = await getAllBundlesRaw();
  const active = all.filter((b) => b.is_active);
  const built = await buildWithComponents(active, DEFAULT_LOCALE);
  return built.map((b) => b.slug);
}

// Panel admina: wszystkie zestawy (też nieaktywne/niekompletne) + skład.
// Bez cache — admin ma widzieć świeży stan.
export async function getAllBundlesAdmin(): Promise<(Bundle & { product_ids: string[] })[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("bundles")
    .select("*, bundle_items(product_id, position)")
    .order("created_at", { ascending: false });
  return ((data ?? []) as BundleRow[]).map((r) => {
    const { bundle_items, ...bundle } = r;
    return {
      ...bundle,
      product_ids: [...bundle_items]
        .sort((a, b) => a.position - b.position)
        .map((i) => i.product_id),
    };
  });
}

export function invalidateBundlesCache() {
  revalidateTag(BUNDLES_CACHE_TAG, "max");
}
```

- [ ] **Step 3: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: bez błędów.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/bundles-server.ts app/_lib/localize.ts
git commit -m "feat(zestawy): warstwa odczytu z cache (tag bundles) + localizeBundle"
```

---

### Task 4: Admin `/admin/zestawy`

**Files:**
- Create: `app/admin/zestawy/page.tsx`
- Create: `app/admin/zestawy/actions.ts`
- Create: `app/admin/zestawy/BundlesEditor.tsx`
- Modify: `app/admin/AdminShell.tsx:8-24` (NAV_ITEMS) + ikona na końcu pliku

**Interfaces:**
- Consumes: `getAllBundlesAdmin`, `invalidateBundlesCache` (Task 3), `requireAdmin`, `createAdminClient`, `normalizeSearchText` z `app/_lib/search-normalize`, `effectivePrice` z `app/_lib/pricing`, `computeBundleDiscount` (Task 2), RPC `save_bundle` (Task 1).
- Produces: server actions `createBundle(formData: FormData, productIds: string[]): Promise<ActionResult>`, `saveBundle(formData: FormData, productIds: string[]): Promise<ActionResult>`, `deleteBundle(formData: FormData): Promise<ActionResult>`.

- [ ] **Step 1: Napisz `app/admin/zestawy/actions.ts`**

Wzorzec 1:1 z `app/admin/kolekcje/actions.ts` (sanitize/emptyToNull/toSlug skopiuj stamtąd — są lokalne w tamtym pliku, NIE importuj):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateBundlesCache } from "@/app/_lib/bundles-server";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Wspólna walidacja pól formularza zestawu. Zwraca błąd (string) albo dane.
function parseBundleForm(formData: FormData, productIds: string[]):
  | { ok: true; name: string; nameDe: string | null; description: string | null;
      descriptionDe: string | null; discountType: "percent" | "amount";
      discountValue: number; isActive: boolean }
  | { ok: false; error: string } {
  const name = sanitize(formData.get("name"), 200);
  if (!name) return { ok: false, error: "Nazwa zestawu jest wymagana" };
  if (productIds.length < 2)
    return { ok: false, error: "Zestaw musi zawierać co najmniej 2 produkty" };
  if (new Set(productIds).size !== productIds.length)
    return { ok: false, error: "Produkty w zestawie nie mogą się powtarzać" };

  const discountType = sanitize(formData.get("discount_type"), 10);
  if (discountType !== "percent" && discountType !== "amount")
    return { ok: false, error: "Wybierz typ rabatu (% lub zł)" };

  const discountValue = Number(formData.get("discount_value"));
  if (!Number.isFinite(discountValue) || discountValue <= 0)
    return { ok: false, error: "Wartość rabatu musi być większa od zera" };
  if (discountType === "percent" && (discountValue < 1 || discountValue > 90))
    return { ok: false, error: "Rabat procentowy musi być w zakresie 1–90%" };

  return {
    ok: true,
    name,
    nameDe: emptyToNull(sanitize(formData.get("name_de"), 200)),
    description: emptyToNull(sanitize(formData.get("description"), 2000)),
    descriptionDe: emptyToNull(sanitize(formData.get("description_de"), 2000)),
    discountType,
    discountValue,
    isActive: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

function invalidateAll() {
  invalidateBundlesCache();
  // Boxy zestawów siedzą na kartach produktów i stronach /zestaw/* — pełny
  // revalidate jak przy publikacji menu/podstron (prostota > chirurgia).
  revalidatePath("/", "layout");
  revalidatePath("/admin/zestawy");
}

export async function createBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const slugInput = sanitize(formData.get("slug"), 80);
  const slug = slugInput ? toSlug(slugInput) : toSlug(parsed.name);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować adresu (slug)" };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("bundles")
    .insert({
      slug,
      name: parsed.name,
      name_de: parsed.nameDe,
      description: parsed.description,
      description_de: parsed.descriptionDe,
      discount_type: parsed.discountType,
      discount_value: parsed.discountValue,
      is_active: parsed.isActive,
    } as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `Zestaw o adresie "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  // Skład w drugim kroku przez RPC. Gdy padnie — zestaw istnieje bez składu,
  // jest NIEWIDOCZNY dla klientów (< 2 składników) i da się naprawić edycją.
  const { error: itemsErr } = await supabase.rpc("save_bundle", {
    p_id: (data as { id: string }).id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (itemsErr)
    return { ok: false, error: `Zestaw utworzony, ale skład się nie zapisał — otwórz go i zapisz ponownie (${itemsErr.message})` };

  invalidateAll();
  return { ok: true, message: `Zestaw "${parsed.name}" utworzony` };
}

export async function saveBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("save_bundle", {
    p_id: id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (error) return { ok: false, error: error.message };

  invalidateAll();
  return { ok: true, message: "Zestaw zapisany" };
}

export async function deleteBundle(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("bundles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateAll();
  return { ok: true, message: "Zestaw usunięty" };
}
```

- [ ] **Step 2: Napisz `app/admin/zestawy/page.tsx`**

Uwaga: `page.tsx` w App Routerze NIE może eksportować dowolnych nazw (walidator
tras Next odrzuca obce eksporty) — typ `PickerProduct` definiuj i eksportuj z
`BundlesEditor.tsx`, a tu tylko importuj.

```tsx
import { getAllBundlesAdmin } from "@/app/_lib/bundles-server";
import { createAdminClient } from "@/app/_lib/supabase/server";
import BundlesEditor, { type PickerProduct } from "./BundlesEditor";

export const metadata = { title: "Zestawy — Admin" };

export default async function AdminZestawyPage() {
  const supabase = await createAdminClient();
  const [bundles, { data: products }] = await Promise.all([
    getAllBundlesAdmin(),
    supabase
      .from("products")
      .select("id, name, price, sale_price, images, is_active")
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-2">Zestawy</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Połącz 2 lub więcej mebli (np. fotel + narożnik) w zestaw z rabatem.
        Klient zobaczy ofertę zestawu na kartach tych produktów.
      </p>
      <BundlesEditor
        bundles={bundles}
        products={((products ?? []) as PickerProduct[]).filter((p) => p.is_active)}
      />
    </div>
  );
}
```

Uwaga: `export type PickerProduct` jest legalny — `page.tsx` NIE jest plikiem `"use server"`.

- [ ] **Step 3: Napisz `app/admin/zestawy/BundlesEditor.tsx`**

Client component — lista + formularz (jeden na raz, jak `CollectionsEditor`). Kompletny szkielet (styling dopasuj do `app/admin/kolekcje/CollectionsEditor.tsx` — te same klasy kart/inputów/toasta; jeśli istnieje współdzielony `_shared`, użyj go):

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import type { Bundle } from "@/app/_lib/types";
import { normalizeSearchText } from "@/app/_lib/search-normalize";
import { effectivePrice } from "@/app/_lib/pricing";
import { computeBundleDiscount, type BundleDiscountType } from "@/app/_lib/bundles";
import { formatPrice } from "@/app/_lib/format";
import { createBundle, saveBundle, deleteBundle } from "./actions";

// Minimalny kształt produktu do pickera (lista może mieć setki pozycji —
// page.tsx nie ciągnie pełnych wierszy). Eksport stąd, NIE z page.tsx.
export type PickerProduct = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
  is_active: boolean;
};

type AdminBundle = Bundle & { product_ids: string[] };

export default function BundlesEditor({
  bundles,
  products,
}: {
  bundles: AdminBundle[];
  products: PickerProduct[];
}) {
  const [editing, setEditing] = useState<AdminBundle | "new" | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <p
          className={`text-sm rounded-xl px-4 py-3 border ${
            toast.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {toast.text}
        </p>
      )}

      {editing === null ? (
        <>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="self-start px-5 py-2.5 bg-[var(--color-navy)] text-white text-sm font-semibold rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            + Nowy zestaw
          </button>
          {bundles.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nie masz jeszcze żadnych zestawów.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {bundles.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-4 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--fg)]">
                      {b.name}{" "}
                      {!b.is_active && (
                        <span className="text-xs text-[var(--muted)]">(nieaktywny)</span>
                      )}
                      {b.product_ids.length < 2 && (
                        <span className="text-xs text-red-600"> (niekompletny — min 2 produkty)</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted)] truncate">
                      {b.product_ids
                        .map((id) => productById.get(id)?.name ?? "(produkt ukryty/usunięty)")
                        .join(" + ")}{" "}
                      · rabat{" "}
                      {b.discount_type === "percent"
                        ? `${b.discount_value}%`
                        : `${b.discount_value} zł`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a
                      href={`/zestaw/${b.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)]"
                    >
                      Podgląd
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditing(b)}
                      className="text-xs uppercase tracking-widest text-[var(--color-gold)] hover:underline"
                    >
                      Edytuj
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <BundleForm
          bundle={editing === "new" ? null : editing}
          products={products}
          onDone={(msg) => {
            setEditing(null);
            if (msg) setToast(msg);
          }}
        />
      )}
    </div>
  );
}

function BundleForm({
  bundle,
  products,
  onDone,
}: {
  bundle: AdminBundle | null;
  products: PickerProduct[];
  onDone: (toast: { ok: boolean; text: string } | null) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(bundle?.product_ids ?? []);
  const [discountType, setDiscountType] = useState<BundleDiscountType>(
    bundle?.discount_type ?? "percent"
  );
  const [discountValue, setDiscountValue] = useState<string>(
    bundle ? String(bundle.discount_value) : "10"
  );
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Wyszukiwarka jak w /admin/produkty — filtr kliencki po znormalizowanym tekście.
  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return products;
    return products.filter((p) => normalizeSearchText(p.name).includes(q));
  }, [products, query]);

  // Podgląd na żywo: suma cen bazowych (efektywnych) → cena zestawu.
  const baseSum = selectedIds.reduce((s, id) => {
    const p = productById.get(id);
    return p ? s + effectivePrice(Number(p.price), p.sale_price) : s;
  }, 0);
  const parsedValue = Number(discountValue);
  const previewDiscount =
    Number.isFinite(parsedValue) && parsedValue > 0
      ? computeBundleDiscount(baseSum, 1, discountType, parsedValue)
      : 0;

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = bundle ? saveBundle : createBundle;
      const res = await action(formData, selectedIds);
      if (res.ok) onDone({ ok: true, text: res.message ?? "Zapisano" });
      else setError(res.error);
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-5 p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      {bundle && <input type="hidden" name="id" value={bundle.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Nazwa zestawu *</span>
          <input name="name" defaultValue={bundle?.name ?? ""} required maxLength={200}
            className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Nazwa (niemiecki)</span>
          <input name="name_de" defaultValue={bundle?.name_de ?? ""} maxLength={200}
            className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Opis (opcjonalny)</span>
          <textarea name="description" defaultValue={bundle?.description ?? ""} rows={2} maxLength={2000}
            className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent resize-y" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Opis (niemiecki)</span>
          <textarea name="description_de" defaultValue={bundle?.description_de ?? ""} rows={2} maxLength={2000}
            className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent resize-y" />
        </label>
        {!bundle && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">Adres (slug — puste = z nazwy)</span>
            <input name="slug" maxLength={80} placeholder="np. zestaw-loft"
              className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent font-mono" />
          </label>
        )}
      </div>

      {/* Rabat */}
      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="text-sm text-[var(--muted)] mb-2">Rabat zestawu *</legend>
        <div className="flex rounded-full border border-[var(--border)] overflow-hidden">
          {(["percent", "amount"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDiscountType(t)}
              className={`px-4 py-2 text-sm ${
                discountType === t
                  ? "bg-[var(--color-navy)] text-white"
                  : "text-[var(--muted)]"
              }`}
            >
              {t === "percent" ? "%" : "zł"}
            </button>
          ))}
        </div>
        <input type="hidden" name="discount_type" value={discountType} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">
            {discountType === "percent" ? "Procent (1–90)" : "Kwota w zł"}
          </span>
          <input
            name="discount_value"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            type="number"
            min={discountType === "percent" ? 1 : 0.01}
            max={discountType === "percent" ? 90 : undefined}
            step={discountType === "percent" ? 1 : 0.01}
            required
            className="w-32 px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
          <input type="checkbox" name="is_active" defaultChecked={bundle?.is_active ?? true} />
          Aktywny (widoczny w sklepie)
        </label>
      </fieldset>

      {/* Picker produktów */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-[var(--muted)]">
          Produkty w zestawie * (min 2) — wybrano: {selectedIds.length}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj produktu…"
          className="px-3 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm"
        />
        <ul className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {filtered.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--bg)]">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.images?.[0] && (
                  <Image src={p.images[0]} alt="" width={32} height={32}
                    className="rounded object-cover w-8 h-8" />
                )}
                <span className="flex-1 min-w-0 truncate text-[var(--fg)]">{p.name}</span>
                <span className="text-[var(--muted)]">
                  {formatPrice(effectivePrice(Number(p.price), p.sale_price), "pl")}
                </span>
              </label>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-sm text-[var(--muted)]">Brak wyników.</li>
          )}
        </ul>
      </div>

      {/* Podgląd na żywo */}
      {selectedIds.length >= 2 && (
        <div className="text-sm bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[var(--muted)]">
            Razem osobno: <b className="text-[var(--fg)]">{formatPrice(baseSum, "pl")}</b>
          </p>
          <p className="text-[var(--muted)]">
            W zestawie:{" "}
            <b className="text-[var(--fg)]">{formatPrice(Math.max(0, baseSum - previewDiscount), "pl")}</b>{" "}
            <span className="text-emerald-700">(klient oszczędza {formatPrice(previewDiscount, "pl")})</span>
          </p>
          {discountType === "amount" && parsedValue >= baseSum && baseSum > 0 && (
            <p className="text-amber-700 mt-1">
              Uwaga: kwota rabatu jest większa lub równa sumie cen — zestaw wyjdzie za 0 zł.
            </p>
          )}
          <p className="text-xs text-[var(--muted)] mt-2">
            Ceny bazowe bez dopłat za tkaniny/opcje — rzeczywisty rabat liczy się od
            cen z wybranymi dopłatami.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selectedIds.length < 2}
          className="px-6 py-2.5 bg-[var(--color-navy)] text-white text-sm font-semibold rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : bundle ? "Zapisz zestaw" : "Utwórz zestaw"}
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Anuluj
        </button>
        {bundle && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Usunąć zestaw "${bundle.name}"? Produkty zostają w sklepie.`)) return;
              const fd = new FormData();
              fd.set("id", bundle.id);
              startTransition(async () => {
                const res = await deleteBundle(fd);
                onDone(res.ok ? { ok: true, text: res.message ?? "Usunięto" } : { ok: false, text: res.error });
              });
            }}
            className="ml-auto text-sm text-red-600 hover:underline"
          >
            Usuń zestaw
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Dodaj wpis w NAV_ITEMS (`app/admin/AdminShell.tsx`)**

Po linii `{ href: "/admin/kolekcje", ... }` dodaj:

```ts
  { href: "/admin/zestawy", label: "Zestawy", icon: BundlesIcon },
```

Na końcu pliku (obok pozostałych ikon) dodaj komponent ikony:

```tsx
function BundlesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="9" width="9" height="11" rx="1" />
      <rect x="13" y="5" width="8" height="15" rx="1" />
      <path d="M3 13h9M13 9h8" />
    </svg>
  );
}
```

(Dopasuj sygnaturę do istniejących ikon w tym pliku — jeśli nie przyjmują `className`, zrób identycznie jak sąsiednie.)

- [ ] **Step 5: Weryfikacja**

Run: `npx tsc --noEmit`
Expected: bez błędów.
Run: `npm run build`
Expected: build zielony, w spisie tras pojawia się `ƒ /admin/zestawy`.

- [ ] **Step 6: Commit**

```bash
git add app/admin/zestawy app/admin/AdminShell.tsx
git commit -m "feat(zestawy): panel /admin/zestawy - CRUD, picker produktow, podglad rabatu"
```

---

### Task 5: CartContext — obsługa zestawów (TDD)

**Files:**
- Modify: `app/_context/CartContext.tsx`
- Test: `app/_lib/__tests__/cart-reducer.test.ts`

**Interfaces:**
- Consumes: `CartItemBundle` (Task 2).
- Produces:
  - `CartItem.bundle?: CartItemBundle` (nowe pole)
  - eksport `cartReducer` i typów `CartState`, `CartAction` (do testów)
  - nowe akcje reducera: `ADD_BUNDLE { items }`, `REMOVE_BUNDLE { unitKey }`, `UPDATE_BUNDLE_QTY { unitKey, quantity }`
  - nowe metody kontekstu: `addBundle(items: CartItem[])`, `removeBundle(unitKey: string)`, `updateBundleQty(unitKey: string, quantity: number)`
  - `updateNotes(id, notes, variantValues?, bundleUnitKey?)` — czwarty parametr opcjonalny
  - `cartItemKey(id, values?, bundleUnitKey?)` — trzeci parametr opcjonalny

- [ ] **Step 1: Napisz failing testy reducera**

```ts
// app/_lib/__tests__/cart-reducer.test.ts
import { describe, it, expect } from "vitest";
import { cartReducer, type CartState } from "@/app/_context/CartContext";
import type { CartItem } from "@/app/_context/CartContext";

const empty: CartState = { items: [], appliedPromo: null, hydrated: true };

const bundleMeta = {
  id: "b1",
  name: "Zestaw Loft",
  unitKey: "b1##p1::Tkanina=Sawana 21||p2::Tkanina=Sawana 21",
  discountType: "percent" as const,
  discountValue: 10,
};

function bundleItems(qty = 1): CartItem[] {
  return [
    { id: "p1", name: "Fotel", price: 3000, image: "", quantity: qty, variantValues: { Tkanina: "Sawana 21" }, bundle: bundleMeta },
    { id: "p2", name: "Narożnik", price: 2200, image: "", quantity: qty, variantValues: { Tkanina: "Sawana 21" }, bundle: bundleMeta },
  ];
}

describe("cartReducer — zestawy", () => {
  it("ADD_BUNDLE dodaje wszystkie składniki atomowo", () => {
    const s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.bundle?.unitKey === bundleMeta.unitKey)).toBe(true);
  });

  it("ADD_BUNDLE z tym samym unitKey zwiększa ilości całej grupy", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, { type: "ADD_BUNDLE", items: bundleItems() });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.quantity === 2)).toBe(true);
  });

  it("ten sam produkt solo i w zestawie to OSOBNE pozycje", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    expect(s.items).toHaveLength(3);
    const solo = s.items.filter((i) => i.id === "p1" && !i.bundle);
    expect(solo).toHaveLength(1);
    expect(solo[0].quantity).toBe(1);
  });

  it("REMOVE solo NIE usuwa pozycji zestawowej o tym samym id+wariancie", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    s = cartReducer(s, { type: "REMOVE", id: "p1", variantValues: { Tkanina: "Sawana 21" } });
    expect(s.items).toHaveLength(2);
    expect(s.items.every((i) => i.bundle)).toBe(true);
  });

  it("REMOVE_BUNDLE usuwa całą grupę i nic poza nią", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "solo", name: "Puf", price: 400, image: "", quantity: 1 },
    });
    s = cartReducer(s, { type: "REMOVE_BUNDLE", unitKey: bundleMeta.unitKey });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].id).toBe("solo");
  });

  it("UPDATE_BUNDLE_QTY synchronizuje ilości wszystkich składników (clamp 1..99)", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, { type: "UPDATE_BUNDLE_QTY", unitKey: bundleMeta.unitKey, quantity: 3 });
    expect(s.items.every((i) => i.quantity === 3)).toBe(true);
    s = cartReducer(s, { type: "UPDATE_BUNDLE_QTY", unitKey: bundleMeta.unitKey, quantity: 500 });
    expect(s.items.every((i) => i.quantity === 99)).toBe(true);
  });

  it("UPDATE_NOTES z bundleUnitKey trafia w składnik zestawu, bez — w solo", () => {
    let s = cartReducer(empty, { type: "ADD_BUNDLE", items: bundleItems() });
    s = cartReducer(s, {
      type: "ADD",
      item: { id: "p1", name: "Fotel", price: 3000, image: "", quantity: 1, variantValues: { Tkanina: "Sawana 21" } },
    });
    s = cartReducer(s, {
      type: "UPDATE_NOTES",
      id: "p1",
      variantValues: { Tkanina: "Sawana 21" },
      notes: "solo-nota",
    });
    s = cartReducer(s, {
      type: "UPDATE_NOTES",
      id: "p1",
      variantValues: { Tkanina: "Sawana 21" },
      notes: "bundle-nota",
      bundleUnitKey: bundleMeta.unitKey,
    });
    expect(s.items.find((i) => i.id === "p1" && !i.bundle)?.notes).toBe("solo-nota");
    expect(s.items.find((i) => i.id === "p1" && i.bundle)?.notes).toBe("bundle-nota");
  });

  it("HYDRATE ze starymi wpisami bez bundle działa bez migracji", () => {
    const s = cartReducer(empty, {
      type: "HYDRATE",
      items: [{ id: "old", name: "Stary", price: 100, image: "", quantity: 1 }],
      appliedPromo: null,
    });
    expect(s.items).toHaveLength(1);
    expect(s.hydrated).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają FAILować**

Run: `npx vitest run app/_lib/__tests__/cart-reducer.test.ts`
Expected: FAIL — `cartReducer` nie jest eksportowany / `ADD_BUNDLE` nieznany.

- [ ] **Step 3: Zmodyfikuj `app/_context/CartContext.tsx`**

Konkretne zmiany (zachowaj resztę pliku bez zmian):

1. Import na górze:

```ts
import type { CartItemBundle } from "@/app/_lib/bundles";
```

2. W typie `CartItem` po `notes?: string;` dodaj:

```ts
  // Znacznik zestawu (spec 2026-07-16). Pozycje z tym samym unitKey tworzą
  // jedną grupę „Zestaw" w koszyku. Optional dla backward compat (stare
  // localStorage bez pola działa bez migracji).
  bundle?: CartItemBundle;
```

3. `itemKey` — trzeci segment klucza (składnik zestawu ≠ pozycja solo):

```ts
function itemKey(
  id: string,
  values?: Record<string, string>,
  bundleUnitKey?: string
): string {
  return id + "::" + variantKey(values) + "::" + (bundleUnitKey ?? "");
}
```

4. W `CartAction` dodaj trzy akcje i rozszerz `UPDATE_NOTES`:

```ts
  | { type: "ADD_BUNDLE"; items: CartItem[] }
  | { type: "REMOVE_BUNDLE"; unitKey: string }
  | { type: "UPDATE_BUNDLE_QTY"; unitKey: string; quantity: number }
```

oraz w `UPDATE_NOTES` dodaj pole `bundleUnitKey?: string;`.

5. W reducerze:
- case `ADD`: klucz licz z `action.item.bundle?.unitKey`:

```ts
      const key = itemKey(action.item.id, action.item.variantValues, action.item.bundle?.unitKey);
      const existing = state.items.find(
        (i) => itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
      );
```

(analogicznie w map wewnątrz `ADD`). Case `REMOVE` / `UPDATE_QTY` zostają na 2-argumentowym kluczu porównywanym z `itemKey(i.id, i.variantValues, i.bundle?.unitKey)` — pozycje zestawowe mają niepusty trzeci segment, więc nigdy nie łapią się na akcje solo.
- case `UPDATE_NOTES`: porównuj pełne klucze:

```ts
    case "UPDATE_NOTES": {
      const key = itemKey(action.id, action.variantValues, action.bundleUnitKey);
      return {
        ...state,
        items: state.items.map((i) =>
          itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
            ? { ...i, notes: action.notes }
            : i
        ),
      };
    }
```

- nowe case'y:

```ts
    case "ADD_BUNDLE": {
      if (action.items.length === 0) return state;
      const unitKey = action.items[0].bundle?.unitKey;
      if (!unitKey) return state;
      const exists = state.items.some((i) => i.bundle?.unitKey === unitKey);
      if (exists) {
        const inc = clampQty(action.items[0].quantity);
        return {
          ...state,
          items: state.items.map((i) =>
            i.bundle?.unitKey === unitKey
              ? { ...i, quantity: clampQty(i.quantity + inc) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          ...action.items.map((i) => ({ ...i, quantity: clampQty(i.quantity) })),
        ],
      };
    }
    case "REMOVE_BUNDLE":
      return {
        ...state,
        items: state.items.filter((i) => i.bundle?.unitKey !== action.unitKey),
      };
    case "UPDATE_BUNDLE_QTY":
      return {
        ...state,
        items: state.items.map((i) =>
          i.bundle?.unitKey === action.unitKey
            ? { ...i, quantity: clampQty(action.quantity) }
            : i
        ),
      };
```

6. Eksporty do testów — zmień definicję reducera na eksportowaną i dodaj typy:

```ts
export type { CartState, CartAction };
export function cartReducer(state: CartState, action: CartAction): CartState { ... }
```

(plik jest `"use client"`, NIE `"use server"` — `export type` jest tu bezpieczny).

7. W `CartContextValue` + providerze dodaj:

```ts
  addBundle: (items: CartItem[]) => void;
  removeBundle: (unitKey: string) => void;
  updateBundleQty: (unitKey: string, quantity: number) => void;
```

```ts
  const addBundle = useCallback((items: CartItem[]) => {
    dispatch({ type: "ADD_BUNDLE", items });
    if (items[0]) setNotification({ item: items[0], ts: Date.now() });
  }, []);
  const removeBundle = useCallback(
    (unitKey: string) => dispatch({ type: "REMOVE_BUNDLE", unitKey }),
    []
  );
  const updateBundleQty = useCallback(
    (unitKey: string, quantity: number) =>
      dispatch({ type: "UPDATE_BUNDLE_QTY", unitKey, quantity }),
    []
  );
```

`updateNotes` dostaje czwarty parametr `bundleUnitKey?: string` przekazywany do dispatch. Dodaj wszystkie trzy metody do `value` i deps `useMemo`. Zaktualizuj też eksport `cartItemKey` (sygnatura z trzecim parametrem — wywołania z 2 argumentami dalej działają).

- [ ] **Step 4: Uruchom testy — mają przejść (i nic się nie zepsuło)**

Run: `npx vitest run app/_lib/__tests__/cart-reducer.test.ts`
Expected: PASS.
Run: `npm test`
Expected: wszystkie testy repo PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_context/CartContext.tsx app/_lib/__tests__/cart-reducer.test.ts
git commit -m "feat(zestawy): koszyk - grupy zestawow w reducerze (ADD/REMOVE/QTY) + testy"
```

---

### Task 6: UI koszyka + słowniki + promo od pozycji spoza zestawów

**Files:**
- Modify: `app/koszyk/page.tsx`
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (nowa sekcja `bundle`)

**Interfaces:**
- Consumes: `groupCartBundles`, `eligiblePromoBase` (Task 2); `removeBundle`, `updateBundleQty`, `updateNotes(..., bundleUnitKey)` (Task 5).
- Produces: sekcja słownika `t.bundle` używana też w Taskach 8–9.

- [ ] **Step 1: Dodaj sekcję `bundle` do OBU słowników**

W `app/_lib/dictionaries/pl.ts` (top-level, obok `cart`):

```ts
  bundle: {
    badge: "W zestawie taniej",
    savesFrom: "Oszczędzasz od",
    saves: "Oszczędzasz",
    buy: "Kup w zestawie",
    see: "Zobacz zestaw",
    withProducts: "Razem z:",
    togetherLabel: "Razem osobno",
    bundleLabel: "W zestawie",
    addToCart: "Dodaj zestaw do koszyka",
    chooseOptions: "Wybierz opcje dla każdego mebla",
    cartGroupLabel: "Zestaw",
    removeBundle: "Usuń zestaw",
    discountLine: "Rabat za zestaw",
    promoExcluded: "Kod rabatowy nie obejmuje produktów kupionych w zestawie",
  },
```

W `app/_lib/dictionaries/de.ts` (ta sama struktura):

```ts
  bundle: {
    badge: "Im Set günstiger",
    savesFrom: "Sie sparen ab",
    saves: "Sie sparen",
    buy: "Im Set kaufen",
    see: "Set ansehen",
    withProducts: "Zusammen mit:",
    togetherLabel: "Einzeln zusammen",
    bundleLabel: "Im Set",
    addToCart: "Set in den Warenkorb",
    chooseOptions: "Wählen Sie Optionen für jedes Möbelstück",
    cartGroupLabel: "Set",
    removeBundle: "Set entfernen",
    discountLine: "Set-Rabatt",
    promoExcluded: "Der Rabattcode gilt nicht für Produkte im Set",
  },
```

Jeśli słowniki mają wspólny typ (np. `Dictionary`), dopisz sekcję również tam. Sprawdź istniejący test parytetu PL↔DE (`npm test`) — ma przechodzić.

- [ ] **Step 2: Przebuduj `app/koszyk/page.tsx`**

Zmiany (reszta pliku bez zmian):

1. Importy: dodaj `groupCartBundles, eligiblePromoBase` z `@/app/_lib/bundles`; z `useCart()` weź dodatkowo `removeBundle, updateBundleQty`.

2. Po destrukturyzacji `useCart()` policz:

```ts
  const soloItems = items.filter((i) => !i.bundle);
  const bundleGroups = groupCartBundles(items);
  const bundleDiscount = bundleGroups.reduce((s, g) => s + g.discount, 0);
  const eligibleBase = eligiblePromoBase(
    items.map((i) => ({ subtotal: i.price * i.quantity, bundle: i.bundle ?? null }))
  );
  const discount = appliedPromo?.discount ?? 0;
  const grandTotal = Math.max(0, total - bundleDiscount - discount);
```

3. Re-walidacja i aplikowanie kodu: wszędzie gdzie było `total` jako podstawa kodu (`applyPromoCodeAction(appliedPromo.code, total)`, `<PromoInput cartTotal={total} ...>`, dep efektu) podstaw `eligibleBase`. Gdy `eligibleBase === 0` a w koszyku są zestawy — zamiast `PromoInput` pokaż:

```tsx
  {eligibleBase === 0 && bundleGroups.length > 0 ? (
    <p className="text-xs text-[var(--muted)]">{t.bundle.promoExcluded}</p>
  ) : (
    <PromoInput cartTotal={eligibleBase} ... />
  )}
```

a pod aktywnym `PromoInput` (gdy są też zestawy) dopisz hint `t.bundle.promoExcluded` małym drukiem.

4. Lista pozycji: renderuj `soloItems` dotychczasową kartą (bez zmian), a NAD nimi grupy zestawów — jedna karta na grupę:

```tsx
  {bundleGroups.map((g) => (
    <div key={g.unitKey} className="p-6 bg-[var(--card-bg)] border-2 border-[var(--color-gold)]/40 rounded-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-sans text-xs uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
          {t.bundle.cartGroupLabel}: <span className="text-[var(--fg)] normal-case tracking-normal font-semibold">{g.name}</span>
        </p>
        <button
          onClick={() => removeBundle(g.unitKey)}
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500 transition-colors"
        >
          {t.bundle.removeBundle}
        </button>
      </div>

      {g.items.map((item) => (
        <div key={cartItemKey(item.id, item.variantValues, item.bundle?.unitKey)} className="flex gap-4 items-start">
          {/* Miniatura + nazwa + etykieta wariantu: SKOPIUJ 1:1 bloki
              <LocalizedLink> ze zdjęciem (obecne linie ~148-164 tego pliku)
              i nagłówek z formatVariantLabel (linie ~166-177) z karty solo
              poniżej. POMIŃ stepper ilości i przycisk usuwania pozycji —
              zestaw ma jeden wspólny stepper i jedno usuwanie (niżej). */}
          <div className="flex-1 min-w-0">
            {/* ...skopiowany blok nazwy + formatVariantLabel... */}
            <ItemNotes
              initial={item.notes ?? ""}
              onSave={(notes) => updateNotes(item.id, notes, item.variantValues, item.bundle?.unitKey)}
              labels={{
                add: t.cart.addNotes,
                label: t.cart.notesLabel,
                placeholder: t.cart.notesPlaceholder,
                charsSuffix: t.cart.notesCharsSuffix,
                unsaved: t.cart.notesUnsaved,
                remove: t.cart.removeNotes,
              }}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        {/* jeden stepper ilości dla całego zestawu */}
        <div className="flex items-center gap-3 border border-[var(--border)] rounded-full px-4 py-2">
          <button onClick={() => (g.qty > 1 ? updateBundleQty(g.unitKey, g.qty - 1) : removeBundle(g.unitKey))} className="w-5 h-5 font-bold">−</button>
          <span className="font-sans font-semibold text-sm w-4 text-center">{g.qty}</span>
          <button onClick={() => updateBundleQty(g.unitKey, g.qty + 1)} className="w-5 h-5 font-bold">+</button>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)] line-through">{formatMoney(g.base, locale, rate)}</p>
          <p className="font-sans font-bold text-[var(--fg)]">{formatMoney(g.base - g.discount, locale, rate)}</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {t.bundle.saves} {formatMoney(g.discount, locale, rate)}
          </p>
        </div>
      </div>
    </div>
  ))}
```

(Stylistykę miniatur/nazwy skopiuj z istniejącej karty solo w tym samym pliku — ma wyglądać spójnie.)

5. Podsumowanie: nad linią kodu rabatowego dodaj linię rabatu zestawów:

```tsx
  {bundleDiscount > 0 && (
    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
      <span>{t.bundle.discountLine}</span>
      <span>−{formatMoney(bundleDiscount, locale, rate)}</span>
    </div>
  )}
```

`grandTotal` już policzony w kroku 2.

- [ ] **Step 3: Weryfikacja**

Run: `npm test` — parytet słowników + wszystkie testy PASS.
Run: `npx tsc --noEmit` — bez błędów.
Run: `npm run build` — zielony.

- [ ] **Step 4: Commit**

```bash
git add app/koszyk/page.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(zestawy): koszyk grupuje zestawy, rabat w podsumowaniu, kod rabatowy poza zestawami"
```

---

### Task 7: Checkout serwerowy + ślad zestawu na zamówieniach

**Files:**
- Modify: `app/api/checkout/route.ts` (payload ~26–42, pętla pozycji ~136–232, promo ~237–279, total ~284, createOrder ~292–303)
- Modify: `app/_lib/orders.ts:4-70` (`CreateOrderInput` + insert)
- Modify: `app/checkout/CheckoutForm.tsx` (payload items + linia rabatu zestawu w podsumowaniu, jeśli formularz pokazuje kwoty)
- Modify: `app/admin/zamowienia/[id]/page.tsx` oraz widok pozycji w koncie klienta (`app/konto/zamowienia/[id]/page.tsx`) — dopisek „(zestaw: …)" przy pozycji z `bundle_label`

**Interfaces:**
- Consumes: `groupBundleUnits`, `verifyBundleGroup`, `computeBundleDiscount`, `eligiblePromoBase` (Task 2); kolumny z Task 1.
- Produces: `CheckoutBody.items[].bundle?: { id: string; unitKey: string } | null`; `CreateOrderInput.items[].bundle_id/bundle_label`, `CreateOrderInput.bundleDiscount?: number`.

- [ ] **Step 1: Rozszerz payload i pętlę w `app/api/checkout/route.ts`**

W `CheckoutBody.items` dodaj pole:

```ts
    bundle?: { id: string; unitKey: string } | null;
```

Importy: dodaj `createAdminClient` z `@/app/_lib/supabase/server` oraz z `@/app/_lib/bundles`: `groupBundleUnits, verifyBundleGroup, computeBundleDiscount, eligiblePromoBase`.

Typ `orderItems` (linie ~136–142) rozszerz o:

```ts
      bundle_id?: string | null;
      bundle_label?: string | null;
```

- [ ] **Step 2: Blok zestawów PO pętli pozycji, PRZED blokiem promo (po linii ~232)**

```ts
    // ── Zestawy (spec 2026-07-16): klient przysyła tylko {id, unitKey} —
    // skład i rabat weryfikujemy/liczymy wyłącznie z danych serwerowych.
    const computedItems = body.items.map((it, idx) => ({
      productId: it.id,
      quantity: it.quantity,
      subtotal: orderItems[idx].price * it.quantity,
      bundle: it.bundle ?? null,
    }));
    const bundleGroups = groupBundleUnits(computedItems);
    let bundleDiscount = 0;

    if (bundleGroups.length > 0) {
      const admin = await createAdminClient();
      const bundleIds = Array.from(new Set(bundleGroups.map((g) => g.bundleId)));
      const { data: bundleRows, error: bundleErr } = await admin
        .from("bundles")
        .select("id, name, is_active, discount_type, discount_value, bundle_items(product_id)")
        .in("id", bundleIds);
      if (bundleErr || !bundleRows) {
        return NextResponse.json(
          { error: tr("Błąd bazy zestawów", "Fehler in der Set-Datenbank") },
          { status: 500 }
        );
      }
      type BundleRowLite = {
        id: string;
        name: string;
        is_active: boolean;
        discount_type: "percent" | "amount";
        discount_value: number;
        bundle_items: { product_id: string }[];
      };
      const byId = new Map((bundleRows as BundleRowLite[]).map((b) => [b.id, b]));
      const infoByUnit = new Map<string, { id: string; label: string }>();

      for (const group of bundleGroups) {
        const row = byId.get(group.bundleId);
        const verdict = verifyBundleGroup(
          group,
          row
            ? {
                id: row.id,
                is_active: row.is_active,
                productIds: row.bundle_items.map((bi) => bi.product_id),
              }
            : null
        );
        if (!verdict.ok) {
          return NextResponse.json(
            {
              error: tr(
                "Zestaw w koszyku jest już nieaktualny — usuń go i dodaj ponownie",
                "Das Set im Warenkorb ist nicht mehr aktuell — bitte entfernen und erneut hinzufügen"
              ),
            },
            { status: 400 }
          );
        }
        const base = group.items.reduce((s, i) => s + i.subtotal, 0);
        bundleDiscount += computeBundleDiscount(
          base,
          group.items[0].quantity,
          row!.discount_type,
          Number(row!.discount_value)
        );
        infoByUnit.set(group.unitKey, { id: row!.id, label: row!.name });
      }
      bundleDiscount = Math.round(bundleDiscount * 100) / 100;

      // Ślad zestawu na pozycjach zamówienia.
      body.items.forEach((it, idx) => {
        if (!it.bundle) return;
        const info = infoByUnit.get(it.bundle.unitKey);
        if (info) {
          orderItems[idx].bundle_id = info.id;
          orderItems[idx].bundle_label = info.label;
        }
      });
    }
```

- [ ] **Step 3: Kod rabatowy liczony od pozycji spoza zestawów**

W bloku promo (linia ~241) przed walidacją policz podstawę i dodaj zaporę:

```ts
      const eligibleBase =
        Math.round(eligiblePromoBase(computedItems) * 100) / 100;
      if (eligibleBase <= 0) {
        return NextResponse.json(
          {
            error: tr(
              "Kod rabatowy nie obejmuje produktów kupionych w zestawie",
              "Der Rabattcode gilt nicht für Produkte im Set"
            ),
          },
          { status: 400 }
        );
      }
      const promoResult = await validatePromoCode(body.promoCode, eligibleBase, locale);
```

(`validatePromoCode` dostaje `eligibleBase` zamiast `total` — clamp do podstawy i `min_order_value` załatwia istniejąca implementacja.)

- [ ] **Step 4: Total, kupon Stripe i createOrder**

Zamień linię `const finalTotal = ...` (~284) na:

```ts
    const finalTotal = toCharge(Math.max(0, total - bundleDiscount - promoDiscount));
```

Kupon Stripe: dotychczasowy blok tworzył kupon TYLKO dla promo. Przenieś tworzenie kuponu POZA `if (body.promoCode)` — wspólna kwota rabatów:

```ts
    // Jeden kupon Stripe na łączny rabat (zestawy + kod) — line_items idą w
    // pełnych cenach, a amount_off jest NASZĄ kwotą (bez własnych zaokrągleń
    // Stripe; ta sama kwota siedzi w orders.bundle_discount/promo_discount).
    if (!isCod && bundleDiscount + promoDiscount > 0) {
      const amountOffGr = Math.round(toCharge(bundleDiscount + promoDiscount) * 100);
      if (amountOffGr > 0) {
        const coupon = await stripe.coupons.create({
          amount_off: amountOffGr,
          currency,
          duration: "once",
          name: promoCodeId ? `Rabat (${body.promoCode})` : "Zestaw",
        });
        stripeCouponId = coupon.id;
      }
    }
```

Zachowaj istniejącą regułę zerowania promo (gdy `Math.round(toCharge(promoDiscount) * 100) === 0` → `promoDiscount = 0; promoCodeId = null;`) — sprawdź ją PRZED złożeniem kuponu, wewnątrz bloku promo, tak jak dotąd.

W `createOrder` (~292) dodaj do wywołania:

```ts
      bundleDiscount: toCharge(bundleDiscount),
```

- [ ] **Step 5: `app/_lib/orders.ts` — CreateOrderInput + insert**

W `CreateOrderInput.items` dodaj `bundle_id?: string | null; bundle_label?: string | null;`, po `promoDiscount?: number;` dodaj `bundleDiscount?: number;`. W insert `orders` (po `promo_discount`) dodaj:

```ts
      bundle_discount: bundleDiscount ?? 0,
```

(i dopisz `bundleDiscount` do destrukturyzacji parametrów). Insert `order_items` przechodzi bez zmian — spread `...item` zabierze nowe pola.

- [ ] **Step 6: `app/checkout/CheckoutForm.tsx` — payload + podsumowanie**

W miejscu budowania `items` do `fetch("/api/checkout")` dodaj przy każdej pozycji:

```ts
      bundle: i.bundle ? { id: i.bundle.id, unitKey: i.bundle.unitKey } : undefined,
```

Jeśli formularz pokazuje podsumowanie kwot (produkty/rabat/suma), policz tak samo jak w koszyku (Task 6):

```ts
  const bundleDiscount = groupCartBundles(items).reduce((s, g) => s + g.discount, 0);
  const grandTotal = Math.max(0, total - bundleDiscount - promoDiscount);
```

i wyrenderuj linię przed kodem rabatowym:

```tsx
  {bundleDiscount > 0 && (
    <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
      <span>{t.bundle.discountLine}</span>
      <span>−{formatMoney(bundleDiscount, locale, rate)}</span>
    </div>
  )}
```

Podstawa kodu rabatowego w formularzu (jeśli formularz waliduje/wyświetla kod) = `eligiblePromoBase(...)` jak w koszyku.

- [ ] **Step 7: Widoki zamówień — dopisek zestawu**

W `app/admin/zamowienia/[id]/page.tsx` i `app/konto/zamowienia/[id]/page.tsx` przy renderowaniu pozycji dodaj (obok nazwy produktu/wariantu):

```tsx
  {item.bundle_label && (
    <span className="text-xs text-[var(--color-gold-text)]"> (zestaw: {item.bundle_label})</span>
  )}
```

Jeśli widok pokazuje `promo_discount`, pokaż analogicznie `order.bundle_discount > 0` jako osobną linię „Rabat za zestaw".

- [ ] **Step 8: Weryfikacja**

Run: `npx tsc --noEmit` → bez błędów.
Run: `npm test` → PASS.
Run: `npm run build` → zielony.

- [ ] **Step 9: Commit**

```bash
git add app/api/checkout/route.ts app/_lib/orders.ts app/checkout/CheckoutForm.tsx "app/admin/zamowienia/[id]/page.tsx" "app/konto/zamowienia/[id]/page.tsx"
git commit -m "feat(zestawy): checkout weryfikuje sklad i liczy rabat serwerowo; slad zestawu na zamowieniu"
```

---

### Task 8: Karta produktu — box „Kup w zestawie" + konfigurator (modal)

**Files:**
- Create: `app/_components/ui/BundleConfigurator.tsx`
- Create: `app/_components/ui/BundleOffer.tsx`
- Modify: `app/produkt/[id]/page.tsx:99-112` (dorzuć fetch do Promise.all) i przekazanie prop (~274–280)
- Modify: `app/_components/ui/ProductMainSection.tsx` (prop `bundles`, render po `<ProductActions ... />` ~linia 155)

**Interfaces:**
- Consumes: `getBundlesForProduct` (Task 3), `addBundle` (Task 5), `bundleUnitKey`, `computeBundleDiscount`, `minBundleSavings` (Task 2), `VariantSelector`, `isVariantSelectionComplete`, `getVariantEffectivePrice`, `effectivePrice`, słownik `t.bundle` (Task 6).
- Produces: `<BundleOffer bundles={...} currentProduct={...} selected={...} />` (client), `<BundleConfigurator bundle={...} initialSelections={...} onAdded={...} />` (client, reużyty w Task 9).

- [ ] **Step 1: Stwórz `app/_components/ui/BundleConfigurator.tsx`**

```tsx
"use client";

// Konfigurator zestawu: wybór opcji KAŻDEGO składnika (tkanina osobno per
// mebel — decyzja ze specu), cena i rabat na żywo, dodanie całej grupy do
// koszyka jedną akcją (ADD_BUNDLE). Reużywany przez modal na karcie produktu
// (Task 8) i stronę /zestaw/[slug] (Task 9).

import { useMemo, useState } from "react";
import Image from "next/image";
import type { BundleWithComponents } from "@/app/_lib/types";
import { useCart, type CartItem } from "@/app/_context/CartContext";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";
import { bundleUnitKey, computeBundleDiscount } from "@/app/_lib/bundles";
import VariantSelector from "./VariantSelector";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

export default function BundleConfigurator({
  bundle,
  initialSelections,
  onAdded,
}: {
  bundle: BundleWithComponents;
  // Pre-wypełnienie opcji (np. aktualnie wybrane opcje produktu, z którego
  // karty otwarto modal): mapa productId -> variantValues.
  initialSelections?: Record<string, Record<string, string>>;
  onAdded?: () => void;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const { addBundle } = useCart();

  const [selections, setSelections] = useState<Record<string, Record<string, string>>>(
    () => {
      const init: Record<string, Record<string, string>> = {};
      for (const p of bundle.components) init[p.id] = initialSelections?.[p.id] ?? {};
      return init;
    }
  );

  const allComplete = bundle.components.every((p) =>
    isVariantSelectionComplete(p, selections[p.id] ?? {})
  );

  const base = useMemo(
    () =>
      bundle.components.reduce(
        (s, p) => s + getVariantEffectivePrice(p, selections[p.id] ?? {}),
        0
      ),
    [bundle.components, selections]
  );
  const discount = computeBundleDiscount(
    base,
    1,
    bundle.discount_type,
    Number(bundle.discount_value)
  );

  function handleAdd() {
    if (!allComplete) return;
    const unitKey = bundleUnitKey(
      bundle.id,
      bundle.components.map((p) => ({
        productId: p.id,
        variantValues: selections[p.id],
      }))
    );
    const items: CartItem[] = bundle.components.map((p) => ({
      id: p.id,
      name: p.name,
      price: getVariantEffectivePrice(p, selections[p.id] ?? {}),
      image: p.images?.[0] ?? "",
      quantity: 1,
      variantValues: hasVariants(p) ? selections[p.id] : undefined,
      category: p.category,
      bundle: {
        id: bundle.id,
        name: bundle.name,
        unitKey,
        discountType: bundle.discount_type,
        discountValue: Number(bundle.discount_value),
      },
    }));
    addBundle(items);
    onAdded?.();
  }

  return (
    <div className="flex flex-col gap-6">
      {bundle.components.map((p) => (
        <div key={p.id} className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-2xl">
          <div className="flex items-center gap-3">
            {p.images?.[0] && (
              <Image src={p.images[0]} alt={p.name} width={56} height={56}
                className="rounded-lg object-cover w-14 h-14" />
            )}
            <div>
              <p className="font-display font-semibold text-[var(--fg)]">{p.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {formatMoney(getVariantEffectivePrice(p, selections[p.id] ?? {}), locale, rate)}
              </p>
            </div>
          </div>
          {hasVariants(p) && (
            <VariantSelector
              product={p}
              variants={p.variants!}
              selected={selections[p.id] ?? {}}
              onChange={(next) => setSelections((prev) => ({ ...prev, [p.id]: next }))}
            />
          )}
        </div>
      ))}

      <div className="flex flex-col gap-1 text-sm font-sans border-t border-[var(--border)] pt-4">
        <div className="flex justify-between text-[var(--muted)]">
          <span>{t.bundle.togetherLabel}</span>
          <span className="line-through">{formatMoney(base, locale, rate)}</span>
        </div>
        <div className="flex justify-between font-bold text-base text-[var(--fg)]">
          <span>{t.bundle.bundleLabel}</span>
          <span>{formatMoney(Math.max(0, base - discount), locale, rate)}</span>
        </div>
        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
          <span>{t.bundle.saves}</span>
          <span>−{formatMoney(discount, locale, rate)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!allComplete}
        className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {allComplete ? t.bundle.addToCart : t.bundle.chooseOptions}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Stwórz `app/_components/ui/BundleOffer.tsx`**

```tsx
"use client";

// Box „Kup w zestawie" na karcie produktu — widoczny od razu (pod
// ProductActions). Max 3 zestawy; klik otwiera modal z konfiguratorem,
// link prowadzi na stronę zestawu.

import { useState } from "react";
import Image from "next/image";
import type { BundleWithComponents, Product } from "@/app/_lib/types";
import { effectivePrice } from "@/app/_lib/pricing";
import { minBundleSavings } from "@/app/_lib/bundles";
import BundleConfigurator from "./BundleConfigurator";
import LocalizedLink from "./LocalizedLink";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

export default function BundleOffer({
  bundles,
  currentProduct,
  selected,
}: {
  bundles: BundleWithComponents[];
  currentProduct: Product;
  // Aktualnie wybrane opcje bieżącego produktu (z ProductMainSection) —
  // pre-wypełniają jego konfigurację w modalu.
  selected: Record<string, string>;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (bundles.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {bundles.map((b) => {
        const others = b.components.filter((p) => p.id !== currentProduct.id);
        const savings = minBundleSavings(
          b.components.map((p) => effectivePrice(Number(p.price), p.sale_price)),
          b.discount_type,
          Number(b.discount_value)
        );
        return (
          <div
            key={b.id}
            className="p-5 border-2 border-[var(--color-gold)]/50 rounded-2xl bg-[var(--card-bg)] flex flex-col gap-3"
          >
            <p className="font-sans text-xs uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
              {t.bundle.badge}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3">
                {others.slice(0, 3).map((p) =>
                  p.images?.[0] ? (
                    <Image
                      key={p.id}
                      src={p.images[0]}
                      alt={p.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover border-2 border-[var(--card-bg)]"
                    />
                  ) : null
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--fg)] font-semibold truncate">{b.name}</p>
                <p className="text-xs text-[var(--muted)] truncate">
                  {t.bundle.withProducts} {others.map((p) => p.name).join(", ")}
                </p>
              </div>
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">
              {t.bundle.savesFrom} {formatMoney(savings, locale, rate)}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOpenSlug(b.slug)}
                className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
              >
                {t.bundle.buy}
              </button>
              <LocalizedLink
                href={`/zestaw/${b.slug}`}
                className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
              >
                {t.bundle.see} →
              </LocalizedLink>
            </div>

            {openSlug === b.slug && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => setOpenSlug(null)}
                role="dialog"
                aria-modal="true"
                aria-label={b.name}
              >
                <div
                  className="bg-[var(--card-bg)] rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl font-bold text-[var(--fg)]">{b.name}</h3>
                    <button
                      type="button"
                      onClick={() => setOpenSlug(null)}
                      aria-label="Zamknij"
                      className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                    >
                      ✕
                    </button>
                  </div>
                  <BundleConfigurator
                    bundle={b}
                    initialSelections={{ [currentProduct.id]: selected }}
                    onAdded={() => setOpenSlug(null)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

(Modal: sprawdź, czy repo ma gotowy wzorzec modala — np. `InquiryModal.tsx` — i przejmij jego konwencje a11y/scroll-lock zamiast powyższego overlaya, jeśli różnią się istotnie.)

- [ ] **Step 3: Wepnij w `app/produkt/[id]/page.tsx` i `ProductMainSection.tsx`**

`page.tsx`: do `Promise.all` (linia ~100) dodaj `getBundlesForProduct(product.id, locale)` (import z `@/app/_lib/bundles-server`) i odbierz jako `bundles`; przekaż `<ProductMainSection ... bundles={bundles} />` (linia ~274).

`ProductMainSection.tsx`: dodaj prop `bundles: BundleWithComponents[]` (import type z `@/app/_lib/types`), a po `<ProductActions ... />` (linia ~155) wyrenderuj:

```tsx
        <BundleOffer bundles={bundles} currentProduct={product} selected={selected} />
```

(import `BundleOffer` z `./BundleOffer`).

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` → bez błędów.
Run: `npm run build` → zielony.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/BundleConfigurator.tsx app/_components/ui/BundleOffer.tsx "app/produkt/[id]/page.tsx" app/_components/ui/ProductMainSection.tsx
git commit -m "feat(zestawy): box Kup w zestawie + modal konfiguratora na karcie produktu"
```

---

### Task 9: Strona `/zestaw/[slug]` + sitemap

**Files:**
- Create: `app/zestaw/[slug]/page.tsx`
- Modify: `app/sitemap.ts` (wpisy zestawów wg wzorca istniejących podstron/produktów)

**Interfaces:**
- Consumes: `getBundleBySlug`, `getActiveBundleSlugs` (Task 3), `BundleConfigurator` (Task 8), `getLocale` z `app/_lib/i18n-server`, `getDictionary`.

- [ ] **Step 1: Stwórz `app/zestaw/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getBundleBySlug } from "@/app/_lib/bundles-server";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import BundleConfigurator from "@/app/_components/ui/BundleConfigurator";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Prosta strona zestawu (spec 2026-07-16): nazwa + opis, składniki z linkami
// do kart, konfigurator opcji obu mebli i dodanie do koszyka. Zdjęcia =
// zdjęcia składników. 404 gdy zestaw nieaktywny/niekompletny.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const bundle = await getBundleBySlug(slug, locale);
  if (!bundle) return {};
  return {
    title: bundle.name,
    description: bundle.description ?? undefined,
  };
}

export default async function ZestawPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const bundle = await getBundleBySlug(slug, locale);
  if (!bundle) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
        {t.bundle.badge}
      </p>
      <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">{bundle.name}</h1>
      {bundle.description && (
        <p className="text-[var(--muted)] mb-10 max-w-2xl">{bundle.description}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Składniki — zdjęcia + linki do kart produktów */}
        <div className="flex flex-col gap-6">
          {bundle.components.map((p) => (
            <LocalizedLink
              key={p.id}
              href={`/produkt/${p.id}`}
              className="flex gap-4 items-center p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:border-[var(--color-gold)] transition-colors"
            >
              {p.images?.[0] && (
                <Image
                  src={p.images[0]}
                  alt={p.name}
                  width={112}
                  height={112}
                  className="w-28 h-28 rounded-xl object-cover"
                />
              )}
              <div>
                <p className="font-display text-lg font-semibold text-[var(--fg)]">{p.name}</p>
                <p className="text-sm text-[var(--muted)]">{p.description?.slice(0, 120)}</p>
              </div>
            </LocalizedLink>
          ))}
        </div>

        {/* Konfigurator + cena */}
        <div className="lg:sticky lg:top-40 self-start">
          <BundleConfigurator bundle={bundle} />
        </div>
      </div>
    </div>
  );
}
```

(Sprawdź w `node_modules/next/dist/docs/` aktualny kontrakt `params` — w tym repo to Promise, wzoruj się na `app/[slug]/page.tsx`.)

- [ ] **Step 2: Sitemap**

W `app/sitemap.ts` dorzuć wpisy zestawów wg wzorca, którym plik generuje wpisy produktów/podstron (PL + `/de`):

```ts
  const bundleSlugs = await getActiveBundleSlugs();
  // ...w tablicy wynikowej:
  ...bundleSlugs.flatMap((slug) => [
    { url: `${base}/zestaw/${slug}`, lastModified: now },
    { url: `${base}/de/zestaw/${slug}`, lastModified: now },
  ]),
```

(Nazwy zmiennych `base`/`now` dopasuj do istniejących w pliku; import `getActiveBundleSlugs` z `@/app/_lib/bundles-server`.)

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc --noEmit` → bez błędów.
Run: `npm run build` → zielony, trasa `ƒ /zestaw/[slug]` w spisie.

- [ ] **Step 4: Commit**

```bash
git add "app/zestaw/[slug]/page.tsx" app/sitemap.ts
git commit -m "feat(zestawy): strona /zestaw/[slug] + wpisy w sitemap"
```

---

### Task 10: Rytuał końcowy + PR

**Files:**
- Brak nowych — weryfikacja całości.

- [ ] **Step 1: Pełny rytuał**

Run: `npx tsc --noEmit` → czysty.
Run: `npm test` → wszystkie PASS (w tym nowe bundles + cart-reducer).
Run: `npm run build` → zielony; trasy `/admin/zestawy` i `/zestaw/[slug]` obecne.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/zestawy-mebli
gh pr create --title "feat: zestawy mebli (bundle z rabatem % lub kwotowym)" --body "<opis wg szablonu repo: cel, zakres per task, migracja 55 DO ZAPUSZCZENIA przy wdrożeniu (Supabase MCP za potwierdzeniem), lista klik-testów poniżej>"
```

- [ ] **Step 3: Lista klik-testów do PR (dla Mikołaja)**

1. `/admin/zestawy`: utwórz zestaw z 2 produktów (z opcjami tkanin), rabat 10%; sprawdź walidacje (1 produkt → błąd; 95% → błąd).
2. Karta produktu-składnika: box „W zestawie taniej" widoczny bez scrollowania; „Kup w zestawie" otwiera modal; opcje bieżącego produktu są pre-wypełnione.
3. Modal: bez kompletu opcji przycisk zablokowany („Wybierz opcje…"); po wyborze — kwoty razem/w zestawie/oszczędzasz się zgadzają.
4. Koszyk: zestaw jako jedna karta ze stepperem; usunięcie usuwa oba meble; ilość 2 podwaja rabat; uwagi per mebel działają.
5. Kod rabatowy: koszyk tylko-zestaw → komunikat o wykluczeniu; zestaw + produkt solo → kod liczy się tylko od solo.
6. Checkout COD: zamówienie przechodzi, total = suma − rabat zestawu; w `/admin/zamowienia/[id]` pozycje mają „(zestaw: …)" i linię rabatu.
7. `/zestaw/[slug]`: działa, konfigurator dodaje do koszyka; nieaktywny zestaw → 404.
8. `/de`: box, modal, koszyk i strona zestawu po niemiecku; ceny w EUR.
9. Ukryj jeden produkt-składnik w adminie → box i strona zestawu znikają (po odświeżeniu), checkout odrzuca stary koszyk z tym zestawem.
