# Sekcje strony głównej z DB + hub /admin/strona-glowna — plan implementacji (krok 1/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kolejność, widoczność i nagłówki sekcji strony głównej edytowalne z nowej podstrony admina `/admin/strona-glowna`, z fallbackiem 1:1 na dzisiejszy wygląd.

**Architecture:** Nowa tabela `home_sections` (5 wierszy, po jednym na sekcję) czytana przez `unstable_cache` z tagiem; `app/page.tsx` renderuje sekcje w kolejności z bazy zamiast na sztywno; hub w adminie edytuje wiersze przez server actions (wzorzec identyczny jak `/admin/kafelki`). Definicje domyślne w kodzie = seed w migracji, więc pusta/niedostępna baza daje dokładnie obecny wygląd.

**Tech Stack:** Next.js 16.2.4 (App Router, Server Components), Supabase (Postgres + RLS), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-edycja-home-motyw-design.md`

## Global Constraints

- **Next 16 ≠ Next z treningu.** Przed użyciem API Next przeczytaj odpowiedni plik w `node_modules/next/dist/docs/`. Zweryfikowane już: `revalidateTag(tag, "max")` — dwuargumentowa sygnatura jest obowiązująca (jednoargumentowa deprecated).
- **Turbopack gotcha:** w plikach `"use server"` wyłącznie async funkcje-akcje. ŻADNYCH `export type` — typ eksportuj ze źródła (np. z `app/_lib/home-sections.ts`).
- **`unstable_cache`:** wewnątrz nie wolno używać `cookies()`. Wzorzec `app/_lib/slides.ts`: `createAdminClient()` wewnątrz cache'owanej funkcji jest OK (service-role, bez cookies).
- **Numeracja migracji: ta faza = `49_home_sections.sql`.** Numery 47/48 są ZAREZERWOWANE przez otwarty PR #48 (Przelewy24) — nie używać.
- **Baza Supabase = PRODUKCJA** (lokalny dev używa tej samej bazy). Migrację najpierw plik w repo; na prod zapuszcza się przez Supabase MCP dopiero po pokazaniu SQL użytkownikowi i jego potwierdzeniu.
- **Panel admina jest PL-only.** Komentarze w kodzie po polsku (konwencja repo). Importy przez alias `@/app/...`.
- **TDD:** logika czysta najpierw test (vitest), potem implementacja. Komendy: pojedynczy plik `npx vitest run <ścieżka>`, całość `npm test`, typy `npx tsc --noEmit`, build `npm run build`.
- **Branch:** `feat/home-sekcje-hub` od aktualnego `main`. Po ukończeniu użyj skilla superpowers:finishing-a-development-branch.

## File Structure

- Create: `app/_lib/home-sections.ts` — typy, domyślne sekcje, merge z defaultami, lokalizacja, fetch+cache+inwalidacja (wzorzec `slides.ts`)
- Create: `app/_lib/__tests__/home-sections.test.ts` — testy logiki czystej
- Create: `supabase/migrations/49_home_sections.sql` — tabela + seed + RLS + RPC reorder
- Create: `app/admin/strona-glowna/actions.ts` — server actions (update nagłówków, toggle widoczności, reorder)
- Create: `app/admin/strona-glowna/page.tsx` — strona serwerowa huba
- Create: `app/admin/strona-glowna/HomeSectionsEditor.tsx` — klient: lista sekcji, strzałki, toggle, formularze nagłówków, linki do istniejących edytorów
- Modify: `app/page.tsx` — renderowanie sekcji wg bazy (kolejność/widoczność/nagłówki)
- Modify: `app/_components/ui/TrustBar.tsx` — opcjonalne propsy `heading`/`eyebrow` (fallback słownik)
- Modify: `app/admin/AdminShell.tsx` — pozycja „Strona główna" w menu
- Modify: `app/admin/page.tsx` — karta „Strona główna" na pulpicie

---

### Task 1: Logika czysta `home-sections` (typy, domyślne, merge, lokalizacja) — TDD

**Files:**
- Create: `app/_lib/home-sections.ts`
- Test: `app/_lib/__tests__/home-sections.test.ts`

**Interfaces:**
- Consumes: `pl`/`de` ze słowników (`@/app/_lib/dictionaries/pl`, `.../de` — eksportują stałe `pl`, `de`), typ `Locale` z `@/app/_lib/i18n`.
- Produces (używane w Taskach 3–7):
  - `type HomeSectionKey = "hero" | "tiles" | "featured" | "trust_bar" | "collections"`
  - `HOME_SECTION_KEYS: readonly HomeSectionKey[]`
  - `type HomeSectionRow = { key: HomeSectionKey; sort_order: number; visible: boolean; heading: string | null; heading_de: string | null; subheading: string | null; subheading_de: string | null }`
  - `type LocalizedHomeSection = { key: HomeSectionKey; visible: boolean; heading: string | null; subheading: string | null }`
  - `DEFAULT_HOME_SECTIONS: HomeSectionRow[]`
  - `mergeHomeSections(rows: HomeSectionRow[] | null | undefined): HomeSectionRow[]`
  - `localizeHomeSection(s: HomeSectionRow, locale: Locale): LocalizedHomeSection`
  - `isHomeSectionKey(v: string): v is HomeSectionKey`

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/home-sections.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_HOME_SECTIONS,
  mergeHomeSections,
  localizeHomeSection,
  isHomeSectionKey,
  type HomeSectionRow,
} from "@/app/_lib/home-sections";
import { pl } from "@/app/_lib/dictionaries/pl";
import { de } from "@/app/_lib/dictionaries/de";

describe("DEFAULT_HOME_SECTIONS", () => {
  it("zawiera 5 sekcji w dzisiejszej kolejności strony", () => {
    expect(DEFAULT_HOME_SECTIONS.map((s) => s.key)).toEqual([
      "hero",
      "tiles",
      "featured",
      "trust_bar",
      "collections",
    ]);
  });

  it("nagłówki domyślne = wartości ze słowników (jedno źródło prawdy)", () => {
    const tiles = DEFAULT_HOME_SECTIONS.find((s) => s.key === "tiles")!;
    expect(tiles.heading).toBe(pl.home.collectionsHeading);
    expect(tiles.heading_de).toBe(de.home.collectionsHeading);
    expect(tiles.subheading).toBe(pl.home.collectionsEyebrow);
    const trust = DEFAULT_HOME_SECTIONS.find((s) => s.key === "trust_bar")!;
    expect(trust.heading).toBe(pl.trustBar.heading);
    expect(trust.subheading_de).toBe(de.trustBar.eyebrow);
  });

  it("hero nie ma nagłówków (slajdy mają własne teksty)", () => {
    const hero = DEFAULT_HOME_SECTIONS.find((s) => s.key === "hero")!;
    expect(hero.heading).toBeNull();
    expect(hero.subheading).toBeNull();
  });
});

describe("mergeHomeSections", () => {
  it("pusta/null lista → defaulty", () => {
    expect(mergeHomeSections([])).toEqual(DEFAULT_HOME_SECTIONS);
    expect(mergeHomeSections(null)).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it("wiersz z bazy nadpisuje default (visible, heading), sortuje po sort_order", () => {
    const rows: HomeSectionRow[] = [
      {
        key: "collections",
        sort_order: 0,
        visible: false,
        heading: "Serie",
        heading_de: null,
        subheading: null,
        subheading_de: null,
      },
    ];
    const merged = mergeHomeSections(rows);
    // collections z sort_order=0 wskakuje na początek
    expect(merged[0].key).toBe("collections");
    expect(merged[0].visible).toBe(false);
    expect(merged[0].heading).toBe("Serie");
    // pozostałe sekcje obecne z defaultów
    expect(merged).toHaveLength(5);
    expect(merged.map((s) => s.key)).toContain("hero");
  });

  it("ignoruje nieznane klucze z bazy", () => {
    const rows = [
      { key: "newsletter", sort_order: 0, visible: true, heading: null, heading_de: null, subheading: null, subheading_de: null },
    ] as unknown as HomeSectionRow[];
    expect(mergeHomeSections(rows)).toEqual(DEFAULT_HOME_SECTIONS);
  });
});

describe("localizeHomeSection", () => {
  const row: HomeSectionRow = {
    key: "tiles",
    sort_order: 1,
    visible: true,
    heading: "Znajdź swój styl",
    heading_de: "Finden Sie Ihren Stil",
    subheading: "Kolekcje",
    subheading_de: "",
  };

  it("pl → kolumny bazowe", () => {
    const l = localizeHomeSection(row, "pl");
    expect(l.heading).toBe("Znajdź swój styl");
    expect(l.subheading).toBe("Kolekcje");
  });

  it("de → kolumna _de, pusty string _de → fallback PL", () => {
    const l = localizeHomeSection(row, "de");
    expect(l.heading).toBe("Finden Sie Ihren Stil");
    expect(l.subheading).toBe("Kolekcje"); // "" → fallback
  });
});

describe("isHomeSectionKey", () => {
  it("rozpoznaje znane klucze i odrzuca nieznane", () => {
    expect(isHomeSectionKey("hero")).toBe(true);
    expect(isHomeSectionKey("trust_bar")).toBe(true);
    expect(isHomeSectionKey("newsletter")).toBe(false);
    expect(isHomeSectionKey("")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILować**

Run: `npx vitest run app/_lib/__tests__/home-sections.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/home-sections'` (plik nie istnieje).

- [ ] **Step 3: Zaimplementuj logikę czystą**

```ts
// app/_lib/home-sections.ts
// Sekcje strony głównej — kolejność, widoczność i nagłówki edytowane w
// /admin/strona-glowna (tabela home_sections, migracja 49). Defaulty w kodzie
// odtwarzają dzisiejszy wygląd 1:1 (i są jednocześnie seedem migracji).

import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";

export const HOME_SECTION_KEYS = [
  "hero",
  "tiles",
  "featured",
  "trust_bar",
  "collections",
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export function isHomeSectionKey(v: string): v is HomeSectionKey {
  return (HOME_SECTION_KEYS as readonly string[]).includes(v);
}

export type HomeSectionRow = {
  key: HomeSectionKey;
  sort_order: number;
  visible: boolean;
  heading: string | null;
  heading_de: string | null;
  subheading: string | null;
  subheading_de: string | null;
};

export type LocalizedHomeSection = {
  key: HomeSectionKey;
  visible: boolean;
  heading: string | null;
  subheading: string | null;
};

// Nagłówki domyślne ze słowników — jedno źródło prawdy z dotychczasowym UI.
export const DEFAULT_HOME_SECTIONS: HomeSectionRow[] = [
  { key: "hero", sort_order: 0, visible: true, heading: null, heading_de: null, subheading: null, subheading_de: null },
  { key: "tiles", sort_order: 1, visible: true, heading: pl.home.collectionsHeading, heading_de: de.home.collectionsHeading, subheading: pl.home.collectionsEyebrow, subheading_de: de.home.collectionsEyebrow },
  { key: "featured", sort_order: 2, visible: true, heading: pl.home.featuredHeading, heading_de: de.home.featuredHeading, subheading: null, subheading_de: null },
  { key: "trust_bar", sort_order: 3, visible: true, heading: pl.trustBar.heading, heading_de: de.trustBar.heading, subheading: pl.trustBar.eyebrow, subheading_de: de.trustBar.eyebrow },
  { key: "collections", sort_order: 4, visible: true, heading: pl.home.seriesHeading, heading_de: de.home.seriesHeading, subheading: pl.home.seriesEyebrow, subheading_de: de.home.seriesEyebrow },
];

// Scala wiersze z bazy z defaultami: nieznane klucze ignoruje, brakujące
// sekcje uzupełnia defaultem, sortuje po sort_order. Pusta baza → defaulty.
export function mergeHomeSections(
  rows: HomeSectionRow[] | null | undefined
): HomeSectionRow[] {
  const byKey = new Map<HomeSectionKey, HomeSectionRow>(
    DEFAULT_HOME_SECTIONS.map((s) => [s.key, s])
  );
  for (const row of rows ?? []) {
    if (row && isHomeSectionKey(row.key)) {
      byKey.set(row.key, { ...byKey.get(row.key)!, ...row });
    }
  }
  return [...byKey.values()].sort((a, b) => a.sort_order - b.sort_order);
}

// DE: kolumna _de, pusty string/null → fallback PL (wzorzec localizeSlide).
export function localizeHomeSection(
  s: HomeSectionRow,
  locale: Locale
): LocalizedHomeSection {
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return {
    key: s.key,
    visible: s.visible,
    heading: pick(s.heading_de, s.heading),
    subheading: pick(s.subheading_de, s.subheading),
  };
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/_lib/__tests__/home-sections.test.ts`
Expected: PASS (wszystkie testy zielone).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/home-sections.ts app/_lib/__tests__/home-sections.test.ts
git commit -m "feat(home): logika sekcji strony glownej - defaulty, merge, lokalizacja (TDD)"
```

---

### Task 2: Migracja `49_home_sections.sql`

**Files:**
- Create: `supabase/migrations/49_home_sections.sql`

**Interfaces:**
- Consumes: wzorzec RLS z `supabase/migrations/33_eur_pricing.sql`, wzorzec RPC reorder z `28_atomic_admin_ops.sql`.
- Produces: tabela `public.home_sections`, funkcja `public.reorder_home_sections(text[])` (używana w Task 5).

- [ ] **Step 1: Napisz migrację**

```sql
-- supabase/migrations/49_home_sections.sql
-- Sekcje strony głównej: kolejność, widoczność, nagłówki PL+DE.
-- Edytowane w /admin/strona-glowna. Seed = dzisiejszy wygląd strony 1:1
-- (wartości muszą być identyczne z DEFAULT_HOME_SECTIONS w
-- app/_lib/home-sections.ts, które biorą je ze słowników).
-- UWAGA: 47/48 zarezerwowane przez PR #48 (P24) — stąd numer 49.

create table if not exists public.home_sections (
  key text primary key
    check (key in ('hero','tiles','featured','trust_bar','collections')),
  sort_order int not null,
  visible boolean not null default true,
  heading text,
  heading_de text,
  subheading text,
  subheading_de text,
  updated_at timestamptz not null default now()
);

insert into public.home_sections
  (key, sort_order, visible, heading, heading_de, subheading, subheading_de)
values
  ('hero',        0, true, null, null, null, null),
  ('tiles',       1, true, 'Znajdź swój styl', 'Finden Sie Ihren Stil', 'Kolekcje', 'Kollektionen'),
  ('featured',    2, true, 'Polecane produkty', 'Empfohlene Produkte', null, null),
  ('trust_bar',   3, true, 'Dlaczego warto kupować u nas?', 'Warum bei uns kaufen?', 'MEBLE Z CHARAKTEREM', 'MÖBEL MIT CHARAKTER'),
  ('collections', 4, true, 'Nasze kolekcje', 'Unsere Kollektionen', 'Serie mebli', 'Möbelserien')
on conflict (key) do nothing;

alter table public.home_sections enable row level security;

-- Odczyt publiczny — sekcje renderuje strona główna także dla anon.
drop policy if exists home_sections_read on public.home_sections;
create policy home_sections_read on public.home_sections
  for select using (true);

-- Zapis tylko service_role (server actions po requireAdmin).
revoke insert, update, delete on public.home_sections from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28): sort_order = pozycja w tablicy, 0-based.
create or replace function public.reorder_home_sections(p_keys text[])
returns void language sql as $$
  update public.home_sections s
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_keys) with ordinality as o(key, ord)
   where s.key = o.key;
$$;

revoke execute on function public.reorder_home_sections(text[]) from public;
grant execute on function public.reorder_home_sections(text[]) to service_role;
```

- [ ] **Step 2: Sanity-check spójności seeda z defaultami**

Porównaj ręcznie wartości seeda z `DEFAULT_HOME_SECTIONS` (Task 1) i ze słownikami:
`pl.home.collectionsHeading = "Znajdź swój styl"`, `de.home.collectionsHeading = "Finden Sie Ihren Stil"`, `pl.home.featuredHeading = "Polecane produkty"`, `pl.trustBar.heading = "Dlaczego warto kupować u nas?"`, `pl.trustBar.eyebrow = "MEBLE Z CHARAKTEREM"`, `pl.home.seriesHeading = "Nasze kolekcje"`, `pl.home.seriesEyebrow = "Serie mebli"` (+ odpowiedniki DE jak w pliku `app/_lib/dictionaries/de.ts`). Muszą być identyczne co do znaku.

**Migracji NIE zapuszczamy teraz na prod** — to zrobi krok weryfikacyjny (Task 8) przez Supabase MCP po potwierdzeniu użytkownika.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/49_home_sections.sql
git commit -m "feat(db): migracja 49 - tabela home_sections + seed + RLS + RPC reorder"
```

---

### Task 3: Fetch + cache + inwalidacja w `home-sections.ts`

**Files:**
- Modify: `app/_lib/home-sections.ts` (dopisz na końcu pliku)

**Interfaces:**
- Consumes: `mergeHomeSections` (Task 1), `createAdminClient` z `@/app/_lib/supabase/server`, `unstable_cache`/`revalidateTag` z `next/cache`, `cache` z `react`.
- Produces:
  - `HOME_SECTIONS_CACHE_TAG = "home-sections"`
  - `getHomeSections(): Promise<HomeSectionRow[]>` — scalone z defaultami, posortowane (strona główna)
  - `getAllHomeSections(): Promise<HomeSectionRow[]>` — bez cache (admin)
  - `invalidateHomeSectionsCache(): void`

- [ ] **Step 1: Dopisz warstwę fetch (wzorzec `slides.ts`)**

Na górze pliku dodaj importy:

```ts
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
```

Na końcu pliku dodaj:

```ts
export const HOME_SECTIONS_CACHE_TAG = "home-sections";

// Cross-request cache (wzorzec slides.ts). Wewnątrz unstable_cache nie wolno
// używać cookies() — createAdminClient (service-role) jest bez cookies, OK.
// Błąd/pusta tabela → mergeHomeSections zwraca defaulty → strona wygląda jak
// dziś (fail-open, sklep nigdy nie pada przez brak konfiguracji).
const fetchHomeSections = unstable_cache(
  async (): Promise<HomeSectionRow[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("home_sections")
      .select("key, sort_order, visible, heading, heading_de, subheading, subheading_de")
      .order("sort_order", { ascending: true });
    if (error || !data) return mergeHomeSections(null);
    return mergeHomeSections(data as HomeSectionRow[]);
  },
  ["home-sections"],
  { tags: [HOME_SECTIONS_CACHE_TAG], revalidate: 60 }
);

export const getHomeSections = cache(fetchHomeSections);

// Admin: świeży odczyt bez cache (po mutacji router.refresh() ma widzieć zmiany).
export async function getAllHomeSections(): Promise<HomeSectionRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("home_sections")
    .select("key, sort_order, visible, heading, heading_de, subheading, subheading_de")
    .order("sort_order", { ascending: true });
  return mergeHomeSections((data ?? []) as HomeSectionRow[]);
}

export function invalidateHomeSectionsCache() {
  revalidateTag(HOME_SECTIONS_CACHE_TAG, "max");
}
```

- [ ] **Step 2: Weryfikacja typów i testów**

Run: `npx tsc --noEmit && npx vitest run app/_lib/__tests__/home-sections.test.ts`
Expected: zero błędów typów, testy PASS (logika czysta nietknięta).

- [ ] **Step 3: Commit**

```bash
git add app/_lib/home-sections.ts
git commit -m "feat(home): fetch home_sections z unstable_cache + inwalidacja tagiem"
```

---

### Task 4: `TrustBar` — propsy `heading`/`eyebrow`

**Files:**
- Modify: `app/_components/ui/TrustBar.tsx`

**Interfaces:**
- Produces: `TrustBar` przyjmuje dodatkowo `heading?: string | null; eyebrow?: string | null` — gdy `withHeading`, użyte zamiast słownika (null/undefined → fallback słownik). Konsumowane przez Task 5.

- [ ] **Step 1: Zmień sygnaturę i nagłówek komponentu**

W `app/_components/ui/TrustBar.tsx` zmień typ propsów i blok nagłówka:

```tsx
type Props = {
  locale: Locale;
  withHeading?: boolean;
  // Nagłówek sekcji z home_sections (admin) — fallback na słownik, żeby
  // karta produktu i stopka (bez propsów) działały bez zmian.
  heading?: string | null;
  eyebrow?: string | null;
};

export default function TrustBar({
  locale,
  withHeading = false,
  heading,
  eyebrow,
}: Props) {
  const t = getDictionary(locale).trustBar;
  const resolvedHeading = heading ?? t.heading;
  const resolvedEyebrow = eyebrow ?? t.eyebrow;
  // ... (items bez zmian)
```

oraz w JSX nagłówka (render eyebrow/heading tylko gdy niepuste — admin może
wyczyścić jedno z pól):

```tsx
{withHeading && (
  <div className="text-center mb-14">
    {resolvedEyebrow && (
      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
        {resolvedEyebrow}
      </p>
    )}
    {resolvedHeading && (
      <h2 className="font-display text-4xl font-bold">{resolvedHeading}</h2>
    )}
  </div>
)}
```

Reszta pliku (items, ikony) bez zmian.

- [ ] **Step 2: Weryfikacja**

Run: `npx tsc --noEmit`
Expected: zero błędów (wywołania bez nowych propsów — karta produktu, stopka — kompilują się dzięki opcjonalności).

- [ ] **Step 3: Commit**

```bash
git add app/_components/ui/TrustBar.tsx
git commit -m "feat(trustbar): opcjonalne propsy heading/eyebrow z fallbackiem na slownik"
```

---

### Task 5: `app/page.tsx` — sekcje w kolejności z bazy

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getHomeSections`, `localizeHomeSection`, `LocalizedHomeSection`, `HomeSectionKey` (Task 1/3); `TrustBar` z propsami (Task 4).
- Produces: strona główna renderuje sekcje wg `home_sections` (kolejność, `visible`, nagłówki). Markup sekcji poza nagłówkami — bez zmian.

- [ ] **Step 1: Przebuduj `HomePage`**

Zmiany w `app/page.tsx`:

1. Dopisz importy:

```tsx
import { Fragment, type ReactNode } from "react";
import {
  getHomeSections,
  localizeHomeSection,
  type LocalizedHomeSection,
} from "./_lib/home-sections";
```

2. W `Promise.all` w `HomePage` dodaj `getHomeSections()`:

```tsx
const [dbSlides, dbTiles, featured, allCategories, collectionsForHome, wishlistIds, rate, dbSections] =
  await Promise.all([
    getActiveSlides(),
    getActiveTiles(),
    getFeaturedOrFallback(locale),
    getCategories(locale),
    getCollectionsForHome(locale),
    getUserWishlistIds(),
    getEurRate(),
    getHomeSections(),
  ]);
const sections = dbSections.map((s) => localizeHomeSection(s, locale));
```

3. Całe dotychczasowe `return (<>...</>)` zamień na renderowanie z mapy.
   Poszczególne bloki JSX sekcji przenieś 1:1 do funkcji `renderSection`,
   podmieniając WYŁĄCZNIE teksty nagłówków (`t.home.*`/nagłówek TrustBar)
   na pola sekcji. Docelowy kształt:

```tsx
  // Nagłówek+eyebrow sekcji z bazy; null/pusty → blok nagłówka pomijany.
  function sectionHeader(s: LocalizedHomeSection) {
    if (!s.heading && !s.subheading) return null;
    return (
      <div className="text-center mb-16">
        {s.subheading && (
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
            {s.subheading}
          </p>
        )}
        {s.heading && (
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
            {s.heading}
          </h2>
        )}
      </div>
    );
  }

  function renderSection(s: LocalizedHomeSection): ReactNode {
    switch (s.key) {
      case "hero":
        return <HomeHeroSlider slides={slides} />;
      case "tiles":
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(s)}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* ...grid kafelków 1:1 jak dotychczas (tiles.map(...))... */}
            </div>
          </section>
        );
      case "featured":
        return (
          <section className="py-24">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-end justify-between mb-16">
                <div>
                  {s.heading && (
                    <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                      {s.heading}
                    </h2>
                  )}
                </div>
                <LocalizedLink
                  href="/sklep"
                  className="hidden md:inline-flex text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
                >
                  {t.home.seeAll}
                </LocalizedLink>
              </div>
              {/* ...featured.length === 0 ? ... : grid ProductCard 1:1 jak dotychczas... */}
            </div>
          </section>
        );
      case "trust_bar":
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            <TrustBar withHeading locale={locale} heading={s.heading} eyebrow={s.subheading} />
          </section>
        );
      case "collections":
        if (collectionsForHome.length === 0) return null;
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(s)}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* ...grid kolekcji 1:1 jak dotychczas (collectionsForHome.map(...))... */}
            </div>
          </section>
        );
    }
  }

  return (
    <>
      {sections
        .filter((s) => s.visible)
        .map((s) => (
          <Fragment key={s.key}>{renderSection(s)}</Fragment>
        ))}
    </>
  );
```

Uwagi:
- Wnętrza gridów (kafelki, ProductCard, mozaika kolekcji) przenosisz BEZ ZMIAN
  z obecnego `app/page.tsx` — zmienia się tylko źródło nagłówków. Sekcja
  „tiles" w starym kodzie używała `t.home.collectionsEyebrow`/`collectionsHeading`,
  „collections" — `t.home.seriesEyebrow`/`seriesHeading`, „featured" —
  `t.home.featuredHeading`; te odwołania znikają ze strony (klucze w słowniku
  zostają — służą jako defaulty w `home-sections.ts`).
- `t.home.seeAll`, `t.home.featuredEmpty`, `t.home.tileDiscover`,
  `t.home.seeCollection` itd. zostają ze słownika (to UI, nie treść sekcji).
- `renderSection`/`sectionHeader` definiuj WEWNĄTRZ `HomePage` (domknięcie na
  `slides`, `tiles`, `featured`, `collectionsForHome`, `t`, `locale`,
  `wishlistIds`, `rate`, `categoryLabels`).

- [ ] **Step 2: Weryfikacja — typy + build + testy**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: wszystko zielone. Build renderuje home bez błędów (baza nie ma
jeszcze tabeli `home_sections` — fetch zwróci błąd → defaulty → strona
identyczna jak dotąd; to celowy dowód działania fallbacku).

- [ ] **Step 3: Weryfikacja wizualna (dev)**

Run: `npm run dev`, otwórz `http://localhost:3000` i `http://localhost:3000/de`.
Expected: strona główna PL i DE wygląda IDENTYCZNIE jak przed zmianą
(kolejność sekcji, nagłówki, eyebrow).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(home): sekcje strony glownej renderowane wg home_sections (kolejnosc/widocznosc/naglowki)"
```

---

### Task 6: Server actions `/admin/strona-glowna`

**Files:**
- Create: `app/admin/strona-glowna/actions.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`@/app/_lib/admin`), `createAdminClient`, `invalidateHomeSectionsCache`, `isHomeSectionKey`, `HOME_SECTION_KEYS` (Task 1/3), typ `ActionResult` z `@/app/_lib/types`.
- Produces (dla Task 7):
  - `updateHomeSection(formData: FormData): Promise<ActionResult>` — pola: `key`, `heading`, `heading_de`, `subheading`, `subheading_de`
  - `toggleHomeSectionVisible(formData: FormData): Promise<ActionResult>` — pola: `key`, `visible` ("1"/"0")
  - `reorderHomeSections(keys: string[]): Promise<ActionResult>`

- [ ] **Step 1: Napisz akcje**

```ts
// app/admin/strona-glowna/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  HOME_SECTION_KEYS,
  isHomeSectionKey,
  invalidateHomeSectionsCache,
} from "@/app/_lib/home-sections";
import type { ActionResult } from "@/app/_lib/types";

function sanitize(input: unknown, max = 300): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Wspólne dla wszystkich mutacji: inwalidacja cache + revalidacja ścieżek.
// Home żyje na "/" i "/de" (rewrite w proxy) → revalidatePath("/", "layout").
function revalidateHome() {
  invalidateHomeSectionsCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/strona-glowna");
}

// ── Nagłówki sekcji (PL+DE) ─────────────────────────────────────────────
export async function updateHomeSection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const key = sanitize(formData.get("key"));
  if (!isHomeSectionKey(key)) return { ok: false, error: "Nieznana sekcja" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_sections")
    .update({
      heading: emptyToNull(sanitize(formData.get("heading"))),
      heading_de: emptyToNull(sanitize(formData.get("heading_de"))),
      subheading: emptyToNull(sanitize(formData.get("subheading"))),
      subheading_de: emptyToNull(sanitize(formData.get("subheading_de"))),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("key", key);

  if (error) return { ok: false, error: error.message };

  revalidateHome();
  return { ok: true, message: "Nagłówki sekcji zapisane" };
}

// ── Widoczność sekcji ───────────────────────────────────────────────────
export async function toggleHomeSectionVisible(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const key = sanitize(formData.get("key"));
  if (!isHomeSectionKey(key)) return { ok: false, error: "Nieznana sekcja" };
  const visible = formData.get("visible") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("home_sections")
    .update({ visible, updated_at: new Date().toISOString() } as never)
    .eq("key", key);

  if (error) return { ok: false, error: error.message };

  revalidateHome();
  return { ok: true, message: visible ? "Sekcja widoczna" : "Sekcja ukryta" };
}

// ── Kolejność sekcji (atomowo przez RPC z migracji 49) ─────────────────
export async function reorderHomeSections(keys: string[]): Promise<ActionResult> {
  await requireAdmin();

  // Walidacja: dokładnie komplet znanych kluczy, bez duplikatów.
  if (
    !Array.isArray(keys) ||
    keys.length !== HOME_SECTION_KEYS.length ||
    new Set(keys).size !== keys.length ||
    !keys.every(isHomeSectionKey)
  ) {
    return { ok: false, error: "Nieprawidłowa lista sekcji" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_home_sections", { p_keys: keys });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  revalidateHome();
  return { ok: true, message: "Kolejność zapisana" };
}
```

- [ ] **Step 2: Weryfikacja typów**

Run: `npx tsc --noEmit`
Expected: zero błędów. (Pamiętaj: plik `"use server"` — zero `export type`.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/strona-glowna/actions.ts
git commit -m "feat(admin): akcje sekcji home - naglowki, widocznosc, atomowy reorder"
```

---

### Task 7: Hub `/admin/strona-glowna` (UI) + wpisy w nawigacji

**Files:**
- Create: `app/admin/strona-glowna/page.tsx`
- Create: `app/admin/strona-glowna/HomeSectionsEditor.tsx`
- Modify: `app/admin/AdminShell.tsx` (NAV_ITEMS + ikona)
- Modify: `app/admin/page.tsx` (CARDS)

**Interfaces:**
- Consumes: `getAllHomeSections` (Task 3), akcje (Task 6), `Card`/`Field`/`ToastView`/`inputCls`/`Toast` z `@/app/admin/_shared`, typ `HomeSectionRow`.
- Produces: podstrona admina z listą sekcji (strzałki ↑/↓, toggle widoczności, rozwijane nagłówki PL+DE, linki „Edytuj zawartość →"). Faza 2 rozszerzy tę stronę o pasek zaufania i teksty ogólne.

- [ ] **Step 1: Strona serwerowa**

```tsx
// app/admin/strona-glowna/page.tsx
import { getAllHomeSections } from "@/app/_lib/home-sections";
import HomeSectionsEditor from "./HomeSectionsEditor";

// Panel admina jest PL-only. Guard admina jest w layoucie admina;
// każda akcja dodatkowo woła requireAdmin().
export default async function AdminHomePageSettings() {
  const sections = await getAllHomeSections();
  return <HomeSectionsEditor initialSections={sections} />;
}
```

- [ ] **Step 2: Edytor klienta**

```tsx
// app/admin/strona-glowna/HomeSectionsEditor.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import type { HomeSectionKey, HomeSectionRow } from "@/app/_lib/home-sections";
import {
  updateHomeSection,
  toggleHomeSectionVisible,
  reorderHomeSections,
} from "./actions";
import type { ActionResult } from "@/app/_lib/types";

// Metadane prezentacyjne sekcji (PL-only, panel admina).
const SECTION_META: Record<
  HomeSectionKey,
  { name: string; desc: string; contentHref?: string; contentCta?: string; hasHeadings: boolean }
> = {
  hero: {
    name: "Slider (hero)",
    desc: "Duży baner na górze strony. Treść slajdów edytujesz w osobnym edytorze.",
    contentHref: "/admin/slider",
    contentCta: "Edytuj slajdy",
    hasHeadings: false,
  },
  tiles: {
    name: "Kafelki „Znajdź swój styl”",
    desc: "Siatka kafelków z linkami do kolekcji/kategorii.",
    contentHref: "/admin/kafelki",
    contentCta: "Edytuj kafelki",
    hasHeadings: true,
  },
  featured: {
    name: "Polecane produkty",
    desc: "Ręcznie wybrane produkty z badge'ami.",
    contentHref: "/admin/polecane",
    contentCta: "Edytuj polecane",
    hasHeadings: true,
  },
  trust_bar: {
    name: "Pasek zaufania",
    desc: "Atuty sklepu (Polski producent, Darmowa dostawa itd.).",
    hasHeadings: true,
  },
  collections: {
    name: "Nasze kolekcje",
    desc: "Automatyczna mozaika kolekcji, które mają produkty.",
    contentHref: "/admin/kolekcje",
    contentCta: "Edytuj kolekcje",
    hasHeadings: true,
  },
};

export default function HomeSectionsEditor({
  initialSections,
}: {
  initialSections: HomeSectionRow[];
}) {
  const [sections, setSections] = useState(initialSections);
  // Sync stanu z propów po router.refresh() (wzorzec TilesEditor).
  const [prevInitial, setPrevInitial] = useState(initialSections);
  if (initialSections !== prevInitial) {
    setPrevInitial(initialSections);
    setSections(initialSections);
  }
  const [expandedKey, setExpandedKey] = useState<HomeSectionKey | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(result: ActionResult, onSuccess?: () => void) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      onSuccess?.();
      router.refresh();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  // Strzałki ↑/↓: optymistyczna zamiana + rollback do stanu sprzed próby.
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = sections;
    setSections(next);
    startTransition(async () => {
      const res = await reorderHomeSections(next.map((s) => s.key));
      if (!res.ok) {
        setSections(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function toggleVisible(s: HomeSectionRow) {
    const fd = new FormData();
    fd.set("key", s.key);
    fd.set("visible", s.visible ? "0" : "1");
    // Optymistycznie przełącz lokalnie.
    const prev = sections;
    setSections(sections.map((x) => (x.key === s.key ? { ...x, visible: !x.visible } : x)));
    startTransition(async () => {
      const res = await toggleHomeSectionVisible(fd);
      if (!res.ok) {
        setSections(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Strona główna</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Ułóż sekcje strony głównej: zmieniaj kolejność strzałkami, ukrywaj
          przełącznikiem, edytuj nagłówki (polski i niemiecki). Zawartość
          sekcji (slajdy, kafelki, produkty) edytujesz dotychczasowymi
          edytorami — przycisk „Edytuj zawartość”.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-col gap-4" data-guard-section>
        {sections.map((s, i) => {
          const meta = SECTION_META[s.key];
          const expanded = expandedKey === s.key;
          return (
            <Card key={s.key}>
              <div className="flex items-center gap-4">
                {/* Strzałki kolejności */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Przesuń sekcję ${meta.name} wyżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === sections.length - 1}
                    aria-label={`Przesuń sekcję ${meta.name} niżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>

                {/* Nazwa + opis */}
                <div className="flex-1 min-w-0">
                  <p className={`font-display text-lg font-semibold ${s.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                    {meta.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{meta.desc}</p>
                </div>

                {/* Link do edytora zawartości */}
                {meta.contentHref && (
                  <Link
                    href={meta.contentHref}
                    className="hidden sm:inline-flex text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline shrink-0"
                  >
                    {meta.contentCta} →
                  </Link>
                )}

                {/* Toggle widoczności */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.visible}
                  aria-label={`Widoczność sekcji ${meta.name}`}
                  onClick={() => toggleVisible(s)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${s.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s.visible ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>

                {/* Rozwiń nagłówki */}
                {meta.hasHeadings && (
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : s.key)}
                    aria-expanded={expanded}
                    aria-label={`Edytuj nagłówki sekcji ${meta.name}`}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={expanded ? "rotate-180 transition-transform" : "transition-transform"}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                )}
              </div>

              {expanded && meta.hasHeadings && (
                <SectionHeadingsForm section={s} onResult={handleResult} />
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Formularz nagłówka+podtytułu (PL i DE obok siebie) jednej sekcji.
function SectionHeadingsForm({
  section,
  onResult,
}: {
  section: HomeSectionRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();

  function submit(formData: FormData) {
    startSave(async () => {
      onResult(await updateHomeSection(formData));
    });
  }

  return (
    <form action={submit} className="mt-6 pt-6 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="key" value={section.key} />
      <Field label="Podtytuł (mała złota linijka)">
        <input name="subheading" defaultValue={section.subheading ?? ""} className={inputCls} />
      </Field>
      <Field label="Podtytuł DE">
        <input name="subheading_de" defaultValue={section.subheading_de ?? ""} className={inputCls} />
      </Field>
      <Field label="Nagłówek">
        <input name="heading" defaultValue={section.heading ?? ""} className={inputCls} />
      </Field>
      <Field label="Nagłówek DE">
        <input name="heading_de" defaultValue={section.heading_de ?? ""} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz nagłówki"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Nawigacja — AdminShell i pulpit**

W `app/admin/AdminShell.tsx` w `NAV_ITEMS` dodaj po pozycji „Produkty":

```tsx
  { href: "/admin/strona-glowna", label: "Strona główna", icon: HomeIcon },
```

i na końcu pliku (obok innych ikon) dodaj:

```tsx
function HomeIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10z" />
    </svg>
  );
}
```

W `app/admin/page.tsx` w `CARDS` dodaj po pozycji „Produkty":

```tsx
  { href: "/admin/strona-glowna", title: "Strona główna", cta: "Ułóż sekcje i nagłówki" },
```

- [ ] **Step 4: Weryfikacja manualna**

Run: `npx tsc --noEmit && npm run dev`
Expected: `http://localhost:3000/admin/strona-glowna` pokazuje 5 sekcji w
kolejności hero→kafelki→polecane→pasek→kolekcje (z defaultów — tabela może
jeszcze nie istnieć; UI działa na merge'u, mutacje zwrócą błąd dopóki
migracja nie wejdzie — to oczekiwane na tym etapie).

- [ ] **Step 5: Commit**

```bash
git add app/admin/strona-glowna/ app/admin/AdminShell.tsx app/admin/page.tsx
git commit -m "feat(admin): hub /admin/strona-glowna - kolejnosc, widocznosc, naglowki sekcji"
```

---

### Task 8: Weryfikacja końcowa fazy 1 + migracja na prod + domknięcie brancha

**Files:** brak nowych (weryfikacja + migracja + merge).

- [ ] **Step 1: Pełna weryfikacja lokalna**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: zero błędów typów, WSZYSTKIE testy PASS (również dotychczasowe), build OK.

- [ ] **Step 2: Migracja 49 na prod (Supabase MCP) — WYMAGA POTWIERDZENIA UŻYTKOWNIKA**

Pokaż użytkownikowi pełny SQL z `supabase/migrations/49_home_sections.sql`
i po jego potwierdzeniu zapusć przez `mcp__supabase__apply_migration`
(nazwa: `home_sections`). Następnie weryfikacja read-only:
`mcp__supabase__execute_sql` z `select key, sort_order, visible from public.home_sections order by sort_order;`
Expected: 5 wierszy hero(0), tiles(1), featured(2), trust_bar(3), collections(4), wszystkie visible=true.

- [ ] **Step 3: Weryfikacja end-to-end na dev (żywa baza)**

Użyj skilla `verify` / `superpowers:verification-before-completion`:
1. `npm run dev` → home wygląda jak dotychczas (teraz nagłówki idą z DB).
2. W `/admin/strona-glowna`: zmień kolejność (np. kolekcje nad polecane) → home odzwierciedla po odświeżeniu; ukryj sekcję → znika z home; zmień nagłówek PL i DE → widoczny na `/` i `/de`.
3. **Przywróć oryginalne ustawienia** (kolejność 0-4, wszystko widoczne, nagłówki domyślne) — to żywy sklep.

- [ ] **Step 4: Domknięcie brancha**

Użyj skilla superpowers:finishing-a-development-branch (code review →
opcje merge/PR). Rekomendacja: PR do `main` jak dotychczasowe kroki.

---

## Self-review planu (wykonany przy pisaniu)

- Spec coverage (część „krok 1"): tabela+seed+RLS ✓ (Task 2), RPC reorder ✓, fetch z tagiem `home-sections` ✓ (Task 3), page.tsx wg bazy z fallbackiem ✓ (Task 5), lokalizacja `_de` z fallbackiem PL ✓ (Task 1), hub z toggle/strzałkami/nagłówkami/linkami ✓ (Task 7), wpisy nawigacji ✓, testy jednostkowe merge/lokalizacja/walidacje ✓, smoke `/` i `/de` ✓ (Task 8).
- Typy spójne między taskami: `HomeSectionRow`/`LocalizedHomeSection`/`isHomeSectionKey` zdefiniowane w Task 1, konsumowane w 3/5/6/7 pod tymi samymi nazwami ✓.
- Bez placeholderów: każdy krok kodowy ma kod; jedyne odwołania „1:1 jak dotychczas" wskazują ISTNIEJĄCY kod w `app/page.tsx`, który wykonawca przenosi bez zmian (celowo, żeby nie przepisywać 150 linii istniejącego JSX z ryzykiem dryfu).
