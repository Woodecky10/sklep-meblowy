# Wniesienie mebli (+250 zł) — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przy każdym produkcie pole „Wniesienie mebli (do 4. piętra) +250 zł" — domyślnie odznaczone, 250 zł za sztukę, poza rabatami.

**Architecture:** Wniesienie to NIE opcja wariantu, tylko klucz `CARRY_IN_KEY` w tym samym słowniku `variantValues`, który już płynie przez koszyk → checkout → zamówienie → panel/maile. Cała logika ceny w czystych modułach `app/_lib/carry-in.ts` i `app/_lib/checkout-pricing.ts` (klient + serwer). Rabaty (zestaw, kod) liczą się od `discountableSubtotal` — ceny bez wniesienia.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest (`environment: "node"`, testy w `app/**/__tests__/**/*.test.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-wniesienie-mebli-design.md`

Wszystkie komendy z katalogu `sklep-meblowy/` (tam jest `package.json`; korzeń repo jest piętro wyżej).

## Global Constraints

- `CARRY_IN_KEY = "Wniesienie mebli do 4. piętra"`, `CARRY_IN_VALUE = "Tak"`, `CARRY_IN_PRICE = 250` — dokładnie te wartości; klucz to klucz zapisu, nie zmieniać.
- Brak klucza = brak usługi. Nigdy nie zapisujemy `"Nie"`.
- Za sztukę: cena sztuki rośnie o 250 zł, mnożona przez ilość.
- Kod rabatowy, rabat zestawu i próg minimalnej kwoty kodu liczą się BEZ wniesienia.
- Cena, Omnibus i przekreślenie na stronie produktu się NIE zmieniają po zaznaczeniu.
- `product.variants` się nie zmienia; żadnej migracji bazy.
- Pliki w repo mają CRLF — edytuj narzędziem Edit (zachowuje końcówki), nie `sed -i`/`perl -0pi`.
- Baza jest wspólna z produkcją: żadnych testów, które składają zamówienie lub zapisują w panelu.

## Review Focus

1. Kod rabatowy już zastosowany, klient zaznacza wniesienie w innej pozycji → kwota rabatu w koszyku nie rośnie (re-walidacja w `koszyk/page.tsx` dostaje `eligibleBase` bez wniesienia). Test: Task 3, krok 1 (`eligiblePromoBase` z `discountableSubtotal`).
2. Ten sam mebel z wniesieniem i bez → dwie osobne pozycje koszyka; usunięcie jednej nie rusza drugiej. Test: Task 1, krok 1 (`cartReducer`).
3. „Zamów ponownie" z zamówienia z wniesieniem → koszyk pokazuje cenę z 250 zł, czyli tyle, ile policzy serwer. Kod: Task 4, krok 6 (komponent — weryfikacja przeglądem, brak testów komponentów).
4. Koszyk sprzed wdrożenia (bez klucza) → checkout liczy jak dotąd. Test: Task 2, krok 1 (produkt bez wartości).
5. Element zestawu bez wariantów z zaznaczonym wniesieniem → wniesienie nie ginie po drodze do koszyka. Kod: Task 4, krok 5 (`variantValues` gdy niepuste, nie `hasVariants(p)`).

---

### Task 1: Moduł `carry-in` + tłumaczenie DE

**Files:**
- Create: `app/_lib/carry-in.ts`
- Modify: `app/_lib/de-content-maps.ts` (`VARIANT_OPTION_DE`, ok. linia 98)
- Test: `app/_lib/__tests__/carry-in.test.ts`

**Interfaces:**
- Consumes: `formatVariantLabel` z `app/_lib/variants.ts` (tylko w teście), `cartReducer` z `app/_context/CartContext.tsx` (tylko w teście).
- Produces:
  - `CARRY_IN_KEY: string`, `CARRY_IN_VALUE: string`, `CARRY_IN_PRICE: number`
  - `hasCarryIn(values?: Record<string, string> | null): boolean`
  - `carryInSurcharge(values?: Record<string, string> | null): number`
  - `setCarryIn(values: Record<string, string>, on: boolean): Record<string, string>`
  - `discountableSubtotal(unitPrice: number, quantity: number, values?: Record<string, string> | null): number`

- [ ] **Step 1: Write the failing test**

`app/_lib/__tests__/carry-in.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CARRY_IN_KEY,
  CARRY_IN_PRICE,
  carryInSurcharge,
  discountableSubtotal,
  hasCarryIn,
  setCarryIn,
} from "../carry-in";
import { formatVariantLabel } from "../variants";
import { cartReducer, type CartState } from "@/app/_context/CartContext";

describe("carryInSurcharge / hasCarryIn", () => {
  it("250 zł tylko przy wartości „Tak”", () => {
    expect(CARRY_IN_PRICE).toBe(250);
    expect(carryInSurcharge({ [CARRY_IN_KEY]: "Tak" })).toBe(250);
    expect(hasCarryIn({ [CARRY_IN_KEY]: "Tak" })).toBe(true);
  });
  it("0 przy innej wartości, braku klucza, null i undefined", () => {
    expect(carryInSurcharge({ [CARRY_IN_KEY]: "Nie" })).toBe(0);
    expect(carryInSurcharge({ Tkanina: "Riviera 16" })).toBe(0);
    expect(carryInSurcharge({})).toBe(0);
    expect(carryInSurcharge(null)).toBe(0);
    expect(carryInSurcharge(undefined)).toBe(0);
    expect(hasCarryIn(undefined)).toBe(false);
  });
});

describe("setCarryIn", () => {
  it("dodaje klucz, zachowuje resztę i nie mutuje wejścia", () => {
    const input = { Tkanina: "Riviera 16" };
    const out = setCarryIn(input, true);
    expect(out).toEqual({ Tkanina: "Riviera 16", [CARRY_IN_KEY]: "Tak" });
    expect(input).toEqual({ Tkanina: "Riviera 16" });
  });
  it("odznaczenie usuwa klucz zamiast zapisywać „Nie”", () => {
    const out = setCarryIn({ Tkanina: "Riviera 16", [CARRY_IN_KEY]: "Tak" }, false);
    expect(out).toEqual({ Tkanina: "Riviera 16" });
  });
});

describe("discountableSubtotal", () => {
  it("odejmuje wniesienie od ceny sztuki przed pomnożeniem przez ilość", () => {
    expect(discountableSubtotal(2900, 2, { [CARRY_IN_KEY]: "Tak" })).toBe(5300);
  });
  it("bez wniesienia = cena × ilość", () => {
    expect(discountableSubtotal(2900, 2, { Tkanina: "Riviera 16" })).toBe(5800);
    expect(discountableSubtotal(2900, 2, undefined)).toBe(5800);
  });
});

describe("etykieta w koszyku, zamówieniu i mailach", () => {
  it("PL: „Wniesienie mebli do 4. piętra: Tak”", () => {
    expect(formatVariantLabel({ [CARRY_IN_KEY]: "Tak" }, "pl")).toBe(
      "Wniesienie mebli do 4. piętra: Tak"
    );
  });
  it("DE: tłumaczenie klucza i wartości", () => {
    expect(formatVariantLabel({ [CARRY_IN_KEY]: "Tak" }, "de")).toBe(
      "Hineintragen bis zur 4. Etage: Ja"
    );
  });
});

describe("koszyk", () => {
  const empty: CartState = { items: [], appliedPromo: null, hydrated: true };
  const base = { id: "p1", name: "Fotel", image: "", quantity: 1 };
  it("ten sam mebel z wniesieniem i bez to dwie osobne pozycje", () => {
    let s = cartReducer(empty, { type: "ADD", item: { ...base, price: 1000 } });
    s = cartReducer(s, {
      type: "ADD",
      item: { ...base, price: 1250, variantValues: { [CARRY_IN_KEY]: "Tak" } },
    });
    expect(s.items).toHaveLength(2);
    s = cartReducer(s, { type: "REMOVE", id: "p1", variantValues: undefined });
    expect(s.items).toHaveLength(1);
    expect(s.items[0].variantValues).toEqual({ [CARRY_IN_KEY]: "Tak" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/carry-in.test.ts`
Expected: FAIL — `Failed to resolve import "../carry-in"`.

- [ ] **Step 3: Write minimal implementation**

`app/_lib/carry-in.ts`:

```ts
// Wniesienie mebli (spec 2026-10-06) — usługa dokładana do KAŻDEGO produktu
// w kodzie, nie w danych. Czysta logika: używa jej klient (strona produktu,
// konfigurator zestawu, koszyk) i serwer (/api/checkout).
//
// Żyje w tym samym słowniku co wybrane wartości wariantu (variantValues), ale
// NIE jest opcją wariantu: product.variants się nie zmienia, a funkcje
// iterujące po opcjach produktu (isVariantSelectionComplete,
// sumValueSurcharges, VariantSelector) ten klucz ignorują. Dzięki temu
// koszyk, zapis zamówienia, panel i maile pokazują go bez zmian.
//
// ⚠️ CARRY_IN_KEY to KLUCZ ZAPISU (koszyki w localStorage, zamówienia), nie
// napis — zmiana tekstu odbierze wniesienie koszykom zapisanym wcześniej.
// Napis przy polu na stronie produktu jest w słownikach (product.carryInLabel).
export const CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";
export const CARRY_IN_VALUE = "Tak";
export const CARRY_IN_PRICE = 250;

export function hasCarryIn(values?: Record<string, string> | null): boolean {
  return values?.[CARRY_IN_KEY] === CARRY_IN_VALUE;
}

// Dopłata za sztukę: CARRY_IN_PRICE albo 0.
export function carryInSurcharge(values?: Record<string, string> | null): number {
  return hasCarryIn(values) ? CARRY_IN_PRICE : 0;
}

// Brak klucza = brak usługi — odznaczenie usuwa klucz, nigdy nie zapisuje "Nie"
// (inaczej ten sam mebel bez wniesienia miałby dwa różne klucze w koszyku).
export function setCarryIn(
  values: Record<string, string>,
  on: boolean
): Record<string, string> {
  const next = { ...values };
  if (on) next[CARRY_IN_KEY] = CARRY_IN_VALUE;
  else delete next[CARRY_IN_KEY];
  return next;
}

// Podstawa rabatów (zestaw, kod rabatowy, próg kodu): cena sztuki BEZ
// wniesienia × ilość. Wniesienie zawsze kosztuje pełne CARRY_IN_PRICE
// (decyzja właściciela 2026-10-06).
export function discountableSubtotal(
  unitPrice: number,
  quantity: number,
  values?: Record<string, string> | null
): number {
  return (unitPrice - carryInSurcharge(values)) * quantity;
}
```

W `app/_lib/de-content-maps.ts`, w `VARIANT_OPTION_DE` dopisz na końcu obiektu (po `Wariant: "Variante",`):

```ts
  // Klucz wniesienia — MUSI być identyczny z CARRY_IN_KEY w carry-in.ts
  // (test carry-in.test.ts pilnuje zgodności).
  "Wniesienie mebli do 4. piętra": "Hineintragen bis zur 4. Etage",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/carry-in.test.ts app/_lib/__tests__/de-content-maps.test.ts`
Expected: PASS (wszystkie).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/carry-in.ts app/_lib/de-content-maps.ts app/_lib/__tests__/carry-in.test.ts
git commit -m "feat(wniesienie): moduł carry-in — klucz, cena 250 zł, podstawa rabatów"
```

---

### Task 2: Cena pozycji w checkoucie (serwer)

**Files:**
- Create: `app/_lib/checkout-pricing.ts`
- Modify: `app/api/checkout/route.ts` (importy l. 8–17; blok ceny l. 187–216; `computedItems` l. 231–236)
- Test: `app/_lib/__tests__/checkout-pricing.test.ts`

**Interfaces:**
- Consumes: `CARRY_IN_KEY`, `hasCarryIn`, `carryInSurcharge`, `discountableSubtotal` (Task 1); `hasVariants`, `isVariantSelectionComplete`, `sumValueSurcharges` (`app/_lib/variants.ts`); `effectivePrice` (`app/_lib/pricing.ts`).
- Produces:
  - `type CheckoutItemPrice = { ok: true; unitPrice: number; variantValues: Record<string, string> | null } | { ok: false; reason: "variant_incomplete" }`
  - `priceCheckoutItem(product: Product, rawValues: Record<string, string> | null | undefined): CheckoutItemPrice`

- [ ] **Step 1: Write the failing test**

`app/_lib/__tests__/checkout-pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Product } from "../types";
import { priceCheckoutItem } from "../checkout-pricing";
import { CARRY_IN_KEY } from "../carry-in";

const plain = {
  id: "t1",
  name: "Topper",
  price: 400,
  sale_price: null,
  variants: null,
} as unknown as Product;

const sofa = {
  id: "s1",
  name: "Sofa",
  price: 2650,
  sale_price: null,
  variants: {
    options: [
      { name: "Tkanina", values: ["Riviera 16", "Sawana 21"], value_prices: { "Sawana 21": 150 } },
      { name: "Strona", values: ["Lewa", "Prawa"] },
    ],
  },
} as unknown as Product;

const sofaOnSale = { ...sofa, sale_price: 2400 } as unknown as Product;
const complete = { Tkanina: "Sawana 21", Strona: "Lewa" };

describe("priceCheckoutItem — produkt bez wariantów", () => {
  it("bez wartości: cena produktu, variantValues null (koszyk sprzed wdrożenia)", () => {
    expect(priceCheckoutItem(plain, undefined)).toEqual({ ok: true, unitPrice: 400, variantValues: null });
  });
  it("z wniesieniem: +250 i klucz zostaje (dziś serwer by go wyrzucił)", () => {
    expect(priceCheckoutItem(plain, { [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 650,
      variantValues: { [CARRY_IN_KEY]: "Tak" },
    });
  });
  it("wartość inna niż „Tak” nie dolicza i nie trafia do zamówienia", () => {
    expect(priceCheckoutItem(plain, { [CARRY_IN_KEY]: "Nie" })).toEqual({ ok: true, unitPrice: 400, variantValues: null });
  });
  it("puste options traktuje jak brak wariantów", () => {
    const legacy = { ...plain, variants: { options: [] } } as unknown as Product;
    expect(priceCheckoutItem(legacy, { [CARRY_IN_KEY]: "Tak" })).toMatchObject({ ok: true, unitPrice: 650 });
  });
});

describe("priceCheckoutItem — produkt z wariantami", () => {
  it("dopłata wariantu + wniesienie", () => {
    expect(priceCheckoutItem(sofa, { ...complete, [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 2650 + 150 + 250,
      variantValues: { ...complete, [CARRY_IN_KEY]: "Tak" },
    });
  });
  it("niekompletny wybór → odrzucenie, nawet z wniesieniem", () => {
    expect(priceCheckoutItem(sofa, { Tkanina: "Sawana 21", [CARRY_IN_KEY]: "Tak" })).toEqual({
      ok: false,
      reason: "variant_incomplete",
    });
    expect(priceCheckoutItem(sofa, undefined)).toEqual({ ok: false, reason: "variant_incomplete" });
  });
  it("promocja nie obniża wniesienia: effectivePrice(2800, 2550) + 250", () => {
    expect(priceCheckoutItem(sofaOnSale, { ...complete, [CARRY_IN_KEY]: "Tak" })).toMatchObject({
      ok: true,
      unitPrice: 2550 + 250,
    });
  });
  it("obce klucze z przeglądarki odpadają", () => {
    const res = priceCheckoutItem(sofa, { ...complete, Hack: "x" });
    expect(res).toEqual({ ok: true, unitPrice: 2800, variantValues: complete });
  });
  it("cena z bazy jako string (numeric z PostgREST) liczy się jak liczba", () => {
    const str = { ...plain, price: "400" } as unknown as Product;
    expect(priceCheckoutItem(str, { [CARRY_IN_KEY]: "Tak" })).toMatchObject({ unitPrice: 650 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/checkout-pricing.test.ts`
Expected: FAIL — `Failed to resolve import "../checkout-pricing"`.

- [ ] **Step 3: Write minimal implementation**

`app/_lib/checkout-pricing.ts`:

```ts
// Autorytatywna cena sztuki w /api/checkout (spec 2026-10-06). Czysta — bez
// Supabase, żeby dało się ją przetestować bez składania zamówień w żywej bazie.
// Z klienta bierzemy tylko WYBÓR (variantValues); ceny wyłącznie z danych
// produktu i ze stałej CARRY_IN_PRICE.
import type { Product } from "./types";
import { hasVariants, isVariantSelectionComplete, sumValueSurcharges } from "./variants";
import { effectivePrice } from "./pricing";
import { CARRY_IN_KEY, carryInSurcharge, hasCarryIn } from "./carry-in";

export type CheckoutItemPrice =
  | { ok: true; unitPrice: number; variantValues: Record<string, string> | null }
  | { ok: false; reason: "variant_incomplete" };

export function priceCheckoutItem(
  product: Product,
  rawValues: Record<string, string> | null | undefined
): CheckoutItemPrice {
  const raw = rawValues ?? {};
  // Meble robione na zamówienie — walidujemy tylko kompletność wyboru
  // wariantu (nie stany magazynowe).
  if (hasVariants(product) && !isVariantSelectionComplete(product, raw)) {
    return { ok: false, reason: "variant_incomplete" };
  }

  // Do zamówienia trafiają tylko znane klucze: opcje produktu + wniesienie
  // (wyłącznie z wartością "Tak"). Wcześniej przy produkcie z wariantami szło
  // wszystko, co przysłała przeglądarka.
  const options = product.variants?.options ?? [];
  const values: Record<string, string> = {};
  for (const opt of options) {
    const v = raw[opt.name];
    if (typeof v === "string" && v) values[opt.name] = v;
  }
  if (hasCarryIn(raw)) values[CARRY_IN_KEY] = raw[CARRY_IN_KEY];

  // Dopłaty wariantu wchodzą do ceny regularnej i promocyjnej (jak dotąd);
  // wniesienie dochodzi PO effectivePrice, więc promocja go nie obniża.
  const surcharge = sumValueSurcharges(options, values);
  const regular = Number(product.price) + surcharge;
  const sale = product.sale_price != null ? Number(product.sale_price) + surcharge : null;
  const unitPrice = effectivePrice(regular, sale) + carryInSurcharge(values);

  return {
    ok: true,
    unitPrice,
    variantValues: Object.keys(values).length > 0 ? values : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/checkout-pricing.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `/api/checkout`**

W `app/api/checkout/route.ts`:

a) Usuń importy, które przestaną być używane:

```ts
import {
  hasVariants,
  isVariantSelectionComplete,
  sumValueSurcharges,
} from "@/app/_lib/variants";
```
oraz
```ts
import { effectivePrice } from "@/app/_lib/pricing";
```
i dodaj w ich miejsce:
```ts
import { priceCheckoutItem } from "@/app/_lib/checkout-pricing";
import { discountableSubtotal } from "@/app/_lib/carry-in";
```

b) Zastąp cały blok od `let unitPrice = effectivePrice(Number(product.price), product.sale_price);` do zamykającej klamry `if (hasVariants(product)) { … }` (obecnie l. 187–216, kończy się na `variantValues = item.variantValues;\n      }`) tym:

```ts
      // Cena sztuki = baza + dopłaty wariantu (+ promocja) + wniesienie —
      // wszystko z danych serwera (app/_lib/checkout-pricing.ts).
      const priced = priceCheckoutItem(product, item.variantValues);
      if (!priced.ok) {
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
      const unitPrice = priced.unitPrice;
      const variantValues = priced.variantValues;
```

Linie bezpośrednio niżej (`total += unitPrice * item.quantity;` i `orderItems.push({ … price: unitPrice, variant_values: variantValues, … })`) zostają bez zmian.

c) W `computedItems` zmień linię `subtotal`:

```ts
    // Podstawa rabatu zestawu i kodu rabatowego — BEZ wniesienia (usługa
    // zawsze kosztuje pełne CARRY_IN_PRICE). `total` wyżej liczy pełną kwotę.
    const computedItems = body.items.map((it, idx) => ({
      productId: it.id,
      quantity: it.quantity,
      subtotal: discountableSubtotal(
        orderItems[idx].price,
        it.quantity,
        orderItems[idx].variant_values
      ),
      bundle: it.bundle ?? null,
    }));
```

- [ ] **Step 6: Typecheck, lint, full unit suite**

Run: `npx tsc --noEmit` → Expected: brak błędów.
Run: `npx eslint app/api/checkout/route.ts app/_lib/checkout-pricing.ts` → Expected: brak błędów.
Run: `npm test` → Expected: wszystkie PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/checkout-pricing.ts app/_lib/__tests__/checkout-pricing.test.ts app/api/checkout/route.ts
git commit -m "feat(wniesienie): checkout dolicza 250 zł z serwera, rabaty bez wniesienia"
```

---

### Task 3: Rabaty w koszyku i na checkoucie (klient)

**Files:**
- Modify: `app/_lib/bundles.ts` (`CartBundleGroup` l. ~161, `groupCartBundles` l. ~175–205)
- Modify: `app/koszyk/page.tsx` (`eligibleBase`, l. ~54–56)
- Test: `app/_lib/__tests__/bundles.test.ts` (blok `describe("groupCartBundles"` l. ~145)

**Interfaces:**
- Consumes: `discountableSubtotal`, `CARRY_IN_KEY` (Task 1).
- Produces: `CartBundleGroup<T>` z nowym polem `discountBase: number` (`base` dalej = pełna kwota z wniesieniem, do wyświetlania); `groupCartBundles<T extends { price: number; quantity: number; bundle?: CartItemBundle | null; variantValues?: Record<string, string> }>`.

- [ ] **Step 1: Write the failing test**

Na górze `bundles.test.ts` dopisz import:
```ts
import { CARRY_IN_KEY, discountableSubtotal } from "../carry-in";
```

W bloku `describe("groupCartBundles", …)` dopisz:

```ts
  it("rabat liczy się od ceny bez wniesienia, base pokazuje pełną kwotę", () => {
    const withCarry = { ...mk("p1", 3250, 1, "k1"), variantValues: { [CARRY_IN_KEY]: "Tak" } };
    const groups = groupCartBundles([withCarry, mk("p2", 2000, 1, "k1")]);
    expect(groups[0].base).toBe(5250);
    expect(groups[0].discountBase).toBe(5000);
    expect(groups[0].discount).toBe(500);
  });
```

Pod blokiem `describe("eligiblePromoBase"` (albo na końcu pliku) dopisz:

```ts
describe("eligiblePromoBase + wniesienie (podstawa kodu w koszyku)", () => {
  it("zaznaczenie wniesienia nie podnosi podstawy kodu rabatowego", () => {
    const items = [
      { price: 1250, quantity: 2, variantValues: { [CARRY_IN_KEY]: "Tak" } },
      { price: 400, quantity: 1, variantValues: undefined },
    ];
    const base = eligiblePromoBase(
      items.map((i) => ({ subtotal: discountableSubtotal(i.price, i.quantity, i.variantValues), bundle: null }))
    );
    expect(base).toBe(1000 * 2 + 400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts`
Expected: FAIL — `discountBase` undefined (`expected undefined to be 5000`), a `discount` = 525.

- [ ] **Step 3: Implement**

W `app/_lib/bundles.ts` dodaj import na górze:
```ts
import { discountableSubtotal } from "./carry-in";
```

W `CartBundleGroup<T>` po `base: number;` dodaj:
```ts
  // Podstawa rabatu — suma BEZ wniesienia (spec 2026-10-06). `base` zostaje
  // pełną kwotą do wyświetlania („razem" przekreślone w koszyku).
  discountBase: number;
```

W `groupCartBundles` zmień ograniczenie generyka na:
```ts
  T extends {
    price: number;
    quantity: number;
    bundle?: CartItemBundle | null;
    variantValues?: Record<string, string>;
  }
```
w inicjalizacji grupy po `base: 0,` dodaj `discountBase: 0,`, po `g.base += it.price * it.quantity;` dodaj:
```ts
    g.discountBase += discountableSubtotal(it.price, it.quantity, it.variantValues);
```
a w pętli rabatu zamień `g.base` na `g.discountBase`:
```ts
    g.discount = computeBundleDiscount(g.discountBase, g.qty, g.discountType, g.discountValue);
```

W `app/koszyk/page.tsx` dodaj import `import { discountableSubtotal } from "@/app/_lib/carry-in";` i zmień `eligibleBase`:

```ts
  // Kod rabatowy NIE obejmuje pozycji z zestawów (decyzja użytkownika) ani
  // wniesienia (spec 2026-10-06) — podstawą są pozycje spoza zestawów, bez 250 zł.
  const eligibleBase = eligiblePromoBase(
    items.map((i) => ({
      subtotal: discountableSubtotal(i.price, i.quantity, i.variantValues),
      bundle: i.bundle ?? null,
    }))
  );
```

(`CheckoutForm.tsx` woła `groupCartBundles(items)` — dostaje poprawkę za darmo; nie zmieniaj go.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/bundles.test.ts` → Expected: PASS.
Run: `npx tsc --noEmit` → Expected: brak błędów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/bundles.ts app/_lib/__tests__/bundles.test.ts app/koszyk/page.tsx
git commit -m "feat(wniesienie): rabat zestawu i kod rabatowy w koszyku bez wniesienia"
```

---

### Task 4: Pole na stronie produktu i w konfiguratorze zestawu

**Files:**
- Create: `app/_components/ui/CarryInOption.tsx`
- Modify: `app/_components/ui/ProductActions.tsx`
- Modify: `app/_components/ui/BundleConfigurator.tsx`
- Modify: `app/_components/ui/ReorderButton.tsx` (cena pozycji, l. ~75)
- Modify: `app/_lib/dictionaries/pl.ts` (typ `product` l. ~84 i wartość l. ~536), `app/_lib/dictionaries/de.ts` (l. ~86)
- Test: `e2e/wniesienie.spec.ts`

**Interfaces:**
- Consumes: `hasCarryIn`, `setCarryIn`, `carryInSurcharge`, `CARRY_IN_PRICE`, `CARRY_IN_KEY` (Task 1).
- Produces: `CarryInOption({ checked: boolean; onChange: (next: boolean) => void })`; słownik `t.product.carryInLabel: string`.

- [ ] **Step 1: Write the failing e2e test**

`e2e/wniesienie.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { CARRY_IN_KEY, CARRY_IN_PRICE } from "../app/_lib/carry-in";

// Wniesienie mebli (spec 2026-10-06): pole przy produkcie, domyślnie
// odznaczone. Sprawdzamy koszyk w localStorage (cena sztuki, klucz) i dopisek
// na /koszyk. Nic nie zapisujemy w bazie — checkoutu nie składamy.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mollien.cookie-consent",
      JSON.stringify({
        necessary: true,
        analytics: false,
        marketing: false,
        version: 1,
        decidedAt: new Date().toISOString(),
      })
    );
  });
});

type StoredItem = { id: string; price: number; variantValues?: Record<string, string> };
const cartItems = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("mollien-cart-items") ?? "[]") as StoredItem[]
  );

test("wniesienie: odznaczone domyślnie, zaznaczone dolicza 250 zł i dopisek", async ({ page }) => {
  // Produkt bez wariantów — materace nawierzchniowe (jak w kup-teraz.spec.ts).
  await page.goto("/sklep?q=nawierzchniowy");
  const href = await page
    .locator("div.group")
    .filter({ has: page.locator('button[aria-label="Dodaj do koszyka"]') })
    .first()
    .locator('a[href*="/produkt/"]')
    .first()
    .getAttribute("href", { timeout: 15_000 })
    .catch(() => null);
  test.skip(!href, "brak produktu bez wariantów w wynikach 'nawierzchniowy'");
  await page.goto(href!);

  const checkbox = page.getByRole("checkbox", { name: /Wniesienie mebli/ });
  await expect(checkbox).not.toBeChecked();

  const add = page.getByRole("button", { name: "Dodaj do koszyka" });
  await add.click();
  await checkbox.check();
  await add.click();

  await expect.poll(async () => (await cartItems(page)).length).toBe(2);
  const [plain, carried] = await cartItems(page);
  expect(plain.variantValues).toBeUndefined();
  expect(carried.variantValues).toEqual({ [CARRY_IN_KEY]: "Tak" });
  expect(carried.price).toBe(plain.price + CARRY_IN_PRICE);

  await page.goto("/koszyk");
  await expect(page.getByText(`${CARRY_IN_KEY}: Tak`)).toHaveCount(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/wniesienie.spec.ts --project=chromium` (bez `E2E_BASE_URL` = produkcja, tylko odczyt)
Expected: FAIL — `getByRole('checkbox', { name: /Wniesienie mebli/ })` not found.

- [ ] **Step 3: Słowniki**

`app/_lib/dictionaries/pl.ts`, w typie `product` po `buyNow: string;`:
```ts
    carryInLabel: string;
```
i w wartościach po `buyNow: "Kup teraz",`:
```ts
    carryInLabel: "Wniesienie mebli (do 4. piętra)",
```
`app/_lib/dictionaries/de.ts` po `buyNow: "Jetzt kaufen",`:
```ts
    carryInLabel: "Hineintragen der Möbel (bis zur 4. Etage)",
```

- [ ] **Step 4: `CarryInOption` + `ProductActions`**

`app/_components/ui/CarryInOption.tsx`:

```tsx
"use client";

import { CARRY_IN_PRICE } from "@/app/_lib/carry-in";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";

// Pole „Wniesienie mebli" (spec 2026-10-06) — domyślnie odznaczone, nie
// blokuje dodania do koszyka. Stan trzyma rodzic w variantValues (setCarryIn).
// Zwykły <label> wokół checkboxa jest tu celowy: klik w napis ma przełączać
// pole (to nie widżet złożony z pułapki `Field` w panelu).
export default function CarryInOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none rounded-2xl border border-[var(--border)] px-4 py-3 hover:border-[var(--color-gold)] has-[:checked]:border-[var(--color-gold)] transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--color-gold)]"
      />
      <span className="flex-1 font-sans text-sm text-[var(--fg)]">{t.product.carryInLabel}</span>
      <span className="font-sans text-sm font-semibold text-[var(--fg)]">
        +{formatMoney(CARRY_IN_PRICE, locale, rate)}
      </span>
    </label>
  );
}
```

W `app/_components/ui/ProductActions.tsx`:
- importy:
```ts
import CarryInOption from "./CarryInOption";
import { carryInSurcharge, hasCarryIn, setCarryIn } from "@/app/_lib/carry-in";
```
- cena:
```ts
  // Cena do koszyka = wariant (z promocją) + wniesienie. Cena WYŚWIETLANA
  // w ProductMainSection celowo bez wniesienia (Omnibus dotyczy mebla).
  const price = getVariantEffectivePrice(product, selected) + carryInSurcharge(selected);
```
- pod blokiem `{showVariants && ( <VariantSelector … /> )}`, przed pierwszym `<AddToCartButton`:
```tsx
      <CarryInOption
        checked={hasCarryIn(selected)}
        onChange={(on) => onChange(setCarryIn(selected, on))}
      />
```
(`VariantSelector.pick` robi `{ ...selected, [name]: value }`, więc klucz wniesienia przeżywa zmianę wariantu; `AddToCartButton` wysyła `variantValues`, gdy `selected` jest niepusty — też przy produkcie bez wariantów. Bez zmian w `AddToCartButton` i `ProductMainSection`.)

- [ ] **Step 5: `BundleConfigurator`**

W `app/_components/ui/BundleConfigurator.tsx`:
- importy: dopisz `import CarryInOption from "./CarryInOption";` i `import { carryInSurcharge, hasCarryIn, setCarryIn } from "@/app/_lib/carry-in";`
- zastąp `const base = useMemo(…)` i `const discount = computeBundleDiscount(…)`:

```ts
  // Rabat zestawu liczy się od cen BEZ wniesienia (spec 2026-10-06);
  // wniesienie doliczamy do kwot wyświetlanych w pełnej wysokości.
  const discountBase = useMemo(
    () =>
      bundle.components.reduce(
        (s, p) => s + getVariantEffectivePrice(p, selections[p.id] ?? {}),
        0
      ),
    [bundle.components, selections]
  );
  const carryInTotal = bundle.components.reduce(
    (s, p) => s + carryInSurcharge(selections[p.id]),
    0
  );
  const base = discountBase + carryInTotal;
  const discount = computeBundleDiscount(
    discountBase,
    1,
    bundle.discount_type,
    Number(bundle.discount_value)
  );
```
- w `handleAdd`, w mapowaniu `items`:
```ts
      price:
        getVariantEffectivePrice(p, selections[p.id] ?? {}) + carryInSurcharge(selections[p.id]),
```
oraz zamień `variantValues: hasVariants(p) ? selections[p.id] : undefined,` na:
```ts
      // Niepusty wybór — także samo wniesienie przy elemencie bez wariantów.
      variantValues:
        Object.keys(selections[p.id] ?? {}).length > 0 ? selections[p.id] : undefined,
```
- cena przy elemencie (`<p className="text-sm text-[var(--muted)]">`):
```tsx
                {formatMoney(
                  getVariantEffectivePrice(p, selections[p.id] ?? {}) + carryInSurcharge(selections[p.id]),
                  locale,
                  rate
                )}
```
- pod `{hasVariants(p) && ( <VariantSelector … /> )}` w karcie elementu:
```tsx
          <CarryInOption
            checked={hasCarryIn(selections[p.id])}
            onChange={(on) =>
              setSelections((prev) => ({ ...prev, [p.id]: setCarryIn(prev[p.id] ?? {}, on) }))
            }
          />
```
Podsumowanie (`base`, `base - discount`, `discount`) zostaje bez zmian — `base` ma teraz wniesienie. `hasVariants` dalej jest używane (render `VariantSelector`), więc import zostaje.

- [ ] **Step 6: `ReorderButton`**

W `app/_components/ui/ReorderButton.tsx` dopisz import `import { carryInSurcharge } from "@/app/_lib/carry-in";` i zmień cenę w `add({ … })`:
```ts
        // Wniesienie z poprzedniego zamówienia — koszyk ma pokazać tyle,
        // ile policzy checkout (spec 2026-10-06).
        price: Number(item.product.price) + carryInSurcharge(item.variant_values),
```

- [ ] **Step 7: Build lokalny + e2e zielony**

Sprawdź, czy port 3000/3100 jest wolny (`netstat -ano | grep -E ":(3000|3100) .*LISTENING"`), potem:
Run: `npx tsc --noEmit && npm test` → Expected: PASS.
Run: `npm run build` → Expected: sukces.
Run (w tle): `PORT=3100 npm start`
Run: `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/wniesienie.spec.ts e2e/kup-teraz.spec.ts --project=chromium`
Expected: PASS (3 testy + setup).
Zrzut ekranu pola na stronie produktu bez wariantów i z wariantami (jasny + ciemny motyw przez `localStorage.theme`) do katalogu scratchpad — obejrzyj przed commitem. Zatrzymaj serwer i upewnij się, że port 3100 jest wolny.

- [ ] **Step 8: Commit**

```bash
git add app/_components/ui/CarryInOption.tsx app/_components/ui/ProductActions.tsx app/_components/ui/BundleConfigurator.tsx app/_components/ui/ReorderButton.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts e2e/wniesienie.spec.ts
git commit -m "feat(wniesienie): pole „Wniesienie mebli +250 zł” przy produkcie i w zestawie"
```

---

### Task 5: Tekst na `/dostawa`

**Files:**
- Modify: `app/(legal)/dostawa/page.tsx` (`carry` DE l. ~55, PL l. ~93)

**Interfaces:**
- Consumes: `CARRY_IN_PRICE` (Task 1).

- [ ] **Step 1: Podmień teksty**

Dopisz import `import { CARRY_IN_PRICE } from "@/app/_lib/carry-in";`.

PL `carry`:
```ts
        carry: `Standardowa dostawa obejmuje transport pod pierwsze drzwi budynku. Wniesienie mebli do 4. piętra możesz zamówić przy produkcie – zaznacz „Wniesienie mebli” przed dodaniem do koszyka (${CARRY_IN_PRICE} zł za sztukę).`,
```
DE `carry`:
```ts
        carry:
          "Die Standardlieferung umfasst den Transport bis zur ersten Tür des Gebäudes. Das Hineintragen der Möbel bis zur 4. Etage können Sie direkt beim Produkt bestellen – markieren Sie „Hineintragen der Möbel“ vor dem Hinzufügen zum Warenkorb (Aufpreis pro Stück beim Produkt angegeben).",
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint "app/(legal)/dostawa/page.tsx"` → Expected: brak błędów.

- [ ] **Step 3: Commit**

```bash
git add "app/(legal)/dostawa/page.tsx"
git commit -m "docs(dostawa): wniesienie zamawia się przy produkcie, 250 zł za sztukę"
```

---

### Task 6: Integracja i porządki po wdrożeniu

- [ ] **Step 1:** Recenzja całej gałęzi (`git diff origin/main..feat/wniesienie-mebli` — dwie kropki) pod kątem Review Focus.
- [ ] **Step 2:** Decyzja właściciela o integracji (superpowers:finishing-a-development-branch). Push/PR/merge z konta Woodecky10 wg pamięci `push-auth-woodecky10`; przed mergem `git fetch origin <branch>` + `git log --oneline FETCH_HEAD..<branch>` musi być puste.
- [ ] **Step 3:** Po statusie Vercela „success": `npx playwright test e2e/wniesienie.spec.ts e2e/kup-teraz.spec.ts --project=chromium` na produkcji.
- [ ] **Step 4 (zapis w żywej bazie — tylko po potwierdzeniu właściciela):** usunąć opcję „Dostawa z wniesieniem do 4-tego piętra" z Narożnika Vegas Twin (`/admin/produkty/1105e534-b424-4809-81f5-4896fe22c14a`, edytor wariantów) i sprawdzić na stronie produktu, że zostało jedno pole wniesienia.

---

## STAN WYKONANIA

(uzupełniane w trakcie — jedyny nośnik stanu między komputerami, `.superpowers/sdd/` jest gitignorowany)

- [x] Task 1 — commity 08f6c92..39ddea1, recenzja bez uwag.
- [x] Task 2 — commity 39ddea1..9956351; 1 runda poprawek (brakujący trailer, amend samej wiadomości).
- [x] Task 3 — commity 9956351..b86fc69, recenzja bez uwag.
- [x] Task 4 — commity b86fc69..78c8ca1, recenzja bez uwag.
- [x] Task 5 — commity 78c8ca1..eb3f8fc; 2 rundy poprawek (zakończenia linii i BOM, potem cudzysłowy PL/DE).
- [x] Task 6 — DOMKNIĘTE 2026-10-06:
  - krok 1: końcowa recenzja całej gałęzi „With fixes", poprawione w tej samej gałęzi (ReorderButton liczy cenę przez `getVariantEffectivePrice` + wniesienie, ta sekcja uzupełniona, kompletność wariantu sprawdzana na przefiltrowanych wartościach);
  - krok 2: zmergowane i wdrożone — PR #185 (merge `0f28ed4`), status Vercela „success";
  - krok 3: e2e na produkcji `wniesienie.spec.ts` + `kup-teraz.spec.ts` — 4/4 „passed" (żaden „skipped");
  - krok 4: za zgodą właściciela usunięta stara opcja Vegas Twin „Dostawa z wniesieniem do 4-tego piętra" (panel admina, „Zapisz warianty"); pozostałe opcje i overrides identyczne z kopią sprzed zmiany; strona produktu pokazuje jedno pole wniesienia. Starych koszyków z tym kluczem NIE mapujemy na `CARRY_IN_KEY` (brak decyzji właściciela — zostaje w follow-upach).

### Rozstrzygnięcia (Ruling)

- Ruling 1 (pre-flight): Task 1 dodaje też `Tak: "Ja"` do `VARIANT_VALUE_DE` — test DE z planu bez tego nie przejdzie, a „Tak"→„Ja" jest poprawne wszędzie.
- Ruling 2 (pre-flight): e2e z Task 4 klika `getByRole("button", { name: "Dodaj do koszyka", exact: true }).first()` — karty w sliderach też mają taki aria-label (strict mode); główny przycisk jest pierwszy w DOM.
- Ruling 3 (pre-flight): każdy commit kończy się trailerem `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — atrybucja wymagana przez sesję.
- Ruling (Task 2): re-recenzja rundy 1 to mechaniczne sprawdzenie kontrolera (`git diff 3563648 9956351` puste, grep trailera = 1), bez dispatchu recenzenta — drzewo identyczne z zatwierdzonym.
- Ruling (Task 5): recenzja rundy 1 objęła całość `78c8ca1..40f8ead` (commit amendowany, osobnego diffu poprawki nie ma).
- Ruling (Task 5): uwaga re-recenzenta, że trailer ma mówić „Haiku 4.5", odrzucona — trailer to atrybucja sesji (Opus 5.5), recenzent pomylił go z własnym modelem.
- Ruling (recenzja końcowa): fala poprawek obejmuje Important 1, Important 2 i Minor 3; Minor 4 idzie do właściciela jako decyzja (zmienia, co zapłacą stare koszyki); Minory 5–7 zostają jako follow-upy.

### Follow-upy (świadomie niezrobione)

- Checkout nie sprawdza, czy wybrana wartość ∈ `opt.values` (luka sprzed tej gałęzi — spreparowane żądanie może ominąć dopłaty).
- Jeden wspólny helper ceny jednostkowej dla klienta i serwera (formuła zapisana 4×).
- Komunikat o minimalnej kwocie promocji mógłby brzmieć „(bez wniesienia i zestawów)".
- Helper `cartPromoBase(items)`, żeby podstawę promocji w koszyku objąć testem jednostkowym.
- Decyzja właściciela: czy stare koszyki z kluczem Vegas Twin mapować na `CARRY_IN_KEY` (dziś po usunięciu opcji wniesienie z takiego koszyka znika po cichu).
- Regulamin nie opisuje płatnej usługi wniesienia (właściciel/prawnik).
- Etykieta DE to „Hineintragen bis zur 4. Etage" (plan), a spec ma „Hereintragen bis 4. Etage" — wygrywa plan, /de zamrożone.
