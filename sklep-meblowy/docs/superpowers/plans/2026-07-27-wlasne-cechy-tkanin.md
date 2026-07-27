# Własne cechy tkanin (edytowalny słownik) — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Osoba obsługująca sklep dodaje własną cechę tkaniny (nazwa, DE, ikonka) w `/admin/tkaniny` bez udziału programisty; trzy istniejące cechy stają się edytowalne na tych samych zasadach.

**Architecture:** Zamknięty zestaw kodów w kodzie zastępujemy tabelą `fabric_property_defs` (migracja 64, wzorzec `fabric_groups` z migracji 57). `fabrics.properties` dalej trzyma kody. Czysty moduł `fabric-properties.ts` przechodzi z „stała lista kodów" na „definicje podane jako argument". Ikonki zostają w kodzie jako rejestr SVG pod kluczami; w bazie leży klucz.

**Tech Stack:** Next.js 16 (Turbopack, App Router), React 19, TypeScript, Tailwind, Supabase (Postgres), vitest (env **node** — tylko czyste funkcje), Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-wlasne-cechy-tkanin-design.md`.
- Przeczytaj `AGENTS.md`: to nie jest Next.js z danych treningowych — po API sięgaj do `node_modules/next/dist/docs/`.
- Klucze ikonek, dokładnie te dziesięć i w tej kolejności: `drop`, `paw`, `sparkle`, `leaf`, `shield`, `sun`, `flame`, `weave`, `durability`, `breathable`.
- Kody i podpisy trzech seedowanych cech muszą zostać identyczne jak dziś: `waterproof`/„Wodoodporna"/„Wasserabweisend"/`drop`, `pet_friendly`/„Przyjazna zwierzętom"/„Tierfreundlich"/`paw`, `easy_clean`/„Łatwa w czyszczeniu"/„Pflegeleicht"/`sparkle`.
- `code` cechy jest **niezmienny** po utworzeniu; zmiana nazwy nie może go ruszać.
- Puste `label_de` → fallback do `label` (wzorzec `pickLocalized`, jak przy nazwach tkanin).
- Vitest w env `node` — testować wolno wyłącznie czyste funkcje bez importów server-only i bez DOM (render przez `renderToStaticMarkup` jest OK, taki test już istnieje).
- Karta produktu musi renderować się **bez pigułek** zamiast wysypywać się, gdy definicji nie da się pobrać.
- Numer migracji: **64**. Ostatnia na `main` to `63_fabric_properties.sql`.
- Komentarze w kodzie po polsku, w stylu otaczających plików: zwięzłe, wyjaśniające DLACZEGO.
- Nie commituj na `main`. Praca na gałęzi `feat/wlasne-cechy-tkanin`.
- **Nie zapuszczaj migracji na bazę** — żywa baza to produkcja, robi to człowiek przed merge'em.
- Po każdym zadaniu: `npx tsc --noEmit` i `npm test` zielone.

---

### Task 1: Czysty moduł — definicje zamiast stałej listy kodów

**Files:**
- Modify (przepisanie): `app/_lib/fabric-properties.ts`
- Modify: `app/_lib/__tests__/fabric-properties.test.ts`

**Interfaces:**
- Consumes: `slugifyTitle` z `app/_lib/pages.ts` (istnieje, czysty — używa go `fabric-slug.ts`).
- Produces:
  - `type FabricPropertyIcon` + `const FABRIC_PROPERTY_ICONS: readonly FabricPropertyIcon[]`
  - `type FabricPropertyDef = { code: string; label: string; labelDe: string | null; icon: FabricPropertyIcon | null; sortOrder: number }`
  - `function buildFabricPropertyDefs(rows: unknown): FabricPropertyDef[]`
  - `function resolveFabricProperties(codes: unknown, defs: FabricPropertyDef[]): FabricPropertyDef[]`
  - `function propertyCodeSlug(name: string, taken: Set<string>): string`
  - `const FABRIC_PROPERTY_LABEL_MAX = 60`

- [ ] **Step 1: Write the failing tests**

Zastąp treść `app/_lib/__tests__/fabric-properties.test.ts`. Stare testy dotyczyły zamkniętego zestawu kodów — ten kontrakt znika, więc idą do kosza razem z nim. Nowa treść:

```ts
import { describe, it, expect } from "vitest";
import {
  FABRIC_PROPERTY_ICONS,
  buildFabricPropertyDefs,
  resolveFabricProperties,
  propertyCodeSlug,
} from "@/app/_lib/fabric-properties";

const DEFS = buildFabricPropertyDefs([
  { code: "waterproof", label: "Wodoodporna", label_de: "Wasserabweisend", icon: "drop", sort_order: 0 },
  { code: "pet_friendly", label: "Przyjazna zwierzętom", label_de: null, icon: "paw", sort_order: 1 },
  { code: "easy_clean", label: "Łatwa w czyszczeniu", label_de: "Pflegeleicht", icon: "sparkle", sort_order: 2 },
]);

describe("FABRIC_PROPERTY_ICONS", () => {
  it("to dziesięć kluczy w ustalonej kolejności", () => {
    expect([...FABRIC_PROPERTY_ICONS]).toEqual([
      "drop", "paw", "sparkle", "leaf", "shield", "sun", "flame", "weave", "durability", "breathable",
    ]);
  });
});

describe("buildFabricPropertyDefs", () => {
  it("mapuje wiersze z bazy i sortuje po sort_order", () => {
    const defs = buildFabricPropertyDefs([
      { code: "b", label: "B", label_de: null, icon: "leaf", sort_order: 5 },
      { code: "a", label: "A", label_de: "A-DE", icon: "drop", sort_order: 1 },
    ]);
    expect(defs.map((d) => d.code)).toEqual(["a", "b"]);
    expect(defs[0]).toEqual({ code: "a", label: "A", labelDe: "A-DE", icon: "drop", sortOrder: 1 });
  });

  it("nieznany klucz ikonki → icon null (pigułka bez ikonki, nie wyjątek)", () => {
    const defs = buildFabricPropertyDefs([
      { code: "a", label: "A", label_de: null, icon: "teleport", sort_order: 0 },
    ]);
    expect(defs[0].icon).toBeNull();
  });

  it("puste label_de → null (fallback do PL robi render)", () => {
    const defs = buildFabricPropertyDefs([
      { code: "a", label: "A", label_de: "   ", icon: "drop", sort_order: 0 },
    ]);
    expect(defs[0].labelDe).toBeNull();
  });

  it("wiersze bez code albo bez label są pomijane", () => {
    const defs = buildFabricPropertyDefs([
      { code: "", label: "A", label_de: null, icon: "drop", sort_order: 0 },
      { code: "b", label: "   ", label_de: null, icon: "drop", sort_order: 1 },
      { code: "c", label: "C", label_de: null, icon: "drop", sort_order: 2 },
    ]);
    expect(defs.map((d) => d.code)).toEqual(["c"]);
  });

  it("wejście nie-tablicowe → pusta lista (błąd zapytania, stary cache)", () => {
    expect(buildFabricPropertyDefs(null)).toEqual([]);
    expect(buildFabricPropertyDefs(undefined)).toEqual([]);
    expect(buildFabricPropertyDefs("x")).toEqual([]);
  });
});

describe("resolveFabricProperties", () => {
  it("zwraca definicje w kolejności sort_order, niezależnie od kolejności kodów", () => {
    const out = resolveFabricProperties(["easy_clean", "waterproof"], DEFS);
    expect(out.map((d) => d.code)).toEqual(["waterproof", "easy_clean"]);
  });

  it("odsiewa kody bez definicji (usunięta cecha)", () => {
    expect(resolveFabricProperties(["waterproof", "nieistnieje"], DEFS).map((d) => d.code)).toEqual([
      "waterproof",
    ]);
  });

  it("usuwa duplikaty i przycina białe znaki", () => {
    expect(resolveFabricProperties([" waterproof ", "waterproof"], DEFS).map((d) => d.code)).toEqual([
      "waterproof",
    ]);
  });

  it("pomija elementy nie-stringowe", () => {
    expect(resolveFabricProperties([1, null, {}, "paw_missing", "pet_friendly"], DEFS).map((d) => d.code)).toEqual([
      "pet_friendly",
    ]);
  });

  it("wejście nie-tablicowe albo brak definicji → pusta lista", () => {
    expect(resolveFabricProperties(null, DEFS)).toEqual([]);
    expect(resolveFabricProperties(["waterproof"], [])).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const codes = ["easy_clean", "waterproof"];
    const snapshot = JSON.stringify(codes);
    resolveFabricProperties(codes, DEFS);
    expect(JSON.stringify(codes)).toBe(snapshot);
  });
});

describe("propertyCodeSlug", () => {
  it("robi kod z nazwy, z polskimi znakami", () => {
    expect(propertyCodeSlug("Przyjazna zwierzętom", new Set())).toBe("przyjazna-zwierzetom");
  });

  it("kolizja → sufiks -2, potem -3", () => {
    expect(propertyCodeSlug("Wodoodporna", new Set(["wodoodporna"]))).toBe("wodoodporna-2");
    expect(propertyCodeSlug("Wodoodporna", new Set(["wodoodporna", "wodoodporna-2"]))).toBe("wodoodporna-3");
  });

  it("nazwa bez znaków alfanumerycznych → fallback 'cecha'", () => {
    expect(propertyCodeSlug("!!!", new Set())).toBe("cecha");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/fabric-properties.test.ts`
Expected: FAIL — brak eksportów `FABRIC_PROPERTY_ICONS`, `buildFabricPropertyDefs`, `resolveFabricProperties`, `propertyCodeSlug`.

- [ ] **Step 3: Przepisz moduł**

Zastąp całą treść `app/_lib/fabric-properties.ts`:

```ts
// Cechy tkaniny pokazywane klientowi jako pigułki przy wyborze tkaniny.
// Czysty moduł (zero importów server-only) — testowalny w vitest (env node).
//
// Zestaw cech NIE jest już zamknięty w kodzie: definicje żyją w tabeli
// `fabric_property_defs` i admin dodaje własne w /admin/tkaniny. W kodzie
// zostaje tylko to, czego nie da się wpisać w formularzu — biblioteka ikonek
// (SVG to kod). W `fabrics.properties` leżą same kody cech.
import { slugifyTitle } from "./pages";

// Klucze ikonek dostępnych w panelu; kolejność = kolejność siatki wyboru.
export const FABRIC_PROPERTY_ICONS = [
  "drop",
  "paw",
  "sparkle",
  "leaf",
  "shield",
  "sun",
  "flame",
  "weave",
  "durability",
  "breathable",
] as const;

export type FabricPropertyIcon = (typeof FABRIC_PROPERTY_ICONS)[number];

export function isFabricPropertyIcon(value: unknown): value is FabricPropertyIcon {
  return typeof value === "string" && (FABRIC_PROPERTY_ICONS as readonly string[]).includes(value);
}

// Limit długości podpisu — pigułka ma zostać pigułką, nie akapitem.
export const FABRIC_PROPERTY_LABEL_MAX = 60;

export type FabricPropertyDef = {
  code: string;
  label: string;
  labelDe: string | null;
  // null = klucz spoza biblioteki (np. ikonka usunięta z kodu) → render bez ikonki.
  icon: FabricPropertyIcon | null;
  sortOrder: number;
};

// Wejście defensywne: to surowe wiersze z bazy albo `undefined`, gdy zapytanie
// padło (brak tabeli przed migracją) — nic z tego nie może wysypać karty produktu.
export function buildFabricPropertyDefs(rows: unknown): FabricPropertyDef[] {
  if (!Array.isArray(rows)) return [];
  const out: FabricPropertyDef[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code.trim() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!code || !label) continue;
    const labelDe = typeof r.label_de === "string" ? r.label_de.trim() : "";
    out.push({
      code,
      label,
      labelDe: labelDe || null,
      icon: isFabricPropertyIcon(r.icon) ? r.icon : null,
      sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
    });
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

// Kody zapisane przy tkaninie → definicje, w kolejności z panelu. Kod bez
// definicji (usunięta cecha) jest pomijany; duplikaty odsiane.
export function resolveFabricProperties(
  codes: unknown,
  defs: FabricPropertyDef[]
): FabricPropertyDef[] {
  if (!Array.isArray(codes) || defs.length === 0) return [];
  const wanted = new Set<string>();
  for (const c of codes) {
    if (typeof c !== "string") continue;
    wanted.add(c.trim());
  }
  return defs.filter((d) => wanted.has(d.code));
}

// Kod cechy generowany raz, przy tworzeniu — stabilny przy zmianie nazwy, bo
// tkaniny trzymają kod, nie napis (wzorzec fabricSlug dla tkanin).
export function propertyCodeSlug(name: string, taken: Set<string>): string {
  const base = slugifyTitle(name) || "cecha";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/fabric-properties.test.ts`
Expected: PASS. `npm test` na tym etapie **będzie czerwony** w innych plikach (`variants.ts`, komponent, admin nadal używają starego API) — to normalne, naprawia to Task 2 i 3. Zaraportuj to wprost.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-properties.ts app/_lib/__tests__/fabric-properties.test.ts
git commit -m "feat(tkaniny): definicje cech zamiast zamknietej listy kodow"
```

---

### Task 2: Migracja 64, warstwa danych i metadane tkaniny

**Files:**
- Create: `supabase/migrations/64_fabric_property_defs.sql`
- Modify: `app/_lib/types.ts` (nowy typ `FabricPropertyDefRow`, obok `FabricPriceGroup`)
- Modify: `app/_lib/fabrics.ts` (fetch definicji + tag cache + `getFabricMetaMap`)
- Modify: `app/_lib/variants.ts` (`FabricValueMeta.properties` → `FabricPropertyDef[]`, `buildFabricMetaMap` przyjmuje definicje)
- Modify: `app/_lib/__tests__/variants.test.ts` (istniejący blok „buildFabricMetaMap — cechy tkaniny")

**Interfaces:**
- Consumes: `buildFabricPropertyDefs`, `resolveFabricProperties`, `FabricPropertyDef` (Task 1).
- Produces:
  - `FABRIC_PROPERTY_DEFS_CACHE_TAG` + `getFabricPropertyDefs(): Promise<FabricPropertyDef[]>` + `invalidateFabricPropertyDefsCache()` w `app/_lib/fabrics.ts`
  - `FabricValueMeta.properties: FabricPropertyDef[]`
  - `buildFabricMetaMap(fabrics, groups, propertyDefs)`

- [ ] **Step 1: Napisz migrację**

Utwórz `supabase/migrations/64_fabric_property_defs.sql`:

```sql
-- Migracja 64: edytowalny slownik cech tkanin (spec 2026-07-27).
-- Wzorzec fabric_groups (57): code niezmienny, reszta edytowalna w /admin/tkaniny.
-- Ikonka to KLUCZ z biblioteki w kodzie (app/_lib/fabric-properties.ts), nie plik.
-- fabrics.properties bez zmian - dalej trzyma kody cech.
create table if not exists public.fabric_property_defs (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  label       text not null,
  label_de    text,
  icon        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS jak fabric_groups: tylko admin; odczyt publiczny server-side przez service role.
alter table public.fabric_property_defs enable row level security;
create policy "fabric_property_defs: admin all"
  on public.fabric_property_defs for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Trzy cechy z migracji 63 - te same kody, te same podpisy, te same ikonki.
insert into public.fabric_property_defs (code, label, label_de, icon, sort_order) values
  ('waterproof',   'Wodoodporna',          'Wasserabweisend', 'drop',    0),
  ('pet_friendly', 'Przyjazna zwierzętom', 'Tierfreundlich',  'paw',     1),
  ('easy_clean',   'Łatwa w czyszczeniu',  'Pflegeleicht',    'sparkle', 2)
on conflict (code) do nothing;
```

- [ ] **Step 2: Napisz failujące testy metadanych**

W `app/_lib/__tests__/variants.test.ts` zastąp istniejący blok `describe("buildFabricMetaMap — cechy tkaniny", …)` wersją z definicjami. Zdefiniuj nad nim stałą:

```ts
  const PROPERTY_DEFS = [
    { code: "waterproof", label: "Wodoodporna", labelDe: "Wasserabweisend", icon: "drop" as const, sortOrder: 0 },
    { code: "easy_clean", label: "Łatwa w czyszczeniu", labelDe: null, icon: "sparkle" as const, sortOrder: 2 },
  ];
```

i testy:

```ts
  describe("buildFabricMetaMap — cechy tkaniny", () => {
    it("rozwiązuje kody na definicje i przenosi je na każdą wartość rodziny", () => {
      const map = buildFabricMetaMap(
        [{ name: "Inari", colors: ["22", "23"], slug: "inari", group_id: "g1", properties: ["easy_clean", "waterproof"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Inari 22"].properties.map((p) => p.code)).toEqual(["waterproof", "easy_clean"]);
      expect(map["Inari 23"].properties[0].label).toBe("Wodoodporna");
    });

    it("brak kolumny properties → pusta lista, bez wyjątku", () => {
      const map = buildFabricMetaMap(
        [{ name: "Kronos", colors: ["01"], slug: "kronos", group_id: "g1" }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Kronos 01"].properties).toEqual([]);
    });

    it("kod bez definicji (usunięta cecha) jest odsiewany", () => {
      const map = buildFabricMetaMap(
        [{ name: "Poso", colors: ["105"], slug: "poso", group_id: "g1", properties: ["waterproof", "skasowana"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        PROPERTY_DEFS
      );
      expect(map["Poso 105"].properties.map((p) => p.code)).toEqual(["waterproof"]);
    });

    it("brak definicji w ogóle → pusta lista", () => {
      const map = buildFabricMetaMap(
        [{ name: "Poso", colors: ["105"], slug: "poso", group_id: "g1", properties: ["waterproof"] }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }],
        []
      );
      expect(map["Poso 105"].properties).toEqual([]);
    });
  });
```

Run: `npx vitest run app/_lib/__tests__/variants.test.ts` → FAIL (trzeci argument nieobsługiwany, `properties` to dalej stringi).

- [ ] **Step 3: Zmień warstwę danych**

3a. W `app/_lib/types.ts`, obok typu `FabricPriceGroup`, dodaj surowy wiersz z bazy:

```ts
// Definicja cechy tkaniny (migracja 64) — edytowalna w /admin/tkaniny.
// `icon` to klucz z biblioteki w app/_lib/fabric-properties.ts, nie plik.
export type FabricPropertyDefRow = {
  id: string;
  code: string;
  label: string;
  label_de: string | null;
  icon: string;
  sort_order: number;
  created_at: string;
};
```

3b. W `app/_lib/variants.ts`: zamień import `parseFabricProperties`/`FabricPropertyCode` na `resolveFabricProperties`/`FabricPropertyDef`; w typie `FabricValueMeta` zmień `properties: FabricPropertyCode[]` na `properties: FabricPropertyDef[]`; do sygnatury `buildFabricMetaMap` dodaj trzeci parametr `propertyDefs: FabricPropertyDef[]`, a w budowanym obiekcie `meta` ustaw `properties: resolveFabricProperties(f.properties, propertyDefs)`.

3c. W `app/_lib/fabrics.ts` dodaj — wzorując się dosłownie na istniejącym bloku `FABRIC_GROUPS_CACHE_TAG` / `fetchFabricPriceGroups` / `getFabricPriceGroups` / `invalidateFabricGroupsCache`:

```ts
export const FABRIC_PROPERTY_DEFS_CACHE_TAG = "fabric-property-defs";

const fetchFabricPropertyDefs = unstable_cache(
  async (): Promise<FabricPropertyDef[]> => {
    const supabase = await createAdminClient();
    // Błąd (np. brak tabeli przed migracją) → pusta lista: karta produktu ma
    // wyrenderować się bez pigułek, a nie wysypać.
    const { data, error } = await supabase
      .from("fabric_property_defs")
      .select("code, label, label_de, icon, sort_order")
      .order("sort_order", { ascending: true });
    if (error) return [];
    return buildFabricPropertyDefs(data);
  },
  ["fabric-property-defs-all"],
  { tags: [FABRIC_PROPERTY_DEFS_CACHE_TAG], revalidate: 300 }
);

export const getFabricPropertyDefs = cache(fetchFabricPropertyDefs);

export function invalidateFabricPropertyDefsCache(): void {
  revalidateTag(FABRIC_PROPERTY_DEFS_CACHE_TAG, "max");
}
```

oraz dołóż definicje do `getFabricMetaMap()` — dziś woła `buildFabricMetaMap(fabrics, groups)`; ma wołać `buildFabricMetaMap(fabrics, groups, defs)`, gdzie `defs` pobierasz równolegle w tym samym `Promise.all`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts && npx tsc --noEmit`
Expected: testy PASS. `tsc` **nadal zgłosi błędy** w `FabricPropertyBadges.tsx`, `VariantSelector.tsx` i plikach admina (używają starego API) — to naprawiają Taski 3 i 4. Wypisz te błędy w raporcie i potwierdź, że dotyczą wyłącznie tych plików.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/64_fabric_property_defs.sql app/_lib/types.ts app/_lib/fabrics.ts app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(tkaniny): tabela definicji cech + rozwiazywanie kodow na definicje"
```

**Uwaga:** migracji NIE zapuszczaj na bazę.

---

### Task 3: Rejestr ikonek i pigułki z definicji

**Files:**
- Create: `app/_components/ui/FabricPropertyIcon.tsx` (rejestr 10 SVG)
- Modify: `app/_components/ui/FabricPropertyBadges.tsx`
- Modify: `app/_components/ui/VariantSelector.tsx` (typy przekazywanych cech)
- Modify: `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (usunięcie trzech kluczy)
- Modify: `app/_lib/__tests__/fabric-property-badges.test.ts`

**Interfaces:**
- Consumes: `FabricPropertyDef`, `FabricPropertyIcon`, `FABRIC_PROPERTY_ICONS` (Task 1).
- Produces: `<FabricPropertyIconSvg icon={...} />` oraz `<FabricPropertyBadges defs={FabricPropertyDef[]} locale={Locale} />`.

- [ ] **Step 1: Rejestr ikonek**

Utwórz `app/_components/ui/FabricPropertyIcon.tsx`: komponent `FabricPropertyIconSvg({ icon }: { icon: FabricPropertyIcon })` zwracający `<svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">` z zawartością zależną od klucza. Trzy pierwsze ikonki przenieś **dosłownie** z obecnej mapy `ICONS` w `FabricPropertyBadges.tsx` (`drop` = dawny `waterproof`, `paw` = `pet_friendly`, `sparkle` = `easy_clean`). Pozostałych siedem (`leaf`, `shield`, `sun`, `flame`, `weave`, `durability`, `breathable`) narysuj prostymi ścieżkami w tym samym stylu: jednolita bryła, `fill="currentColor"`, bez `stroke`, czytelna w 12 px. Rejestr trzymaj jako `Record<FabricPropertyIcon, ReactNode>` — TypeScript wymusi komplet dziesięciu kluczy.

- [ ] **Step 2: Przepisz testy renderu**

W `app/_lib/__tests__/fabric-property-badges.test.ts` zamień props z `codes` na `defs` i dopisz dwa przypadki: nieznana ikonka (`icon: null`) → pigułka renderuje się z podpisem, ale bez `<svg`; `locale: "de"` przy `labelDe: null` → w wyniku podpis polski (fallback). Zachowaj istniejące przypadki: pusta lista → pusty string; jeden korzeń `<span>`, zero `<div`; kolejność wynikowa zgodna z kolejnością wejściowych definicji.

Run: `npx vitest run app/_lib/__tests__/fabric-property-badges.test.ts` → FAIL.

- [ ] **Step 3: Przepisz komponent i osadzenia**

`FabricPropertyBadges.tsx`: props `{ defs: FabricPropertyDef[]; locale: Locale }`; `if (defs.length === 0) return null;` bez zmian; podpis przez `pickLocalized(def.label, def.labelDe, locale)` (import z `@/app/_lib/i18n`); ikonka przez `{def.icon && <FabricPropertyIconSvg icon={def.icon} />}`. Usuń import `getDictionary` i lokalną mapę `ICONS`. Klasy pigułki i kontenera zostaw dokładnie te same.

`VariantSelector.tsx`: oba osadzenia przekazują teraz `defs` zamiast `codes` (typ w `GroupBucket.fabrics` zmienia się z `FabricPropertyCode[]` na `FabricPropertyDef[]`); reszta bez zmian — `data-testid="fabric-groups"`, `flex-wrap` i klasy zostają.

Słowniki: usuń klucze `propertyWaterproof`, `propertyPetFriendly`, `propertyEasyClean` z typu i wartości w `pl.ts` oraz z wartości w `de.ts`.

- [ ] **Step 4: Weryfikacja**

Run: `npx vitest run app/_lib/__tests__/fabric-property-badges.test.ts && npx tsc --noEmit && npx eslint app/_components/ui/FabricPropertyIcon.tsx app/_components/ui/FabricPropertyBadges.tsx app/_components/ui/VariantSelector.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts`
Expected: testy PASS; `tsc` może jeszcze zgłaszać błędy w plikach admina (Task 4) — wypisz je i potwierdź, że tylko tam.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/FabricPropertyIcon.tsx app/_components/ui/FabricPropertyBadges.tsx app/_components/ui/VariantSelector.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_lib/__tests__/fabric-property-badges.test.ts
git commit -m "feat(produkt): pigulki cech renderowane z definicji + biblioteka ikonek"
```

---

### Task 4: Panel „Cechy tkanin" w /admin/tkaniny

**Files:**
- Create: `app/admin/tkaniny/FabricPropertiesPanel.tsx`
- Modify: `app/admin/tkaniny/actions.ts` (trzy nowe akcje + checkboxy w create/update tkaniny)
- Modify: `app/admin/tkaniny/page.tsx` (pobranie definicji, osadzenie panelu, przekazanie do edytora)
- Modify: `app/admin/tkaniny/FabricsEditor.tsx` (checkboxy z listy zamiast ze stałej)

**Interfaces:**
- Consumes: `FABRIC_PROPERTY_ICONS`, `isFabricPropertyIcon`, `propertyCodeSlug`, `FABRIC_PROPERTY_LABEL_MAX` (Task 1); `FabricPropertyDefRow` (Task 2, `app/_lib/types.ts`); `invalidateFabricPropertyDefsCache`, `invalidateFabricsCache` (Task 2); `FabricPropertyIconSvg` (Task 3).
- Produces: akcje `createFabricProperty`, `updateFabricProperty`, `deleteFabricProperty` (każda `(formData: FormData) => Promise<ActionResult>`).

**Uwaga o typach — przeczytaj przed pisaniem kodu:** panel i edytor tkanin pracują na **surowych wierszach** `FabricPropertyDefRow[]` (mają `id`, potrzebne do edycji i usuwania), a NIE na `FabricPropertyDef` — ten drugi typ jest dla klienta sklepu i `id` nie niesie. Wiersze pobierz w `page.tsx` bezpośrednio (`createAdminClient().from("fabric_property_defs").select("*").order("sort_order", { ascending: true })`), tak jak strona admina pobiera pozostałe dane. Nie wołaj tu `getFabricPropertyDefs()` — jest zcache'owany pod kątem sklepu i pozbawiony `id`.

- [ ] **Step 1: Akcje serwerowe**

W `app/admin/tkaniny/actions.ts` dopisz trzy akcje, wzorując się na istniejących (`requireAdmin()` na wejściu, `sanitize`, zwracany `ActionResult`, `revalidatePath("/admin/tkaniny")`):

- `createFabricProperty` — czyta `label` (wymagane, `slice(0, FABRIC_PROPERTY_LABEL_MAX)`), `label_de`, `icon` (musi przejść `isFabricPropertyIcon`, inaczej `{ ok: false, error: "Wybierz ikonkę" }`), `sort_order`. Kod liczy przez `propertyCodeSlug(label, taken)`, gdzie `taken` to zbiór kodów już istniejących w tabeli (jedno `select code`). Insert; `23505` → `{ ok: false, error: "Taka cecha już istnieje" }`.
- `updateFabricProperty` — czyta `id` (wymagane) i te same pola **bez** `code`: kod jest niezmienny, bo tkaniny trzymają kod, nie napis. Update po `id`.
- `deleteFabricProperty` — czyta `id` i `code`; najpierw `update fabrics set properties = array_remove(properties, code)` dla wszystkich tkanin mających ten kod, potem delete definicji. Kolejność ma znaczenie: gdyby delete poszedł pierwszy i drugi krok padł, w tkaninach zostałyby sieroty (renderują się nieszkodliwie, ale mylą). Zwróć w `message`, ile tkanin zaktualizowano.

Każda z trzech akcji na końcu woła `invalidateFabricPropertyDefsCache()`, a `deleteFabricProperty` dodatkowo `invalidateFabricsCache()` (zmieniła dane tkanin).

Dodatkowo: `createFabric` i `updateFabric` przestają walidować checkboxy stałą listą — `parseFabricProperties` już nie istnieje. Zamiast tego czytaj `formData.getAll("properties")`, zostaw tylko stringi po `trim()`, odsiej duplikaty i przefiltruj przez zbiór kodów istniejących w `fabric_property_defs` (jedno `select code`), żeby spreparowany request nie wstrzyknął dowolnego kodu.

- [ ] **Step 2: Panel**

Utwórz `app/admin/tkaniny/FabricPropertiesPanel.tsx` na wzór `FabricGroupsPanel.tsx` (`Card`, `Field`, `inputCls`, `useTransition`, `useRouter`, `useConfirm`, `onResult`):
- nagłówek „Cechy tkanin" + zdanie wyjaśniające, że pokazują się klientowi jako plakietki przy wyborze tkaniny i że zaznacza się je przy każdej tkaninie niżej,
- wiersz per cecha: pole nazwy, pole nazwy DE (hint „Puste → na /de pokaże się polska"), siatka ikonek do kliknięcia (`FABRIC_PROPERTY_ICONS` + `FabricPropertyIconSvg`, zaznaczona ma złotą obwódkę), pole kolejności, przycisk „Zapisz", przycisk „Usuń",
- formularz „Dodaj cechę" z tymi samymi polami,
- **usuwanie przez `useConfirm`** z komunikatem zawierającym liczbę tkanin używających cechy (liczbę policz w komponencie z przekazanej listy tkanin) i jasnym ostrzeżeniem, że cecha zniknie również z tych tkanin.

Checkboxy w formularzu tkaniny nie mogą siedzieć w komponencie `Field` — renderuje on `<label>`, a zagnieżdżone `<label>` sprawiają, że klik w nagłówek zaznacza pierwszy checkbox. W `FabricsEditor.tsx` ten blok jest już zbudowany poprawnie (`div` + `span` + `p`) — zachowaj ten układ, zmień tylko źródło listy ze stałej `PROPERTY_LABELS_PL` na przekazane definicje (usuń stałą).

- [ ] **Step 3: Strona admina**

W `app/admin/tkaniny/page.tsx` dociągnij definicje (`getFabricPropertyDefs()`) w tym samym `Promise.all`, co pozostałe dane, wyrenderuj `<FabricPropertiesPanel …/>` obok `<FabricGroupsPanel …/>` i przekaż definicje do edytora tkanin.

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit && npm test && npx eslint app/admin/tkaniny/FabricPropertiesPanel.tsx app/admin/tkaniny/actions.ts app/admin/tkaniny/page.tsx app/admin/tkaniny/FabricsEditor.tsx && npm run build`
Expected: wszystko zielone — to pierwszy moment, w którym cały pakiet i build muszą przejść bez wyjątków.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tkaniny
git commit -m "feat(admin): panel wlasnych cech tkanin"
```

---

### Task 5: Weryfikacja całości i e2e

**Files:**
- Modify (tylko jeśli trzeba): `e2e/fabric-properties.spec.ts`

- [ ] **Step 1: Sprawdź, czy e2e nadal opisuje rzeczywistość**

Spec e2e sprawdza podpisy „Wodoodporna | Przyjazna zwierzętom | Łatwa w czyszczeniu" — po seedzie migracji 64 są identyczne, więc test **nie powinien wymagać zmian**. Przeczytaj go i potwierdź to w raporcie; zmieniaj tylko wtedy, gdy coś faktycznie się rozjechało (np. komentarz odwołujący się do nieistniejącego już `FabricPropertyCode`).

- [ ] **Step 2: Pełna weryfikacja gałęzi**

Uruchom i pokaż dosłowne wyjścia:
1. `npx tsc --noEmit`
2. `npm test` (podaj liczbę)
3. `npm run build`
4. `npx eslint` na wszystkich plikach dotkniętych w tej gałęzi
5. `E2E_BASE_URL=http://localhost:3000 npx playwright test --config=playwright.local.config.ts` — dev server odpal sam i ubij po testach; NIE uruchamiaj domyślnej konfiguracji Playwrighta (celuje w produkcję). Wynik `skipped` dla `fabric-properties` jest poprawny (migracja 64 nie jest na bazie, więc lokalnie nie ma definicji cech).

⚠️ Uwaga z poprzedniej sesji: `npm run build` w trakcie działającego dev servera psuje mu `.next` — nie rób obu naraz.

- [ ] **Step 3: Commit (jeśli cokolwiek zmieniałeś)**

```bash
git add e2e/fabric-properties.spec.ts
git commit -m "test(e2e): dostosowanie do definicji cech z bazy"
```

---

## Po planie (robi Mikołaj, nie subagent)

1. **Zapuszczenie migracji 64 na Supabase — PRZED merge'em i przed otwarciem PR-a.** Preview dzieli bazę z produkcją. Bez tabeli panel tkanin nie wyrenderuje checkboxów cech, a panel „Cechy tkanin" nie zapisze niczego; karta produktu jest zabezpieczona i pokaże się bez pigułek.
2. Klik-testy: dodanie własnej cechy z ikonką, zaznaczenie jej przy tkaninie, sprawdzenie pigułki na karcie produktu (PL + `/de`, telefon), zmiana nazwy istniejącej cechy (pigułka ma zmienić napis, zaznaczenia mają przetrwać), usunięcie cechy używanej przez tkaniny (potwierdzenie z licznikiem, zaznaczenia znikają).
