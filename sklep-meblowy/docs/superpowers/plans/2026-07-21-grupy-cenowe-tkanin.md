# Grupy cenowe tkanin — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tkaniny należą do grup cenowych (Standard +0 / Premium +250 / Premium High +400, edytowalnych w adminie), mają publiczny katalog `/tkaniny` + strony `/tkaniny/[slug]` (opis + wzornik), a na karcie produktu po „Zobacz więcej" próbki grupują się w rozwijane karty grup. Zmiana grupy/korekty/kwoty automatycznie przelicza dopłaty we wszystkich produktach.

**Architecture:** Nowa tabela `fabric_groups` + kolumny na `fabrics` (`group_id`, `slug`, `description`, `description_de`). Dopłata efektywna = `grupa.surcharge + fabric.price` (korekta) wpinana w istniejący mechanizm `value_prices` opcji „Tkanina" (denormalizacja przy zapisie) + serwerowa propagacja `rebuildFabricValuePrices` po każdej zmianie tkaniny/grupy. Spec: `docs/superpowers/specs/2026-07-21-grupy-cenowe-tkanin-design.md`.

**Tech Stack:** Next.js App Router (ZMODYFIKOWANY — patrz Global Constraints), Supabase (Postgres + RLS), vitest, Tailwind (tokeny `var(--...)`).

## Global Constraints

- Projekt żyje w podfolderze: repo root to `sklep-meblowy/`, a apka w `sklep-meblowy/sklep-meblowy/`. Wszystkie ścieżki niżej są względem **wewnętrznego** folderu (`app/...`, `supabase/...`). Komendy uruchamiaj z wewnętrznego folderu.
- `AGENTS.md`: to NIE jest znany Ci Next.js — przed pisaniem kodu route'ów przeczytaj odpowiedni przewodnik w `node_modules/next/dist/docs/` i kopiuj wzorce z istniejących stron (np. `app/zestaw/[slug]/page.tsx` — params jako `Promise`, `generateMetadata`).
- Migracje SQL aplikują się AUTOMATYCZNIE przy deployu. NIE aplikuj ręcznie przez Supabase MCP (podłączony projekt = produkcja).
- Testy: `npm test` (vitest run). Lint: `npm run lint`. Typy: `npx tsc --noEmit`. NIE uruchamiaj `npm run build`, gdy działa `next dev` (psuje `.next` deva).
- Seed grup: `standard` 0 zł / `premium` 250 zł / `premium_high` 400 zł (kwoty edytowalne potem w adminie; kody stałe).
- Teksty klienckie PL + DE (słownik `pl.ts`/`de.ts`, DE fallbackuje do PL przez `DeepPartial`).
- Praca na branchu `feat/grupy-cenowe-tkanin` (utwórz z `main` na starcie). Commituj po każdym tasku. Push wymaga konta gh `Woodecky10`.
- Stopka commitów: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Migracja `56_fabric_groups.sql` + typy

**Files:**
- Create: `supabase/migrations/56_fabric_groups.sql`
- Modify: `app/_lib/types.ts` (typ `Fabric` ~:164-178, nowy `FabricPriceGroup`)
- Modify: fixtury testowe używające literalów `Fabric` (znajdziesz przez `npx tsc --noEmit`; spodziewane: `app/_lib/__tests__/fabric-groups.test.ts`, ew. `fabrics.test.ts`, `fabric-filter.test.ts`)

**Interfaces:**
- Produces: tabela `public.fabric_groups(id, code, name, name_de, surcharge, sort_order, created_at)`; kolumny `fabrics.group_id uuid NOT NULL FK`, `fabrics.slug text NOT NULL UNIQUE`, `fabrics.description text`, `fabrics.description_de text`; typ `FabricPriceGroup`; rozszerzony typ `Fabric` (`group_id: string; slug: string; description: string | null; description_de: string | null`).

- [ ] **Step 1: Utwórz branch**

```bash
git checkout -b feat/grupy-cenowe-tkanin
```

- [ ] **Step 2: Napisz migrację**

Utwórz `supabase/migrations/56_fabric_groups.sql`:

```sql
-- Migracja 56: grupy cenowe tkanin (spec 2026-07-21).
-- fabric_groups = 3 stałe grupy (code niezmienny, nazwy/kwoty edytowalne w adminie).
-- Dopłata efektywna tkaniny = fabric_groups.surcharge + fabrics.price (korekta).
-- fabrics.slug = adres strony /tkaniny/[slug] (generowany z nazwy, stabilny).
create table if not exists public.fabric_groups (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  name        text not null,
  name_de     text,
  surcharge   numeric(10, 2) not null default 0 check (surcharge >= 0),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS jak fabrics (37): tylko admin; odczyt publiczny server-side przez service role.
alter table public.fabric_groups enable row level security;
create policy "fabric_groups: admin all"
  on public.fabric_groups for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

insert into public.fabric_groups (code, name, surcharge, sort_order) values
  ('standard',     'Standard',     0,   0),
  ('premium',      'Premium',      250, 1),
  ('premium_high', 'Premium High', 400, 2)
on conflict (code) do nothing;

-- Istniejące tkaniny → Standard (żadna nie ma dziś dopłaty — ceny bez zmian).
alter table public.fabrics
  add column if not exists group_id uuid references public.fabric_groups(id);

update public.fabrics
  set group_id = (select id from public.fabric_groups where code = 'standard')
  where group_id is null;

alter table public.fabrics alter column group_id set not null;

-- Slug: lower + polskie znaki + [^a-z0-9]+ → '-'; kolizje → sufiks -2, -3…
-- (ta sama semantyka co slugifyTitle w app/_lib/pages.ts).
alter table public.fabrics add column if not exists slug text;

with base as (
  select id,
    trim(both '-' from regexp_replace(
      translate(lower(name), 'ąćęłńóśźż', 'acelnoszz'),
      '[^a-z0-9]+', '-', 'g'
    )) as b
  from public.fabrics
), numbered as (
  select id, b, row_number() over (partition by b order by id) as rn
  from base
)
update public.fabrics f
set slug = case
  when n.b = ''    then 'tkanina-' || n.rn
  when n.rn = 1    then n.b
  else                  n.b || '-' || n.rn
end
from numbered n
where n.id = f.id and f.slug is null;

alter table public.fabrics alter column slug set not null;
create unique index if not exists fabrics_slug_key on public.fabrics (slug);

-- Opis na stronę /tkaniny/[slug] (sanityzowany HTML z RichTextEditor; DE fallback do PL).
alter table public.fabrics add column if not exists description text;
alter table public.fabrics add column if not exists description_de text;
```

- [ ] **Step 3: Rozszerz typy**

W `app/_lib/types.ts` — nad typem `Fabric` dodaj:

```ts
// Grupa cenowa tkanin (migracja 56) — 3 stałe wpisy (code niezmienny), nazwy
// i kwota dopłaty edytowalne w adminie. Dopłata efektywna tkaniny =
// surcharge grupy + fabrics.price (korekta). UWAGA: to INNY byt niż
// FabricGroup z fabric-groups.ts (grupowanie po category w pickerze).
export type FabricPriceGroup = {
  id: string;
  code: string;
  name: string;
  name_de: string | null;
  surcharge: number;
  sort_order: number;
  created_at: string;
};
```

W typie `Fabric` po polu `category` dodaj:

```ts
  // Grupa cenowa (FK fabric_groups.id, NOT NULL — migracja 56).
  group_id: string;
  // Adres strony /tkaniny/[slug] — generowany z nazwy przy tworzeniu, stabilny.
  slug: string;
  // Opis na stronę tkaniny (sanityzowany HTML). description_de null → fallback PL.
  description: string | null;
  description_de: string | null;
```

- [ ] **Step 4: Napraw fixtury testowe**

Run: `npx tsc --noEmit`
Każdy literał `Fabric` w testach uzupełnij polami:

```ts
group_id: "g-standard",
slug: "nazwa-tkaniny",
description: null,
description_de: null,
```

Run ponownie: `npx tsc --noEmit` → Expected: brak błędów. `npm test` → Expected: PASS (bez zmian logiki).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/56_fabric_groups.sql app/_lib/types.ts app/_lib/__tests__/
git commit -m "feat(tkaniny): migracja fabric_groups + typy FabricPriceGroup/Fabric"
```

---

### Task 2: Czysta logika w `variants.ts` (TDD)

**Files:**
- Modify: `app/_lib/variants.ts` (`FabricLite` :212, `expandFabrics` :219-239; nowe funkcje na końcu sekcji „Tkaniny")
- Test: `app/_lib/__tests__/variants.test.ts` (dopisz bloki)

**Interfaces:**
- Consumes: `FabricPriceGroup` z types.ts (Task 1), istniejące `FABRIC_OPTION_NAME`, `fabricValueBelongsTo`, `ProductVariants`, `ProductOption`.
- Produces (używane w Taskach 4, 5, 7, 12):
  - `type FabricLite = { name: string; colors: string[]; price: number; group_id?: string | null }`
  - `expandFabrics(fabrics: FabricLite[], groupSurcharges?: Record<string, number>)` — dopłata wartości = surcharge grupy + price
  - `buildGroupSurchargeMap(groups: { id: string; surcharge: number }[]): Record<string, number>`
  - `type FabricValueMeta = { fabricName: string; slug: string; groupCode: string; groupName: string; groupNameDe: string | null; groupSurcharge: number; groupSort: number }`
  - `buildFabricMetaMap(fabrics, groups): Record<string, FabricValueMeta>` (klucz = wartość wariantu „Nazwa Numer"/„Nazwa")
  - `rebuildFabricValuePrices(variants, fabrics, groupSurcharges): { variants: ProductVariants; changed: boolean } | null`

- [ ] **Step 1: Napisz failujące testy**

Dopisz na końcu `app/_lib/__tests__/variants.test.ts` (dopasuj składnię importów do istniejących w pliku):

```ts
describe("expandFabrics z grupami cenowymi", () => {
  it("dolicza surcharge grupy do korekty tkaniny", () => {
    const { values, valuePrices } = expandFabrics(
      [{ name: "Monolith", colors: ["84", "85"], price: 50, group_id: "g-prem" }],
      { "g-prem": 250 }
    );
    expect(values).toEqual(["Monolith 84", "Monolith 85"]);
    expect(valuePrices).toEqual({ "Monolith 84": 300, "Monolith 85": 300 });
  });

  it("grupa 0 + korekta 0 → brak wpisu w valuePrices", () => {
    const { valuePrices } = expandFabrics(
      [{ name: "Sawana", colors: [], price: 0, group_id: "g-std" }],
      { "g-std": 0 }
    );
    expect(valuePrices).toEqual({});
  });

  it("brak group_id / brak mapy → jak dotąd (sama korekta)", () => {
    const { valuePrices } = expandFabrics([{ name: "Poso", colors: [], price: 30 }]);
    expect(valuePrices).toEqual({ Poso: 30 });
  });
});

describe("buildGroupSurchargeMap", () => {
  it("mapuje id → surcharge", () => {
    expect(
      buildGroupSurchargeMap([
        { id: "a", surcharge: 0 },
        { id: "b", surcharge: 250 },
      ])
    ).toEqual({ a: 0, b: 250 });
  });
});

describe("buildFabricMetaMap", () => {
  const groups = [
    { id: "g1", code: "standard", name: "Standard", name_de: null, surcharge: 0, sort_order: 0 },
    { id: "g2", code: "premium", name: "Premium", name_de: "Premium DE", surcharge: 250, sort_order: 1 },
  ];
  it("kluczuje po wartości wariantu i niesie slug + dane grupy", () => {
    const map = buildFabricMetaMap(
      [
        { name: "Monolith", colors: ["84"], slug: "monolith", group_id: "g2" },
        { name: "Sawana", colors: [], slug: "sawana", group_id: "g1" },
      ],
      groups
    );
    expect(map["Monolith 84"]).toEqual({
      fabricName: "Monolith",
      slug: "monolith",
      groupCode: "premium",
      groupName: "Premium",
      groupNameDe: "Premium DE",
      groupSurcharge: 250,
      groupSort: 1,
    });
    expect(map["Sawana"].groupCode).toBe("standard");
  });
  it("pomija tkaniny z nieznanym group_id", () => {
    const map = buildFabricMetaMap(
      [{ name: "X", colors: [], slug: "x", group_id: "nieistnieje" }],
      groups
    );
    expect(map).toEqual({});
  });
});

describe("rebuildFabricValuePrices", () => {
  const fabrics = [
    { name: "Monolith", colors: ["84"], price: 0, group_id: "g-prem" },
    { name: "Sawana", colors: ["21"], price: 10, group_id: "g-std" },
  ];
  const surcharges = { "g-prem": 250, "g-std": 0 };
  const variants = {
    options: [
      { name: "Strona", values: ["Lewa", "Prawa"] },
      {
        name: "Tkanina",
        values: ["Monolith 84", "Sawana 21", "Orphan 99"],
        value_prices: { "Monolith 84": 50, "Orphan 99": 77 },
      },
    ],
  };
  it("przelicza wartości z katalogu, zachowuje orphany i inne opcje", () => {
    const res = rebuildFabricValuePrices(variants, fabrics, surcharges);
    expect(res?.changed).toBe(true);
    const opt = res!.variants.options.find((o) => o.name === "Tkanina")!;
    expect(opt.value_prices).toEqual({
      "Monolith 84": 250,
      "Sawana 21": 10,
      "Orphan 99": 77,
    });
    expect(opt.values).toEqual(["Monolith 84", "Sawana 21", "Orphan 99"]);
    expect(res!.variants.options[0]).toEqual(variants.options[0]);
  });
  it("changed=false gdy nic się nie zmienia", () => {
    const first = rebuildFabricValuePrices(variants, fabrics, surcharges)!;
    const second = rebuildFabricValuePrices(first.variants, fabrics, surcharges)!;
    expect(second.changed).toBe(false);
  });
  it("null gdy brak wariantów lub opcji Tkanina", () => {
    expect(rebuildFabricValuePrices(null, fabrics, surcharges)).toBeNull();
    expect(
      rebuildFabricValuePrices({ options: [{ name: "Strona", values: ["Lewa"] }] }, fabrics, surcharges)
    ).toBeNull();
  });
  it("suma 0 → usuwa wpis (value_prices undefined gdy pusto)", () => {
    const v = {
      options: [{ name: "Tkanina", values: ["Sawana 21"], value_prices: { "Sawana 21": 10 } }],
    };
    const res = rebuildFabricValuePrices(v, [{ name: "Sawana", colors: ["21"], price: 0, group_id: "g-std" }], surcharges)!;
    expect(res.changed).toBe(true);
    expect(res.variants.options[0].value_prices).toBeUndefined();
  });
});
```

Dodaj do importów z `../variants`: `buildGroupSurchargeMap`, `buildFabricMetaMap`, `rebuildFabricValuePrices`.

- [ ] **Step 2: Potwierdź FAIL**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — brak eksportów `buildGroupSurchargeMap` itd.

- [ ] **Step 3: Implementacja w `variants.ts`**

Zmień `FabricLite` i `expandFabrics`:

```ts
// Minimalny kształt tkaniny potrzebny do rozwijania na wartości wariantu.
// group_id opcjonalne — dopłata grupy dociągana z mapy groupSurcharges.
export type FabricLite = { name: string; colors: string[]; price: number; group_id?: string | null };

// Rozwija wybrane tkaniny (kolekcje) na wartości opcji „Tkanina":
// - z kolorami → „Nazwa Numer" dla każdego numeru,
// - bez kolorów → sama „Nazwa".
// Dopłata wartości = surcharge grupy (z groupSurcharges po group_id) + korekta
// tkaniny (price). Wpis w valuePrices tylko gdy suma > 0.
// Zachowuje kolejność, deduplikuje wartości.
export function expandFabrics(
  fabrics: FabricLite[],
  groupSurcharges: Record<string, number> = {}
): { values: string[]; valuePrices: Record<string, number> } {
  const values: string[] = [];
  const valuePrices: Record<string, number> = {};
  const seen = new Set<string>();
  for (const f of fabrics) {
    const name = f.name.trim();
    if (!name) continue;
    const colors = (f.colors ?? []).map((c) => c.trim()).filter(Boolean);
    const fabricValues = colors.length > 0 ? colors.map((c) => `${name} ${c}`) : [name];
    const correction = typeof f.price === "number" && Number.isFinite(f.price) ? f.price : 0;
    const groupPart = f.group_id ? groupSurcharges[f.group_id] ?? 0 : 0;
    const price = groupPart + correction;
    for (const v of fabricValues) {
      if (seen.has(v)) continue;
      seen.add(v);
      values.push(v);
      if (price > 0) valuePrices[v] = price;
    }
  }
  return { values, valuePrices };
}
```

Dopisz na końcu sekcji „Tkaniny (katalog)":

```ts
// Mapa id grupy → dopłata. Wejście dla expandFabrics/rebuildFabricValuePrices.
export function buildGroupSurchargeMap(
  groups: { id: string; surcharge: number }[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const g of groups) map[g.id] = g.surcharge;
  return map;
}

// Metadane tkaniny per wartość wariantu — dla klienta (selektor na karcie
// produktu grupuje próbki w karty grup i linkuje do /tkaniny/[slug]).
export type FabricValueMeta = {
  fabricName: string;
  slug: string;
  groupCode: string;
  groupName: string;
  groupNameDe: string | null;
  groupSurcharge: number;
  groupSort: number;
};

// Buduje mapę wartość wariantu („Nazwa Numer"/„Nazwa") → FabricValueMeta.
// Tkaniny z group_id spoza `groups` pomijane (teoretyczne — FK NOT NULL).
export function buildFabricMetaMap(
  fabrics: { name: string; colors: string[]; slug: string; group_id: string }[],
  groups: { id: string; code: string; name: string; name_de: string | null; surcharge: number; sort_order: number }[]
): Record<string, FabricValueMeta> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const map: Record<string, FabricValueMeta> = {};
  for (const f of fabrics) {
    const g = byId.get(f.group_id);
    const name = f.name.trim();
    if (!g || !name) continue;
    const colors = (f.colors ?? []).map((c) => c.trim()).filter(Boolean);
    const values = colors.length > 0 ? colors.map((c) => `${name} ${c}`) : [name];
    const meta: FabricValueMeta = {
      fabricName: name,
      slug: f.slug,
      groupCode: g.code,
      groupName: g.name,
      groupNameDe: g.name_de,
      groupSurcharge: g.surcharge,
      groupSort: g.sort_order,
    };
    for (const v of values) map[v] = meta;
  }
  return map;
}

// Przelicza value_prices opcji „Tkanina" produktu wg aktualnego katalogu:
// wartość z katalogu → surcharge grupy + korekta; orphan (spoza katalogu) →
// zachowuje dotychczasową dopłatę. Inne opcje nietknięte. Zwraca null gdy
// produkt nie ma opcji „Tkanina"; changed=false gdy nic się nie zmieniło.
// Propagacja: wołane z akcji admina po każdej zmianie tkaniny/grupy.
export function rebuildFabricValuePrices(
  variants: ProductVariants | null,
  fabrics: FabricLite[],
  groupSurcharges: Record<string, number>
): { variants: ProductVariants; changed: boolean } | null {
  const opt = variants?.options.find((o) => o.name === FABRIC_OPTION_NAME);
  if (!variants || !opt) return null;
  const nextPrices: Record<string, number> = {};
  for (const v of opt.values) {
    const owner = fabrics.find((f) => fabricValueBelongsTo(v, f));
    if (owner) {
      const correction =
        typeof owner.price === "number" && Number.isFinite(owner.price) ? owner.price : 0;
      const total = (owner.group_id ? groupSurcharges[owner.group_id] ?? 0 : 0) + correction;
      if (total > 0) nextPrices[v] = total;
    } else {
      const existing = opt.value_prices?.[v];
      if (typeof existing === "number" && Number.isFinite(existing) && existing !== 0) {
        nextPrices[v] = existing;
      }
    }
  }
  const vp = Object.keys(nextPrices).length > 0 ? nextPrices : undefined;
  const changed = JSON.stringify(opt.value_prices ?? null) !== JSON.stringify(vp ?? null);
  if (!changed) return { variants, changed: false };
  const nextOptions = variants.options.map((o) =>
    o.name === FABRIC_OPTION_NAME ? { ...o, value_prices: vp } : o
  );
  return { variants: { ...variants, options: nextOptions }, changed: true };
}
```

Uwaga: `ProductVariants` musi być w imporcie typów u góry pliku (obok `Product, ProductOption`).

- [ ] **Step 4: Potwierdź PASS**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: PASS (nowe + wszystkie dotychczasowe).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(tkaniny): expandFabrics z grupami + buildFabricMetaMap + rebuildFabricValuePrices"
```

---

### Task 3: Generowanie sluga tkaniny (TDD)

**Files:**
- Create: `app/_lib/fabric-slug.ts`
- Test: Create `app/_lib/__tests__/fabric-slug.test.ts`

**Interfaces:**
- Consumes: `slugifyTitle` z `app/_lib/pages.ts:43`.
- Produces: `fabricSlug(name: string, taken: Set<string>): string` (Task 5).

- [ ] **Step 1: Failujący test**

```ts
import { describe, it, expect } from "vitest";
import { fabricSlug } from "../fabric-slug";

describe("fabricSlug", () => {
  it("sluguje polskie znaki", () => {
    expect(fabricSlug("Płótno Żółte", new Set())).toBe("plotno-zolte");
  });
  it("kolizja → sufiks -2, -3", () => {
    expect(fabricSlug("Boss", new Set(["boss"]))).toBe("boss-2");
    expect(fabricSlug("Boss", new Set(["boss", "boss-2"]))).toBe("boss-3");
  });
  it("nazwa bez znaków alfanumerycznych → fallback 'tkanina'", () => {
    expect(fabricSlug("###", new Set())).toBe("tkanina");
    expect(fabricSlug("###", new Set(["tkanina"]))).toBe("tkanina-2");
  });
});
```

Run: `npx vitest run app/_lib/__tests__/fabric-slug.test.ts` → Expected: FAIL (moduł nie istnieje).

- [ ] **Step 2: Implementacja**

`app/_lib/fabric-slug.ts`:

```ts
// Slug tkaniny do /tkaniny/[slug] — czysty moduł (testowalny bez DB).
// Ta sama semantyka co backfill w migracji 56. Generowany raz przy tworzeniu
// tkaniny, stabilny przy zmianie nazwy (URL-e nie pękają).
import { slugifyTitle } from "./pages";

export function fabricSlug(name: string, taken: Set<string>): string {
  const base = slugifyTitle(name) || "tkanina";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 3: PASS + commit**

Run: `npx vitest run app/_lib/__tests__/fabric-slug.test.ts` → Expected: PASS.

```bash
git add app/_lib/fabric-slug.ts app/_lib/__tests__/fabric-slug.test.ts
git commit -m "feat(tkaniny): fabricSlug — generowanie unikalnego sluga"
```

---

### Task 4: Warstwa danych — `fabrics.ts`

**Files:**
- Modify: `app/_lib/fabrics.ts`

**Interfaces:**
- Consumes: `buildFabricMetaMap`, `FabricValueMeta` (Task 2); `FabricPriceGroup` (Task 1).
- Produces (Taski 5, 6, 7, 9, 10, 12): `getFabricPriceGroups(): Promise<FabricPriceGroup[]>`, `invalidateFabricGroupsCache(): void`, `getFabricBySlug(slug: string): Promise<Fabric | null>`, `getFabricMetaMap(): Promise<Record<string, FabricValueMeta>>`, `FABRIC_GROUPS_CACHE_TAG`.

- [ ] **Step 1: Dopisz do `fabrics.ts`**

Rozszerz importy: `buildFabricMetaMap, type FabricValueMeta` z `./variants`; `FabricPriceGroup` z `./types`. Dopisz:

```ts
export const FABRIC_GROUPS_CACHE_TAG = "fabric-groups";

const fetchFabricPriceGroups = unstable_cache(
  async (): Promise<FabricPriceGroup[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("fabric_groups")
      .select("*")
      .order("sort_order", { ascending: true });
    return (data ?? []) as FabricPriceGroup[];
  },
  ["fabric-groups-all"],
  { tags: [FABRIC_GROUPS_CACHE_TAG], revalidate: 300 }
);

// Grupy cenowe tkanin (Standard/Premium/Premium High), rosnąco po sort_order.
export const getFabricPriceGroups = cache(fetchFabricPriceGroups);

export function invalidateFabricGroupsCache(): void {
  revalidateTag(FABRIC_GROUPS_CACHE_TAG, "max");
}

// Tkanina po slugu (strona /tkaniny/[slug]). Lookup w cache'owanej liście —
// przy ~200 tkaninach szybsze i prostsze niż osobne zapytanie.
export async function getFabricBySlug(slug: string): Promise<Fabric | null> {
  const fabrics = await getAllFabrics();
  return fabrics.find((f) => f.slug === slug) ?? null;
}

// Mapa wartość wariantu → metadane tkaniny (slug + grupa) — seed kontekstu
// klienckiego na karcie produktu (FabricMetaProvider).
export async function getFabricMetaMap(): Promise<Record<string, FabricValueMeta>> {
  const [fabrics, groups] = await Promise.all([getAllFabrics(), getFabricPriceGroups()]);
  return buildFabricMetaMap(fabrics, groups);
}
```

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint` → Expected: brak błędów.

```bash
git add app/_lib/fabrics.ts
git commit -m "feat(tkaniny): warstwa danych fabric_groups (cache, slug lookup, meta map)"
```

---

### Task 5: Akcje admina — CRUD z grupami + `updateFabricGroup` + propagacja

**Files:**
- Modify: `app/admin/tkaniny/actions.ts`

**Interfaces:**
- Consumes: `rebuildFabricValuePrices`, `buildGroupSurchargeMap`, `FabricLite` (Task 2); `fabricSlug` (Task 3); `invalidateFabricGroupsCache` (Task 4); `sanitizeRichHtml` (`app/_lib/product-html.ts:308`); istniejące `sanitize`, `emptyToNull`, `parsePrice`, `parseColorRows`.
- Produces (Task 6): `updateFabricGroup(formData: FormData): Promise<ActionResult>` (pola: `id`, `name`, `name_de`, `surcharge`); `createFabric`/`updateFabric` przyjmują dodatkowo `group_id`, `description`, `description_de`.

- [ ] **Step 1: Implementacja**

Do importów dodaj:

```ts
import { invalidateFabricGroupsCache } from "@/app/_lib/fabrics";
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import { fabricSlug } from "@/app/_lib/fabric-slug";
import {
  buildGroupSurchargeMap,
  rebuildFabricValuePrices,
  type FabricLite,
} from "@/app/_lib/variants";
import type { ProductVariants } from "@/app/_lib/types";
```

Dopisz helpery (pod `parsePrice`):

```ts
// Opis z RichTextEditor: sanityzacja server-side; pusty → null.
function parseRichHtml(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = sanitizeRichHtml(input).trim();
  return clean === "" ? null : clean;
}

// Propagacja dopłat: przelicza value_prices opcji „Tkanina" we WSZYSTKICH
// produktach wg aktualnego katalogu (grupa + korekta). Zapisuje tylko
// faktycznie zmienione. Wołane po każdej zmianie tkaniny/grupy — bez diffowania
// co się zmieniło (tanio i zawsze poprawnie; skala sklepu: setki produktów).
async function recomputeFabricSurchargesOnProducts(): Promise<{ updated: number }> {
  const supabase = await createAdminClient();
  const [{ data: fabricRows }, { data: groupRows }, { data: productRows }] = await Promise.all([
    supabase.from("fabrics").select("name, colors, price, group_id"),
    supabase.from("fabric_groups").select("id, surcharge"),
    supabase.from("products").select("id, variants").not("variants", "is", null),
  ]);
  const fabrics = (fabricRows ?? []) as FabricLite[];
  const surcharges = buildGroupSurchargeMap(
    (groupRows ?? []) as { id: string; surcharge: number }[]
  );
  let updated = 0;
  for (const row of productRows ?? []) {
    const p = row as { id: string; variants: ProductVariants | null };
    const res = rebuildFabricValuePrices(p.variants, fabrics, surcharges);
    if (!res || !res.changed) continue;
    const { error } = await supabase
      .from("products")
      .update({ variants: res.variants } as never)
      .eq("id", p.id);
    if (!error) {
      updated++;
      revalidatePath(`/produkt/${p.id}`);
    }
  }
  if (updated > 0) {
    invalidateFacetsCache();
    revalidatePath("/sklep");
  }
  return { updated };
}
```

W `createFabric` — po linii `const category = ...` dodaj:

```ts
  const groupId = sanitize(formData.get("group_id"));
  if (!groupId) return { ok: false, error: "Wybierz grupę cenową" };
  const description = parseRichHtml(formData.get("description"));
  const descriptionDe = parseRichHtml(formData.get("description_de"));
```

przed insertem wygeneruj slug, a insert rozszerz:

```ts
  const supabase = await createAdminClient();
  const { data: slugRows } = await supabase.from("fabrics").select("slug");
  const taken = new Set(
    ((slugRows ?? []) as { slug: string | null }[]).map((r) => r.slug ?? "")
  );
  const slug = fabricSlug(name, taken);

  const { error, data } = await supabase
    .from("fabrics")
    .insert({
      name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category,
      group_id: groupId, slug, description, description_de: descriptionDe,
    } as never)
    .select()
    .single();
```

Po udanym insercie (przed `return { ok: true, ... }`):

```ts
  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
```

(usuń zdublowane dotychczasowe invalidacje w tym miejscu). Obsługa `23505` bez zmian — łapie też kolizję sluga (teoretyczna, race).

W `updateFabric` analogicznie: parsuj `groupId`/`description`/`descriptionDe`, dodaj do `.update({...})` pola `group_id: groupId, description, description_de: descriptionDe` (slug NIE jest przeliczany), a po udanym update:

```ts
  await recomputeFabricSurchargesOnProducts();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
```

Dodaj nową akcję:

```ts
// Edycja grupy cenowej (nazwy + kwota). Kod (code) i liczba grup są stałe — v1
// bez dodawania/usuwania. Po zapisie przelicza dopłaty we wszystkich produktach.
export async function updateFabricGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id grupy" };
  const name = sanitize(formData.get("name"), 100);
  if (!name) return { ok: false, error: "Nazwa grupy jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de"), 100));
  const surcharge = parsePrice(formData.get("surcharge"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabric_groups")
    .update({ name, name_de: nameDe, surcharge } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { updated } = await recomputeFabricSurchargesOnProducts();
  invalidateFabricGroupsCache();
  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  revalidatePath("/tkaniny");
  return { ok: true, message: `Grupa zapisana — przeliczono ${updated} produkt(ów)` };
}
```

`deleteFabric`: bez propagacji (wartości stają się orphanami i zachowują dotychczasową dopłatę — jak dziś), dodaj tylko `revalidatePath("/tkaniny")`.

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → Expected: brak błędów, testy PASS.

```bash
git add app/admin/tkaniny/actions.ts
git commit -m "feat(tkaniny): akcje admina — grupy cenowe, opis, slug, propagacja doplat do produktow"
```

---

### Task 6: Admin UI — sekcja „Grupy cenowe" + formularz tkaniny

**Files:**
- Create: `app/admin/tkaniny/FabricGroupsPanel.tsx`
- Modify: `app/admin/tkaniny/FabricsEditor.tsx`, `app/admin/tkaniny/page.tsx`

**Interfaces:**
- Consumes: `updateFabricGroup` (Task 5), `getFabricPriceGroups` (Task 4), `RichTextEditor` (`app/admin/_shared/RichTextEditor.tsx`, wzorzec użycia: `app/admin/zestawy/BundlesEditor.tsx:200-207` — stan + hidden input), `useConfirm`, `Field`/`inputCls`/`Card` z `app/admin/_shared`.
- Produces: `FabricsEditor` przyjmuje `{ initialFabrics: Fabric[]; groups: FabricPriceGroup[] }`.

- [ ] **Step 1: `FabricGroupsPanel.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { updateFabricGroup, type ActionResult } from "./actions";
import type { FabricPriceGroup } from "@/app/_lib/types";

// Edycja 3 stałych grup cenowych (nazwy PL/DE + dopłata). Zapis przelicza
// dopłaty we wszystkich produktach — stąd confirm przed submitem.
export default function FabricGroupsPanel({
  groups,
  onResult,
}: {
  groups: FabricPriceGroup[];
  onResult: (res: ActionResult) => void;
}) {
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold text-[var(--fg)] mb-1">
        Grupy cenowe
      </h2>
      <p className="text-xs text-[var(--muted)] mb-4">
        Dopłata grupy dolicza się do ceny produktu przy każdej tkaninie z tej
        grupy (plus ewentualna korekta tkaniny). Zapis przelicza dopłaty we
        wszystkich produktach.
      </p>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} onResult={onResult} />
        ))}
      </div>
    </Card>
  );
}

function GroupRow({
  group,
  onResult,
}: {
  group: FabricPriceGroup;
  onResult: (res: ActionResult) => void;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(group.name);
  const [nameDe, setNameDe] = useState(group.name_de ?? "");
  const [surcharge, setSurcharge] = useState(String(group.surcharge));

  async function save() {
    if (
      !(await confirm({
        message: `Zapisać grupę "${name}"? Dopłaty zostaną przeliczone we wszystkich produktach z tkaninami.`,
      }))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", group.id);
    fd.set("name", name);
    fd.set("name_de", nameDe);
    fd.set("surcharge", surcharge);
    startTransition(async () => {
      const res = await updateFabricGroup(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
      <Field label={`Nazwa (PL) · ${group.code}`}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} />
      </Field>
      <Field label="Nazwa (DE)" hint="Puste → na /de nazwa PL.">
        <input value={nameDe} onChange={(e) => setNameDe(e.target.value)} maxLength={100} className={inputCls} />
      </Field>
      <Field label="Dopłata (zł)">
        <input type="number" step="0.01" min="0" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} className={inputCls} />
      </Field>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="px-4 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? "Zapisuję…" : "Zapisz"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `FabricsEditor.tsx`**

1. Import: `import FabricGroupsPanel from "./FabricGroupsPanel";`, `import RichTextEditor from "@/app/admin/_shared/RichTextEditor";`, typ `FabricPriceGroup` z types.
2. Sygnatura: `export default function FabricsEditor({ initialFabrics, groups }: { initialFabrics: Fabric[]; groups: FabricPriceGroup[] })`.
3. Po bloku nagłówka (przed `{toast && ...}`) wstaw: `<FabricGroupsPanel groups={groups} onResult={(res) => handleResult(res)} />`.
4. Meta wiersza tkaniny (linia ~106-110): dodaj plakietkę grupy i zmień etykietę korekty:

```tsx
const groupById = new Map(groups.map((g) => [g.id, g])); // na górze komponentu
```

```tsx
{" · "}{groupById.get(f.group_id)?.name ?? "?"}
{f.category && ` · ${f.category}`}
{f.price > 0 && ` · korekta +${f.price.toFixed(2)} zł`}
```

5. `FabricForm`: dodaj prop `groups: FabricPriceGroup[]` (przekaż z obu użyć), stan opisów i pola:

```tsx
const [description, setDescription] = useState(initial?.description ?? "");
const [descriptionDe, setDescriptionDe] = useState(initial?.description_de ?? "");
```

Pole „Dopłata (zł)" zamień na (w tym samym gridzie, plus select grupy):

```tsx
<Field label="Grupa cenowa" required>
  <select
    name="group_id"
    defaultValue={initial?.group_id ?? groups.find((g) => g.code === "standard")?.id ?? groups[0]?.id}
    className={inputCls}
  >
    {groups.map((g) => (
      <option key={g.id} value={g.id}>
        {g.name}
        {g.surcharge > 0 ? ` (+${g.surcharge.toFixed(2)} zł)` : " (bez dopłaty)"}
      </option>
    ))}
  </select>
</Field>
<Field label="Korekta ceny (zł)" hint="Doliczana PONAD dopłatę grupy. Zwykle 0.">
  <input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? 0} className={inputCls} />
</Field>
```

Po polu „Kategoria / typ" dodaj opisy (wzorzec BundlesEditor):

```tsx
<Field label="Opis" hint="Pokazywany na stronie tkaniny (/tkaniny). Obsługuje formatowanie.">
  <input type="hidden" name="description" value={description} />
  <RichTextEditor value={description} onChange={setDescription} ariaLabel="Opis tkaniny (PL)" placeholder="Opis tkaniny…" />
</Field>
<Field label="Opis (DE)" hint="Puste → na /de pokaże się opis PL.">
  <input type="hidden" name="description_de" value={descriptionDe} />
  <RichTextEditor value={descriptionDe} onChange={setDescriptionDe} ariaLabel="Opis tkaniny (DE)" />
</Field>
```

- [ ] **Step 3: `page.tsx`**

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import FabricsEditor from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const [fabrics, groups] = await Promise.all([getAllFabrics(), getFabricPriceGroups()]);
  return <FabricsEditor initialFabrics={fabrics} groups={groups} />;
}
```

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint` → Expected: brak błędów.

```bash
git add app/admin/tkaniny/
git commit -m "feat(tkaniny): admin — panel grup cenowych, select grupy, opis WYSIWYG, korekta ceny"
```

---

### Task 7: Picker wariantów — dopłata efektywna (grupa + korekta)

**Files:**
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (`toLite` :535, `applyFabrics` :148-163, preview :599, wiersz pickera :717-720, propsy komponentu i `FabricPicker`)
- Modify: `app/admin/produkty/[id]/page.tsx` (znajdź `<VariantsEditor` przez grep i dodaj prop)

**Interfaces:**
- Consumes: `getFabricPriceGroups` (Task 4), `buildGroupSurchargeMap`, `expandFabrics` z drugim parametrem (Task 2).
- Produces: `VariantsEditor` przyjmuje dodatkowo `fabricGroups: FabricPriceGroup[]`.

- [ ] **Step 1: Zmiany**

1. `app/admin/produkty/[id]/page.tsx`: dociągnij `getFabricPriceGroups()` (równolegle z istniejącym pobraniem tkanin) i przekaż `fabricGroups={groups}` do `<VariantsEditor>`.
2. `VariantsEditor.tsx`:
   - do propsów komponentu dodaj `fabricGroups: FabricPriceGroup[]` (import typu z types) i przekaż w dół do `FabricPicker` jako prop `groups`;
   - import `buildGroupSurchargeMap` z `@/app/_lib/variants`;
   - `toLite` (w `FabricPicker` :535) rozszerz: `const toLite = (f: Fabric) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0, group_id: f.group_id });`
   - w `applyFabrics` (:148): `const { values, valuePrices } = expandFabrics(selectedFabrics.map((f) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0, group_id: f.group_id })), buildGroupSurchargeMap(fabricGroups));`
   - w `FabricPicker`: dodaj prop `groups: FabricPriceGroup[]`, policz `const surchargeById = buildGroupSurchargeMap(groups);`, preview (:599) przekaż mapę: `expandFabrics(selectedFabrics.map(toLite), surchargeById)`;
   - wiersz tkaniny (:717-720) — dopłata efektywna:

```tsx
{(() => {
  const eff = (surchargeById[f.group_id] ?? 0) + (f.price ?? 0);
  return eff > 0 ? ` · +${eff.toFixed(2)} zł` : "";
})()}
```

(zastępuje `f.price > 0 && ...`).

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → Expected: brak błędów.

```bash
git add "app/admin/produkty/[id]/VariantsEditor.tsx" "app/admin/produkty/[id]/page.tsx"
git commit -m "feat(tkaniny): picker wariantow liczy doplate efektywna (grupa + korekta)"
```

---

### Task 8: Słownik PL/DE + rezerwacja sluga `tkaniny`

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` + obiekt `pl`), `app/_lib/dictionaries/de.ts`, `app/_lib/pages.ts` (`RESERVED_SLUGS` :11-33)

**Interfaces:**
- Produces (Taski 9, 10, 12): sekcja słownika `t.fabrics` z kluczami jak niżej.

- [ ] **Step 1: `pl.ts`**

Do `PlShape` (obok sekcji `product`) dodaj:

```ts
  fabrics: {
    eyebrow: string;
    heading: string;
    intro: string;
    groupNoSurcharge: string;
    colorsOne: string;
    colorsFew: string;
    colorsMany: string;
    swatchHeading: string;
    seeProducts: string;
    typeLabel: string;
    groupLabel: string;
    detailsLink: string;
    otherGroupLabel: string;
    notFoundTitle: string;
  };
```

Do obiektu `pl` dodaj:

```ts
  fabrics: {
    eyebrow: "Mollien",
    heading: "Tkaniny",
    intro: "Poznaj tkaniny dostępne w naszych meblach — pogrupowane według grup cenowych. Kliknij tkaninę, aby zobaczyć opis i pełny wzornik kolorów.",
    groupNoSurcharge: "bez dopłaty",
    colorsOne: "kolor",
    colorsFew: "kolory",
    colorsMany: "kolorów",
    swatchHeading: "Wzornik kolorów",
    seeProducts: "Zobacz produkty z tą tkaniną",
    typeLabel: "Typ",
    groupLabel: "Grupa cenowa",
    detailsLink: "szczegóły",
    otherGroupLabel: "Pozostałe",
    notFoundTitle: "Tkanina nie znaleziona",
  },
```

- [ ] **Step 2: `de.ts`**

```ts
  fabrics: {
    eyebrow: "Mollien",
    heading: "Stoffe",
    intro: "Entdecken Sie die Stoffe unserer Möbel — nach Preisgruppen geordnet. Klicken Sie auf einen Stoff, um Beschreibung und Farbmuster zu sehen.",
    groupNoSurcharge: "ohne Aufpreis",
    colorsOne: "Farbe",
    colorsFew: "Farben",
    colorsMany: "Farben",
    swatchHeading: "Farbmuster",
    seeProducts: "Produkte mit diesem Stoff ansehen",
    typeLabel: "Typ",
    groupLabel: "Preisgruppe",
    detailsLink: "Details",
    otherGroupLabel: "Sonstige",
    notFoundTitle: "Stoff nicht gefunden",
  },
```

- [ ] **Step 3: `pages.ts`**

Do `RESERVED_SLUGS` dodaj `"tkaniny",` (alfabetycznie, po `"sklep"`... wg istniejącego porządku listy — po `"ulubione"` przed `"zapomnialem-hasla"` NIE — lista jest alfabetyczna: wstaw między `"sklep"` a `"ulubione"`).

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm test` → Expected: PASS.

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_lib/pages.ts
git commit -m "feat(tkaniny): slownik PL/DE sekcja fabrics + rezerwacja sluga tkaniny"
```

---

### Task 9: Publiczny katalog `/tkaniny`

**Files:**
- Create: `app/tkaniny/page.tsx`

**Interfaces:**
- Consumes: `getAllFabrics`, `getFabricPriceGroups` (Task 4), `t.fabrics` (Task 8), `pickLocalized`/`localizePath` (`app/_lib/i18n.ts`), `alternatesFor` (`app/_lib/sitemap-i18n`), `getEurRate`, `formatMoney`, `LocalizedLink`.

- [ ] **Step 1: Implementacja**

```tsx
import type { Metadata } from "next";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pickLocalized, localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { formatMoney } from "@/app/_lib/money";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Fabric } from "@/app/_lib/types";

// Katalog tkanin (spec 2026-07-21): sekcje wg grup cenowych, kafelki tkanin
// linkują do /tkaniny/[slug]. Route statyczny — przykrywa dawną podstronę CMS
// o slugu "tkaniny" (slug zarezerwowany w pages.ts).

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.fabrics.heading,
    description: t.fabrics.intro,
    alternates: {
      canonical: localizePath("/tkaniny", locale),
      languages: alternatesFor("/tkaniny", { hasDe: true }).languages,
    },
  };
}

// Polska liczba mnoga: 1 kolor / 2-4 kolory / 5+ kolorów (12-14 → "kolorów").
function colorsLabel(n: number, t: ReturnType<typeof getDictionary>): string {
  if (n === 1) return t.fabrics.colorsOne;
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return t.fabrics.colorsFew;
  return t.fabrics.colorsMany;
}

function fabricThumb(f: Fabric): string | undefined {
  return (f.colors ?? []).map((c) => f.color_images?.[c]).find(Boolean);
}

export default async function TkaninyPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [fabrics, groups, rate] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    getEurRate(),
  ]);
  const sections = groups
    .map((g) => ({ group: g, items: fabrics.filter((f) => f.group_id === g.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.fabrics.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">{t.fabrics.heading}</h1>
        <p className="text-sm text-[var(--muted)] mt-3 max-w-2xl">{t.fabrics.intro}</p>
      </div>

      {sections.map(({ group, items }) => (
        <section key={group.id} className="mb-16">
          <div className="flex items-baseline gap-3 mb-6 flex-wrap">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
              {pickLocalized(group.name, group.name_de, locale)}
            </h2>
            <span className="text-sm font-sans text-[var(--color-gold-text)] font-semibold">
              {group.surcharge > 0
                ? `+${formatMoney(group.surcharge, locale, rate)}`
                : t.fabrics.groupNoSurcharge}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {items.map((f) => {
              const thumb = fabricThumb(f);
              const n = (f.colors ?? []).length;
              return (
                <LocalizedLink
                  key={f.id}
                  href={`/tkaniny/${f.slug}`}
                  className="group flex flex-col gap-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--color-gold)] transition-colors"
                >
                  <span className="relative aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={pickLocalized(f.name, f.name_de, locale)} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
                        {f.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block font-display text-base font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
                      {pickLocalized(f.name, f.name_de, locale)}
                    </span>
                    {n > 0 && (
                      <span className="block text-xs text-[var(--muted)] mt-0.5">
                        {n} {colorsLabel(n, t)}
                      </span>
                    )}
                  </span>
                </LocalizedLink>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint` → Expected: brak błędów.

```bash
git add app/tkaniny/page.tsx
git commit -m "feat(tkaniny): publiczny katalog /tkaniny z sekcjami grup cenowych"
```

---

### Task 10: Strona tkaniny `/tkaniny/[slug]`

**Files:**
- Create: `app/tkaniny/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getFabricBySlug`, `getFabricPriceGroups` (Task 4), `t.fabrics` (Task 8), `sanitizeRichHtml`, `extractShortDescription` (`app/_lib/product-html.ts`), wzorzec strony: `app/zestaw/[slug]/page.tsx` (params jako `Promise`).

- [ ] **Step 1: Implementacja**

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFabricBySlug, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pickLocalized, localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { formatMoney } from "@/app/_lib/money";
import { sanitizeRichHtml, extractShortDescription } from "@/app/_lib/product-html";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Strona tkaniny (spec 2026-07-21): opis + wzornik (siatka kolorów z
// color_images) + plakietka grupy cenowej + link do /sklep z filtrem tkaniny.

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const fabric = await getFabricBySlug(slug);
  if (!fabric) return { title: t.fabrics.notFoundTitle };
  const desc = pickLocalized(fabric.description ?? "", fabric.description_de, locale);
  const plPath = `/tkaniny/${fabric.slug}`;
  const hasDe = !!fabric.name_de && fabric.name_de.trim().length > 0;
  return {
    title: pickLocalized(fabric.name, fabric.name_de, locale),
    description: desc ? extractShortDescription(desc, 160) : undefined,
    alternates: {
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe }).languages,
    },
  };
}

export default async function TkaninaPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [fabric, groups, rate] = await Promise.all([
    getFabricBySlug(slug),
    getFabricPriceGroups(),
    getEurRate(),
  ]);
  if (!fabric) notFound();

  const group = groups.find((g) => g.id === fabric.group_id);
  const effective = (group?.surcharge ?? 0) + (fabric.price ?? 0);
  const description = pickLocalized(fabric.description ?? "", fabric.description_de, locale);
  const colors = (fabric.colors ?? []).map((c) => c.trim()).filter(Boolean);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-sans text-[var(--muted)] mb-12 uppercase tracking-widest">
        <LocalizedLink href="/" className="hover:text-[var(--color-gold)] transition-colors">
          {t.product.breadcrumbHome}
        </LocalizedLink>
        <span>/</span>
        <LocalizedLink href="/tkaniny" className="hover:text-[var(--color-gold)] transition-colors">
          {t.fabrics.heading}
        </LocalizedLink>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">
          {pickLocalized(fabric.name, fabric.name_de, locale)}
        </span>
      </nav>

      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.fabrics.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">
          {pickLocalized(fabric.name, fabric.name_de, locale)}
        </h1>
        <div className="flex items-center gap-3 flex-wrap text-sm font-sans">
          {group && (
            <span className="px-3 py-1 rounded-full border border-[var(--color-gold)] text-[var(--color-gold-text)] font-semibold">
              {pickLocalized(group.name, group.name_de, locale)}
              {" · "}
              {effective > 0 ? `+${formatMoney(effective, locale, rate)}` : t.fabrics.groupNoSurcharge}
            </span>
          )}
          {fabric.category && (
            <span className="text-[var(--muted)]">
              {t.fabrics.typeLabel}: {fabric.category}
            </span>
          )}
        </div>
      </div>

      {description && (
        <div
          className="rich-text text-[var(--fg)] leading-relaxed mb-12 max-w-3xl"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(description) }}
        />
      )}

      {colors.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
            {t.fabrics.swatchHeading}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {colors.map((code) => {
              const img = fabric.color_images?.[code];
              return (
                <figure key={code} className="flex flex-col items-center gap-2 text-center">
                  <span className="relative w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={`${fabric.name} ${code}`} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm text-[var(--muted)]">
                        {code}
                      </span>
                    )}
                  </span>
                  <figcaption className="text-xs text-[var(--muted)]">{code}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      <LocalizedLink
        href={`/sklep?tkanina=${encodeURIComponent(fabric.name)}`}
        className="inline-block px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
      >
        {t.fabrics.seeProducts}
      </LocalizedLink>
    </div>
  );
}
```

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint` → Expected: brak błędów.

```bash
git add "app/tkaniny/[slug]/page.tsx"
git commit -m "feat(tkaniny): strona tkaniny /tkaniny/[slug] — opis, wzornik, link do sklepu"
```

---

### Task 11: Sitemap

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: Wpisy**

1. Do `staticRoutes` (po wpisach `/sklep`) dodaj — wzorzec identyczny jak home/sklep (strona w pełni tłumaczona słownikiem):

```ts
  const tkaninyAlts = sitemapAlternates("/tkaniny", { hasDe: true }, BASE).languages;
```

```ts
    { url: `${BASE}/tkaniny`,     lastModified: now, changeFrequency: "weekly",  priority: 0.7, alternates: { languages: tkaninyAlts } },
    { url: `${BASE}/de/tkaniny`,  lastModified: now, changeFrequency: "weekly",  priority: 0.7, alternates: { languages: tkaninyAlts } },
```

2. W bloku `try` (po `bundleRoutes`) dodaj wpisy per tkanina — DE tylko przy przetłumaczonej nazwie (wzorzec `pageRoutes`):

```ts
    // Tkaniny (spec 2026-07-21): strona /tkaniny/[slug]. DE tylko gdy name_de
    // uzupełnione (opis i tak fallbackuje do PL — nie indeksujemy pół-polskich).
    const { data: fabricRows } = await supabase
      .from("fabrics")
      .select("slug, name_de, created_at");
    const fabricRoutes: MetadataRoute.Sitemap = (fabricRows ?? []).flatMap((f) => {
      const fabric = f as { slug: string; name_de: string | null; created_at: string };
      const plPath = `/tkaniny/${fabric.slug}`;
      const hasDe = !!fabric.name_de && fabric.name_de.trim().length > 0;
      const lastModified = new Date(fabric.created_at);
      const alternates = { languages: sitemapAlternates(plPath, { hasDe }, BASE).languages };
      const entries: MetadataRoute.Sitemap = [
        { url: `${BASE}${plPath}`, lastModified, changeFrequency: "monthly", priority: 0.5, alternates },
      ];
      if (hasDe) {
        entries.push({ url: `${BASE}/de${plPath}`, lastModified, changeFrequency: "monthly", priority: 0.5, alternates });
      }
      return entries;
    });
```

3. Dodaj `fabricRoutes` do zwracanej tablicy.

- [ ] **Step 2: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint` → Expected: brak błędów.

```bash
git add app/sitemap.ts
git commit -m "feat(tkaniny): wpisy /tkaniny i /tkaniny/[slug] w sitemapie"
```

---

### Task 12: Selektor tkanin na karcie produktu — karty grup

**Files:**
- Modify: `app/_lib/fabric-context.tsx` (nowy kontekst meta), `app/produkt/[id]/page.tsx` (seed :117-118 i :276-285), `app/_components/ui/VariantSelector.tsx` (`FabricSwatchGroup` :156-246)

**Interfaces:**
- Consumes: `getFabricMetaMap` (Task 4), `FabricValueMeta` (Task 2), `t.fabrics.detailsLink`/`otherGroupLabel` (Task 8), `localizeHref` (`i18n.ts`), `pickLocalized`.
- Produces: `FabricMetaProvider({ map, children })`, `useFabricMeta(): Record<string, FabricValueMeta>`.

- [ ] **Step 1: Kontekst**

Dopisz do `app/_lib/fabric-context.tsx`:

```tsx
import type { FabricValueMeta } from "./variants";

// Mapa wartość wariantu → metadane tkaniny (slug, grupa cenowa) — seed na
// karcie produktu (getFabricMetaMap). Selektor grupuje próbki w karty grup.
const FabricMetaContext = createContext<Record<string, FabricValueMeta>>({});

export function FabricMetaProvider({
  map,
  children,
}: {
  map: Record<string, FabricValueMeta>;
  children: ReactNode;
}) {
  return <FabricMetaContext.Provider value={map}>{children}</FabricMetaContext.Provider>;
}

export function useFabricMeta(): Record<string, FabricValueMeta> {
  return useContext(FabricMetaContext);
}
```

- [ ] **Step 2: Seed na karcie produktu**

`app/produkt/[id]/page.tsx`:
- import: `getFabricMetaMap` z `@/app/_lib/fabrics`, `FabricMetaProvider` z `@/app/_lib/fabric-context`;
- obok `const fabricImageMap = await getFabricImageMap();` (:118) dodaj `const fabricMetaMap = await getFabricMetaMap();`
- owiń (:276): `<FabricImageProvider map={fabricImageMap}><FabricMetaProvider map={fabricMetaMap}>...<ProductMainSection .../>...</FabricMetaProvider></FabricImageProvider>`.

- [ ] **Step 3: Przebudowa `FabricSwatchGroup`**

W `VariantSelector.tsx`: dodaj importy `Link from "next/link"`, `localizeHref` z `@/app/_lib/i18n`, `useFabricMeta` z fabric-context, `pickLocalized` z i18n. Zastąp CAŁY `FabricSwatchGroup` (:156-246) poniższym (props bez zmian — wywołanie :99-108 zostaje):

```tsx
// Ile próbek pokazać zanim „Zobacz więcej" (jak na referencji dealmeble).
const SWATCH_LIMIT = 5;

// Widok kompaktowy: pierwsze SWATCH_LIMIT próbek + „Zobacz więcej (+N)".
// Po rozwinięciu: próbki pogrupowane w rozwijane karty GRUP CENOWYCH
// (spec 2026-07-21), w karcie podsekcje per tkanina z linkiem „szczegóły"
// do /tkaniny/[slug]. Wartości spoza katalogu → karta „Pozostałe".
function FabricSwatchGroup({
  values,
  current,
  valuePrices,
  images,
  labelOf,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  images: Record<string, string>;
  labelOf: (v: string) => string;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  const meta = useFabricMeta();
  const t = getDictionary(locale);
  const [expanded, setExpanded] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);

  const swatch = (v: string) => {
    const active = current === v;
    const img = images[v];
    const surcharge = valuePrices?.[v] ?? 0;
    const label = labelOf(v);
    return (
      <button
        key={v}
        type="button"
        onClick={() => onPick(v)}
        aria-pressed={active}
        className="flex flex-col items-center gap-1.5 text-center group"
      >
        <span
          className={`relative w-16 h-16 rounded-full overflow-hidden border-2 transition-colors ${
            active
              ? "border-[var(--color-gold)]"
              : "border-[var(--border)] group-hover:border-[var(--color-gold)]"
          }`}
        >
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={label} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center bg-[var(--bg)] text-[10px] text-[var(--muted)]">
              {v.split(" ").pop()}
            </span>
          )}
        </span>
        <span
          className={`text-xs leading-tight ${
            active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
          }`}
        >
          {label}
        </span>
        <span className="text-[11px] text-[var(--muted)]">
          {surcharge > 0 ? `+${formatMoney(surcharge, locale, rate)}` : formatMoney(0, locale, rate)}
        </span>
      </button>
    );
  };

  // ── Widok kompaktowy (jak dotąd) ──
  if (!expanded) {
    const shown = values.slice(0, SWATCH_LIMIT);
    const hidden = values.length - shown.length;
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {shown.map(swatch)}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            className="flex flex-col items-center justify-center gap-0.5 min-h-[4rem] p-2 rounded-2xl border border-[var(--border)] text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
          >
            <span className="text-xs font-sans">
              {locale === "de" ? "Mehr anzeigen" : "Zobacz więcej"}
            </span>
            <span className="text-[11px] text-[var(--muted)]">(+{hidden})</span>
          </button>
        )}
      </div>
    );
  }

  // ── Widok rozwinięty: karty grup cenowych ──
  type GroupBucket = {
    code: string;
    label: string;
    surcharge: number;
    sort: number;
    fabrics: Map<string, { slug: string | null; values: string[] }>;
  };
  const buckets = new Map<string, GroupBucket>();
  for (const v of values) {
    const m = meta[v];
    const code = m?.groupCode ?? "__other";
    let bucket = buckets.get(code);
    if (!bucket) {
      bucket = m
        ? {
            code,
            label: pickLocalized(m.groupName, m.groupNameDe, locale),
            surcharge: m.groupSurcharge,
            sort: m.groupSort,
            fabrics: new Map(),
          }
        : {
            code: "__other",
            label: t.fabrics.otherGroupLabel,
            surcharge: 0,
            sort: Number.MAX_SAFE_INTEGER,
            fabrics: new Map(),
          };
      buckets.set(code, bucket);
    }
    const fabricName = m?.fabricName ?? v;
    const entry = bucket.fabrics.get(fabricName);
    if (entry) entry.values.push(v);
    else bucket.fabrics.set(fabricName, { slug: m?.slug ?? null, values: [v] });
  }
  const ordered = [...buckets.values()].sort((a, b) => a.sort - b.sort);
  const currentGroup = current ? meta[current]?.groupCode ?? "__other" : null;
  const open = openGroups ?? new Set([currentGroup ?? ordered[0]?.code]);

  function toggleGroup(code: string) {
    const next = new Set(open);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setOpenGroups(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((g) => {
        const isOpen = open.has(g.code);
        const count = g.fabrics.size;
        return (
          <div key={g.code} className="border border-[var(--border)] rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(g.code)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--card-bg)] hover:bg-[var(--color-gold)]/5 transition-colors text-left"
            >
              <span className="font-sans text-sm font-semibold text-[var(--fg)]">{g.label}</span>
              <span className="text-xs text-[var(--color-gold-text)] font-semibold">
                {g.code !== "__other" &&
                  (g.surcharge > 0
                    ? `+${formatMoney(g.surcharge, locale, rate)}`
                    : t.fabrics.groupNoSurcharge)}
              </span>
              <span className="text-xs text-[var(--muted)] ml-auto">{count}</span>
              <span className="text-[var(--muted)]">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="p-4 flex flex-col gap-5 border-t border-[var(--border)]">
                {[...g.fabrics.entries()].map(([fabricName, entry]) => (
                  <div key={fabricName}>
                    <p className="text-xs font-sans text-[var(--muted)] mb-2 flex items-center gap-2">
                      <span className="font-semibold text-[var(--fg)]">{fabricName}</span>
                      {entry.slug && (
                        <Link
                          href={localizeHref(`/tkaniny/${entry.slug}`, locale)}
                          className="text-[var(--color-gold)] underline underline-offset-2 hover:no-underline"
                        >
                          {t.fabrics.detailsLink}
                        </Link>
                      )}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {entry.values.map(swatch)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="self-start px-4 py-2 text-xs font-sans rounded-full border border-[var(--border)] text-[var(--color-gold)] hover:border-[var(--color-gold)] transition-colors"
      >
        {locale === "de" ? "Weniger anzeigen" : "Zobacz mniej"}
      </button>
    </div>
  );
}
```

Uwaga: `getDictionary` już jest w importach pliku; `Locale` też.

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit && npm run lint && npm test` → Expected: brak błędów.

```bash
git add app/_lib/fabric-context.tsx "app/produkt/[id]/page.tsx" app/_components/ui/VariantSelector.tsx
git commit -m "feat(tkaniny): selektor na karcie produktu — rozwijane karty grup cenowych + linki szczegolow"
```

---

### Task 13: Weryfikacja końcowa + smoke + PR

**Files:** brak nowych — weryfikacja.

- [ ] **Step 1: Pełny zestaw checków**

Upewnij się, że NIE działa `next dev` (pamięć projektu: build przy działającym dev psuje `.next`):

```bash
npm test && npm run lint && npm run build
```

Expected: testy PASS, lint bez błędów, build OK.

- [ ] **Step 2: Smoke lokalny (Playwright — pamięć projektu: weryfikacja wizualna przed wdrożeniem)**

Uwaga: migracja 56 NIE jest zaaplikowana lokalnie ani na produkcji do czasu deployu — lokalny dev używa produkcyjnej bazy (podłączony projekt = produkcja), więc strony tkanin rzucą błędem braku kolumn do czasu merge'a. Smoke przed merge ogranicz do: `npm run build` + przegląd kodu; pełny smoke wizualny wykonaj NA PRODUKCJI zaraz po deployu (screenshoty: `/tkaniny`, `/tkaniny/[slug]` istniejącej tkaniny, karta produktu z tkaninami — rozwinięcie „Zobacz więcej", `/admin/tkaniny`). Jeśli coś nie gra — hotfix przed ogłoszeniem.

- [ ] **Step 3: Push + PR (konto Woodecky10)**

```bash
git push -u origin feat/grupy-cenowe-tkanin
gh pr create --title "feat: grupy cenowe tkanin — katalog /tkaniny, strony tkanin, karty grup przy produkcie" --body "Spec: docs/superpowers/specs/2026-07-21-grupy-cenowe-tkanin-design.md

- tabela fabric_groups (Standard +0 / Premium +250 / Premium High +400, edytowalne w adminie)
- fabrics: group_id, slug, description(+DE); dopłata efektywna = grupa + korekta
- automatyczna propagacja dopłat do value_prices produktów po zmianie tkaniny/grupy
- publiczny katalog /tkaniny + strony /tkaniny/[slug] (opis + wzornik) + sitemap + DE
- selektor na karcie produktu: rozwijane karty grup po „Zobacz więcej"
- admin: panel grup, select grupy, opis WYSIWYG, korekta ceny

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Po merge: sprawdź deploy Vercel, wykonaj smoke z kroku 2 na produkcji, przypisz w adminie tkaniny do właściwych grup.

---

## Self-review (wykonany przy pisaniu planu)

- Spec coverage: model danych (T1), ceny+propagacja (T2, T5), admin (T5, T6), picker (T7), strony publiczne (T8-T10), sitemap (T11), selektor produktu (T12), testy (T2, T3), przypadki brzegowe (orphany — T2/T12; tkanina bez kolorów — T9/T10; slug — T1/T3; grupa 0 zł — T6/T9/T10/T12).
- Typy spójne: `FabricLite.group_id?`, `FabricValueMeta`, `fabricSlug`, `updateFabricGroup` — zdefiniowane raz (T2/T3/T5), konsumowane pod tymi samymi nazwami w T4-T12.
- Odstępstwo od specu (świadome): propagacja to `recomputeFabricSurchargesOnProducts()` bez parametru (przelicza wszystkie produkty i zapisuje tylko zmienione) zamiast `recomputeProductsForFabrics(names)` — prostsze i zawsze poprawne przy tej samej złożoności.
