# Tkaniny — zwijane sekcje grup cenowych: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na `/tkaniny` trzy sekcje grup cenowych startują zwinięte, z podglądem pięciu miniatur w nagłówku, i rozwijają się niezależnie po kliknięciu.

**Architecture:** Natywne `<details>/<summary>`, wszystko serwerowo, zero JavaScriptu — ten wzorzec jest już w repo (`app/sklep/CollectionIntro.tsx`). Siatka kafelków zostaje w HTML także w stanie zwiniętym, więc linki do `/tkaniny/[slug]` nie wypadają ze źródła strony. Sekcja grupy wyjeżdża z `page.tsx` do własnego komponentu, a funkcje od liczby mnogiej do testowalnego modułu w `_lib`.

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, Tailwind (warianty `group-open:`), vitest (testy jednostkowe), Playwright (e2e).

**Spec:** `sklep-meblowy/docs/superpowers/specs/2026-07-30-tkaniny-grupy-rozwijanie-design.md`

## Global Constraints

- Wszystkie ścieżki i komendy względem katalogu **`sklep-meblowy/`** (aplikacja jest w zagnieżdżonym podfolderze).
- **To NIE jest Next.js z treningu** — wersja 16 ma breaking changes. Przed pisaniem kodu Server Component/Action sprawdź `node_modules/next/dist/docs/` (patrz `AGENTS.md`).
- **Zero nowych zależności.** W szczególności nie dokładamy `@testing-library` ani `jsdom` — projekt nie ma testów renderu komponentów i tej zmiany to nie uzasadnia.
- Komponenty na tej stronie zostają **serwerowe**. Żadnego `"use client"`.
- Bramki przed każdym commitem: `npx tsc --noEmit` = 0 błędów, `npm run lint` = 0 błędów (4 znane warningi w `fabrics.test.ts`, `bundles-server.ts`, `variants.ts` — nie ruszać), `npm test` = wszystkie zielone (przed startem: 856 testów w 70 plikach).
- Storefront jest dwujęzyczny: każdy nowy tekst wchodzi do `app/_lib/dictionaries/pl.ts` **i** `de.ts`. Panel admina jest PL-only i ta zmiana go nie dotyczy.
- **Komunikaty commitów: po polsku, bez znaków diakrytycznych** (konwencja repo).
- Push wyłącznie jako konto **Woodecky10**, przez PR do `main` (patrz `ONBOARDING.md` → „Push do origin"). Nie pushować bezpośrednio na `main`.
- Gałąź robocza: `feat/tkaniny-zwijane-grupy` (już utworzona, spec na niej zacommitowany).

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `app/_lib/fabric-labels.ts` | **nowy.** Polska liczba mnoga dla etykiet tkanin i kolorów. Czyste funkcje, zero zależności od Reacta — dlatego testowalne vitestem. |
| `app/_lib/__tests__/fabric-labels.test.ts` | **nowy.** Testy jednostkowe obu etykiet, PL i DE. |
| `app/_lib/dictionaries/pl.ts` | **modyfikacja.** Trzy klucze `fabricsOne/Few/Many` — w bloku typu i w wartościach. |
| `app/_lib/dictionaries/de.ts` | **modyfikacja.** Te same trzy klucze, wartości niemieckie. |
| `app/tkaniny/FabricGroupSection.tsx` | **nowy.** Jedna zwijana sekcja grupy: `<details>` + nagłówek w `<summary>` + siatka kafelków. Przejmuje z `page.tsx` cały markup kafelka i `fabricThumb`. |
| `app/tkaniny/page.tsx` | **modyfikacja.** Zostaje pobieranie danych, metadane i nagłówek strony; renderowanie sekcji przechodzi do komponentu. Ubywa `colorsLabel` i `fabricThumb`. |
| `e2e/tkaniny-grupy.spec.ts` | **nowy.** Guard w DOM: sekcje startują zwinięte, wszystkie linki tkanin są w HTML, klik rozwija tylko swoją sekcję i chowa podgląd. |

---

### Task 1: Moduł etykiet liczby mnogiej + klucze słownika

Fundament pod nagłówek grupy. `page.tsx` ma dziś funkcję `colorsLabel` zaszytą w środku pliku, nieeksportowaną i nieprzetestowaną — przenosimy ją do `_lib` razem z nową `fabricsLabel` i obie obejmujemy testami.

**Files:**
- Create: `app/_lib/fabric-labels.ts`
- Create: `app/_lib/__tests__/fabric-labels.test.ts`
- Modify: `app/_lib/dictionaries/pl.ts` (blok typu `fabrics` przy linii ~99 i blok wartości przy linii ~457)
- Modify: `app/_lib/dictionaries/de.ts` (blok wartości `fabrics` przy linii ~108)

**Interfaces:**
- Consumes: `getDictionary` z `app/_lib/dictionaries`, klucze `t.fabrics.colorsOne/colorsFew/colorsMany` (istnieją).
- Produces: `colorsLabel(n: number, t: Dict): string` i `fabricsLabel(n: number, t: Dict): string`, gdzie `Dict = ReturnType<typeof getDictionary>`. Task 2 używa obu.

- [ ] **Step 1: Dopisz klucze do bloku typu w `pl.ts`**

W deklaracji typu, w bloku `fabrics`, bezpośrednio po `colorsMany: string;` (linia ~99):

```ts
    fabricsOne: string;
    fabricsFew: string;
    fabricsMany: string;
```

- [ ] **Step 2: Dopisz wartości polskie w `pl.ts`**

W obiekcie wartości, w bloku `fabrics`, bezpośrednio po `colorsMany: "kolorów",` (linia ~457):

```ts
    fabricsOne: "tkanina",
    fabricsFew: "tkaniny",
    fabricsMany: "tkanin",
```

- [ ] **Step 3: Dopisz wartości niemieckie w `de.ts`**

W bloku `fabrics`, bezpośrednio po `colorsMany: "Farben",` (linia ~108):

```ts
    fabricsOne: "Stoff",
    fabricsFew: "Stoffe",
    fabricsMany: "Stoffe",
```

Niemiecki nie ma polskiego rozróżnienia 2–4 / 5+, więc `fabricsFew` i `fabricsMany` mają tę samą wartość — dokładnie jak istniejące `colorsFew`/`colorsMany` w tym pliku.

- [ ] **Step 4: Napisz test (jeszcze bez implementacji)**

Utwórz `app/_lib/__tests__/fabric-labels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getDictionary } from "../dictionaries";
import { colorsLabel, fabricsLabel } from "../fabric-labels";

const pl = getDictionary("pl");
const de = getDictionary("de");

describe("fabricsLabel — polska odmiana", () => {
  it("1 → tkanina", () => {
    expect(fabricsLabel(1, pl)).toBe("tkanina");
  });

  it("2-4 → tkaniny", () => {
    expect(fabricsLabel(2, pl)).toBe("tkaniny");
    expect(fabricsLabel(3, pl)).toBe("tkaniny");
    expect(fabricsLabel(4, pl)).toBe("tkaniny");
  });

  it("5 i wiecej → tkanin", () => {
    expect(fabricsLabel(5, pl)).toBe("tkanin");
    expect(fabricsLabel(11, pl)).toBe("tkanin");
    expect(fabricsLabel(25, pl)).toBe("tkanin");
  });

  it("12-14 → tkanin, mimo koncowki 2-4", () => {
    expect(fabricsLabel(12, pl)).toBe("tkanin");
    expect(fabricsLabel(13, pl)).toBe("tkanin");
    expect(fabricsLabel(14, pl)).toBe("tkanin");
  });

  it("22 → tkaniny, bo koncowka 2 poza zakresem 12-14", () => {
    expect(fabricsLabel(22, pl)).toBe("tkaniny");
  });

  it("0 → tkanin", () => {
    expect(fabricsLabel(0, pl)).toBe("tkanin");
  });
});

describe("colorsLabel — polska odmiana", () => {
  it("1 → kolor", () => {
    expect(colorsLabel(1, pl)).toBe("kolor");
  });

  it("2-4 → kolory", () => {
    expect(colorsLabel(3, pl)).toBe("kolory");
  });

  it("5 i wiecej → kolorow", () => {
    expect(colorsLabel(7, pl)).toBe("kolorów");
  });

  it("13 → kolorow, nie kolory", () => {
    expect(colorsLabel(13, pl)).toBe("kolorów");
  });
});

describe("DE — brak rozroznienia few/many", () => {
  it("tkaniny: 1 → Stoff, 2 i 7 → Stoffe", () => {
    expect(fabricsLabel(1, de)).toBe("Stoff");
    expect(fabricsLabel(2, de)).toBe("Stoffe");
    expect(fabricsLabel(7, de)).toBe("Stoffe");
  });

  it("kolory: 1 → Farbe, 2 i 7 → Farben", () => {
    expect(colorsLabel(1, de)).toBe("Farbe");
    expect(colorsLabel(2, de)).toBe("Farben");
    expect(colorsLabel(7, de)).toBe("Farben");
  });
});
```

- [ ] **Step 5: Uruchom test i potwierdź, że pada**

Run: `npx vitest run app/_lib/__tests__/fabric-labels.test.ts`

Expected: FAIL — `Failed to resolve import "../fabric-labels"` (plik jeszcze nie istnieje).

- [ ] **Step 6: Napisz implementację**

Utwórz `app/_lib/fabric-labels.ts`:

```ts
import { getDictionary } from "./dictionaries";

type Dict = ReturnType<typeof getDictionary>;

// Polska liczba mnoga: 1 → "one", 2-4 → "few", 5+ → "many". Wyjątek 12-14
// dostaje "many", mimo końcówki 2-4 ("13 tkanin", nie "13 tkaniny").
//
// Wydzielone z app/tkaniny/page.tsx: funkcja siedziała tam jako lokalna i
// nieprzetestowana, a od 2026-07-30 potrzebuje jej też nagłówek zwijanej sekcji
// grupy (licznik "5 tkanin"). Czysta funkcja bez Reacta → da się przetestować
// vitestem, którego projekt używa do wszystkiego w _lib.
function pluralPl(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
  return many;
}

export function colorsLabel(n: number, t: Dict): string {
  return pluralPl(n, t.fabrics.colorsOne, t.fabrics.colorsFew, t.fabrics.colorsMany);
}

export function fabricsLabel(n: number, t: Dict): string {
  return pluralPl(n, t.fabrics.fabricsOne, t.fabrics.fabricsFew, t.fabrics.fabricsMany);
}
```

- [ ] **Step 7: Uruchom test i potwierdź, że przechodzi**

Run: `npx vitest run app/_lib/__tests__/fabric-labels.test.ts`

Expected: PASS — 5 bloków `describe`, wszystkie zielone.

- [ ] **Step 8: Bramki**

Run: `npx tsc --noEmit` → 0 błędów
Run: `npm run lint` → 0 błędów (4 znane warningi zostają)
Run: `npm test` → wszystkie zielone, liczba testów wzrosła o nowy plik

- [ ] **Step 9: Commit**

```bash
git add app/_lib/fabric-labels.ts app/_lib/__tests__/fabric-labels.test.ts app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(tkaniny): modul etykiet liczby mnogiej + klucze slownika

colorsLabel przeniesiony z app/tkaniny/page.tsx (byl lokalny i bez testu),
dochodzi fabricsLabel do licznika tkanin w nagloweku grupy. Trzy nowe klucze
w bloku fabrics slownika PL i DE."
```

---

### Task 2: Zwijana sekcja grupy + przełączenie strony

Sedno zmiany. Test najpierw — e2e, bo projekt nie ma testów renderu komponentów, a to jest zachowanie w DOM.

**Files:**
- Create: `e2e/tkaniny-grupy.spec.ts`
- Create: `app/tkaniny/FabricGroupSection.tsx`
- Modify: `app/tkaniny/page.tsx` (całe ciało `TkaninyPage`, linie 29–114: usunięcie `colorsLabel` i `fabricThumb`, zamiana sekcji na komponent)

**Interfaces:**
- Consumes: `colorsLabel`, `fabricsLabel` z `app/_lib/fabric-labels` (Task 1); `Fabric`, `FabricPriceGroup` z `app/_lib/types`; `Locale` z `app/_lib/i18n`; `formatMoney(amount, locale, rate)`; `pickLocalized(pl, de, locale)`; `getDictionary(locale)`; `LocalizedLink`.
- Produces: `FabricGroupSection` — domyślny eksport, props `{ group: FabricPriceGroup; items: Fabric[]; locale: Locale; rate: number }`. Atrybuty `data-testid`: `fabric-group` (na `<details>`), `fabric-group-count` (licznik), `fabric-group-preview` (rządek miniatur) — na nich stoi e2e.

- [ ] **Step 1: Napisz test e2e (jeszcze bez implementacji)**

Utwórz `e2e/tkaniny-grupy.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Zwijane sekcje grup cenowych na /tkaniny (spec 2026-07-30).
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl), a bez
// --no-deps odpali projekt "setup" (auth.setup.ts), ktory loguje admina —
// niepotrzebny tutaj, bo /tkaniny jest publiczne.

const GROUP = "[data-testid='fabric-group']";

test("sekcje startuja zwiniete, a linki tkanin zostaja w HTML", async ({ page }) => {
  await page.goto("/tkaniny");

  // Sa sekcje grup (na produkcji trzy: Standard, Premium, Premium High).
  const groups = page.locator(GROUP);
  await expect(groups.first()).toBeVisible();
  const groupCount = await groups.count();
  expect(groupCount).toBeGreaterThan(0);

  // Zadna nie jest otwarta po wejsciu.
  await expect(page.locator(`${GROUP}[open]`)).toHaveCount(0);

  // Guard SEO: kafelki musza zostac w HTML nawet zwiniete, inaczej linki do
  // podstron tkanin wypadaja ze zrodla strony. Oczekiwana liczba linkow =
  // suma licznikow z naglowkow, wiec test nie ma zaszytej liczby tkanin.
  const counters = await page.locator("[data-testid='fabric-group-count']").allInnerTexts();
  expect(counters).toHaveLength(groupCount);
  const expectedLinks = counters.reduce(
    (sum, txt) => sum + Number(txt.match(/\d+/)?.[0] ?? 0),
    0
  );
  expect(expectedLinks).toBeGreaterThan(0);
  await expect(page.locator('a[href^="/tkaniny/"]')).toHaveCount(expectedLinks);
});

test("klik w naglowek rozwija tylko swoja sekcje i chowa podglad", async ({ page }) => {
  await page.goto("/tkaniny");

  const first = page.locator(GROUP).first();
  await expect(first.locator("[data-testid='fabric-group-preview']")).toBeVisible();

  await first.locator("summary").click();

  // Rozwinela sie dokladnie jedna sekcja — <details> bez atrybutu name nie
  // tworzy akordeonu, ale to tez guard na wypadek dodania go w przyszlosci.
  await expect(first).toHaveAttribute("open", "");
  await expect(page.locator(`${GROUP}[open]`)).toHaveCount(1);

  // Podglad miniatur znika po rozwinieciu (dublowalby pierwsze kafelki).
  await expect(first.locator("[data-testid='fabric-group-preview']")).toBeHidden();

  // Kafelki sa teraz widoczne.
  await expect(first.locator('a[href^="/tkaniny/"]').first()).toBeVisible();
});
```

- [ ] **Step 2: Uruchom e2e i potwierdź, że pada**

Wystartuj serwer dev w osobnym terminalu: `npm run dev`

Run (PowerShell):
```
$env:E2E_BASE_URL="http://localhost:3000"; npx playwright test e2e/tkaniny-grupy.spec.ts --project=chromium --no-deps
```

Expected: FAIL — oba testy nie znajdują `[data-testid='fabric-group']` (strona renderuje dziś `<section>` bez `<details>`).

- [ ] **Step 3: Napisz komponent sekcji**

Utwórz `app/tkaniny/FabricGroupSection.tsx`:

```tsx
import { pickLocalized, type Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { colorsLabel, fabricsLabel } from "@/app/_lib/fabric-labels";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Fabric, FabricPriceGroup } from "@/app/_lib/types";

// Jedna zwijana sekcja grupy cenowej na /tkaniny.
//
// Serwerowo, ZERO JavaScriptu — rozwijanie stoi na natywnym <details>, tak jak
// w app/sklep/CollectionIntro.tsx. Dlaczego tak, a nie komponent kliencki:
// - kafelki zostaja w HTML takze zwiniete, wiec wszystkie linki do
//   /tkaniny/[slug] sa w zrodle strony (linkowanie wewnetrzne dla Google),
// - <summary> daje obsluge klawiatury i role dla czytnikow ekranu bez naszego
//   kodu (Enter/Space, focus),
// - <details> BEZ atrybutu `name` nie tworzy akordeonu, czyli sekcje sa
//   niezalezne i klient moze miec otwarte wszystkie naraz — ustalenie z
//   2026-07-30. Nie dodawac `name`, bo to zmieni zachowanie na akordeon.
//
// Cena za brak JS: nie ma plynnej animacji rozsuwania. Swiadomie akceptowane.

// Ile probek pokazujemy w zwinietym nagloweku.
const PREVIEW_COUNT = 5;

// Pierwsze zdjecie sposrod kolorow tkaniny (kolory bez zdjecia pomijamy).
function fabricThumb(f: Fabric): string | undefined {
  return (f.colors ?? []).map((c) => f.color_images?.[c]).find(Boolean);
}

export default function FabricGroupSection({
  group,
  items,
  locale,
  rate,
}: {
  group: FabricPriceGroup;
  items: Fabric[];
  locale: Locale;
  rate: number;
}) {
  const t = getDictionary(locale);
  const groupName = pickLocalized(group.name, group.name_de, locale);
  const surchargeLabel =
    group.surcharge > 0
      ? `+${formatMoney(group.surcharge, locale, rate)}`
      : t.fabrics.groupNoSurcharge;

  return (
    <details
      data-testid="fabric-group"
      className="group mb-6 border-b border-[var(--border)] pb-6"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-2xl font-bold text-[var(--fg)]">{groupName}</h2>
        <span className="font-sans text-sm font-semibold text-[var(--color-gold-text)]">
          {surchargeLabel}
        </span>
        <span data-testid="fabric-group-count" className="font-sans text-sm text-[var(--muted)]">
          {items.length} {fabricsLabel(items.length, t)}
        </span>

        {/* Podglad probek — TYLKO w stanie zwinietym. Po rozwinieciu dublowalby
            pierwsze kafelki siatki, dlatego group-open:hidden. aria-hidden, bo
            to dekoracja: te same tkaniny sa nizej jako linki z nazwami. */}
        <span
          data-testid="fabric-group-preview"
          aria-hidden="true"
          className="ml-auto flex items-center gap-1.5 group-open:hidden"
        >
          {items.slice(0, PREVIEW_COUNT).map((f) => {
            const thumb = fabricThumb(f);
            return (
              <span
                key={f.id}
                className="block h-10 w-10 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                    {f.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
            );
          })}
        </span>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((f) => {
          const thumb = fabricThumb(f);
          const n = (f.colors ?? []).length;
          return (
            <LocalizedLink
              key={f.id}
              href={`/tkaniny/${f.slug}`}
              className="group/tile flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 transition-colors hover:border-[var(--color-gold)]"
            >
              <span className="relative block aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={pickLocalized(f.name, f.name_de, locale)}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                    {f.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span>
                <span className="block font-display text-base font-semibold text-[var(--fg)] transition-colors group-hover/tile:text-[var(--color-gold)]">
                  {pickLocalized(f.name, f.name_de, locale)}
                </span>
                {n > 0 && (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {n} {colorsLabel(n, t)}
                  </span>
                )}
              </span>
            </LocalizedLink>
          );
        })}
      </div>
    </details>
  );
}
```

> ⚠️ Kafelek używa **nazwanej** grupy Tailwinda: `group/tile` + `group-hover/tile:`. Bez tego hover na kafelku łapałby się z `group` na `<details>` i nazwa tkaniny zmieniałaby kolor przy hoverze gdziekolwiek w sekcji. Oryginalny kod w `page.tsx` miał zwykłe `group`/`group-hover:`, bo nie był zagnieżdżony w innej grupie.

- [ ] **Step 4: Przełącz stronę na komponent**

Zamień zawartość `app/tkaniny/page.tsx` na (metadane i importy bez zmian merytorycznych, ubywa `colorsLabel`, `fabricThumb`, `formatMoney`, `LocalizedLink`, `Fabric`):

```tsx
import type { Metadata } from "next";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import FabricGroupSection from "./FabricGroupSection";

// Katalog tkanin (spec 2026-07-21): sekcje wg grup cenowych, kafelki tkanin
// linkują do /tkaniny/[slug]. Route statyczny — przykrywa dawną podstronę CMS
// o slugu "tkaniny" (slug zarezerwowany w pages.ts).
//
// Od 2026-07-30 sekcje są zwijane (spec 2026-07-30-tkaniny-grupy-rozwijanie):
// cały markup sekcji siedzi w FabricGroupSection, tutaj zostaje pobranie
// danych, metadane i nagłówek strony.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.fabrics.heading,
    description: t.fabrics.intro,
    alternates: {
      canonical: localizePath("/tkaniny", locale),
      languages: alternatesFor("/tkaniny", { hasDe: true }).languages,
    },
  };
}

export default async function TkaninyPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [fabrics, groups, rate] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    getEurRate(),
  ]);
  const sections = groups
    .map((g) => ({ group: g, items: fabrics.filter((f) => f.group_id === g.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.fabrics.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">{t.fabrics.heading}</h1>
        <p className="text-sm text-[var(--muted)] mt-3 max-w-2xl">{t.fabrics.intro}</p>
      </div>

      {sections.map(({ group, items }) => (
        <FabricGroupSection
          key={group.id}
          group={group}
          items={items}
          locale={locale}
          rate={rate}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Uruchom e2e i potwierdź, że przechodzi**

Serwer dev musi działać. Run (PowerShell):
```
$env:E2E_BASE_URL="http://localhost:3000"; npx playwright test e2e/tkaniny-grupy.spec.ts --project=chromium --no-deps
```

Expected: PASS — 2 testy zielone.

Jeśli localhost pokazuje stary render, to znany problem projektu: `npm run build` odpalony przy działającym `next dev` psuje `.next`. Ubij proces na porcie 3000, usuń `.next`, odpal `npm run dev` ponownie.

- [ ] **Step 6: Sprawdź wzrokowo**

Otwórz `http://localhost:3000/tkaniny`:
- trzy zwinięte wiersze: nazwa grupy, dopłata (Standard = „bez dopłaty"), licznik „5 tkanin", po prawej rządek 5 miniatur, strzałka
- klik rozwija siatkę kafelków; miniatury z nagłówka znikają, strzałka obraca się
- druga i trzecia sekcja zostają zwinięte
- Tab + Enter na nagłówku też rozwija (dostępność)
- to samo na `http://localhost:3000/de/tkaniny`: nazwy grup po niemiecku, licznik „6 Stoffe", dopłaty w EUR

- [ ] **Step 7: Bramki**

Run: `npx tsc --noEmit` → 0 błędów
Run: `npm run lint` → 0 błędów (4 znane warningi)
Run: `npm test` → wszystkie zielone (bez zmian względem Task 1 — vitest nie dotyka tych plików)

- [ ] **Step 8: Commit**

```bash
git add e2e/tkaniny-grupy.spec.ts app/tkaniny/FabricGroupSection.tsx app/tkaniny/page.tsx
git commit -m "feat(tkaniny): zwijane sekcje grup cenowych na /tkaniny

Trzy grupy startuja zwiniete, kazda rozwijana niezaleznie. Zwiniety naglowek
pokazuje nazwe, doplate, licznik tkanin i rzadek 5 miniatur (chowany po
rozwinieciu). Mechanizm: natywne <details>/<summary>, serwerowo, zero JS -
wzorzec z app/sklep/CollectionIntro.tsx.

Kafelki zostaja w HTML takze zwiniete, wiec linki do /tkaniny/[slug] nie
wypadaja ze zrodla strony. Guard e2e pilnuje tego przez porownanie liczby
linkow z sumą licznikow w naglowkach.

Markup sekcji wyjechal z page.tsx do FabricGroupSection."
```

---

### Task 3: Bramka końcowa i PR

**Files:** brak zmian w kodzie — weryfikacja całości i wypuszczenie.

**Interfaces:**
- Consumes: gałąź `feat/tkaniny-zwijane-grupy` z commitami z Task 1 i 2.
- Produces: PR do `main`.

- [ ] **Step 1: Zatrzymaj serwer dev**

Build przy działającym `next dev` psuje `.next` dev-serwera (znany problem projektu). Ubij proces na porcie 3000 przed buildem.

- [ ] **Step 2: Pełny zestaw bramek**

Run: `npx tsc --noEmit` → 0 błędów
Run: `npm run lint` → 0 błędów, 4 znane warningi
Run: `npm test` → wszystkie zielone
Run: `npm run build` → przechodzi (Turbopack)

- [ ] **Step 3: Sprawdź, czy nic nie zostało poza commitami**

Run: `git status --short`
Expected: puste. Jeśli coś wisi — dołącz do właściwego commita albo wyjaśnij.

- [ ] **Step 4: Push jako Woodecky10**

```bash
gh auth switch --hostname github.com --user Woodecky10
git -c credential.helper= -c "credential.https://github.com.helper=!'C:\Program Files\GitHub CLI\gh.exe' auth git-credential" push -u origin feat/tkaniny-zwijane-grupy
```

- [ ] **Step 5: Utwórz PR**

```bash
gh pr create --repo Woodecky10/sklep-meblowy --base main --head feat/tkaniny-zwijane-grupy \
  --title "Tkaniny: zwijane sekcje grup cenowych" \
  --body "Trzy grupy cenowe na /tkaniny startuja zwiniete, kazda rozwijana niezaleznie. Zwiniety naglowek pokazuje nazwe, doplate, licznik tkanin i rzadek 5 miniatur.

Mechanizm: natywne <details>/<summary>, serwerowo, zero JavaScriptu - wzorzec z app/sklep/CollectionIntro.tsx. Kafelki zostaja w HTML takze zwiniete, wiec 17 linkow do /tkaniny/[slug] nie wypada ze zrodla strony.

Spec: docs/superpowers/specs/2026-07-30-tkaniny-grupy-rozwijanie-design.md
Plan: docs/superpowers/plans/2026-07-30-tkaniny-zwijane-grupy.md

Bramki: tsc 0, lint 0 bledow (4 znane warningi), vitest zielony, build przechodzi. Guard e2e: e2e/tkaniny-grupy.spec.ts."
gh auth switch --hostname github.com --user mwlo1403
```

- [ ] **Step 6: Zgłoś właścicielowi**

Podaj link do PR i poproś o decyzję o merge — deploy na produkcję idzie automatycznie po scaleniu do `main`.

---

## Uwagi dla wykonawcy

- **Nie dodawaj `name` do `<details>`.** Atrybut `name` włącza zachowanie akordeonu (otwarcie jednej zamyka pozostałe), a ustalenie z właścicielem jest odwrotne: sekcje niezależne.
- **Nie przepisuj sekcji na render warunkowy** (`{open && <div>...}`) — to wymagałoby komponentu klienckiego i wyrzuciłoby kafelki z HTML, czyli zabrałoby 17 linków wewnętrznych. Test e2e to wyłapie.
- **Nie zmieniaj sortowania tkanin.** Kolejność (`sort_order`, potem `name`) ustawia `app/_lib/fabrics.ts` i zostaje bez zmian — zgłoszenie dotyczyło zwijania, nie kolejności.
- Grupa bez tkanin nie pojawi się wcale, bo `page.tsx` filtruje `items.length > 0`. To zachowanie sprzed zmiany i zostaje.
