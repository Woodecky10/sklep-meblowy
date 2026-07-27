# Cechy tkanin (wodoodporna / przyjazna zwierzętom / łatwa w czyszczeniu) — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin zaznacza przy tkaninie w `/admin/tkaniny` trzy cechy (wodoodporna, przyjazna zwierzętom, łatwa w czyszczeniu), a klient widzi je jako pigułki z podpisem przy wyborze tkaniny na karcie produktu.

**Architecture:** Cecha jest atrybutem rodziny tkaniny — nowa kolumna `fabrics.properties text[]` (migracja 63). Zestaw cech zamknięty w kodzie (`app/_lib/fabric-properties.ts`), bo każda nowa cecha i tak wymaga ikonki i tłumaczenia. Dane płyną istniejącą trasą: `buildFabricMetaMap` → `FabricValueMeta` → `getFabricMetaMap()` → `FabricMetaProvider` → `useFabricMeta()` w `VariantSelector`. Nowy komponent prezentacyjny `FabricPropertyBadges` renderuje pigułki w dwóch miejscach na karcie produktu.

**Tech Stack:** Next.js 16 (Turbopack, App Router), React 19, TypeScript, Tailwind, Supabase (Postgres), vitest (env **node** — tylko czyste funkcje), Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-cechy-tkanin-design.md`. Wszystko poza kartą produktu jest **poza zakresem**: `/tkaniny`, `/tkaniny/[slug]`, filtry na `/sklep`.
- Przeczytaj `AGENTS.md`: to nie jest Next.js z danych treningowych — po API sięgaj do `node_modules/next/dist/docs/`.
- Kody cech, dokładnie te trzy i w tej kolejności: `waterproof`, `pet_friendly`, `easy_clean`.
- Podpisy PL: „Wodoodporna", „Przyjazna zwierzętom", „Łatwa w czyszczeniu". Podpisy DE: „Wasserabweisend", „Tierfreundlich", „Pflegeleicht".
- Podpisy żyją w słowniku w kodzie (`app/_lib/dictionaries/pl.ts` i `de.ts`), **nigdy w bazie**.
- Vitest chodzi w środowisku `node` — testować wolno wyłącznie czyste funkcje bez importów server-only i bez DOM.
- Komentarze w kodzie po polsku, w stylu otaczających plików: zwięzłe, wyjaśniające DLACZEGO.
- Numer migracji: **63**. Ostatnia na `main` to `62_fabric_short_info.sql`.
- Pigułki pokazują się **tylko** w rozwiniętej liście tkanin i przy podpisie wybranej tkaniny. W widoku zwiniętym (pierwsze 5 próbek kolorów przed „Zobacz więcej") pigułek **nie ma** — tam kafelki to pojedyncze kolory, często z różnych rodzin, więc pigułki by się powielały.
- Nie commituj na `main`. Praca idzie na gałęzi `feat/cechy-tkanin` (już istnieje, ma commit ze specem).
- Po każdym zadaniu: `npx tsc --noEmit` i `npm test` muszą być zielone.

---

### Task 1: Czysty moduł cech tkanin

**Files:**
- Create: `app/_lib/fabric-properties.ts`
- Test: `app/_lib/__tests__/fabric-properties.test.ts`

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces:
  - `type FabricPropertyCode = "waterproof" | "pet_friendly" | "easy_clean"`
  - `const FABRIC_PROPERTY_CODES: readonly FabricPropertyCode[]`
  - `function parseFabricProperties(input: unknown): FabricPropertyCode[]`

- [ ] **Step 1: Write the failing test**

Utwórz `app/_lib/__tests__/fabric-properties.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FABRIC_PROPERTY_CODES,
  parseFabricProperties,
} from "@/app/_lib/fabric-properties";

describe("FABRIC_PROPERTY_CODES", () => {
  it("to dokładnie trzy kody w ustalonej kolejności wyświetlania", () => {
    expect([...FABRIC_PROPERTY_CODES]).toEqual([
      "waterproof",
      "pet_friendly",
      "easy_clean",
    ]);
  });
});

describe("parseFabricProperties", () => {
  it("przepuszcza znane kody", () => {
    expect(parseFabricProperties(["waterproof", "easy_clean"])).toEqual([
      "waterproof",
      "easy_clean",
    ]);
  });

  it("zwraca kody w stałej kolejności niezależnie od kolejności wejścia", () => {
    expect(parseFabricProperties(["easy_clean", "waterproof"])).toEqual([
      "waterproof",
      "easy_clean",
    ]);
  });

  it("odsiewa nieznane kody", () => {
    expect(parseFabricProperties(["waterproof", "teleportacja"])).toEqual([
      "waterproof",
    ]);
  });

  it("usuwa duplikaty", () => {
    expect(parseFabricProperties(["waterproof", "waterproof"])).toEqual([
      "waterproof",
    ]);
  });

  it("przycina białe znaki wokół kodu", () => {
    expect(parseFabricProperties([" pet_friendly "])).toEqual(["pet_friendly"]);
  });

  it("pomija elementy nie-stringowe", () => {
    expect(parseFabricProperties([1, null, {}, "easy_clean"])).toEqual([
      "easy_clean",
    ]);
  });

  it("wejście nie-tablicowe → pusta lista (stary cache, null z bazy)", () => {
    expect(parseFabricProperties(null)).toEqual([]);
    expect(parseFabricProperties(undefined)).toEqual([]);
    expect(parseFabricProperties("waterproof")).toEqual([]);
    expect(parseFabricProperties({ waterproof: true })).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const input = ["easy_clean", "waterproof"];
    const snapshot = JSON.stringify(input);
    parseFabricProperties(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/fabric-properties.test.ts`
Expected: FAIL — `Cannot find package '@/app/_lib/fabric-properties'`.

- [ ] **Step 3: Write minimal implementation**

Utwórz `app/_lib/fabric-properties.ts`:

```ts
// Cechy tkaniny pokazywane klientowi jako pigułki przy wyborze tkaniny
// (wodoodporna / przyjazna zwierzętom / łatwa w czyszczeniu). Czysty moduł
// (zero importów server-only) — testowalny w vitest (env node).
//
// Zestaw jest ZAMKNIĘTY i trzyma się w kodzie, nie w bazie: każda nowa cecha
// wymaga własnej ikonki i tłumaczenia PL/DE, czyli i tak zmiany w kodzie —
// słownik z CRUD-em w adminie niczego by nie oszczędził. W bazie leżą same
// kody (fabrics.properties text[]).

export type FabricPropertyCode = "waterproof" | "pet_friendly" | "easy_clean";

// Kolejność = kolejność wyświetlania pigułek. parseFabricProperties zwraca
// wynik zawsze w tej kolejności, więc render nie zależy od kolejności zapisu.
export const FABRIC_PROPERTY_CODES: readonly FabricPropertyCode[] = [
  "waterproof",
  "pet_friendly",
  "easy_clean",
];

// Wejście defensywne: kolumna może przyjść jako null (stary cache) albo z
// kodem, którego już nie znamy (usunięta cecha) — nic z tego nie może wysypać
// karty produktu.
export function parseFabricProperties(input: unknown): FabricPropertyCode[] {
  if (!Array.isArray(input)) return [];
  const found = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    found.add(item.trim());
  }
  return FABRIC_PROPERTY_CODES.filter((code) => found.has(code));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/fabric-properties.test.ts`
Expected: PASS (9 testów).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-properties.ts app/_lib/__tests__/fabric-properties.test.ts
git commit -m "feat(tkaniny): czysty moduł kodów cech tkanin"
```

---

### Task 2: Kolumna w bazie i cechy w metadanych tkaniny

**Files:**
- Create: `supabase/migrations/63_fabric_properties.sql`
- Modify: `app/_lib/types.ts` (typ `Fabric`, po polu `short_info_de`)
- Modify: `app/_lib/variants.ts:354` (typ `FabricValueMeta`) i `app/_lib/variants.ts:368` (`buildFabricMetaMap`)
- Test: `app/_lib/__tests__/variants.test.ts` (dopisać `describe` obok istniejącego „buildFabricMetaMap — krótkie info", linia ~168)

**Interfaces:**
- Consumes: `parseFabricProperties`, `FabricPropertyCode` z Task 1.
- Produces: `FabricValueMeta.properties: FabricPropertyCode[]` — czyta je Task 4.

- [ ] **Step 1: Write the failing test**

Dopisz w `app/_lib/__tests__/variants.test.ts` (import `buildFabricMetaMap` już tam jest, linia 19):

```ts
  describe("buildFabricMetaMap — cechy tkaniny", () => {
    it("przenosi cechy z kolumny properties na każdą wartość rodziny", () => {
      const map = buildFabricMetaMap(
        [
          {
            name: "Inari",
            colors: ["22", "23"],
            slug: "inari",
            group_id: "g1",
            properties: ["easy_clean", "waterproof"],
          },
        ],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }]
      );
      expect(map["Inari 22"].properties).toEqual(["waterproof", "easy_clean"]);
      expect(map["Inari 23"].properties).toEqual(["waterproof", "easy_clean"]);
    });

    it("brak kolumny properties (stary cache) → pusta lista, bez wyjątku", () => {
      const map = buildFabricMetaMap(
        [{ name: "Kronos", colors: ["01"], slug: "kronos", group_id: "g1" }],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }]
      );
      expect(map["Kronos 01"].properties).toEqual([]);
    });

    it("nieznany kod w bazie jest odsiewany", () => {
      const map = buildFabricMetaMap(
        [
          {
            name: "Poso",
            colors: ["105"],
            slug: "poso",
            group_id: "g1",
            properties: ["waterproof", "nieznana_cecha"],
          },
        ],
        [{ id: "g1", code: "std", name: "Standard", name_de: null, surcharge: 0, sort_order: 1 }]
      );
      expect(map["Poso 105"].properties).toEqual(["waterproof"]);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — TypeScript/asercja na nieistniejącym polu `properties` (`expected undefined to deeply equal [...]`).

- [ ] **Step 3: Write minimal implementation**

3a. Utwórz `supabase/migrations/63_fabric_properties.sql`:

```sql
-- Migracja 63: cechy tkaniny pokazywane klientowi przy wyborze tkaniny
-- (wodoodporna / przyjazna zwierzetom / latwa w czyszczeniu).
-- Kody trzymane w kodzie aplikacji (app/_lib/fabric-properties.ts); tu leza
-- tylko zaznaczenia. Domyslnie pusto = zadna cecha sie nie pokazuje.
alter table fabrics
  add column if not exists properties text[] not null default '{}';
```

3b. W `app/_lib/types.ts`, w typie `Fabric`, zaraz po polu `short_info_de`:

```ts
  // Cechy tkaniny (kody z app/_lib/fabric-properties.ts) — pigułki przy
  // wyborze tkaniny na karcie produktu. Pusto = nic się nie pokazuje.
  properties: string[];
```

3c. W `app/_lib/variants.ts` dodaj import na górze pliku (obok istniejących importów typów):

```ts
import { parseFabricProperties, type FabricPropertyCode } from "./fabric-properties";
```

3d. W typie `FabricValueMeta` (linia ~354) dopisz pole na końcu:

```ts
  properties: FabricPropertyCode[];
```

3e. W sygnaturze `buildFabricMetaMap` dopisz pole do typu wejściowego tkaniny (obok `short_info_de?: string | null;`):

```ts
    properties?: unknown;
```

3f. W obiekcie `meta` wewnątrz `buildFabricMetaMap` dopisz na końcu:

```ts
      properties: parseFabricProperties(f.properties),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts && npx tsc --noEmit`
Expected: testy PASS, `tsc` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/63_fabric_properties.sql app/_lib/types.ts app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "feat(tkaniny): kolumna properties + cechy w metadanych tkaniny"
```

**Uwaga:** migracji NIE zapuszczaj na bazę. To robi Mikołaj — wzorzec expand-first, przed merge'em.

---

### Task 3: Checkboxy cech w panelu admina

**Files:**
- Modify: `app/admin/tkaniny/FabricsEditor.tsx` (nowy blok pod polem „Krótkie info (DE)", linia ~353)
- Modify: `app/admin/tkaniny/actions.ts` (`createFabric` linia 160, `updateFabric` linia 210)

**Interfaces:**
- Consumes: `FABRIC_PROPERTY_CODES`, `parseFabricProperties` (Task 1), `Fabric.properties` (Task 2).
- Produces: pole formularza `properties` (checkboxy `value` = kod cechy) zapisywane do kolumny `properties`.

- [ ] **Step 1: Dodaj podpisy PL cech w panelu**

W `app/admin/tkaniny/FabricsEditor.tsx` dodaj import i stałą z podpisami (admin jest tylko po polsku, więc podpisy są lokalne dla tego pliku — słownik klienta z Task 4 dotyczy sklepu):

```tsx
import { FABRIC_PROPERTY_CODES, type FabricPropertyCode } from "@/app/_lib/fabric-properties";

// Podpisy checkboxów w panelu (admin jest wyłącznie po polsku). Podpisy dla
// klienta sklepu żyją w słowniku PL/DE — to dwa różne teksty i tak ma być.
const PROPERTY_LABELS_PL: Record<FabricPropertyCode, string> = {
  waterproof: "Wodoodporna",
  pet_friendly: "Przyjazna zwierzętom",
  easy_clean: "Łatwa w czyszczeniu",
};
```

- [ ] **Step 2: Dodaj blok checkboxów w formularzu**

Wstaw zaraz po `<Field label="Krótkie info (DE)" …>…</Field>` (kończy się w okolicy linii 353):

```tsx
      <Field
        label="Cechy tkaniny"
        hint="Pokazują się klientowi jako plakietki przy wyborze tkaniny. Zaznacz tylko to, co potwierdza producent."
      >
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {FABRIC_PROPERTY_CODES.map((code) => (
            <label key={code} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="properties"
                value={code}
                defaultChecked={(initial?.properties ?? []).includes(code)}
                className="w-4 h-4 accent-[var(--color-gold)]"
              />
              {PROPERTY_LABELS_PL[code]}
            </label>
          ))}
        </div>
      </Field>
```

- [ ] **Step 3: Zapis w akcjach**

W `app/admin/tkaniny/actions.ts` dodaj import:

```ts
import { parseFabricProperties } from "@/app/_lib/fabric-properties";
```

W `createFabric` **i** w `updateFabric`, obok pozostałych odczytów z `formData` (np. tuż pod linią z `shortInfoDe`):

```ts
  // Niezaznaczony checkbox nie trafia do FormData — getAll zwraca same
  // zaznaczone kody, parse odsiewa ewentualne śmieci z podrobionego requestu.
  const properties = parseFabricProperties(formData.getAll("properties"));
```

i dopisz `properties,` do obiektu przekazywanego do `.insert({…})` (w `createFabric`) oraz `.update({…})` (w `updateFabric`), obok `short_info_de`.

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit && npm test && npx eslint app/admin/tkaniny/FabricsEditor.tsx app/admin/tkaniny/actions.ts`
Expected: wszystko zielone.

Uwaga do ręcznego klik-testu (nie automatyzujemy — panel wymaga logowania): checkboxy zapisują się dopiero po zapuszczeniu migracji 63 na bazę.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tkaniny/FabricsEditor.tsx app/admin/tkaniny/actions.ts
git commit -m "feat(admin): checkboxy cech przy tkaninie"
```

---

### Task 4: Pigułki cech na karcie produktu

**Files:**
- Create: `app/_components/ui/FabricPropertyBadges.tsx`
- Modify: `app/_lib/dictionaries/pl.ts` (typ słownika, sekcja `fabrics` — linia ~92-103; wartości — linia ~436-448)
- Modify: `app/_lib/dictionaries/de.ts` (sekcja `fabrics` — linia ~100-112)
- Modify: `app/_components/ui/VariantSelector.tsx` (wiersz nazwy rodziny w `FabricSwatchGroup`, linia ~410-421; podpis wybranej wartości w `VariantSelector`, linia ~141-150)

**Interfaces:**
- Consumes: `FabricPropertyCode` (Task 1), `FabricValueMeta.properties` (Task 2).
- Produces: komponent `<FabricPropertyBadges codes={…} locale={…} />`.

- [ ] **Step 1: Dodaj klucze do słownika**

W `app/_lib/dictionaries/pl.ts`, w **typie** sekcji `fabrics` (po `notFoundTitle: string;`):

```ts
    propertyWaterproof: string;
    propertyPetFriendly: string;
    propertyEasyClean: string;
```

W `app/_lib/dictionaries/pl.ts`, w **wartościach** sekcji `fabrics` (po `notFoundTitle: "Tkanina nie znaleziona",`):

```ts
    propertyWaterproof: "Wodoodporna",
    propertyPetFriendly: "Przyjazna zwierzętom",
    propertyEasyClean: "Łatwa w czyszczeniu",
```

W `app/_lib/dictionaries/de.ts`, w sekcji `fabrics` (po `notFoundTitle: "Stoff nicht gefunden",`):

```ts
    propertyWaterproof: "Wasserabweisend",
    propertyPetFriendly: "Tierfreundlich",
    propertyEasyClean: "Pflegeleicht",
```

- [ ] **Step 2: Utwórz komponent pigułek**

Utwórz `app/_components/ui/FabricPropertyBadges.tsx`:

```tsx
import type { ReactNode } from "react";
import type { FabricPropertyCode } from "@/app/_lib/fabric-properties";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";

// Pigułki cech tkaniny (wodoodporna / przyjazna zwierzętom / łatwa
// w czyszczeniu) przy wyborze tkaniny na karcie produktu. Podpis jest w
// pigułce, nie w dymku — klient nie musi na nic najeżdżać ani zgadywać,
// co znaczy ikonka (decyzja z makiety, wariant B).
//
// Ikonki jako inline SVG: zero zewnętrznych zależności, dziedziczą kolor
// tekstu (currentColor) i skalują się z rozmiarem czcionki.

const ICONS: Record<FabricPropertyCode, ReactNode> = {
  waterproof: (
    <path d="M12 2.6c3.9 4.9 6.8 8 6.8 11.3A6.8 6.8 0 1 1 5.2 13.9C5.2 10.6 8.1 7.5 12 2.6z" />
  ),
  pet_friendly: (
    <>
      <circle cx="6.5" cy="9.5" r="2.3" />
      <circle cx="11" cy="6.6" r="2.3" />
      <circle cx="16" cy="7.6" r="2.3" />
      <circle cx="19" cy="12" r="2.1" />
      <path d="M12.4 12.2c2.6 0 5.3 2.4 5.3 4.8 0 1.7-1.4 2.7-3.2 2.7-1.2 0-1.6-.5-2.9-.5s-1.7.5-2.9.5c-1.8 0-3.2-1-3.2-2.7 0-2.4 2.7-4.8 5.3-4.8z" />
    </>
  ),
  easy_clean: (
    <path d="M12 2l1.7 4.6L18.3 8l-4.6 1.7L12 14.3l-1.7-4.6L5.7 8l4.6-1.4L12 2zm6 11l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9L18 13z" />
  ),
};

export default function FabricPropertyBadges({
  codes,
  locale,
}: {
  codes: FabricPropertyCode[];
  locale: Locale;
}) {
  // Brak cech → zero markupu (żadnego pustego wiersza pod nazwą tkaniny).
  if (codes.length === 0) return null;
  const t = getDictionary(locale);
  const labels: Record<FabricPropertyCode, string> = {
    waterproof: t.fabrics.propertyWaterproof,
    pet_friendly: t.fabrics.propertyPetFriendly,
    easy_clean: t.fabrics.propertyEasyClean,
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {codes.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-2 py-0.5 text-[11px] font-sans font-semibold text-[var(--color-gold-text)]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
            {ICONS[code]}
          </svg>
          {labels[code]}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 3: Osadź pigułki w liście tkanin**

W `app/_components/ui/VariantSelector.tsx` dodaj import:

```tsx
import FabricPropertyBadges from "./FabricPropertyBadges";
```

Osadzenie 1 — wiersz nazwy rodziny w `FabricSwatchGroup`. W typie `GroupBucket` pole `fabrics` przechowuje `{ slug, shortInfo, values }`; dołóż do niego cechy. W miejscu tworzenia wpisu (`bucket.fabrics.set(fabricName, {…})`) dopisz `properties: m?.properties ?? []`, a w typie `fabrics: Map<string, { slug: string | null; shortInfo: string | null; properties: FabricPropertyCode[]; values: string[] }>`. Import typu:

```tsx
import type { FabricPropertyCode } from "@/app/_lib/fabric-properties";
```

Następnie w `<p>` z nazwą rodziny (obok `entry.slug` i `entry.shortInfo`) dopisz jako ostatni element:

```tsx
                      <FabricPropertyBadges codes={entry.properties} locale={locale} />
```

Osadzenie 2 — podpis wybranej wartości. W `VariantSelector`, w akapicie `<p className="text-xs font-sans uppercase …">` renderującym `displayName` i wybraną wartość, po `<span>` z wartością dopisz:

```tsx
                {option.name === FABRIC_OPTION_NAME && current && (
                  <FabricPropertyBadges
                    codes={variantMeta[current]?.properties ?? []}
                    locale={locale}
                  />
                )}
```

gdzie `variantMeta` to już istniejące `useFabricMeta()` — w `VariantSelector` jest ono używane wewnątrz `FabricSwatchGroup`, więc w komponencie nadrzędnym dodaj `const variantMeta = useFabricMeta();` obok pozostałych hooków (`const fabricMap = useFabricLabels();` itd.).

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit && npm test && npx eslint app/_components/ui/FabricPropertyBadges.tsx app/_components/ui/VariantSelector.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts`
Expected: wszystko zielone. W repo jest test parytetu kluczy PL↔DE — jeśli zgłosi brak klucza, to znaczy, że któryś słownik został pominięty.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/FabricPropertyBadges.tsx app/_components/ui/VariantSelector.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(produkt): pigulki cech tkaniny przy wyborze tkaniny"
```

---

### Task 5: Test e2e i weryfikacja całości

**Files:**
- Create: `e2e/fabric-properties.spec.ts`
- Modify: `playwright.local.config.ts` (dopisz spec do `testMatch`)

**Interfaces:**
- Consumes: całość z Tasków 1-4.
- Produces: nic (test).

- [ ] **Step 1: Napisz test e2e**

Wzoruj się na `e2e/variant-tooltip.spec.ts` (ten sam styl, ta sama zgoda cookie w `addInitScript`). Test:

```ts
import { test, expect } from "@playwright/test";

// Cechy tkanin (spec 2026-07-27): pigułka „Wodoodporna"/„Przyjazna
// zwierzętom"/„Łatwa w czyszczeniu" pokazuje się przy rodzinie tkaniny
// w rozwiniętej liście na karcie produktu. Test pomija się, gdy w danych
// katalogu żadna tkanina nie ma jeszcze zaznaczonej cechy.
const PRODUCT_ID = "fe545101-de29-4a59-a012-c881e9971205";
const LABELS = ["Wodoodporna", "Przyjazna zwierzętom", "Łatwa w czyszczeniu"];

test("pigułki cech tkaniny są widoczne w rozwiniętej liście tkanin", async ({ page }) => {
  await page.goto(`/produkt/${PRODUCT_ID}`);

  // Rozwiń pełną listę tkanin („Zobacz więcej").
  const more = page.getByRole("button", { name: /Zobacz więcej/ });
  await more.waitFor({ state: "visible", timeout: 15_000 });
  await more.click();

  const anyBadge = page.getByText(new RegExp(LABELS.join("|")));
  const count = await anyBadge.count();
  test.skip(count === 0, "żadna tkanina nie ma jeszcze zaznaczonej cechy w katalogu");

  await expect(anyBadge.first()).toBeVisible();
});
```

- [ ] **Step 2: Dopisz spec do lokalnej konfiguracji**

W `playwright.local.config.ts` rozszerz `testMatch`:

```ts
  testMatch: /(corner-side|filter-pending|variant-tooltip|fabric-properties)\.spec\.ts/,
```

- [ ] **Step 3: Uruchom test lokalnie**

Odpal dev server (`npm run dev`, port 3000), potem:

```
E2E_BASE_URL=http://localhost:3000 npx playwright test --config=playwright.local.config.ts e2e/fabric-properties.spec.ts
```

Expected: PASS **albo** `skipped` z powodem — dopóki migracja 63 nie jest na bazie i nikt nie zaznaczył checkboxa, żadna tkanina cech nie ma, więc `skip` jest poprawnym wynikiem. NIE uruchamiaj domyślnej konfiguracji Playwrighta — celuje w produkcję.

- [ ] **Step 4: Pełna weryfikacja gałęzi**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: `tsc` czysto, wszystkie testy zielone (baseline 711 + nowe), build przechodzi.

- [ ] **Step 5: Commit**

```bash
git add e2e/fabric-properties.spec.ts playwright.local.config.ts
git commit -m "test(e2e): pigulki cech tkaniny na karcie produktu"
```

---

## Po planie (robi Mikołaj, nie subagent)

1. Zapuszczenie migracji **63** na Supabase (expand-first, przed merge'em).
2. Zaznaczenie cech przy tkaninach w `/admin/tkaniny` — dopóki tego nie ma, klient nie zobaczy żadnej pigułki i to jest zachowanie oczekiwane.
3. Klik-testy: karta produktu PL i `/de`, telefon (pigułki zawijają się do dwóch wierszy), tkanina bez cech (brak pustego wiersza).
