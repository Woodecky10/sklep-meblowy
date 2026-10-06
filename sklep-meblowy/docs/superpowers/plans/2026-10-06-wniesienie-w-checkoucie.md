# Wniesienie w checkoucie (raz na zamówienie) — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wniesienie mebli przenosi się ze strony produktu do checkoutu: jedno pole „Dostawa z wniesieniem do 4. piętra +250 zł" między „Adres dostawy" a „Metoda płatności", 250 zł raz na zamówienie, zapisane jako pozycja zamówienia spoza katalogu.

**Architecture:** Wybór żyje w stanie koszyka (`carryIn`, persist w localStorage). Formularz wysyła `carryIn: true`; serwer po rabatach dopisuje pozycję `{ product_id: null, custom_name: "Wniesienie mebli do 4. piętra", 1 × 250 }` (mechanizm migracji 82) i dolicza 250 zł do sumy. Cała logika „za sztukę" z PR #185 znika; jej klucz zostaje tylko do migracji koszyków.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest (`environment: "node"`, testy w `app/**/__tests__/**/*.test.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-wniesienie-mebli-design.md` — sekcja „Aktualizacja 2026-10-06 — wniesienie raz na zamówienie, w checkoucie" (ona wiąże tam, gdzie kłóci się z wcześniejszymi sekcjami).

Wszystkie komendy z katalogu `sklep-meblowy/` (tam jest `package.json`; korzeń repo jest piętro wyżej). Gałąź: `feat/wniesienie-checkout`.

## Global Constraints

- `CARRY_IN_PRICE = 250` — raz na zamówienie, nie za sztukę.
- `CARRY_IN_LINE_NAME = "Wniesienie mebli do 4. piętra"` — nazwa pozycji zamówienia (`order_items.custom_name`), klucz zapisu: nie zmieniać.
- `LEGACY_ITEM_CARRY_IN_KEY = "Wniesienie mebli do 4. piętra"` — klucz z wersji „za sztukę", WYŁĄCZNIE do migracji koszyków.
- Serwer dolicza wniesienie tylko przy `body.carryIn === true` i tylko ze swojej stałej; PO rabatach (kod, zestaw, próg kodu go nie obejmują).
- Pole w checkoucie domyślnie odznaczone; sekcja między „Adres dostawy" a „Metoda płatności".
- Bez migracji bazy (kolumna `custom_name` istnieje od migracji 82 — sprawdzone na produkcji).
- Pliki w repo mają CRLF w kopii roboczej (`core.autocrlf=true`, indeks LF): edytuj narzędziem Edit; nigdy `sed -i`/`perl -pi`/PowerShell `Set-Content`. Po commicie: `git diff --stat` bez całoplikowych zmian, `git ls-files --eol <plik>` = `i/lf`, brak BOM.
- Każdy commit kończy się pustą linią i `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Baza wspólna z produkcją: żadnych testów, które składają zamówienie lub zapisują w panelu.

## Review Focus

1. Koszyk z wersji „za sztukę" ma ten sam mebel z wniesieniem i bez → po wczytaniu JEDNA pozycja z sumą ilości, cena bez 250 zł, pole w checkoucie zaznaczone. Test: Task 3, krok 1.
2. `body.carryIn` przychodzi jako `"true"`, `1` albo brak → żadnej pozycji, żadnej dopłaty. Test: Task 1, krok 1.
3. Kod rabatowy przy zaznaczonym wniesieniu → rabat liczony od samych mebli, a 250 zł dochodzi po nim (serwer i podsumowanie w formularzu). Test: Task 1, krok 1 (`applyCarryIn` dostaje sumę po rabatach); kolejność w route i w `grandTotal` — przegląd Task 2 i Task 5.
4. „Zamów ponownie" z zamówienia z wniesieniem → mebel trafia do koszyka, wniesienie nie, bez komunikatu o niedostępnej pozycji. Test: Task 1, krok 1 (`isCarryInLine`); użycie w komponencie — przegląd Task 4.
5. Klient wraca z checkoutu do koszyka i z powrotem → pole nadal zaznaczone; po złożeniu zamówienia (`clear()`) odznaczone. Test: Task 3 (reducer `CLEAR`) + Task 5 e2e (reload).

---

### Task 1: Pozycja wniesienia — czyste funkcje

**Files:**
- Modify: `app/_lib/carry-in.ts` (dopisanie na końcu; stare eksporty zostają do Task 6)
- Test: `app/_lib/__tests__/carry-in.test.ts` (dopisanie nowych `describe`; stare zostają do Task 6)

**Interfaces:**
- Produces:
  - `CARRY_IN_LINE_NAME: string`, `LEGACY_ITEM_CARRY_IN_KEY: string`
  - `type CarryInOrderLine = { product_id: null; custom_name: string; quantity: 1; price: number; variant_values: null; notes: null }`
  - `carryInOrderLine(): CarryInOrderLine`
  - `isCarryInLine(item: { product_id?: string | null; custom_name?: string | null }): boolean`
  - `applyCarryIn<T>(items: T[], totalAfterDiscounts: number, requested: unknown): { items: (T | CarryInOrderLine)[]; total: number }`

- [ ] **Step 1: Write the failing test**

Do ISTNIEJĄCEGO importu z `"../carry-in"` na górze pliku dopisz nazwy `CARRY_IN_LINE_NAME`, `LEGACY_ITEM_CARRY_IN_KEY`, `applyCarryIn`, `carryInOrderLine`, `isCarryInLine` (jeden import, nie drugi — lint), a na końcu pliku dopisz:

```ts
describe("wniesienie raz na zamówienie — pozycja zamówienia", () => {
  it("nazwa pozycji i klucz migracji mają dokładne wartości (klucze zapisu)", () => {
    expect(CARRY_IN_LINE_NAME).toBe("Wniesienie mebli do 4. piętra");
    expect(LEGACY_ITEM_CARRY_IN_KEY).toBe("Wniesienie mebli do 4. piętra");
  });

  it("carryInOrderLine: pozycja spoza katalogu 1 × 250 zł", () => {
    expect(carryInOrderLine()).toEqual({
      product_id: null,
      custom_name: "Wniesienie mebli do 4. piętra",
      quantity: 1,
      price: 250,
      variant_values: null,
      notes: null,
    });
  });

  it("isCarryInLine: tylko wiersz bez produktu z dokładną nazwą", () => {
    expect(isCarryInLine({ product_id: null, custom_name: CARRY_IN_LINE_NAME })).toBe(true);
    expect(isCarryInLine({ product_id: undefined, custom_name: CARRY_IN_LINE_NAME })).toBe(true);
    expect(isCarryInLine({ product_id: "p1", custom_name: CARRY_IN_LINE_NAME })).toBe(false);
    expect(isCarryInLine({ product_id: null, custom_name: "Stolik z Allegro" })).toBe(false);
    expect(isCarryInLine({ product_id: null, custom_name: null })).toBe(false);
    expect(isCarryInLine({ product_id: "p1" })).toBe(false);
  });

  it("applyCarryIn(true): dopisuje pozycję i 250 zł do sumy PO rabatach", () => {
    const items = [{ product_id: "p1", price: 1000 }];
    const out = applyCarryIn(items, 900, true);
    expect(out.total).toBe(1150);
    expect(out.items).toEqual([{ product_id: "p1", price: 1000 }, carryInOrderLine()]);
    expect(items).toHaveLength(1); // nie mutuje wejścia
  });

  it("applyCarryIn: wszystko poza dokładnym true = brak wniesienia", () => {
    const items = [{ product_id: "p1", price: 1000 }];
    for (const requested of [false, undefined, null, "true", 1, {}]) {
      const out = applyCarryIn(items, 900, requested);
      expect(out.total).toBe(900);
      expect(out.items).toEqual(items);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/carry-in.test.ts`
Expected: FAIL — `CARRY_IN_LINE_NAME`/`applyCarryIn` nie istnieją (`is not a function` / `undefined`).

- [ ] **Step 3: Write minimal implementation**

Na końcu `app/_lib/carry-in.ts` dopisz:

```ts
// ── Wersja „raz na zamówienie" (aktualizacja specu 2026-10-06) ──────────
// Wniesienie wybiera się w checkoucie i zapisuje jako pozycję zamówienia
// SPOZA KATALOGU (product_id = null, custom_name — mechanizm migracji 82),
// więc panel, maile i konto klienta pokazują je bez zmian.

// Nazwa pozycji zamówienia — KLUCZ ZAPISU: po niej „Zamów ponownie"
// i analityka rozpoznają wiersz wniesienia. Nie zmieniać.
export const CARRY_IN_LINE_NAME = "Wniesienie mebli do 4. piętra";

// Klucz z wersji „za sztukę" (PR #185) — wyłącznie do migracji koszyków
// zapisanych w przeglądarkach (CartContext).
export const LEGACY_ITEM_CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";

export type CarryInOrderLine = {
  product_id: null;
  custom_name: string;
  quantity: 1;
  price: number;
  variant_values: null;
  notes: null;
};

export function carryInOrderLine(): CarryInOrderLine {
  return {
    product_id: null,
    custom_name: CARRY_IN_LINE_NAME,
    quantity: 1,
    price: CARRY_IN_PRICE,
    variant_values: null,
    notes: null,
  };
}

export function isCarryInLine(item: {
  product_id?: string | null;
  custom_name?: string | null;
}): boolean {
  return item.product_id == null && item.custom_name === CARRY_IN_LINE_NAME;
}

// Serwer (/api/checkout): dopisuje pozycję i kwotę TYLKO przy requested ===
// true — body to dowolny JSON z przeglądarki. Wołane PO rabatach, więc kod
// rabatowy i rabat zestawu nie obejmują wniesienia (decyzja właściciela).
export function applyCarryIn<T>(
  items: T[],
  totalAfterDiscounts: number,
  requested: unknown
): { items: (T | CarryInOrderLine)[]; total: number } {
  if (requested !== true) return { items, total: totalAfterDiscounts };
  return {
    items: [...items, carryInOrderLine()],
    total: totalAfterDiscounts + CARRY_IN_PRICE,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/carry-in.test.ts` → Expected: PASS (stare i nowe).
Run: `npx tsc --noEmit` → Expected: brak błędów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/carry-in.ts app/_lib/__tests__/carry-in.test.ts
git commit -m "feat(wniesienie): pozycja zamówienia „Wniesienie mebli” raz na zamówienie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Serwer — wniesienie raz na zamówienie, koniec liczenia od sztuki

**Files:**
- Modify: `app/_lib/checkout-pricing.ts`
- Modify: `app/api/checkout/route.ts` (typ body ok. l. 26–43; import l. 13; `computedItems` ok. l. 211–222; `finalTotal` + `createOrder` ok. l. 336–356)
- Modify: `app/_lib/orders.ts` (typ `items` w `createOrder`, ok. l. 7–17)
- Test: `app/_lib/__tests__/checkout-pricing.test.ts`

**Interfaces:**
- Consumes: `applyCarryIn`, `LEGACY_ITEM_CARRY_IN_KEY` (Task 1).
- Produces: `priceCheckoutItem` bez wniesienia (sygnatura bez zmian); `CheckoutBody.carryIn?: boolean`; `createOrder` przyjmuje pozycje z `product_id: string | null` i `custom_name?: string`.

- [ ] **Step 1: Update the failing tests**

W `app/_lib/__tests__/checkout-pricing.test.ts` zamień import `import { CARRY_IN_KEY } from "../carry-in";` na `import { LEGACY_ITEM_CARRY_IN_KEY as OLD_KEY } from "../carry-in";` i zastąp WSZYSTKIE testy używające klucza wniesienia tymi (testy bez klucza zostają bez zmian):

```ts
describe("priceCheckoutItem — stary klucz wniesienia (za sztukę) odpada", () => {
  it("produkt bez wariantów: klucz nie dolicza i nie trafia do zamówienia", () => {
    expect(priceCheckoutItem(plain, { [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 400,
      variantValues: null,
    });
  });
  it("puste options traktuje jak brak wariantów", () => {
    const legacy = { ...plain, variants: { options: [] } } as unknown as Product;
    expect(priceCheckoutItem(legacy, { [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 400,
      variantValues: null,
    });
  });
  it("z wariantami: dopłata wariantu tak, wniesienie nie", () => {
    expect(priceCheckoutItem(sofa, { ...complete, [OLD_KEY]: "Tak" })).toEqual({
      ok: true,
      unitPrice: 2650 + 150,
      variantValues: complete,
    });
  });
  it("niekompletny wybór dalej odrzucany", () => {
    expect(priceCheckoutItem(sofa, { Tkanina: "Sawana 21", [OLD_KEY]: "Tak" })).toEqual({
      ok: false,
      reason: "variant_incomplete",
    });
  });
  it("promocja: effectivePrice(2800, 2550), bez +250", () => {
    expect(priceCheckoutItem(sofaOnSale, { ...complete, [OLD_KEY]: "Tak" })).toMatchObject({
      ok: true,
      unitPrice: 2550,
    });
  });
  it("cena z bazy jako string liczy się jak liczba", () => {
    const str = { ...plain, price: "400" } as unknown as Product;
    expect(priceCheckoutItem(str, { [OLD_KEY]: "Tak" })).toMatchObject({ unitPrice: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/checkout-pricing.test.ts`
Expected: FAIL — `unitPrice` 650/3050/2800 zamiast 400/2800/2550 (serwer jeszcze dolicza 250 od sztuki).

- [ ] **Step 3: `priceCheckoutItem` bez wniesienia**

W `app/_lib/checkout-pricing.ts`:
- komentarz nagłówka: zamień „Z klienta bierzemy tylko WYBÓR (variantValues); ceny wyłącznie z danych produktu i ze stałej CARRY_IN_PRICE." na „Z klienta bierzemy tylko WYBÓR (variantValues); ceny wyłącznie z danych produktu. Wniesienie liczy się raz na zamówienie w /api/checkout (applyCarryIn), nie tutaj.";
- usuń import `import { CARRY_IN_KEY, carryInSurcharge, hasCarryIn } from "./carry-in";`;
- komentarz nad filtrem: „Do zamówienia trafiają tylko znane klucze — opcje produktu. Wcześniej przy produkcie z wariantami szło wszystko, co przysłała przeglądarka (m.in. klucz wniesienia z wersji „za sztukę")."
- usuń linię `if (hasCarryIn(raw)) values[CARRY_IN_KEY] = raw[CARRY_IN_KEY];`;
- komentarz i cena:
```ts
  // Dopłaty wariantu wchodzą do ceny regularnej i promocyjnej (jak dotąd).
  const surcharge = sumValueSurcharges(options, values);
  const regular = Number(product.price) + surcharge;
  const sale = product.sale_price != null ? Number(product.sale_price) + surcharge : null;
  const unitPrice = effectivePrice(regular, sale);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/checkout-pricing.test.ts` → Expected: PASS.

- [ ] **Step 5: Route + createOrder**

W `app/_lib/orders.ts`, w typie `items` funkcji `createOrder` zmień `product_id: string;` na:
```ts
    // null = pozycja spoza katalogu (migracja 82) — np. wniesienie mebli.
    product_id: string | null;
    custom_name?: string;
```

W `app/api/checkout/route.ts`:
a) import `import { discountableSubtotal } from "@/app/_lib/carry-in";` zamień na `import { applyCarryIn } from "@/app/_lib/carry-in";`.
b) w typie `CheckoutBody` po `paymentMethod?: "online" | "cod";` dodaj:
```ts
  // Wniesienie mebli raz na zamówienie (spec, aktualizacja 2026-10-06).
  // Liczy się wyłącznie dokładne true — patrz applyCarryIn.
  carryIn?: boolean;
```
c) komentarz cenowy w pętli: „Cena sztuki = baza + dopłaty wariantu (+ promocja) — wszystko z danych serwera (app/_lib/checkout-pricing.ts)."
d) `computedItems` — przywróć pełną cenę pozycji jako podstawę rabatów:
```ts
    // ── Zestawy (spec 2026-07-16): klient przysyła tylko {id, unitKey} —
    // skład i rabat weryfikujemy/liczymy wyłącznie z danych serwerowych.
    const computedItems = body.items.map((it, idx) => ({
      productId: it.id,
      quantity: it.quantity,
      subtotal: orderItems[idx].price * it.quantity,
      bundle: it.bundle ?? null,
    }));
```
e) zastąp
```ts
    const finalTotal = toCharge(
      Math.max(0, total - bundleDiscount - promoDiscount)
    );
```
tym:
```ts
    // Wniesienie (aktualizacja specu 2026-10-06): raz na zamówienie, PO
    // rabatach — kod i zestawy go nie obniżają. Pozycja spoza katalogu
    // (custom_name) idzie do order_items, kwota ze stałej serwera.
    const withCarryIn = applyCarryIn(
      orderItems,
      Math.max(0, total - bundleDiscount - promoDiscount),
      body.carryIn
    );
    const finalTotal = toCharge(withCarryIn.total);
```
oraz w komentarzu nad nim „Do P24 idzie tylko cena produktów (minus rabaty: zestawy + kod)" → „Do P24 idzie cena produktów (minus rabaty: zestawy + kod) plus ewentualne wniesienie".
f) w `createOrder({ … })` zmień `items: orderItems.map((it) => ({ ...it, price: toCharge(it.price) })),` na:
```ts
      items: withCarryIn.items.map((it) => ({ ...it, price: toCharge(it.price) })),
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` → Expected: brak błędów.
Run: `npx eslint app/api/checkout/route.ts app/_lib/checkout-pricing.ts app/_lib/orders.ts` → Expected: brak błędów.
Run: `npm test` → Expected: wszystkie PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/checkout-pricing.ts app/_lib/__tests__/checkout-pricing.test.ts app/api/checkout/route.ts app/_lib/orders.ts
git commit -m "feat(wniesienie): serwer dolicza 250 zł raz na zamówienie, po rabatach" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Koszyk pamięta wybór + migracja koszyków „za sztukę"

**Files:**
- Modify: `app/_context/CartContext.tsx`
- Modify: `app/_lib/__tests__/cart-reducer.test.ts` (literał `empty`, l. 5), `app/_lib/__tests__/carry-in.test.ts` (literał `empty` w teście koszyka)
- Test: `app/_lib/__tests__/cart-carry-in.test.ts` (nowy)

**Interfaces:**
- Consumes: `CARRY_IN_PRICE`, `LEGACY_ITEM_CARRY_IN_KEY` (Task 1).
- Produces:
  - `CartState.carryIn: boolean`; akcja `{ type: "SET_CARRY_IN"; on: boolean }`; `HYDRATE` niesie `carryIn: boolean`; `CLEAR` zeruje `carryIn`.
  - `useCart()` zwraca też `carryIn: boolean` i `setCarryIn: (on: boolean) => void`.
  - `export function migrateLegacyCarryIn(items: CartItem[]): { items: CartItem[]; carryIn: boolean }` z `CartContext.tsx`.
  - Ruling względem specu: migracja mieszka w `CartContext.tsx`, nie w `carry-in.ts` — potrzebuje `itemKey`/`clampQty` do scalenia duplikatów, a `carry-in.ts` importuje też serwer (bez Reacta).

- [ ] **Step 1: Write the failing test**

`app/_lib/__tests__/cart-carry-in.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  cartReducer,
  migrateLegacyCarryIn,
  type CartItem,
  type CartState,
} from "@/app/_context/CartContext";
import { LEGACY_ITEM_CARRY_IN_KEY as OLD_KEY } from "../carry-in";

const empty: CartState = { items: [], appliedPromo: null, hydrated: true, carryIn: false };
const fotel = (over: Partial<CartItem> = {}): CartItem => ({
  id: "p1",
  name: "Fotel",
  price: 1000,
  image: "",
  quantity: 1,
  ...over,
});

describe("cartReducer — wniesienie", () => {
  it("SET_CARRY_IN włącza i wyłącza", () => {
    const on = cartReducer(empty, { type: "SET_CARRY_IN", on: true });
    expect(on.carryIn).toBe(true);
    expect(cartReducer(on, { type: "SET_CARRY_IN", on: false }).carryIn).toBe(false);
  });
  it("HYDRATE przenosi zapisany wybór", () => {
    const s = cartReducer(
      { ...empty, hydrated: false },
      { type: "HYDRATE", items: [fotel()], appliedPromo: null, carryIn: true }
    );
    expect(s).toMatchObject({ hydrated: true, carryIn: true });
    expect(s.items).toHaveLength(1);
  });
  it("CLEAR (po złożeniu zamówienia) odznacza wniesienie", () => {
    const s = cartReducer(
      { ...empty, items: [fotel()], carryIn: true },
      { type: "CLEAR" }
    );
    expect(s.carryIn).toBe(false);
    expect(s.items).toEqual([]);
  });
  it("CLEAR na pustym koszyku z zaznaczonym wniesieniem też odznacza", () => {
    expect(cartReducer({ ...empty, carryIn: true }, { type: "CLEAR" }).carryIn).toBe(false);
  });
});

describe("migrateLegacyCarryIn — koszyki z wersji „za sztukę”", () => {
  it("zdejmuje klucz, cena −250, flaga carryIn", () => {
    const out = migrateLegacyCarryIn([
      fotel({ price: 1250, variantValues: { Tkanina: "Riviera 16", [OLD_KEY]: "Tak" } }),
    ]);
    expect(out.carryIn).toBe(true);
    expect(out.items).toEqual([fotel({ price: 1000, variantValues: { Tkanina: "Riviera 16" } })]);
  });
  it("pusty słownik po zdjęciu klucza → variantValues undefined", () => {
    const out = migrateLegacyCarryIn([fotel({ price: 1250, variantValues: { [OLD_KEY]: "Tak" } })]);
    expect(out.items[0].variantValues).toBeUndefined();
    expect(out.items[0].price).toBe(1000);
  });
  it("koszyk bez klucza zostaje bez zmian, carryIn false", () => {
    const items = [fotel({ variantValues: { Tkanina: "Riviera 16" } }), fotel({ id: "p2" })];
    const out = migrateLegacyCarryIn(items);
    expect(out.carryIn).toBe(false);
    expect(out.items).toEqual(items);
  });
  it("klucz z wartością inną niż „Tak”: znika, cena bez zmian, carryIn false", () => {
    const out = migrateLegacyCarryIn([fotel({ variantValues: { [OLD_KEY]: "Nie" } })]);
    expect(out.carryIn).toBe(false);
    expect(out.items).toEqual([fotel()]);
  });
  it("ten sam mebel z wniesieniem i bez → jedna pozycja z sumą ilości", () => {
    const out = migrateLegacyCarryIn([
      fotel({ quantity: 1, variantValues: { Tkanina: "Riviera 16" } }),
      fotel({ quantity: 2, price: 1250, variantValues: { Tkanina: "Riviera 16", [OLD_KEY]: "Tak" } }),
    ]);
    expect(out.carryIn).toBe(true);
    expect(out.items).toEqual([fotel({ quantity: 3, variantValues: { Tkanina: "Riviera 16" } })]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/cart-carry-in.test.ts`
Expected: FAIL — `migrateLegacyCarryIn` nie jest eksportowane / `carryIn` undefined.

- [ ] **Step 3: Implement in `CartContext.tsx`**

a) import: `import { CARRY_IN_PRICE, LEGACY_ITEM_CARRY_IN_KEY } from "@/app/_lib/carry-in";`
b) `CartState` (eksportowany typ, ok. l. 49) — dodaj pole:
```ts
  // Wniesienie mebli raz na zamówienie (spec, aktualizacja 2026-10-06) —
  // wybór z checkoutu; pamiętany do złożenia zamówienia (CLEAR zeruje).
  carryIn: boolean;
```
c) `CartAction`: zmień wariant `HYDRATE` na `{ type: "HYDRATE"; items: CartItem[]; appliedPromo: AppliedPromo | null; carryIn: boolean }` i dodaj `| { type: "SET_CARRY_IN"; on: boolean }`.
d) reducer:
```ts
    case "CLEAR":
      // Czyści też promo i wniesienie — po złożeniu zamówienia nic z niego
      // nie przechodzi na następne (wcześniej promo czyścił osobny
      // setAppliedPromo(null) w callbacku clear()).
      return state.items.length === 0 && state.appliedPromo === null && !state.carryIn
        ? state
        : { ...state, items: [], appliedPromo: null, carryIn: false };
    case "HYDRATE":
      return {
        items: action.items,
        appliedPromo: action.appliedPromo,
        carryIn: action.carryIn,
        hydrated: true,
      };
    case "SET_CARRY_IN":
      return state.carryIn === action.on ? state : { ...state, carryIn: action.on };
```
(pozostałe przypadki bez zmian).
e) pod definicją `itemKey`/`clampQty` (znajdź je w pliku) dodaj eksportowaną funkcję:
```ts
// Koszyki z wersji „za sztukę" (PR #185, kilka godzin na produkcji): klucz
// wniesienia znika z pozycji, cena wraca do ceny mebla, a carryIn mówi, czy
// klient gdziekolwiek je zaznaczył (checkout startuje wtedy z zaznaczonym
// polem). Pozycje, które po zdjęciu klucza są identyczne (ten sam mebel
// z wniesieniem i bez), scalamy — inaczej koszyk miałby dwa wiersze pod
// jednym kluczem.
export function migrateLegacyCarryIn(items: CartItem[]): { items: CartItem[]; carryIn: boolean } {
  let carryIn = false;
  const out: CartItem[] = [];
  for (const item of items) {
    let next = item;
    const vv = item.variantValues;
    if (vv && LEGACY_ITEM_CARRY_IN_KEY in vv) {
      const had = vv[LEGACY_ITEM_CARRY_IN_KEY] === "Tak";
      if (had) carryIn = true;
      const rest = { ...vv };
      delete rest[LEGACY_ITEM_CARRY_IN_KEY];
      next = {
        ...item,
        price: had ? item.price - CARRY_IN_PRICE : item.price,
        variantValues: Object.keys(rest).length > 0 ? rest : undefined,
      };
    }
    const key = itemKey(next.id, next.variantValues, next.bundle?.unitKey);
    const existing = out.find((i) => itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key);
    if (existing) existing.quantity = clampQty(existing.quantity + next.quantity);
    // Zawsze kopia — scalanie zmienia `quantity` obiektu w `out`, a wejście
    // (stan z localStorage) ma zostać nietknięte.
    else out.push({ ...next });
  }
  return { items: out, carryIn };
}
```
f) `useReducer` — stan początkowy z `carryIn: false`.
g) stała: `const LS_CARRY_IN = "mollien-cart-carry-in";` obok `LS_PROMO`.
h) efekt hydratacji: po wczytaniu `items` (wewnątrz `try`) i promo:
```ts
    let carryIn = false;
    …
      const migrated = migrateLegacyCarryIn(items);
      items = migrated.items;
      carryIn = migrated.carryIn || localStorage.getItem(LS_CARRY_IN) === "1";
    …
    dispatch({ type: "HYDRATE", items, appliedPromo: promo, carryIn });
```
(migracja zmienia `items` w stanie; zmigrowane pozycje zapisze istniejący efekt „Persist items").
i) nowy efekt persist:
```ts
  // Persist wniesienia
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (state.carryIn) localStorage.setItem(LS_CARRY_IN, "1");
      else localStorage.removeItem(LS_CARRY_IN);
    } catch {}
  }, [state.carryIn, hydrated]);
```
j) `clear()`: w `try` dopisz `localStorage.removeItem(LS_CARRY_IN);`.
k) `CartContextValue` — dodaj `carryIn: boolean;` i `setCarryIn: (on: boolean) => void;`; zdefiniuj
```ts
  const setCarryIn = useCallback((on: boolean) => dispatch({ type: "SET_CARRY_IN", on }), []);
```
i dodaj `carryIn: state.carryIn, setCarryIn,` do zwracanego obiektu oraz `state.carryIn, setCarryIn` do tablicy zależności `useMemo`.
l) w `app/_lib/__tests__/cart-reducer.test.ts` i `app/_lib/__tests__/carry-in.test.ts` literał `const empty: CartState = { items: [], appliedPromo: null, hydrated: true };` → dopisz `carryIn: false`. Jeśli w testach są inne akcje `HYDRATE`, dopisz im `carryIn: false`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/_lib/__tests__/cart-carry-in.test.ts app/_lib/__tests__/cart-reducer.test.ts app/_lib/__tests__/carry-in.test.ts` → Expected: PASS.
Run: `npx tsc --noEmit` → Expected: brak błędów. Run: `npx eslint app/_context/CartContext.tsx` → brak błędów. Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_context/CartContext.tsx app/_lib/__tests__/cart-carry-in.test.ts app/_lib/__tests__/cart-reducer.test.ts app/_lib/__tests__/carry-in.test.ts
git commit -m "feat(wniesienie): koszyk pamięta wybór wniesienia, migracja koszyków „za sztukę”" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pole znika ze strony produktu i zestawu; „Zamów ponownie" i zakup pomijają wiersz

**Files:**
- Restore z `f8ffc52` (stan sprzed PR #185 — te pliki zmieniał wyłącznie PR #185): `app/_components/ui/ProductActions.tsx`, `app/_components/ui/BundleConfigurator.tsx`, `app/_lib/bundles.ts`, `app/koszyk/page.tsx`, `app/_lib/__tests__/bundles.test.ts`
- Delete: `app/_components/ui/CarryInOption.tsx`
- Modify: `app/_components/ui/ReorderButton.tsx`, `app/checkout/success/page.tsx`, `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts`

**Interfaces:**
- Consumes: `isCarryInLine` (Task 1).
- Produces: brak `CarryInOption`, brak `t.product.carryInLabel`; `groupCartBundles` znów bez `discountBase` (rabat od `price × qty`).

- [ ] **Step 1: Sprawdź, że przywracane pliki zmieniał tylko PR #185**

Run: `for f in app/_components/ui/ProductActions.tsx app/_components/ui/BundleConfigurator.tsx app/_lib/bundles.ts app/koszyk/page.tsx app/_lib/__tests__/bundles.test.ts; do echo "$f: $(git log --format=%h f8ffc52..HEAD -- $f | tr '\n' ' ')"; done`
Expected: każdy plik wyłącznie z commitami `78c8ca1` albo `b86fc69`. Jeśli pojawi się inny commit — STOP, zgłoś NEEDS_CONTEXT.

- [ ] **Step 2: Przywróć i usuń**

```bash
git checkout f8ffc52 -- app/_components/ui/ProductActions.tsx app/_components/ui/BundleConfigurator.tsx app/_lib/bundles.ts app/koszyk/page.tsx app/_lib/__tests__/bundles.test.ts
git rm app/_components/ui/CarryInOption.tsx
```

- [ ] **Step 3: Słowniki**

Usuń `carryInLabel` z typu `product` w `app/_lib/dictionaries/pl.ts` (linia `carryInLabel: string;`) i z wartości w `pl.ts` (`carryInLabel: "Wniesienie mebli (do 4. piętra)",`) oraz `de.ts` (`carryInLabel: "Hineintragen der Möbel (bis zur 4. Etage)",`).

- [ ] **Step 4: `ReorderButton`**

W `app/_components/ui/ReorderButton.tsx`:
- import `import { carryInSurcharge } from "@/app/_lib/carry-in";` zamień na `import { isCarryInLine } from "@/app/_lib/carry-in";`;
- sygnaturę `export default function ReorderButton({ items }: { items: OrderItem[] }) {` zamień na:
```tsx
export default function ReorderButton({ items: orderItems }: { items: OrderItem[] }) {
  // Wniesienie to usługa zamówienia, nie mebel: „Zamów ponownie" go nie
  // przenosi i nie liczy jako niedostępnej pozycji — klient zaznacza je
  // ponownie w checkoucie (spec, aktualizacja 2026-10-06).
  const items = orderItems.filter((i) => !isCarryInLine(i));
```
- cenę w `add({ … })`:
```tsx
        // Koszyk ma pokazać tyle, ile policzy checkout: dopłaty wariantów
        // i cena promocyjna.
        price: getVariantEffectivePrice(item.product, item.variant_values ?? {}),
```

- [ ] **Step 5: Zdarzenie zakupu**

W `app/checkout/success/page.tsx` dodaj import `import { isCarryInLine } from "@/app/_lib/carry-in";` i zmień budowę listy:
```tsx
        // Wiersz wniesienia (pozycja spoza katalogu) nie jest produktem —
        // bez niego na liście, ale `total` (wartość zakupu) go zawiera.
        const lines = (order.items ?? [])
          .filter((item) => !isCarryInLine(item))
          .map((item) => ({
            productId: item.product_id ?? "",
            name: item.product?.name ?? "",
            quantity: item.quantity,
            price: Number(item.price),
          }));
```

- [ ] **Step 6: Verify**

Run: `git grep -n "CarryInOption\|carryInLabel\|carryInSurcharge\|hasCarryIn\|setCarryIn\|discountableSubtotal\|discountBase" -- app e2e`
Expected: trafienia WYŁĄCZNIE w `app/_lib/carry-in.ts`, `app/_lib/__tests__/carry-in.test.ts` i `e2e/wniesienie.spec.ts` (te usuwa Task 5/6).
Run: `npx tsc --noEmit` → brak błędów (stare eksporty `carry-in.ts` zostają do Task 6, więc `e2e/wniesienie.spec.ts` nadal się kompiluje). Run: `npx eslint app/_components/ui/ReorderButton.tsx app/checkout/success/page.tsx` → brak błędów. Run: `npm test` → PASS.
Run: `git diff --stat HEAD` przed commitem — przywrócone pliki nie mogą mieć całoplikowych zmian.

- [ ] **Step 7: Commit**

```bash
git add -A app/_components/ui app/_lib/bundles.ts app/koszyk/page.tsx app/_lib/__tests__/bundles.test.ts app/checkout/success/page.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(wniesienie): pole znika ze strony produktu i zestawu; zakup i „Zamów ponownie” pomijają wiersz" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sekcja „Wniesienie mebli" w checkoucie + e2e

**Files:**
- Modify: `app/checkout/CheckoutForm.tsx`
- Rewrite: `e2e/wniesienie.spec.ts`

**Interfaces:**
- Consumes: `useCart().carryIn` / `setCarryIn` (Task 3), `CARRY_IN_PRICE` (Task 1), serwer czyta `carryIn` (Task 2).

- [ ] **Step 1: Write the failing e2e**

Zastąp całą zawartość `e2e/wniesienie.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { CARRY_IN_PRICE } from "../app/_lib/carry-in";

// Wniesienie mebli raz na zamówienie (spec, aktualizacja 2026-10-06): pole
// w checkoucie między „Adres dostawy" a „Metoda płatności", przy produkcie
// go nie ma. Zamówienia NIE składamy — baza jest wspólna z produkcją.

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

async function openPlainProduct(page: Page) {
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
}

const money = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));

test("przy produkcie nie ma już pola wniesienia", async ({ page }) => {
  await openPlainProduct(page);
  await expect(page.getByRole("button", { name: "Kup teraz" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /wniesieni/i })).toHaveCount(0);
});

test("checkout: sekcja między adresem a płatnością, +250 zł raz, wybór przeżywa odświeżenie", async ({
  page,
}) => {
  await openPlainProduct(page);
  await page.getByRole("button", { name: "Dodaj do koszyka", exact: true }).first().click();
  await page.goto("/checkout");

  const address = page.getByRole("heading", { name: "Adres dostawy", exact: true });
  const carry = page.getByRole("heading", { name: "Wniesienie mebli", exact: true });
  const payment = page.getByRole("heading", { name: "Metoda płatności", exact: true });
  const [ya, yc, yp] = await Promise.all(
    [address, carry, payment].map(async (h) => (await h.boundingBox())!.y)
  );
  expect(ya).toBeLessThan(yc);
  expect(yc).toBeLessThan(yp);

  const checkbox = page.getByRole("checkbox", { name: /Dostawa z wniesieniem do 4\. piętra/ });
  await expect(checkbox).not.toBeChecked();
  const total = page.getByTestId("checkout-total");
  const before = money(await total.innerText());

  await checkbox.check();
  await expect.poll(async () => money(await total.innerText())).toBe(before + CARRY_IN_PRICE);
  await expect(page.getByText("Wniesienie mebli", { exact: true }).last()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Dostawa z wniesieniem do 4\. piętra/ })).toBeChecked();
  await expect.poll(async () => money(await page.getByTestId("checkout-total").innerText())).toBe(
    before + CARRY_IN_PRICE
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (produkcja, tylko odczyt + koszyk w localStorage): `npx playwright test e2e/wniesienie.spec.ts --project=chromium`
Expected: FAIL — pierwszy test znajduje pole wniesienia przy produkcie (prod ma wersję „za sztukę"), drugi nie znajduje nagłówka „Wniesienie mebli".

- [ ] **Step 3: Implement in `CheckoutForm.tsx`**

a) import `import { CARRY_IN_PRICE } from "@/app/_lib/carry-in";`.
b) z `useCart()` pobierz dodatkowo `carryIn, setCarryIn` (dopisz do istniejącej destrukturyzacji).
c) teksty — w obiekcie DE (`? { … }`) i PL (`: { … }`) dopisz obok `paymentMethod`:
DE:
```ts
        carryInHeading: "Hineintragen der Möbel",
        carryInLabel: "Lieferung mit Hineintragen bis zur 4. Etage",
        carryInDesc: "Wir tragen die Möbel bis zur 4. Etage hinein, einmal pro Bestellung.",
        carryInLine: "Hineintragen der Möbel",
```
PL:
```ts
        carryInHeading: "Wniesienie mebli",
        carryInLabel: "Dostawa z wniesieniem do 4. piętra",
        carryInDesc: "Wniesiemy meble do 4. piętra. Opłata raz za całe zamówienie.",
        carryInLine: "Wniesienie mebli",
```
(bez cudzysłowów typograficznych w tych tekstach — celowo).
d) `grandTotal`:
```ts
  // Wniesienie raz na zamówienie, PO rabatach — serwer liczy tak samo
  // (applyCarryIn w /api/checkout).
  const carryInAmount = carryIn ? CARRY_IN_PRICE : 0;
  const grandTotal = Math.max(0, total - bundleDiscount - discount) + carryInAmount;
```
e) payload `JSON.stringify({ … })` — po `paymentMethod,` dodaj `carryIn,`.
f) nowa sekcja między kartą adresu a kartą „Metoda płatności" (wstaw bezpośrednio przed `<div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">` zawierającym `{c.paymentMethod}`):
```tsx
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
          <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-6">
            {c.carryInHeading}
          </h2>
          <label
            className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
              carryIn
                ? "border-[var(--color-gold)] bg-[var(--bg)]"
                : "border-[var(--border)] hover:border-[var(--color-gold)]"
            }`}
          >
            <input
              type="checkbox"
              checked={carryIn}
              onChange={(e) => setCarryIn(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[var(--color-gold)] shrink-0"
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-semibold text-sm text-[var(--fg)]">{c.carryInLabel}</span>
              <span className="text-xs text-[var(--muted)]">{c.carryInDesc}</span>
            </span>
            <span className="shrink-0 font-semibold text-sm text-[var(--fg)]">
              +{formatMoney(CARRY_IN_PRICE, locale, rate)}
            </span>
          </label>
        </div>
```
g) podsumowanie — po bloku `{appliedPromo && discount > 0 && ( … )}` dodaj:
```tsx
            {carryIn && (
              <div className="flex justify-between text-[var(--muted)]">
                <span>{c.carryInLine}</span>
                <span>+{formatMoney(CARRY_IN_PRICE, locale, rate)}</span>
              </div>
            )}
```
h) kwota „Razem": w `<span>{formatMoney(grandTotal, locale, rate)}</span>` dodaj `data-testid="checkout-total"` do tego `<span>`.

- [ ] **Step 4: Build lokalny + e2e zielony**

Porty 3000/3100 wolne (`netstat -ano | grep -E ":(3000|3100) .*LISTENING"`). Run: `npx tsc --noEmit && npm test` → PASS. Run: `npm run build` → sukces. W tle: `PORT=3100 npm start`. Run: `E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/wniesienie.spec.ts e2e/kup-teraz.spec.ts --project=chromium` → PASS (setup + 2 + 2). Zrzut sekcji wniesienia i podsumowania na `/checkout` (jasny i ciemny motyw przez `localStorage.theme`, zgoda cookies przez `mollien.cookie-consent`, koszyk z jednym produktem) do scratchpada — obejrzyj przed commitem. Zatrzymaj serwer i sprawdź, że port 3100 jest wolny (PID z `netstat`, `taskkill //PID <pid> //F`).

- [ ] **Step 5: Commit**

```bash
git add app/checkout/CheckoutForm.tsx e2e/wniesienie.spec.ts
git commit -m "feat(wniesienie): sekcja „Wniesienie mebli” w checkoucie, +250 zł raz na zamówienie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sprzątanie po wersji „za sztukę" + `/dostawa`

**Files:**
- Modify: `app/_lib/carry-in.ts`, `app/_lib/__tests__/carry-in.test.ts`, `app/_lib/de-content-maps.ts`, `app/(legal)/dostawa/page.tsx`

**Interfaces:**
- Produces: `carry-in.ts` eksportuje wyłącznie `CARRY_IN_PRICE`, `CARRY_IN_LINE_NAME`, `LEGACY_ITEM_CARRY_IN_KEY`, `CarryInOrderLine`, `carryInOrderLine`, `isCarryInLine`, `applyCarryIn`.

- [ ] **Step 1: `carry-in.ts`**

Usuń `CARRY_IN_KEY`, `CARRY_IN_VALUE`, `hasCarryIn`, `carryInSurcharge`, `setCarryIn`, `discountableSubtotal` i ich komentarze. Komentarz nagłówka pliku zastąp:
```ts
// Wniesienie mebli (spec 2026-10-06, aktualizacja: raz na zamówienie).
// Czysta logika bez Reacta i Supabase — używa jej serwer (/api/checkout),
// koszyk (CartContext — migracja), checkout, „Zamów ponownie" i analityka.
```
`CARRY_IN_PRICE` zostaje (`export const CARRY_IN_PRICE = 250;`) nad sekcją „raz na zamówienie".

- [ ] **Step 2: testy i mapa DE**

- `carry-in.test.ts`: usuń `describe` „carryInSurcharge / hasCarryIn", „setCarryIn", „discountableSubtotal", „etykieta w koszyku, zamówieniu i mailach", „koszyk" oraz nieużywane już importy (`formatVariantLabel`, `cartReducer`, `CartState`, stare nazwy). Zostają testy z Task 1; dopisz jedną asercję `expect(CARRY_IN_PRICE).toBe(250);` w pierwszym z nich (import `CARRY_IN_PRICE`).
- `de-content-maps.ts`: usuń z `VARIANT_OPTION_DE` dwulinijkowy komentarz „Klucz wniesienia — MUSI być identyczny…" i wpis `"Wniesienie mebli do 4. piętra": "Hineintragen bis zur 4. Etage",`. `Tak: "Ja"` w `VARIANT_VALUE_DE` ZOSTAJE.

- [ ] **Step 3: `/dostawa`**

W `app/(legal)/dostawa/page.tsx` zastąp całe wartości `carry` (bez cudzysłowów typograficznych — celowo):
PL:
```ts
        carry: `Standardowa dostawa obejmuje transport pod pierwsze drzwi budynku. Wniesienie mebli do 4. piętra możesz zamówić w podsumowaniu zamówienia: ${CARRY_IN_PRICE} zł za całe zamówienie.`,
```
DE:
```ts
        carry:
          "Die Standardlieferung umfasst den Transport bis zur ersten Tür des Gebäudes. Das Hineintragen der Möbel bis zur 4. Etage können Sie in der Bestellübersicht hinzubuchen, einmal pro Bestellung.",
```

- [ ] **Step 4: Verify**

Run: `git grep -n "CARRY_IN_KEY\|CARRY_IN_VALUE\|hasCarryIn\|carryInSurcharge\|setCarryIn\|discountableSubtotal\|CarryInOption\|carryInLabel" -- app e2e` → Expected: brak trafień (poza `carryInLabel` w `CheckoutForm.tsx` — to nowy tekst checkoutu, OK).
Run: `npx tsc --noEmit`, `npx eslint app/_lib/carry-in.ts "app/(legal)/dostawa/page.tsx" app/_lib/de-content-maps.ts`, `npm test` → PASS.
Run: `git diff --stat` — `dostawa/page.tsx` 2 linie zmienione, bez całoplikowej zmiany; `head -c 3 "app/(legal)/dostawa/page.tsx" | od -An -tx1` ≠ `ef bb bf`.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/carry-in.ts app/_lib/__tests__/carry-in.test.ts app/_lib/de-content-maps.ts "app/(legal)/dostawa/page.tsx"
git commit -m "refactor(wniesienie): koniec wersji „za sztukę”; /dostawa — wniesienie w podsumowaniu zamówienia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Integracja

- [ ] **Step 1:** Recenzja całej gałęzi (`git diff origin/main..feat/wniesienie-checkout`) pod kątem Review Focus.
- [ ] **Step 2:** Decyzja właściciela o integracji; push/PR/merge z Woodecky10 wg pamięci `push-auth-woodecky10`; przed mergem `git fetch origin <branch>` + `git log --oneline FETCH_HEAD..<branch>` puste.
- [ ] **Step 3:** Po statusie Vercela „success": `npx playwright test e2e/wniesienie.spec.ts e2e/kup-teraz.spec.ts --project=chromium` na produkcji — wszystkie „passed".

---

## STAN WYKONANIA

(uzupełniane w trakcie — jedyny trwały nośnik stanu, `.superpowers/sdd/` jest gitignorowany)

- [x] Task 1 — commity 57a0805..785292c, recenzja czysta
- [x] Task 2 — 785292c..28d036c; runda poprawek 1/5 (komentarz pętli w route.ts, scalenie bloków komentarzy)
- [x] Task 3 — 28d036c..dab90bd
- [x] Task 4 — dab90bd..bf33df7
- [x] Task 5 — bf33df7..2e494b8
- [x] Task 6 — 2e494b8..a0f7060
- [ ] Task 7 — krok 1 (recenzja całej gałęzi) WYKONANY, wynik „With fixes"; poprawki tej fali: normalizator wierszy `order_items`, sprzątanie osieroconego zamówienia, klucz „za sztukę” ze starej karty checkoutu, ten zapis. Kroki 2–3 OTWARTE.

**Rozstrzygnięcia (z dziennika wykonania):**

- Wzorce grep w planie (Task 4 krok 6, Task 6 krok 4) zawierają `setCarryIn`, który jest też prawowitym setterem koszyka (CartContext, używany przez CheckoutForm) — trafienia w tych plikach są oczekiwane i NIE wolno ich usuwać.
- Task 5: bramkowanie przekierowania pustego koszyka flagą `hydrated` w CheckoutForm zaakceptowane — bez tego odświeżenie `/checkout` odsyłało do `/koszyk` przed odczytem localStorage, a wybór wniesienia ma przetrwać powrót (spec, rozstrzygnięcie E). Był to błąd istniejący na produkcji.
- Fala końcowa po recenzji: (1) czysty normalizator wierszy dla `createOrder` i zamówień zewnętrznych, (2) usuwanie osieroconego zamówienia przy błędzie pozycji, (3) stary klucz „za sztukę” w `items` liczy się jako zgoda na wniesienie (nigdy więcej niż klient widział), (4) ten zapis. Scalanie notatek przy migracji koszyka zostaje odroczone.

**Przyczyna poprawki krytycznej:** postgrest-js przy insercie tablicy ustawia `?columns=` na sumę kluczy wszystkich wierszy i brakujące wysyła jako NULL (`defaultToNull`), więc DEFAULT kolumny nie działa; `custom_name` jest NOT NULL (migracja 82), a pozycje z katalogu nie miały tego klucza. Produkcja nie miała dotąd żadnego zamówienia z pozycją bez produktu, więc nic nie mogło tego obalić — traktowane jako potwierdzone.

**Otwarte:**

- [ ] Task 7 krok 2: decyzja właściciela o integracji (push/PR/merge z Woodecky10).
- [ ] Task 7 krok 3: po statusie Vercela „success" e2e na produkcji — muszą zgłosić „passed".
- [ ] NOWE: jedno żywe zamówienie próbne za pobraniem (COD) z wniesieniem, na jednorazowy adres e-mail, po wdrożeniu; sprawdzić w panelu admina i usunąć. Tylko za potwierdzeniem właściciela — żaden automatyczny test nie składa zamówienia, więc ścieżka zapisu pozycji nie była sprawdzona na żywo.

**Odroczone (follow-upy):**

- Migracja koszyka scala duplikaty i gubi `notes` drugiego wiersza (zostaje pierwszego); brak testu scalania pozycji zestawu, limit 99 z `clampQty`.
- Brak testu trasy dla ścieżki pieniężnej `carryIn: true` (projekt nie ma testów tras); e2e: `boundingBox()!` i `.last()` zależne od kolejności DOM; teksty DE nietestowane (`/de` zamrożone).
- Token MCP Supabase zwraca 401 — odnowić.
