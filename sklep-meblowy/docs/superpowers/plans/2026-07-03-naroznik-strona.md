# Wybór strony narożnika (Lewostronny/Prawostronny) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klient wybiera stronę narożnika (Lewostronny/Prawostronny) graficznym pickerem SVG na karcie produktu; admin włącza/wyłącza tę możliwość per produkt; wybór przechodzi istniejącym kanałem wariantów do zamówienia.

**Architecture:** Strona = opcja wariantu `"Strona": ["Lewostronny","Prawostronny"]` w JSONB `products.variants` (zero migracji DB). Nowy czysty moduł `app/_lib/corner-side.ts` (rozpoznawanie + włączanie/wyłączanie z zachowaniem danych kombinacji), specjalny render tej opcji w `VariantSelector` (wzorzec `FABRIC_OPTION_NAME`), toggle w `VariantsEditor`, auto-ON przy tworzeniu produktu `naroznik-l`, jednorazowy backfill server action.

**Tech Stack:** Next.js 16 (App Router), Supabase (JSONB), vitest 4 (node env, tylko czyste funkcje), Tailwind v4 (CSS variables `--color-gold`, `--border`, `--fg`, `--muted`).

**Spec:** `docs/superpowers/specs/2026-07-03-naroznik-strona-design.md` (zatwierdzony).

## Global Constraints

- Kanoniczne stringi (dokładnie): nazwa opcji `"Strona"`, wartości `"Lewostronny"` / `"Prawostronny"`. W DB/koszyku/zamówieniu ZAWSZE kanoniczne PL — tłumaczenie wyłącznie przy renderze (`mapDe`).
- Rozpoznawanie istniejących ręcznych opcji znormalizowane (trim+uppercase): nazwy `STRONA`, `STRONA MEBLA`; wartości po prefiksie `LEW*`/`PRAW*` (pokrywa literówkę `LEWOSTORNNY` z DB).
- Zero migracji schematu DB. Żadnych zmian w: `CartContext`, `api/checkout/route.ts`, `orders.ts`, widokach zamówień, `ReorderButton` — przepływ wariantów obsługuje wszystko.
- Kategorie narożników (toggle widoczny): slug zawiera `naroznik` LUB slug ∈ {`pufy`} (prod DB: `pufy` = „U-förmiges Ecksofa"). Domyślne ON tylko dla `naroznik-l`.
- Repo: apka w podkatalogu `sklep-meblowy/` — WSZYSTKIE ścieżki poniżej względem korzenia repo. Komendy `npm` uruchamiać w `sklep-meblowy/`.
- Testy: vitest łapie tylko `app/**/__tests__/**/*.test.ts` (środowisko node, bez jsdom — komponentów NIE testujemy; logika w czystych funkcjach). Styl: `describe("nazwa — opis")`, `it("scenariusz → oczekiwanie")` po polsku.
- Server actions: zawsze `await requireAdmin()` na początku, zapis przez `createAdminClient()`, na końcu `revalidatePath` dla `/admin/produkty/[id]`, `/produkt/[id]` i `/sklep`.
- Commity po polsku, prefiks `feat(naroznik):` / `test(naroznik):`, stopka `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- AGENTS.md: ta wersja Next ma breaking changes — przy JAKIEJKOLWIEK wątpliwości co do API Next czytać `sklep-meblowy/node_modules/next/dist/docs/`.
- Lokalny `.env.local` to placeholdery (prawdziwe env tylko na Vercelu) — weryfikacja runtime na preview deployu, lokalnie: testy + lint + build.

---

### Task 1: Czysty moduł `corner-side.ts` (TDD)

**Files:**
- Create: `sklep-meblowy/app/_lib/corner-side.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/corner-side.test.ts`

**Interfaces:**
- Consumes: `applyValuePricing`, `rebuildCombinations`, `variantKey` z `@/app/_lib/variants`; typy `ProductOption`, `ProductVariant`, `ProductVariants` z `@/app/_lib/types`.
- Produces (używane przez Taski 4–7):
  - `CORNER_SIDE_OPTION_NAME: "Strona"` (const string)
  - `CORNER_SIDE_VALUES: string[]` = `["Lewostronny", "Prawostronny"]`
  - `CORNER_SIDE_DEFAULT_CATEGORY: "naroznik-l"` (const string)
  - `type CornerSide = "left" | "right"`
  - `isCornerCategorySlug(slug: string | null | undefined): boolean`
  - `isCornerSideOptionName(name: string): boolean`
  - `cornerSideOf(value: string): CornerSide | null`
  - `hasCornerSideOption(variants: ProductVariants | null): boolean`
  - `applyCornerSideSelection(variants: ProductVariants | null, enabled: boolean): ProductVariants | null`

- [ ] **Step 1: Napisz failing test**

Utwórz `sklep-meblowy/app/_lib/__tests__/corner-side.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CORNER_SIDE_OPTION_NAME,
  CORNER_SIDE_VALUES,
  CORNER_SIDE_DEFAULT_CATEGORY,
  isCornerCategorySlug,
  isCornerSideOptionName,
  cornerSideOf,
  hasCornerSideOption,
  applyCornerSideSelection,
} from "@/app/_lib/corner-side";
import type { ProductVariants } from "@/app/_lib/types";

// Produkt z tkaninami (value pricing aktywny: Riviera +200) — do testów
// zachowania danych kombinacji przy włączaniu/wyłączaniu strony.
const fabricVariants: ProductVariants = {
  options: [
    {
      name: "Tkanina",
      values: ["Sawana 21", "Riviera 16"],
      value_prices: { "Riviera 16": 200 },
    },
  ],
  combinations: [
    {
      values: { Tkanina: "Sawana 21" },
      stock: 3,
      price_modifier: 0,
      sale_price: 999,
      omnibus_price: 1200,
      images: ["a.jpg"],
    },
    { values: { Tkanina: "Riviera 16" }, stock: 1, price_modifier: 200 },
  ],
  overrides: { option_names: { Tkanina: "Materiał" } },
};

// Produkt z RĘCZNĄ opcją strony (uppercase, jak w prod DB).
const manualSideVariants: ProductVariants = {
  options: [{ name: "STRONA", values: ["LEWOSTRONNY", "PRAWOSTRONNY"] }],
  combinations: [
    { values: { STRONA: "LEWOSTRONNY" }, stock: 0, price_modifier: 0 },
    { values: { STRONA: "PRAWOSTRONNY" }, stock: 0, price_modifier: 0 },
  ],
};

describe("stałe — kanoniczne stringi", () => {
  it("nazwa opcji i wartości zgodne ze specem", () => {
    expect(CORNER_SIDE_OPTION_NAME).toBe("Strona");
    expect(CORNER_SIDE_VALUES).toEqual(["Lewostronny", "Prawostronny"]);
    expect(CORNER_SIDE_DEFAULT_CATEGORY).toBe("naroznik-l");
  });
});

describe("isCornerCategorySlug — kategorie narożników", () => {
  it("naroznik-l / narozniki / naroznik-u → true", () => {
    expect(isCornerCategorySlug("naroznik-l")).toBe(true);
    expect(isCornerCategorySlug("narozniki")).toBe(true);
    expect(isCornerCategorySlug("naroznik-u")).toBe(true);
  });
  it("pufy (slug przerobiony na narożniki U w prod DB) → true", () => {
    expect(isCornerCategorySlug("pufy")).toBe(true);
  });
  it("sofy / null / undefined / pusty → false", () => {
    expect(isCornerCategorySlug("sofy")).toBe(false);
    expect(isCornerCategorySlug(null)).toBe(false);
    expect(isCornerCategorySlug(undefined)).toBe(false);
    expect(isCornerCategorySlug("")).toBe(false);
  });
});

describe("isCornerSideOptionName — rozpoznawanie znormalizowane", () => {
  it("Strona / STRONA / ' strona ' / STRONA MEBLA → true", () => {
    expect(isCornerSideOptionName("Strona")).toBe(true);
    expect(isCornerSideOptionName("STRONA")).toBe(true);
    expect(isCornerSideOptionName(" strona ")).toBe(true);
    expect(isCornerSideOptionName("STRONA MEBLA")).toBe(true);
    expect(isCornerSideOptionName("strona mebla")).toBe(true);
  });
  it("Kolor / Tkanina / pusty → false", () => {
    expect(isCornerSideOptionName("Kolor")).toBe(false);
    expect(isCornerSideOptionName("Tkanina")).toBe(false);
    expect(isCornerSideOptionName("")).toBe(false);
  });
});

describe("cornerSideOf — mapowanie wartości na stronę", () => {
  it("Lewostronny / LEWOSTRONNY / LEWOSTORNNY (literówka z DB) / Lewa → left", () => {
    expect(cornerSideOf("Lewostronny")).toBe("left");
    expect(cornerSideOf("LEWOSTRONNY")).toBe("left");
    expect(cornerSideOf("LEWOSTORNNY")).toBe("left");
    expect(cornerSideOf("Lewa")).toBe("left");
    expect(cornerSideOf(" lewa ")).toBe("left");
  });
  it("Prawostronny / PRAWOSTRONNY / Prawa → right", () => {
    expect(cornerSideOf("Prawostronny")).toBe("right");
    expect(cornerSideOf("PRAWOSTRONNY")).toBe("right");
    expect(cornerSideOf("Prawa")).toBe("right");
  });
  it("wartość nierozpoznana (Sawana 21, pusty) → null", () => {
    expect(cornerSideOf("Sawana 21")).toBeNull();
    expect(cornerSideOf("")).toBeNull();
  });
});

describe("hasCornerSideOption", () => {
  it("null / bez opcji side-like → false", () => {
    expect(hasCornerSideOption(null)).toBe(false);
    expect(hasCornerSideOption(fabricVariants)).toBe(false);
  });
  it("ręczna opcja STRONA → true", () => {
    expect(hasCornerSideOption(manualSideVariants)).toBe(true);
  });
});

describe("applyCornerSideSelection — włączanie", () => {
  it("null → struktura z 1 opcją i 2 kombinacjami (stock 0)", () => {
    const r = applyCornerSideSelection(null, true);
    expect(r).not.toBeNull();
    expect(r!.options).toEqual([
      { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
    ]);
    expect(r!.combinations).toEqual([
      { values: { Strona: "Lewostronny" }, stock: 0, price_modifier: 0 },
      { values: { Strona: "Prawostronny" }, stock: 0, price_modifier: 0 },
    ]);
  });

  it("produkt z tkaninami → Strona jako PIERWSZA opcja, kombinacje ×2 z zachowaniem danych", () => {
    const r = applyCornerSideSelection(fabricVariants, true)!;
    expect(r.options.map((o) => o.name)).toEqual(["Strona", "Tkanina"]);
    expect(r.combinations).toHaveLength(4);
    // Dane kombinacji Sawana 21 skopiowane na OBIE strony (sale/omnibus/images/stock).
    const sawanaLewa = r.combinations.find(
      (c) => c.values.Strona === "Lewostronny" && c.values.Tkanina === "Sawana 21"
    )!;
    const sawanaPrawa = r.combinations.find(
      (c) => c.values.Strona === "Prawostronny" && c.values.Tkanina === "Sawana 21"
    )!;
    for (const combo of [sawanaLewa, sawanaPrawa]) {
      expect(combo.stock).toBe(3);
      expect(combo.sale_price).toBe(999);
      expect(combo.omnibus_price).toBe(1200);
      expect(combo.images).toEqual(["a.jpg"]);
      expect(combo.price_modifier).toBe(0);
    }
    // Dopłata per wartość (Riviera +200) przeliczona przez applyValuePricing.
    const rivieraLewa = r.combinations.find(
      (c) => c.values.Strona === "Lewostronny" && c.values.Tkanina === "Riviera 16"
    )!;
    expect(rivieraLewa.price_modifier).toBe(200);
    expect(rivieraLewa.stock).toBe(1);
    // Overrides przechodzą nietknięte.
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });

  it("idempotencja: produkt z ręczną opcją STRONA → bez zmian (nie dubluje)", () => {
    expect(applyCornerSideSelection(manualSideVariants, true)).toBe(manualSideVariants);
  });
});

describe("applyCornerSideSelection — wyłączanie", () => {
  it("strona + tkaniny → kolaps do kombinacji per tkanina (pierwsza pasująca), opcja usunięta", () => {
    const enabled = applyCornerSideSelection(fabricVariants, true)!;
    const r = applyCornerSideSelection(enabled, false)!;
    expect(r.options.map((o) => o.name)).toEqual(["Tkanina"]);
    expect(r.combinations).toHaveLength(2);
    const sawana = r.combinations.find((c) => c.values.Tkanina === "Sawana 21")!;
    expect(sawana.values).toEqual({ Tkanina: "Sawana 21" });
    expect(sawana.stock).toBe(3);
    expect(sawana.sale_price).toBe(999);
    expect(sawana.images).toEqual(["a.jpg"]);
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });

  it("strona jako jedyna opcja → null (produkt bez wariantów)", () => {
    expect(applyCornerSideSelection(manualSideVariants, false)).toBeNull();
  });

  it("idempotencja: null / bez opcji strony → bez zmian", () => {
    expect(applyCornerSideSelection(null, false)).toBeNull();
    expect(applyCornerSideSelection(fabricVariants, false)).toBe(fabricVariants);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILować**

Run (w `sklep-meblowy/`): `npx vitest run app/_lib/__tests__/corner-side.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/corner-side'` (lub equivalent resolve error).

- [ ] **Step 3: Napisz implementację**

Utwórz `sklep-meblowy/app/_lib/corner-side.ts`:

```ts
// Wybór strony narożnika (Lewostronny/Prawostronny) jako opcja wariantu
// o zarezerwowanej nazwie — wzorzec FABRIC_OPTION_NAME (variants.ts).
// Czyste funkcje (bez importu supabase/next) — testowalne w izolacji.
//
// Rozpoznawanie jest ZNORMALIZOWANE (trim + uppercase), bo katalog ma już
// ręcznie dodane opcje "STRONA"/"Strona"/"STRONA MEBLA" z wartościami
// "LEWOSTRONNY"/"Lewa"/… (w tym literówkę "LEWOSTORNNY") — te produkty
// dostają graficzny picker bez zmiany swoich danych.

import type { ProductOption, ProductVariant, ProductVariants } from "./types";
import { applyValuePricing, rebuildCombinations, variantKey } from "./variants";

// Kanoniczna postać opcji dodawanej przez toggle admina / backfill / nowy produkt.
export const CORNER_SIDE_OPTION_NAME = "Strona";
export const CORNER_SIDE_VALUES = ["Lewostronny", "Prawostronny"];

// Kategoria, której produkty dostają wybór strony domyślnie (decyzja: opt-out).
export const CORNER_SIDE_DEFAULT_CATEGORY = "naroznik-l";

// Slugi kategorii narożników spoza wzorca "naroznik*" — prod DB ma slug "pufy"
// przerobiony na narożniki U (CATEGORY_LABEL_DE: pufy → "U-förmiges Ecksofa").
const EXTRA_CORNER_CATEGORY_SLUGS = new Set(["pufy"]);

// Czy kategoria to narożnik — steruje widocznością toggle'a w adminie.
export function isCornerCategorySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = slug.trim().toLowerCase();
  return s.includes("naroznik") || EXTRA_CORNER_CATEGORY_SLUGS.has(s);
}

// Nazwy opcji rozpoznawane jako "strona narożnika" (po znormalizowaniu).
const SIDE_OPTION_NAMES = new Set(["STRONA", "STRONA MEBLA"]);

export function isCornerSideOptionName(name: string): boolean {
  return SIDE_OPTION_NAMES.has(name.trim().toUpperCase());
}

// Która strona? Po prefiksie znormalizowanej wartości — pokrywa "Lewostronny",
// "LEWOSTRONNY", "LEWOSTORNNY" (literówka w DB), "Lewa", "Prawa" itd.
// null = wartość nierozpoznana (picker pokaże dla niej zwykły chip tekstowy).
export type CornerSide = "left" | "right";

export function cornerSideOf(value: string): CornerSide | null {
  const v = value.trim().toUpperCase();
  if (v.startsWith("LEW")) return "left";
  if (v.startsWith("PRAW")) return "right";
  return null;
}

// Czy produkt ma już opcję strony (dowolną side-like, także ręczną).
export function hasCornerSideOption(variants: ProductVariants | null): boolean {
  return !!variants && variants.options.some((o) => isCornerSideOptionName(o.name));
}

// Włącza/wyłącza wybór strony. Idempotentne w obie strony (bez zmian, gdy
// stan docelowy już zastany — zwraca wejście bez kopiowania).
//
// Włączanie: kanoniczna opcja "Strona" jako PIERWSZA (nad "Tkanina"), a istniejące
// kombinacje są rozmnażane ×2 z ZACHOWANIEM stock/price_modifier/sale_price/
// omnibus_price/images (strona nie zmienia ceny → duplikacja jest poprawna).
// Świadomie NIE rebuildCombinations dla istniejących kombinacji — zmiana klucza
// variantKey wyzerowałaby promocje i zdjęcia ustawione przez admina.
//
// Wyłączanie: usuwa opcje side-like; kombinacje kolapsują do pierwszej
// pasującej per pozostały klucz. Ostatnia opcja → null (produkt bez wariantów).
export function applyCornerSideSelection(
  variants: ProductVariants | null,
  enabled: boolean
): ProductVariants | null {
  if (enabled) {
    if (hasCornerSideOption(variants)) return variants;
    const base = variants ?? { options: [], combinations: [] };
    const sideOption: ProductOption = {
      name: CORNER_SIDE_OPTION_NAME,
      values: [...CORNER_SIDE_VALUES],
    };
    const options = [sideOption, ...base.options];
    const combinations =
      base.combinations.length > 0
        ? CORNER_SIDE_VALUES.flatMap((side) =>
            base.combinations.map((c) => ({
              ...c,
              values: { ...c.values, [CORNER_SIDE_OPTION_NAME]: side },
            }))
          )
        : rebuildCombinations(options, []);
    return {
      ...base,
      options,
      combinations: applyValuePricing(options, combinations),
    };
  }

  if (!variants || !hasCornerSideOption(variants)) return variants;
  const options = variants.options.filter((o) => !isCornerSideOptionName(o.name));
  if (options.length === 0) return null;
  const removedNames = new Set(
    variants.options
      .filter((o) => isCornerSideOptionName(o.name))
      .map((o) => o.name)
  );
  const seen = new Set<string>();
  const collapsed: ProductVariant[] = [];
  for (const c of variants.combinations) {
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.values)) {
      if (!removedNames.has(k)) values[k] = v;
    }
    const key = variantKey(values);
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push({ ...c, values });
  }
  return {
    ...variants,
    options,
    combinations: applyValuePricing(options, collapsed),
  };
}
```

- [ ] **Step 4: Uruchom test — ma przechodzić**

Run: `npx vitest run app/_lib/__tests__/corner-side.test.ts`
Expected: PASS (wszystkie testy zielone).

- [ ] **Step 5: Pełna suita (regresje)**

Run: `npm test`
Expected: 313 + nowe testy, wszystkie PASS.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/corner-side.ts sklep-meblowy/app/_lib/__tests__/corner-side.test.ts
git commit -m "feat(naroznik): czysty modul corner-side — rozpoznawanie i toggle opcji Strona"
```

---

### Task 2: Grafiki SVG we właściwym `public/`

**Files:**
- Create: `sklep-meblowy/public/naroznik-lewostronny.svg`
- Create: `sklep-meblowy/public/naroznik-prawostronny.svg`
- Delete: `public/naroznik-lewostronny.svg` (korzeń repo)
- Delete: `public/naroznik-prawostronny.svg` (korzeń repo)

**Interfaces:**
- Produces: statyczne assety pod URL `/naroznik-lewostronny.svg` i `/naroznik-prawostronny.svg` (używane w Task 4). ViewBox `0 0 200 190` (proporcja dla `width={200} height={190}`).

Zmiany vs oryginały z korzenia repo: usunięty `<text>Lewy/Prawy</text>` (etykieta idzie z HTML w języku strony — w SVG świeciłby polski napis na /de), usunięte `role`/`aria-label`/`<title>` (grafika dekoracyjna, `alt` kontrolujemy w HTML), viewBox przycięty z `0 0 200 208` do `0 0 200 190` (po usunięciu podpisu dół był pusty). Figurka osoby zostaje — punkt odniesienia „patrząc od frontu". Prawostronny = lustro korpusu lewego (`translate(200,0) scale(-1,1)`); figurka nieodbita.

- [ ] **Step 1: Utwórz `sklep-meblowy/public/naroznik-lewostronny.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190">
  <!-- korpus (navy) -->
  <g fill="#1a1a2e">
    <rect x="44" y="30" width="150" height="58" rx="12"/>
    <rect x="44" y="30" width="54" height="100" rx="12"/>
  </g>
  <!-- siedziska (gold) -->
  <g fill="#c9a84c">
    <rect x="60" y="46" width="126" height="42" rx="8"/>
    <rect x="60" y="46" width="38" height="84" rx="8"/>
  </g>
  <!-- podziały poduszek -->
  <g stroke="#1a1a2e" stroke-opacity="0.22" stroke-width="2" stroke-linecap="round">
    <line x1="98" y1="50" x2="98" y2="84"/>
    <line x1="140" y1="50" x2="140" y2="84"/>
    <line x1="64" y1="95" x2="94" y2="95"/>
    <line x1="64" y1="118" x2="94" y2="118"/>
  </g>
  <!-- osoba patrząca od frontu (punkt odniesienia stron) -->
  <path d="M94 148 L100 142 L106 148" fill="none" stroke="#1a1a2e" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#1a1a2e" fill-opacity="0.8">
    <circle cx="100" cy="160" r="6"/>
    <path d="M88 176 a12 10 0 0 1 24 0 Z"/>
  </g>
</svg>
```

- [ ] **Step 2: Utwórz `sklep-meblowy/public/naroznik-prawostronny.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 190">
  <!-- korpus (navy) — odbity względem osi pionowej -->
  <g transform="translate(200,0) scale(-1,1)">
    <g fill="#1a1a2e">
      <rect x="44" y="30" width="150" height="58" rx="12"/>
      <rect x="44" y="30" width="54" height="100" rx="12"/>
    </g>
    <g fill="#c9a84c">
      <rect x="60" y="46" width="126" height="42" rx="8"/>
      <rect x="60" y="46" width="38" height="84" rx="8"/>
    </g>
    <g stroke="#1a1a2e" stroke-opacity="0.22" stroke-width="2" stroke-linecap="round">
      <line x1="98" y1="50" x2="98" y2="84"/>
      <line x1="140" y1="50" x2="140" y2="84"/>
      <line x1="64" y1="95" x2="94" y2="95"/>
      <line x1="64" y1="118" x2="94" y2="118"/>
    </g>
  </g>
  <!-- osoba patrząca od frontu (punkt odniesienia stron) -->
  <path d="M94 148 L100 142 L106 148" fill="none" stroke="#1a1a2e" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#1a1a2e" fill-opacity="0.8">
    <circle cx="100" cy="160" r="6"/>
    <path d="M88 176 a12 10 0 0 1 24 0 Z"/>
  </g>
</svg>
```

- [ ] **Step 3: Usuń kopie z korzenia repo (jedno źródło prawdy)**

```bash
git rm public/naroznik-lewostronny.svg public/naroznik-prawostronny.svg
```

- [ ] **Step 4: Weryfikacja**

Run (bash, w korzeniu repo): `ls sklep-meblowy/public/naroznik-*.svg && ls public/naroznik-*.svg 2>&1 | tail -1`
Expected: dwa pliki w `sklep-meblowy/public/`, brak w korzeniu (`No such file or directory`).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/public/naroznik-lewostronny.svg sklep-meblowy/public/naroznik-prawostronny.svg
git commit -m "feat(naroznik): grafiki stron do serwowanego public/ (bez wtopionego tekstu PL)"
```

---

### Task 3: i18n — mapy DE + klucz podpowiedzi (TDD)

**Files:**
- Modify: `sklep-meblowy/app/_lib/de-content-maps.ts` (VARIANT_VALUE_DE: 2 wpisy)
- Modify: `sklep-meblowy/app/_lib/__tests__/de-content-maps.test.ts` (snapshot DB_VARIANT_VALUES: 2 wpisy)
- Modify: `sklep-meblowy/app/_lib/dictionaries/pl.ts` (typ + wartość `product.cornerSideHint`)
- Modify: `sklep-meblowy/app/_lib/dictionaries/de.ts` (wartość `product.cornerSideHint`)

**Interfaces:**
- Produces: `t.product.cornerSideHint` (string, PL: `"Strony pokazane patrząc od frontu"`, DE: `"Seiten von vorne betrachtet"`) — używane w Task 4. Tłumaczenia wartości `Lewostronny→Links`, `Prawostronny→Rechts` działają automatycznie przez istniejące `mapDe(VARIANT_VALUE_DE, …)` w `VariantSelector`/`formatVariantLabel`.

- [ ] **Step 1: Rozszerz snapshot testu (failing test first)**

W `sklep-meblowy/app/_lib/__tests__/de-content-maps.test.ts` w tablicy `DB_VARIANT_VALUES` po linii `"Lewa",` dodaj `"Lewostronny",`, a po linii `"Prawa",` dodaj `"Prawostronny",`:

```ts
  "LEWOSTRONNY",
  "Lewa",
  "Lewostronny",
  "METALOWY",
  "PRAWOSTRONNY",
  "Prawa",
  "Prawostronny",
```

- [ ] **Step 2: Uruchom test — ma FAILować**

Run: `npx vitest run app/_lib/__tests__/de-content-maps.test.ts`
Expected: FAIL — `variant value: każda wartość z katalogu ma tłumaczenie DE` z missing `["Lewostronny", "Prawostronny"]`.

- [ ] **Step 3: Dodaj wpisy do mapy**

W `sklep-meblowy/app/_lib/de-content-maps.ts` w `VARIANT_VALUE_DE` po linii `Lewa: "Links",` dodaj `Lewostronny: "Links",`, a po linii `Prawa: "Rechts",` dodaj `Prawostronny: "Rechts",`:

```ts
  LEWOSTRONNY: "LINKS",
  LEWOSTORNNY: "LINKS",
  Lewa: "Links",
  Lewostronny: "Links",
  METALOWY: "METALL",
  PRAWOSTRONNY: "RECHTS",
  Prawa: "Rechts",
  Prawostronny: "Rechts",
```

- [ ] **Step 4: Uruchom test — ma przechodzić**

Run: `npx vitest run app/_lib/__tests__/de-content-maps.test.ts`
Expected: PASS.

- [ ] **Step 5: Klucz słownika PL + DE (razem — test parytetu wymusza oba)**

W `sklep-meblowy/app/_lib/dictionaries/pl.ts`:

(a) w typie `PlShape.product` po linii `selectVariant: string;` dodaj:

```ts
    cornerSideHint: string;
```

(b) w obiekcie `pl.product` po linii `selectVariant: "Wybierz wariant",` dodaj:

```ts
    cornerSideHint: "Strony pokazane patrząc od frontu",
```

W `sklep-meblowy/app/_lib/dictionaries/de.ts` w sekcji `product` po linii `selectVariant: "Variante wählen",` dodaj:

```ts
    cornerSideHint: "Seiten von vorne betrachtet",
```

- [ ] **Step 6: Pełna suita (parytet słowników + snapshoty)**

Run: `npm test`
Expected: PASS (w tym `dictionaries.test.ts` — parytet PL/DE).

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/_lib/de-content-maps.ts sklep-meblowy/app/_lib/__tests__/de-content-maps.test.ts sklep-meblowy/app/_lib/dictionaries/pl.ts sklep-meblowy/app/_lib/dictionaries/de.ts
git commit -m "feat(naroznik): tlumaczenia DE Lewostronny/Prawostronny + klucz podpowiedzi cornerSideHint"
```

---

### Task 4: Karta produktu — `CornerSideGroup` w `VariantSelector`

**Files:**
- Modify: `sklep-meblowy/app/_components/ui/VariantSelector.tsx`

**Interfaces:**
- Consumes: `isCornerSideOptionName`, `cornerSideOf`, `type CornerSide` (Task 1); assety `/naroznik-*.svg` (Task 2); `t.product.cornerSideHint` (Task 3); istniejące `getValueLabel`, `formatMoney`, `pick`.
- Produces: opcja side-like renderuje się jako dwa kafelki z grafiką zamiast chipów. Zero zmian w propsach `VariantSelector` (Props bez zmian) — nic w `ProductActions`/`ProductMainSection` nie trzeba ruszać.

- [ ] **Step 1: Importy + słownik**

W `sklep-meblowy/app/_components/ui/VariantSelector.tsx`:

(a) po linii `import { useState } from "react";` dodaj:

```tsx
import Image from "next/image";
```

(b) po linii `import { FABRIC_OPTION_NAME } from "@/app/_lib/variants";` dodaj:

```tsx
import {
  cornerSideOf,
  isCornerSideOptionName,
  type CornerSide,
} from "@/app/_lib/corner-side";
import { getDictionary } from "@/app/_lib/dictionaries";
```

(c) w komponencie `VariantSelector` po linii `const rate = useEurRate();` dodaj:

```tsx
  const t = getDictionary(locale);
```

- [ ] **Step 2: Branch renderowania opcji strony**

W `VariantSelector` zamień początek istniejącego ternary (linia `{option.name === FABRIC_OPTION_NAME ? (` … aż do `) : (` przed `<div className="flex flex-wrap gap-2">`) tak, żeby powstał łańcuch trzech gałęzi — po gałęzi tkanin wstaw gałąź strony:

```tsx
            {option.name === FABRIC_OPTION_NAME ? (
              <FabricSwatchGroup
                values={option.values}
                current={current}
                valuePrices={option.value_prices}
                images={fabricImages}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : isCornerSideOptionName(option.name) ? (
              <CornerSideGroup
                values={option.values}
                current={current}
                valuePrices={option.value_prices}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                hint={t.product.cornerSideHint}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : (
```

(reszta — istniejące chipy — bez zmian).

- [ ] **Step 3: Komponent `CornerSideGroup`**

Na końcu pliku `VariantSelector.tsx` (po `FabricSwatchGroup`) dodaj:

```tsx
// Grafiki stron narożnika (statyczne SVG z public/, językowo neutralne —
// etykieta pod kafelkiem idzie z wartości opcji przez overrides → mapy DE).
const CORNER_SIDE_IMAGES: Record<CornerSide, string> = {
  left: "/naroznik-lewostronny.svg",
  right: "/naroznik-prawostronny.svg",
};

// Opcja „Strona" (narożnik lewostronny/prawostronny) jako dwa kafelki z grafiką
// mebla — wzorzec FabricSwatchGroup (aria-pressed, złota obwódka aktywnego).
// Kremowe tło kafelka (#ECE4D7, kolor brandowy) — granatowy korpus czytelny
// także w dark mode. Wartość nierozpoznana przez cornerSideOf → chip tekstowy.
function CornerSideGroup({
  values,
  current,
  valuePrices,
  labelOf,
  hint,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  labelOf: (v: string) => string;
  hint: string;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {values.map((v) => {
          const side = cornerSideOf(v);
          const active = current === v;
          const label = labelOf(v);
          const surcharge = valuePrices?.[v] ?? 0;
          if (!side) {
            return (
              <button
                key={v}
                type="button"
                onClick={() => onPick(v)}
                aria-pressed={active}
                className={`px-4 py-2 text-sm font-sans rounded-full border transition-colors ${
                  active
                    ? "border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                    : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
                }`}
              >
                {label}
              </button>
            );
          }
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-colors ${
                active
                  ? "border-[var(--color-gold)]"
                  : "border-[var(--border)] hover:border-[var(--color-gold)]"
              }`}
            >
              <span className="w-full rounded-xl bg-[#ECE4D7] p-2">
                <Image
                  src={CORNER_SIDE_IMAGES[side]}
                  alt=""
                  width={200}
                  height={190}
                  className="w-full h-auto"
                />
              </span>
              <span
                className={`text-xs leading-tight ${
                  active ? "text-[var(--color-gold)] font-semibold" : "text-[var(--fg)]"
                }`}
              >
                {label}
                {surcharge !== 0 && (
                  <span className={active ? "opacity-80" : "text-[var(--muted)]"}>
                    {" "}
                    ({surcharge > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(surcharge), locale, rate)})
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--muted)] mt-2">{hint}</p>
    </div>
  );
}
```

- [ ] **Step 4: Lint + testy**

Run: `npm run lint && npm test`
Expected: lint bez błędów, testy PASS.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_components/ui/VariantSelector.tsx
git commit -m "feat(naroznik): graficzny picker strony narożnika na karcie produktu"
```

---

### Task 5: Admin — toggle w `VariantsEditor`

**Files:**
- Modify: `sklep-meblowy/app/admin/produkty/[id]/VariantsEditor.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/[id]/ProductEditor.tsx` (1 linia — nowy props)

**Interfaces:**
- Consumes: `applyCornerSideSelection`, `hasCornerSideOption`, `isCornerCategorySlug` (Task 1); istniejący stan `variants`/`setVariants` i zapis `updateProductVariants`.
- Produces: `VariantsEditor` przyjmuje nowy props `categorySlug: string`. Toggle działa na LOKALNYM stanie edytora — zapis wyłącznie istniejącym przyciskiem „Zapisz warianty" (dziedziczy dirty-detection, walidację serwerową, revalidatePath).

- [ ] **Step 1: Props + importy w `VariantsEditor.tsx`**

(a) Po istniejącym imporcie z `@/app/_lib/variants` (blok kończący się `} from "@/app/_lib/variants";`) dodaj:

```tsx
import {
  applyCornerSideSelection,
  hasCornerSideOption,
  isCornerCategorySlug,
} from "@/app/_lib/corner-side";
```

(b) W sygnaturze komponentu dodaj props `categorySlug` (po `basePrice`):

```tsx
export default function VariantsEditor({
  productId,
  initial,
  basePrice,
  categorySlug,
  fabrics,
  onToast,
}: {
  productId: string;
  initial: ProductVariants | null;
  basePrice: number;
  categorySlug: string;
  fabrics: Fabric[];
  onToast: (t: Toast) => void;
}) {
```

(c) Po linii `const confirm = useConfirm();` dodaj:

```tsx
  // Wybór strony narożnika: stan = obecność opcji side-like (także ręcznej
  // "STRONA"/"STRONA MEBLA"). Toggle widoczny dla kategorii narożników albo
  // gdy produkt już ma opcję strony (żeby dało się ją wyłączyć po zmianie kategorii).
  const sideEnabled = hasCornerSideOption(variants);
  const showCornerToggle = isCornerCategorySlug(categorySlug) || sideEnabled;

  function toggleCornerSide(enabled: boolean) {
    setVariants(applyCornerSideSelection(variants, enabled));
  }
```

- [ ] **Step 2: Toggle w głównym edytorze (sekcja „Opcje")**

Po przycisku „Wybierz z katalogu tkanin" (button z `onClick={() => setFabricPickerOpen(true)}` kończący się `</button>`) dodaj:

```tsx
        {showCornerToggle && (
          <label className="self-start flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
            <input
              type="checkbox"
              checked={sideEnabled}
              onChange={(e) => toggleCornerSide(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            Wybór strony narożnika (Lewostronny/Prawostronny)
          </label>
        )}
```

- [ ] **Step 3: Przycisk w stanie pustym (variants === null)**

W bloku `if (!variants)` po przycisku „+ Dodaj tkaniny z katalogu" (button kończący się `</button>` przed `</div>`) dodaj:

```tsx
          {isCornerCategorySlug(categorySlug) && (
            <button
              type="button"
              onClick={() => setVariants(applyCornerSideSelection(null, true))}
              className="px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
            >
              + Dodaj wybór strony (Lewostronny/Prawostronny)
            </button>
          )}
```

- [ ] **Step 4: Przekaż kategorię z `ProductEditor.tsx`**

Zamień linię:

```tsx
      <VariantsEditor productId={product.id} initial={product.variants} basePrice={product.price} fabrics={fabrics} onToast={showToast} />
```

na:

```tsx
      <VariantsEditor productId={product.id} initial={product.variants} basePrice={product.price} categorySlug={product.category} fabrics={fabrics} onToast={showToast} />
```

- [ ] **Step 5: Lint + testy**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "sklep-meblowy/app/admin/produkty/[id]/VariantsEditor.tsx" "sklep-meblowy/app/admin/produkty/[id]/ProductEditor.tsx"
git commit -m "feat(naroznik): toggle wyboru strony w edytorze wariantow (kategorie naroznikow)"
```

---

### Task 6: Nowe produkty `naroznik-l` — domyślnie z wyborem strony (TDD)

**Files:**
- Modify: `sklep-meblowy/app/_lib/new-product.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/new-product.test.ts`

**Interfaces:**
- Consumes: `applyCornerSideSelection`, `CORNER_SIDE_DEFAULT_CATEGORY` (Task 1).
- Produces: `NewProductPayload.variants: ProductVariants | null` (poszerzenie typu z `null`); `buildNewProductPayload` zwraca warianty z opcją Strona wyłącznie dla kategorii `naroznik-l`.

- [ ] **Step 1: Failing testy**

W `sklep-meblowy/app/_lib/__tests__/new-product.test.ts` dodaj na końcu `describe("buildNewProductPayload", …)` (przed zamykającym `});`):

```ts
  it("kategoria naroznik-l → domyślna opcja Strona (opt-out w adminie)", () => {
    const r = buildNewProductPayload({ ...valid, category: "naroznik-l" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.variants?.options).toEqual([
        { name: "Strona", values: ["Lewostronny", "Prawostronny"] },
      ]);
      expect(r.payload.variants?.combinations).toEqual([
        { values: { Strona: "Lewostronny" }, stock: 0, price_modifier: 0 },
        { values: { Strona: "Prawostronny" }, stock: 0, price_modifier: 0 },
      ]);
    }
  });

  it("inne kategorie narożników (narozniki, pufy) → variants null (opt-in przez toggle)", () => {
    for (const category of ["narozniki", "pufy", "sofy"]) {
      const r = buildNewProductPayload({ ...valid, category });
      expect(r.ok && r.payload.variants).toBeNull();
    }
  });
```

- [ ] **Step 2: Uruchom — ma FAILować**

Run: `npx vitest run app/_lib/__tests__/new-product.test.ts`
Expected: FAIL na pierwszym nowym teście (`variants` jest `null`).

- [ ] **Step 3: Implementacja**

W `sklep-meblowy/app/_lib/new-product.ts`:

(a) na górze pliku (po komentarzu nagłówkowym) dodaj importy:

```ts
import type { ProductVariants } from "./types";
import {
  applyCornerSideSelection,
  CORNER_SIDE_DEFAULT_CATEGORY,
} from "./corner-side";
```

(b) w typie `NewProductPayload` zamień `variants: null;` na:

```ts
  variants: ProductVariants | null;
```

(c) w zwracanym `payload` zamień `variants: null,` na:

```ts
      // Narożniki L dostają wybór strony domyślnie (decyzja: opt-out w adminie).
      variants:
        category === CORNER_SIDE_DEFAULT_CATEGORY
          ? applyCornerSideSelection(null, true)
          : null,
```

- [ ] **Step 4: Uruchom — ma przechodzić**

Run: `npx vitest run app/_lib/__tests__/new-product.test.ts`
Expected: PASS (stare i nowe testy).

- [ ] **Step 5: Pełna suita + commit**

Run: `npm test`
Expected: PASS.

```bash
git add sklep-meblowy/app/_lib/new-product.ts sklep-meblowy/app/_lib/__tests__/new-product.test.ts
git commit -m "feat(naroznik): nowe produkty naroznik-l z domyslnym wyborem strony"
```

---

### Task 7: Backfill — server action + tymczasowy przycisk w `/admin/produkty`

**Files:**
- Modify: `sklep-meblowy/app/admin/produkty/actions.ts` (nowa akcja)
- Create: `sklep-meblowy/app/admin/produkty/EnableCornerSideButton.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/page.tsx` (render przycisku)

**Interfaces:**
- Consumes: `applyCornerSideSelection`, `hasCornerSideOption`, `CORNER_SIDE_DEFAULT_CATEGORY` (Task 1); wzorce `requireAdmin`/`createAdminClient`/`revalidatePath`/`recordPriceHistory` (istniejące w actions.ts); `useConfirm` z `@/app/_context/ConfirmContext`.
- Produces: `enableCornerSideForCategory(): Promise<ActionResult>` — idempotentna (pomija produkty z opcją side-like). Przycisk TYMCZASOWY — po potwierdzonym wykonaniu na produkcji usunąć komponent + użycie osobnym commitem (inaczej ponowne kliknięcie nadpisze opt-outy adminów).

- [ ] **Step 1: Akcja w `actions.ts`**

(a) po linii `import { buildGroupKey, pickGroupKey } from "@/app/_lib/size-groups";` dodaj:

```ts
import {
  applyCornerSideSelection,
  hasCornerSideOption,
  CORNER_SIDE_DEFAULT_CATEGORY,
} from "@/app/_lib/corner-side";
```

(b) na końcu pliku dodaj:

```ts
// ============================================================
// enableCornerSideForCategory — JEDNORAZOWY backfill wyboru strony
// ============================================================
// Włącza opcję "Strona" (Lewostronny/Prawostronny) wszystkim produktom
// kategorii naroznik-l (decyzja: cała kategoria ON, opt-out per produkt).
// Idempotentna: produkty z JAKĄKOLWIEK opcją side-like (także ręczną
// "STRONA"/"STRONA MEBLA") są pomijane — ręczne warianty nietknięte.
// Po potwierdzonym wykonaniu na produkcji usunąć przycisk
// EnableCornerSideButton (ponowne kliknięcie nadpisałoby opt-outy).
export async function enableCornerSideForCategory(): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, variants")
    .eq("category", CORNER_SIDE_DEFAULT_CATEGORY);

  if (error) return { ok: false, error: error.message };

  type Row = { id: string; variants: ProductVariants | null };
  const rows = (data ?? []) as Row[];

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (hasCornerSideOption(row.variants)) {
      skipped++;
      continue;
    }
    const next = applyCornerSideSelection(row.variants, true);
    const { error: upErr } = await supabase
      .from("products")
      .update({ variants: next } as never)
      .eq("id", row.id);
    if (upErr) {
      return {
        ok: false,
        error: `Błąd przy produkcie ${row.id} (zaktualizowano wcześniej: ${updated}): ${upErr.message}`,
      };
    }
    await recordPriceHistory(row.id);
    revalidatePath(`/admin/produkty/${row.id}`);
    revalidatePath(`/produkt/${row.id}`);
    updated++;
  }

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  return {
    ok: true,
    message: `Włączono wybór strony: ${updated}, pominięto (już mają): ${skipped}, razem: ${rows.length}`,
  };
}
```

- [ ] **Step 2: Komponent przycisku**

Utwórz `sklep-meblowy/app/admin/produkty/EnableCornerSideButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { enableCornerSideForCategory } from "./actions";

// TYMCZASOWY przycisk backfillu (spec 2026-07-03-naroznik-strona): włącza wybór
// strony wszystkim produktom kategorii naroznik-l. Idempotentny (pomija produkty
// z opcją side-like), ale po potwierdzonym wykonaniu na produkcji USUNĄĆ ten
// komponent i jego użycie w page.tsx — ponowne kliknięcie za pół roku
// nadpisałoby świadome wyłączenia (opt-outy) adminów.
export default function EnableCornerSideButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();

  async function handleClick() {
    const ok = await confirm({
      message:
        "Włączyć wybór strony (Lewostronny/Prawostronny) wszystkim produktom kategorii naroznik-l? Produkty, które już mają opcję strony, zostaną pominięte.",
    });
    if (!ok) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await enableCornerSideForCategory();
      if (res.ok) setMsg(res.message ?? "Gotowe");
      else setErr(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="shrink-0 px-5 py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
      >
        {pending ? "Włączam..." : "Włącz wybór strony (narożniki L)"}
      </button>
      {msg && <span className="text-[10px] text-green-600">{msg}</span>}
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Render na liście produktów**

W `sklep-meblowy/app/admin/produkty/page.tsx`:

(a) po linii `import ToggleProductActiveButton from "./ToggleProductActiveButton";` dodaj:

```tsx
import EnableCornerSideButton from "./EnableCornerSideButton";
```

(b) zamień blok linku „+ Nowy produkt":

```tsx
        <Link
          href="/admin/produkty/nowy"
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowy produkt
        </Link>
```

na:

```tsx
        <div className="shrink-0 flex items-start gap-3">
          <EnableCornerSideButton />
          <Link
            href="/admin/produkty/nowy"
            className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            + Nowy produkt
          </Link>
        </div>
```

- [ ] **Step 4: Lint + testy**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/admin/produkty/actions.ts sklep-meblowy/app/admin/produkty/EnableCornerSideButton.tsx sklep-meblowy/app/admin/produkty/page.tsx
git commit -m "feat(naroznik): idempotentny backfill kategorii naroznik-l (tymczasowy przycisk w adminie)"
```

---

### Task 8: Weryfikacja końcowa + build

**Files:** brak nowych — weryfikacja.

- [ ] **Step 1: Pełna suita + lint**

Run (w `sklep-meblowy/`): `npm test && npm run lint`
Expected: wszystkie testy PASS (313 + nowe), lint czysty.

- [ ] **Step 2: Build produkcyjny**

Run: `npm run build`
Expected: build się kończy sukcesem. (Lokalne env to placeholdery — jeśli build wymaga realnych env, odnotować i polegać na buildzie Vercel preview; NIE commitować obejść env.)

- [ ] **Step 3: Weryfikacja manualna (runtime)**

Lokalny `.env.local` to placeholdery — pełny smoke wykonuje się na **Vercel preview** po wypchnięciu gałęzi:

1. `git push -u origin feat/naroznik-strona` (za zgodą użytkownika) → Vercel zbuduje preview.
2. Na preview: karta produktu narożnika z ręczną opcją STRONA → widać dwa kafelki SVG z podpisami; bez wyboru strony „Dodaj do koszyka" nieaktywne/walidowane; po wyborze pozycja w koszyku pokazuje `Strona: …`; na `/de` podpisy `Links`/`Rechts` i podpowiedź po niemiecku.
3. Admin → produkt narożnika → sekcja Warianty: checkbox „Wybór strony narożnika" zaznaczony dla produktów z opcją; odznaczenie + „Zapisz warianty" usuwa opcję (kombinacje kolapsują); ponowne zaznaczenie przywraca.
4. Admin → Produkty: przycisk „Włącz wybór strony (narożniki L)" — NIE klikać na produkcyjnych danych do czasu decyzji użytkownika o wdrożeniu (idempotentny, ale zmienia dane).

- [ ] **Step 4: Zakończenie gałęzi**

Użyć skilla superpowers:finishing-a-development-branch (opcje: merge do main / PR). Po wdrożeniu na produkcję i potwierdzonym kliknięciu backfillu — osobny commit usuwający `EnableCornerSideButton` (plik + import + render w `page.tsx`).

---

## Spec coverage (self-check)

| Wymaganie speca | Task |
|---|---|
| Czysty moduł corner-side (rozpoznawanie znormalizowane, expand z zachowaniem danych, kolaps, idempotencja) | 1 |
| Grafiki w serwowanym public/, bez tekstu PL, usunięte kopie z korzenia | 2 |
| Mapy DE `Lewostronny→Links`/`Prawostronny→Rechts` + snapshot; klucz `cornerSideHint` PL+DE | 3 |
| Graficzny picker (kafelki SVG, aria-pressed, złota obwódka, podpis przez overrides→DE, fallback chip, podpowiedź) | 4 |
| Wymagany wybór bez preselekcji | istniejąca walidacja (`isVariantSelectionComplete` + `AddToCartButton`) — zero zmian; smoke w Task 8 |
| Toggle w adminie tylko dla kategorii narożników, stan z opcji side-like, zapis przez „Zapisz warianty" | 5 |
| Nowe produkty naroznik-l auto-ON | 6 |
| Backfill idempotentny + tymczasowy przycisk + plan usunięcia | 7 |
| Przepływ koszyk→checkout→zamówienie→admin→reorder→DE bez zmian | architektura (opcja wariantu) — weryfikacja w Task 8 |
