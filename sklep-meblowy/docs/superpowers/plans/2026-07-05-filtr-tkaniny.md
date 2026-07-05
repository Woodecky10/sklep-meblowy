# Filtr tkanin na /sklep — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtr „Materiał" na /sklep staje się filtrem „Tkanina" (DE „Stoff"): źródłem wartości są rodziny tkanin z opcji wariantów × katalog `fabrics`, w unii z legacy wartościami kolumny `products.material`; param URL `material`→`tkanina`.

**Architecture:** Czysty moduł `app/_lib/fabric-filter.ts` (dopasowanie rodzin tkanin do wartości opcji, testowalny w node) + zmiany w `getFilterFacets`/`getProducts` (facety z unii źródeł; filtrowanie przez policzenie pasujących `id` i `.in("id", ids)` — paginacja/sort/pozostałe filtry zostają w DB). UI tylko zmienia param i wartości słownika. Zero migracji DB.

**Tech Stack:** Next.js 16 (Turbopack), Supabase JS (anon client + RLS; `getAllFabrics` przez admin client z cache), TypeScript, Vitest (node env, bez jsdom).

## Global Constraints

- Semantyka dopasowania (spec): produkt pasuje do wartości `V` gdy `V` ∈ rodziny tkanin z wariantów LUB `V` == `products.material` (exact, po trim). Wiele wartości = OR.
- Facety = rodziny tkanin UŻYTE w aktywnych produktach (value = nazwa PL z katalogu, label DE = `fabrics.name_de`) + legacy wartości `material` (label DE = `material_de`); dedupe po value PL (istniejący `buildLocalizedFacets`).
- Dopasowanie rodziny: case-insensitive, na granicach słów („Poso 105"→Poso; „Monolith 84 + Solar 99"→Monolith i Solar; „Chill Me 22"→Chill Me; „Solaris"↛Solar). Dowolna opcja (też „TKANINA", „Wariant"), nie tylko „Tkanina".
- Param URL: `tkanina` (stary `material` przestaje działać — decyzja ze specu). Słownik: `filter.material` wartości PL „Tkanina" / DE „Stoff" (klucz bez zmian). `product.specMaterial` NIE ruszać.
- Konwencje repo: testy w `app/_lib/__tests__/`, `describe`/`it` po polsku z `→`, node env; straight ASCII w kodzie (bez BOM/curly quotes w atrybutach/stringach kodu), polskie „…" tylko w widocznym tekście; commity po polsku ze stopką `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Stale `.next/dev/types` bywa źródłem fałszywych błędów tsc → `rm -rf .next` i ponów.
- Gałąź: `feat/filtr-tkaniny` (utworzona; spec zacommitowany).

## Plik po pliku

- Create: `app/_lib/fabric-filter.ts` — czysta logika dopasowania (1 odpowiedzialność).
- Create: `app/_lib/__tests__/fabric-filter.test.ts`.
- Modify: `app/_lib/products.ts` — `getFilterFacets` (źródła facetów) + `getProducts` (filtrowanie po id) + komentarze.
- Modify: `app/sklep/page.tsx` — param `tkanina` (typ, parsowanie, rawParams).
- Modify: `app/_components/ui/FilterBar.tsx` — odczyt/zapis parametru `tkanina`.
- Modify: `app/_lib/dictionaries/pl.ts` + `de.ts` — wartości `filter.material`.

---

### Task 1: Czysty moduł `fabric-filter.ts` (TDD)

**Files:**
- Create: `app/_lib/fabric-filter.ts`
- Test: `app/_lib/__tests__/fabric-filter.test.ts`

**Interfaces:**
- Consumes: typ `ProductVariants` z `@/app/_lib/types` (`{ options: {name, values, value_prices?}[], overrides? }`).
- Produces (Task 2 na tym polega):
  - `deriveFabricFamilies(variants: ProductVariants | null | undefined, familyNames: string[]): string[]` — kanoniczne nazwy rodzin (pisownia i kolejność z `familyNames`) występujące w wartościach opcji.
  - `productMatchesFabric(variants: ProductVariants | null | undefined, material: string | null | undefined, selected: string[], familyNames: string[]): boolean`.

- [ ] **Step 1: Napisz failing test**

Utwórz `app/_lib/__tests__/fabric-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveFabricFamilies,
  productMatchesFabric,
} from "@/app/_lib/fabric-filter";
import type { ProductVariants } from "@/app/_lib/types";

const FAMILIES = [
  "Chill Me",
  "Inari",
  "Monolith",
  "Poso",
  "Quelle",
  "Solar",
  "Tilia",
  "Trinity",
  "Vena",
  "Woolly",
];

function v(options: { name: string; values: string[] }[]): ProductVariants {
  return { options };
}

describe("deriveFabricFamilies — rodziny tkanin z wartości opcji", () => {
  it("„Poso 105\" w opcji Tkanina → [Poso]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Tkanina", values: ["Poso 105", "Poso 32"] }]), FAMILIES)
    ).toEqual(["Poso"]);
  });

  it("opcja pisana TKANINA (uppercase) też działa", () => {
    expect(
      deriveFabricFamilies(v([{ name: "TKANINA", values: ["Trinity 01 Cream"] }]), FAMILIES)
    ).toEqual(["Trinity"]);
  });

  it("opcja „Wariant\" z combo „Monolith 84 + Solar 99\" → [Monolith, Solar]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Wariant", values: ["Monolith 84 + Solar 99"] }]), FAMILIES)
    ).toEqual(["Monolith", "Solar"]);
  });

  it("rodzina dwuwyrazowa: „Chill Me 22\" → [Chill Me]", () => {
    expect(
      deriveFabricFamilies(v([{ name: "Tkanina", values: ["Chill Me 22"] }]), FAMILIES)
    ).toEqual(["Chill Me"]);
  });

  it("wartość równa samej nazwie rodziny → pasuje", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["Vena"] }]), FAMILIES)).toEqual([
      "Vena",
    ]);
  });

  it("case-insensitive: „poso 105\" → [Poso] (kanoniczna pisownia z katalogu)", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["poso 105"] }]), FAMILIES)).toEqual(
      ["Poso"]
    );
  });

  it("granica słowa: „Solaris 3\" NIE pasuje do Solar", () => {
    expect(deriveFabricFamilies(v([{ name: "Tkanina", values: ["Solaris 3"] }]), FAMILIES)).toEqual(
      []
    );
  });

  it("null / brak opcji / opcje bez tkanin → []", () => {
    expect(deriveFabricFamilies(null, FAMILIES)).toEqual([]);
    expect(deriveFabricFamilies(v([]), FAMILIES)).toEqual([]);
    expect(
      deriveFabricFamilies(v([{ name: "Strona", values: ["Lewostronny", "Prawostronny"] }]), FAMILIES)
    ).toEqual([]);
  });

  it("wiele opcji naraz: Strona + Tkanina → tylko rodziny tkanin, kolejność katalogu", () => {
    expect(
      deriveFabricFamilies(
        v([
          { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
          { name: "Tkanina", values: ["Woolly 03", "Inari 91"] },
        ]),
        FAMILIES
      )
    ).toEqual(["Inari", "Woolly"]);
  });
});

describe("productMatchesFabric — unia: rodziny z wariantów LUB legacy material", () => {
  const fabricProduct = v([{ name: "Tkanina", values: ["Poso 105"] }]);

  it("match po rodzinie z wariantów", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Poso"], FAMILIES)).toBe(true);
  });

  it("match po legacy material (exact, po trim)", () => {
    expect(productMatchesFabric(null, "sztruks", ["sztruks"], FAMILIES)).toBe(true);
    expect(productMatchesFabric(null, " sztruks ", ["sztruks"], FAMILIES)).toBe(true);
  });

  it("OR wielu wartości: jedna pasująca wystarczy", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Trinity", "Poso"], FAMILIES)).toBe(true);
  });

  it("brak matcha → false (legacy material to exact, nie substring)", () => {
    expect(productMatchesFabric(fabricProduct, null, ["Trinity"], FAMILIES)).toBe(false);
    expect(productMatchesFabric(null, "Monolith + Solar", ["Monolith"], FAMILIES)).toBe(false);
    expect(productMatchesFabric(null, null, ["Poso"], FAMILIES)).toBe(false);
  });

  it("legacy sklejone „Monolith + Solar\" pasuje tylko do dokładnie tej wartości", () => {
    expect(
      productMatchesFabric(null, "Monolith + Solar", ["Monolith + Solar"], FAMILIES)
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom (RED)**

Run: `npx vitest run app/_lib/__tests__/fabric-filter.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/fabric-filter"`.

- [ ] **Step 3: Implementacja**

Utwórz `app/_lib/fabric-filter.ts`:

```ts
// Dopasowanie rodzin tkanin (katalog fabrics) do wartości opcji wariantów —
// zasila filtr „Tkanina" na /sklep. Czyste funkcje (bez importów server-only),
// testowalne w node.
//
// Kontekst: kolumna products.material jest w większości pusta; prawda o
// tkaninach żyje w variants.options (wartości formatu „Rodzina numer", np.
// „Poso 105"; edge case'y: opcja „TKANINA", opcja „Wariant" z combo
// „Monolith 84 + Solar 99"). Dlatego dopasowujemy nazwy rodzin do WSZYSTKICH
// wartości WSZYSTKICH opcji, case-insensitive, na granicach słów.

import type { ProductVariants } from "./types";

// " poso 105 " — separatory (+ , / ) zamienione na spacje, spacje zbite,
// obłożone spacjami z obu stron → test „ rodzina " łapie całe słowa/sekwencje
// („Solaris" nie zawiera „ solar ").
function normalizeValue(value: string): string {
  return (
    " " +
    value
      .toLowerCase()
      .replace(/[+,/]/g, " ")
      .replace(/\s+/g, " ")
      .trim() +
    " "
  );
}

function valueHasFamily(normalizedValue: string, family: string): boolean {
  return normalizedValue.includes(" " + family.toLowerCase() + " ");
}

// Rodziny tkanin występujące w wartościach opcji produktu. Zwraca kanoniczną
// pisownię i kolejność z familyNames (= kolejność katalogu fabrics).
export function deriveFabricFamilies(
  variants: ProductVariants | null | undefined,
  familyNames: string[]
): string[] {
  const options = variants?.options ?? [];
  if (options.length === 0 || familyNames.length === 0) return [];
  const normalized: string[] = [];
  for (const opt of options) {
    for (const value of opt.values) normalized.push(normalizeValue(value));
  }
  return familyNames.filter((family) =>
    normalized.some((nv) => valueHasFamily(nv, family))
  );
}

// Semantyka filtra (spec 2026-07-05): produkt pasuje do wybranej wartości V,
// gdy V jest jego rodziną tkaniny (z wariantów) LUB dokładną wartością
// kolumny material (legacy — unia źródeł, nic nie znika z filtra).
export function productMatchesFabric(
  variants: ProductVariants | null | undefined,
  material: string | null | undefined,
  selected: string[],
  familyNames: string[]
): boolean {
  if (selected.length === 0) return false;
  const families = new Set(deriveFabricFamilies(variants, familyNames));
  const legacy = material?.trim() ?? "";
  return selected.some((s) => families.has(s) || (legacy.length > 0 && s === legacy));
}
```

- [ ] **Step 4: Uruchom (GREEN)**

Run: `npx vitest run app/_lib/__tests__/fabric-filter.test.ts`
Expected: PASS (14 testów). Potem `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-filter.ts app/_lib/__tests__/fabric-filter.test.ts
git commit -m "feat(sklep): czysty moduł dopasowania rodzin tkanin do opcji wariantów"
```

---

### Task 2: `products.ts` — facety z unii źródeł + filtrowanie po id

**Files:**
- Modify: `app/_lib/products.ts` (importy; `getProducts` ~linie 128-129; `getFilterFacets` ~295-348)

**Interfaces:**
- Consumes: `deriveFabricFamilies`, `productMatchesFabric` (Task 1); `getAllFabrics` z `@/app/_lib/fabrics` (już istnieje, cache 300 s, admin client — server-only OK, products.ts już jest server-only); `buildLocalizedFacets` (już importowany? sprawdź importy pliku — jeśli nie, dodaj z `./localize`).
- Produces: `getFilterFacets` zwraca `{ colors, materials }` — kształt BEZ zmian (`materials` niesie teraz tkaniny∪legacy); `getProducts` filtruje `materials` wg nowej semantyki. Nazwy pól `ProductFilters.materials` i `facets.materials` celowo bez zmian (zero churnu u wołających).

- [ ] **Step 1: Dodaj importy**

Na górze `app/_lib/products.ts` dopisz do istniejących importów:

```ts
import { deriveFabricFamilies, productMatchesFabric } from "./fabric-filter";
import { getAllFabrics } from "./fabrics";
```

- [ ] **Step 2: `getProducts` — filtrowanie po id zamiast `.in("material")`**

Zamień (obecnie ~linie 128-129):

```ts
  if (colors?.length) query = query.in("color", colors);
  if (materials?.length) query = query.in("material", materials);
```

na:

```ts
  if (colors?.length) query = query.in("color", colors);

  // Filtr tkanin: wartości pochodzą z rodzin tkanin w opcjach wariantów
  // (katalog fabrics) W UNII z legacy kolumną material — tego nie da się
  // wyrazić w .in() na kolumnie, więc liczymy pasujące id w JS (skala:
  // dziesiątki produktów; RLS i tak ogranicza odczyt do aktywnych) i
  // zawężamy główne zapytanie przez .in("id", ids). Paginacja/sort/AND z
  // pozostałymi filtrami zostają w DB.
  if (materials?.length) {
    const [{ data: fabricRows }, fabrics] = await Promise.all([
      supabase.from("products").select("id, variants, material"),
      getAllFabrics(),
    ]);
    const familyNames = fabrics.map((f) => f.name);
    const ids = (
      (fabricRows ?? []) as {
        id: string;
        variants: Product["variants"];
        material: string | null;
      }[]
    )
      .filter((r) => productMatchesFabric(r.variants, r.material, materials, familyNames))
      .map((r) => r.id);
    if (ids.length === 0) {
      return { products: [], total: 0, pages: 0 };
    }
    query = query.in("id", ids);
  }
```

Zaktualizuj też komentarz pola w `ProductFilters` (~linia 42): `materials?: string[];` → dopisz nad nim:

```ts
  // Filtr tkanin (?tkanina=). Wartości: rodziny tkanin z katalogu fabrics
  // (dopasowywane do opcji wariantów) ∪ legacy wartości kolumny material.
```

- [ ] **Step 3: `getFilterFacets` — facety tkanin ∪ legacy**

Zamień ciało pobierania i budowy `materials` (obecnie ~linie 316-345 — blok `Promise.all` z dwoma zapytaniami oraz budowa `colors`/`materials`):

```ts
  const [
    { data: colorsData },
    { data: materialsData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("color, color_de")
      .not("color", "is", null),
    supabase
      .from("products")
      .select("material, material_de")
      .not("material", "is", null),
  ]);

  const colors = buildLocalizedFacets(
    ((colorsData ?? []) as { color: string | null; color_de: string | null }[]).map(
      (r) => ({ value: r.color, value_de: r.color_de })
    ),
    locale
  );

  const materials = buildLocalizedFacets(
    (
      (materialsData ?? []) as {
        material: string | null;
        material_de: string | null;
      }[]
    ).map((r) => ({ value: r.material, value_de: r.material_de })),
    locale
  );

  return { colors, materials };
```

na:

```ts
  const [
    { data: colorsData },
    { data: fabricSourceData },
    fabrics,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("color, color_de")
      .not("color", "is", null),
    // Źródła facetu tkanin: opcje wariantów (rodziny) + legacy kolumna material.
    supabase.from("products").select("variants, material, material_de"),
    getAllFabrics(),
  ]);

  const colors = buildLocalizedFacets(
    ((colorsData ?? []) as { color: string | null; color_de: string | null }[]).map(
      (r) => ({ value: r.color, value_de: r.color_de })
    ),
    locale
  );

  // Facet „Tkanina" = rodziny tkanin UŻYTE w widocznych produktach (value =
  // nazwa PL z katalogu, label DE = fabrics.name_de) ∪ legacy wartości kolumny
  // material (label DE = material_de). Dedupe po PL value robi
  // buildLocalizedFacets (rodzina z name_de wygrywa etykietę nad legacy).
  const fabricRows = (fabricSourceData ?? []) as {
    variants: Product["variants"];
    material: string | null;
    material_de: string | null;
  }[];
  const familyNames = fabrics.map((f) => f.name);
  const usedFamilies = new Set<string>();
  for (const row of fabricRows) {
    for (const fam of deriveFabricFamilies(row.variants, familyNames)) {
      usedFamilies.add(fam);
    }
  }
  const materials = buildLocalizedFacets(
    [
      ...fabrics
        .filter((f) => usedFamilies.has(f.name))
        .map((f) => ({ value: f.name, value_de: f.name_de })),
      ...fabricRows
        .filter((r) => r.material)
        .map((r) => ({ value: r.material, value_de: r.material_de })),
    ],
    locale
  );

  return { colors, materials };
```

Zaktualizuj komentarz nad `getFilterFacets` (~295-296): „Pobiera unikalne wartości color/material…" → „Pobiera unikalne wartości color + facet tkanin (rodziny z opcji wariantów × katalog fabrics ∪ legacy material)…" (reszta komentarza o nie-kaskadowaniu zostaje).

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` → exit 0 (jeśli błędy `.next/dev/types` → `rm -rf .next`).
Run: `npx vitest run` → wszystkie zielone (zmiana nie dotyka testowanych czystych funkcji).
Uwaga typów: `Fabric.name_de` jest `string | null` — `buildLocalizedFacets` przyjmuje `value_de: string | null | undefined`, pasuje bez castów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/products.ts
git commit -m "feat(sklep): facety i filtr tkanin z opcji wariantów ∪ legacy material"
```

---

### Task 3: Param `tkanina` + słownik (PL „Tkanina" / DE „Stoff")

**Files:**
- Modify: `app/sklep/page.tsx` (~51, 82, 134)
- Modify: `app/_components/ui/FilterBar.tsx` (~66, 371, 477)
- Modify: `app/_lib/dictionaries/pl.ts` (~462), `app/_lib/dictionaries/de.ts` (~179)

**Interfaces:** brak nowych — czysta zamiana nazwy parametru i wartości słownika. Klucz słownika `filter.material` ZOSTAJE (zero churnu typu słownika); zmieniają się tylko wartości.

- [ ] **Step 1: `app/sklep/page.tsx`**

Linia ~51: `  material?: string;` → `  tkanina?: string;`
Linia ~82: `const materials = sp.material?.split(",").filter(Boolean);` → `const materials = sp.tkanina?.split(",").filter(Boolean);`
Linia ~134: `if (sp.material) rawParams.material = sp.material;` → `if (sp.tkanina) rawParams.tkanina = sp.tkanina;`

- [ ] **Step 2: `app/_components/ui/FilterBar.tsx`**

Linia ~66: `const selectedMaterials = (searchParams.get("material") ?? "").split(",").filter(Boolean);` → `const selectedMaterials = (searchParams.get("tkanina") ?? "").split(",").filter(Boolean);`
Linia ~371: `onClick={() => toggleMulti("material", selectedMaterials, m.value)}` → `onClick={() => toggleMulti("tkanina", selectedMaterials, m.value)}`
Linia ~477: `onRemove={() => toggleMulti("material", selectedMaterials, m)}` → `onRemove={() => toggleMulti("tkanina", selectedMaterials, m)}`
(Wewnętrzny stan dropdownu `openDropdown === "material"` i klucze Reacta `material-${m}` to NIE URL — zostają.)

- [ ] **Step 3: Słowniki**

`app/_lib/dictionaries/pl.ts` linia ~462: `    material: "Materiał",` → `    material: "Tkanina",`
`app/_lib/dictionaries/de.ts` linia ~179: `    material: "Material",` → `    material: "Stoff",`
(`product.specMaterial` w OBU plikach bez zmian — decyzja ze specu.)

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → wszystkie zielone (w tym test parytetu PL/DE słowników — struktura kluczy bez zmian).
Run: `npx eslint app/sklep/page.tsx app/_components/ui/FilterBar.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/sklep/page.tsx app/_components/ui/FilterBar.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(sklep): filtr Tkanina/Stoff + param URL tkanina zamiast material"
```

---

### Task 4: Weryfikacja końcowa + smoke na dev

**Files:** brak nowych (ew. poprawki lintu).

- [ ] **Step 1: Pełna weryfikacja statyczna**

```bash
npx tsc --noEmit
npx eslint app/_lib/fabric-filter.ts app/_lib/__tests__/fabric-filter.test.ts app/_lib/products.ts app/sklep/page.tsx app/_components/ui/FilterBar.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
npm test
npm run build
```
Expected: wszystko exit 0 / zielone.

- [ ] **Step 2: Smoke na dev serverze (curl — bez logowania)**

```bash
npx next dev -p 3210   # w tle
# PL: filtr po tkaninie z wariantów (wcześniej NIEMOŻLIWE):
curl -s "http://localhost:3210/sklep?tkanina=Poso" | grep -c "VEGAS"          # oczekiwane: >0
# PL: legacy wartość kolumny material nadal działa:
curl -s "http://localhost:3210/sklep?tkanina=sztruks" | grep -ci "poso"       # oczekiwane: >0 (produkt VEGAS MINI w POSO)
# PL: nagłówek filtra:
curl -s "http://localhost:3210/sklep" | grep -c "Tkanina"                     # oczekiwane: >0
# DE: etykieta Stoff + filtr działa na /de:
curl -s "http://localhost:3210/de/sklep" | grep -c "Stoff"                    # oczekiwane: >0
curl -s "http://localhost:3210/de/sklep?tkanina=Poso" | grep -c "VEGAS"       # oczekiwane: >0
# Wartość bez trafień → strona bez wyników (nie 500):
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3210/sklep?tkanina=Nieistnieje"  # oczekiwane: 200
```
Po smoke zatrzymać dev server.

- [ ] **Step 3: Commit (jeśli były poprawki)**

```bash
git add -A && git commit -m "chore(sklep): poprawki po weryfikacji filtra tkanin"
```

---

## Self-Review

**Spec coverage:** semantyka unii (Task 1 `productMatchesFabric` + Task 2 filtr) ✓; facety rodziny∪legacy z etykietami DE (Task 2) ✓; granice słów/TKANINA/Wariant/combo (Task 1 testy) ✓; tylko rodziny UŻYTE (Task 2 `usedFamilies`) ✓; param `tkanina` + słownik PL/DE, specMaterial nietknięty (Task 3) ✓; zero migracji ✓; smoke PL+DE (Task 4) ✓.

**Placeholder scan:** brak TBD/TODO; każdy krok kodowy ma pełny kod; komendy z oczekiwanym wynikiem.

**Type consistency:** `deriveFabricFamilies(variants, familyNames)` i `productMatchesFabric(variants, material, selected, familyNames)` — sygnatury zgodne między Task 1 (definicja+testy) a Task 2 (użycie). `Product["variants"]` = `ProductVariants | null` zgodne z parametrem `ProductVariants | null | undefined`. `buildLocalizedFacets` przyjmuje `{value: string|null, value_de: string|null|undefined}` — wejścia z Task 2 pasują (w gałęzi legacy `r.material` po `.filter((r) => r.material)` jest niepusty, typ `string|null` akceptowany). Kształt zwrotki `getProducts` przy pustych ids `{ products: [], total: 0, pages: 0 }` = kształt normalnej ścieżki.
