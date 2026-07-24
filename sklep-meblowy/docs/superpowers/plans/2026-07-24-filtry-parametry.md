# Przebudowa filtrów /sklep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć z /sklep filtry Kolor i Tkanina (kod) oraz „Kolor nóżek" (flaga w danych — poza planem, robi kontroler), dodać generyczne filtry z parametrów produktu (`features`): Powierzchnia spania, Pojemnik na pościel, Tył mebla tapicerowany, Wysokość nóżek.

**Architecture:** Nowy czysty moduł `feature-filter.ts` (wzorzec `option-filter.ts`): facety + dopasowanie + parsowanie URL (`?cecha_<slug>=v1|v2`, separator `|` bo wartości typu „4,5 cm"). Wpięcie w `getProducts` (filtr JS po `features`) i `getFacetSource` (klucz cache v2→v3). FilterBar: sekcje/chipy lustrzane do filtrów opcji; sekcje kolorów i tkanin wypadają. `fabric-filter.ts` traci ostatniego konsumenta → DELETE.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Supabase, Vitest, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-24-filtry-parametry-design.md`

## Global Constraints

- Katalog roboczy poleceń: `C:\Users\wood1\sklep-meblowy`. ⚠️ Root repo git to `C:\Users\wood1` (projekt w podfolderze `sklep-meblowy/`); git ze ścieżkami względnymi z cwd działa normalnie.
- To NIE jest znany Ci Next.js — przy wątpliwościach czytaj `node_modules/next/dist/docs/` (AGENTS.md).
- Komentarze/teksty po polsku, w stylu istniejącego kodu.
- Param prefix `cecha_`, separator wartości `|` (NIE przecinek), stała lista kluczy dokładnie: `["Powierzchnia spania", "Pojemnik na pościel", "Tył mebla tapicerowany", "Wysokość nóżek"]` (kolejność = kolejność sekcji).
- NIE zmieniać: mechanizmu opcji `filterable` (option-filter.ts zostaje w całości), filtrów ceny/wymiarów/dostępności/kategorii/kolekcji, karty produktu, stron /tkaniny.
- NIE uruchamiać e2e (default E2E_BASE_URL=PROD — gotcha repo); e2e tylko edytujemy.
- Weryfikacja każdego taska: `npm test` + `npx tsc --noEmit` (Task 3 także `npm run lint` i `npm run build`).
- Commity na branchu `feat/filtry-parametry`; komunikat po polsku ze stopką `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Czysty moduł `feature-filter.ts` + mapy DE (+ testy, TDD)

**Files:**
- Create: `app/_lib/feature-filter.ts`
- Modify: `app/_lib/de-content-maps.ts` (3 wpisy w `FEATURE_KEY_DE`)
- Test: `app/_lib/__tests__/feature-filter.test.ts` (nowy)

**Interfaces:**
- Consumes: `optionParamSlug`, `normalizeOptionName` z `./option-filter`; `FEATURE_KEY_DE`, `FEATURE_VALUE_DE` z `./de-content-maps`; typ `Locale` z `./i18n`.
- Produces (Task 2 i 3 polegają na dokładnie tych nazwach):
  - `FEATURE_PARAM_PREFIX = "cecha_"`, `FEATURE_PARAM_SEPARATOR = "|"`
  - `FILTERABLE_FEATURE_KEYS: string[]`
  - `type FeatureFacetGroup = { slug: string; name: string; values: string[] }`
  - `type LocalizedFeatureFacet = { slug: string; label: string; values: { value: string; label: string }[] }`
  - `collectFeatureFacets(rows: { features: unknown }[]): FeatureFacetGroup[]`
  - `localizeFeatureFacets(groups: FeatureFacetGroup[], locale: Locale): LocalizedFeatureFacet[]`
  - `productMatchesFeatureFilters(features: unknown, selected: Record<string, string[]>): boolean`
  - `parseFeatureFilterParams(sp: Record<string, string | string[] | undefined>): Record<string, string[]>`

- [ ] **Step 1: Failujące testy**

Nowy plik `app/_lib/__tests__/feature-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FILTERABLE_FEATURE_KEYS,
  FEATURE_PARAM_PREFIX,
  FEATURE_PARAM_SEPARATOR,
  collectFeatureFacets,
  localizeFeatureFacets,
  productMatchesFeatureFilters,
  parseFeatureFilterParams,
} from "../feature-filter";

const rows = (...features: unknown[]) => features.map((f) => ({ features: f }));

describe("collectFeatureFacets", () => {
  it("grupuje po kanonicznych kluczach w kolejności FILTERABLE_FEATURE_KEYS", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Wysokość nóżek", value: "15 cm" }],
        [{ key: "Powierzchnia spania", value: "160x200" }],
        [{ key: "Pojemnik na pościel", value: "Tak" }]
      )
    );
    expect(out.map((g) => g.name)).toEqual([
      "Powierzchnia spania",
      "Pojemnik na pościel",
      "Wysokość nóżek",
    ]);
    expect(out.map((g) => g.slug)).toEqual([
      "powierzchnia-spania",
      "pojemnik-na-posciel",
      "wysokosc-nozek",
    ]);
  });

  it("dopasowuje klucz case-insensitive po trim, nazwa grupy = kanoniczna", () => {
    const out = collectFeatureFacets(
      rows([{ key: "  POJEMNIK NA POŚCIEL ", value: "Tak" }])
    );
    expect(out).toEqual([
      { slug: "pojemnik-na-posciel", name: "Pojemnik na pościel", values: ["Tak"] },
    ]);
  });

  it("dedupe wartości po trim (pierwsza pisownia wygrywa) + sort numeric pl", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Powierzchnia spania", value: "160x200" }],
        [{ key: "Powierzchnia spania", value: " 160x200 " }],
        [{ key: "Powierzchnia spania", value: "80x200" }],
        [{ key: "Wysokość nóżek", value: "15 cm" }],
        [{ key: "Wysokość nóżek", value: "4,5 cm" }],
        [{ key: "Wysokość nóżek", value: "1 cm" }]
      )
    );
    expect(out[0].values).toEqual(["80x200", "160x200"]);
    expect(out[1].values).toEqual(["1 cm", "4,5 cm", "15 cm"]);
  });

  it("pomija: klucze spoza listy, wartości z separatorem, puste, śmieciowe wejścia", () => {
    const out = collectFeatureFacets(
      rows(
        [{ key: "Materac wbudowany", value: "Tak" }],
        [{ key: "Wysokość nóżek", value: `1${FEATURE_PARAM_SEPARATOR}2 cm` }],
        [{ key: "Wysokość nóżek", value: "   " }],
        [{ key: 7, value: "x" }, { value: "bez klucza" }, "tekst", null],
        "nie-tablica",
        null,
        [{ key: "Wysokość nóżek", value: "15 cm" }]
      )
    );
    expect(out).toEqual([
      { slug: "wysokosc-nozek", name: "Wysokość nóżek", values: ["15 cm"] },
    ]);
  });

  it("puste grupy wypadają (brak danych → [])", () => {
    expect(collectFeatureFacets([])).toEqual([]);
  });
});

describe("localizeFeatureFacets", () => {
  const groups = collectFeatureFacets(
    rows(
      [{ key: "Powierzchnia spania", value: "160x200" }],
      [{ key: "Pojemnik na pościel", value: "Tak" }]
    )
  );
  it("pl: label = nazwa/wartość surowa", () => {
    const out = localizeFeatureFacets(groups, "pl");
    expect(out[0]).toEqual({
      slug: "powierzchnia-spania",
      label: "Powierzchnia spania",
      values: [{ value: "160x200", label: "160x200" }],
    });
  });
  it("de: label grupy z FEATURE_KEY_DE, wartość Tak→Ja, wymiary bez zmian", () => {
    const out = localizeFeatureFacets(groups, "de");
    expect(out[0].label).toBe("Liegefläche");
    expect(out[0].values[0]).toEqual({ value: "160x200", label: "160x200" });
    expect(out[1].label).toBe("Bettkasten");
    expect(out[1].values[0]).toEqual({ value: "Tak", label: "Ja" });
  });
});

describe("productMatchesFeatureFilters", () => {
  const features = [
    { key: "Powierzchnia spania", value: "160x200" },
    { key: "pojemnik na pościel", value: " Tak " },
  ];
  it("pusty wybór → pasuje wszystko", () => {
    expect(productMatchesFeatureFilters(features, {})).toBe(true);
    expect(productMatchesFeatureFilters(null, {})).toBe(true);
  });
  it("OR w grupie, klucz case-insensitive, wartości po trim", () => {
    expect(
      productMatchesFeatureFilters(features, {
        "powierzchnia-spania": ["80x200", "160x200"],
        "pojemnik-na-posciel": ["Tak"],
      })
    ).toBe(true);
  });
  it("AND między grupami — jedna niepasująca grupa odrzuca", () => {
    expect(
      productMatchesFeatureFilters(features, {
        "powierzchnia-spania": ["160x200"],
        "wysokosc-nozek": ["15 cm"],
      })
    ).toBe(false);
  });
  it("brak parametru / śmieciowe features przy aktywnej grupie → false", () => {
    expect(
      productMatchesFeatureFilters(null, { "wysokosc-nozek": ["15 cm"] })
    ).toBe(false);
    expect(
      productMatchesFeatureFilters("śmieć", { "wysokosc-nozek": ["15 cm"] })
    ).toBe(false);
  });
});

describe("parseFeatureFilterParams", () => {
  it("czyta cecha_<slug>, splituje po separatorze, trim, puste odpadają", () => {
    expect(
      parseFeatureFilterParams({
        [`${FEATURE_PARAM_PREFIX}wysokosc-nozek`]: `1 cm${FEATURE_PARAM_SEPARATOR} 4,5 cm ${FEATURE_PARAM_SEPARATOR}`,
        [`${FEATURE_PARAM_PREFIX}powierzchnia-spania`]: ["80x200", "ignored-second"],
        [`${FEATURE_PARAM_PREFIX}ZłY_slug!`]: "x",
        cecha_pusty: "  ",
        inne: "y",
      })
    ).toEqual({
      "wysokosc-nozek": ["1 cm", "4,5 cm"],
      "powierzchnia-spania": ["80x200"],
    });
  });
});
```

- [ ] **Step 2: Uruchom — FAIL na braku modułu**

Run: `npx vitest run app/_lib/__tests__/feature-filter.test.ts`
Expected: FAIL (cannot find module `../feature-filter`).

- [ ] **Step 3: Mapy DE**

W `app/_lib/de-content-maps.ts` w `FEATURE_KEY_DE` dopisz (alfabetycznie w obiekcie):

```ts
  "Pojemnik na pościel": "Bettkasten",
  "Tył mebla tapicerowany": "Gepolsterte Rückseite",
  "Wysokość nóżek": "Fußhöhe",
```

(„Powierzchnia spania": „Liegefläche" oraz Tak/Nie→Ja/Nein w `FEATURE_VALUE_DE` już istnieją — nie dublować.)

- [ ] **Step 4: Implementacja `app/_lib/feature-filter.ts`**

```ts
// Filtry z parametrów produktu (?cecha_<slug>=w1|w2) na /sklep. Czyste
// funkcje (bez importów server-only) — wzorzec option-filter.ts. Separator
// "|" zamiast CSV: wartości typu "4,5 cm" mają przecinek w środku.
import { normalizeOptionName, optionParamSlug } from "./option-filter";
import { FEATURE_KEY_DE, FEATURE_VALUE_DE } from "./de-content-maps";
import type { Locale } from "./i18n";

export const FEATURE_PARAM_PREFIX = "cecha_";
export const FEATURE_PARAM_SEPARATOR = "|";

// Parametry produktu widoczne jako filtry — kolejność = kolejność sekcji
// w FilterBarze (decyzja biznesowa, nie alfabet). Pisownia kanoniczna.
export const FILTERABLE_FEATURE_KEYS: string[] = [
  "Powierzchnia spania",
  "Pojemnik na pościel",
  "Tył mebla tapicerowany",
  "Wysokość nóżek",
];

export type FeatureFacetGroup = {
  slug: string; // część parametru: ?cecha_<slug>=
  name: string; // kanoniczna nazwa PL z FILTERABLE_FEATURE_KEYS
  values: string[]; // surowe wartości PL — niosą URL i dopasowanie
};

export type LocalizedFeatureFacet = {
  slug: string;
  label: string;
  values: { value: string; label: string }[];
};

// Surowa kolumna features (jsonb) → [{key, value}] z pominięciem śmieci.
function featureEntries(features: unknown): { key: string; value: string }[] {
  if (!Array.isArray(features)) return [];
  const out: { key: string; value: string }[] = [];
  for (const item of features) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { key?: unknown; value?: unknown };
    if (typeof rec.key !== "string" || typeof rec.value !== "string") continue;
    const key = rec.key.trim();
    const value = rec.value.trim();
    if (!key || !value) continue;
    out.push({ key, value });
  }
  return out;
}

// Agreguje wartości filtrowanych parametrów z aktywnych produktów w grupy
// facetów. Klucz dopasowany case-insensitive po trim; dedupe wartości
// (pierwsza pisownia wygrywa); wartość z separatorem nie przeżyje rundy
// przez URL — nie staje się filtrem. Grupy w kolejności listy, puste odpadają.
export function collectFeatureFacets(
  rows: { features: unknown }[]
): FeatureFacetGroup[] {
  const byNorm = new Map(
    FILTERABLE_FEATURE_KEYS.map((k) => [normalizeOptionName(k), k])
  );
  const groups = new Map<string, Map<string, string>>(); // canonical → norm(value) → value
  for (const row of rows) {
    for (const { key, value } of featureEntries(row.features)) {
      const canonical = byNorm.get(normalizeOptionName(key));
      if (!canonical) continue;
      if (value.includes(FEATURE_PARAM_SEPARATOR)) continue;
      let values = groups.get(canonical);
      if (!values) {
        values = new Map();
        groups.set(canonical, values);
      }
      const dedupe = value.toLowerCase();
      if (!values.has(dedupe)) values.set(dedupe, value);
    }
  }
  return FILTERABLE_FEATURE_KEYS.filter((k) => groups.has(k)).map((name) => ({
    slug: optionParamSlug(name),
    name,
    values: [...groups.get(name)!.values()].sort((a, b) =>
      a.localeCompare(b, "pl", { numeric: true })
    ),
  }));
}

// Projekcja grup na locale — value zostaje PL/surowe (niesie URL i filtr),
// label z map DE z fallbackiem (kody wymiarów "80x200"/"15 cm" bez zmian).
export function localizeFeatureFacets(
  groups: FeatureFacetGroup[],
  locale: Locale
): LocalizedFeatureFacet[] {
  const de = locale === "de";
  return groups.map((g) => ({
    slug: g.slug,
    label: de ? (FEATURE_KEY_DE[g.name] ?? g.name) : g.name,
    values: g.values.map((v) => ({
      value: v,
      label: de ? (FEATURE_VALUE_DE[v] ?? v) : v,
    })),
  }));
}

// selected: slug → wybrane wartości. Produkt pasuje, gdy dla KAŻDEJ grupy ma
// parametr o tym slugu z ≥1 wybraną wartością (OR w grupie, AND między
// grupami). Brak parametru = brak dopasowania (spójnie z opcjami/tkaniną).
export function productMatchesFeatureFilters(
  features: unknown,
  selected: Record<string, string[]>
): boolean {
  const active = Object.entries(selected).filter(([, v]) => v.length > 0);
  if (active.length === 0) return true;
  const entries = featureEntries(features);
  for (const [slug, wanted] of active) {
    const values = new Set<string>();
    for (const { key, value } of entries) {
      if (optionParamSlug(key) !== slug) continue;
      values.add(value);
    }
    if (!wanted.some((w) => values.has(w))) return false;
  }
  return true;
}

// Parsuje searchParams strony: ?cecha_<slug>=w1|w2 → { slug: [w1, w2] }.
// Niepoprawne slugi/puste wartości ignorowane — żaden URL nie wywoła błędu.
export function parseFeatureFilterParams(
  sp: Record<string, string | string[] | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(sp)) {
    if (!key.startsWith(FEATURE_PARAM_PREFIX)) continue;
    const slug = key.slice(FEATURE_PARAM_PREFIX.length);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const values = (value ?? "")
      .split(FEATURE_PARAM_SEPARATOR)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) out[slug] = values;
  }
  return out;
}
```

- [ ] **Step 5: Testy zielone + pełna weryfikacja + commit**

Run: `npx vitest run app/_lib/__tests__/feature-filter.test.ts` → PASS.
Run: `npm test && npx tsc --noEmit` → wszystko zielone.

```bash
git add app/_lib/feature-filter.ts app/_lib/__tests__/feature-filter.test.ts app/_lib/de-content-maps.ts
git commit -m "feat(sklep): feature-filter — facety/dopasowanie/URL filtrów z parametrów produktu"
```

---

### Task 2: Wpięcie serwerowe + usunięcie kolor/tkanina z backendu + DELETE fabric-filter

**Files:**
- Modify: `app/_lib/products.ts`
- Modify: `app/sklep/page.tsx`
- Delete: `app/_lib/fabric-filter.ts`, `app/_lib/__tests__/fabric-filter.test.ts`
- Modify (1 komentarz): `app/_lib/option-filter.ts`

**Interfaces:**
- Consumes (Task 1): `collectFeatureFacets`, `localizeFeatureFacets`, `productMatchesFeatureFilters`, `parseFeatureFilterParams`, typ `FeatureFacetGroup` z `@/app/_lib/feature-filter`.
- Produces (Task 3 polega na tym): `getFilterFacets` zwraca `{ options, dimensions, features }` (bez `colors`/`materials`); `getProducts` przyjmuje `featureFilters?: Record<string, string[]>` (bez `colors`/`materials`); `app/sklep/page.tsx` przekazuje `featureFacets={facets.features}` do FilterBara (propsy `colors`/`materials` wypadają z wywołania).

- [ ] **Step 1: `getProducts` w `app/_lib/products.ts`**

- Z sygnatury/parametrów wypadają `colors?: string[]` i `materials?: string[]`; dochodzi `featureFilters?: Record<string, string[]>`.
- Wypada linia `if (colors?.length) query = query.in("color", colors);`.
- Blok filtrów JS (ok. linii 157-195) przyjmuje postać:

```ts
  const optionFiltersActive = Object.values(optionFilters ?? {}).some(
    (v) => v.length > 0
  );
  const featureFiltersActive = Object.values(featureFilters ?? {}).some(
    (v) => v.length > 0
  );
  const dimensionsActive = hasActiveDimensionRanges(dimensionRanges ?? {});
  if (optionFiltersActive || featureFiltersActive || dimensionsActive) {
    // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym wzroście katalogu PostgREST utnie wiersze i filtr/facety po cichu zgubią produkty — wtedy zdenormalizować rodziny do kolumny.
    const { data: jsFilterRows } = await supabase
      .from("products")
      .select("id, variants, features, dimensions");
    const ids = (
      (jsFilterRows ?? []) as {
        id: string;
        variants: Product["variants"];
        features: unknown;
        dimensions: Product["dimensions"];
      }[]
    )
      .filter(
        (r) =>
          (!optionFiltersActive ||
            productMatchesOptionFilters(r.variants, optionFilters!)) &&
          (!featureFiltersActive ||
            productMatchesFeatureFilters(r.features, featureFilters!)) &&
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

- Importy: wypadają `productMatchesFabric`/`deriveFabricFamilies` (z `./fabric-filter`) i `getAllFabrics` jeśli był importowany tylko do tego bloku (sprawdź inne użycia w pliku!); dochodzą `productMatchesFeatureFilters`, `collectFeatureFacets`, `localizeFeatureFacets` oraz typ `FeatureFacetGroup` z `./feature-filter`.
- Komentarz nagłówkowy bloku JS („tkanina / opcje wariantów / wymiary") → „opcje wariantów / parametry / wymiary".

- [ ] **Step 2: `getFacetSource` + `getFilterFacets` w `app/_lib/products.ts`**

- Typ zwrotki `getFacetSource`: wypadają `colorRows` i `fabricFacetRows`, dochodzi `featureGroups: FeatureFacetGroup[]`.
- Wypada zapytanie `colorsData` i całe budowanie `fabricFacetRows`/`usedFamilies`/`fabricsData` (admin client zostaje tylko jeśli używa go coś innego w tej funkcji — po zmianach NIE używa → wypada też `const admin = await createAdminClient();`).
- Zapytanie źródłowe: `select("variants, material, material_de, dimensions")` → `select("variants, features, dimensions")`; typ rzutowania odpowiednio (`features: unknown`).
- Po `collectOptionFacets`/`collectDimensionBounds` dochodzi `const featureGroups = collectFeatureFacets(rows);`.
- ⚠️ Klucz cache: `["facet-source-v2"]` → `["facet-source-v3"]` (zmiana kształtu zwrotki).
- `getFilterFacets` zwraca:

```ts
  return {
    options: localizeOptionFacets(optionGroups, locale),
    dimensions: dimensionBounds,
    features: localizeFeatureFacets(featureGroups, locale),
  };
```

- Import `buildLocalizedFacets` z `./localize` wypada, jeśli po zmianach nieużywany w pliku (sprawdź).

- [ ] **Step 3: `app/sklep/page.tsx`**

- Z typu `SearchParams` wypadają pola `kolor` i `tkanina`.
- Wypadają linie `const colors = sp.kolor...` i `const materials = sp.tkanina...`; dochodzi `const featureFilters = parseFeatureFilterParams(sp);` (import z `@/app/_lib/feature-filter`).
- W wywołaniu `getProducts`: wypadają `colors`/`materials`, dochodzi `featureFilters`.
- W JSX FilterBara: wypadają `colors={facets.colors}` i `materials={facets.materials}`, dochodzi `featureFacets={facets.features}`.

- [ ] **Step 4: DELETE fabric-filter + komentarz**

```bash
git rm app/_lib/fabric-filter.ts app/_lib/__tests__/fabric-filter.test.ts
```

W `app/_lib/option-filter.ts` popraw komentarze odwołujące się do fabric-filter: linia 3 („wzorzec fabric-filter.ts" → „wzorzec feature-filter.ts") i komentarz nad `EXCLUDED_OPTION_SLUGS` (linie 12-13: „Tkanina" miała dedykowany filtr rodzin — po jego usunięciu wykluczenie zostaje ŚWIADOMIE: opcja „Tkanina" w wariantach to kody kolorów tkanin, nie nadaje się na generyczny facet). Treść komentarza dostosuj, `EXCLUDED_OPTION_SLUGS` NIE ruszaj.

⚠️ Uwaga: `ProductEditor`/`VariantsEditor` (admin) i strony tkanin importują z `app/_lib/fabrics.ts` — NIE mylić z `fabric-filter.ts`. Usuwasz wyłącznie `fabric-filter.ts`.

- [ ] **Step 5: Weryfikacja + commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (suita bez testów fabric-filter), tsc czysty — w szczególności `app/_components/ui/FilterBar.tsx` jeszcze przyjmuje `colors`/`materials` jako propsy OPCJONALNE?… NIE — propsy są wymagane (`colors: FilterBarFacet[]`). Po usunięciu ich z wywołania w page.tsx tsc SIĘ WYSYPIE. Żeby task był samodzielnie zielony: w `FilterBar.tsx` zmień TYLKO sygnaturę propsów na `colors?: FilterBarFacet[]` i `materials?: FilterBarFacet[]` z defaultami `colors = []`, `materials = []` w destrukturyzacji (2 linie; całe UI czyści Task 3).

```bash
git add app/_lib/products.ts app/sklep/page.tsx app/_lib/option-filter.ts app/_components/ui/FilterBar.tsx
git commit -m "feat(sklep): filtry z parametrów produktu na backendzie; minus filtr koloru i tkanin (facet-source-v3)"
```

---

### Task 3: FilterBar — sekcje/chipy parametrów, usunięcie UI kolorów i tkanin + e2e

**Files:**
- Modify: `app/_components/ui/FilterBar.tsx`
- Modify: `e2e/filter-pending.spec.ts`

**Interfaces:**
- Consumes (Task 2): prop `featureFacets?: FilterBarOptionFacet[]` (ten sam kształt `{ slug, label, values: { value, label }[] }` co `optionFacets`); stałe `FEATURE_PARAM_PREFIX`, `FEATURE_PARAM_SEPARATOR` z `@/app/_lib/feature-filter`.
- Produces: finalne UI; nic dla innych plików.

- [ ] **Step 1: Propsy i stan wyboru**

- Z typu propsów i destrukturyzacji wypadają `colors` i `materials` (razem z tymczasowymi `?`/defaultami z Task 2); dochodzi `featureFacets?: FilterBarOptionFacet[]` z defaultem `= []`.
- Typ `FilterBarFacet` usuń, jeśli po zmianach nieużywany.
- Wypadają `selectedColors`/`selectedMaterials` (linie ~118-119) i lookupy `colorLabel`/`materialLabel` (~258-261).
- Po `selectedOptions` (linie ~121-127) dochodzi lustrzane:

```ts
  // Wybrane wartości per parametr (z URL — jak selectedOptions; separator "|"
  // bo wartości typu "4,5 cm" mają przecinek).
  const selectedFeatures = new Map(
    featureFacets.map((g) => [
      g.slug,
      (effectiveParams.get(`${FEATURE_PARAM_PREFIX}${g.slug}`) ?? "")
        .split(FEATURE_PARAM_SEPARATOR)
        .filter(Boolean),
    ])
  );
```

- `toggleMulti` dostaje opcjonalny separator:

```ts
  function toggleMulti(key: string, current: string[], value: string, sep = ",") {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update(key, next.join(sep));
  }
```

- Licznik: wypadają `selectedColors.length`/`selectedMaterials.length` z `totalActiveFilters`; dochodzi `featureCount` (suma długości `selectedFeatures`) — analogicznie do `optionCount`.
- Typ `DropdownKey`: wypadają warianty `"color"`/`"material"`; dochodzi wariant szablonowy dla parametrów (np. `` `cecha:${string}` `` — dokładnie tak jak istniejący wariant `` `option:${string}` ``).
- `clearAll` bez zmian (buduje świeże paramsy — `cecha_*` czyści się samo).

- [ ] **Step 2: Pigułki i dropdowny**

- Wypadają `FilterPill` koloru (~329-336) i tkaniny (~337-344) oraz ich panele dropdown (sekcje z `colors.map`/`materials.map`, ~486-527).
- Po pigułkach `optionFacets.map(...)` (~345-353) dochodzi lustrzane `featureFacets.map(...)` z kluczem `cecha:${g.slug}` i `count={selectedFeatures.get(g.slug)?.length ?? 0}`.
- Po panelach opcji (`optionFacets.map(...)` render paneli, ~529+) dochodzi lustrzany render paneli parametrów — kopiuj strukturę panelu opcji 1:1, podmieniając: warunek `openDropdown === `cecha:${g.slug}``, źródło zaznaczeń `selectedFeatures`, oraz klik:

```tsx
  onClick={() =>
    toggleMulti(
      `${FEATURE_PARAM_PREFIX}${g.slug}`,
      selectedFeatures.get(g.slug) ?? [],
      v.value,
      FEATURE_PARAM_SEPARATOR
    )
  }
```

  Bez klasy `capitalize` na wartościach parametrów („80x200"/„15 cm"/„Tak" mają być 1:1; opcje mogą ją mieć — nie ruszaj ich).

- [ ] **Step 3: Chipy aktywnych filtrów**

- Wypadają chipy kolorów (`selectedColors.map`, ~680) i tkanin (`selectedMaterials.map`, ~688).
- Po chipach opcji (`optionFacets.flatMap(...)`, ~691) dochodzi lustrzane `featureFacets.flatMap(...)`: label z `g.values.find((x) => x.value === v)?.label ?? v`, `onRemove` przez `toggleMulti(...)` z prefixem i separatorem jak w Step 2.

- [ ] **Step 4: e2e `e2e/filter-pending.spec.ts`**

Dławik i asercje przechodzą z `tkanina=` na parametr cechy (scenariusz identyczny):
- w `route()`: `url().includes("tkanina=")` → `url().includes("cecha_")`,
- klik pigułki tkaniny → klik pigułki „Powierzchnia spania" i wartości (np. pierwszej dostępnej),
- asercja `toHaveURL(/tkanina=/)` → `toHaveURL(/cecha_powierzchnia-spania=/)`,
- komentarz nagłówkowy odpowiednio. NIE uruchamiaj e2e (default E2E_BASE_URL=PROD).

- [ ] **Step 5: Weryfikacja + commit**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: wszystko zielone (build łapie split client/server).

```bash
git add app/_components/ui/FilterBar.tsx e2e/filter-pending.spec.ts
git commit -m "feat(sklep): FilterBar — sekcje filtrów z parametrów, minus kolor i tkanina"
```

---

## Po ukończeniu tasków (kontroler, poza subagentami)

1. Operacje na danych prod (MCP, pokaż SQL → potwierdź → wykonaj): flaga `filterable=false` dla „Kolor nóżek"; rename „Wysokość nóżki"→„Wysokość nóżek", „Wbudowany materac"→„Materac wbudowany" (SELECT-y kontrolne przed UPDATE — patrz spec).
2. Final whole-branch review → push + PR (opis: spec, klik-testy: 4 nowe filtry PL+DE, brak koloru/tkaniny/koloru nóżek, chipy, „wyczyść", stare URL-e nie wybuchają).
3. Klik-testy Mikołaja na prodzie.
