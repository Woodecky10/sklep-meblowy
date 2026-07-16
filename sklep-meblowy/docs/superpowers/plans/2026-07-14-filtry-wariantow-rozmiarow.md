# Filtry wariantów i rozmiarów (krok A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient na /sklep filtruje produkty po opcjach wariantów zaznaczonych przez admina („Filtr w sklepie") oraz po zakresach wymiarów w cm; admin włącza filtr jednym checkboxem przy opcji w edytorze produktu.

**Architecture:** Czyste funkcje w nowym `app/_lib/option-filter.ts` (wzorzec `fabric-filter.ts`): normalizacja nazw opcji, agregacja facetów, dopasowanie produktów, parsowanie paramów. Integracja w `products.ts` (facety w istniejącym `unstable_cache` tag `facets`; filtrowanie w JS → `.in("id", ids)` jak filtr tkaniny). UI w `FilterBar` (dynamiczne pille + panel „Wymiary"), checkbox w `VariantsEditor`. Zero migracji — flaga `filterable` żyje w JSONB `products.variants`.

**Tech Stack:** Next.js (⚠️ NIETYPOWA wersja — patrz Global Constraints), TypeScript, Supabase (PostgREST), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-rozbudowa-strony-filtry-design.md` (sekcja „Krok A").

## Global Constraints

- **Next.js z breaking changes** (AGENTS.md): przed pisaniem kodu dotykającego API Next przeczytaj odpowiedni guide w `node_modules/next/dist/docs/`. Nie zakładaj konwencji z treningu.
- **Gotcha Turbopack:** w plikach `"use server"` NIE wolno `export type` — typy importuj ze źródła (tu: `option-filter.ts` i `types.ts` NIE są plikami akcji, więc eksportują typy normalnie; `app/admin/produkty/actions.ts` eksportuje tylko async funkcje).
- **Baza = PROD.** localhost używa żywej bazy Supabase. Testy jednostkowe są czyste (bez DB). Ręczna weryfikacja na żywych danych: każdą mutację (checkbox na produkcie) cofnij po teście.
- **Nazwy PL w URL** (konwencja repo): parametry `opcja_<slug>`, `szer_od/szer_do`, `gl_od/gl_do`, `wys_od/wys_do`.
- **i18n:** każda etykieta UI przez słowniki `pl.ts`/`de.ts` (test paritetu PL↔DE pilnuje kompletu kluczy). Facety: DE z map `VARIANT_OPTION_DE`/`VARIANT_VALUE_DE`, fallback PL.
- **Opcja „Tkanina" wykluczona** z generycznych filtrów — ma dedykowany filtr rodzin (`fabric-filter.ts`), który zostaje bez zmian.
- Komendy: testy `npx vitest run <plik>` / całość `npm test`; typy `npx tsc --noEmit`; build `npm run build`; e2e `npm run test:e2e`.
- Branch: `feat/filtry-wariantow-rozmiary` od `main`.

---

### Task 1: Normalizacja nazw opcji + slug parametru + flaga `filterable` (TDD)

**Files:**
- Modify: `app/_lib/types.ts:20-24` (typ `ProductOption`)
- Create: `app/_lib/option-filter.ts`
- Test: `app/_lib/__tests__/option-filter.test.ts`

**Interfaces:**
- Consumes: `ProductOption` z `app/_lib/types.ts`
- Produces: `normalizeOptionName(name: string): string`, `displayOptionName(name: string): string`, `optionParamSlug(name: string): string`, `OPTION_PARAM_PREFIX = "opcja_"`, `EXCLUDED_OPTION_SLUGS: Set<string>`; `ProductOption.filterable?: boolean`

- [ ] **Step 0: Utwórz branch**

```bash
git checkout main && git pull && git checkout -b feat/filtry-wariantow-rozmiary
```

- [ ] **Step 1: Napisz failing test**

Utwórz `app/_lib/__tests__/option-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeOptionName,
  displayOptionName,
  optionParamSlug,
  OPTION_PARAM_PREFIX,
  EXCLUDED_OPTION_SLUGS,
} from "@/app/_lib/option-filter";

describe("normalizeOptionName", () => {
  it("trimuje, zbija spacje i lowercase'uje", () => {
    expect(normalizeOptionName("  POWIERZCHNIA   SPANIA ")).toBe(
      "powierzchnia spania"
    );
  });
  it("ROZMIAR i Rozmiar dają ten sam klucz", () => {
    expect(normalizeOptionName("ROZMIAR")).toBe(normalizeOptionName("Rozmiar"));
  });
});

describe("displayOptionName", () => {
  it("pierwsza litera wielka, reszta mała", () => {
    expect(displayOptionName("ROZMIAR")).toBe("Rozmiar");
    expect(displayOptionName("powierzchnia spania")).toBe("Powierzchnia spania");
  });
  it("pusty string zostaje pusty", () => {
    expect(displayOptionName("   ")).toBe("");
  });
});

describe("optionParamSlug", () => {
  it("zdejmuje polskie znaki i robi kebab-case", () => {
    expect(optionParamSlug("STELAŻ")).toBe("stelaz");
    expect(optionParamSlug("POWIERZCHNIA SPANIA")).toBe("powierzchnia-spania");
    expect(optionParamSlug("Rozmiar")).toBe("rozmiar");
  });
  it("znaki spoza a-z0-9 zamienia na myślnik bez wiodących/końcowych", () => {
    expect(optionParamSlug(" Kolor / Odcień ")).toBe("kolor-odcien");
  });
  it("nazwa z samych symboli daje pusty slug", () => {
    expect(optionParamSlug("***")).toBe("");
  });
});

describe("stałe", () => {
  it("prefiks parametru i wykluczenie tkaniny", () => {
    expect(OPTION_PARAM_PREFIX).toBe("opcja_");
    expect(EXCLUDED_OPTION_SLUGS.has("tkanina")).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILować**

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/option-filter'` (lub równoważny błąd resolvera).

- [ ] **Step 3: Dodaj flagę do typu ProductOption**

W `app/_lib/types.ts` rozszerz istniejący typ (linie 20-24) o pole `filterable`:

```ts
export type ProductOption = {
  name: string;
  values: string[];
  value_prices?: Record<string, number>;
  // Admin zaznaczył „Filtr w sklepie" — opcja pojawia się jako filtr na /sklep
  // (facety liczone w getFacetSource). Brak/false = opcja nie filtruje.
  filterable?: boolean;
};
```

- [ ] **Step 4: Utwórz `app/_lib/option-filter.ts` z funkcjami normalizacji**

```ts
// Filtry opcji wariantów (?opcja_<slug>=w1,w2) i wymiarów (?szer_od= itd.)
// na /sklep. Czyste funkcje (bez importów server-only), testowalne w node —
// wzorzec fabric-filter.ts. Nazwy opcji to wolne stringi admina z mieszanym
// casingiem (ROZMIAR/Rozmiar), więc grupujemy po znormalizowanej nazwie.

export const OPTION_PARAM_PREFIX = "opcja_";

// „Tkanina" ma dedykowany filtr rodzin tkanin (fabric-filter.ts) — nie
// dublujemy jej w generycznych filtrach opcji.
export const EXCLUDED_OPTION_SLUGS: Set<string> = new Set(["tkanina"]);

// "  POWIERZCHNIA   SPANIA " → "powierzchnia spania" (klucz grupowania).
export function normalizeOptionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Wyświetlana forma grupy: "ROZMIAR" → "Rozmiar".
export function displayOptionName(name: string): string {
  const n = normalizeOptionName(name);
  return n.length === 0 ? n : n[0].toUpperCase() + n.slice(1);
}

// Slug do parametru URL: bez polskich znaków, tylko [a-z0-9-].
// "STELAŻ" → "stelaz", "POWIERZCHNIA SPANIA" → "powierzchnia-spania".
// ł nie rozkłada się przez NFD (to nie litera+znak diakrytyczny) — ręcznie.
export function optionParamSlug(name: string): string {
  return normalizeOptionName(name)
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 5: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`
Expected: PASS (wszystkie describe'y).

- [ ] **Step 6: Commit**

```bash
git add app/_lib/types.ts app/_lib/option-filter.ts app/_lib/__tests__/option-filter.test.ts
git commit -m "feat(filtry): flaga filterable opcji + normalizacja nazw i slug parametru (TDD)"
```

---

### Task 2: Agregacja i lokalizacja facetów opcji (TDD)

**Files:**
- Modify: `app/_lib/option-filter.ts`
- Test: `app/_lib/__tests__/option-filter.test.ts`

**Interfaces:**
- Consumes: `normalizeOptionName`/`displayOptionName`/`optionParamSlug` (Task 1), `ProductVariants` z `types.ts`, `VARIANT_OPTION_DE`/`VARIANT_VALUE_DE` z `app/_lib/de-content-maps.ts`, `Locale` z `app/_lib/i18n`
- Produces:
  - `type OptionFacetValue = { value: string; label: string; label_de: string | null }`
  - `type OptionFacetGroup = { slug: string; name: string; name_de: string | null; values: OptionFacetValue[] }`
  - `collectOptionFacets(rows: { variants: ProductVariants | null }[]): OptionFacetGroup[]`
  - `type LocalizedOptionFacet = { slug: string; label: string; values: { value: string; label: string }[] }`
  - `localizeOptionFacets(groups: OptionFacetGroup[], locale: Locale): LocalizedOptionFacet[]`

- [ ] **Step 1: Dopisz failing testy do `option-filter.test.ts`**

```ts
import {
  collectOptionFacets,
  localizeOptionFacets,
} from "@/app/_lib/option-filter";
import type { ProductVariants } from "@/app/_lib/types";

const v = (options: ProductVariants["options"], overrides?: ProductVariants["overrides"]): ProductVariants => ({
  options,
  ...(overrides ? { overrides } : {}),
});

describe("collectOptionFacets", () => {
  it("zbiera tylko opcje filterable=true", () => {
    const rows = [
      { variants: v([{ name: "Rozmiar", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "Stelaż", values: ["Drewniany"] }]) },
    ];
    const groups = collectOptionFacets(rows);
    expect(groups.map((g) => g.slug)).toEqual(["rozmiar"]);
  });

  it("scala ROZMIAR i Rozmiar w jedną grupę z unią wartości", () => {
    const rows = [
      { variants: v([{ name: "ROZMIAR", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "Rozmiar", values: ["160x200"], filterable: true }]) },
    ];
    const groups = collectOptionFacets(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Rozmiar");
    expect(groups[0].values.map((x) => x.value)).toEqual(["140x200", "160x200"]);
  });

  it("pomija Tkaninę, puste slugi i produkty bez wariantów", () => {
    const rows = [
      { variants: v([{ name: "Tkanina", values: ["Poso 105"], filterable: true }]) },
      { variants: v([{ name: "***", values: ["x"], filterable: true }]) },
      { variants: null },
    ];
    expect(collectOptionFacets(rows)).toEqual([]);
  });

  it("bierze DE nazwy opcji z VARIANT_OPTION_DE (dowolny casing w grupie)", () => {
    const rows = [
      { variants: v([{ name: "Rozmiar", values: ["140x200"], filterable: true }]) },
      { variants: v([{ name: "ROZMIAR", values: ["160x200"], filterable: true }]) },
    ];
    // "Rozmiar" nie ma wpisu w mapie, "ROZMIAR" → "GRÖSSE" → display "Größe"
    expect(collectOptionFacets(rows)[0].name_de).toBe("Größe");
  });

  it("etykieta wartości: override admina wygrywa, DE z VARIANT_VALUE_DE", () => {
    const rows = [
      {
        variants: v(
          [{ name: "Stelaż", values: ["DREWNIANY"], filterable: true }],
          { value_labels: { Stelaż: { DREWNIANY: "Drewniany" } } }
        ),
      },
    ];
    const [g] = collectOptionFacets(rows);
    expect(g.values[0]).toEqual({
      value: "DREWNIANY",
      label: "Drewniany",
      label_de: "HOLZ",
    });
  });

  it("sortuje wartości naturalnie (numeric) po etykiecie", () => {
    const rows = [
      {
        variants: v([
          { name: "Rozmiar", values: ["160x200", "90x200", "140x200"], filterable: true },
        ]),
      },
    ];
    expect(collectOptionFacets(rows)[0].values.map((x) => x.value)).toEqual([
      "90x200",
      "140x200",
      "160x200",
    ]);
  });
});

describe("localizeOptionFacets", () => {
  const groups = [
    {
      slug: "rozmiar",
      name: "Rozmiar",
      name_de: "Größe",
      values: [
        { value: "DREWNIANY", label: "Drewniany", label_de: "HOLZ" },
        { value: "140x200", label: "140x200", label_de: null },
      ],
    },
  ];
  it("PL: name + label", () => {
    const [g] = localizeOptionFacets(groups, "pl");
    expect(g.label).toBe("Rozmiar");
    expect(g.values).toEqual([
      { value: "DREWNIANY", label: "Drewniany" },
      { value: "140x200", label: "140x200" },
    ]);
  });
  it("DE: name_de/label_de z fallbackiem PL", () => {
    const [g] = localizeOptionFacets(groups, "de");
    expect(g.label).toBe("Größe");
    expect(g.values).toEqual([
      { value: "DREWNIANY", label: "HOLZ" },
      { value: "140x200", label: "140x200" },
    ]);
  });
});
```

- [ ] **Step 2: Uruchom test — nowe describe'y FAILują**

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`
Expected: FAIL — brak eksportów `collectOptionFacets`/`localizeOptionFacets`.

- [ ] **Step 3: Implementacja w `option-filter.ts`**

Dopisz importy na górze pliku i funkcje:

```ts
import type { ProductVariants } from "./types";
import { VARIANT_OPTION_DE, VARIANT_VALUE_DE } from "./de-content-maps";
import type { Locale } from "./i18n";

export type OptionFacetValue = {
  value: string; // surowa wartość — niesie URL i dopasowanie
  label: string; // etykieta PL (override admina lub surowa wartość)
  label_de: string | null; // tłumaczenie DE lub null → fallback PL
};

export type OptionFacetGroup = {
  slug: string; // część parametru: ?opcja_<slug>=
  name: string; // wyświetlana nazwa PL, np. "Rozmiar"
  name_de: string | null;
  values: OptionFacetValue[];
};

// Agreguje opcje filterable=true z produktów w grupy facetów. Grupowanie po
// slugu znormalizowanej nazwy (ROZMIAR ∪ Rozmiar). Etykieta wartości: pierwszy
// napotkany override admina (value_labels) wygrywa nad surową wartością.
export function collectOptionFacets(
  rows: { variants: ProductVariants | null }[]
): OptionFacetGroup[] {
  const groups = new Map<
    string,
    { name: string; name_de: string | null; values: Map<string, OptionFacetValue> }
  >();
  for (const row of rows) {
    for (const opt of row.variants?.options ?? []) {
      if (opt.filterable !== true) continue;
      const slug = optionParamSlug(opt.name);
      if (slug.length === 0 || EXCLUDED_OPTION_SLUGS.has(slug)) continue;
      let group = groups.get(slug);
      if (!group) {
        group = { name: displayOptionName(opt.name), name_de: null, values: new Map() };
        groups.set(slug, group);
      }
      if (group.name_de === null) {
        const de = VARIANT_OPTION_DE[opt.name.trim()];
        if (de) group.name_de = displayOptionName(de);
      }
      const overrides = row.variants?.overrides?.value_labels?.[opt.name];
      for (const raw of opt.values) {
        const value = raw.trim();
        if (value.length === 0 || group.values.has(value)) continue;
        group.values.set(value, {
          value,
          label: overrides?.[raw] ?? value,
          label_de: VARIANT_VALUE_DE[value] ?? null,
        });
      }
    }
  }
  return [...groups.entries()]
    .map(([slug, g]) => ({
      slug,
      name: g.name,
      name_de: g.name_de,
      values: [...g.values.values()].sort((a, b) =>
        a.label.localeCompare(b.label, "pl", { numeric: true })
      ),
    }))
    // Grupa bez ani jednej niepustej wartości nie renderuje pustej piguły.
    .filter((g) => g.values.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export type LocalizedOptionFacet = {
  slug: string;
  label: string;
  values: { value: string; label: string }[];
};

// Projekcja grup na locale — value zostaje PL/surowe (niesie URL i filtr),
// label DE z fallbackiem PL. Wzorzec buildLocalizedFacets (localize.ts).
export function localizeOptionFacets(
  groups: OptionFacetGroup[],
  locale: Locale
): LocalizedOptionFacet[] {
  const de = locale === "de";
  return groups.map((g) => ({
    slug: g.slug,
    label: de && g.name_de ? g.name_de : g.name,
    values: g.values.map((v) => ({
      value: v.value,
      label: de && v.label_de ? v.label_de : v.label,
    })),
  }));
}
```

⚠️ Sprawdź, że `de-content-maps.ts` nie ma importów server-only (ma nie mieć — używa go czysty `variants.ts`). Jeśli test wywali się na imporcie, zatrzymaj się i zbadaj.

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/option-filter.ts app/_lib/__tests__/option-filter.test.ts
git commit -m "feat(filtry): agregacja i lokalizacja facetow opcji wariantow (TDD)"
```

---

### Task 3: Dopasowanie produktów (opcje + wymiary) i parsowanie parametrów (TDD)

**Files:**
- Modify: `app/_lib/option-filter.ts`
- Test: `app/_lib/__tests__/option-filter.test.ts`

**Interfaces:**
- Consumes: `optionParamSlug`, `OPTION_PARAM_PREFIX` (Task 1), `ProductDimensions` z `types.ts`
- Produces:
  - `productMatchesOptionFilters(variants: ProductVariants | null | undefined, selected: Record<string, string[]>): boolean`
  - `type DimensionRanges = { widthMin?: number; widthMax?: number; depthMin?: number; depthMax?: number; heightMin?: number; heightMax?: number }`
  - `hasActiveDimensionRanges(ranges: DimensionRanges): boolean`
  - `productMatchesDimensions(dimensions: ProductDimensions | null | undefined, ranges: DimensionRanges): boolean`
  - `type DimensionBounds = { width: { min: number; max: number } | null; depth: {...} | null; height: {...} | null }`
  - `collectDimensionBounds(rows: { dimensions: ProductDimensions | null }[]): DimensionBounds`
  - `parseOptionFilterParams(sp: Record<string, string | string[] | undefined>): Record<string, string[]>`

- [ ] **Step 1: Dopisz failing testy**

```ts
import {
  productMatchesOptionFilters,
  productMatchesDimensions,
  hasActiveDimensionRanges,
  collectDimensionBounds,
  parseOptionFilterParams,
} from "@/app/_lib/option-filter";

describe("productMatchesOptionFilters", () => {
  const variants = v([
    { name: "ROZMIAR", values: ["140x200", "160x200"] },
    { name: "Stelaż", values: ["Drewniany"] },
  ]);
  it("OR wewnątrz grupy — jedna z wybranych wartości wystarczy", () => {
    expect(
      productMatchesOptionFilters(variants, { rozmiar: ["90x200", "140x200"] })
    ).toBe(true);
  });
  it("AND między grupami — każda grupa musi pasować", () => {
    expect(
      productMatchesOptionFilters(variants, {
        rozmiar: ["140x200"],
        stelaz: ["Metalowy"],
      })
    ).toBe(false);
  });
  it("produkt bez danej opcji odpada", () => {
    expect(productMatchesOptionFilters(variants, { kolor: ["Szary"] })).toBe(false);
    expect(productMatchesOptionFilters(null, { rozmiar: ["140x200"] })).toBe(false);
  });
  it("dopasowuje niezależnie od flagi filterable (facet i tak nie pokaże niewłączonych)", () => {
    // variants wyżej nie mają filterable — mimo to wartości dopasowują
    expect(productMatchesOptionFilters(variants, { rozmiar: ["140x200"] })).toBe(true);
  });
  it("pusty wybór = brak filtra", () => {
    expect(productMatchesOptionFilters(null, {})).toBe(true);
    expect(productMatchesOptionFilters(variants, { rozmiar: [] })).toBe(true);
  });
});

describe("wymiary", () => {
  it("hasActiveDimensionRanges wykrywa dowolną granicę", () => {
    expect(hasActiveDimensionRanges({})).toBe(false);
    expect(hasActiveDimensionRanges({ widthMax: 220 })).toBe(true);
  });
  it("dopasowanie zakresów per wymiar", () => {
    const dims = { width: 200, depth: 90, height: 85 };
    expect(productMatchesDimensions(dims, { widthMin: 180, widthMax: 220 })).toBe(true);
    expect(productMatchesDimensions(dims, { widthMax: 190 })).toBe(false);
    expect(productMatchesDimensions(dims, { depthMin: 100 })).toBe(false);
  });
  it("produkt bez wymiarów odpada przy aktywnym zakresie, przechodzi bez", () => {
    expect(productMatchesDimensions(null, { widthMin: 100 })).toBe(false);
    expect(productMatchesDimensions(null, {})).toBe(true);
  });
  it("collectDimensionBounds liczy min/max, ignoruje braki i zera", () => {
    const rows = [
      { dimensions: { width: 200, depth: 90, height: 85 } },
      { dimensions: { width: 140, depth: 200, height: 40 } },
      { dimensions: null },
    ];
    expect(collectDimensionBounds(rows)).toEqual({
      width: { min: 140, max: 200 },
      depth: { min: 90, max: 200 },
      height: { min: 40, max: 85 },
    });
    expect(collectDimensionBounds([{ dimensions: null }])).toEqual({
      width: null,
      depth: null,
      height: null,
    });
  });
});

describe("parseOptionFilterParams", () => {
  it("wyciąga opcja_* z CSV, ignoruje resztę i złe slugi", () => {
    expect(
      parseOptionFilterParams({
        opcja_rozmiar: "140x200,160x200",
        opcja_stelaz: "Drewniany",
        "opcja_ZŁY SLUG": "x",
        opcja_pusta: "",
        kolor: "Szary",
      })
    ).toEqual({
      rozmiar: ["140x200", "160x200"],
      stelaz: ["Drewniany"],
    });
  });
  it("tablicę parametrów redukuje do pierwszej wartości", () => {
    expect(parseOptionFilterParams({ opcja_rozmiar: ["140x200", "90x200"] })).toEqual({
      rozmiar: ["140x200"],
    });
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL** (brak eksportów)

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`

- [ ] **Step 3: Implementacja w `option-filter.ts`**

Dopisz import typu na górze (rozszerz istniejący import z `./types`):

```ts
import type { ProductVariants, ProductDimensions } from "./types";
```

oraz funkcje:

```ts
// selected: slug → wybrane wartości. Produkt pasuje, gdy dla KAŻDEJ grupy ma
// opcję o tym slugu z ≥1 wybraną wartością (OR w grupie, AND między grupami —
// jak kolor × tkanina). Flaga filterable NIE wpływa na dopasowanie (facety
// i tak nie pokażą niewłączonych filtrów); brak opcji = brak dopasowania
// (spójnie z filtrem tkaniny).
export function productMatchesOptionFilters(
  variants: ProductVariants | null | undefined,
  selected: Record<string, string[]>
): boolean {
  for (const [slug, wanted] of Object.entries(selected)) {
    if (wanted.length === 0) continue;
    const values = new Set<string>();
    for (const opt of variants?.options ?? []) {
      if (optionParamSlug(opt.name) !== slug) continue;
      for (const value of opt.values) values.add(value.trim());
    }
    if (!wanted.some((w) => values.has(w))) return false;
  }
  return true;
}

export type DimensionRanges = {
  widthMin?: number;
  widthMax?: number;
  depthMin?: number;
  depthMax?: number;
  heightMin?: number;
  heightMax?: number;
};

export function hasActiveDimensionRanges(ranges: DimensionRanges): boolean {
  return Object.values(ranges).some((v) => typeof v === "number");
}

// Produkt bez wymiarów odpada przy aktywnym zakresie (brak danych = brak
// dopasowania, jak tkanina). Uszkodzone/częściowe dane z JSONB traktujemy
// jak brak wymiaru.
export function productMatchesDimensions(
  dimensions: ProductDimensions | null | undefined,
  ranges: DimensionRanges
): boolean {
  if (!hasActiveDimensionRanges(ranges)) return true;
  if (!dimensions) return false;
  const checks: [number | undefined, number | undefined, unknown][] = [
    [ranges.widthMin, ranges.widthMax, dimensions.width],
    [ranges.depthMin, ranges.depthMax, dimensions.depth],
    [ranges.heightMin, ranges.heightMax, dimensions.height],
  ];
  for (const [min, max, actual] of checks) {
    const bounded = typeof min === "number" || typeof max === "number";
    if (!bounded) continue;
    if (typeof actual !== "number" || !Number.isFinite(actual)) return false;
    if (typeof min === "number" && actual < min) return false;
    if (typeof max === "number" && actual > max) return false;
  }
  return true;
}

export type DimensionBounds = {
  width: { min: number; max: number } | null;
  depth: { min: number; max: number } | null;
  height: { min: number; max: number } | null;
};

// Min/max wymiarów aktywnych produktów — granice-podpowiedzi pól zakresu
// w FilterBarze. null = żaden produkt nie ma tego wymiaru.
export function collectDimensionBounds(
  rows: { dimensions: ProductDimensions | null }[]
): DimensionBounds {
  const acc: DimensionBounds = { width: null, depth: null, height: null };
  for (const row of rows) {
    for (const key of ["width", "depth", "height"] as const) {
      const v = row.dimensions?.[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      const cur = acc[key];
      acc[key] = cur
        ? { min: Math.min(cur.min, v), max: Math.max(cur.max, v) }
        : { min: v, max: v };
    }
  }
  return acc;
}

// Parsuje searchParams strony: ?opcja_<slug>=w1,w2 → { slug: [w1, w2] }.
// Niepoprawne slugi/puste wartości ignorowane — żaden URL nie wywoła błędu.
export function parseOptionFilterParams(
  sp: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(sp)) {
    if (!key.startsWith(OPTION_PARAM_PREFIX)) continue;
    const slug = key.slice(OPTION_PARAM_PREFIX.length);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const values = (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) out[slug] = values;
  }
  return out;
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/option-filter.test.ts`

- [ ] **Step 5: Commit**

```bash
git add app/_lib/option-filter.ts app/_lib/__tests__/option-filter.test.ts
git commit -m "feat(filtry): dopasowanie opcji i wymiarow + parser paramow (TDD)"
```

---

### Task 4: Integracja z `products.ts` — filtry w getProducts + facety w cache

**Files:**
- Modify: `app/_lib/products.ts` (typ `ProductFilters` ~linia 31; blok tkanin w `getProducts` ~linie 138-164; `getFacetSource` ~linie 378-436; `getFilterFacets` ~linie 442-448)

**Interfaces:**
- Consumes: wszystkie funkcje/typy z `option-filter.ts` (Taski 1-3)
- Produces:
  - `ProductFilters.optionFilters?: Record<string, string[]>` i `ProductFilters.dimensionRanges?: DimensionRanges`
  - `getFilterFacets(locale)` zwraca dodatkowo `options: LocalizedOptionFacet[]` i `dimensions: DimensionBounds`

- [ ] **Step 1: Import i rozszerzenie ProductFilters**

Na górze `products.ts` dodaj:

```ts
import {
  productMatchesOptionFilters,
  productMatchesDimensions,
  hasActiveDimensionRanges,
  collectOptionFacets,
  collectDimensionBounds,
  localizeOptionFacets,
  type DimensionRanges,
  type OptionFacetGroup,
  type DimensionBounds,
} from "./option-filter";
```

W typie `ProductFilters` (po polu `materials`) dodaj:

```ts
  // Filtry opcji wariantów (?opcja_<slug>=w1,w2): slug → wybrane wartości.
  // Parsowane w sklep/page.tsx przez parseOptionFilterParams.
  optionFilters?: Record<string, string[]>;
  // Zakresy wymiarów w cm (?szer_od= / ?szer_do= / gl / wys).
  dimensionRanges?: DimensionRanges;
```

- [ ] **Step 2: Rozszerz blok filtrowania JS w getProducts**

W destrukturyzacji `filters` (linie 66-80) dodaj `optionFilters,` i `dimensionRanges,`. Zastąp CAŁY blok `if (materials?.length) { ... }` (linie 144-164) przez:

```ts
  // Filtry liczone w JS (tkanina / opcje wariantów / wymiary) — nie da się ich
  // wyrazić w .in() na kolumnie (prawda żyje w JSONB variants/dimensions), więc
  // liczymy pasujące id w JS (skala: dziesiątki produktów; RLS i tak ogranicza
  // odczyt do aktywnych) i zawężamy główne zapytanie przez .in("id", ids).
  // Paginacja/sort/AND z pozostałymi filtrami zostają w DB.
  const optionFiltersActive = Object.values(optionFilters ?? {}).some(
    (v) => v.length > 0
  );
  const dimensionsActive = hasActiveDimensionRanges(dimensionRanges ?? {});
  if (materials?.length || optionFiltersActive || dimensionsActive) {
    const [{ data: jsFilterRows }, fabrics] = await Promise.all([
      // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym wzroście katalogu PostgREST utnie wiersze i filtr/facety po cichu zgubią produkty — wtedy zdenormalizować rodziny do kolumny.
      supabase.from("products").select("id, variants, material, dimensions"),
      materials?.length ? getAllFabrics() : Promise.resolve([]),
    ]);
    const familyNames = fabrics.map((f) => f.name);
    const ids = (
      (jsFilterRows ?? []) as {
        id: string;
        variants: Product["variants"];
        material: string | null;
        dimensions: Product["dimensions"];
      }[]
    )
      .filter(
        (r) =>
          (!materials?.length ||
            productMatchesFabric(r.variants, r.material, materials, familyNames)) &&
          (!optionFiltersActive ||
            productMatchesOptionFilters(r.variants, optionFilters!)) &&
          (!dimensionsActive ||
            productMatchesDimensions(r.dimensions, dimensionRanges!))
      )
      .map((r) => r.id);
    if (ids.length === 0) {
      return { products: [], total: 0, pages: 0 };
    }
    query = query.in("id", ids);
  }
```

- [ ] **Step 3: Rozszerz getFacetSource o opcje i wymiary**

W `getFacetSource`:
1. W anon-query zmień select z `"variants, material, material_de"` na `"variants, material, material_de, dimensions"`.
2. Rozszerz typ `fabricRows` o `dimensions: Product["dimensions"];`.
3. Rozszerz anotację zwrotki `unstable_cache` i return:

```ts
  async (): Promise<{
    colorRows: { value: string | null; value_de: string | null }[];
    fabricFacetRows: { value: string | null; value_de: string | null }[];
    optionGroups: OptionFacetGroup[];
    dimensionBounds: DimensionBounds;
  }> => {
```

a przed `return` dodaj:

```ts
    // Facety opcji wariantów (filterable=true) + granice wymiarów — z tych
    // samych wierszy co facet tkanin (jeden skan, ten sam cache).
    const optionGroups = collectOptionFacets(fabricRows);
    const dimensionBounds = collectDimensionBounds(fabricRows);
```

i zwróć `return { colorRows, fabricFacetRows, optionGroups, dimensionBounds };`

4. **Zbump-uj klucz cache** `["facet-source"]` → `["facet-source-v2"]` (stary wpis w cache nie ma nowych pól — świeży klucz zamiast odgadywania kształtu stale'a).

- [ ] **Step 4: Rozszerz getFilterFacets**

```ts
export async function getFilterFacets(locale: Locale = DEFAULT_LOCALE) {
  const { colorRows, fabricFacetRows, optionGroups, dimensionBounds } =
    await getFacetSource();
  return {
    colors: buildLocalizedFacets(colorRows, locale),
    materials: buildLocalizedFacets(fabricFacetRows, locale),
    options: localizeOptionFacets(optionGroups, locale),
    dimensions: dimensionBounds,
  };
}
```

- [ ] **Step 5: Weryfikacja typów i regresji**

Run: `npx tsc --noEmit` — Expected: 0 błędów.
Run: `npm test` — Expected: wszystkie testy PASS (nic istniejącego nie zmienia zachowania: bez nowych filtrów blok JS odpala się tylko przy `materials`, jak dotąd).

- [ ] **Step 6: Commit**

```bash
git add app/_lib/products.ts
git commit -m "feat(filtry): getProducts filtruje po opcjach/wymiarach, facety opcji w cache facet-source-v2"
```

---

### Task 5: Słowniki + UI w FilterBar (pille opcji, panel „Wymiary", chipsy)

**Files:**
- Modify: `app/_lib/dictionaries/pl.ts` (typ `filter` ~linie 160-179; wartości ~linie 470-489)
- Modify: `app/_lib/dictionaries/de.ts` (sekcja `filter` ~linie 171-190)
- Modify: `app/_components/ui/FilterBar.tsx`

**Interfaces:**
- Consumes: klucze słownika `t.filter.*`; parametry URL `opcja_<slug>`, `szer_od`…`wys_do`
- Produces:
  - `export type FilterBarOptionFacet = { slug: string; label: string; values: FilterBarFacet[] }`
  - `export type FilterBarDimensionBounds = { width: { min: number; max: number } | null; depth: { min: number; max: number } | null; height: { min: number; max: number } | null }`
  - Props FilterBar: `optionFacets?: FilterBarOptionFacet[]`, `dimensionBounds?: FilterBarDimensionBounds` (opcjonalne z defaultami — Task 6 je poda)

- [ ] **Step 1: Klucze słownika**

W `pl.ts` w TYPIE sekcji `filter` (po `removeFilter: string;`) dodaj:

```ts
    dimensions: string;
    dimWidth: string;
    dimDepth: string;
    dimHeight: string;
```

W wartościach PL (po `removeFilter: "Usuń filtr",`):

```ts
    dimensions: "Wymiary",
    dimWidth: "Szerokość",
    dimDepth: "Głębokość",
    dimHeight: "Wysokość",
```

W `de.ts` (po `removeFilter: "Filter entfernen",`):

```ts
    dimensions: "Abmessungen",
    dimWidth: "Breite",
    dimDepth: "Tiefe",
    dimHeight: "Höhe",
```

Run: `npm test` — Expected: PASS (w tym test paritetu słowników PL↔DE).

- [ ] **Step 2: FilterBar — typy, propsy, stan**

W `FilterBar.tsx`:

1. Po typie `FilterBarFacet` dodaj:

```ts
// Facet opcji wariantu (?opcja_<slug>=): values jak kolor/tkanina.
export type FilterBarOptionFacet = {
  slug: string;
  label: string;
  values: FilterBarFacet[];
};

export type FilterBarDimensionBounds = {
  width: { min: number; max: number } | null;
  depth: { min: number; max: number } | null;
  height: { min: number; max: number } | null;
};
```

2. Rozszerz `Props` i sygnaturę komponentu:

```ts
type Props = {
  colors: FilterBarFacet[];
  materials: FilterBarFacet[];
  optionFacets?: FilterBarOptionFacet[];
  dimensionBounds?: FilterBarDimensionBounds;
  sections?: FilterBarSection[];
  collections?: FilterBarCollection[];
};

export default function FilterBar({
  colors,
  materials,
  optionFacets = [],
  dimensionBounds,
  sections = [],
  collections = [],
}: Props) {
```

3. Rozszerz `DropdownKey`:

```ts
type DropdownKey =
  | "category"
  | "color"
  | "material"
  | "collection"
  | "price"
  | "sort"
  | "dimensions"
  | `option:${string}`
  | null;
```

4. Na poziomie modułu (nad komponentem, obok typów) dodaj:

```ts
// Parametry URL zakresów wymiarów (cm) — kolejność = kolejność pól w panelu.
const DIM_KEYS = ["szer_od", "szer_do", "gl_od", "gl_do", "wys_od", "wys_do"] as const;
```

5. W komponencie, po `const selectedMaterials = ...` dodaj:

```ts
  // Wybrane wartości per opcja (z URL — jak selectedMaterials).
  const selectedOptions = new Map(
    optionFacets.map((g) => [
      g.slug,
      (effectiveParams.get(`opcja_${g.slug}`) ?? "").split(",").filter(Boolean),
    ])
  );
```

po `const [priceMax, setPriceMax] = ...` dodaj:

```ts
  // Zakresy wymiarów — lokalny stan + debounce, dokładnie jak cena.
  const [dims, setDims] = useState<Record<string, string>>(() =>
    Object.fromEntries(DIM_KEYS.map((k) => [k, searchParams.get(k) ?? ""]))
  );
```

6. Po efekcie debounce ceny (za linią ~159) dodaj bliźniaczy efekt dla wymiarów:

```ts
  // Debounce zakresów wymiarów — bliźniak debounce'a ceny wyżej (uzasadnienie
  // pominiętych deps identyczne).
  const dimsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (dimsDebounceRef.current) clearTimeout(dimsDebounceRef.current);
    dimsDebounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(pendingQuery ?? searchParams.toString());
      let changed = false;
      for (const k of DIM_KEYS) {
        if (dims[k]) params.set(k, dims[k]);
        else params.delete(k);
        if ((searchParams.get(k) ?? "") !== dims[k]) changed = true;
      }
      if (!changed) return;
      params.delete("strona");
      navigate(params);
    }, 500);
    return () => {
      if (dimsDebounceRef.current) clearTimeout(dimsDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, router, searchParams, locale, pendingQuery]);
```

7. Liczniki i czyszczenie — po `const priceCount = ...`:

```ts
  const optionCount = [...selectedOptions.values()].reduce((s, v) => s + v.length, 0);
  const dimsActive = DIM_KEYS.some((k) => dims[k] !== "");
  const hasDimensionBounds = !!(
    dimensionBounds &&
    (dimensionBounds.width || dimensionBounds.depth || dimensionBounds.height)
  );
```

w `totalActiveFilters` dodaj składniki `+ optionCount + (dimsActive ? 1 : 0)`.
W `clearAll()` po `setPriceMax("");` dodaj:

```ts
    setDims(Object.fromEntries(DIM_KEYS.map((k) => [k, ""])));
```

- [ ] **Step 3: FilterBar — pille, panele, chipsy**

1. Po pillu tkaniny (za blokiem `{materials.length > 0 && (...)}`) dodaj:

```tsx
        {optionFacets.map((g) => (
          <FilterPill
            key={g.slug}
            label={g.label}
            count={selectedOptions.get(g.slug)?.length ?? 0}
            open={openDropdown === `option:${g.slug}`}
            onClick={() => toggleDropdown(`option:${g.slug}`)}
          />
        ))}
        {hasDimensionBounds && (
          <FilterPill
            label={t.filter.dimensions}
            count={dimsActive ? 1 : 0}
            open={openDropdown === "dimensions"}
            onClick={() => toggleDropdown("dimensions")}
          />
        )}
```

2. Po panelu `{openDropdown === "material" && (...)}` dodaj panele opcji (kopia panelu tkaniny z dynamicznym kluczem):

```tsx
      {optionFacets.map((g) =>
        openDropdown === `option:${g.slug}` ? (
          <DropdownPanel key={g.slug} align="left">
            <div className="flex flex-wrap gap-1.5">
              {g.values.map((val) => {
                const selected = selectedOptions.get(g.slug) ?? [];
                const active = selected.includes(val.value);
                return (
                  <button
                    key={val.value}
                    onClick={() => toggleMulti(`opcja_${g.slug}`, selected, val.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-sans capitalize transition-colors ${
                      active
                        ? "bg-[var(--color-gold)] text-white"
                        : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                    }`}
                  >
                    {val.label}
                  </button>
                );
              })}
            </div>
          </DropdownPanel>
        ) : null
      )}
```

3. Po panelu ceny dodaj panel wymiarów:

```tsx
      {openDropdown === "dimensions" && (
        <DropdownPanel align="left">
          <div className="flex flex-col gap-3">
            {(
              [
                { label: t.filter.dimWidth, from: "szer_od", to: "szer_do", bounds: dimensionBounds?.width },
                { label: t.filter.dimDepth, from: "gl_od", to: "gl_do", bounds: dimensionBounds?.depth },
                { label: t.filter.dimHeight, from: "wys_od", to: "wys_do", bounds: dimensionBounds?.height },
              ] as const
            ).map((row) => (
              <div key={row.from}>
                <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
                  {row.label}
                </p>
                <div className="flex items-center gap-2 text-sm text-[var(--fg)]">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder={row.bounds ? `${t.filter.priceFrom} (${row.bounds.min})` : t.filter.priceFrom}
                    value={dims[row.from]}
                    onChange={(e) => setDims((d) => ({ ...d, [row.from]: e.target.value }))}
                    className="w-24 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--bg)] rounded-full outline-none focus:border-[var(--color-gold)]"
                  />
                  <span className="text-[var(--muted)]">—</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder={row.bounds ? `${t.filter.priceTo} (${row.bounds.max})` : t.filter.priceTo}
                    value={dims[row.to]}
                    onChange={(e) => setDims((d) => ({ ...d, [row.to]: e.target.value }))}
                    className="w-24 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--bg)] rounded-full outline-none focus:border-[var(--color-gold)]"
                  />
                  <span className="text-[var(--muted)]">cm</span>
                </div>
              </div>
            ))}
          </div>
        </DropdownPanel>
      )}
```

4. W sekcji chipów, po chipach `selectedMaterials.map(...)` dodaj:

```tsx
          {optionFacets.flatMap((g) => {
            const selected = selectedOptions.get(g.slug) ?? [];
            return selected.map((val) => (
              <ActiveChip
                key={`opt-${g.slug}-${val}`}
                label={`${g.label}: ${g.values.find((x) => x.value === val)?.label ?? val}`}
                removeLabel={t.filter.removeFilter}
                onRemove={() => toggleMulti(`opcja_${g.slug}`, selected, val)}
              />
            ));
          })}
          {dimsActive && (
            <ActiveChip
              label={t.filter.dimensions}
              removeLabel={t.filter.removeFilter}
              onRemove={() => setDims(Object.fromEntries(DIM_KEYS.map((k) => [k, ""])))}
            />
          )}
```

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` — Expected: 0 błędów.
Run: `npm test` — Expected: PASS.
(FilterBar bez nowych propsów renderuje się jak dotąd — `optionFacets` defaultuje do `[]`, pill „Wymiary" bez `dimensionBounds` się nie renderuje.)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts app/_components/ui/FilterBar.tsx
git commit -m "feat(filtry): FilterBar - dynamiczne pille opcji wariantow + panel Wymiary (PL/DE)"
```

---

### Task 6: Podpięcie w `app/sklep/page.tsx`

**Files:**
- Modify: `app/sklep/page.tsx` (typ `SearchParams` linie 41-53; parsowanie linie 66-83; wywołanie `getProducts` linie 96-109; `FilterBar` linie 184-192; `rawParams` linie 127-137)

**Interfaces:**
- Consumes: `parseOptionFilterParams` z `option-filter.ts`; `facets.options`/`facets.dimensions` z `getFilterFacets` (Task 4); propsy FilterBar (Task 5)
- Produces: działający URL-flow `?opcja_<slug>=` i `?szer_od=`… na /sklep i /de/sklep

- [ ] **Step 1: Rozszerz typ SearchParams i parsowanie**

Import na górze:

```ts
import { parseOptionFilterParams } from "@/app/_lib/option-filter";
```

Typ (dodaj klucze wymiarów + sygnaturę indeksową dla dynamicznych `opcja_*`):

```ts
type SearchParams = Promise<
  {
    kategoria?: string;
    sekcja?: string;
    sortuj?: string;
    strona?: string;
    q?: string;
    cena_od?: string;
    cena_do?: string;
    dostepne?: string;
    kolor?: string;
    tkanina?: string;
    kolekcja?: string;
    szer_od?: string;
    szer_do?: string;
    gl_od?: string;
    gl_do?: string;
    wys_od?: string;
    wys_do?: string;
  } & Record<string, string | string[] | undefined>
>;
```

Po linii `const collectionSlug = ...` dodaj:

```ts
  const optionFilters = parseOptionFilterParams(sp);
  const dimensionRanges = {
    widthMin: parsePositiveNumber(sp.szer_od),
    widthMax: parsePositiveNumber(sp.szer_do),
    depthMin: parsePositiveNumber(sp.gl_od),
    depthMax: parsePositiveNumber(sp.gl_do),
    heightMin: parsePositiveNumber(sp.wys_od),
    heightMax: parsePositiveNumber(sp.wys_do),
  };
```

- [ ] **Step 2: Przekaż do getProducts i FilterBar**

W wywołaniu `getProducts({...})` dodaj `optionFilters,` i `dimensionRanges,` (po `materials,`).

W JSX `FilterBar` dodaj propsy:

```tsx
        <FilterBar
          colors={facets.colors}
          materials={facets.materials}
          optionFacets={facets.options}
          dimensionBounds={facets.dimensions}
          sections={filterSections}
          collections={allCollections.map((c) => {
            const lc = localizeCollection(c, locale);
            return { slug: lc.slug, label: lc.label };
          })}
        />
```

- [ ] **Step 3: Zachowaj parametry w paginacji**

Po linii `if (sp.kolekcja) rawParams.kolekcja = sp.kolekcja;` dodaj:

```ts
  for (const k of ["szer_od", "szer_do", "gl_od", "gl_do", "wys_od", "wys_do"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) rawParams[k] = v;
  }
  for (const [k, val] of Object.entries(sp)) {
    if (k.startsWith("opcja_") && typeof val === "string" && val) rawParams[k] = val;
  }
```

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` — Expected: 0 błędów.
Run: `npm test` — Expected: PASS.
Run: `npm run dev` i otwórz `http://localhost:3000/sklep?szer_od=1` — strona się renderuje (facety opcji będą puste, dopóki żaden produkt nie ma `filterable` — to poprawne). Zatrzymaj dev server.

- [ ] **Step 5: Commit**

```bash
git add app/sklep/page.tsx
git commit -m "feat(filtry): /sklep czyta opcja_* i zakresy wymiarow z URL"
```

---

### Task 7: Admin — checkbox „Filtr w sklepie" + walidacja akcji

**Files:**
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (mutacje ~linie 87-134; `save()` ~linie 160-194; `OptionRow` ~linie 378-491 i jego wywołanie ~linie 302-312)
- Modify: `app/admin/produkty/actions.ts` (`updateProductVariants`, walidacja ~linie 258-272)

**Interfaces:**
- Consumes: `ProductOption.filterable` (Task 1)
- Produces: checkbox per opcja zapisywany do `variants.options[i].filterable`; server action waliduje typ flagi

- [ ] **Step 1: Mutacja stanu w VariantsEditor**

Po funkcji `setOptionName` dodaj:

```ts
  // Flaga „Filtr w sklepie": true → klucz w JSON, false → klucz znika
  // (undefined wypada przy JSON.stringify — czysty JSONB bez filterable:false).
  function setOptionFilterable(idx: number, filterable: boolean) {
    if (!variants) return;
    const nextOptions = variants.options.map((o, i) =>
      i === idx ? { ...o, filterable: filterable || undefined } : o
    );
    setVariants({ ...variants, options: nextOptions });
  }
```

- [ ] **Step 2: Zachowaj flagę przy czyszczeniu w save()**

W `save()` w mapie `cleanOptions` zmień return na:

```ts
            return {
              name: o.name.trim(),
              values,
              ...(value_prices ? { value_prices } : {}),
              ...(o.filterable ? { filterable: true } : {}),
            };
```

- [ ] **Step 3: Checkbox w OptionRow**

Rozszerz propsy `OptionRow` o `onToggleFilterable: (v: boolean) => void;` (w typie i destrukturyzacji), a w wywołaniu `<OptionRow ... />` dodaj:

```tsx
            onToggleFilterable={(v) => setOptionFilterable(i, v)}
```

W JSX `OptionRow`, bezpośrednio po divie z polem „Nazwa opcji" i przyciskiem „Usuń opcję" (przed sekcją „Wartości"), dodaj:

```tsx
      <label className="self-start flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
        <input
          type="checkbox"
          checked={option.filterable === true}
          onChange={(e) => onToggleFilterable(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-gold)]"
        />
        Filtr w sklepie
        <span className="text-xs text-[var(--muted)]">
          — klient może filtrować listę produktów po tej opcji
        </span>
      </label>
```

- [ ] **Step 4: Walidacja w server action**

W `app/admin/produkty/actions.ts` w `updateProductVariants`, w pętli `for (const opt of variants.options)` po walidacji `value_prices` dodaj:

```ts
      if (opt.filterable !== undefined && typeof opt.filterable !== "boolean") {
        return { ok: false, error: "Nieprawidłowa flaga filtra opcji" };
      }
```

(Akcja zapisuje `options` bez przepisywania pól — flaga przejdzie do JSONB; `invalidateFacetsCache()` już jest wołane na końcu, więc facety odświeżą się same.)

- [ ] **Step 5: Weryfikacja**

Run: `npx tsc --noEmit` — Expected: 0 błędów.
Run: `npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/produkty/[id]/VariantsEditor.tsx app/admin/produkty/actions.ts
git commit -m "feat(admin): checkbox 'Filtr w sklepie' przy opcji wariantu + walidacja flagi"
```

---

### Task 8: e2e + pełna weryfikacja + ręczny test na żywych danych

**Files:**
- Modify: `e2e/filter-pending.spec.ts`

**Interfaces:**
- Consumes: pill „Wymiary" i inputy z Task 5; param `szer_od` z Task 6

- [ ] **Step 1: Dopisz test e2e (wzorzec istniejących w tym pliku)**

Na końcu `e2e/filter-pending.spec.ts`:

```ts
// Krok A (2026-07-14): filtr wymiarów — wpisanie zakresu nawiguję po debounce
// (500 ms), URL niesie ?szer_od=, pending znika po zatwierdzeniu. Pill "Wymiary"
// renderuje się tylko gdy jakiś produkt ma wymiary (dane żywej bazy) — gdy
// brak, test się pomija zamiast fałszywie failować.
test("filtr wymiarów — zakres trafia do URL, pending znika", async ({ page }) => {
  await page.goto("/sklep");
  const pill = page.getByRole("button", { name: "Wymiary", exact: false });
  test.skip((await pill.count()) === 0, "brak produktów z wymiarami w bazie");
  await pill.first().click();
  // Jedyne widoczne inputy "od…" to panel wymiarów (panel ceny nie jest
  // zamontowany, gdy zamknięty) — pierwszy input = "Szerokość od".
  await page.getByPlaceholder(/^od/).first().fill("50");
  await expect(page).toHaveURL(/szer_od=50/, { timeout: 10_000 });
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
});
```

- [ ] **Step 2: Pełna weryfikacja automatyczna**

Run: `npx tsc --noEmit` — Expected: 0 błędów.
Run: `npm test` — Expected: wszystkie PASS.
Run: `npm run build` — Expected: build zielony.
Run: `npm run test:e2e` — Expected: PASS (w tym nowy test; dopuszczalny `skipped`, jeśli baza nie ma produktów z wymiarami).

- [ ] **Step 3: Ręczny test na żywych danych (⚠️ PROD DB — cofnij mutacje!)**

1. `npm run dev`, zaloguj się jako admin.
2. W `/admin/produkty` otwórz produkt z opcją „ROZMIAR" lub „POWIERZCHNIA SPANIA", zaznacz „Filtr w sklepie", zapisz warianty.
3. Na `/sklep`: pojawia się pill „Rozmiar" (lub „Powierzchnia spania"); zaznacz wartość → lista zawęża się do produktów z tą wartością; chip aktywnego filtra działa; paginacja zachowuje parametr.
4. Na `/de/sklep`: pill ma etykietę DE („Größe"/„Liegefläche"), wartości wymiarowe bez zmian.
5. Panel „Wymiary": wpisz `szer_od`/`szer_do` obejmujące i wykluczające znane produkty — wyniki się zgadzają; produkty bez wymiarów znikają przy aktywnym zakresie.
6. „Wyczyść (N)" zeruje też opcje i wymiary.
7. **Cofnij:** odznacz „Filtr w sklepie" na produkcie z kroku 2 i zapisz — chyba że Mikołaj zdecyduje zostawić flagę na stałe (wtedy odnotuj w PR).

- [ ] **Step 4: Commit + finisz brancha**

```bash
git add e2e/filter-pending.spec.ts
git commit -m "test(e2e): filtr wymiarow - zakres w URL z pendingiem"
```

Następnie użyj skilla superpowers:finishing-a-development-branch (PR do `main` z opisem: co, jak testowane, wynik weryfikacji, notka o ręcznym teście na żywych danych).
