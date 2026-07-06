# Warianty bez kombinacji (model „tylko opcje") — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć per-kombinacja model wariantów; opcje służą tylko do wyboru, a cena = `product.price + dopłaty opcji`, zaś stan/promocja/Omnibus/zdjęcia są na poziomie produktu.

**Architecture:** Refaktor sekwencyjny „konsumenci najpierw, typ na końcu". Najpierw funkcje odczytu (`variants.ts`), checkout i historia cen przechodzą na poziom produktu (typ jeszcze niezmieniony). Potem edytor przestaje pokazywać/generować kombinacje (zapisuje `combinations: []`). Na końcu usuwamy pole `combinations`, typ `ProductVariant` i martwe funkcje. Dzięki temu `tsc` i testy są zielone po KAŻDYM tasku.

**Tech Stack:** Next.js 16 (Turbopack), React (client components), TypeScript, Vitest (node env, bez jsdom), Supabase (Postgres, JSONB `products.variants`), Stripe checkout.

## Global Constraints

- Panel admina po polsku (bez i18n). Kopie po polsku.
- Brak jsdom w testach → logika w czystych funkcjach (node env); komponenty React weryfikowane przez `tsc`/build.
- Konwencja testów: `describe`/`it` po polsku ze strzałką `→`; testy w `app/_lib/__tests__/`.
- Cena regularna wybranej konfiguracji = `product.price + sumValueSurcharges(options, selectedValues)`.
- Cena promocyjna = `product.sale_price + Σdopłat` (dopłata dolicza się TEŻ do promocji); Omnibus = `product.omnibus_price + Σdopłat`. Gdy `sale_price`/`omnibus_price` = null → null.
- Stan/promocja/Omnibus/zdjęcia — poziom produktu (`product.stock/sale_price/omnibus_price/images`).
- Historia cen: JEDEN wpis produktowy (`variant_key = null`).
- `product.sale_price` na poziomie produktu dozwolone RÓWNIEŻ dla produktów z opcjami (usuwamy dotychczasową blokadę).
- `AGENTS.md`: Next ma breaking changes — API sprawdzać w `node_modules/next/dist/docs/`. Ten plan nie wprowadza nowych API Next.
- Stale `.next/dev/types` bywa źródłem fałszywych błędów tsc → `rm -rf .next` i ponów.
- Commity po polsku (`refactor(warianty): …` / `feat` / `test`), stopka `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Gałąź: `feat/warianty-bez-kombinacji` (już utworzona; spec już zacommitowany).

## Plik po pliku (zakres)

- `app/_lib/variants.ts` — funkcje odczytu → poziom produktu + dopłaty; usunięcie martwych funkcji (ostatni task).
- `app/api/checkout/route.ts` — cena z `product.price + Σdopłat`, promo produktowe.
- `app/_lib/price-history.ts` — jeden wpis produktowy.
- `app/admin/produkty/[id]/VariantsEditor.tsx` — usunięcie podsekcji „Kombinacje" + `CombinationRow`; brak generowania kombinacji.
- `app/admin/produkty/actions.ts` — `updateProductVariants` waliduje tylko opcje; `updateProductBasics` bez blokady `sale_price`.
- `app/_lib/corner-side.ts` — `applyCornerSideSelection` tylko opcje.
- `app/_lib/new-product.ts` — bez zmian logiki (dziedziczy z corner-side).
- `app/admin/produkty/[id]/ProductEditor.tsx` — odblokowanie pól „Cena promocyjna"/„Stan".
- `app/admin/produkty/page.tsx` — licznik = liczba opcji.
- `app/_lib/types.ts` — usunięcie `ProductVariant` + `combinations` (ostatni task).
- `app/_lib/pricing.ts` — usunięcie `findInvalidVariantSale` (gdy nieużywane).
- Testy: `variants`, `corner-side`, `variant-value-pricing`, `fabrics`, `new-product`, `pricing`, usunięcie `variant-combinations`.
- `supabase/migrations/43_drop_variant_combinations.sql` — czyści JSON.

---

### Task 1: `variants.ts` — funkcje odczytu na poziom produktu + dopłaty

**Files:**
- Modify: `app/_lib/variants.ts`
- Test: `app/_lib/__tests__/variants.test.ts`

**Interfaces:**
- Consumes: `sumValueSurcharges(options, values)` (już istnieje w variants.ts), `product.price/stock/sale_price/omnibus_price/images`.
- Produces (zmienione zachowanie, sygnatury bez zmian): `getVariantPrice`, `getVariantStock`, `totalProductStock`, `getVariantSalePrice`, `getVariantOmnibus`, `getVariantImages`. `findVariant`, `rebuildCombinations`, `applyValuePricing`, `cartesianProduct`, `isOptionValueAvailable` NA RAZIE zostają (usuwane w Tasku 8) — inni konsumenci jeszcze ich używają.

Helper do dopłat wybranego zestawu (opcje mogą być puste → 0):
`sumValueSurcharges(product.variants?.options ?? [], selectedValues)`.

- [ ] **Step 1: Zaktualizuj testy (RED) w `variants.test.ts`**

Zamień oczekiwania na model produktowy. Kluczowe przypadki (dopisz/zmień w istniejącym pliku; użyj istniejącego stylu `describe`/`it` po polsku):

```ts
// Produkt z opcjami + dopłatą per wartość; stan/promo/zdjęcia PRODUKTOWE.
const product = {
  id: "p1", name: "Sofa", price: 2000, stock: 5,
  sale_price: 1800, omnibus_price: 1700, images: ["prod.jpg"],
  variants: {
    options: [{ name: "Tkanina", values: ["Sawana 21", "Riviera 16"], value_prices: { "Riviera 16": 200 } }],
    combinations: [], // pole jeszcze istnieje w typie (usuwane w Tasku 8)
  },
} as unknown as import("@/app/_lib/types").Product;

describe("model tylko-opcje — ceny z dopłat + poziom produktu", () => {
  it("getVariantPrice → base + dopłata wybranej wartości", () => {
    expect(getVariantPrice(product, { Tkanina: "Sawana 21" })).toBe(2000);
    expect(getVariantPrice(product, { Tkanina: "Riviera 16" })).toBe(2200);
  });
  it("getVariantSalePrice → sale + dopłata (dopłata dolicza się do promocji)", () => {
    expect(getVariantSalePrice(product, { Tkanina: "Riviera 16" })).toBe(2000); // 1800+200
    expect(getVariantSalePrice(product, { Tkanina: "Sawana 21" })).toBe(1800);
  });
  it("getVariantOmnibus → omnibus + dopłata", () => {
    expect(getVariantOmnibus(product, { Tkanina: "Riviera 16" })).toBe(1900); // 1700+200
  });
  it("getVariantEffectivePrice/isVariantOnSale → spójne (on-sale ⇔ sale<base)", () => {
    expect(getVariantEffectivePrice(product, { Tkanina: "Riviera 16" })).toBe(2000);
    expect(isVariantOnSale(product, { Tkanina: "Riviera 16" })).toBe(true);
  });
  it("getVariantStock/totalProductStock → product.stock", () => {
    expect(getVariantStock(product, { Tkanina: "Riviera 16" })).toBe(5);
    expect(totalProductStock(product)).toBe(5);
  });
  it("getVariantImages → galeria produktu", () => {
    expect(getVariantImages(product, { Tkanina: "Riviera 16" })).toEqual(["prod.jpg"]);
  });
  it("brak sale_price → getVariantSalePrice null", () => {
    const p2 = { ...product, sale_price: null } as typeof product;
    expect(getVariantSalePrice(p2, { Tkanina: "Riviera 16" })).toBeNull();
  });
});
```

Usuń ze starego pliku testy zależne od `combinations`/`findVariant`/`isOptionValueAvailable`/per-combo stock/sale/images (staną się nieaktualne). Zostaw testy `formatVariantLabel`, `getOptionDisplayName`, `getValueDisplayLabel`, `variantKey`, `isVariantSelectionComplete`, `hasVariants`.

- [ ] **Step 2: Uruchom (RED)**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL (stare implementacje zwracają wartości per-kombinacja/`product.price`, nie doliczają dopłat).

- [ ] **Step 3: Przepisz funkcje w `variants.ts`**

Zamień CIAŁA tych funkcji (sygnatury bez zmian). Nie usuwaj jeszcze `findVariant`/`rebuildCombinations`/`applyValuePricing`/`cartesianProduct`/`isOptionValueAvailable` (Task 8).

`getVariantStock` (było linie 42–49):
```ts
export function getVariantStock(
  product: Product,
  _selectedValues: Record<string, string>
): number {
  return product.stock;
}
```

`getVariantPrice` (było 53–61):
```ts
export function getVariantPrice(
  product: Product,
  selectedValues: Record<string, string>
): number {
  return product.price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
}
```

`totalProductStock` (było 65–68):
```ts
export function totalProductStock(product: Product): number {
  return product.stock;
}
```

`getVariantSalePrice` (było 160–167):
```ts
export function getVariantSalePrice(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (product.sale_price == null) return null;
  return product.sale_price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
}
```

`getVariantOmnibus` (było 170–177):
```ts
export function getVariantOmnibus(
  product: Product,
  selectedValues: Record<string, string>
): number | null {
  if (product.omnibus_price == null) return null;
  return product.omnibus_price + sumValueSurcharges(product.variants?.options ?? [], selectedValues);
}
```

`getVariantImages` (było 119–127):
```ts
export function getVariantImages(
  product: Product,
  _selectedValues: Record<string, string>
): string[] {
  return product.images ?? [];
}
```

`getVariantEffectivePrice` i `isVariantOnSale` — BEZ ZMIAN (składają powyższe; matematyka spójna).

- [ ] **Step 4: Uruchom (GREEN) + pełny zestaw**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts` → PASS.
Run: `npx tsc --noEmit` → exit 0 (dead-fns nadal istnieją, `sumValueSurcharges` już był).

- [ ] **Step 5: Commit**
```bash
git add app/_lib/variants.ts app/_lib/__tests__/variants.test.ts
git commit -m "refactor(warianty): funkcje odczytu liczą z poziomu produktu + dopłat opcji"
```

---

### Task 2: `checkout` — cena z poziomu produktu + dopłat

**Files:**
- Modify: `app/api/checkout/route.ts`

**Interfaces:**
- Consumes: `sumValueSurcharges` (variants.ts), `effectivePrice` (pricing.ts), `isVariantSelectionComplete`, `hasVariants`.

- [ ] **Step 1: Podmień blok wyceny wariantu (obecnie linie 166–196)**

Usuń użycie `findVariant`. Zamień:
```ts
      if (hasVariants(product)) {
        if (
          !item.variantValues ||
          !isVariantSelectionComplete(product, item.variantValues)
        ) {
          return NextResponse.json(
            {
              error: tr(
                `Brak wyboru wariantu dla: ${product.name}`,
                `Keine Variante ausgewählt für: ${product.name}`
              ),
            },
            { status: 400 }
          );
        }
        const variant = findVariant(product, item.variantValues);
        if (!variant) {
          return NextResponse.json(
            {
              error: tr(
                `Nieprawidłowy wariant dla: ${product.name}`,
                `Ungültige Variante für: ${product.name}`
              ),
            },
            { status: 400 }
          );
        }
        const regular = Number(product.price) + (variant.price_modifier ?? 0);
        unitPrice = effectivePrice(regular, variant.sale_price);
        variantValues = item.variantValues;
      }
```
na:
```ts
      if (hasVariants(product)) {
        if (
          !item.variantValues ||
          !isVariantSelectionComplete(product, item.variantValues)
        ) {
          return NextResponse.json(
            {
              error: tr(
                `Brak wyboru wariantu dla: ${product.name}`,
                `Keine Variante ausgewählt für: ${product.name}`
              ),
            },
            { status: 400 }
          );
        }
        const surcharge = sumValueSurcharges(
          product.variants?.options ?? [],
          item.variantValues
        );
        const regular = Number(product.price) + surcharge;
        const sale =
          product.sale_price != null ? Number(product.sale_price) + surcharge : null;
        unitPrice = effectivePrice(regular, sale);
        variantValues = item.variantValues;
      }
```

- [ ] **Step 2: Zaktualizuj importy**

W imporcie z `@/app/_lib/variants` usuń `findVariant`, dodaj `sumValueSurcharges` (zostaw `hasVariants`, `isVariantSelectionComplete`). (Znajdź linię `import { ... } from "@/app/_lib/variants"`.)

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit` → exit 0. (Jeśli błędy o `.next/dev/types` → `rm -rf .next` i ponów.)

- [ ] **Step 4: Commit**
```bash
git add app/api/checkout/route.ts
git commit -m "refactor(warianty): checkout wycenia z ceny produktu + dopłat (promo produktowe)"
```

---

### Task 3: `price-history.ts` — jeden wpis produktowy

**Files:**
- Modify: `app/_lib/price-history.ts`

**Interfaces:**
- Consumes: `computePriceUpdates`, `PriceUnit` (pricing.ts). Nie używa już `variantKey` do kombinacji.

- [ ] **Step 1: Uprość budowę `units` i denormalizację (obecnie linie 21–67)**

Zamień:
```ts
  const units: PriceUnit[] = [];
  if (!variants || variants.combinations.length === 0) {
    units.push({ variant_key: null, regular: basePrice, sale: product.sale_price });
  } else {
    for (const c of variants.combinations) {
      units.push({
        variant_key: variantKey(c.values),
        regular: basePrice + (c.price_modifier ?? 0),
        sale: c.sale_price ?? null,
      });
    }
  }
```
na:
```ts
  // Model tylko-opcje: historia cen jest produktowa (dopłaty nie wchodzą do
  // śledzenia — są stałym dodatkiem przy wyświetlaniu).
  const units: PriceUnit[] = [
    { variant_key: null, regular: basePrice, sale: product.sale_price },
  ];
```

Oraz blok denormalizacji per-kombinacja (obecnie 57–67) zamień:
```ts
  let variantsPayload: ProductVariants | null = null;
  if (variants && variants.combinations.length > 0) {
    const nextCombos = variants.combinations.map((c) => {
      const k = variantKey(c.values);
      if (!omniByKey.has(k)) return c;
      const v = omniByKey.get(k);
      return v == null ? { ...c, omnibus_price: undefined } : { ...c, omnibus_price: v };
    });
    variantsPayload = { ...variants, combinations: nextCombos };
  }
```
na (brak denormalizacji do wariantów — tylko produktowy `omnibus_price`):
```ts
  const variantsPayload: ProductVariants | null = null;
```

- [ ] **Step 2: Usuń nieużywany import `variantKey`**

Zmień `import { variantKey } from "./variants";` — usuń go, jeśli `variantKey` nie jest już używane w pliku (po zmianie NIE jest). (`ProductVariants` import zostaje — używany w typie `variantsPayload`; `variants` zmienna nadal czytana do warunku? Nie — po zmianie `variants` jest nieużywane poza `basePrice`; usuń też odczyt `const variants = ...` jeśli martwy, ale zostaw jeśli tsc go wymaga. Zweryfikuj tsc.)

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit` → exit 0. Usuń ewentualne „unused var" (`variants`) zgłoszone przez eslint w Tasku 10.

- [ ] **Step 4: Commit**
```bash
git add app/_lib/price-history.ts
git commit -m "refactor(warianty): historia cen/Omnibus tylko na poziomie produktu"
```

---

### Task 4: `VariantsEditor.tsx` — usuń podsekcję „Kombinacje" + `CombinationRow`

**Files:**
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx`

**Interfaces:** edytor przestaje pokazywać i generować kombinacje; zapisuje `combinations: []` (pole nadal w typie do Tasku 8).

- [ ] **Step 1: Usuń podsekcję „Kombinacje" z JSX (obecnie linie 460–495)**

Usuń cały blok `{/* Kombinacje */}` … `</div>` (nagłówek „Kombinacje ({n})" + lista `CombinationRow`). Zostaw sekcję „Opcje" (do 458) i blok „Zapis" (od 497).

- [ ] **Step 2: Przestań generować kombinacje przy zmianach opcji**

`commitOptions` (obecnie ~87–92) — zamień, by zwracała pustą listę (kombinacje nie są już potrzebne; walidacja i cena idą z opcji):
```ts
  function commitOptions(_nextOptions: ProductOption[], _old: ProductVariant[]): ProductVariant[] {
    return [];
  }
```
(Wszystkie `setVariants({ options, combinations: commitOptions(...) })` będą teraz zapisywać `combinations: []`. Alternatywnie — jeśli po Tasku 8 `combinations` znika z typu — te miejsca upraszczają się do `{ options }`; na teraz zostaw `combinations: []`.)

- [ ] **Step 3: Usuń komponent `CombinationRow` i nieużywane handlery**

Usuń funkcję `CombinationRow` (obecnie ~648–koniec bloku komponentu). Usuń z `VariantsEditor` handlery używane tylko przez kombinacje: `patchCombination`, `setComboImages`, `addComboImages`, `moveComboImage`, `removeComboImage`, `addExistingImage`, oraz zmienną `allVariantImages` (jeśli liczona tylko dla kombinacji). Zostaw handlery opcji/tkanin/strony/`save`. (tsc wskaże nieużywane.)

- [ ] **Step 4: Typecheck**
Run: `npx tsc --noEmit` → exit 0. (`rm -rf .next` jeśli fałszywe błędy.)

- [ ] **Step 5: Commit**
```bash
git add app/admin/produkty/[id]/VariantsEditor.tsx
git commit -m "refactor(warianty): edytor usuwa podsekcję Kombinacje (zostają Opcje)"
```

---

### Task 5: `actions.ts` — walidacja tylko opcji + odblokowanie promo/stanu produktowego

**Files:**
- Modify: `app/admin/produkty/actions.ts`

- [ ] **Step 1: `updateProductBasics` — usuń blokadę `sale_price` dla produktów z wariantami (obecnie 161–173, 187)**

Zamień:
```ts
  // Defense-in-depth: ignoruj product-level sale_price gdy produkt ma warianty.
  // ...
  const { data: existing } = await supabase
    .from("products")
    .select("variants")
    .eq("id", id)
    .maybeSingle();
  const productHasVariants =
    !!(existing as { variants?: { combinations?: unknown[] } } | null)
      ?.variants?.combinations?.length;
  const salePriceToSave = productHasVariants ? null : salePriceRaw;
```
na:
```ts
  // Model tylko-opcje: cena promocyjna jest produktowa także dla produktów z
  // opcjami (dopłaty per wartość dolicza się do niej przy wyświetlaniu/checkout).
  const salePriceToSave = salePriceRaw;
```
i w `updates` zostaje `sale_price: salePriceToSave` (bez zmian). (Usuwa to jedyny odczyt `existing` — usuń całą deklarację `existing`.)

- [ ] **Step 2: `updateProductVariants` — waliduj tylko opcje (obecnie 254–331)**

Zamień cały blok `if (variants !== null) { ... }` (254–331) na walidację samych opcji + dopłat, bez kombinacji:
```ts
  if (variants !== null) {
    if (typeof variants !== "object" || !Array.isArray(variants.options)) {
      return { ok: false, error: "Nieprawidłowa struktura wariantów" };
    }
    for (const opt of variants.options) {
      if (typeof opt.name !== "string" || !Array.isArray(opt.values)) {
        return { ok: false, error: "Nieprawidłowa struktura opcji wariantu" };
      }
      if (opt.value_prices !== undefined) {
        if (typeof opt.value_prices !== "object" || opt.value_prices === null) {
          return { ok: false, error: "Nieprawidłowa struktura dopłat wartości" };
        }
        for (const p of Object.values(opt.value_prices)) {
          if (typeof p !== "number" || !Number.isFinite(p) || p < 0) {
            return { ok: false, error: "Dopłata wartości musi być liczbą ≥ 0" };
          }
        }
      }
    }
    // Zapisujemy tylko opcje + overrides (kombinacje znikają — Task 8 zdejmie pole z typu).
    variantsToSave = { options: variants.options, overrides: variants.overrides, combinations: [] };
  }
```
Usuń importy `applyValuePricing`, `findInvalidVariantSale`, `formatVariantLabel` z tego pliku, jeśli po zmianie nieużywane (tsc/eslint wskaże).

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**
```bash
git add app/admin/produkty/actions.ts
git commit -m "refactor(warianty): walidacja tylko opcji + produktowa cena promocyjna dla produktów z opcjami"
```

---

### Task 6: `corner-side.ts` — `applyCornerSideSelection` tylko opcje (TDD)

**Files:**
- Modify: `app/_lib/corner-side.ts`
- Test: `app/_lib/__tests__/corner-side.test.ts`

**Interfaces:**
- Produces: `applyCornerSideSelection(variants, enabled)` — dodaje/usuwa opcję „Strona"; zwraca `{ options, overrides?, combinations: [] }` lub `null`.

- [ ] **Step 1: Zaktualizuj testy (RED)**

W `corner-side.test.ts` usuń asercje o mnożeniu ×2 i kolapsie kombinacji (obecnie ~129–184: `combinations` długości 4, `sale_price`/`price_modifier` per combo). Zostaw/zmień na:
```ts
describe("applyCornerSideSelection — model tylko-opcje", () => {
  it("null + enable → opcja Strona jako jedyna, bez kombinacji", () => {
    const r = applyCornerSideSelection(null, true)!;
    expect(r.options).toEqual([{ name: "Strona", values: ["Lewostronny", "Prawostronny"] }]);
    expect(r.combinations).toEqual([]);
  });
  it("produkt z tkaninami + enable → Strona jako PIERWSza opcja, tkanina zostaje", () => {
    const r = applyCornerSideSelection(fabricVariants, true)!;
    expect(r.options.map((o) => o.name)).toEqual(["Strona", "Tkanina"]);
    expect(r.combinations).toEqual([]);
    expect(r.overrides).toEqual({ option_names: { Tkanina: "Materiał" } });
  });
  it("idempotencja: ręczna opcja STRONA + enable → bez zmian", () => {
    expect(applyCornerSideSelection(manualSideVariants, true)).toBe(manualSideVariants);
  });
  it("disable → usuwa opcje side-like; ostatnia opcja → null", () => {
    expect(applyCornerSideSelection(manualSideVariants, false)).toBeNull();
    const enabled = applyCornerSideSelection(fabricVariants, true)!;
    const r = applyCornerSideSelection(enabled, false)!;
    expect(r.options.map((o) => o.name)).toEqual(["Tkanina"]);
    expect(r.combinations).toEqual([]);
  });
  it("idempotencja: null/bez strony → bez zmian", () => {
    expect(applyCornerSideSelection(null, false)).toBeNull();
    expect(applyCornerSideSelection(fabricVariants, false)).toBe(fabricVariants);
  });
});
```
(`fabricVariants`/`manualSideVariants` w pliku dają `combinations: []` w definicjach — dostosuj istniejące fixture, usuwając per-combo stock/sale/images lub zostawiając `combinations: []`.)

- [ ] **Step 2: Uruchom (RED)**
Run: `npx vitest run app/_lib/__tests__/corner-side.test.ts` → FAIL.

- [ ] **Step 3: Przepisz `applyCornerSideSelection` (obecnie 66–119)**
```ts
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
    return { ...base, options: [sideOption, ...base.options], combinations: [] };
  }

  if (!variants || !hasCornerSideOption(variants)) return variants;
  const options = variants.options.filter((o) => !isCornerSideOptionName(o.name));
  if (options.length === 0) return null;
  return { ...variants, options, combinations: [] };
}
```
Usuń importy `applyValuePricing`, `rebuildCombinations`, `variantKey` oraz typ `ProductVariant` z tego pliku (nieużywane po zmianie). Usuń komentarze o mnożeniu/kolapsie.

- [ ] **Step 4: Uruchom (GREEN)**
Run: `npx vitest run app/_lib/__tests__/corner-side.test.ts` → PASS.
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add app/_lib/corner-side.ts app/_lib/__tests__/corner-side.test.ts
git commit -m "refactor(warianty): wybór strony narożnika działa na samych opcjach"
```

---

### Task 7: Odblokuj pola w edytorze + licznik + testy tkanin/dopłat/new-product

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx`
- Modify: `app/admin/produkty/page.tsx`
- Test: `app/_lib/__tests__/fabrics.test.ts`, `app/_lib/__tests__/variant-value-pricing.test.ts`, `app/_lib/__tests__/new-product.test.ts`

- [ ] **Step 1: `ProductEditor.tsx` — odblokuj „Cena promocyjna" i „Stan magazynowy"**

W polu „Cena promocyjna (zł)" (obecnie ~162–179) usuń `disabled={hasVariants(product)}` z `<input name="sale_price" .../>` i zmień `hint` na stały tekst:
```tsx
          <Field
            label="Cena promocyjna (zł)"
            hint="Zostaw puste = brak promocji. Musi być niższa od ceny regularnej."
          >
            <input
              name="sale_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product.sale_price ?? ""}
              className={inputClass}
            />
          </Field>
```
W polu „Stan magazynowy" (obecnie ~191–204) usuń `disabled={hasVariants(product)}` i `hint` warunkowy:
```tsx
          <Field label="Stan magazynowy">
            <input
              name="stock"
              type="number"
              min="0"
              step="1"
              defaultValue={product.stock}
              className={inputClass}
            />
          </Field>
```
Jeśli `hasVariants` staje się nieużywane w pliku — usuń import (tsc/eslint wskaże).

- [ ] **Step 2: `page.tsx` — licznik wariantów = liczba opcji (obecnie ~61–62)**

Zamień `const variantCount = hasVariants(p) ? p.variants!.combinations.length : 0;` na:
```tsx
            const variantCount = p.variants?.options.length ?? 0;
```
`totalProductStock` już zwraca `product.stock` (Task 1) — linia stanu bez zmian.

- [ ] **Step 3: Testy tkanin/dopłat/new-product**

`variant-value-pricing.test.ts`: zachowaj testy `sumValueSurcharges` (czysta suma dopłat wybranych wartości). USUŃ testy `applyValuePricing` (funkcja znika w Tasku 8) — cały `describe` dotyczący `applyValuePricing`/`price_modifier` na kombinacjach.

`fabrics.test.ts`: usuń asercje o `combinations`/`ProductVariant` (obecnie importuje `ProductVariant` i tworzy `combos`). Zostaw testy `expandFabrics`/`buildFabricImageMap`/`buildFabricDeMap`/`fabricValueBelongsTo` (czyste, bez kombinacji). Jeśli plik testował `applyFabricSelection` na kombinacjach — zmień na sprawdzenie samych `options`:
```ts
it("applyFabricSelection → ustawia opcję Tkanina + dopłaty (bez kombinacji)", () => {
  const r = applyFabricSelection([], [], ["Sawana 21", "Riviera 16"], { "Riviera 16": 200 });
  const opt = r.options.find((o) => o.name === "Tkanina")!;
  expect(opt.values).toEqual(["Sawana 21", "Riviera 16"]);
  expect(opt.value_prices).toEqual({ "Riviera 16": 200 });
});
```
(Uwaga: sygnatura `applyFabricSelection` zmienia się w Tasku 8 — patrz niżej; jeśli ten test piszesz przed Taskiem 8, dopasuj do bieżącej sygnatury `(options, combinations, values, valuePrices)` i sprawdzaj tylko `options`.)

`new-product.test.ts`: zmień asercję o `payload.variants?.combinations` — dla `naroznik-l` oczekuj opcji „Strona" bez kombinacji:
```ts
it("naroznik-l → variants ma opcję Strona, combinations puste", () => {
  const r = buildNewProductPayload({ name: "N", price: 1000, category: "naroznik-l" });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.payload.variants?.options.map((o) => o.name)).toEqual(["Strona"]);
    expect(r.payload.variants?.combinations).toEqual([]);
  }
});
```

- [ ] **Step 4: Uruchom testy + tsc**
Run: `npx vitest run app/_lib/__tests__/fabrics.test.ts app/_lib/__tests__/variant-value-pricing.test.ts app/_lib/__tests__/new-product.test.ts` → PASS.
Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add app/admin/produkty/[id]/ProductEditor.tsx app/admin/produkty/page.tsx app/_lib/__tests__/fabrics.test.ts app/_lib/__tests__/variant-value-pricing.test.ts app/_lib/__tests__/new-product.test.ts
git commit -m "refactor(warianty): odblokuj produktowe promo/stan, licznik = liczba opcji, testy"
```

---

### Task 8: Sprzątanie typu i martwego kodu (końcowy „flip")

**Files:**
- Modify: `app/_lib/types.ts`, `app/_lib/variants.ts`, `app/_lib/pricing.ts`, `app/admin/produkty/actions.ts`, `app/admin/produkty/[id]/VariantsEditor.tsx`, `app/_lib/corner-side.ts`, `app/_lib/new-product.ts`
- Delete: `app/_lib/__tests__/variant-combinations.test.ts`
- Test: `app/_lib/__tests__/pricing.test.ts`

Teraz nikt nie CZYTA `combinations` (tylko producenci ustawiają `[]`). Zdejmujemy pole i martwy kod.

- [ ] **Step 1: `types.ts` — usuń `ProductVariant` i `combinations`**

Usuń typ `ProductVariant` (obecnie 26–38). W `ProductVariants` (50–54) usuń linię `combinations: ProductVariant[];`:
```ts
export type ProductVariants = {
  options: ProductOption[];
  overrides?: ProductVariantOverrides;
};
```
Zaktualizuj komentarz przy `ProductOption.value_prices` (usuń wzmiankę o „price_modifier kombinacji").

- [ ] **Step 2: `variants.ts` — usuń martwe funkcje i `combinations: []` z producentów**

Usuń: `findVariant`, `cartesianProduct`, `rebuildCombinations`, `applyValuePricing`, `isOptionValueAvailable`. Usuń import typu `ProductVariant`.
`applyFabricSelection` — zmień sygnaturę i ciało na options-only:
```ts
export function applyFabricSelection(
  options: ProductOption[],
  values: string[],
  valuePrices: Record<string, number> = {}
): { options: ProductOption[] } {
  const vp = Object.keys(valuePrices).length > 0 ? valuePrices : undefined;
  let nextOptions: ProductOption[];
  if (values.length === 0) {
    nextOptions = options.filter((o) => o.name !== FABRIC_OPTION_NAME);
  } else if (options.some((o) => o.name === FABRIC_OPTION_NAME)) {
    nextOptions = options.map((o) =>
      o.name === FABRIC_OPTION_NAME ? { ...o, values, value_prices: vp } : o
    );
  } else {
    nextOptions = [...options, { name: FABRIC_OPTION_NAME, values, value_prices: vp }];
  }
  return { options: nextOptions };
}
```

- [ ] **Step 3: Zaktualizuj wołających `applyFabricSelection` i producentów `combinations: []`**

`VariantsEditor.tsx` `applyFabrics` (obecnie ~185–201) — wołanie `applyFabricSelection(base.options, base.combinations, finalValues, finalVP)` → `applyFabricSelection(base.options, finalValues, finalVP)`; wynik: `setVariants(next.options.length === 0 ? null : { options: next.options, overrides: base.overrides })`. `commitOptions` (Task 4) — usuń, a wszystkie `setVariants({ options, combinations: commitOptions(...) })` zmień na `setVariants({ ...variants, options: nextOptions })` / `setVariants({ options: nextOptions, overrides: variants?.overrides })`. Usuń typ `ProductVariant` z importów.
`corner-side.ts` — usuń `combinations: []` z obu zwrotów (`{ ...base, options: [...] }` / `{ ...variants, options }`); `base` = `variants ?? { options: [] }`.
`actions.ts` — `variantsToSave = { options: variants.options, overrides: variants.overrides }` (bez `combinations`).
`corner-side.test.ts` / `new-product.test.ts` — usuń asercje `combinations` (`.toEqual([])`), bo pola nie ma.

- [ ] **Step 4: `pricing.ts` — usuń `findInvalidVariantSale` + `SaleValidationCombo`**

Usuń (obecnie 47–70) `SaleValidationCombo` i `findInvalidVariantSale` (nieużywane — promo produktowe walidowane w `updateProductBasics`). Zostaw `computeOmnibus`, `computePriceUpdates`, `PriceUnit`, `effectivePrice`, `isOnSale`. W `pricing.test.ts` usuń testy `findInvalidVariantSale`.

- [ ] **Step 5: Delete `variant-combinations.test.ts`**
```bash
git rm app/_lib/__tests__/variant-combinations.test.ts
```

- [ ] **Step 6: Typecheck + pełne testy**
Run: `npx tsc --noEmit` → exit 0 (jeśli błędy `.next/dev/types` → `rm -rf .next`).
Run: `npm test` → wszystkie zielone.

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "refactor(warianty): usuń typ ProductVariant, pole combinations i martwe funkcje"
```

---

### Task 9: Migracja SQL — usuń `combinations` z JSON produktów

**Files:**
- Create: `supabase/migrations/43_drop_variant_combinations.sql`

- [ ] **Step 1: Napisz migrację**
```sql
-- Migracja 43: model wariantów „tylko opcje" — usuwa klucz `combinations` z
-- products.variants JSONB. Per-kombinacja stan/promocja/Omnibus/zdjęcia były
-- artefaktem BaseLinkera (wycofany). Opcje + dopłaty (value_prices) zostają.
-- Cena promocyjna/stan/Omnibus/zdjęcia są teraz na poziomie produktu.
update public.products
set variants = variants - 'combinations'
where variants ? 'combinations';
```

- [ ] **Step 2: (weryfikacja read-only — wykonuje operator)**

Migracje aplikowane ręcznie w Supabase SQL Editor (⚠️ localhost = ta sama baza co prod). Po wykonaniu: `select count(*) from products where variants ? 'combinations';` → 0.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/43_drop_variant_combinations.sql
git commit -m "feat(warianty): migracja 43 — usuń combinations z variants JSON"
```

---

### Task 10: Weryfikacja końcowa

- [ ] **Step 1: Statyka + testy + build**
```bash
npx tsc --noEmit
npx eslint app/_lib/variants.ts app/_lib/corner-side.ts app/_lib/price-history.ts app/_lib/pricing.ts app/_lib/new-product.ts app/api/checkout/route.ts app/admin/produkty/actions.ts "app/admin/produkty/[id]/VariantsEditor.tsx" "app/admin/produkty/[id]/ProductEditor.tsx" app/admin/produkty/page.tsx
npm test
npm run build
```
Expected: tsc exit 0; eslint exit 0 (napraw ewentualne „unused"/`no-unescaped-entities`); wszystkie testy zielone; build exit 0.

- [ ] **Step 2: Smoke na dev (operator lub Playwright z `.env.e2e`)**
`npx next dev` → w `/admin/produkty/{id}`: sekcja „Warianty produktu" ma tylko Opcje (brak Kombinacji); pola „Cena promocyjna"/„Stan" na górze odblokowane; dodanie opcji z dopłatą + wybór na karcie produktu pokazuje cenę `baza+dopłata`; checkout wycenia poprawnie.

- [ ] **Step 3: Commit (jeśli poprawki lintu)**
```bash
git add -A && git commit -m "chore(warianty): lint/verify po refaktorze"
```

---

## Self-Review

**Spec coverage:**
- Model danych (usuń ProductVariant + combinations) → Task 8.
- Cena = base + dopłaty; promo/Omnibus = +dopłata → Task 1 (helpery), Task 2 (checkout).
- Stan/zdjęcia/promo/Omnibus produktowe → Task 1, Task 3 (historia), Task 5/7 (admin).
- Produktowe `sale_price` dozwolone dla produktów z opcjami → Task 5 (usunięcie blokady), Task 7 (odblokowanie UI).
- Edytor bez Kombinacji → Task 4.
- Narożniki/tkaniny/new-product options-only → Task 6, Task 8 (applyFabricSelection), Task 7 (new-product test).
- Historia cen produktowa → Task 3.
- Migracja → Task 9.
- Testy (usuń variant-combinations; przepisz 6) → Task 1/6/7/8.
- Nie-cele (per-wariant stan/promo/zdjęcia) → nie ma tasków (usuwane).

**Placeholder scan:** brak TBD/TODO; kroki z kodem mają kod; komendy z oczekiwanym wynikiem. Miejsca „tsc/eslint wskaże nieużywane" są świadome (zależne od reszty importów w danym pliku) — implementer usuwa wg wskazań kompilatora, nie zgaduje.

**Type consistency:**
- `applyCornerSideSelection` zwraca `{ options, overrides?, combinations: [] }` w Taskach 1–7, a `{ options, overrides? }` po Tasku 8 (pole zdjęte z typu) — spójne z kolejnością „combinations jako [] do Tasku 8".
- `applyFabricSelection`: sygnatura `(options, combinations, values, valuePrices)` do Tasku 8, potem `(options, values, valuePrices)` → wołający zaktualizowany w Tasku 8 Step 3 (jedno miejsce: `VariantsEditor.applyFabrics`).
- `getVariant*` sygnatury niezmienione; zachowanie produktowe spójne między Task 1 (helpery) a Task 2 (checkout używa `sumValueSurcharges` bezpośrednio, nie helperów — ta sama matematyka).
- `PriceUnit`/`computePriceUpdates` (pricing.ts) niezmienione; `variant_key: null` używane w Task 3.
