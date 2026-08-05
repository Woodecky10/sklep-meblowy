# Promocje — wstążka na zdjęciu i terminy okien — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na zdjęciu produktu pojawia się ukośna wstążka „Promocja” — automatycznie z ceny promocyjnej albo z ręcznie wpisanego napisu — a promocje można zaplanować na okno od–do, które włącza się i gaśnie samo, bez naruszania zgodności z Omnibusem.

**Architecture:** `products.sale_price` zostaje „ceną obowiązującą teraz” i pisze ją **wyłącznie** reconciler (`applySaleSchedule`); panel zapisuje cenę planowaną plus okno do nowych kolumn. Dzięki temu żadne miejsce czytające cenę nie wymaga zmiany, a wiersz `price_history` i `omnibus_price` powstają w chwili faktycznego przełączenia ceny przez istniejące RPC `apply_price_changes`. Reconciler odpala się po każdym zapisie produktu i raz na dobę z crona Vercela.

**Tech Stack:** Next.js (wersja w tym repo ma własne konwencje — patrz `AGENTS.md`), TypeScript, Supabase (Postgres + RLS), Tailwind ze zmiennymi CSS motywu, vitest (unit), Playwright (e2e), Vercel Cron.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-05-promocje-wstazka-design.md` — jest źródłem prawdy dla decyzji; ten plan jej nie zmienia.
- **Gałąź:** `feat/promocje-wstazka` (już istnieje, spec na niej zacommitowany).
- **`AGENTS.md`:** „This is NOT the Next.js you know” — przed pisaniem kodu Next.js przeczytaj odpowiedni przewodnik w `node_modules/next/dist/docs/`. Dotyczy zwłaszcza route handlera crona (Task 7).
- **Język kodu i UI:** komentarze, komunikaty walidacji i teksty panelu po polsku, bez wyjątków. Komentarz tłumaczy DLACZEGO, nie CO.
- **Testy:** `npm test` (vitest run) z katalogu `sklep-meblowy/`. Testy jednostkowe w `app/_lib/__tests__/`, import przez alias `@/app/...`.
- **Nazwy kolumn:** `sale_price_planned`, `sale_from`, `sale_to`, `promo_badge` — dokładnie tak, bez skrótów i wariacji.
- **`promo_badge` maks. 16 znaków** — geometria wstążki.
- **Granice okna włącznie:** `sale_from <= today <= sale_to`.
- **Daty to dni w strefie Europe/Warsaw**, typ kolumny `date`, format string `YYYY-MM-DD`.
- **`today` wstrzykiwane parametrem** do każdej czystej funkcji — nigdy `new Date()` wewnątrz logiki (deterministyczne testy, wzorem `now` w `computePriceUpdates`).
- **Cena promocyjna musi być ŚCIŚLE niższa** od regularnej — spójnie z istniejącym `isOnSale`.
- **Baza połączona przez MCP to PRODUKCJA.** Migracje w tym projekcie **nie aplikują się same** — trzeba je puścić ręcznie przez `apply_migration` i potwierdzić `list_tables`.
- **Nie ruszamy** `pricing.ts:computeOmnibus`, `computePriceUpdates`, `price-history.ts` ani RPC `apply_price_changes` — cała logika Omnibusa zostaje bez zmian.

## Struktura plików

**Nowe:**

| plik | odpowiedzialność |
|---|---|
| `supabase/migrations/69_sale_schedule.sql` | cztery kolumny na `products` |
| `app/_lib/sale-schedule.ts` | czysta logika okien (`planSaleActivation`, `saleStatus`, `promoChipLabel`, `warsawToday`) + warstwa IO (`applySaleSchedule`) |
| `app/_lib/__tests__/sale-schedule.test.ts` | testy czystej logiki |
| `app/_components/ui/PromoRibbon.tsx` | sama wstążka, bez danych i bez `"use client"` |
| `app/api/cron/promocje/route.ts` | endpoint crona, autoryzacja `CRON_SECRET` |

**Zmieniane:**

| plik | zmiana |
|---|---|
| `app/_lib/types.ts` | cztery nowe pola w `Product` |
| `app/_lib/pricing.ts` | `ribbonText`, `looksLikeDiscountClaim` |
| `app/_lib/__tests__/pricing.test.ts` | testy obu nowych funkcji |
| `app/_lib/new-product.ts` | duplikat nie dziedziczy promocji |
| `app/_lib/__tests__/new-product.test.ts` | test duplikatu |
| `app/_components/ui/ProductCard.tsx` | wstążka na kaflu (obsługuje 8 miejsc) |
| `app/_components/ui/ImageGallery.tsx` | nowy prop `ribbon` |
| `app/_components/ui/ProductMainSection.tsx` | liczy tekst wstążki i podaje go galerii |
| `app/admin/produkty/[id]/ProductEditor.tsx` | blok „Promocja”, linijka stanu, ostrzeżenie |
| `app/admin/produkty/actions.ts` | walidacja + zapis nowych kolumn + wywołanie reconcilera |
| `app/admin/produkty/page.tsx` | projekcja z polami promocji |
| `app/admin/produkty/ProductsList.tsx` | chip stanu promocji |
| `vercel.json` | wpis crona |

---

### Task 1: Migracja 69 i typ `Product`

**Files:**
- Create: `sklep-meblowy/supabase/migrations/69_sale_schedule.sql`
- Modify: `sklep-meblowy/app/_lib/types.ts:136-137`

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces: kolumny `sale_price_planned numeric(10,2) | null`, `sale_from date | null`, `sale_to date | null`, `promo_badge text | null` na `public.products` oraz te same cztery pola w typie `Product`. Wszystkie kolejne taski na nich stoją.

- [ ] **Step 1: Napisz migrację**

Plik `sklep-meblowy/supabase/migrations/69_sale_schedule.sql` — styl 1:1 z `36_omnibus_pricing.sql` (`add column if not exists`, `check`, komentarz nagłówkowy tłumaczący po co):

```sql
-- Migracja 69: terminy promocji + ręczny napis na wstążce.
-- Podział odpowiedzialności za cenę:
--   sale_price          — cena OBOWIĄZUJĄCA TERAZ; pisze ją WYŁĄCZNIE reconciler
--                         (app/_lib/sale-schedule.ts). Formularz produktu jej nie dotyka.
--   sale_price_planned  — cena promocyjna wpisana w panelu (plan, nie stan).
--   sale_from/sale_to   — okno w dniach Europe/Warsaw, granice WŁĄCZNIE.
--                         Puste sale_from = od razu, puste sale_to = bez końca.
--   promo_badge         — ręczne nadpisanie napisu na wstążce; niezależne od ceny
--                         (patrz ostrzeżenie o Omnibusie w panelu).
alter table public.products
  add column if not exists sale_price_planned numeric(10,2) check (sale_price_planned >= 0),
  add column if not exists sale_from          date,
  add column if not exists sale_to            date,
  add column if not exists promo_badge        text;

-- Częściowy indeks pod zapytanie reconcilera: bierze tylko wiersze, które mogą
-- wymagać przełączenia, a nie całą tabelę.
create index if not exists idx_products_sale_schedule
  on public.products (sale_from, sale_to)
  where sale_price_planned is not null or sale_price is not null;
```

- [ ] **Step 2: Zaaplikuj migrację przez MCP i potwierdź**

Auto-apply w tym projekcie nie działa. Wywołaj `mcp__supabase__apply_migration` z nazwą `69_sale_schedule` i treścią pliku, potem `mcp__supabase__list_tables` i sprawdź, że `products` ma cztery nowe kolumny.

Oczekiwane: cztery kolumny obecne, wszystkie `nullable`. **To jest produkcja** — migracja jest wyłącznie addytywna (nowe kolumny nullable + indeks), nie rusza danych ani istniejących kolumn.

- [ ] **Step 3: Dopisz pola do typu `Product`**

W `app/_lib/types.ts`, bezpośrednio pod istniejącymi `sale_price` / `omnibus_price` (linie 136-137):

```ts
  // Harmonogram promocji (migracja 69). sale_price wyżej = cena OBOWIĄZUJĄCA
  // TERAZ (pisze ją wyłącznie reconciler z sale-schedule.ts); poniżej jest PLAN,
  // który reconciler wprowadza w życie. Daty to dni Europe/Warsaw, granice włącznie.
  sale_price_planned: number | null;
  sale_from: string | null;
  sale_to: string | null;
  // Ręczne nadpisanie napisu na wstążce (maks. 16 znaków). Niezależne od ceny —
  // wstążka pokaże się także bez obniżki (panel ostrzega wtedy o Omnibusie).
  promo_badge: string | null;
```

- [ ] **Step 4: Sprawdź, że nic się nie rozjechało typowo**

Run: `cd sklep-meblowy; npx tsc --noEmit`
Oczekiwane: brak błędów. Dodanie pól do `Product` może wywalić miejsca konstruujące `Product` z literału obiektowego — jeśli tsc wskaże takie miejsce, dopisz tam cztery pola jako `null`. Nie zmieniaj przy tym żadnej logiki.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/supabase/migrations/69_sale_schedule.sql sklep-meblowy/app/_lib/types.ts
git commit -m "feat(promocje): migracja 69 - kolumny harmonogramu promocji i napisu wstazki"
```

---

### Task 2: Czysta logika okien (`sale-schedule.ts`)

**Files:**
- Create: `sklep-meblowy/app/_lib/sale-schedule.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/sale-schedule.test.ts`

**Interfaces:**
- Consumes: kolumny z Task 1.
- Produces:
  - `type SaleScheduleRow = { id: string; price: number; sale_price: number | null; sale_price_planned: number | null; sale_from: string | null; sale_to: string | null; promo_badge: string | null }`
  - `planSaleActivation(rows: SaleScheduleRow[], today: string): { id: string; sale_price: number | null }[]`
  - `type SaleStatus = { kind: "none" } | { kind: "active"; until: string | null } | { kind: "scheduled"; from: string } | { kind: "ended"; on: string } | { kind: "badgeOnly" }`
  - `saleStatus(row: SaleScheduleRow, today: string): SaleStatus`
  - `promoChipLabel(row: SaleScheduleRow, today: string): "Promocja" | "Zaplanowana" | "Wstążka" | null`
  - `warsawToday(now?: Date): string`

- [ ] **Step 1: Napisz testy (najpierw czerwone)**

Plik `sklep-meblowy/app/_lib/__tests__/sale-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  planSaleActivation,
  saleStatus,
  promoChipLabel,
  warsawToday,
  type SaleScheduleRow,
} from "@/app/_lib/sale-schedule";

// Bazowy wiersz — testy nadpisują tylko to, co badają.
function row(over: Partial<SaleScheduleRow> = {}): SaleScheduleRow {
  return {
    id: "p1",
    price: 1000,
    sale_price: null,
    sale_price_planned: null,
    sale_from: null,
    sale_to: null,
    promo_badge: null,
    ...over,
  };
}

describe("planSaleActivation", () => {
  it("okno otwarte, cena jeszcze nieaktywna → włącza", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-01", sale_to: "2026-08-31" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("brak dat → promocja natychmiastowa", () => {
    const rows = [row({ sale_price_planned: 800 })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("granice okna są WŁĄCZNIE — pierwszy i ostatni dzień aktywne", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-05", sale_to: "2026-08-05" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("dzień przed oknem → nie włącza", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-06" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([]);
  });

  it("dzień po oknie, cena była aktywna → gasi", () => {
    const rows = [row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-04" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: null }]);
  });

  it("cena planowana NIE niższa od regularnej → nie włącza (spójnie z isOnSale)", () => {
    expect(planSaleActivation([row({ sale_price_planned: 1000 })], "2026-08-05")).toEqual([]);
    expect(planSaleActivation([row({ sale_price_planned: 1200 })], "2026-08-05")).toEqual([]);
  });

  it("cena regularna zjechała poniżej promocyjnej → gasi promocję", () => {
    const rows = [row({ price: 700, sale_price: 800, sale_price_planned: 800 })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: null }]);
  });

  it("jest IDEMPOTENTNA — stan już zgodny zwraca pustą listę", () => {
    const active = [row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-31" })];
    expect(planSaleActivation(active, "2026-08-05")).toEqual([]);
    const off = [row()];
    expect(planSaleActivation(off, "2026-08-05")).toEqual([]);
  });

  it("promo_badge sam nie rusza ceny", () => {
    expect(planSaleActivation([row({ promo_badge: "Nowość" })], "2026-08-05")).toEqual([]);
  });
});

describe("saleStatus", () => {
  it("aktywna z końcem", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-31" }), "2026-08-05"))
      .toEqual({ kind: "active", until: "2026-08-31" });
  });
  it("aktywna bez końca", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800 }), "2026-08-05"))
      .toEqual({ kind: "active", until: null });
  });
  it("zaplanowana", () => {
    expect(saleStatus(row({ sale_price_planned: 800, sale_from: "2026-08-10" }), "2026-08-05"))
      .toEqual({ kind: "scheduled", from: "2026-08-10" });
  });
  it("zakończona", () => {
    expect(saleStatus(row({ sale_price_planned: 800, sale_to: "2026-08-04" }), "2026-08-05"))
      .toEqual({ kind: "ended", on: "2026-08-04" });
  });
  it("okno JUŻ otwarte, ale cena nieprzełączona → zaplanowana (sygnał, że cron nie wstał)", () => {
    expect(saleStatus(row({ sale_price_planned: 800, sale_from: "2026-08-01", sale_to: "2026-08-31" }), "2026-08-05"))
      .toEqual({ kind: "scheduled", from: "2026-08-01" });
  });
  it("promocja natychmiastowa jeszcze nieprzełączona → zaplanowana od dziś", () => {
    expect(saleStatus(row({ sale_price_planned: 800 }), "2026-08-05"))
      .toEqual({ kind: "scheduled", from: "2026-08-05" });
  });
  it("sam napis bez ceny", () => {
    expect(saleStatus(row({ promo_badge: "Nowość" }), "2026-08-05")).toEqual({ kind: "badgeOnly" });
  });
  it("nic", () => {
    expect(saleStatus(row(), "2026-08-05")).toEqual({ kind: "none" });
  });
  it("aktywna promocja wygrywa nad napisem", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800, promo_badge: "Hit" }), "2026-08-05").kind)
      .toBe("active");
  });
});

describe("promoChipLabel", () => {
  it("aktywna → Promocja", () => {
    expect(promoChipLabel(row({ sale_price: 800, sale_price_planned: 800 }), "2026-08-05")).toBe("Promocja");
  });
  it("zaplanowana → Zaplanowana", () => {
    expect(promoChipLabel(row({ sale_price_planned: 800, sale_from: "2026-08-10" }), "2026-08-05")).toBe("Zaplanowana");
  });
  it("zakończona promocja z wciąż wpisanym napisem → Wstążka (to jest wyciek, który chcemy widzieć)", () => {
    const r = row({ sale_price_planned: 800, sale_to: "2026-08-04", promo_badge: "Wyprzedaż" });
    expect(promoChipLabel(r, "2026-08-05")).toBe("Wstążka");
  });
  it("zakończona bez napisu → brak chipa", () => {
    expect(promoChipLabel(row({ sale_price_planned: 800, sale_to: "2026-08-04" }), "2026-08-05")).toBeNull();
  });
  it("czysty produkt → brak chipa", () => {
    expect(promoChipLabel(row(), "2026-08-05")).toBeNull();
  });
});

describe("warsawToday", () => {
  it("zwraca dzień w strefie Europe/Warsaw, nie UTC", () => {
    // 2026-08-05T23:30Z = już 2026-08-06 w Warszawie (CEST = UTC+2)
    expect(warsawToday(new Date("2026-08-05T23:30:00Z"))).toBe("2026-08-06");
    // 2026-01-05T23:30Z = już 2026-01-06 w Warszawie (CET = UTC+1)
    expect(warsawToday(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-06");
    expect(warsawToday(new Date("2026-08-05T10:00:00Z"))).toBe("2026-08-05");
  });
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `cd sklep-meblowy; npx vitest run app/_lib/__tests__/sale-schedule.test.ts`
Oczekiwane: FAIL, `Failed to resolve import "@/app/_lib/sale-schedule"`.

- [ ] **Step 3: Napisz czystą logikę**

Plik `sklep-meblowy/app/_lib/sale-schedule.ts` — **tylko czysta logika, bez importów serwerowych** (warstwa IO dochodzi w Task 4):

```ts
// Harmonogram promocji — czysta logika okien (testowalna bez Supabase).
// Podział odpowiedzialności za cenę: `sale_price` to cena OBOWIĄZUJĄCA TERAZ i
// pisze ją wyłącznie reconciler; `sale_price_planned` + okno to PLAN z panelu.
// Dzięki temu każde miejsce czytające cenę (isOnSale, feed, checkout, JSON-LD)
// zostaje bez zmian, a historia cen zapisuje się w chwili realnego przełączenia.
import { isOnSale } from "./pricing";

export type SaleScheduleRow = {
  id: string;
  price: number;
  sale_price: number | null;
  sale_price_planned: number | null;
  sale_from: string | null;
  sale_to: string | null;
  promo_badge: string | null;
};

// Daty to dni Europe/Warsaw w formacie YYYY-MM-DD — czyli dokładnie to, co
// trzyma kolumna `date`. Porównania stringowe są poprawne, bo format jest
// leksykograficznie zgodny z chronologią.
function withinWindow(from: string | null, to: string | null, today: string): boolean {
  if (from !== null && today < from) return false;
  if (to !== null && today > to) return false;
  return true;
}

// Cena, która POWINNA obowiązywać dziś. Warunek „ściśle niższa" jest ten sam co
// w isOnSale — inaczej dałoby się zaplanować „promocję" równą cenie regularnej.
function desiredSalePrice(row: SaleScheduleRow, today: string): number | null {
  const planned = row.sale_price_planned;
  if (planned === null) return null;
  if (!isOnSale(row.price, planned)) return null;
  if (!withinWindow(row.sale_from, row.sale_to, today)) return null;
  return planned;
}

// Zwraca WYŁĄCZNIE wiersze, w których stan faktyczny różni się od pożądanego →
// funkcja jest idempotentna, a wołający nie robi zapisów bez potrzeby.
export function planSaleActivation(
  rows: SaleScheduleRow[],
  today: string
): { id: string; sale_price: number | null }[] {
  const out: { id: string; sale_price: number | null }[] = [];
  for (const r of rows) {
    const desired = desiredSalePrice(r, today);
    if (desired !== r.sale_price) out.push({ id: r.id, sale_price: desired });
  }
  return out;
}

export type SaleStatus =
  | { kind: "none" }
  | { kind: "active"; until: string | null }
  | { kind: "scheduled"; from: string }
  | { kind: "ended"; on: string }
  | { kind: "badgeOnly" };

// Stan do pokazania człowiekowi. Kolejność sprawdzeń jest istotna: cena
// obowiązująca teraz bije plan, plan bije zakończenie, a sam napis to ostatnia
// możliwość. Bez tej linijki w panelu system wygląda na zepsuty, bo sale_price
// nie jest już edytowalne ręcznie.
export function saleStatus(row: SaleScheduleRow, today: string): SaleStatus {
  if (isOnSale(row.price, row.sale_price)) {
    return { kind: "active", until: row.sale_to };
  }
  if (row.sale_price_planned !== null && isOnSale(row.price, row.sale_price_planned)) {
    if (row.sale_to !== null && today > row.sale_to) {
      return { kind: "ended", on: row.sale_to };
    }
    // Plan jest aktualny, a cena jeszcze nie przełączona: albo okno się nie
    // otworzyło, albo otworzyło się i reconciler jeszcze nie przejechał (cron
    // chodzi raz na dobę). Dla człowieka oba przypadki to „zaplanowana" — i to
    // jest JEDYNY sygnał w panelu, że cron nie wstał, więc absolutnie nie może
    // wpadać w „brak promocji" (spec, tabela awarii: „panel mówi zaplanowana").
    return { kind: "scheduled", from: row.sale_from ?? today };
  }
  if (row.promo_badge) return { kind: "badgeOnly" };
  return { kind: "none" };
}

// Chip w liście produktów. „Wstążka" jest tu po to, żeby wyłapać wyciek:
// promocja z datami gaśnie sama, ale ręczny promo_badge nie ma terminu i wisi,
// dopóki ktoś go nie usunie.
export function promoChipLabel(
  row: SaleScheduleRow,
  today: string
): "Promocja" | "Zaplanowana" | "Wstążka" | null {
  const s = saleStatus(row, today);
  if (s.kind === "active") return "Promocja";
  if (s.kind === "scheduled") return "Zaplanowana";
  if (row.promo_badge) return "Wstążka";
  return null;
}

// Dzień w strefie sklepu. `sv-SE` daje YYYY-MM-DD, czyli format kolumny `date`.
// Zegar wstrzykiwany parametrem — testy muszą być deterministyczne.
export function warsawToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
}
```

- [ ] **Step 4: Uruchom testy — muszą przejść**

Run: `cd sklep-meblowy; npx vitest run app/_lib/__tests__/sale-schedule.test.ts`
Oczekiwane: PASS, wszystkie przypadki.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/sale-schedule.ts sklep-meblowy/app/_lib/__tests__/sale-schedule.test.ts
git commit -m "feat(promocje): czysta logika okien promocji + stan do panelu"
```

---

### Task 3: Reguła wstążki i detektor obietnicy obniżki (`pricing.ts`)

**Files:**
- Modify: `sklep-meblowy/app/_lib/pricing.ts` (dopisek na końcu pliku)
- Test: `sklep-meblowy/app/_lib/__tests__/pricing.test.ts` (dopisek na końcu pliku)

**Interfaces:**
- Consumes: istniejące `isOnSale` z tego samego pliku.
- Produces:
  - `ribbonText(p: { price: number; sale_price: number | null; promo_badge: string | null }, fallback: string): string | null`
  - `looksLikeDiscountClaim(text: string): boolean`

- [ ] **Step 1: Dopisz testy na końcu `pricing.test.ts`**

Rozszerz import na górze pliku o `ribbonText` i `looksLikeDiscountClaim`, a na końcu dodaj:

```ts
describe("ribbonText — co napisać na wstążce", () => {
  it("ręczny napis wygrywa nad automatem", () => {
    expect(ribbonText({ price: 1000, sale_price: 800, promo_badge: "-20%" }, "Promocja")).toBe("-20%");
  });
  it("brak napisu + aktywna obniżka → tekst ze słownika", () => {
    expect(ribbonText({ price: 1000, sale_price: 800, promo_badge: null }, "Promocja")).toBe("Promocja");
    expect(ribbonText({ price: 1000, sale_price: 800, promo_badge: null }, "Sale")).toBe("Sale");
  });
  it("ręczny napis działa BEZ obniżki (świadoma decyzja — panel ostrzega o Omnibusie)", () => {
    expect(ribbonText({ price: 1000, sale_price: null, promo_badge: "Nowość" }, "Promocja")).toBe("Nowość");
  });
  it("brak napisu i brak obniżki → brak wstążki", () => {
    expect(ribbonText({ price: 1000, sale_price: null, promo_badge: null }, "Promocja")).toBeNull();
  });
  it("cena promocyjna równa regularnej to nie promocja", () => {
    expect(ribbonText({ price: 1000, sale_price: 1000, promo_badge: null }, "Promocja")).toBeNull();
  });
});

describe("looksLikeDiscountClaim — napis obiecujący obniżkę", () => {
  it("łapie obietnice obniżki, także z polskimi znakami i w CAPS", () => {
    for (const t of ["Promocja", "PROMOCJA", "promo", "Sale", "Wyprzedaż", "wyprzedaz",
                     "Rabat 20", "-30%", "obniżka", "Taniej", "Okazja"]) {
      expect(looksLikeDiscountClaim(t)).toBe(true);
    }
  });
  it("przepuszcza napisy, które nie mówią o cenie", () => {
    for (const t of ["Nowość", "Ostatnie sztuki", "Bestseller", "Hit", "Polecamy", ""]) {
      expect(looksLikeDiscountClaim(t)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Uruchom testy — muszą paść**

Run: `cd sklep-meblowy; npx vitest run app/_lib/__tests__/pricing.test.ts`
Oczekiwane: FAIL — `ribbonText is not a function` / błąd importu.

- [ ] **Step 3: Dopisz obie funkcje na końcu `pricing.ts`**

```ts
// Co napisać na wstążce (albo nic). Precedencja: ręczny napis > automat z ceny >
// brak wstążki. Ręczny napis działa też bez obniżki — to świadoma decyzja
// właściciela; formularz w panelu ostrzega wtedy o Omnibusie.
export function ribbonText(
  p: { price: number; sale_price: number | null; promo_badge: string | null },
  fallback: string
): string | null {
  if (p.promo_badge) return p.promo_badge;
  return isOnSale(p.price, p.sale_price) ? fallback : null;
}

// Czy napis obiecuje obniżkę ceny. Używane WYŁĄCZNIE do ostrzeżenia w panelu:
// „Promocja" bez faktycznej ceny promocyjnej to komunikat o obniżce, a wtedy
// dyrektywa Omnibus wymaga pokazania najniższej ceny z 30 dni. Heurystyka ma
// łapać typowe napisy, nie udawać prawnika — dlatego ostrzega, a nie blokuje.
const DISCOUNT_CLAIM = /promo|sale|rabat|%|wyprzedaz|obnizk|obniz|taniej|okazj/;

export function looksLikeDiscountClaim(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // zdejmuje kreski/ogonki: ż→z, ą→a, ó→o
    .replace(/ł/g, "l");             // ł NIE rozkłada się przez NFD — osobno
  return DISCOUNT_CLAIM.test(normalized);
}
```

- [ ] **Step 4: Uruchom testy — muszą przejść**

Run: `cd sklep-meblowy; npx vitest run app/_lib/__tests__/pricing.test.ts`
Oczekiwane: PASS, łącznie ze wszystkimi wcześniejszymi testami Omnibusa w tym pliku.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/pricing.ts sklep-meblowy/app/_lib/__tests__/pricing.test.ts
git commit -m "feat(promocje): regula tekstu wstazki + detektor obietnicy obnizki"
```

---

### Task 4: Reconciler IO i wpięcie w zapis produktu

**Files:**
- Create: `sklep-meblowy/app/_lib/sale-schedule-server.ts`
- Modify: `sklep-meblowy/app/admin/produkty/actions.ts:149-155` (walidacja), `:178-197` (payload), `:206` (kolejność wywołań)

**Interfaces:**
- Consumes: `planSaleActivation`, `warsawToday` (Task 2); `recordPriceHistory` z `@/app/_lib/price-history`; `createAdminClient` z `@/app/_lib/supabase/server`.
- Produces: `applySaleSchedule(ids?: string[]): Promise<{ id: string; sale_price: number | null }[]>` — zwraca listę faktycznie przełączonych wierszy (do logu crona).

- [ ] **Step 1: Napisz warstwę IO w OSOBNYM pliku**

`createAdminClient` jest server-only, a `sale-schedule.ts` importują testy jednostkowe i komponent kliencki panelu. Dlatego IO trafia do osobnego pliku — wzorem istniejącej w tym repo pary `promo-banner.ts` / `promo-banner-server.ts`. Czysta logika z Task 2 zostaje **bez żadnych zmian**.

Utwórz `sklep-meblowy/app/_lib/sale-schedule-server.ts`:

```ts
// Server-side: wprowadza w życie zaplanowane promocje. Jedyne miejsce w kodzie,
// które pisze products.sale_price. Po każdej zmianie ceny woła istniejące
// recordPriceHistory → wiersz historii i omnibus_price powstają w JEDNEJ
// transakcji (RPC apply_price_changes, migracja 39). Zero nowej logiki Omnibusa.
import { createAdminClient } from "./supabase/server";
import { recordPriceHistory } from "./price-history";
import { planSaleActivation, warsawToday, type SaleScheduleRow } from "./sale-schedule";

const SCHEDULE_COLUMNS =
  "id, price, sale_price, sale_price_planned, sale_from, sale_to, promo_badge";

export async function applySaleSchedule(
  ids?: string[]
): Promise<{ id: string; sale_price: number | null }[]> {
  const supabase = await createAdminClient();

  let query = supabase.from("products").select(SCHEDULE_COLUMNS);
  // `ids` podane (choćby puste) = zawężenie do konkretnych produktów. Pusta
  // tablica musi być no-opem, nie przypadkowym pełnym przebiegiem crona.
  if (ids) {
    query = query.in("id", ids);
  } else {
    // Cron: tylko wiersze, które MOGĄ wymagać przełączenia — nie cała tabela.
    query = query.or("sale_price_planned.not.is.null,sale_price.not.is.null");
  }
  const { data, error } = await query;
  if (error) throw new Error(`applySaleSchedule select failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as SaleScheduleRow[]).map((r) => ({
    ...r,
    price: Number(r.price),
    sale_price: r.sale_price === null ? null : Number(r.sale_price),
    sale_price_planned:
      r.sale_price_planned === null ? null : Number(r.sale_price_planned),
  }));

  const changes = planSaleActivation(rows, warsawToday());

  // Pierwszy błąd przerywa cały przebieg i zostawia stan częściowy. Jest to
  // bezpieczne, bo planSaleActivation jest idempotentna — kolejny przebieg
  // dokończy nieprzełączone wiersze. Alternatywa (zbieranie błędów i jazda
  // dalej) ukrywałaby awarię w logu crona, którego nikt nie czyta.
  for (const c of changes) {
    const { error: updErr } = await supabase
      .from("products")
      .update({ sale_price: c.sale_price } as never)
      .eq("id", c.id);
    // Id produktu MUSI być w komunikacie: to leci z crona bez nadzoru, po wielu
    // wierszach — bez id operator nie wie, który produkt zatrzymał przebieg.
    if (updErr)
      throw new Error(`applySaleSchedule update failed for ${c.id}: ${updErr.message}`);
    // Kolejność jest istotna: recordPriceHistory czyta świeży stan z bazy.
    await recordPriceHistory(c.id);
  }

  return changes;
}
```

- [ ] **Step 2: Rozszerz walidację w `updateProductBasics`**

W `app/admin/produkty/actions.ts` zamień blok z linii 149-155 (walidacja `sale_price`) na walidację planu. Nazwa pola formularza zmienia się na `sale_price_planned`:

```ts
  // Harmonogram promocji. `sale_price` NIE jest już zapisywane z formularza —
  // pisze je wyłącznie reconciler (applySaleSchedule) na podstawie planu poniżej.
  const salePlanned = parseNumber(formData.get("sale_price_planned"));
  if (salePlanned !== null) {
    if (salePlanned < 0) return { ok: false, error: "Cena promocyjna nie może być ujemna" };
    if (salePlanned >= price)
      return { ok: false, error: "Cena promocyjna musi być niższa od ceny regularnej" };
  }
  const saleFrom = emptyToNull(sanitize(formData.get("sale_from"), 10));
  const saleTo = emptyToNull(sanitize(formData.get("sale_to"), 10));
  if (saleFrom !== null && saleTo !== null && saleTo < saleFrom)
    return { ok: false, error: "Data końca nie może być przed datą początku" };
  if (salePlanned === null && (saleFrom !== null || saleTo !== null))
    return { ok: false, error: "Podaj cenę promocyjną albo wyczyść daty" };
```

- [ ] **Step 3: Zamień pole w payloadzie i dodaj napis wstążki**

W obiekcie `updates` (linia ~193) usuń `sale_price: salePriceToSave` i wstaw:

```ts
    sale_price_planned: salePlanned,
    sale_from: saleFrom,
    sale_to: saleTo,
    promo_badge: emptyToNull(sanitize(formData.get("promo_badge"), 16)),
```

Usuń też martwą już linię `const salePriceToSave = salePriceRaw;` (~176) razem z komentarzem nad nią, bo opisuje nieistniejącą ścieżkę.

- [ ] **Step 4: Wywołaj reconciler po zapisie**

Bezpośrednio po istniejącym `await recordPriceHistory(id);` (linia ~206) dodaj:

```ts
  // Promocja bez dat ma działać od razu, nie od najbliższego crona.
  // recordPriceHistory zostaje WYŻEJ, bo zmiana samej ceny regularnej też musi
  // trafić do historii; applySaleSchedule woła je ponownie tylko gdy faktycznie
  // przełączy cenę, a computePriceUpdates pomija brak zmiany — więc jest to bezpieczne.
  await applySaleSchedule([id]);
```

i dopisz import na górze pliku:

```ts
import { applySaleSchedule } from "@/app/_lib/sale-schedule-server";
```

- [ ] **Step 5: Sprawdź typy i pełny zestaw testów**

Run: `cd sklep-meblowy; npx tsc --noEmit; npm test`
Oczekiwane: tsc bez błędów; wszystkie testy PASS. Jeśli tsc wskaże `ProductEditor.tsx` (formularz jeszcze wysyła `sale_price`) — to normalne na tym etapie tylko wtedy, gdy nazwa pola jest typowana; pole `name=` w HTML nie jest, więc błędu być nie powinno. Formularz przestawiamy w Task 6.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/sale-schedule-server.ts sklep-meblowy/app/admin/produkty/actions.ts
git commit -m "feat(promocje): reconciler cen promocyjnych + wpiecie w zapis produktu"
```

---

### Task 5: Wstążka na zdjęciach

**Files:**
- Create: `sklep-meblowy/app/_components/ui/PromoRibbon.tsx`
- Modify: `sklep-meblowy/app/_components/ui/ProductCard.tsx:42-73`
- Modify: `sklep-meblowy/app/_components/ui/ImageGallery.tsx:10`, `:164-181`
- Modify: `sklep-meblowy/app/_components/ui/ProductMainSection.tsx:79`

**Interfaces:**
- Consumes: `ribbonText` (Task 3), `promo_badge` w typie `Product` (Task 1).
- Produces: komponent `PromoRibbon` oraz prop `ribbon?: string | null` w `ImageGallery`.

- [ ] **Step 1: Napisz komponent wstążki**

Plik `sklep-meblowy/app/_components/ui/PromoRibbon.tsx`. **Bez `"use client"` i bez żadnych importów** — dzięki temu działa i w drzewie serwerowym (`ProductCard`), i w klienckim (`ImageGallery`):

```tsx
// Ukośna wstążka w LEWYM DOLNYM narożniku zdjęcia. Narożniki są zajęte:
// lewy górny = badge z „Polecanych", prawy górny = serce ulubionych — dlatego
// wstążka idzie na dół. Przycięcie po łuku robi overflow-hidden kontenera.
// Świadomie bez importów i bez "use client": ten sam komponent renderuje się
// z ProductCard (serwer) i z ImageGallery (klient).
export default function PromoRibbon({
  text,
  size = "card",
  decorative = false,
}: {
  text: string;
  // card: kafel listingu (rounded-2xl), hero: główne zdjęcie karty produktu (rounded-3xl)
  size?: "card" | "hero";
  // true na karcie produktu — obok ceny stoi już plakietka „Promocja",
  // czytnik ekranu nie ma czytać tego dwa razy.
  decorative?: boolean;
}) {
  const geometry =
    size === "hero"
      ? "bottom-9 -left-12 w-56 py-2 text-[11px]"
      : "bottom-6 -left-9 w-36 py-1.5 text-[9px]";

  return (
    <span
      aria-hidden={decorative || undefined}
      // whitespace-nowrap + overflow-hidden są WYMAGANE, nie kosmetyczne: panel
      // wpuszcza napis do 16 znaków, a span o stałej szerokości bez nowrap zawija
      // tekst na dwie linie WEWNĄTRZ obrotu -45° — brzydsze niż obcięcie.
      className={`pointer-events-none absolute ${geometry} -rotate-45 whitespace-nowrap overflow-hidden text-center bg-[var(--color-navy)] text-[var(--color-gold-light)] font-sans font-bold uppercase tracking-[0.2em] shadow-md`}
    >
      {text}
    </span>
  );
}
```

- [ ] **Step 2: Wstaw wstążkę na kafel**

W `ProductCard.tsx`: dopisz do importów

```tsx
import { effectivePrice, isOnSale, ribbonText } from "@/app/_lib/pricing";
import PromoRibbon from "./PromoRibbon";
```

pod `const t = getDictionary(locale);` dodaj

```tsx
  const ribbon = ribbonText(product, t.product.saleBadge);
```

a wewnątrz `<LocalizedLink>` owijającego zdjęcie, bezpośrednio po bloku `{badge && (...)}`:

```tsx
          {ribbon && <PromoRibbon text={ribbon} />}
```

- [ ] **Step 3: Dodaj prop do galerii karty produktu**

W `ImageGallery.tsx` zmień sygnaturę i wstaw wstążkę do przycisku z głównym zdjęciem — **nie** do lightboxa i **nie** do miniatur:

```tsx
export default function ImageGallery({
  images,
  name,
  ribbon = null,
}: {
  images: string[];
  name: string;
  // Napis na wstążce liczony serwerowo (ribbonText) — null = bez wstążki.
  // Świadomie NIE trafia do lightboxa: po powiększeniu klient patrzy na mebel,
  // a wstążka jest elementem interfejsu, nie częścią fotografii.
  ribbon?: string | null;
}) {
```

dopisz import `import PromoRibbon from "./PromoRibbon";` i wewnątrz `<button>` z głównym zdjęciem, po `<Image ... />`:

```tsx
          {ribbon && <PromoRibbon text={ribbon} size="hero" decorative />}
```

- [ ] **Step 4: Przekaż napis do galerii**

Galerię renderuje **`ProductMainSection.tsx:79`**, a nie `produkt/[id]/page.tsx` — i to tam są już dostępne `product` oraz `t` (ten sam plik używa `t.product.saleBadge` w linii 140). Zmień linię 79 na:

```tsx
        <ImageGallery
          images={images}
          name={product.name}
          ribbon={ribbonText(product, t.product.saleBadge)}
        />
```

oraz dodaj import `ribbonText` z `@/app/_lib/pricing`. Uwaga: ten plik — w odróżnieniu od `ProductCard.tsx` — **nie ma** jeszcze importu z tego modułu, więc dochodzi nowa linia importu, a nie rozszerzenie istniejącej.

- [ ] **Step 5: Sprawdź typy i build**

Run: `cd sklep-meblowy; npx tsc --noEmit; npm run lint`
Oczekiwane: brak błędów.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_components/ui/PromoRibbon.tsx sklep-meblowy/app/_components/ui/ProductCard.tsx sklep-meblowy/app/_components/ui/ImageGallery.tsx sklep-meblowy/app/_components/ui/ProductMainSection.tsx
git commit -m "feat(promocje): ukosna wstazka na kaflach i glownym zdjeciu produktu"
```

---

### Task 6: Panel admina — blok „Promocja”, stan i ostrzeżenie

**Files:**
- Modify: `sklep-meblowy/app/admin/produkty/[id]/ProductEditor.tsx:315-327`
- Modify: `sklep-meblowy/app/admin/produkty/[id]/page.tsx` (przekazuje prop `today`)
- Modify: `sklep-meblowy/app/admin/produkty/page.tsx:19-30`
- Modify: `sklep-meblowy/app/admin/produkty/ProductsList.tsx:12-21`, `:104-108`

**Interfaces:**
- Consumes: `saleStatus`, `promoChipLabel`, `warsawToday` (Task 2), `looksLikeDiscountClaim` (Task 3), nazwy pól formularza z Task 4 (`sale_price_planned`, `sale_from`, `sale_to`, `promo_badge`).
- Produces: pola `promoChip: string | null` w `AdminProductRow`.

- [ ] **Step 1: Zamień pole „Cena promocyjna” na blok „Promocja”**

W `ProductEditor.tsx` zastąp cały `<Field label="Cena promocyjna (zł)" ...>` (linie 315-327) poniższym blokiem. Stan liczony przy renderze; `warsawToday()` w komponencie klienckim jest w porządku, bo to tylko podpowiedź dla człowieka:

```tsx
          <div className="md:col-span-2 flex flex-col gap-3 p-4 border border-[var(--border)] rounded-xl">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
                Promocja
              </p>
              <p className="text-xs text-[var(--fg)]">{promoStatusLabel}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field
                label="Cena promocyjna (zł)"
                hint="Puste = brak promocji. Musi być niższa od ceny regularnej."
              >
                <input
                  name="sale_price_planned"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={product.sale_price_planned ?? ""}
                  className={inputClass}
                />
              </Field>

              <Field label="Od" hint="Puste = od razu.">
                <input
                  name="sale_from"
                  type="date"
                  defaultValue={product.sale_from ?? ""}
                  className={inputClass}
                />
              </Field>

              <Field label="Do (włącznie)" hint="Puste = bez końca, trzeba wyłączyć ręcznie.">
                <input
                  name="sale_to"
                  type="date"
                  defaultValue={product.sale_to ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Napis na wstążce"
              hint="Puste = „Promocja”. Maks. 16 znaków."
            >
              <input
                name="promo_badge"
                maxLength={16}
                defaultValue={product.promo_badge ?? ""}
                onChange={(e) => setBadgeDraft(e.target.value)}
                className={inputClass}
              />
            </Field>

            {badgeWarning && (
              <p className="px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg">
                Ten napis sugeruje obniżkę, a produkt nie ma aktywnej ceny
                promocyjnej. Dyrektywa Omnibus wymaga wtedy pokazania najniższej
                ceny z 30 dni przed obniżką. Ustaw cenę promocyjną albo zmień
                napis na taki, który nie mówi o cenie — np. „Nowość”,
                „Ostatnie sztuki”.
              </p>
            )}
          </div>
```

- [ ] **Step 2: Dodaj stan i wyliczenia do komponentu**

W `ProductEditor.tsx`, obok pozostałych `useState` (np. po `const [galleryPickerOpen, ...]`):

```tsx
  // Napis wstążki na żywo — ostrzeżenie o Omnibusie ma się pokazać przed
  // zapisem, nie po. Seed z zapisanej wartości.
  const [badgeDraft, setBadgeDraft] = useState(product.promo_badge ?? "");
  const promoStatus = saleStatus(
    {
      id: product.id,
      price: Number(product.price),
      sale_price: product.sale_price,
      sale_price_planned: product.sale_price_planned,
      sale_from: product.sale_from,
      sale_to: product.sale_to,
      promo_badge: product.promo_badge,
    },
    today
  );
  const promoStatusLabel = describeSaleStatus(promoStatus);
  // Ostrzegamy tylko przy braku AKTYWNEJ ceny promocyjnej — zaplanowana na
  // przyszłość też jest brakiem, bo wstążka pokaże się od razu.
  const badgeWarning =
    badgeDraft.trim() !== "" &&
    looksLikeDiscountClaim(badgeDraft) &&
    promoStatus.kind !== "active";
```

i importy:

```tsx
import { saleStatus, type SaleStatus } from "@/app/_lib/sale-schedule";
import { looksLikeDiscountClaim } from "@/app/_lib/pricing";
```

`today` jest **propem**, nie wyliczeniem w komponencie. `ProductEditor` ma `"use client"`, a Next prerenderuje takie komponenty najpierw na serwerze — `warsawToday()` policzone w renderze dałoby na granicy doby dwa różne wyniki i rozjazd hydratacji. Dodaj do sygnatury propsów:

```tsx
  // Dzień w strefie sklepu, policzony na serwerze (patrz page.tsx) — nie liczymy
  // go tutaj, bo render kliencki i prerender serwerowy mogłyby trafić w różne dni.
  today: string;
```

- [ ] **Step 3a: Przekaż `today` z serwera**

W `app/admin/produkty/[id]/page.tsx`, w renderze `<ProductEditor ... />`, dodaj prop:

```tsx
        today={warsawToday()}
```

oraz import `import { warsawToday } from "@/app/_lib/sale-schedule";`.

- [ ] **Step 3: Dodaj funkcję opisującą stan**

Na końcu pliku `ProductEditor.tsx` (poza komponentem, obok innych helperów jeśli takie są):

```tsx
// Data z kolumny `date` (YYYY-MM-DD) na polski zapis dzienny.
function dayPl(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function describeSaleStatus(s: SaleStatus): string {
  switch (s.kind) {
    case "active":
      return s.until ? `aktywna — do ${dayPl(s.until)}` : "aktywna — bez terminu końca";
    case "scheduled":
      return `zaplanowana — startuje ${dayPl(s.from)}`;
    case "ended":
      return `zakończona ${dayPl(s.on)}`;
    case "badgeOnly":
      return "sam napis na wstążce, bez obniżki ceny";
    case "none":
      return "brak promocji";
  }
}
```

- [ ] **Step 4: Dołóż chip do projekcji listy**

W `app/admin/produkty/page.tsx`, w projekcji budującej wiersze dla `ProductsList` (linie ~19-30), dodaj pole:

```ts
    promoChip: promoChipLabel(
      {
        id: p.id,
        price: Number(p.price),
        sale_price: p.sale_price,
        sale_price_planned: p.sale_price_planned,
        sale_from: p.sale_from,
        sale_to: p.sale_to,
        promo_badge: p.promo_badge,
      },
      today
    ),
```

z `const today = warsawToday();` policzonym raz przed mapowaniem i importem `import { promoChipLabel, warsawToday } from "@/app/_lib/sale-schedule";`.

- [ ] **Step 5: Pokaż chip w liście**

W `ProductsList.tsx` dodaj do typu `AdminProductRow`:

```ts
  // Stan promocji: „Promocja" / „Zaplanowana" / „Wstążka" albo null.
  // „Wstążka" wyłapuje wyciek: ręczny napis nie ma terminu i sam nie zgaśnie.
  promoChip: string | null;
```

i w linii z metadanymi (po `stock` / liczbie wariantów), wewnątrz `<p className="text-xs text-[var(--muted)] mt-0.5">`, przed zamknięciem — dodaj chip wzorem istniejącego „ukryty”:

```tsx
                  {p.promoChip && (
                    <span className="ml-2 align-middle px-2 py-0.5 text-[10px] font-sans uppercase tracking-widest rounded bg-[var(--color-gold)]/20 text-[var(--color-gold-text)]">
                      {p.promoChip}
                    </span>
                  )}
```

- [ ] **Step 6: Sprawdź typy, lint i testy**

Run: `cd sklep-meblowy; npx tsc --noEmit; npm run lint; npm test`
Oczekiwane: wszystko zielone.

- [ ] **Step 7: Commit**

```bash
git add "sklep-meblowy/app/admin/produkty/[id]/ProductEditor.tsx" sklep-meblowy/app/admin/produkty/page.tsx sklep-meblowy/app/admin/produkty/ProductsList.tsx
git commit -m "feat(promocje): blok promocji w panelu, linijka stanu, ostrzezenie o Omnibusie, chip w liscie"
```

---

### Task 7: Cron

**Files:**
- Create: `sklep-meblowy/app/api/cron/promocje/route.ts`
- Modify: `sklep-meblowy/vercel.json`

**Interfaces:**
- Consumes: `applySaleSchedule` (Task 4).
- Produces: `GET /api/cron/promocje` chronione `CRON_SECRET`.

- [ ] **Step 1: Przeczytaj przewodnik route handlerów tej wersji Next**

`AGENTS.md` mówi wprost, że to nie jest Next.js z Twojej pamięci. Zanim napiszesz route, sprawdź konwencję route handlerów i `dynamic` w `node_modules/next/dist/docs/`. Wzorem lokalnym jest `app/api/reviews/route.ts`.

- [ ] **Step 2: Napisz route**

Plik `sklep-meblowy/app/api/cron/promocje/route.ts`:

```ts
// Cron promocji: wprowadza w życie zaplanowane okna (start i koniec).
// Vercel liczy crony w UTC, a Polska ma zmianę czasu — dlatego wpis w
// vercel.json stoi na 23:05 UTC: to 00:05 zimą i 01:05 latem, czyli ZAWSZE po
// lokalnej północy, nigdy przed. Spóźnienie do 65 minut jest świadomym wyborem
// zamiast ryzyka, że promocja „od 10.08" wystartuje 9 sierpnia wieczorem.
// Na planie Pro wystarczy zmienić harmonogram na */15 * * * * — funkcja jest
// idempotentna, więc częstsze odpalanie nic nie kosztuje.
import { applySaleSchedule } from "@/app/_lib/sale-schedule-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET nie ustawiony" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const switched = await applySaleSchedule();
    return Response.json({ switched });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nieznany błąd";
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Dodaj wpis crona**

`sklep-meblowy/vercel.json` — dziś `{"crons": []}`:

```json
{
  "crons": [{ "path": "/api/cron/promocje", "schedule": "5 23 * * *" }]
}
```

- [ ] **Step 4: Sprawdź typy i lint**

Run: `cd sklep-meblowy; npx tsc --noEmit; npm run lint`
Oczekiwane: brak błędów.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/api/cron/promocje/route.ts sklep-meblowy/vercel.json
git commit -m "feat(promocje): cron przelaczajacy okna promocji (23:05 UTC = po lokalnej polnocy)"
```

---

### Task 8: Duplikat produktu nie dziedziczy promocji

**Files:**
- Modify: `sklep-meblowy/app/_lib/new-product.ts:139-148` (typ payloadu), `:164` (builder), `:150-156` (komentarz)
- Modify: `sklep-meblowy/app/_lib/__tests__/new-product.test.ts:155` — **istniejący test trzeba zamienić**, bo dziś zatwierdza kopiowanie promocji

**Interfaces:**
- Consumes: nic nowego.
- Produces: `DuplicateProductPayload` z `sale_price: null`, `sale_price_planned: null`, `sale_from: null`, `sale_to: null`, `promo_badge: null`.

- [ ] **Step 1: ZAMIEŃ istniejący test — on utrwala dzisiejszy błąd**

W `app/_lib/__tests__/new-product.test.ts` **linia ~155** stoi test, który wprost zatwierdza kopiowanie promocji:

```ts
  it("kopiuje sale_price, ale RESETUJE omnibus_price (zgodność z Omnibusem)", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.sale_price).toBe(dupSource.sale_price);
    expect(p.omnibus_price).toBeNull();
```

Zamień go **w całości** na poniższy. Nie dopisuj obok — dwa testy o sprzecznych oczekiwaniach nie mogą przejść jednocześnie. Fixture `dupSource` już istnieje w tym pliku (linia ~84) i ma `sale_price: 999.0`:

```ts
  it("NIE dziedziczy promocji ani omnibusa — kopia bez historii cen nie może ogłaszać obniżki", () => {
    const p = buildDuplicatePayload(dupSource);
    // Wcześniej sale_price było kopiowane przy wyzerowanym omnibus_price →
    // kopia pokazywała obniżkę bez wymaganej najniższej ceny z 30 dni.
    expect(p.sale_price).toBeNull();
    expect(p.sale_price_planned).toBeNull();
    expect(p.sale_from).toBeNull();
    expect(p.sale_to).toBeNull();
    expect(p.promo_badge).toBeNull();
    expect(p.omnibus_price).toBeNull();
  });
```

- [ ] **Step 2: Uruchom test — musi paść**

Run: `cd sklep-meblowy; npx vitest run app/_lib/__tests__/new-product.test.ts`
Oczekiwane: FAIL — `expected 999 to be null` na `p.sale_price`.

- [ ] **Step 3: Popraw typ payloadu**

W `new-product.ts` rozszerz listę `Omit` i dopisz jawne nulle:

```ts
export type DuplicateProductPayload = Omit<
  DuplicateSource,
  "size_group" | "size_label" | "omnibus_price" | "sale_price"
> & {
  is_active: boolean;
  deactivation_source: "manual";
  size_group: null;
  size_label: null;
  omnibus_price: null;
  // Kopia startuje BEZ promocji — patrz komentarz nad buildDuplicatePayload.
  sale_price: null;
  sale_price_planned: null;
  sale_from: null;
  sale_to: null;
  promo_badge: null;
};
```

- [ ] **Step 4: Popraw builder i komentarz**

W `buildDuplicatePayload` zamień `sale_price: source.sale_price,` na:

```ts
    sale_price: null,
    sale_price_planned: null,
    sale_from: null,
    sale_to: null,
    promo_badge: null,
```

a w komentarzu nad funkcją zamień punkt o `omnibus_price` na spójny opis:

```ts
// - promocja NIE jest dziedziczona (sale_price, plan, okno i napis wstążki na
//   null) razem z omnibus_price: świeża oferta nie ma ceny sprzed 30 dni, więc
//   nie ma czego ogłaszać. Wcześniej kopia dostawała sale_price przy wyzerowanym
//   omnibus_price — obniżka bez wymaganej informacji o najniższej cenie.
```

- [ ] **Step 5: Uruchom testy — muszą przejść**

Run: `cd sklep-meblowy; npm test`
Oczekiwane: PASS, cały zestaw.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/app/_lib/new-product.ts sklep-meblowy/app/_lib/__tests__/new-product.test.ts
git commit -m "fix(promocje): duplikat produktu nie dziedziczy promocji (obnizka bez Omnibusa)"
```

---

### Task 9: Weryfikacja na żywo

**Files:**
- Create: `sklep-meblowy/e2e/promocje.spec.ts`

**Interfaces:**
- Consumes: całość powyżej.
- Produces: dowody, że to działa w realnym renderze — nie tylko w testach jednostkowych.

**Kontekst, bez którego ten task nie ma sensu:** ta ścieżka **nigdy nie działała na produkcji** — na 2026-08-05 żaden produkt nie ma `sale_price`. Przekreślona cena, plakietka przy cenie i etykieta Omnibus nie zostały nigdy zobaczone w realnym renderze.

- [ ] **Step 1: Ustaw promocję kontrolną na jednym produkcie**

Przez panel (`/admin/produkty/<id>`), nie SQL-em — chodzi o sprawdzenie całej drogi zapisu. Produkt: „Materac nawierzchniowy Cloud 3 cm 90x200 cm” (`d1dc85bb-d019-4a8d-b890-40f04e311886`, cena 339,00). Ustaw cenę promocyjną `289`, daty puste (promocja natychmiastowa), napis pusty.

Oczekiwane: po zapisie linijka stanu mówi „aktywna — bez terminu końca”, a chip w liście produktów pokazuje „Promocja”.

- [ ] **Step 2: Potwierdź w bazie, że reconciler i Omnibus zadziałały**

`mcp__supabase__execute_sql`:

```sql
select price, sale_price, sale_price_planned, sale_from, sale_to, promo_badge, omnibus_price
from products where id = 'd1dc85bb-d019-4a8d-b890-40f04e311886';

select effective_price, recorded_at from price_history
where product_id = 'd1dc85bb-d019-4a8d-b890-40f04e311886'
order by recorded_at desc limit 3;
```

Oczekiwane: `sale_price = 289.00` (ustawione przez reconciler, nie formularz), `omnibus_price` niepuste, najnowszy wiersz historii z `effective_price = 289.00`.

- [ ] **Step 3: Zrzuty ekranu w obu motywach**

Playwrightem (bez logowania — front jest publiczny): `/sklep` oraz `/produkt/d1dc85bb-d019-4a8d-b890-40f04e311886`, każdy w jasnym i ciemnym motywie.

Sprawdzasz: wstążka jest czytelna na zdjęciu; nie nakłada się na serce ulubionych; kontrast granatu ze złotem działa w obu motywach; przekreślona cena i etykieta „Najniższa cena z 30 dni przed obniżką” są widoczne; po otwarciu lightboxa wstążki NIE ma.

Kontrast wstążki na zdjęciu to jedyna rzecz w tym planie, której **nie da się wydedukować z kodu** — jeśli jest zła, popraw kolory w `PromoRibbon.tsx` i zrób zrzuty ponownie.

- [ ] **Step 4: Napisz e2e**

Plik `sklep-meblowy/e2e/promocje.spec.ts` — wzorem istniejących spec-ów w `e2e/` (te same helpery i konfiguracja; **bez `E2E_BASE_URL` testy lecą w PRODUKCJĘ**, więc ustaw zmienną na localhost przy pracy lokalnej):

```ts
import { test, expect } from "@playwright/test";

const PROMO_PRODUCT = "d1dc85bb-d019-4a8d-b890-40f04e311886";

test("wstążka promocji jest na kaflu i na głównym zdjęciu, ale nie w lightboxie", async ({ page }) => {
  await page.goto(`/produkt/${PROMO_PRODUCT}`);
  const ribbon = page.getByText("Promocja", { exact: true });
  await expect(ribbon.first()).toBeVisible();

  // Lightbox: wstążka nie może wejść na powiększone zdjęcie.
  await page.getByRole("button", { name: /powiększ|zoom/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Promocja", { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 5: Uruchom e2e lokalnie**

Run: `cd sklep-meblowy; $env:E2E_BASE_URL="http://localhost:3000"; npx playwright test e2e/promocje.spec.ts`
Oczekiwane: PASS. Jeśli selektor przycisku powiększenia nie trafia — sprawdź `t.a11y.zoomImage` w `app/_lib/dictionaries/pl.ts` i użyj dokładnej frazy.

- [ ] **Step 6: Sprzątnij promocję kontrolną albo zostaw świadomie**

Zapytaj właściciela, czy promocja `289` na materacu ma zostać. Jeśli nie — wyczyść cenę promocyjną w panelu i potwierdź, że reconciler wyzerował `sale_price` oraz `omnibus_price`, a w historii pojawił się wiersz z ceną `339`.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/e2e/promocje.spec.ts
git commit -m "test(promocje): e2e wstazki na karcie produktu i brak wstazki w lightboxie"
```

---

## Po wdrożeniu — czynności wdrożeniowe (nie kodowe)

Te kroki nie są taskami dla subagenta; robi je człowiek albo agent z dostępem do paneli:

- [x] **`CRON_SECRET` w Vercelu** — **już był ustawiony**, nic nie trzeba dodawać ani robić Redeploy. Potwierdzone po deployu 2026-08-05: endpoint bez nagłówka zwraca 401, a nie 500 (500 leci wyłącznie przy pustym `process.env.CRON_SECRET`). Zmienna najpewniej została po starym cronie `reconcile-bl`.
- [x] **Sprawdzić cron po deployu** — zrobione jednym zapytaniem: `curl -sL https://mollien.pl/api/cron/promocje` → **401** `{"error":"Brak autoryzacji"}`, czyli route żyje i autoryzacja działa. Pełnego przebiegu `{"switched":[]}` nie da się stąd potwierdzić bez znajomości wartości sekretu — lokalnie, na buildzie produkcyjnym, sprawdzone wszystkie trzy ścieżki (brak zmiennej → 500, zły nagłówek → 401, dobry → `{"switched":[]}`). Nie odpalać w pętli: ciasne pętle curl na `mollien.pl` wywołują 403 per-IP na kilka minut.
- [x] **Potwierdzić migrację 69 na produkcji** — zaaplikowana ręcznie i potwierdzona przez `list_tables` (wersja `20260805081016`).
- [x] **Sesja admina do e2e** — sprawdzone 2026-08-05: `.env.e2e` JEST wypełniony, a sesja w `e2e/.auth/admin.json` odświeżona 2026-08-04, więc panel da się testować. (Wcześniejsza treść tego punktu była nieaktualna.)
- [x] Wpisy `crons` z `vercel.json` aktywują się dopiero na deploymencie produkcyjnym — gałąź zmergowana (PR #124, `73e8a5c`), więc harmonogram jest już aktywny. Pierwsze odpalenie: 23:05 UTC, czyli 01:05 czasu lokalnego.

---

## STAN WYKONANIA (2026-08-05, gałąź `feat/promocje-wstazka`)

Ledger SDD (`.superpowers/sdd/`) jest gitignorowany, więc to jest jedyny nośnik
rozstrzygnięć między komputerami. **Wszystkie 9 tasków zamknięte**, każdy przez
review + rundy naprawcze, gdzie były potrzebne.

| task | commity | uwaga |
|---|---|---|
| 1 migracja + typ | `f8a8189` | migracja 69 **zaaplikowana na produkcji** (`20260805081016`) |
| 2 logika okien | `d0bf76f` | 25 testów |
| 3 `ribbonText` + detektor | `c3ee6e6` | 19 testów |
| 4 reconciler + zapis | `af8c71a` | — |
| 5 wstążka | `534688b`, `1b194ec` | drugi commit z weryfikacji na żywo |
| 6 panel | `bd3e50e` | — |
| 7 cron | `4c45e86` | — |
| 8 duplikat bez promocji | `8db3986` | naprawa błędu sprzed tej gałęzi |
| 9 weryfikacja na żywo | `f2a289b`, `c93d487` | — |

Poza funkcją: `b1e6630` podmienia numer telefonu firmy (prośba właściciela w trakcie).

### Rozstrzygnięcia, których nie widać w kodzie

- **Znak obrotu wstążki był błędny i wyszło to tylko na renderze.** Przy `-rotate-45`
  pas w lewym **dolnym** narożniku biegnie w górę-prawo, więc nie przecina obu brzegów
  kontenera: jeden koniec jest przycięty, drugi urywa się w środku zdjęcia jako klin.
  Uphill czyta się wyłącznie w narożniku górnym-lewym i dolnym-prawym. Offsety zostały
  bez zmian, bo zmiana znaku nie zmienia bounding boxa.
- **Reconciler cofa `sale_price`, gdy zapis historii padnie** (`c93d487`). Powód jest
  poważniejszy niż sam stan połowiczny: `planSaleActivation` zgłasza wiersz tylko gdy
  `desired !== sale_price`, więc bez cofnięcia produkt zostawał z obniżką bez
  `omnibus_price` **na zawsze** — żaden kolejny przebieg ani zapis w panelu by tego nie
  ponowił, a panel pokazywałby zwyczajne „aktywna". Komunikat błędu rozróżnia „cofnięto"
  od „cofnięcie TEŻ padło" i w obu przypadkach podaje id produktu.
- **Sekret crona porównujemy stałoczasowo.** Nie z ostrożności — ten projekt rozstrzygnął
  to w audycie 2026-06-11 (`29edffd`) właśnie dla sekretów crona. Helper i jego testy
  wróciły **verbatim z historii** (`git show 9a8bdce^:...`), nie zostały napisane od nowa.
- **`force-dynamic` usunięte** jako martwa konfiguracja: w tej wersji Next handlery GET
  nie są cache'owane domyślnie, a ten handler nie woła `fetch()`.
- **13 odłożonych minorów przetriażowanych na koniec:** 12 zostaje świadomie, 1 okazał
  się nieaktualny (`new-product.ts` — obie ścieżki twardo zerują promocję).

### Czego NIE sprawdzono na żywo

- **Cron nigdy nie odpalił się z harmonogramu Vercela.** Endpoint wołałem ręcznie
  (401 bez/ze złym nagłówkiem, `{"switched":[]}` z dobrym) — ale samo wywołanie przez
  Vercel Cron o 23:05 UTC zobaczy się dopiero po deployu.
- **Nie widziałem, jak okno od–do otwiera się i gaśnie samo.** Promocję kontrolną
  ustawiałem bez dat (natychmiastową). Przełączanie po granicy doby pokrywają wyłącznie
  testy jednostkowe.
- **Ścieżka „cofnięcie też padło" jest tylko przetestowana jednostkowo** — realnej awarii
  bazy w tym miejscu nie wywoływałem.
- `e2e/promocje.spec.ts` **pomija się, gdy żaden produkt nie ma promocji**, a skoro
  promocje wygasają same, będzie tak przez większość czasu. To ręcznie uzbrajany
  smoke-check, nie stały strażnik regresji. Mocniejszy wariant, jeśli kiedyś będzie
  potrzebny: spec sam tworzy produkt tymczasowy (wzorem `product-category-save.spec.ts`),
  ustawia na nim promocję i usuwa go w `afterEach` — wtedy nie brudzi historii cen
  żadnego prawdziwego produktu.

### Follow-upy

- ~~**`CRON_SECRET` w Vercelu + Redeploy**~~ — **nic do zrobienia, sprawdzone po deployu
  2026-08-05:** zmienna jest już ustawiona w środowisku produkcyjnym. Dowód:
  `curl -sL https://mollien.pl/api/cron/promocje` (bez nagłówka) zwraca **401**
  `{"error":"Brak autoryzacji"}`, a nie 500 — a route zwraca 500 wyłącznie wtedy, gdy
  `process.env.CRON_SECRET` jest puste. Zmienna została najpewniej po którymś ze starych
  cronów (`reconcile-bl` używał tej samej nazwy). Vercel Cron wysyła
  `Authorization: Bearer $CRON_SECRET` z tej samej zmiennej, więc wartość zgadza się
  z konstrukcji i nie trzeba jej nigdzie przepisywać.
- Promocja kontrolna 339 → 289 zł była włączona na produkcji ok. 37 minut i została
  wyczyszczona. **Skutek trwały:** 289 zł zostaje najniższą ceną z 30 dni dla materaca
  `d1dc85bb-d019-4a8d-b890-40f04e311886` do ~2026-09-04, więc każda prawdziwa obniżka na
  nim przed tą datą musi pokazać 289 zł.
- Limit 16 znaków na `promo_badge` jest tylko w aplikacji, bez `CHECK` w bazie. Dziś panel
  jest jedynym pisarzem, więc zostawione świadomie.
- ~~Martwy scaffold `Desktop/python/sklep-meblowy/` do usunięcia osobnym PR-em~~ —
  **usunięty** (PR #126). Był to nietknięty szablon `create-next-app` z pierwszego
  commita `7908a01`: 19 plików, jeden commit w całej historii, zero odwołań z aplikacji.
  Od teraz `grep -r` po repo nie trafia już w drugą, martwą kopię — nie trzeba ostrzegać
  agentów, żeby ją ignorowali.
- Do zrzutów i e2e w tym repo używać `npm run build` + `npm start`, nie `next dev`: dev
  umierał po każdym pojedynczym teście Playwrighta (port słuchał, nawigacja `ERR_ABORTED`),
  6 min na test; build produkcyjny — 17 s na te same trzy testy.
