# Rozmiar mebla do dopłat za tkaninę — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dopłata za tkaninę zależy od rozmiaru mebla wybieranego z listy, z kwotami w złotych dla każdej grupy cenowej.

**Architecture:** Nowa tabela `fabric_sizes` trzyma dopłaty per kod grupy. Czysta funkcja rozstrzyga dla produktu źródło dopłat (własne → rozmiar produktu → rozmiar kategorii → globalne) i buduje mapę `id grupy → dopłata`, którą dostają istniejące `expandFabrics` i `rebuildFabricValuePrices` bez zmiany sygnatur. Przeliczenie zapisanych `value_prices` przenosi się do wspólnego modułu i liczy mapę osobno dla każdego produktu.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres, RLS), TypeScript, Vitest (`environment: "node"`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-rozmiar-do-doplat-design.md`

## Global Constraints

- Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik w `node_modules/next/dist/docs/` (`AGENTS.md`).
- Kody grup cenowych są stałe: `standard`, `premium`, `premium_high`. Mapy dopłat rozmiaru i produktu są kluczowane **kodem** grupy; mapy podawane do `expandFabrics`/`rebuildFabricValuePrices` są kluczowane **id** grupy.
- Brak klucza grupy w mapie rozmiaru lub produktu = globalna dopłata grupy, nigdy 0.
- Kwoty: liczby skończone `>= 0`, zaokrąglone do 2 miejsc.
- Nazwa w panelu: **„Rozmiar do dopłat za tkaninę"**. Nie „Rozmiar" — to istniejące pole `size_label`.
- `select("*")` na bazie bez nowej kolumny daje `undefined`: wszędzie czytaj `?? null`.
- Loader z `unstable_cache` przy błędzie bazy rzuca, a zapas daje `withFallback` (`app/_lib/cache-fallback.ts`). Nigdy `return []` przy błędzie.
- Baza jest wspólna z produkcją. Testy Playwrighta nie zapisują niczego. Uruchamiaj je na buildzie (`npm run build` + `npm start`), nie na `next dev`.
- Migracja 86 jest tylko dodająca i musi być zaaplikowana **przed** wdrożeniem kodu (Zadanie 9). Rollback: najpierw revert kodu, potem migracja.
- W repo nie ma prettiera. Pliki mają CRLF — po edycjach sprawdź `git diff --stat` i brak zmian samych końców linii.
- Commity i push tylko na gałęzi roboczej `feat/rozmiar-do-doplat`; push wymaga konta Woodecky10.

## Review Focus

1. Usunięcie rozmiaru używanego przez produkty i kategorie → produkty wracają do następnego poziomu i mają przeliczone dopłaty (test w Zadaniu 1 i 3).
2. Rozmiar bez klucza którejś grupy albo czwarta grupa dodana później → globalna dopłata tej grupy, nie 0 (test w Zadaniu 1).
3. Zapis wariantów po zmianie rozmiaru bez przeładowania strony → stare dopłaty z pamięci edytora nie nadpisują przeliczonych (Zadanie 6, krok 5).
4. Produkt z nieistniejącą kategorią, z `fabric_size_id` wskazującym usunięty rozmiar albo czytany ze starego cache bez kolumn → źródło `none`, bez wyjątku (test w Zadaniu 1).
5. Wartości tkanin spoza katalogu zachowują swoją dopłatę przy przeliczeniu z mapą per produkt (test w Zadaniu 3).

---

### Task 1: Czysta logika rozstrzygania dopłat

**Files:**
- Create: `app/_lib/fabric-sizes.ts`
- Test: `app/_lib/__tests__/fabric-sizes.test.ts`

**Interfaces:**
- Produces:

```ts
export type FabricSurchargeByCode = Record<string, number>; // klucz = fabric_groups.code
export type FabricSize = {
  id: string; name: string; surcharges: FabricSurchargeByCode;
  sort_order: number; created_at: string;
};
export type FabricSizeSource = "own" | "product" | "category" | "none";
export type FabricSizing = {
  source: FabricSizeSource;
  size: FabricSize | null;                    // null dla "own" i "none"
  surcharges: FabricSurchargeByCode | null;   // null dla "none"
};
export function parseSurchargeByCode(input: unknown): FabricSurchargeByCode | null;
export function resolveFabricSizing(
  product: { category: string; fabric_size_id?: string | null; fabric_surcharges?: unknown },
  categories: { slug: string; defaultFabricSizeId?: string | null }[],
  sizes: FabricSize[]
): FabricSizing;
export function effectiveGroupSurcharges(
  groups: { id: string; code: string; surcharge: number }[],
  byCode: FabricSurchargeByCode | null
): Record<string, number>;                    // klucz = id grupy
export function withGroupSurcharges<G extends { id: string; surcharge: number }>(
  groups: G[], byGroupId: Record<string, number>
): G[];                                       // kopie grup z podmienioną dopłatą
export function needsFabricSize(variants: ProductVariants | null, sizing: FabricSizing): boolean;
```

- [ ] **Step 1: Napisz testy, które nie przechodzą**

```ts
const GROUPS = [
  { id: "g-std", code: "standard", surcharge: 0 },
  { id: "g-pre", code: "premium", surcharge: 250 },
  { id: "g-hi", code: "premium_high", surcharge: 400 },
];
const FOTEL: FabricSize = { id: "s-fotel", name: "Fotel", sort_order: 0, created_at: "",
  surcharges: { standard: 0, premium: 100, premium_high: 160 } };
const CATS = [{ slug: "fotele", defaultFabricSizeId: "s-fotel" }, { slug: "pufy", defaultFabricSizeId: null }];

describe("parseSurchargeByCode", () => {
  it("zostawia liczby >= 0 zaokrąglone do 2 miejsc", () =>
    expect(parseSurchargeByCode({ premium: 99.999, standard: 0 })).toEqual({ premium: 100, standard: 0 }));
  it("pomija wartości ujemne, NaN i nie-liczby", () =>
    expect(parseSurchargeByCode({ premium: -1, standard: "5", premium_high: NaN, x: 10 })).toEqual({ x: 10 }));
  it("null dla nie-obiektu, tablicy i pustego wyniku", () => {
    expect(parseSurchargeByCode(null)).toBeNull();
    expect(parseSurchargeByCode([1])).toBeNull();
    expect(parseSurchargeByCode({ premium: -1 })).toBeNull();
  });
});

describe("resolveFabricSizing", () => {
  it("własne dopłaty wygrywają z rozmiarem produktu", () =>
    expect(resolveFabricSizing({ category: "fotele", fabric_size_id: "s-fotel", fabric_surcharges: { premium: 50 } }, CATS, [FOTEL]))
      .toEqual({ source: "own", size: null, surcharges: { premium: 50 } }));
  it("rozmiar produktu wygrywa z kategorią", () =>
    expect(resolveFabricSizing({ category: "pufy", fabric_size_id: "s-fotel" }, CATS, [FOTEL]).source).toBe("product"));
  it("bez rozmiaru produktu bierze rozmiar kategorii głównej", () =>
    expect(resolveFabricSizing({ category: "fotele" }, CATS, [FOTEL]))
      .toEqual({ source: "category", size: FOTEL, surcharges: FOTEL.surcharges }));
  it("usunięty rozmiar na produkcie spada do kategorii", () =>
    expect(resolveFabricSizing({ category: "fotele", fabric_size_id: "s-nie-ma" }, CATS, [FOTEL]).source).toBe("category"));
  it("nieznana kategoria, kategoria bez rozmiaru i brak kolumn dają none", () => {
    const none = { source: "none", size: null, surcharges: null };
    expect(resolveFabricSizing({ category: "nie-ma" }, CATS, [FOTEL])).toEqual(none);
    expect(resolveFabricSizing({ category: "pufy", fabric_size_id: undefined, fabric_surcharges: undefined }, CATS, [FOTEL])).toEqual(none);
    expect(resolveFabricSizing({ category: "fotele" }, [{ slug: "fotele" }], [FOTEL])).toEqual(none);
  });
});

describe("effectiveGroupSurcharges", () => {
  it("null → globalne dopłaty grup", () =>
    expect(effectiveGroupSurcharges(GROUPS, null)).toEqual({ "g-std": 0, "g-pre": 250, "g-hi": 400 }));
  it("podmienia grupy wycenione w rozmiarze", () =>
    expect(effectiveGroupSurcharges(GROUPS, FOTEL.surcharges)).toEqual({ "g-std": 0, "g-pre": 100, "g-hi": 160 }));
  it("brak klucza grupy → globalna dopłata, nie 0", () =>
    expect(effectiveGroupSurcharges(GROUPS, { premium: 100 })).toEqual({ "g-std": 0, "g-pre": 100, "g-hi": 400 }));
});

describe("withGroupSurcharges", () => {
  it("zwraca kopie z podmienioną dopłatą, bez mutacji wejścia", () => {
    const out = withGroupSurcharges(GROUPS, { "g-pre": 100 });
    expect(out.map((g) => g.surcharge)).toEqual([0, 100, 400]);
    expect(GROUPS[1].surcharge).toBe(250);
  });
});

describe("needsFabricSize", () => {
  const zTkanina = { options: [{ name: "Tkanina", values: ["Sawana 21"] }] };
  const none = { source: "none" as const, size: null, surcharges: null };
  it("produkt z tkaniną i bez źródła potrzebuje rozmiaru", () => expect(needsFabricSize(zTkanina, none)).toBe(true));
  it("produkt bez opcji Tkanina nie potrzebuje", () => {
    expect(needsFabricSize(null, none)).toBe(false);
    expect(needsFabricSize({ options: [{ name: "Strona", values: ["Lewa"] }] }, none)).toBe(false);
  });
  it("produkt ze źródłem nie potrzebuje", () =>
    expect(needsFabricSize(zTkanina, { source: "category", size: FOTEL, surcharges: FOTEL.surcharges })).toBe(false));
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts`
Expected: FAIL (brak modułu `../fabric-sizes`).

- [ ] **Step 3: Zaimplementuj `app/_lib/fabric-sizes.ts`**

Moduł czysty, bez importów Supabase i Next. Nazwę opcji bierz z `FABRIC_OPTION_NAME` (`./variants`). `fabric_surcharges` produktu przepuść przez `parseSurchargeByCode`; `null` znaczy „brak własnych dopłat".

- [ ] **Step 4: Uruchom i potwierdź sukces**

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-sizes.ts app/_lib/__tests__/fabric-sizes.test.ts
git commit -m "feat(tkaniny): rozstrzyganie dopłat wg rozmiaru mebla"
```

---

### Task 2: Migracja, typy i odczyt rozmiarów

**Files:**
- Create: `supabase/migrations/86_fabric_sizes.sql`
- Create: `app/_lib/fabric-sizes-data.ts`
- Modify: `app/_lib/types.ts` (typ `Product`)
- Modify: `app/_lib/category-tree.ts` (typ `CategoryNode`)
- Modify: `app/_lib/categories.ts` (mapowanie wiersza na `CategoryNode`, okolice linii 49–80)
- Test: `app/_lib/__tests__/cache-bledy-bazy.test.ts` (dopisz przypadek dla nowego loadera wg wzorca z tego pliku)

**Interfaces:**
- Consumes: `FabricSize`, `parseSurchargeByCode` z Zadania 1.
- Produces:

```ts
// app/_lib/fabric-sizes-data.ts
export const FABRIC_SIZES_CACHE_TAG = "fabric-sizes";
export const getFabricSizes: () => Promise<FabricSize[]>;   // cache() + unstable_cache + withFallback(…, [])
export function invalidateFabricSizesCache(): void;
// Product
fabric_size_id?: string | null;
fabric_surcharges?: Record<string, number> | null;
// CategoryNode
defaultFabricSizeId: string | null;
```

- [ ] **Step 1: Napisz migrację `86_fabric_sizes.sql`**

```sql
-- Migracja 86: rozmiary mebli do dopłat za tkaninę (spec 2026-11-17).
-- surcharges = { "<fabric_groups.code>": kwota }. Brak klucza = globalna dopłata grupy.
create table if not exists public.fabric_sizes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  surcharges  jsonb not null default '{}'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.fabric_sizes enable row level security;
create policy "fabric_sizes: admin all"
  on public.fabric_sizes for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

alter table public.categories
  add column if not exists default_fabric_size_id uuid
  references public.fabric_sizes(id) on delete set null;

alter table public.products
  add column if not exists fabric_size_id uuid
  references public.fabric_sizes(id) on delete set null;
alter table public.products
  add column if not exists fabric_surcharges jsonb;
```

- [ ] **Step 2: Dopisz pola do typów `Product` i `CategoryNode`**

W `categories.ts` mapuj `default_fabric_size_id ?? null` na `defaultFabricSizeId`. Komentarz przy polach `Product`: opcjonalne, bo `select("*")` na bazie bez kolumny daje `undefined`.

- [ ] **Step 3: Dopisz test loadera, który nie przechodzi**

W `cache-bledy-bazy.test.ts` dodaj przypadek „`getFabricSizes` rzuca wewnątrz cache i oddaje `[]` przez zapas" tym samym sposobem mockowania, którego plik używa dla `getFabricPriceGroups`.

Run: `npx vitest run app/_lib/__tests__/cache-bledy-bazy.test.ts`
Expected: FAIL (brak `fabric-sizes-data`).

- [ ] **Step 4: Zaimplementuj `app/_lib/fabric-sizes-data.ts`**

Skopiuj wzorzec `fetchFabricPriceGroups`/`getFabricPriceGroups` z `app/_lib/fabrics.ts`: `createAdminClient`, `select("*")`, sortowanie `sort_order` potem `name`, `revalidate: 300`. Każdy wiersz: `surcharges: parseSurchargeByCode(row.surcharges) ?? {}`.

- [ ] **Step 5: Uruchom testy i typy**

Run: `npx vitest run app/_lib/__tests__/cache-bledy-bazy.test.ts && npx tsc --noEmit`
Expected: PASS, zero błędów typów.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/86_fabric_sizes.sql app/_lib/fabric-sizes-data.ts app/_lib/types.ts app/_lib/category-tree.ts app/_lib/categories.ts app/_lib/__tests__/cache-bledy-bazy.test.ts
git commit -m "feat(tkaniny): tabela fabric_sizes, pola produktu i kategorii"
```

---

### Task 3: Przeliczanie dopłat per produkt we wspólnym module

**Files:**
- Create: `app/_lib/fabric-surcharge-recompute.ts`
- Modify: `app/admin/tkaniny/actions.ts:134-208` (usuń `PRODUCT_WRITE_CONCURRENCY`, `recomputeFabricSurchargesOnProducts`, `writeProductVariants`; importuj z nowego modułu; wszystkie dotychczasowe wywołania zostają)
- Test: `app/_lib/__tests__/fabric-surcharge-recompute.test.ts`

**Interfaces:**
- Consumes: `resolveFabricSizing`, `effectiveGroupSurcharges`, `FabricSize` (Zadanie 1); `rebuildFabricValuePrices`, `FabricLite` (`variants.ts`).
- Produces:

```ts
// czysta część — testowana
export type RecomputeProductRow = {
  id: string; variants: ProductVariants | null; category: string;
  fabric_size_id?: string | null; fabric_surcharges?: unknown;
};
export function planFabricSurchargeUpdates(input: {
  products: RecomputeProductRow[];
  fabrics: FabricLite[];
  groups: { id: string; code: string; surcharge: number }[];
  categories: { slug: string; defaultFabricSizeId?: string | null }[];
  sizes: FabricSize[];
}): { id: string; variants: ProductVariants }[];   // tylko produkty faktycznie zmienione

// część z I/O
export async function recomputeFabricSurcharges(
  opts?: { productIds?: string[] }
): Promise<{ updated: number }>;
export async function writeProductVariants(
  changed: { id: string; variants: ProductVariants }[], logTag: string
): Promise<number>;
```

- [ ] **Step 1: Napisz testy `planFabricSurchargeUpdates`, które nie przechodzą**

```ts
const GROUPS = [{ id: "g-std", code: "standard", surcharge: 0 }, { id: "g-pre", code: "premium", surcharge: 250 }];
const FABRICS = [{ name: "Riviera", colors: ["16"], price: 20, group_id: "g-pre" }];
const FOTEL = { id: "s-fotel", name: "Fotel", sort_order: 0, created_at: "", surcharges: { premium: 100 } };
const tkanina = (vp?: Record<string, number>) =>
  ({ options: [{ name: "Tkanina", values: ["Riviera 16", "Stara 1"], value_prices: vp }] });

it("ten sam materiał: narożnik dostaje globalną dopłatę, fotel dopłatę rozmiaru (+ korekta)", () => {
  const out = planFabricSurchargeUpdates({
    products: [
      { id: "naroznik", category: "narozniki", variants: tkanina() },
      { id: "fotel", category: "fotele", variants: tkanina() },
    ],
    fabrics: FABRICS, groups: GROUPS, sizes: [FOTEL],
    categories: [{ slug: "fotele", defaultFabricSizeId: "s-fotel" }, { slug: "narozniki", defaultFabricSizeId: null }],
  });
  const vp = (id: string) => out.find((p) => p.id === id)!.variants.options[0].value_prices;
  expect(vp("naroznik")).toEqual({ "Riviera 16": 270 });
  expect(vp("fotel")).toEqual({ "Riviera 16": 120 });
});

it("wartość spoza katalogu zachowuje swoją dopłatę", () => {
  const out = planFabricSurchargeUpdates({
    products: [{ id: "fotel", category: "fotele", variants: tkanina({ "Stara 1": 77 }) }],
    fabrics: FABRICS, groups: GROUPS, sizes: [FOTEL],
    categories: [{ slug: "fotele", defaultFabricSizeId: "s-fotel" }],
  });
  expect(out[0].variants.options[0].value_prices).toEqual({ "Riviera 16": 120, "Stara 1": 77 });
});

it("po usunięciu rozmiaru produkt wraca do globalnej dopłaty", () => {
  const out = planFabricSurchargeUpdates({
    products: [{ id: "fotel", category: "fotele", fabric_size_id: "s-fotel", variants: tkanina({ "Riviera 16": 120 }) }],
    fabrics: FABRICS, groups: GROUPS, sizes: [],
    categories: [{ slug: "fotele", defaultFabricSizeId: null }],
  });
  expect(out[0].variants.options[0].value_prices).toEqual({ "Riviera 16": 270 });
});

it("pomija produkty bez zmian i bez opcji Tkanina", () => {
  const out = planFabricSurchargeUpdates({
    products: [
      { id: "ok", category: "x", variants: tkanina({ "Riviera 16": 270 }) },
      { id: "bez", category: "x", variants: { options: [{ name: "Strona", values: ["Lewa"] }] } },
      { id: "null", category: "x", variants: null },
    ],
    fabrics: FABRICS, groups: GROUPS, sizes: [], categories: [],
  });
  expect(out).toEqual([]);
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run app/_lib/__tests__/fabric-surcharge-recompute.test.ts`
Expected: FAIL (brak modułu).

- [ ] **Step 3: Zaimplementuj moduł**

Plik zaczyna się od `import "server-only";` i **nie** ma `"use server"`. `planFabricSurchargeUpdates` jest czysta. `recomputeFabricSurcharges` czyta bazę bezpośrednio przez `createAdminClient` (nie przez cache — bywa wołana tuż po zapisie): `fabrics(name, colors, price, group_id)`, `fabric_groups(id, code, surcharge)`, `fabric_sizes(*)`, `categories(slug, default_fabric_size_id)`, `products(id, variants, category, fabric_size_id, fabric_surcharges)` z `.not("variants", "is", null)` i opcjonalnym `.in("id", productIds)`. Błąd dowolnego z zapytań: `console.error("[recomputeFabricSurcharges] …")` i `return { updated: 0 }` bez zapisu. `writeProductVariants` przenieś bez zmian zachowania; po udanych zapisach `invalidateFacetsCache()` i `revalidatePath("/sklep")` jak dotąd.

- [ ] **Step 4: Podmień wywołania w `app/admin/tkaniny/actions.ts`**

`recomputeFabricSurchargesOnProducts()` → `recomputeFabricSurcharges()`. `remapFabricOnProducts` i `removeFabricFromProducts` używają importowanego `writeProductVariants`.

- [ ] **Step 5: Uruchom testy i typy**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, w tym dotychczasowe `variants.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/fabric-surcharge-recompute.ts app/_lib/__tests__/fabric-surcharge-recompute.test.ts app/admin/tkaniny/actions.ts
git commit -m "refactor(tkaniny): przeliczanie dopłat per produkt we wspólnym module"
```

---

### Task 4: Panel rozmiarów w `/admin/tkaniny`

**Files:**
- Create: `app/admin/tkaniny/size-actions.ts`
- Create: `app/admin/tkaniny/FabricSizesPanel.tsx`
- Modify: `app/admin/tkaniny/page.tsx` (dociągnij `getFabricSizes()`, podaj `sizes`)
- Modify: `app/admin/tkaniny/FabricsEditor.tsx` (prop `sizes: FabricSize[]`; panel bezpośrednio pod `<FabricGroupsPanel …/>`)
- Test: `app/_lib/__tests__/fabric-sizes.test.ts` (dopisz testy `fabricSizeFromForm`)

**Interfaces:**
- Consumes: `recomputeFabricSurcharges` (Zadanie 3), `invalidateFabricSizesCache` (Zadanie 2).
- Produces:

```ts
// app/_lib/fabric-sizes.ts — czysty parser formularza
export function fabricSizeFromForm(
  formData: FormData, groupCodes: string[]
): { ok: true; name: string; sort_order: number; surcharges: FabricSurchargeByCode }
 | { ok: false; error: string };
// app/admin/tkaniny/size-actions.ts ("use server")
export async function createFabricSize(formData: FormData): Promise<ActionResult>;
export async function updateFabricSize(formData: FormData): Promise<ActionResult>;
export async function deleteFabricSize(formData: FormData): Promise<ActionResult>;
```

Pola formularza: `id`, `name`, `sort_order`, `surcharge_<kod grupy>` (jedno na grupę).

- [ ] **Step 1: Napisz testy `fabricSizeFromForm`, które nie przechodzą**

```ts
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const CODES = ["standard", "premium", "premium_high"];
it("czyta nazwę i kwoty wszystkich grup, przecinek jako separator", () =>
  expect(fabricSizeFromForm(fd({ name: " Fotel ", sort_order: "2", surcharge_standard: "", surcharge_premium: "100", surcharge_premium_high: "160,50" }), CODES))
    .toEqual({ ok: true, name: "Fotel", sort_order: 2, surcharges: { standard: 0, premium: 100, premium_high: 160.5 } }));
it("odrzuca pustą nazwę", () =>
  expect(fabricSizeFromForm(fd({ name: "  " }), CODES)).toEqual({ ok: false, error: "Nazwa rozmiaru jest wymagana" }));
it("odrzuca kwotę ujemną i nieliczbową", () => {
  expect(fabricSizeFromForm(fd({ name: "Fotel", surcharge_premium: "-5" }), CODES)).toEqual({ ok: false, error: "Dopłata musi być liczbą nieujemną" });
  expect(fabricSizeFromForm(fd({ name: "Fotel", surcharge_premium: "abc" }), CODES)).toEqual({ ok: false, error: "Dopłata musi być liczbą nieujemną" });
});
```

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj `fabricSizeFromForm`**

Nazwa: `trim`, maks. 60 znaków. Puste pole kwoty = 0. Każda grupa z `groupCodes` dostaje klucz.

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts` — Expected: PASS.

- [ ] **Step 3: Zaimplementuj akcje w `size-actions.ts`**

Każda: `requireAdmin()`, kody grup z tabeli `fabric_groups`, zapis przez `createAdminClient`, potem `invalidateFabricSizesCache()`, `recomputeFabricSurcharges()`, `revalidatePath("/admin/tkaniny")`. Komunikat sukcesu: `Zapisano rozmiar. Przeliczono dopłaty w N produktach.` / `Usunięto rozmiar. Przeliczono dopłaty w N produktach.` `createFabricSize` nie przelicza (nikt jeszcze nie używa nowego rozmiaru).

- [ ] **Step 4: Zbuduj `FabricSizesPanel.tsx`**

Wzoruj układ, przyciski i `useConfirm` na `FabricGroupsPanel.tsx`. Nagłówek: „Rozmiary mebli do dopłat za tkaninę". Opis: „Każdy rozmiar ma własną dopłatę za każdą grupę cenową. Produkt bierze rozmiar ze swojej kategorii, chyba że ustawisz mu inny. Produkt bez rozmiaru dopłaca według grup cenowych powyżej." Wiersz: pole „Nazwa", po jednym polu `Dopłata <nazwa grupy> (zł)` na grupę, „Zapisz", „Usuń". Pod listą formularz „Dodaj rozmiar". Potwierdzenie zapisu: `Zapisać rozmiar "<nazwa>"? Dopłaty zostaną przeliczone w produktach, które go używają.` Potwierdzenie usunięcia: `Usunąć rozmiar "<nazwa>"? Produkty i kategorie, które go używają, wrócą do dopłat z kategorii albo grup cenowych.`

- [ ] **Step 5: Podłącz panel i sprawdź build**

Run: `npx tsc --noEmit && npm run build`
Expected: build przechodzi.

- [ ] **Step 6: Commit**

```bash
git add app/admin/tkaniny app/_lib/fabric-sizes.ts app/_lib/__tests__/fabric-sizes.test.ts
git commit -m "feat(panel): rozmiary mebli do dopłat za tkaninę"
```

---

### Task 5: Rozmiar domyślny kategorii

**Files:**
- Modify: `app/admin/kategorie/page.tsx` (dociągnij `getFabricSizes()`, podaj `sizes`)
- Modify: `app/admin/kategorie/KategorieEditor.tsx` (`CategoryForm`, okolice linii 418–570)
- Modify: `app/admin/kategorie/actions.ts` (`createCategory`, `updateCategory`)
- Test: `app/_lib/__tests__/fabric-sizes.test.ts`

**Interfaces:**
- Consumes: `recomputeFabricSurcharges`, `getFabricSizes`.
- Produces:

```ts
// app/_lib/fabric-sizes.ts
export function fabricSizeIdFromForm(
  formData: FormData, field: string, sizes: { id: string }[]
): string | null | undefined;  // undefined = formularz bez pola; null = „— brak —” albo nieznane id
```

Pole formularza kategorii: `default_fabric_size_id`.

- [ ] **Step 1: Napisz testy, które nie przechodzą**

```ts
const SIZES = [{ id: "s-fotel" }];
it("brak pola → undefined (kolumny nie ruszamy)", () => expect(fabricSizeIdFromForm(new FormData(), "default_fabric_size_id", SIZES)).toBeUndefined());
it("pusta wartość → null", () => expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "" }), "default_fabric_size_id", SIZES)).toBeNull());
it("znane id przechodzi, nieznane → null", () => {
  expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "s-fotel" }), "default_fabric_size_id", SIZES)).toBe("s-fotel");
  expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "s-nie-ma" }), "default_fabric_size_id", SIZES)).toBeNull();
});
```

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj `fabricSizeIdFromForm`** i uruchom testy — Expected: PASS.

- [ ] **Step 3: Dodaj pole do `CategoryForm`**

`<select name="default_fabric_size_id">` z opcją `— brak —` (wartość pusta) i rozmiarami. Etykieta: „Rozmiar do dopłat za tkaninę". Podpowiedź: „Produkty z tą kategorią jako główną dostają dopłaty tego rozmiaru, jeśli nie mają własnego." Gdy lista rozmiarów jest pusta, pola nie renderuj.

- [ ] **Step 4: Zapisuj pole w akcjach**

Rozmiary do walidacji czytaj z bazy (`fabric_sizes`, `select("id")`). `undefined` → nie dodawaj klucza do `update`/`insert`. W `updateCategory` po udanym zapisie, gdy pole było w formularzu: `await recomputeFabricSurcharges()`.

- [ ] **Step 5: Sprawdź typy i build**

Run: `npx tsc --noEmit && npm run build` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/kategorie app/_lib/fabric-sizes.ts app/_lib/__tests__/fabric-sizes.test.ts
git commit -m "feat(panel): rozmiar domyślny do dopłat na kategorii"
```

---

### Task 6: Rozmiar i własne dopłaty na produkcie

**Files:**
- Modify: `app/admin/produkty/[id]/page.tsx` (dociągnij `getFabricSizes()`; policz `sizing` i `groupSurcharges`)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (pole w formularzu podstawowych danych pod kategoriami dodatkowymi, okolice linii 457; przekazanie do `VariantsEditor` w linii 885)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx:222` i `:938` (mapa z propsa zamiast `buildGroupSurchargeMap`)
- Modify: `app/admin/produkty/actions.ts` (`updateProductBasics`, `duplicateProduct`)
- Test: `app/_lib/__tests__/fabric-sizes.test.ts`

**Interfaces:**
- Consumes: `resolveFabricSizing`, `effectiveGroupSurcharges`, `fabricSizeIdFromForm`, `recomputeFabricSurcharges`.
- Produces:

```ts
// app/_lib/fabric-sizes.ts
export function productFabricSizingFromForm(
  formData: FormData, groupCodes: string[], sizes: { id: string }[]
): { fabric_size_id: string | null; fabric_surcharges: FabricSurchargeByCode | null }
 | { error: string } | undefined;   // undefined = formularz bez znacznika fabric_size_present
// VariantsEditor — nowy prop zamiast liczenia z fabricGroups
groupSurcharges: Record<string, number>;   // id grupy → dopłata dla TEGO produktu
```

Pola formularza: znacznik `fabric_size_present=1`, `fabric_size_id` (`""` = z kategorii, id rozmiaru, `__own` = własne dopłaty), `own_surcharge_<kod grupy>`.

- [ ] **Step 1: Napisz testy, które nie przechodzą**

```ts
it("bez znacznika → undefined", () => expect(productFabricSizingFromForm(new FormData(), CODES, SIZES)).toBeUndefined());
it("pusty wybór → rozmiar z kategorii", () =>
  expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "" }), CODES, SIZES)).toEqual({ fabric_size_id: null, fabric_surcharges: null }));
it("wybrany rozmiar czyści własne dopłaty", () =>
  expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "s-fotel", own_surcharge_premium: "50" }), CODES, SIZES)).toEqual({ fabric_size_id: "s-fotel", fabric_surcharges: null }));
it("własne dopłaty: wszystkie grupy, puste = 0", () =>
  expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_premium: "120" }), CODES, SIZES))
    .toEqual({ fabric_size_id: null, fabric_surcharges: { standard: 0, premium: 120, premium_high: 0 } }));
it("własne dopłaty z kwotą ujemną → błąd", () =>
  expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_premium: "-1" }), CODES, SIZES)).toEqual({ error: "Dopłata musi być liczbą nieujemną" }));
```

Run: `npx vitest run app/_lib/__tests__/fabric-sizes.test.ts` — Expected: FAIL.

- [ ] **Step 2: Zaimplementuj `productFabricSizingFromForm`** i uruchom testy — Expected: PASS.

- [ ] **Step 3: Dodaj pole do `ProductEditor`**

Etykieta: „Rozmiar do dopłat za tkaninę". Podpowiedź: „Decyduje o wysokości dopłat za tkaniny. To nie jest rozmiar mebla pokazywany klientowi." Opcje `select`: `Z kategorii: <nazwa rozmiaru kategorii głównej>` albo `Z kategorii: brak (dopłaty z grup cenowych)`, potem rozmiary, na końcu `Własne dopłaty…`. Po wybraniu „Własne dopłaty…" pokaż po jednym polu `Dopłata <nazwa grupy> (zł)` na grupę, wypełnione z `product.fabric_surcharges`. Gdy lista rozmiarów jest pusta, pokaż tylko opcje „Z kategorii…" i „Własne dopłaty…". Pole i znacznik renderuj wewnątrz formularza podstawowych danych.

- [ ] **Step 4: Zapisuj w `updateProductBasics` i przeliczaj produkt**

`undefined` → nie ruszaj kolumn; `{ error }` → `return { ok: false, error }`. Kody grup i rozmiary czytaj z bazy. Po udanym `update` zawsze `await recomputeFabricSurcharges({ productIds: [id] })` — obejmuje też zmianę kategorii głównej. `duplicateProduct` kopiuje `fabric_size_id` i `fabric_surcharges`.

- [ ] **Step 5: Podaj mapę do `VariantsEditor` i wymuś świeży stan po zmianie**

W `page.tsx`: `sizing = resolveFabricSizing(product, categories, sizes)`, `groupSurcharges = effectiveGroupSurcharges(fabricGroups, sizing.surcharges)`. `VariantsEditor` i `FabricPicker` używają `groupSurcharges` w miejscach `buildGroupSurchargeMap(...)`. W `ProductEditor` dodaj `key={JSON.stringify(groupSurcharges)}` na `<VariantsEditor>`: po zapisie podstawowych danych i `router.refresh()` edytor montuje się od nowa z przeliczonymi wariantami, więc „Zapisz warianty" nie nadpisze ich starymi dopłatami z pamięci. Sprawdź, że handler zapisu podstawowych danych woła `router.refresh()`; jeśli nie, dodaj.

- [ ] **Step 6: Sprawdź typy, testy i build**

Run: `npx vitest run && npx tsc --noEmit && npm run build` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin/produkty app/_lib/fabric-sizes.ts app/_lib/__tests__/fabric-sizes.test.ts
git commit -m "feat(panel): rozmiar do dopłat i własne dopłaty na produkcie"
```

---

### Task 7: Karta produktu i strony tkanin dla klienta

**Files:**
- Modify: `app/_lib/fabrics.ts:111-118` (`getFabricMetaMap`)
- Modify: `app/produkt/[id]/page.tsx:131`
- Modify: `app/tkaniny/page.tsx:78-80`
- Modify: `app/tkaniny/[slug]/page.tsx:140`
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (sekcja `fabrics`)

**Interfaces:**
- Consumes: `withGroupSurcharges`, `resolveFabricSizing`, `effectiveGroupSurcharges`, `getFabricSizes`.
- Produces:

```ts
export async function getFabricMetaMap(
  surchargeByGroupId?: Record<string, number>
): Promise<Record<string, FabricValueMeta>>;
// słownik
fabrics.surchargeDependsOnFurniture: "dopłata zależy od mebla" / "Aufpreis je nach Möbelstück"
```

- [ ] **Step 1: `getFabricMetaMap` przyjmuje mapę dopłat**

Gdy podana, grupy przechodzą przez `withGroupSurcharges` przed `buildFabricMetaMap`. Bez argumentu zachowanie jak dziś. (`withGroupSurcharges` ma test w Zadaniu 1.)

- [ ] **Step 2: Karta produktu liczy mapę dla produktu**

W `app/produkt/[id]/page.tsx`: dociągnij `getFabricSizes()`, `getAllCategories()` i `getFabricPriceGroups()` (dołącz do istniejącego `Promise.all`, jeśli któreś już tam jest — użyj go), policz `effectiveGroupSurcharges(groups, resolveFabricSizing(product, categories, sizes).surcharges)` i podaj do `getFabricMetaMap`. `VariantSelector.tsx` bez zmian: nagłówek karty grupy czyta `m.groupSurcharge`.

- [ ] **Step 3: Strony tkanin**

Obie strony dociągają `getFabricSizes()`. Gdy `sizes.length > 0` i kwota `> 0`, w miejscu `+<kwota>` pokaż `t.fabrics.surchargeDependsOnFurniture`. Gdy rozmiarów nie ma albo kwota to 0, zostaje dzisiejszy tekst.

- [ ] **Step 4: Sprawdź typy i build**

Run: `npx vitest run && npx tsc --noEmit && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabrics.ts app/produkt app/tkaniny app/_lib/dictionaries
git commit -m "feat(sklep): dopłata grupy tkanin właściwa dla mebla"
```

---

### Task 8: Plakietka „bez rozmiaru" na liście produktów

**Files:**
- Modify: `app/admin/produkty/page.tsx` (mapowanie wierszy, okolice linii 17–45)
- Modify: `app/admin/produkty/ProductsList.tsx`

**Interfaces:**
- Consumes: `needsFabricSize`, `resolveFabricSizing`, `getFabricSizes`, `getAllCategories`.
- Produces: pole wiersza listy `needsFabricSize: boolean`.

- [ ] **Step 1: Policz flagę na serwerze**

`needsFabricSize = sizes.length > 0 && needsFabricSize(p.variants, resolveFabricSizing(p, categories, sizes))`. Bez zdefiniowanych rozmiarów flaga jest zawsze `false`. (Funkcja ma test w Zadaniu 1.)

- [ ] **Step 2: Pokaż plakietkę**

Tekst: `bez rozmiaru`. `title`: „Ten produkt ma tkaniny, ale ani on, ani jego kategoria nie mają rozmiaru do dopłat. Dopłaty liczą się według grup cenowych." Styl skopiuj z plakietki „bez kategorii Google" (`KategorieEditor.tsx:350-356`).

- [ ] **Step 3: Sprawdź typy i build**

Run: `npx tsc --noEmit && npm run build` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/page.tsx app/admin/produkty/ProductsList.tsx
git commit -m "feat(panel): plakietka produktu bez rozmiaru do dopłat"
```

---

### Task 9: Migracja na produkcji, test przeglądarkowy, wdrożenie

**Files:**
- Create: `e2e/rozmiar-do-doplat.spec.ts`

- [ ] **Step 1: Zaaplikuj migrację 86 na produkcji (przed mergem)**

Przez MCP Supabase `apply_migration` albo Management API (`POST /v1/projects/<ref>/database/query`, token w `.mcp.json` katalogu nadrzędnego; przy tej drodze dopisz ręcznie wpis w `schema_migrations`). Sprawdź: `select count(*) from fabric_sizes` zwraca 0, a `products` i `categories` mają nowe kolumny.

- [ ] **Step 2: Napisz spec Playwrighta, który niczego nie zapisuje**

Uruchamiany na `http://localhost:3000` z buildu, z sesją admina (`e2e/.auth/admin.json`, ciasteczka `sb-*` skopiowane na localhost, `--no-deps`). Asercje:
- `/admin/tkaniny`: widoczny nagłówek „Rozmiary mebli do dopłat za tkaninę" i formularz „Dodaj rozmiar"; spec **nie** klika „Zapisz" ani „Dodaj".
- edycja dowolnego produktu z opcją „Tkanina": widoczne pole „Rozmiar do dopłat za tkaninę" z opcją zaczynającą się od „Z kategorii:".
- karta tego produktu w sklepie: nagłówki grup tkanin pokazują te same kwoty co przed zmianą (bez rozmiarów nic się nie zmienia) — porównaj z kwotami grup odczytanymi z `/tkaniny`.

Run: `npm run build && npm start` (osobny terminal), potem `E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/rozmiar-do-doplat.spec.ts --no-deps`
Expected: PASS.

- [ ] **Step 3: Pełne testy**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit, push, PR**

```bash
git add e2e/rozmiar-do-doplat.spec.ts
git commit -m "test(e2e): rozmiar do dopłat za tkaninę (bez zapisu)"
```

PR do `main`; merge wdraża na produkcję.

- [ ] **Step 5: Próba na żywo z właścicielem (po wdrożeniu)**

Wymaga zapisu w żywej bazie, więc robi ją właściciel albo agent za jego zgodą:
1. Dodać rozmiar „TEST fotel" z dopłatami innymi niż globalne.
2. Ustawić go na jednym produkcie z tkaninami; sprawdzić kwoty grup na karcie produktu i cenę w koszyku po wybraniu tkaniny premium.
3. Zmienić dopłatę rozmiaru; sprawdzić, że produkt się przeliczył.
4. Usunąć rozmiar; sprawdzić, że produkt wrócił do kwot globalnych.

---

## STAN WYKONANIA

Stan na 2026-11-17. **WDROŻONE NA PRODUKCJĘ** — PR #204, merge `0713219`, deployment Vercel `dpl_7b2njWcrmY5rSz8Nghvhii5SUYb1` (READY na www.mollien.pl).

**Zrobione — Zadania 1–9 (z Zadania 9 tylko kroki 2–3) plus poprawki po recenzji całej gałęzi:**
- `6e0d08e` docs: projekt i plan
- `2c30589` Zadanie 1 — rozstrzyganie dopłat wg rozmiaru mebla
- `a0b5485` Zadanie 2 — tabela `fabric_sizes`, pola produktu i kategorii (migracja 86)
- `1d13e0a` Zadanie 3 — przeliczanie dopłat per produkt we wspólnym module
- `e6d19ac` Zadanie 4 — panel rozmiarów
- `fedd2bd` Zadanie 5 — rozmiar domyślny kategorii
- `b5384be` Zadanie 6 — rozmiar i własne dopłaty na produkcie
- `8033031` Zadanie 7 — sklep: dopłata grupy właściwa dla mebla
- `a0fef01` Zadanie 8 — plakietka „bez rozmiaru"
- `97fd12e` Zadanie 9 kroki 2–3 — e2e tylko do odczytu
- `a15c01c` poprawka: kwota grupy per mebel w modalu zestawu, napis na `/tkaniny`
- `005bfff` poprawka: panel bez cichych zmian cen (listy, puste pola, przeliczanie tylko przy zmianie, zgłaszanie błędów przeliczenia)
- `8076192` poprawka: e2e „bez rozmiarów" pomija się, gdy rozmiary są w użyciu

Weryfikacja po poprawkach: vitest 2166/2166, `tsc` czysto, lint 0 błędów (4 stare ostrzeżenia), build OK, Playwright `rozmiar-do-doplat` + `fabric-group-cards` 6/6 na lokalnym buildzie (bez zapisu).

**Zadanie 9 — zrobione w całości 2026-11-17:**
- Krok 1: migrację 86 zaaplikował właściciel w SQL Editorze (tokeny MCP i powłoki dawały 401); sprawdzone odczytem PostgREST: kolumny `products.fabric_size_id`, `products.fabric_surcharges`, `categories.default_fabric_size_id` i tabela `fabric_sizes` istnieją. Polityki RLS i wpisu w `schema_migrations` nie dało się sprawdzić bez tokenu.
- Krok 4: PR #204 zmergowany, wdrożenie READY; e2e tylko do odczytu na produkcji 6/6.
- Krok 5: próba na żywo przez panel na Fotelu Montes z rozmiarem „TEST fotel" (Premium 260, Premium High 410, Standard puste): karta pokazała +260 / +410 zł, zmiana na 270 przeliczyła produkt, usunięcie rozmiaru przywróciło 250 / 400. Po próbie: 0 rozmiarów, 0 produktów z ceną różną od wzoru.

**Fotel Vegas Buble — ręczne dopłaty przeniesione do „własnych dopłat":** przed próbą miał ręcznie obniżone ceny tkanin (Standard 0, Premium +100, Premium High +160 zamiast 250/400), których żadne pole w bazie nie chroniło — każde przeliczenie wszystkich produktów przywróciłoby 250/400. Ustawione jako własne dopłaty produktu (ceny bez zmian, sprawdzone). To przykład „fotelowych" kwot do listy rozmiarów.

Próbny przebieg planera na produkcji (R11) wykonany przed próbą: 352 produkty z tkaninami, jedyna realna różnica cen to Vegas Buble; 178 kolejnych różni się wyłącznie kolejnością kluczy JSON (Postgres sortuje klucze `jsonb`), więc przeliczenie zapisuje je bez zmiany cen.

**Rollback:** najpierw revert kodu; potem — jeśli rozmiary były już w użyciu — zapisać bez zmian dowolną grupę cenową w panelu Tkaniny (stary kod przeliczy wszystkie produkty z powrotem na kwoty globalne); dopiero na końcu cofnąć migrację.

**Rozstrzygnięcia kontrolera (R1–R14):**
- R1: `CategoryNode.defaultFabricSizeId` opcjonalne (`?: string | null`), stare fixtury się kompilują.
- R2: pomocniki testów (`GROUPS`, `FOTEL`, `CATS`, `fd`, `CODES`, `SIZES`) na poziomie modułu `fabric-sizes.test.ts`.
- R3: `planFabricSurchargeUpdates` zostaje w `fabric-surcharge-recompute.ts`; test mockuje supabase/next/products.
- R4: nieznane `fabric_size_id` (ani rozmiar, ani `__own`) → `{ fabric_size_id: null, fabric_surcharges: null }`.
- R5: z Zadania 9 tylko kroki 2–3 lokalnie; kroki 1, 4, 5 dla właściciela.
- R6: brak odpowiedzi właściciela na trzy decyzje autora potraktowano jako akceptację (do potwierdzenia).
- R7: stopki commitów podają model, który faktycznie pisał kod.
- R8: puste pole kwoty (rozmiar, własne dopłaty) = brak klucza = globalna dopłata grupy, nie 0; same puste własne dopłaty = brak własnych (`null`).
- R9: zapis podstawowych danych produktu / kategorii przelicza dopłaty tylko przy faktycznej zmianie kategorii, rozmiaru, własnych dopłat albo rozmiaru domyślnego.
- R10: kwotę nagłówka grupy na karcie produktu daje jeden kontekst `id produktu → kod grupy → zł` (produkt i składniki zestawów); mapa metadanych tkanin jest globalna. `withGroupSurcharges` i argument `getFabricMetaMap` z Zadań 1 i 7 usunięte.
- R10b: `/tkaniny` pisze „dopłata zależy od mebla" tylko gdy któryś rozmiar wycenia grupę inaczej niż globalnie; inaczej kwota (na stronie tkaniny + korekta) albo „bez dopłaty".
- R11: próbny przebieg planera na danych produkcyjnych (bez zapisu) — początkowo odłożony, wykonany przy wdrożeniu (wynik wyżej).
- R12: komunikaty o nieudanym przeliczeniu różne per miejsce (opis niżej).
- R13: zapis podstawowych danych produktu najpierw czyta wiersz produktu (potrzebne do R9); błąd odczytu przerywa zapis.
- R14: `/tkaniny` nie uwzględnia własnych dopłat produktów — otwarty punkt.

Komunikat po nieudanym przeliczeniu: przy tkaninie, grupie i rozmiarze „Spróbuj zapisać ponownie" (ponowny zapis przelicza wszystko). Przy produkcie i kategorii ponowny zapis bez zmian nie przelicza (R9), więc komunikat każe zapisać bez zmian dowolną grupę cenową. Przy nowej tkaninie — odświeżyć stronę i zapisać ją z listy (ponowne „Dodaj" dałoby duplikat nazwy).

**Otwarte drobiazgi (recenzja uznała, że mogą zostać):**
- testy: brak testu ścieżki `__own` → „Z kategorii" i `duplicateProduct`; cienkie testy zaokrągleń parsera; e2e ma ciche pominięcia, `count()` tuż po `goto` i zaszyty UUID produktu;
- panel: wpisane własne dopłaty giną po przełączeniu wyboru przed zapisem; update/delete nieistniejącego rozmiaru zgłasza sukces; surowe komunikaty błędów Supabase;
- kod: luźne rzutowanie w `fabric-surcharge-recompute.ts`; `...row` w loaderze rozmiarów; nieidempotentna polityka w migracji (jak w 57); grupy ładowane dwa razy (z cache); zdublowany znacznik plakietki; zastany zignorowany błąd zapytania produktów na liście;
- `/tkaniny` nie uwzględnia własnych dopłat produktów (R10b patrzy tylko na rozmiary).

**Otwarte po stronie właściciela i osoby zarządzającej:**
- lista rozmiarów i kwoty dopłat (panel Tkaniny → „Rozmiary mebli do dopłat za tkaninę"), potem rozmiar domyślny w kategoriach; Fotel Vegas Buble można przestawić z własnych dopłat na rozmiar fotela,
- potwierdzenie trzech decyzji autora z projektu (napis na `/tkaniny`, warunek plakietki, usuwanie rozmiaru bez blokady).
