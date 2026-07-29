# Dobór materaca do łóżka — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pod produktem-łóżkiem pokazać materace w rozmiarze spania tego łóżka, w przewijanej karuzeli ze strzałkami, zamiast dzisiejszej siatki 4 losowych najnowszych materacy.

**Architecture:** Czysta logika dopasowania rozmiaru w nowym `app/_lib/sleep-size.ts` (bez zależności server-only → testowalna bez mockowania Supabase). Nowa funkcja serwerowa `getSizeMatchedCrossSell` w `app/_lib/products.ts` obok nietkniętej `getCrossSellProducts` (której nadal używa koszyk), z dwustopniowym zapytaniem: wąski scan kandydatów → filtr w JS → `select("*")` tylko dla wybranych ID. Prezentacja w nowym kliencie `ProductCarousel.tsx` na `embla-carousel-react`, opakowującym istniejące `ProductCard` przekazane jako `children` z serwerowej strony produktu.

**Tech Stack:** Next.js 16.2.4 (App Router, React 19.2.4), TypeScript, Tailwind v4, Supabase (PostgREST), embla-carousel-react ^8.6.0, Vitest, Playwright (MCP).

## Global Constraints

- Spec źródłowy: `docs/superpowers/specs/2026-07-29-dobor-materaca-do-lozka-design.md`.
- Branch: `feat/dobor-materaca-do-lozka` (już utworzony, spec zacommitowany).
- Wszystkie ścieżki poniżej są względne do katalogu `sklep-meblowy/` — tam mieszka aplikacja i tam uruchamiamy `npm`.
- `AGENTS.md`: „This is NOT the Next.js you know" — przy wątpliwościach o API Next.js czytać `node_modules/next/dist/docs/`, nie zgadywać z pamięci.
- Komentarze w kodzie i teksty testów po polsku, jak w całym repo. Kod (nazwy) po angielsku.
- Nowy klucz w `pl.ts` **musi** dostać wartość w `de.ts` — `dictionaries.test.ts` sprawdza parytet i wywali się na braku.
- Kanoniczna forma rozmiaru: `"160x200"` (małe `x`, bez spacji, bez `cm`). Wyświetlanie: `"160×200 cm"` (typograficzny `×`).
- `products.dimensions` NIE jest źródłem rozmiaru spania — dla łóżka to wymiar zewnętrzny (łóżko 160x200 ma `dimensions {width:180,depth:210}`).
- `npm run build` przy działającym `next dev` psuje `.next` deva. Build robić po zabiciu procesu na :3000 (patrz notatka „Dev .next stale after build").
- Nie ruszamy: `app/koszyk/actions.ts`, sekcji „Podobne produkty" i „Pełna kolekcja", mechanizmu „Zestawy".

---

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `app/_lib/sleep-size.ts` (nowy) | Czysta logika: rozmiar spania z produktu, formatowanie do wyświetlenia, filtr+sort kandydatów. Zero importów server-only. |
| `app/_lib/__tests__/sleep-size.test.ts` (nowy) | Testy jednostkowe powyższego. |
| `app/_lib/products.ts` (modyfikacja) | Nowy `getSizeMatchedCrossSell` + wydzielony helper `resolveCrossSellTargets`. `getCrossSellProducts` bez zmian w sygnaturze i zachowaniu. |
| `app/_components/ui/ProductCarousel.tsx` (nowy) | Klient: poziomy pasek kart na embli + strzałki. Nie wie nic o materacach — dostaje `children`. |
| `app/_lib/dictionaries/pl.ts`, `de.ts` (modyfikacja) | Nowe klucze: `product.crossSellSizeEyebrow`, `product.crossSellSizeHeading`, `a11y.prevProducts`, `a11y.nextProducts`. |
| `app/produkt/[id]/page.tsx` (modyfikacja) | Wywołanie nowej funkcji danych, wybór kopii nagłówka, render karuzeli w sekcji cross-sell. |
| baza (produkcja, bez migracji) | `categories.cross_sell_categories` dla `lozka-tapicerowane` i `lozka-dzieciece`. |

---

### Task 1: Logika dopasowania rozmiaru (`sleep-size.ts`)

**Files:**
- Create: `app/_lib/sleep-size.ts`
- Test: `app/_lib/__tests__/sleep-size.test.ts`

**Interfaces:**
- Consumes: `effectivePrice` z `app/_lib/pricing.ts:5` (`(regular: number, salePrice: number | null | undefined) => number`).
- Produces:
  - `type SleepSize = string` (kanoniczne `"160x200"`)
  - `sleepSizeOf(item: { size_label?: string | null; name?: string | null }): SleepSize | null`
  - `formatSleepSize(size: SleepSize): string`
  - `type SizeCandidate = { id: string; category: string; name: string; size_label: string | null; price: number; sale_price: number | null }`
  - `pickSizeMatched<T extends SizeCandidate>(candidates: T[], size: SleepSize, categoryOrder: string[]): T[]`

- [ ] **Step 1: Napisz test (ma nie przejść)**

Utwórz `app/_lib/__tests__/sleep-size.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  sleepSizeOf,
  formatSleepSize,
  pickSizeMatched,
  type SizeCandidate,
} from "@/app/_lib/sleep-size";

describe("sleepSizeOf", () => {
  it("bierze size_label i normalizuje zapis", () => {
    expect(sleepSizeOf({ size_label: "160x200", name: "cokolwiek" })).toBe("160x200");
    expect(sleepSizeOf({ size_label: "160 × 200 cm", name: "cokolwiek" })).toBe("160x200");
    expect(sleepSizeOf({ size_label: "160X200", name: "cokolwiek" })).toBe("160x200");
  });

  it("pusty lub whitespace'owy size_label → fallback do nazwy", () => {
    expect(sleepSizeOf({ size_label: "   ", name: "Łóżko dziecięce Mini 90x200 cm" })).toBe("90x200");
    expect(sleepSizeOf({ size_label: null, name: "Łóżko tapicerowane Bali 160x200 ze stelażem" })).toBe("160x200");
  });

  it("śmieciowy size_label → fallback do nazwy, bez wyjątku", () => {
    expect(sleepSizeOf({ size_label: "duże", name: "Łóżko Alice 140x200 cm" })).toBe("140x200");
  });

  it("brak rozmiaru w obu polach → null", () => {
    expect(sleepSizeOf({ size_label: null, name: "Fotel Uszak" })).toBeNull();
    expect(sleepSizeOf({})).toBeNull();
  });

  it("pomija wymiary z opisu przed rozmiarem spania", () => {
    // "H3 25 cm 120x200 cm" — 25 nie łączy się z 120, bo między nimi jest "cm"
    expect(
      sleepSizeOf({ size_label: null, name: "Materac kieszeniowy Lorena Visco H3 25 cm 120x200 cm" })
    ).toBe("120x200");
  });
});

describe("formatSleepSize", () => {
  it("kanoniczne x → typograficzny × z jednostką", () => {
    expect(formatSleepSize("160x200")).toBe("160×200 cm");
  });
});

describe("pickSizeMatched", () => {
  const ORDER = ["materace", "materace-piankowe", "materace-nawierzchniowe"];

  const c = (
    id: string,
    category: string,
    size: string,
    price: number,
    sale: number | null = null
  ): SizeCandidate => ({ id, category, name: `Materac ${id}`, size_label: size, price, sale_price: sale });

  it("zostawia tylko dopasowany rozmiar", () => {
    const out = pickSizeMatched(
      [c("a", "materace", "160x200", 1000), c("b", "materace", "180x200", 1000)],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });

  it("sortuje po kolejności kategorii, dopiero potem po cenie", () => {
    const out = pickSizeMatched(
      [
        c("topper-tanszy", "materace-nawierzchniowe", "160x200", 300),
        c("kieszeniowy-drozszy", "materace", "160x200", 2000),
        c("piankowy", "materace-piankowe", "160x200", 900),
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["kieszeniowy-drozszy", "piankowy", "topper-tanszy"]);
  });

  it("w obrębie kategorii sortuje po cenie efektywnej (promocja się liczy)", () => {
    const out = pickSizeMatched(
      [
        c("regularny-1200", "materace", "160x200", 1200),
        c("przeceniony-z-2000-na-800", "materace", "160x200", 2000, 800),
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["przeceniony-z-2000-na-800", "regularny-1200"]);
  });

  it("remis cenowy rozstrzyga nazwa (sort deterministyczny)", () => {
    const out = pickSizeMatched(
      [
        { ...c("b", "materace", "160x200", 1000), name: "Materac Bali" },
        { ...c("a", "materace", "160x200", 1000), name: "Materac Alice" },
      ],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.name)).toEqual(["Materac Alice", "Materac Bali"]);
  });

  it("kategoria poza categoryOrder idzie na koniec", () => {
    const out = pickSizeMatched(
      [c("obcy", "poduszki", "160x200", 50), c("swoj", "materace", "160x200", 2000)],
      "160x200",
      ORDER
    );
    expect(out.map((p) => p.id)).toEqual(["swoj", "obcy"]);
  });

  it("brak dopasowań → pusta tablica", () => {
    expect(pickSizeMatched([c("a", "materace", "90x200", 500)], "160x200", ORDER)).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const input = [c("b", "materace", "160x200", 2000), c("a", "materace", "160x200", 500)];
    const snapshot = input.map((p) => p.id);
    pickSizeMatched(input, "160x200", ORDER);
    expect(input.map((p) => p.id)).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że pada**

Run: `npx vitest run app/_lib/__tests__/sleep-size.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/sleep-size"`.

- [ ] **Step 3: Napisz implementację**

Utwórz `app/_lib/sleep-size.ts`:

```ts
// Czysta logika doboru materaca do łóżka po rozmiarze spania — bez zależności
// server-only, żeby była testowalna bez mockowania Supabase (wzorzec jak
// size-groups.ts / pricing.ts). Server-owe pobranie kandydatów jest w
// products.ts (getSizeMatchedCrossSell).

import { effectivePrice } from "./pricing";

// Kanoniczna forma rozmiaru spania: "160x200" — małe x, bez spacji, bez "cm".
// Porównania zawsze na tej formie; do wyświetlenia formatSleepSize.
export type SleepSize = string;

// Pierwsza para "liczba x liczba" w tekście. Wymaga sąsiedztwa przez sam
// separator, więc "H3 25 cm 120x200 cm" daje 120x200, a nie 25x120.
const SIZE_RE = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i;

function matchSize(raw: string | null | undefined): SleepSize | null {
  if (!raw) return null;
  const m = SIZE_RE.exec(raw);
  if (!m) return null;
  return `${Number(m[1])}x${Number(m[2])}`;
}

// Rozmiar spania produktu: size_label (znormalizowany), a gdy go nie ma albo
// jest śmieciowy — z nazwy. `dimensions` świadomie pominięte: dla łóżka to
// wymiar zewnętrzny (160x200 → dimensions 180×210), więc dopasowanie po nim
// dawałoby błędne pary.
export function sleepSizeOf(item: {
  size_label?: string | null;
  name?: string | null;
}): SleepSize | null {
  return matchSize(item.size_label) ?? matchSize(item.name);
}

// "160x200" → "160×200 cm" (typograficzny × tylko do wyświetlenia).
export function formatSleepSize(size: SleepSize): string {
  return `${size.replace(/x/i, "×")} cm`;
}

// Minimum, które musi mieć kandydat, żeby dał się dopasować i posortować.
// Generyk w pickSizeMatched pozwala wołać to na pełnym Product albo na wąskim
// wierszu z selecta (id, category, name, size_label, price, sale_price).
export type SizeCandidate = {
  id: string;
  category: string;
  name: string;
  size_label: string | null;
  price: number;
  sale_price: number | null;
};

// Kandydaci w danym rozmiarze, posortowani: kolejność kategorii z
// categoryOrder (czyli cross_sell_categories — realne materace przed
// topperami), potem cena efektywna rosnąco, na koniec nazwa dla determinizmu.
// Kategoria poza categoryOrder trafia na koniec. Nie mutuje wejścia (filter
// tworzy nową tablicę).
export function pickSizeMatched<T extends SizeCandidate>(
  candidates: T[],
  size: SleepSize,
  categoryOrder: string[]
): T[] {
  const rank = new Map(categoryOrder.map((slug, i) => [slug, i]));
  const last = categoryOrder.length;
  return candidates
    .filter((c) => sleepSizeOf(c) === size)
    .sort((a, b) => {
      const ra = rank.get(a.category) ?? last;
      const rb = rank.get(b.category) ?? last;
      if (ra !== rb) return ra - rb;
      const pa = effectivePrice(a.price, a.sale_price);
      const pb = effectivePrice(b.price, b.sale_price);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, "pl", { numeric: true });
    });
}
```

- [ ] **Step 4: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/_lib/__tests__/sleep-size.test.ts`
Expected: PASS, 12 testów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/sleep-size.ts app/_lib/__tests__/sleep-size.test.ts
git commit -m "feat(sklep): logika doboru materaca po rozmiarze spania"
```

---

### Task 2: Warstwa danych (`getSizeMatchedCrossSell`)

**Files:**
- Modify: `app/_lib/products.ts:276-324` (blok cross-sell)

**Interfaces:**
- Consumes: `pickSizeMatched`, `SizeCandidate`, `type SleepSize` z Taska 1; istniejące `createClient` (`app/_lib/supabase/server`), `localizeProduct`, `Locale`, `DEFAULT_LOCALE`, `Product` — wszystkie już zaimportowane w `products.ts`.
- Produces: `getSizeMatchedCrossSell(categorySlug: string, sleepSize: string | null, excludeProductIds?: string[], limit?: number, locale?: Locale): Promise<{ products: Product[]; sizeMatched: boolean }>`.
- Bez zmian (kontrakt zachowany dla `app/koszyk/actions.ts:122`): `getCrossSellProducts(cartCategorySlugs: string[], excludeProductIds?: string[], limit?: number, locale?: Locale): Promise<Product[]>`.

- [ ] **Step 1: Wydziel helper kategorii docelowych**

W `app/_lib/products.ts` zamień ciało `getCrossSellProducts` tak, żeby korzystało ze wspólnego helpera. Nad `getCrossSellProducts` dodaj:

```ts
// Slugi kategorii docelowych cross-sellu dla podanych kategorii źródłowych.
// Kolejność z bazy (cross_sell_categories to text[]) jest znacząca — steruje
// sortem karuzeli w getSizeMatchedCrossSell (realne materace przed topperami).
// Pomija kategorie już obecne w źródle — to byłby same-sell, nie cross-sell.
async function resolveCrossSellTargets(
  sourceCategorySlugs: string[]
): Promise<string[]> {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("slug, cross_sell_categories")
    .in("slug", sourceCategorySlugs);

  const targets: string[] = [];
  for (const c of (cats ?? []) as {
    slug: string;
    cross_sell_categories: string[] | null;
  }[]) {
    for (const s of c.cross_sell_categories ?? []) {
      if (sourceCategorySlugs.includes(s)) continue;
      if (!targets.includes(s)) targets.push(s);
    }
  }
  return targets;
}
```

a w samym `getCrossSellProducts` zastąp blok od `const supabase = await createClient();` do `if (targetSlugs.size === 0) return [];` przez:

```ts
  const targetSlugs = await resolveCrossSellTargets(cartCategorySlugs);
  if (targetSlugs.length === 0) return [];

  const supabase = await createClient();
```

oraz `.in("category", Array.from(targetSlugs))` na `.in("category", targetSlugs)`.

- [ ] **Step 2: Sprawdź, że nic się nie zepsuło typami**

Run: `npx tsc --noEmit`
Expected: brak błędów. (Refaktor jest zachowawczy: ta sama kolejność slugów, ten sam typ zwrotny — koszyk nadal dostaje `Product[]`.)

- [ ] **Step 3: Dopisz `getSizeMatchedCrossSell`**

Dodaj import na górze `app/_lib/products.ts`, obok pozostałych importów z `_lib`:

```ts
import { pickSizeMatched, type SizeCandidate } from "./sleep-size";
```

i nową funkcję zaraz pod `getCrossSellProducts`:

```ts
// Cross-sell dopasowany rozmiarem spania — dla łóżka pokazuje materace w jego
// rozmiarze. Dwa zapytania zamiast jednego świadomie: wiersz produktu niesie
// ciężkie `variants` z listami tkanin, więc select("*") po całych kategoriach
// materacy to megabajty transferu przy każdym renderze, z czego ~90% do
// odrzucenia. Najpierw wąski scan kandydatów, potem pełne wiersze tylko dla
// wybranych ID.
// sizeMatched=false → wołający ma pokazać zwykłą kopię „Polecane …" zamiast
// nagłówka z rozmiarem. Filtr is_active zapewnia RLS (jak w pozostałych
// publicznych zapytaniach).
export async function getSizeMatchedCrossSell(
  categorySlug: string,
  sleepSize: string | null,
  excludeProductIds: string[] = [],
  limit = 12,
  locale: Locale = DEFAULT_LOCALE
): Promise<{ products: Product[]; sizeMatched: boolean }> {
  const targetSlugs = await resolveCrossSellTargets([categorySlug]);
  if (targetSlugs.length === 0) return { products: [], sizeMatched: false };

  if (sleepSize) {
    const supabase = await createClient();
    const { data: candidates } = await supabase
      .from("products")
      .select("id, category, name, size_label, price, sale_price")
      .in("category", targetSlugs);

    const ids = pickSizeMatched(
      (candidates ?? []) as SizeCandidate[],
      sleepSize,
      targetSlugs
    )
      .filter((p) => !excludeProductIds.includes(p.id))
      .slice(0, limit)
      .map((p) => p.id);

    if (ids.length > 0) {
      const { data: full } = await supabase.from("products").select("*").in("id", ids);
      // `in` nie gwarantuje kolejności — odtwarzamy sort z pickSizeMatched.
      const byId = new Map(((full ?? []) as Product[]).map((p) => [p.id, p]));
      const products = ids
        .map((id) => byId.get(id))
        .filter((p): p is Product => p !== undefined)
        .map((p) => localizeProduct(p, locale));
      return { products, sizeMatched: true };
    }
  }

  // Brak rozmiaru albo zero dopasowań → dotychczasowe zachowanie, żeby sekcja
  // nie zniknęła: 4 najnowsze produkty z kategorii docelowych.
  const products = await getCrossSellProducts([categorySlug], excludeProductIds, 4, locale);
  return { products, sizeMatched: false };
}
```

- [ ] **Step 4: Typecheck i lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: brak błędów, brak ostrzeżeń w `products.ts`.

- [ ] **Step 5: Zweryfikuj zapytanie na prawdziwych danych**

Ta funkcja dotyka Supabase, a repo nie mockuje bazy w testach jednostkowych (brak takiego wzorca w `app/_lib/__tests__/`), więc weryfikacja idzie przez odpowiednik SQL przez MCP Supabase:

```sql
select p.category, p.name, p.size_label,
       least(p.sale_price, p.price) as cena_efektywna
from products p
where p.category in ('materace-nawierzchniowe','materace-piankowe')
  and p.is_active
  and p.size_label = '160x200'
order by array_position(array['materace-nawierzchniowe','materace-piankowe'], p.category),
         least(p.sale_price, p.price), p.name;
```

Expected: 7 wierszy (5 nawierzchniowych + 2 piankowe) — tyle materacy 160x200 widzi dziś łóżko tapicerowane przy obecnej konfiguracji kategorii. Po Tasku 5 ta sama sprawdzka z `materace` w tablicy da 12. Zapisz liczbę — Task 4 porówna ją z tym, co realnie wyrenderuje strona.

- [ ] **Step 6: Commit**

```bash
git add app/_lib/products.ts
git commit -m "feat(sklep): pobieranie materacy dopasowanych rozmiarem do lozka"
```

---

### Task 3: Komponent karuzeli (`ProductCarousel.tsx`)

**Files:**
- Create: `app/_components/ui/ProductCarousel.tsx`
- Modify: `app/_lib/dictionaries/pl.ts` (typ `PlShape` sekcja `a11y` ~linia 261 + wartości sekcja `a11y` ~linia 614)
- Modify: `app/_lib/dictionaries/de.ts` (sekcja `a11y` ~linia 270)

**Interfaces:**
- Consumes: `useClientLocale` (`app/_lib/useClientLocale`), `getDictionary` (`app/_lib/dictionaries`), `useEmblaCarousel` z `embla-carousel-react` — wzorzec dokładnie jak `app/_components/layout/HomeHeroSlider.tsx:6,43,44`.
- Produces: default export `ProductCarousel({ children }: { children: ReactNode })`. Każde dziecko jest opakowywane w slajd — wołający przekazuje gotowe `<ProductCard>`y jako `children`, komponent nie wie nic o produktach.

- [ ] **Step 1: Dodaj klucze a11y do słowników**

W `app/_lib/dictionaries/pl.ts`, w **typie** `PlShape`, w sekcji `a11y` (po `nextSlide: string;`):

```ts
    prevProducts: string;
    nextProducts: string;
```

W tym samym pliku, w **wartościach** `a11y` (po `nextSlide: "Następny slajd",`):

```ts
    prevProducts: "Poprzednie produkty",
    nextProducts: "Następne produkty",
```

W `app/_lib/dictionaries/de.ts`, w sekcji `a11y` (po `nextSlide: "Nächster Slide",`):

```ts
    prevProducts: "Vorherige Produkte",
    nextProducts: "Nächste Produkte",
```

- [ ] **Step 2: Uruchom test parytetu słownika**

Run: `npx vitest run app/_lib/__tests__/dictionaries.test.ts`
Expected: PASS (gdyby brakowało klucza DE, test „każdy klucz UI po polsku ma niepuste tłumaczenie DE" zwróciłby go na liście `missing`).

- [ ] **Step 3: Napisz komponent**

Utwórz `app/_components/ui/ProductCarousel.tsx`:

```tsx
"use client";

import { Children, useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

// Poziomy pasek kart produktów ze strzałkami. Agnostyczny wobec treści —
// dostaje gotowe karty jako children (serwerowe <ProductCard> renderują się
// wewnątrz klienta bez problemu) i tylko owija każde dziecko w slajd.
// Mechanika na embla-carousel (już w zależnościach, patrz HomeHeroSlider):
// przeciąganie na mobile i gotowe canScrollPrev/Next zamiast własnych
// listenerów scrolla.
export default function ProductCarousel({ children }: { children: ReactNode }) {
  const t = getDictionary(useClientLocale());
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    slidesToScroll: "auto",
    containScroll: "trimSnaps",
  });

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    // reInit — karty z Next/Image zmieniają wysokość po doczytaniu zdjęć,
    // wtedy embla przelicza snapy i stan strzałek musi za tym nadążyć.
    const sync = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    sync();
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  const arrowCls =
    "hidden sm:flex absolute top-1/3 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] hover:border-transparent disabled:opacity-0 disabled:pointer-events-none transition-all z-10 shadow-sm";

  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex gap-8">
          {Children.map(children, (child, i) => (
            <div
              key={i}
              className="min-w-0 shrink-0 basis-[78%] sm:basis-[calc(50%-1rem)] lg:basis-[calc(25%-1.5rem)]"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        disabled={!canPrev}
        aria-label={t.a11y.prevProducts}
        className={`${arrowCls} -left-3 lg:-left-5`}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={scrollNext}
        disabled={!canNext}
        aria-label={t.a11y.nextProducts}
        className={`${arrowCls} -right-3 lg:-right-5`}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
```

Uwaga do `basis`: `gap-8` to 2rem, więc 4 karty w rzędzie = `25% - 1.5rem`, 2 karty = `50% - 1rem`. `top-1/3` bo karta to zdjęcie 4:3 + tekst pod nim — środek całej karty wypada pod zdjęciem, na tekście.

- [ ] **Step 4: Typecheck i lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: brak błędów. (`Children.map` z indeksem jako `key` jest tu poprawne — kolejność dzieci jest stabilna w obrębie renderu, a stabilne `key` produktu jest już na `<ProductCard>` u wołającego.)

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/ProductCarousel.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(sklep): karuzela kart produktow ze strzalkami"
```

---

### Task 4: Wpięcie w stronę produktu

**Files:**
- Modify: `app/produkt/[id]/page.tsx` (importy ~1-43, `Promise.all` ~103-118, sekcja cross-sell 341-360)
- Modify: `app/_lib/dictionaries/pl.ts` (typ `product` ~linia 62-64 + wartości ~linia 411-413)
- Modify: `app/_lib/dictionaries/de.ts` (sekcja `product` ~linia 68-70)

**Interfaces:**
- Consumes: `getSizeMatchedCrossSell` (Task 2), `sleepSizeOf` + `formatSleepSize` (Task 1), `ProductCarousel` (Task 3).
- Produces: nic dla dalszych tasków (to liść).

- [ ] **Step 1: Dodaj klucze nagłówka do słowników**

W `app/_lib/dictionaries/pl.ts`, w **typie** `PlShape` → `product`, po `crossSellFallbackHeading: string;`:

```ts
    crossSellSizeEyebrow: string;
    crossSellSizeHeading: string;
```

W **wartościach** `product`, po `crossSellFallbackHeading: "Może Cię zainteresować",`:

```ts
    crossSellSizeEyebrow: "Dobierz materac",
    crossSellSizeHeading: "Materace w rozmiarze",
```

W `app/_lib/dictionaries/de.ts`, w sekcji `product`, po `crossSellFallbackHeading: "Das könnte Sie interessieren",`:

```ts
    crossSellSizeEyebrow: "Passende Matratze",
    crossSellSizeHeading: "Matratzen in Größe",
```

Rozmiar doklei się w JSX (`${...crossSellSizeHeading} ${formatSleepSize(size)}`) — słownik w tym repo nie używa interpolacji `{placeholder}`, por. `crossSellRecommendedPrefix` w `page.tsx:349`.

- [ ] **Step 2: Podmień pobieranie danych**

W `app/produkt/[id]/page.tsx` w importach zamień

```ts
  getCrossSellProducts,
```

na

```ts
  getSizeMatchedCrossSell,
```

i dodaj dwie linie importów (obok pozostałych z `_lib`):

```ts
import { sleepSizeOf, formatSleepSize } from "@/app/_lib/sleep-size";
import ProductCarousel from "@/app/_components/ui/ProductCarousel";
```

Nad `Promise.all` (przed `const [sizeSiblings, ...]`) dodaj:

```ts
  // Rozmiar spania łóżka ("160x200") — klucz doboru materacy. null dla mebli
  // bez rozmiaru (sofy, fotele) → cross-sell leci starą ścieżką.
  const sleepSize = sleepSizeOf(product);
```

W samym `Promise.all` zamień element

```ts
      getCrossSellProducts([product.category], [product.id], 4, locale),
```

na

```ts
      getSizeMatchedCrossSell(product.category, sleepSize, [product.id], 12, locale),
```

- [ ] **Step 3: Przepisz sekcję cross-sell na karuzelę**

Zamień cały blok `{crossSell.length > 0 && ( … )}` (`page.tsx:341-360`) na:

```tsx
      {/* Cross-sell — dla łóżka materace w JEGO rozmiarze spania, w karuzeli.
          Gdy produkt nie ma rozmiaru albo nic nie pasuje (sizeMatched=false)
          → stara kopia i 4 najnowsze z kategorii docelowych. */}
      {crossSell.products.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {crossSell.sizeMatched
                ? t.product.crossSellSizeEyebrow
                : t.product.crossSellEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {crossSell.sizeMatched && sleepSize
                ? `${t.product.crossSellSizeHeading} ${formatSleepSize(sleepSize)}`
                : crossSellLabel
                  ? `${t.product.crossSellRecommendedPrefix} ${crossSellLabel.toLowerCase()}`
                  : t.product.crossSellFallbackHeading}
            </h2>
          </div>
          <ProductCarousel>
            {crossSell.products.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
            ))}
          </ProductCarousel>
        </section>
      )}
```

- [ ] **Step 4: Typecheck, lint, testy**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: brak błędów, wszystkie testy PASS (w tym parytet słownika).

- [ ] **Step 5: Build**

Najpierw upewnij się, że nie działa `next dev` (build przy żywym devie psuje jego `.next`):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
npm run build
```

Expected: `Compiled successfully`, bez błędów typów i bez ostrzeżeń o brakującym module.

- [ ] **Step 6: Weryfikacja wizualna w przeglądarce**

```powershell
npm run dev
```

Potem przez Playwright MCP:
1. `browser_navigate` → `http://localhost:3000/produkt/a20cc236-1025-48e8-907b-0fbb10991396`
   („Łóżko tapicerowane Alice 160x200 ze stelażem i miękkim zagłówkiem" — `size_label` = `160x200`).
2. `browser_snapshot` — sprawdź, że nagłówek sekcji brzmi „Materace w rozmiarze 160×200 cm", eyebrow „Dobierz materac".
3. Policz karty w karuzeli i porównaj z liczbą z Taska 2 Step 5 (przed zmianą danych: **7**). Każda nazwa karty musi zawierać `160x200` — żadnego innego rozmiaru.
4. `browser_click` na strzałkę „Następne produkty", potem `browser_take_screenshot` — pasek się przesunął, lewa strzałka zrobiła się aktywna.
5. Doklikaj do końca listy — prawa strzałka znika (`disabled:opacity-0`).
6. `browser_resize` do 390×844 (mobile) + `browser_take_screenshot` — strzałek nie ma, karta zajmuje ~78% szerokości, następna wystaje z prawej.
7. Kontrola ścieżki fallback: `browser_navigate` na dowolny produkt bez rozmiaru (np. fotel z `fotele-tapicerowane`) — sekcji cross-sell nie ma wcale (ta kategoria ma puste `cross_sell_categories`), więc strona wygląda jak dziś. To potwierdza, że nie wysypaliśmy renderu przy `sleepSize === null`.

Zrzuty zapisz w scratchpadzie sesji, nie w repo.

- [ ] **Step 7: Commit**

```bash
git add app/produkt/[id]/page.tsx app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(sklep): karuzela materacy dopasowanych rozmiarem pod lozkiem"
```

---

### Task 5: Zmiana konfiguracji kategorii na produkcji

**Files:**
- Modify: dane w tabeli `categories` (bez migracji — to zawartość, nie schema)

**Interfaces:**
- Consumes: działający kod z Tasków 1-4 (kolejność ma znaczenie — patrz uzasadnienie niżej).
- Produces: nic w kodzie.

Dlaczego po kodzie, a nie przed: dodanie `materace` do listy przed wdrożeniem zmieniłoby dzisiejszy nagłówek na „Polecane materace kieszeniowe" (bierze etykietę **pierwszej** kategorii z listy) nad wciąż niedopasowaną siatką.

- [ ] **Step 1: Zapisz stan przed zmianą**

```sql
select slug, cross_sell_categories from categories
where slug in ('lozka-tapicerowane','lozka-dzieciece','lozko-kontynentalne');
```

Expected (stan na 2026-07-29): tapicerowane i dziecięce `["materace-nawierzchniowe","materace-piankowe"]`, kontynentalne `["materace-nawierzchniowe"]`. Zapisz wynik — to punkt powrotu.

- [ ] **Step 2: Ustaw nową kolejność kategorii**

Kolejność w tablicy steruje sortem karuzeli, więc realne materace idą pierwsze:

```sql
update categories
set cross_sell_categories = array['materace','materace-piankowe','materace-nawierzchniowe']
where slug in ('lozka-tapicerowane','lozka-dzieciece');
```

`lozko-kontynentalne` **zostaje bez zmian** — te łóżka mają materac w komplecie, sensowny dokup to topper.

- [ ] **Step 3: Zweryfikuj zmianę w bazie**

```sql
select slug, cross_sell_categories from categories
where slug in ('lozka-tapicerowane','lozka-dzieciece','lozko-kontynentalne');
```

Expected: dwie pierwsze mają trzy pozycje w podanej kolejności, kontynentalne nadal jedną.

- [ ] **Step 4: Zweryfikuj efekt na stronie**

Przez Playwright MCP na `http://localhost:3000/produkt/a20cc236-1025-48e8-907b-0fbb10991396`:
- kart w karuzeli jest teraz **12** (5 kieszeniowych + 2 piankowe + 5 nawierzchniowych w 160x200),
- pierwsze karty to materace kieszeniowe, toppery (nawierzchniowe) na końcu,
- każda nazwa zawiera `160x200`.

Dodatkowo łóżko kontynentalne (`lozko-kontynentalne`, np. „Łóżko kontynentalne Vasto 2 … 160x200") → nadal tylko 5 nawierzchniowych.

- [ ] **Step 5: Push i PR**

```bash
git push -u origin feat/dobor-materaca-do-lozka
gh pr create --title "feat(sklep): dobor materaca do lozka w karuzeli" --body "..."
```

Uwaga operacyjna: push tego repo wymaga konta `Woodecky10` (konto domyślne dostaje 403). Deploy = merge PR do `main` (Vercel bierze `main`). Zmiana z Kroku 2 jest już na produkcyjnej bazie, więc po merge'u wchodzi w życie od razu.

---

## Self-review (spec ↔ plan)

**Pokrycie specu:**
- Dopasowanie rozmiaru (`sleepSizeOf`, `formatSleepSize`, `pickSizeMatched`, brak `dimensions` jako źródła) → Task 1.
- Warstwa danych (`resolveCrossSellTargets`, `getSizeMatchedCrossSell`, dwustopniowe zapytanie, fallback, limity 12/4, koszyk nietknięty) → Task 2.
- Karuzela (embla, szerokości kart, strzałki z `canScroll*`, ukryte na mobile, `aria-label` z `a11y`) → Task 3.
- Nagłówek i i18n (nowe klucze PL+DE, dwie ścieżki kopii) → Task 4 Step 1 i 3.
- Zmiana `cross_sell_categories` po wdrożeniu kodu → Task 5.
- Testy i weryfikacja (vitest, lint, build, Playwright) → Task 1 Step 4, Task 4 Step 4-6, Task 5 Step 4.
- Poza zakresem (koszyk, add-to-cart z karuzeli, nadpisywanie per produkt, pozostałe siatki, rabat) → nie ma na to zadań. Zgodnie z zamysłem.

**Spójność typów:** `SizeCandidate` z Taska 1 jest konsumowany w Tasku 2 pod tą samą nazwą; `Product` ma wszystkie pola `SizeCandidate` (`id`, `category`, `name`, `size_label`, `price`, `sale_price` — `types.ts:105-130`), więc `pickSizeMatched` działa i na wąskim selekcie, i na pełnym produkcie. `getSizeMatchedCrossSell` zwraca `{ products, sizeMatched }` i dokładnie tak jest odczytywane w Tasku 4 (`crossSell.products`, `crossSell.sizeMatched`). `ProductCarousel` przyjmuje wyłącznie `children` — Task 4 nie przekazuje mu żadnych innych propsów.
