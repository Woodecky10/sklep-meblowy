# Zdjęcia wariantów jako swatche (poza główną galerią) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zdjęcia `value_images` wariantów (poza opcją strony narożnika) przestają wchodzić do głównej galerii/lightboxa produktu i pokazują się jako miniatury‑swatche przy wartościach w selektorze — tak jak próbki tkanin.

**Architecture:** Dwie zmiany. (1) `getVariantImages` scala `value_images` do galerii tylko dla opcji strony narożnika (`isCornerSideOptionName`). (2) `VariantSelector` dostaje nową gałąź `ValueImageSwatchGroup` renderującą wartości opcji ze zdjęciami jako swatche (klik = wybór), dla opcji innych niż „Tkanina"/„Strona".

**Tech Stack:** Next.js 16 (App Router, React 19, "use client"), TypeScript, Tailwind v4, vitest (środowisko `node`, tylko `*.test.ts` — testy czystych funkcji; UI weryfikujemy Playwright).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-zdjecia-wariantow-jako-swatche-design.md`.
- Brak migracji DB. `value_images` zostają w danych; zmienia się tylko konsumpcja.
- „Strona" (narożnik) i „Tkanina" — bez zmian zachowania/wyglądu.
- Admin (`VariantsEditor`, `updateProductVariants`, `cleanValueImages`), koszyk (`AddToCartButton`), `collectProductImageUrls` — bez zmian.
- Kod klienta w komponentach `"use client"`. Ścieżki plików liczone od katalogu aplikacji `sklep-meblowy/` (repo git ma je pod `sklep-meblowy/…`).
- Komendy uruchamiać z katalogu aplikacji (`sklep-meblowy/sklep-meblowy` w tym repo).
- Styl commitów: konwencjonalny, PL, z linią `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `getVariantImages` scala tylko narożnik + helper `optionHasValueImages`

**Files:**
- Modify: `app/_lib/variants.ts` (import + `getVariantImages` przy liniach 68–95, nowy `optionHasValueImages`)
- Test: `app/_lib/__tests__/variants.test.ts` (import + blok `describe("getVariantImages …")` linie ~236–261, nowy blok `describe("optionHasValueImages")`)

**Interfaces:**
- Produces: `getVariantImages(product: Product, selectedValues: Record<string,string>): string[]` — bez zmiany sygnatury; nowa semantyka (tylko narożnik scala do galerii).
- Produces: `optionHasValueImages(option: ProductOption): boolean` — używane przez Task 2.
- Consumes: `isCornerSideOptionName(name: string): boolean` z `@/app/_lib/corner-side` (istnieje; importuje tylko `./types` → brak cyklu).

- [ ] **Step 1: Zaktualizuj testy (nowa semantyka + `optionHasValueImages`)**

W `app/_lib/__tests__/variants.test.ts` dodaj `optionHasValueImages` do importu z `@/app/_lib/variants` (blok importu kończy się linią `} from "@/app/_lib/variants";`):

```ts
  rebuildFabricValuePrices,
  optionHasValueImages,
} from "@/app/_lib/variants";
```

Zastąp cały istniejący blok `describe("getVariantImages — zdjęcia per wartość opcji (value_images)", …)` (linie ~236–261) poniższym oraz dołącz drugi blok `describe`. Obiekt `productWithValueImages` (linie ~216–234) zostaje bez zmian.

```ts
describe("getVariantImages — value_images tylko dla narożnika", () => {
  it("brak wyboru → galeria produktu", () => {
    expect(getVariantImages(productWithValueImages, {})).toEqual([
      "prod1.jpg", "prod2.jpg",
    ]);
  });
  it("opcja nie-narożnikowa (Tkanina) ze zdjęciami → tylko galeria produktu", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16" })
    ).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
  it("opcja narożnika (Strona) ze zdjęciami → zdjęcia narożnika + galeria, dedup", () => {
    expect(
      getVariantImages(productWithValueImages, { Strona: "Lewa" })
    ).toEqual(["lewa.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("narożnik + nie-narożnik → scala tylko narożnik", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Riviera 16", Strona: "Lewa" })
    ).toEqual(["lewa.jpg", "prod1.jpg", "prod2.jpg"]);
  });
  it("wybrana wartość bez zdjęć → galeria produktu", () => {
    expect(
      getVariantImages(productWithValueImages, { Tkanina: "Sawana 21" })
    ).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
  it("produkt bez variants → galeria produktu", () => {
    const p = { ...productWithValueImages, variants: null } as unknown as Product;
    expect(getVariantImages(p, {})).toEqual(["prod1.jpg", "prod2.jpg"]);
  });
});

describe("optionHasValueImages", () => {
  it("opcja z niepustymi value_images → true", () => {
    expect(
      optionHasValueImages({ name: "Kolor nóżek", values: ["Złote"], value_images: { "Złote": ["a.jpg"] } })
    ).toBe(true);
  });
  it("opcja bez value_images → false", () => {
    expect(optionHasValueImages({ name: "Rozmiar", values: ["M"] })).toBe(false);
  });
  it("opcja z samymi pustymi tablicami → false", () => {
    expect(optionHasValueImages({ name: "X", values: ["a"], value_images: { a: [] } })).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom testy — muszą FAILOWAĆ**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: FAIL — `optionHasValueImages is not a function` / import error oraz niezgodność asercji „opcja nie-narożnikowa (Tkanina)…" (stara implementacja scala zdjęcia Tkaniny).

- [ ] **Step 3: Zaimplementuj zmianę w `app/_lib/variants.ts`**

Dodaj import po istniejących importach na górze pliku (obok `import { effectivePrice, isOnSale } from "./pricing";`):

```ts
import { isCornerSideOptionName } from "./corner-side";
```

Zastąp funkcję `getVariantImages` (obecnie linie ~68–95, wraz z komentarzem nad nią) poniższym:

```ts
// Zdjęcia do pokazania klientowi w GŁÓWNEJ galerii. Zdjęcia per wartość
// (value_images) trafiają na początek galerii TYLKO dla opcji strony narożnika
// (isCornerSideOptionName) — pozostałe opcje pokazują swoje value_images jako
// swatche w selektorze (VariantSelector), nie w galerii. Brak wyboru / brak
// zdjęć narożnika → galeria produktu. Deduplikacja URL-i (pierwsze wygrywa).
export function getVariantImages(
  product: Product,
  selectedValues: Record<string, string>
): string[] {
  const variantImages: string[] = [];
  for (const opt of product.variants?.options ?? []) {
    const v = selectedValues[opt.name];
    if (v == null) continue;
    // Tylko narożnik (Strona) dokłada zdjęcia do głównej galerii; inne opcje
    // mają swoje zdjęcia jako swatche w selektorze (jak tkaniny).
    if (!isCornerSideOptionName(opt.name)) continue;
    const imgs = opt.value_images?.[v];
    if (!Array.isArray(imgs)) continue;
    for (const url of imgs) {
      if (typeof url === "string" && url) variantImages.push(url);
    }
  }
  if (variantImages.length === 0) return product.images ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...variantImages, ...(product.images ?? [])]) {
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

// Czy opcja ma jakiekolwiek zdjęcia per wartość (niepusta tablica URL-i).
// Selektor używa tego, by pokazać wartości jako swatche zamiast chipów tekstowych.
export function optionHasValueImages(option: ProductOption): boolean {
  const vi = option.value_images;
  if (!vi) return false;
  return Object.values(vi).some(
    (urls) => Array.isArray(urls) && urls.some((u) => typeof u === "string" && u.length > 0)
  );
}
```

(`ProductOption` jest już importowany na górze pliku: `import type { Product, ProductOption, ProductVariants } from "./types";`.)

- [ ] **Step 4: Uruchom testy — muszą PRZEJŚĆ**

Run: `npx vitest run app/_lib/__tests__/variants.test.ts`
Expected: PASS (wszystkie `getVariantImages` + `optionHasValueImages`).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: brak błędów (exit 0).

```bash
git add sklep-meblowy/app/_lib/variants.ts sklep-meblowy/app/_lib/__tests__/variants.test.ts
git commit -m "feat(warianty): value_images do galerii tylko dla narozynka + optionHasValueImages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ValueImageSwatchGroup` + gałąź w `VariantSelector`

**Files:**
- Modify: `app/_components/ui/VariantSelector.tsx` (import; gałąź renderu przy liniach ~99–149; nowy komponent współlokowany)

**Interfaces:**
- Consumes: `optionHasValueImages` z `@/app/_lib/variants` (Task 1).
- Consumes (istniejące w pliku): `getValueLabel(product, optionName, value, locale, fabricMap)`, `formatMoney`, `pick(name, value)`, `orderedValues`, `Locale`.

- [ ] **Step 1: Dodaj import, gałąź renderu i komponent w `VariantSelector.tsx`**

Dodaj `optionHasValueImages` do istniejącego importu z `@/app/_lib/variants` (obecnie: `import { FABRIC_OPTION_NAME, sortVariantValues, sortVariantOptions } from "@/app/_lib/variants";`):

```ts
import { FABRIC_OPTION_NAME, sortVariantValues, sortVariantOptions, optionHasValueImages } from "@/app/_lib/variants";
```

W renderze opcji (blok warunkowy zaczynający się `{option.name === FABRIC_OPTION_NAME ? (`), tuż PRZED końcową gałęzią `: (` z chipami tekstowymi (`<div className="flex flex-wrap gap-2">`), wstaw nową gałąź. Fragment ma wyglądać tak (gałąź `CornerSideGroup` bez zmian, nowa gałąź `ValueImageSwatchGroup` dodana, końcowe chipy bez zmian):

```tsx
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
            ) : optionHasValueImages(option) ? (
              <ValueImageSwatchGroup
                values={orderedValues}
                current={current}
                valuePrices={option.value_prices}
                valueImages={option.value_images ?? {}}
                labelOf={(v) => getValueLabel(product, option.name, v, locale, fabricMap)}
                locale={locale}
                rate={rate}
                onPick={(v) => pick(option.name, v)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
```

Dodaj nowy komponent współlokowany — wstaw go bezpośrednio PO funkcji `FabricSwatchGroup` (przed `CORNER_SIDE_IMAGES` / `CornerSideGroup`):

```tsx
// Swatche zdjęć wariantu (value_images) dla opcji innych niż tkanina/narożnik.
// Zachowują się jak próbki tkanin: miniatura przy wartości, klik = wybór; zdjęcia
// NIE wchodzą do głównej galerii (patrz getVariantImages — scala tylko narożnik).
// Miniatura = pierwsze zdjęcie wartości; brak zdjęcia → tekst wartości w kółku.
function ValueImageSwatchGroup({
  values,
  current,
  valuePrices,
  valueImages,
  labelOf,
  locale,
  rate,
  onPick,
}: {
  values: string[];
  current: string | undefined;
  valuePrices: Record<string, number> | undefined;
  valueImages: Record<string, string[]>;
  labelOf: (v: string) => string;
  locale: Locale;
  rate: number;
  onPick: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {values.map((v) => {
        const active = current === v;
        const img = valueImages[v]?.[0];
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
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx eslint app/_components/ui/VariantSelector.tsx` → Expected: exit 0.

- [ ] **Step 3: Weryfikacja Playwright (dev server)**

Uruchom dev server (jeśli nie działa): `npm run dev` (port 3000).

Produkt z opcją „Kolor nóżek" mającą zdjęcia — Łóżko Astoria 140 (`bb27c692-4d1f-46ea-8e02-3a57e050db54`):
1. Otwórz `http://localhost:3000/produkt/bb27c692-4d1f-46ea-8e02-3a57e050db54`.
2. Sekcja „Kolor nóżek" pokazuje **okrągłe miniatury** (Srebrne/Złote) zamiast chipów tekstowych. Weryfikacja: w tej sekcji istnieją `img` (swatche).
3. Zbierz URL-e galerii (lewa kolumna) PRZED wyborem. Kliknij „Złote". Zbierz URL-e galerii PO wyborze → muszą być **identyczne** (zdjęcie nóżki NIE wchodzi do galerii).
4. Otwórz lightbox (przycisk „Powiększ zdjęcie") i hit-testem sprawdź, że wszystkie widoczne zdjęcia to `product.images` (brak zdjęcia nóżki).
   Expected: liczba i URL-e miniatur galerii bez zmian po wyborze koloru nóżek.

Produkt‑narożnik (kontrola regresji) — Lorenzo (`009146bb-876f-4930-ab12-45bb25ed9096`):
5. Otwórz `http://localhost:3000/produkt/009146bb-876f-4930-ab12-45bb25ed9096`.
6. Opcja „Strona" nadal pokazuje **kafelki SVG** (lewo/prawostronny), bez zmian.
7. Kliknij „Lewostronny" → jeśli ta wartość ma `value_images`, jej zdjęcie **nadal** pojawia się na początku galerii (zachowanie jak dziś).
   Expected: picker Strony bez zmian; zdjęcia narożnika dalej w galerii.

- [ ] **Step 4: Pełny zestaw testów + commit**

Run: `npx vitest run` → Expected: wszystkie zielone (661 istniejących + nowe z Task 1).

```bash
git add sklep-meblowy/app/_components/ui/VariantSelector.tsx
git commit -m "feat(warianty): swatche zdjec wariantu w selektorze (jak tkaniny)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- „getVariantImages scala tylko narożnik" → Task 1 (Step 3) + testy (Step 1).
- „optionHasValueImages helper" → Task 1.
- „ValueImageSwatchGroup + gałąź renderu, kolejność decyzji Tkanina → Strona → value_images → chipy" → Task 2 (Step 1).
- „Narożnik/tkaniny bez zmian" → gałęzie `FabricSwatchGroup`/`CornerSideGroup` nietknięte; getVariantImages nadal scala narożnik (test „opcja narożnika…").
- „Koszyk/admin bez zmian" → brak zadań ich dotyczących (świadomie).
- „Brak migracji" → brak kroków DB.
- „Testy: narożnik scala/reszta nie, optionHasValueImages, istniejące zielone" → Task 1 Step 1/4, Task 2 Step 4.
- „Weryfikacja UI Playwright" → Task 2 Step 3.

**2. Placeholder scan:** brak TBD/TODO; każdy krok kodu zawiera pełny kod; komendy z oczekiwanym wynikiem.

**3. Type consistency:** `optionHasValueImages(option: ProductOption): boolean` zdefiniowany w Task 1, użyty w Task 2 z tą samą nazwą. `ValueImageSwatchGroup` props (`values/current/valuePrices/valueImages/labelOf/locale/rate/onPick`) zgodne z miejscem wywołania w gałęzi renderu. `option.value_images ?? {}` pasuje do `valueImages: Record<string,string[]>`.
