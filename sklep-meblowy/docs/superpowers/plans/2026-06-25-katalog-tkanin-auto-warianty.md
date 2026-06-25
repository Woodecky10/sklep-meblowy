# Katalog tkanin + auto-warianty — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pozwolić adminowi zdefiniować katalog tkanin raz i dodawać wybrany podzbiór do produktu jednym działaniem — warianty generują się automatycznie (istniejąca logika), a nazwy tkanin tłumaczą się na /de.

**Architecture:** Nowa tabela `fabrics` (nazwa PL + opcjonalna DE) zarządzana na `/admin/tkaniny`. Czyste funkcje wariantów (`cartesianProduct`/`rebuildCombinations`) wyciągnięte z `VariantsEditor` do `variants.ts`; nowa czysta `applyFabricSelection` ustawia opcję „Tkanina" i przelicza kombinacje. Render DE tkanin przez cached helper serwerowy `getFabricDeMap()` udostępniony klientowi kontekstem seedowanym w root layout (wzorzec `RateProvider`/`useEurRate` z prac nad EUR).

**Tech Stack:** Next.js 16.2.4 (App Router), React 19.2.4, TypeScript 5, Supabase (`@supabase/supabase-js`), vitest 4.

## Global Constraints

- Wszystkie polecenia `npm`/`npx` uruchamiać z katalogu `sklep-meblowy/` (root aplikacji Next). Testy: `npx vitest run <ścieżka>`. Pełny zestaw: `npm test`.
- Bramki przed każdym commitem domykającym task z kodem: `npx tsc --noEmit` (0 błędów), `npm run lint` (0 błędów), odpowiednie testy zielone.
- UI po polsku; tłumaczenia DE przez kolumny `_de` / mapy w `de-content-maps.ts`.
- Migracje idempotentne (`if not exists`); człowiek odpala je ręcznie w Supabase PO wdrożeniu kodu. Następny numer migracji = **37** (DB jest na 36).
- Stała nazwa opcji wariantu reprezentującej tkaninę: `"Tkanina"` (eksportowana jako `FABRIC_OPTION_NAME`).
- Czyste funkcje (testowalne) NIE mogą importować modułów server-only (`supabase/server` ciągnie `next/headers`). Logika pure żyje w `variants.ts`; IO/cache w `fabrics.ts`.
- **OPS:** jedyna instancja Supabase = produkcyjna; `next dev` czyta i pisze do prod. Nie tworzyć testowych tkanin „na żywo" bez świadomości, że pojawią się na produkcji.
- Praca na branchu `feat/katalog-tkanin-auto-warianty` (już utworzony, zawiera spec).

---

### Task 1: Migracja `37_fabrics.sql` + typ `Fabric`

**Files:**
- Create: `supabase/migrations/37_fabrics.sql`
- Modify: `app/_lib/types.ts` (dodać typ `Fabric` po typie `Collection`, ok. linia 144)

**Interfaces:**
- Produces: tabela `public.fabrics(id, name, name_de, sort_order, created_at)`; typ `Fabric`.

- [ ] **Step 1: Utwórz migrację**

`supabase/migrations/37_fabrics.sql`:
```sql
-- Migracja 37: katalog tkanin (reużywalny zbiór nazw tkanin do wariantów).
-- name     = nazwa PL; jednocześnie wartość wariantu w combinations.values["Tkanina"].
-- name_de  = nazwa DE; null → fallback do name na /de.
-- sort_order = kolejność na liście wyboru w adminie.
create table if not exists public.fabrics (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  name_de     text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists fabrics_sort_idx on public.fabrics (sort_order, name);

-- RLS: czytane/zapisywane wyłącznie server-side przez createAdminClient
-- (service role omija RLS — wzorzec jak collections/price_history). Brak polityki
-- dla anon → żadnego publicznego dostępu poza service role.
alter table public.fabrics enable row level security;
create policy "fabrics: admin all"
  on public.fabrics for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
```

- [ ] **Step 2: Dodaj typ `Fabric` w `types.ts`**

Po definicji `export type Collection = {...};` (kończy się ok. linii 144) dodaj:
```ts
// Katalog tkanin (migracja 37) — reużywalny zbiór nazw używanych jako wartości
// opcji wariantu „Tkanina". name_de null → na /de fallback do name.
export type Fabric = {
  id: string;
  name: string;
  name_de: string | null;
  sort_order: number;
  created_at: string;
};
```

- [ ] **Step 3: Typecheck**

Run (z `sklep-meblowy/`): `npx tsc --noEmit`
Expected: 0 błędów.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/37_fabrics.sql app/_lib/types.ts
git commit -m "feat(fabrics): migracja 37 katalog tkanin + typ Fabric"
```

---

### Task 2: Wyciągnięcie `cartesianProduct`/`rebuildCombinations` do `variants.ts`

Czyste funkcje generowania kombinacji są dziś prywatne w `VariantsEditor.tsx`. Przenosimy je do `variants.ts` (pure, już tam żyje `variantKey`), żeby współdzielić z `applyFabricSelection` i testami.

**Files:**
- Modify: `app/_lib/variants.ts` (dodać na końcu)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx:24-54` (usunąć lokalne definicje, importować z `variants.ts`)
- Test: `app/_lib/__tests__/variant-combinations.test.ts`

**Interfaces:**
- Consumes: `ProductOption`, `ProductVariant` z `types.ts`; `variantKey` z `variants.ts`.
- Produces:
  - `cartesianProduct(options: ProductOption[]): Array<Record<string, string>>`
  - `rebuildCombinations(options: ProductOption[], oldCombinations: ProductVariant[]): ProductVariant[]`

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/variant-combinations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cartesianProduct, rebuildCombinations } from "../variants";
import type { ProductOption, ProductVariant } from "../types";

describe("cartesianProduct", () => {
  it("zwraca pustą tablicę gdy brak poprawnych opcji", () => {
    expect(cartesianProduct([])).toEqual([]);
    expect(cartesianProduct([{ name: "", values: [] }])).toEqual([]);
  });

  it("generuje iloczyn dwóch opcji", () => {
    const options: ProductOption[] = [
      { name: "Tkanina", values: ["Sawana 21", "Velvet Granat"] },
      { name: "Strona", values: ["Lewa", "Prawa"] },
    ];
    const result = cartesianProduct(options);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual({ Tkanina: "Sawana 21", Strona: "Lewa" });
    expect(result).toContainEqual({ Tkanina: "Velvet Granat", Strona: "Prawa" });
  });
});

describe("rebuildCombinations", () => {
  it("zachowuje stock/zdjęcia kombinacji której klucz przetrwał, nowe dostają stock 0", () => {
    const options: ProductOption[] = [{ name: "Tkanina", values: ["A", "B"] }];
    const old: ProductVariant[] = [
      { values: { Tkanina: "A" }, stock: 7, price_modifier: 0, images: ["img-a.jpg"] },
    ];
    const result = rebuildCombinations(options, old);
    expect(result).toHaveLength(2);
    const a = result.find((c) => c.values.Tkanina === "A")!;
    const b = result.find((c) => c.values.Tkanina === "B")!;
    expect(a.stock).toBe(7);
    expect(a.images).toEqual(["img-a.jpg"]);
    expect(b.stock).toBe(0);
    expect(b.price_modifier).toBe(0);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAIL**

Run: `npx vitest run app/_lib/__tests__/variant-combinations.test.ts`
Expected: FAIL — `cartesianProduct`/`rebuildCombinations` nie są eksportowane z `variants.ts`.

- [ ] **Step 3: Dodaj funkcje do `variants.ts`**

Na końcu `app/_lib/variants.ts` dodaj (kopia logiki z VariantsEditor, bez zmian zachowania):
```ts
// ── Generowanie kombinacji wariantów (współdzielone z VariantsEditor + applyFabricSelection) ──

// Wszystkie kombinacje opcji (iloczyn kartezjański). Pomija opcje bez nazwy/wartości.
export function cartesianProduct(
  options: ProductOption[]
): Array<Record<string, string>> {
  const valid = options.filter((o) => o.name.trim() && o.values.length > 0);
  if (valid.length === 0) return [];
  return valid.reduce<Array<Record<string, string>>>(
    (acc, opt) =>
      acc.flatMap((prev) => opt.values.map((v) => ({ ...prev, [opt.name]: v }))),
    [{}]
  );
}

// Po zmianie opcji przelicz kombinacje, zachowując stock/price/images/sale dla
// kombinacji których klucz dalej istnieje. Nowe → stock 0, price_modifier 0.
export function rebuildCombinations(
  options: ProductOption[],
  oldCombinations: ProductVariant[]
): ProductVariant[] {
  const oldMap = new Map<string, ProductVariant>(
    oldCombinations.map((c) => [variantKey(c.values), c])
  );
  return cartesianProduct(options).map((values) => {
    const prev = oldMap.get(variantKey(values));
    if (prev) return { ...prev, values };
    return { values, stock: 0, price_modifier: 0 };
  });
}
```
`ProductOption` jest już zaimportowany? Sprawdź import na górze `variants.ts` — jest `import type { Product, ProductVariant } from "./types";`. Dodaj `ProductOption`:
```ts
import type { Product, ProductOption, ProductVariant } from "./types";
```

- [ ] **Step 4: Uruchom test — ma PASS**

Run: `npx vitest run app/_lib/__tests__/variant-combinations.test.ts`
Expected: PASS (4 testy).

- [ ] **Step 5: Usuń lokalne definicje z `VariantsEditor.tsx` i importuj z `variants.ts`**

W `app/admin/produkty/[id]/VariantsEditor.tsx`:
- Usuń bloki `cartesianProduct` (linie ~24-37) i `rebuildCombinations` (~39-54) wraz z komentarzem sekcji „Pomocnicze: cartesian product + rebuild".
- Zmień import (linia 18) z:
```ts
import { formatVariantLabel, variantKey } from "@/app/_lib/variants";
```
na:
```ts
import {
  formatVariantLabel,
  variantKey,
  rebuildCombinations,
} from "@/app/_lib/variants";
```
(`cartesianProduct` nie jest używany bezpośrednio w edytorze — tylko przez `rebuildCombinations`.)

- [ ] **Step 6: Typecheck + lint + pełne testy**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 0 błędów tsc/lint; wszystkie testy zielone (w tym nowy plik).

- [ ] **Step 7: Commit**

```bash
git add app/_lib/variants.ts app/admin/produkty/[id]/VariantsEditor.tsx app/_lib/__tests__/variant-combinations.test.ts
git commit -m "refactor(variants): wyciagnij cartesianProduct/rebuildCombinations do variants.ts"
```

---

### Task 3: `FABRIC_OPTION_NAME` + `applyFabricSelection` + `buildFabricDeMap`

**Files:**
- Modify: `app/_lib/variants.ts` (dodać na końcu)
- Test: `app/_lib/__tests__/fabrics.test.ts`

**Interfaces:**
- Consumes: `rebuildCombinations`, `ProductOption`, `ProductVariant` (Task 2).
- Produces:
  - `FABRIC_OPTION_NAME: "Tkanina"`
  - `applyFabricSelection(options: ProductOption[], combinations: ProductVariant[], selectedFabricNames: string[]): { options: ProductOption[]; combinations: ProductVariant[] }`
  - `buildFabricDeMap(fabrics: { name: string; name_de: string | null }[]): Record<string, string>`

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/fabrics.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  FABRIC_OPTION_NAME,
  applyFabricSelection,
  buildFabricDeMap,
} from "../variants";
import type { ProductOption, ProductVariant } from "../types";

describe("applyFabricSelection", () => {
  it("tworzy opcję Tkanina gdy nie istnieje i generuje warianty 1:1", () => {
    const { options, combinations } = applyFabricSelection([], [], ["A", "B", "C"]);
    expect(options).toEqual([{ name: FABRIC_OPTION_NAME, values: ["A", "B", "C"] }]);
    expect(combinations).toHaveLength(3);
    expect(combinations.every((c) => c.stock === 0)).toBe(true);
  });

  it("aktualizuje wartości istniejącej opcji Tkanina zachowując stock przetrwałych", () => {
    const options: ProductOption[] = [{ name: FABRIC_OPTION_NAME, values: ["A"] }];
    const combos: ProductVariant[] = [
      { values: { [FABRIC_OPTION_NAME]: "A" }, stock: 5, price_modifier: 0 },
    ];
    const res = applyFabricSelection(options, combos, ["A", "B"]);
    expect(res.options[0].values).toEqual(["A", "B"]);
    const a = res.combinations.find((c) => c.values[FABRIC_OPTION_NAME] === "A")!;
    expect(a.stock).toBe(5);
    expect(res.combinations).toHaveLength(2);
  });

  it("współistnieje z inną opcją — iloczyn tkanin × strona", () => {
    const options: ProductOption[] = [{ name: "Strona", values: ["Lewa", "Prawa"] }];
    const res = applyFabricSelection(options, [], ["A", "B"]);
    expect(res.options.map((o) => o.name).sort()).toEqual(["Strona", "Tkanina"]);
    expect(res.combinations).toHaveLength(4);
  });

  it("pusty wybór usuwa opcję Tkanina (zostają inne opcje)", () => {
    const options: ProductOption[] = [
      { name: FABRIC_OPTION_NAME, values: ["A"] },
      { name: "Strona", values: ["Lewa"] },
    ];
    const combos: ProductVariant[] = [
      { values: { [FABRIC_OPTION_NAME]: "A", Strona: "Lewa" }, stock: 0 },
    ];
    const res = applyFabricSelection(options, combos, []);
    expect(res.options).toEqual([{ name: "Strona", values: ["Lewa"] }]);
    expect(res.combinations).toHaveLength(1);
  });
});

describe("buildFabricDeMap", () => {
  it("mapuje tylko tkaniny z niepustą name_de", () => {
    const map = buildFabricDeMap([
      { name: "Sawana 21", name_de: "Savanne 21" },
      { name: "Velvet Granat", name_de: null },
      { name: "Monolith 09", name_de: "  " },
    ]);
    expect(map).toEqual({ "Sawana 21": "Savanne 21" });
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAIL**

Run: `npx vitest run app/_lib/__tests__/fabrics.test.ts`
Expected: FAIL — eksporty nie istnieją.

- [ ] **Step 3: Dodaj implementację do `variants.ts`**

Na końcu `app/_lib/variants.ts`:
```ts
// ── Tkaniny (katalog) ──

// Stała nazwa opcji wariantu reprezentującej tkaninę. Nazwa DE tej opcji
// ("Tkanina"/"TKANINA" → "Stoff"/"STOFF") jest już w VARIANT_OPTION_DE.
export const FABRIC_OPTION_NAME = "Tkanina";

// Ustawia (lub tworzy/usuwa) opcję „Tkanina" z podanym zbiorem nazw i przelicza
// kombinacje przez rebuildCombinations (ta sama logika co edytor). Pozostałe
// opcje bez zmian. Pusty wybór → usuwa opcję „Tkanina".
export function applyFabricSelection(
  options: ProductOption[],
  combinations: ProductVariant[],
  selectedFabricNames: string[]
): { options: ProductOption[]; combinations: ProductVariant[] } {
  let nextOptions: ProductOption[];
  if (selectedFabricNames.length === 0) {
    nextOptions = options.filter((o) => o.name !== FABRIC_OPTION_NAME);
  } else if (options.some((o) => o.name === FABRIC_OPTION_NAME)) {
    nextOptions = options.map((o) =>
      o.name === FABRIC_OPTION_NAME ? { ...o, values: selectedFabricNames } : o
    );
  } else {
    nextOptions = [...options, { name: FABRIC_OPTION_NAME, values: selectedFabricNames }];
  }
  return { options: nextOptions, combinations: rebuildCombinations(nextOptions, combinations) };
}

// Buduje mapę PL→DE nazw tkanin (pomija puste name_de). Czysta — testowalna bez
// DB; serwerowy getFabricDeMap (fabrics.ts) ją opakowuje danymi z tabeli fabrics.
export function buildFabricDeMap(
  fabrics: { name: string; name_de: string | null }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fabrics) {
    const de = f.name_de?.trim();
    if (de) map[f.name] = de;
  }
  return map;
}
```

- [ ] **Step 4: Uruchom test — ma PASS**

Run: `npx vitest run app/_lib/__tests__/fabrics.test.ts`
Expected: PASS (5 testów).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/_lib/variants.ts app/_lib/__tests__/fabrics.test.ts
git commit -m "feat(fabrics): applyFabricSelection + buildFabricDeMap (czyste)"
```

---

### Task 4: Warstwa danych `fabrics.ts` (server)

**Files:**
- Create: `app/_lib/fabrics.ts`

**Interfaces:**
- Consumes: `createAdminClient` (`supabase/server`), `buildFabricDeMap` (Task 3), `Fabric` (Task 1).
- Produces:
  - `getAllFabrics(): Promise<Fabric[]>` (cached)
  - `getFabricDeMap(): Promise<Record<string, string>>`
  - `invalidateFabricsCache(): void`
  - `FABRICS_CACHE_TAG: "fabrics"`

- [ ] **Step 1: Utwórz `app/_lib/fabrics.ts`**

(wzorzec dokładnie jak `collections.ts`)
```ts
// Warstwa danych tabeli fabrics — katalog tkanin (admin: /admin/tkaniny).
// Czyste helpery (buildFabricDeMap, applyFabricSelection) są w variants.ts.
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { buildFabricDeMap } from "./variants";
import type { Fabric } from "./types";

export const FABRICS_CACHE_TAG = "fabrics";

const fetchAllFabrics = unstable_cache(
  async (): Promise<Fabric[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("fabrics")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    return (data ?? []) as Fabric[];
  },
  ["fabrics-all"],
  { tags: [FABRICS_CACHE_TAG], revalidate: 300 }
);

// Lista wszystkich tkanin (cache per request + unstable_cache z tagiem).
export const getAllFabrics = cache(fetchAllFabrics);

// Mapa PL→DE do renderu wartości wariantu „Tkanina" na /de.
export async function getFabricDeMap(): Promise<Record<string, string>> {
  return buildFabricDeMap(await getAllFabrics());
}

export function invalidateFabricsCache(): void {
  revalidateTag(FABRICS_CACHE_TAG, "max");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 błędów.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/fabrics.ts
git commit -m "feat(fabrics): warstwa danych getAllFabrics/getFabricDeMap (cache)"
```

---

### Task 5: Server actions katalogu — `app/admin/tkaniny/actions.ts`

**Files:**
- Create: `app/admin/tkaniny/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `createAdminClient`, `invalidateFabricsCache` (Task 4).
- Produces (każda zwraca `ActionResult = {ok:true;message?;data?} | {ok:false;error}`):
  - `createFabric(formData: FormData): Promise<ActionResult>`
  - `updateFabric(formData: FormData): Promise<ActionResult>`
  - `deleteFabric(formData: FormData): Promise<ActionResult>`

- [ ] **Step 1: Utwórz `app/admin/tkaniny/actions.ts`**

(wzorzec jak `app/admin/kolekcje/actions.ts`)
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateFabricsCache } from "@/app/_lib/fabrics";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseSort(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function createFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));

  const supabase = await createAdminClient();
  const { error, data } = await supabase
    .from("fabrics")
    .insert({ name, name_de: nameDe, sort_order: sortOrder } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: `Tkanina "${name}" dodana`, data };
}

export async function updateFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabrics")
    .update({ name, name_de: nameDe, sort_order: sortOrder } as never)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Tkanina zapisana" };
}

// Usunięcie z katalogu NIE rusza produktów, które już mają tę tkaninę w wariancie
// (wartość zostaje zapisana w products.variants). Znika tylko z listy do wyboru
// i z mapy DE (jej wartość zacznie renderować się jako PL).
export async function deleteFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("fabrics").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Tkanina usunięta" };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 błędów.

- [ ] **Step 3: Commit**

```bash
git add app/admin/tkaniny/actions.ts
git commit -m "feat(fabrics): server actions katalogu (create/update/delete)"
```

---

### Task 6: Strona `/admin/tkaniny` + link w nawigacji

**Files:**
- Create: `app/admin/tkaniny/page.tsx`
- Create: `app/admin/tkaniny/FabricsEditor.tsx`
- Modify: `app/admin/layout.tsx:11-22` (dodać pozycję nav + ikona)

**Interfaces:**
- Consumes: `getAllFabrics` (Task 4), `createFabric`/`updateFabric`/`deleteFabric` (Task 5); współdzielone `Card, EmptyState, Field, ToastView, inputCls` z `@/app/admin/_shared`.

- [ ] **Step 1: Utwórz `app/admin/tkaniny/page.tsx`**

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics } from "@/app/_lib/fabrics";
import FabricsEditor from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const fabrics = await getAllFabrics();
  return <FabricsEditor initialFabrics={fabrics} />;
}
```

- [ ] **Step 2: Utwórz `app/admin/tkaniny/FabricsEditor.tsx`**

(uproszczony wzorzec `CollectionsEditor` — bez przypisywania produktów)
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls } from "@/app/admin/_shared";
import { createFabric, updateFabric, deleteFabric, type ActionResult } from "./actions";
import type { Fabric } from "@/app/_lib/types";

type Toast = { type: "success" | "error"; message: string } | null;

export default function FabricsEditor({ initialFabrics }: { initialFabrics: Fabric[] }) {
  const [fabrics, setFabrics] = useState<Fabric[]>(initialFabrics);
  const [prevInitial, setPrevInitial] = useState(initialFabrics);
  if (initialFabrics !== prevInitial) {
    setPrevInitial(initialFabrics);
    setFabrics(initialFabrics);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const router = useRouter();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(res: ActionResult, onSuccess?: () => void) {
    if (res.ok) {
      showToast({ type: "success", message: res.message ?? "Zapisano" });
      onSuccess?.();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Tkaniny</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Katalog tkanin używanych jako warianty produktów. Dodaj tkaniny raz, a
            potem przy produkcie wybierz z listy które mają być dostępne — warianty
            wygenerują się automatycznie. Nazwa DE jest opcjonalna (puste → na /de
            pokaże się nazwa PL).
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
          disabled={creating}
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          + Nowa tkanina
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <FabricForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (fd) => {
              const res = await createFabric(fd);
              handleResult(res, () => {
                setCreating(false);
                router.refresh();
              });
            }}
          />
        </Card>
      )}

      {fabrics.length === 0 && !creating ? (
        <EmptyState message="Brak tkanin. Dodaj pierwszą żeby zacząć." />
      ) : (
        <div className="flex flex-col gap-3">
          {fabrics.map((f) => (
            <div
              key={f.id}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold text-[var(--fg)]">
                    {f.name}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    DE: {f.name_de ?? "—"} · kolejność: {f.sort_order}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingId(editingId === f.id ? null : f.id)}
                    className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    {editingId === f.id ? "Zwiń" : "Edytuj"}
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Usunąć tkaninę "${f.name}"? Produkty które już ją mają zachowają wartość.`)) return;
                      const fd = new FormData();
                      fd.set("id", f.id);
                      deleteFabric(fd).then((res) =>
                        handleResult(res, () => setFabrics((prev) => prev.filter((x) => x.id !== f.id)))
                      );
                    }}
                    className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    Usuń
                  </button>
                </div>
              </div>
              {editingId === f.id && (
                <div className="border-t border-[var(--border)] p-5 bg-[var(--bg)]">
                  <FabricForm
                    mode="update"
                    initial={f}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (fd) => {
                      const res = await updateFabric(fd);
                      handleResult(res, () => {
                        setEditingId(null);
                        router.refresh();
                      });
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FabricForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Fabric;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="flex flex-col gap-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Nazwa (PL)" required className="md:col-span-2">
          <input
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            minLength={1}
            maxLength={200}
            placeholder="np. Sawana 21"
            className={inputCls}
          />
        </Field>
        <Field label="Kolejność" hint="Niższa = wyżej na liście.">
          <input
            name="sort_order"
            type="number"
            step="1"
            defaultValue={initial?.sort_order ?? 0}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Nazwa (DE)" hint="Puste → na /de pokaże się nazwa PL.">
        <input
          name="name_de"
          defaultValue={initial?.name_de ?? ""}
          maxLength={200}
          placeholder="z. B. Savanne 21"
          className={inputCls}
        />
      </Field>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Dodaj tkaninę" : "Zapisz zmiany"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Dodaj link w nawigacji admina**

W `app/admin/layout.tsx` w tablicy `NAV_ITEMS` (po pozycji „Kolekcje", linia ~19) dodaj:
```ts
  { href: "/admin/tkaniny", label: "Tkaniny", icon: FabricsIcon },
```
oraz dodaj komponent ikony (obok innych funkcji `*Icon` na końcu pliku):
```tsx
function FabricsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M3 6c3 2 6 2 9 0s6-2 9 0" />
      <path d="M3 12c3 2 6 2 9 0s6-2 9 0" />
      <path d="M3 18c3 2 6 2 9 0s6-2 9 0" />
    </svg>
  );
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 0 błędów; build przechodzi (trasa `/admin/tkaniny` w wyniku).

- [ ] **Step 5: Manualna weryfikacja (opcjonalna, świadom OPS)**

Uruchom `npm run dev`, wejdź na `/admin/tkaniny`, dodaj/edytuj/usuń testową tkaninę. **Pamiętaj: to prod DB** — usuń testowe wpisy po sprawdzeniu.

- [ ] **Step 6: Commit**

```bash
git add app/admin/tkaniny/page.tsx app/admin/tkaniny/FabricsEditor.tsx app/admin/layout.tsx
git commit -m "feat(fabrics): strona /admin/tkaniny (CRUD) + link w nawigacji"
```

---

### Task 7: Wpięcie katalogu w edytor produktu (przycisk + modal)

**Files:**
- Modify: `app/admin/produkty/[id]/page.tsx` (dodać fetch `getAllFabrics`, przekazać do `ProductEditor`)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (prop `fabrics`, przekazać do `VariantsEditor`)
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (prop `fabrics`, przycisk + modal, `applyFabricSelection`)

**Interfaces:**
- Consumes: `getAllFabrics` (Task 4), `applyFabricSelection`/`FABRIC_OPTION_NAME` (Task 3), `Fabric` (Task 1).

- [ ] **Step 1: `page.tsx` — pobierz tkaniny i przekaż**

W `app/admin/produkty/[id]/page.tsx`:
- Dodaj import:
```ts
import { getAllFabrics } from "@/app/_lib/fabrics";
```
- W `Promise.all` dodaj `getAllFabrics()` i odbierz wynik:
```ts
  const [product, categories, de, sizeGroupKeys, fabrics] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getSizeGroupKeys(),
    getAllFabrics(),
  ]);
```
- Przekaż do edytora:
```tsx
    <ProductEditor
      product={product}
      categories={categories}
      de={de}
      sizeGroupKeys={sizeGroupKeys}
      fabrics={fabrics}
    />
```

- [ ] **Step 2: `ProductEditor.tsx` — przyjmij i przekaż prop**

- Dodaj import typu:
```ts
import type { Product, ActionResult, Fabric } from "@/app/_lib/types";
```
(dopisz `Fabric` do istniejącego importu z `@/app/_lib/types`.)
- W sygnaturze props dodaj `fabrics: Fabric[]`:
```tsx
export default function ProductEditor({
  product,
  categories,
  de,
  sizeGroupKeys,
  fabrics,
}: {
  product: Product;
  categories: CategoryDef[];
  de: ProductDeFields;
  sizeGroupKeys: string[];
  fabrics: Fabric[];
}) {
```
- Przekaż do `VariantsEditor` (linia ~440):
```tsx
      <VariantsEditor productId={product.id} initial={product.variants} fabrics={fabrics} onToast={showToast} />
```

- [ ] **Step 3: `VariantsEditor.tsx` — prop, importy, modal**

- Rozszerz import z `variants.ts`:
```ts
import {
  formatVariantLabel,
  variantKey,
  rebuildCombinations,
  applyFabricSelection,
  FABRIC_OPTION_NAME,
} from "@/app/_lib/variants";
```
- Dodaj import typu `Fabric`:
```ts
import type {
  ProductOption,
  ProductVariant,
  ProductVariants,
  Fabric,
} from "@/app/_lib/types";
```
- Dodaj `fabrics` do props:
```tsx
export default function VariantsEditor({
  productId,
  initial,
  fabrics,
  onToast,
}: {
  productId: string;
  initial: ProductVariants | null;
  fabrics: Fabric[];
  onToast: (t: Toast) => void;
}) {
```
- Dodaj stan modala (obok innych `useState`):
```tsx
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);
```
- Dodaj handler stosujący wybór (po `addValue`/`removeValue`):
```tsx
  // Zastosuj zaznaczone tkaniny z katalogu → ustaw opcję „Tkanina" + przelicz kombinacje.
  function applyFabrics(selectedNames: string[]) {
    const base = variants ?? { options: [], combinations: [] };
    const next = applyFabricSelection(base.options, base.combinations, selectedNames);
    setVariants(next.options.length === 0 ? null : { ...base, ...next });
    setFabricPickerOpen(false);
  }
```
- W widoku gdy `!variants` (sekcja „Produkt nie ma wariantów", ok. linia 282-301) dodaj DRUGI przycisk obok „+ Dodaj warianty":
```tsx
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enableVariants}
            className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj warianty
          </button>
          <button
            type="button"
            onClick={() => {
              setVariants({ options: [], combinations: [] });
              setFabricPickerOpen(true);
            }}
            className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
          >
            + Dodaj tkaniny z katalogu
          </button>
        </div>
```
(zastępuje pojedynczy przycisk „+ Dodaj warianty"; zachowaj otaczającą `<section>`.)
- W widoku głównym, w sekcji „Opcje" (po przycisku „+ Dodaj opcję", ok. linia 354) dodaj przycisk otwierający modal:
```tsx
        <button
          type="button"
          onClick={() => setFabricPickerOpen(true)}
          className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          Wybierz z katalogu tkanin
        </button>
```
- Dodaj render modala na końcu głównego `<section>` (przed zamykającym `</section>`):
```tsx
      {fabricPickerOpen && (
        <FabricPicker
          fabrics={fabrics}
          initiallySelected={
            variants?.options.find((o) => o.name === FABRIC_OPTION_NAME)?.values ?? []
          }
          onCancel={() => setFabricPickerOpen(false)}
          onApply={applyFabrics}
        />
      )}
```
- Dodaj komponent `FabricPicker` na końcu pliku (po `CombinationRow`):
```tsx
function FabricPicker({
  fabrics,
  initiallySelected,
  onApply,
  onCancel,
}: {
  fabrics: Fabric[];
  initiallySelected: string[];
  onApply: (selectedNames: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initiallySelected);
  const [search, setSearch] = useState("");

  // Nazwy obecne w produkcie, ale spoza katalogu — pokaż jako zaznaczone „spoza
  // katalogu", żeby ich nie zgubić przy zapisie.
  const catalogNames = new Set(fabrics.map((f) => f.name));
  const orphanNames = initiallySelected.filter((n) => !catalogNames.has(n));

  function toggle(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  const filtered = search.trim()
    ? fabrics.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : fabrics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz tkaniny ({selected.length})
          </h3>
          <input
            type="text"
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        {fabrics.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic py-6 text-center">
            Brak tkanin w katalogu. Dodaj je w „Tkaniny" (menu admina).
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {orphanNames.map((n) => (
              <li key={`orphan-${n}`}>
                <label className="flex items-center gap-3 p-2 cursor-pointer bg-amber-50 dark:bg-amber-950/30">
                  <input
                    type="checkbox"
                    checked={selected.includes(n)}
                    onChange={() => toggle(n)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <span className="text-sm text-[var(--fg)]">{n}</span>
                  <span className="text-[10px] font-sans uppercase tracking-widest text-amber-600 dark:text-amber-400 ml-auto">
                    spoza katalogu
                  </span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
            )}
            {filtered.map((f) => {
              const active = selected.includes(f.name);
              return (
                <li key={f.id}>
                  <label className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${active ? "bg-[var(--color-gold)]/10" : "hover:bg-[var(--bg)]"}`}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggle(f.name)}
                      className="h-4 w-4 accent-[var(--color-gold)]"
                    />
                    <span className="text-sm text-[var(--fg)]">{f.name}</span>
                    {f.name_de && (
                      <span className="text-[10px] text-[var(--muted)] ml-auto">DE: {f.name_de}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => onApply(selected)}
            className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            Zastosuj ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
```
Uwaga: po `applyFabrics` zmiany są w stanie edytora (`dirty=true`) — admin zapisuje istniejącym przyciskiem „Zapisz warianty" (bez zmian w `updateProductVariants`).

- [ ] **Step 4: Typecheck + lint + build + pełne testy**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów; testy zielone; build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/[id]/page.tsx app/admin/produkty/[id]/ProductEditor.tsx app/admin/produkty/[id]/VariantsEditor.tsx
git commit -m "feat(fabrics): wybor tkanin z katalogu w edytorze wariantow"
```

---

### Task 8: Render nazw DE na storefront

Mapa PL→DE tkanin z katalogu, dostępna w renderze wartości wariantu „Tkanina" — w `VariantSelector` (klient, kontekst) i `formatVariantLabel` (param mapy; serwer przekazuje, klient z kontekstu).

**Files:**
- Create: `app/_lib/fabric-context.tsx`
- Modify: `app/layout.tsx` (seed `FabricLabelProvider` mapą z `getFabricDeMap()`)
- Modify: `app/_lib/variants.ts` (`formatVariantLabel` — opcjonalny `fabricMap`)
- Modify: `app/_components/ui/VariantSelector.tsx` (`getValueLabel` dla „Tkanina" + `useFabricLabels`)
- Modify: `app/api/checkout/route.ts:213` (przekaż mapę gdy DE)
- Modify: `app/koszyk/page.tsx:173` i `app/checkout/CheckoutForm.tsx:353` (przekaż mapę z kontekstu)
- Test: dopisać do `app/_lib/__tests__/fabrics.test.ts`

**Interfaces:**
- Consumes: `getFabricDeMap` (Task 4), `buildFabricDeMap`/`FABRIC_OPTION_NAME` (Task 3).
- Produces:
  - `FabricLabelProvider({ map, children })`, `useFabricLabels(): Record<string,string>`
  - `formatVariantLabel(values, locale?, fabricMap?)` — nowy 3. param.

- [ ] **Step 1: Dopisz failing test dla `formatVariantLabel` z mapą**

Dodaj do `app/_lib/__tests__/fabrics.test.ts`:
```ts
import { formatVariantLabel } from "../variants";

describe("formatVariantLabel z mapą tkanin", () => {
  it("na DE tłumaczy wartość opcji Tkanina przez fabricMap", () => {
    const label = formatVariantLabel(
      { Tkanina: "Sawana 21", Strona: "Lewa" },
      "de",
      { "Sawana 21": "Savanne 21" }
    );
    // opcja Tkanina→Stoff (VARIANT_OPTION_DE), wartość z fabricMap; Strona/Lewa ze statycznej mapy
    expect(label).toContain("Stoff: Savanne 21");
    expect(label).toContain("Seite: Links");
  });

  it("bez mapy / na PL wartość tkaniny bez zmian", () => {
    expect(formatVariantLabel({ Tkanina: "Sawana 21" }, "pl")).toBe("Tkanina: Sawana 21");
    expect(formatVariantLabel({ Tkanina: "Sawana 21" }, "de")).toContain("Sawana 21");
  });
});
```

- [ ] **Step 2: Uruchom — ma FAIL**

Run: `npx vitest run app/_lib/__tests__/fabrics.test.ts`
Expected: FAIL — `formatVariantLabel` nie przyjmuje 3. argumentu / nie tłumaczy przez mapę.

- [ ] **Step 3: Rozszerz `formatVariantLabel` w `variants.ts`**

Zamień obecną definicję (linie ~92-104) na:
```ts
// Krótka etykieta wybranych wartości — np. "Strona: Lewa, Tkanina: Sawana 21".
// Na DE: nazwy opcji + (kolory/strony) ze statycznej mapy; wartość opcji „Tkanina"
// z fabricMap (katalog) gdy podana, inaczej fallback do statycznej mapy / PL.
export function formatVariantLabel(
  values: Record<string, string>,
  locale: Locale = DEFAULT_LOCALE,
  fabricMap: Record<string, string> = {}
): string {
  const de = locale === "de";
  return Object.entries(values)
    .map(([k, v]) => {
      const key = de ? mapDe(VARIANT_OPTION_DE, k) ?? k : k;
      let val = v;
      if (de) {
        if (k === FABRIC_OPTION_NAME && fabricMap[v]) val = fabricMap[v];
        else val = mapDe(VARIANT_VALUE_DE, v) ?? v;
      }
      return `${key}: ${val}`;
    })
    .join(", ");
}
```

- [ ] **Step 4: Uruchom — ma PASS**

Run: `npx vitest run app/_lib/__tests__/fabrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Utwórz kontekst `app/_lib/fabric-context.tsx`**

(wzorzec `rate-context.tsx`)
```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";

// Mapa PL→DE nazw tkanin, seedowana z serwera w root layout (getFabricDeMap).
// Komponenty klienckie renderujące wartość wariantu „Tkanina" biorą ją stąd.
const FabricLabelContext = createContext<Record<string, string>>({});

export function FabricLabelProvider({
  map,
  children,
}: {
  map: Record<string, string>;
  children: ReactNode;
}) {
  return <FabricLabelContext.Provider value={map}>{children}</FabricLabelContext.Provider>;
}

export function useFabricLabels(): Record<string, string> {
  return useContext(FabricLabelContext);
}
```

- [ ] **Step 6: Seed w `app/layout.tsx`**

- Dodaj importy:
```ts
import { getFabricDeMap } from "@/app/_lib/fabrics";
import { FabricLabelProvider } from "@/app/_lib/fabric-context";
```
- W `RootLayout` dodaj fetch obok `eurRate`:
```ts
  const eurRate = await getEurRate();
  const fabricMap = await getFabricDeMap();
```
- Owiń drzewo `FabricLabelProvider` (wewnątrz `RateProvider`, na zewnątrz `CartProvider`):
```tsx
          <RateProvider rate={eurRate}>
            <FabricLabelProvider map={fabricMap}>
              <CartProvider>
                <ToastProvider>
                  <TopBar />
                  <Navbar />
                  <main className="flex-1">{children}</main>
                  <Footer />
                  <CookieBanner />
                  <CartToast />
                </ToastProvider>
              </CartProvider>
            </FabricLabelProvider>
          </RateProvider>
```

- [ ] **Step 7: `VariantSelector.tsx` — tłumaczenie wartości „Tkanina"**

- Dodaj importy:
```ts
import { useFabricLabels } from "@/app/_lib/fabric-context";
import { FABRIC_OPTION_NAME } from "@/app/_lib/variants";
```
- Zmień sygnaturę `getValueLabel` by przyjmowała mapę i tłumaczyła tkaninę:
```ts
function getValueLabel(
  p: Product | undefined,
  optionName: string,
  value: string,
  locale: Locale,
  fabricMap: Record<string, string>
): string {
  const raw = p?.variants?.overrides?.value_labels?.[optionName]?.[value] ?? value;
  if (locale !== "de") return raw;
  if (optionName === FABRIC_OPTION_NAME && fabricMap[raw]) return fabricMap[raw];
  return mapDe(VARIANT_VALUE_DE, raw) ?? raw;
}
```
- W komponencie pobierz mapę i przekaż do obu wywołań `getValueLabel`:
```tsx
  const locale = useClientLocale();
  const fabricMap = useFabricLabels();
```
oraz w JSX zmień `getValueLabel(product, option.name, current, locale)` → `getValueLabel(product, option.name, current, locale, fabricMap)` i analogicznie dla `v` w pętli przycisków.

- [ ] **Step 8: Przekaż mapę w klienckich call-site'ach `formatVariantLabel`**

W `app/koszyk/page.tsx`:
- Dodaj import: `import { useFabricLabels } from "@/app/_lib/fabric-context";`
- W komponencie: `const fabricMap = useFabricLabels();`
- Zmień (linia ~173): `formatVariantLabel(item.variantValues, locale)` → `formatVariantLabel(item.variantValues, locale, fabricMap)`

W `app/checkout/CheckoutForm.tsx`:
- Dodaj import: `import { useFabricLabels } from "@/app/_lib/fabric-context";`
- W komponencie: `const fabricMap = useFabricLabels();`
- Zmień (linia ~353): `formatVariantLabel(item.variantValues, locale)` → `formatVariantLabel(item.variantValues, locale, fabricMap)`

- [ ] **Step 9: Przekaż mapę w checkout route (Stripe line item) gdy DE**

W `app/api/checkout/route.ts`:
- Dodaj import: `import { getFabricDeMap } from "@/app/_lib/fabrics";`
- Po ustaleniu `isDe`/`rate` pobierz mapę gdy DE (raz na request):
```ts
    const fabricMap = isDe ? await getFabricDeMap() : {};
```
- Zmień (linia ~213) `formatVariantLabel(variantValues)` → `formatVariantLabel(variantValues, locale, fabricMap)`

(Pominięte świadomie: `app/admin/zamowienia/[id]/page.tsx` używa `formatVariantLabel(..., "pl")` — admin pracuje po PL, bez zmian.)

- [ ] **Step 10: Bramki — typecheck, lint, testy, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 0 błędów; testy zielone; build przechodzi.

- [ ] **Step 11: Commit**

```bash
git add app/_lib/fabric-context.tsx app/layout.tsx app/_lib/variants.ts app/_components/ui/VariantSelector.tsx app/api/checkout/route.ts app/koszyk/page.tsx app/checkout/CheckoutForm.tsx app/_lib/__tests__/fabrics.test.ts
git commit -m "feat(fabrics): render nazw DE tkanin na storefront (kontekst + formatVariantLabel)"
```

---

## Po wdrożeniu (poza planem kodu)

- Odpalić migrację `37_fabrics.sql` w Supabase (instancja produkcyjna).
- W `/admin/tkaniny` wprowadzić realny katalog tkanin (nazwa PL + DE).
- Otworzyć PR z brancha `feat/katalog-tkanin-auto-warianty` (push przez konto Woodecky10 — patrz pamięć `git-push-woodecky10`).
- Weryfikacja behawioralna: produkt z opcją „Tkanina" z katalogu → selektor na karcie (PL i /de), koszyk/checkout pokazują nazwę DE na /de.

## Mapowanie wymagań spec → taski

- Katalog wielokrotnego użytku (tabela + zarządzanie): Task 1, 4, 5, 6.
- Podzbiór per produkt (multi-select): Task 7 (modal + `applyFabricSelection` z Task 3).
- Współistnienie z innymi opcjami (iloczyn): Task 3 (`applyFabricSelection`) + Task 2 (rebuild).
- Brak wpływu na cenę (modyfikator 0): Task 2/3 — nowe kombinacje dostają `price_modifier: 0`.
- Nazwa DE per tkanina: Task 1 (kolumna), 4 (`getFabricDeMap`), 8 (render).
- Edge case'y (pusty katalog, sieroty, odznaczenie wszystkich, duplikat): Task 5 (duplikat), Task 7 (pusty katalog, sieroty, odznaczenie wszystkich → null).
