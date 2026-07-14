# System bloków + rozbudowa home (krok B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nietechniczna administratorka dodaje, edytuje, przestawia i usuwa sekcje strony głównej („klocki": banner, galeria, produkty, FAQ, opinie) z panelu admina; dotychczasowe 5 sekcji staje się nieusuwalnymi blokami systemowymi.

**Architecture:** Tabela `page_blocks` (migracja 52; `page_id null` = home, FK na podstrony dojdzie w kroku C) zastępuje `home_sections`. Rejestr typów bloków w kodzie (`app/_lib/blocks.ts` — typy, defaulty fail-open, merge, lokalizacja, walidacja, fetch z cache; wzorzec `home-sections.ts`/`trust-items.ts`). Render: `page.tsx` mapuje bloki — systemowe przez dotychczasowe case'y, treściowe przez `<ContentBlock>` (komponenty w `app/_components/blocks/`). Admin: `BlocksEditor` (ewolucja `HomeSectionsEditor` — te same wzorce strzałek/switchy/rollbacków) + modal „Dodaj sekcję" + formularze per typ z uploadem `useImageUpload`.

**Tech Stack:** Next.js (⚠️ NIETYPOWA wersja — patrz Global Constraints), TypeScript, Supabase (Postgres + Storage), vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-rozbudowa-strony-filtry-design.md` (sekcja „Krok B").

## Global Constraints

- **Next.js z breaking changes** (AGENTS.md): przed kodem dotykającym API Next przeczytaj guide w `node_modules/next/dist/docs/`.
- **Gotcha Turbopack:** w plikach `"use server"` (app/admin/strona-glowna/actions.ts) ŻADNYCH `export type` — tylko async funkcje; typy importuj ze źródła.
- **Baza = PROD.** localhost używa żywej bazy. Migracji 52 NIE zapuszcza żaden task — robi to kontroler za zgodą usera na końcu (Task 13). Do tego czasu kod działa fail-open (brak tabeli `page_blocks` → defaulty = dzisiejszy wygląd 1:1).
- **UX admina MUST BE TRIVIAL:** zero HTML, zwykłe pola, czytelne polskie etykiety; panel admina jest hardcoded PL (bez słownika) — konwencja repo.
- **i18n treści:** każde pole tekstowe bloku ma odpowiednik `_de` w `content`; fallback DE→PL per pole idiomem `locale==="de" && de.trim() ? de : pl` (NIE `??` na całości — gotcha undefined-vs-null z kroku 1).
- **Semantyka nagłówków systemowych:** wiersz istnieje w DB → `content` jest prawdą (brak klucza/null = świadomie wyczyszczone, NIE fallback na słownik); defaulty słownikowe tylko gdy wiersza/tabeli brak (fail-open).
- **Design system:** eyebrow `font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)]`; nagłówek sekcji `font-display text-4xl font-bold text-[var(--fg)]`; sekcje `py-24`; karty `bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl`.
- **Bloki systemowe** (`hero,tiles,featured,trust_bar,collections`): przestawialne, ukrywalne, NIEUSUWALNE, nie do dodania drugi raz. **Bloki treściowe** (`banner,gallery,products,faq,reviews`): pełny CRUD; nowy blok startuje jako **ukryty** z domyślną treścią.
- Nieznany `block_type` → pomijany przy renderze i merge'u (fail-open, kompatybilność w przód).
- Cache: tag `page-blocks`, `unstable_cache` + revalidate 60, wewnątrz ZERO `cookies()` (`createAdminClient`); inwalidacja we wszystkich akcjach mutujących.
- Komendy: `npx vitest run <plik>` / `npm test` / `npx tsc --noEmit` / `npm run build`.
- Branch: `feat/bloki-home` od `main`.
- Kolejność wdrożenia (kontroler): migracja 52 na prod TUŻ PRZED merge — po samym merge bez migracji edytowane nagłówki wróciłyby do słownikowych (fail-open pokazuje defaulty).

---

### Task 1: Migracja 52 — `page_blocks` + przeniesienie `home_sections`

**Files:**
- Create: `supabase/migrations/52_page_blocks.sql`

**Interfaces:**
- Produces: tabela `public.page_blocks (id uuid pk, page_id uuid null, block_type text, sort_order int, visible bool, content jsonb, created_at, updated_at)`; RPC `public.reorder_page_blocks(p_ids uuid[])`; po migracji `home_sections` i `reorder_home_sections` NIE istnieją.

- [ ] **Step 0: Utwórz branch**

```bash
git checkout main && git pull && git checkout -b feat/bloki-home
```

- [ ] **Step 1: Utwórz plik migracji**

Zawartość `supabase/migrations/52_page_blocks.sql` (wzorce RLS/RPC z migracji 49/50 — zachowaj 1:1 składnię polityk i grantów):

```sql
-- supabase/migrations/52_page_blocks.sql
-- System bloków stron (spec 2026-07-14, krok B): jedna tabela na sekcje
-- strony głównej (page_id null) i — od kroku C — podstron (FK dojdzie
-- w migracji 53). Zastępuje home_sections: 5 dotychczasowych sekcji staje
-- się blokami systemowymi; kolejność/widoczność/nagłówki przechodzą do
-- content jsonb (heading/heading_de/subheading/subheading_de).

create table if not exists public.page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid,
  block_type text not null,
  sort_order int not null default 0,
  visible boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_blocks_page_sort_idx
  on public.page_blocks (page_id, sort_order);

-- Przeniesienie sekcji home ze starej tabeli. Idempotentne (tylko gdy
-- page_blocks nie ma jeszcze bloków home) i odporne na brak home_sections
-- (świeże środowisko po dropie).
do $$
begin
  if to_regclass('public.home_sections') is not null
     and not exists (select 1 from public.page_blocks where page_id is null) then
    insert into public.page_blocks (page_id, block_type, sort_order, visible, content)
    select null, key, sort_order, visible,
           jsonb_strip_nulls(jsonb_build_object(
             'heading', heading, 'heading_de', heading_de,
             'subheading', subheading, 'subheading_de', subheading_de))
      from public.home_sections;
  end if;
end $$;

alter table public.page_blocks enable row level security;

-- Odczyt publiczny — bloki renderuje strona główna także dla anon.
drop policy if exists page_blocks_read on public.page_blocks;
create policy page_blocks_read on public.page_blocks
  for select using (true);

-- Zapis tylko service_role (server actions po requireAdmin).
revoke insert, update, delete on public.page_blocks from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28/49/50): sort_order = pozycja, 0-based.
create or replace function public.reorder_page_blocks(p_ids uuid[])
returns void language sql as $$
  update public.page_blocks b
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where b.id = o.id;
$$;

revoke execute on function public.reorder_page_blocks(uuid[]) from public;
grant execute on function public.reorder_page_blocks(uuid[]) to service_role;

-- Sprzątanie po starym modelu (kod przełączony na page_blocks w tym samym kroku).
drop function if exists public.reorder_home_sections(text[]);
drop table if exists public.home_sections;
```

- [ ] **Step 2: Weryfikacja (bez wykonywania!)**

Porównaj wzorce z `supabase/migrations/49_home_sections.sql` i `50_trust_items_site_texts.sql`: polityka `for select using (true)`, `revoke ... from anon, authenticated`, RPC `language sql` bez `security definer` + `grant execute ... to service_role`, reorder przez `unnest(...) with ordinality`. NIE uruchamiaj migracji — zapuszcza ją kontroler na końcu kroku (Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/52_page_blocks.sql
git commit -m "feat(db): migracja 52 - page_blocks + przeniesienie home_sections + RPC reorder"
```

---

### Task 2: `blocks.ts` — typy, rejestr, defaulty, merge (TDD)

**Files:**
- Create: `app/_lib/blocks.ts`
- Test: `app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: słowniki `pl`/`de` (`app/_lib/dictionaries/*`), `Locale` z `./i18n`
- Produces (używane przez WSZYSTKIE dalsze taski):
  - `SYSTEM_BLOCK_TYPES = ["hero","tiles","featured","trust_bar","collections"] as const`, `CONTENT_BLOCK_TYPES = ["banner","gallery","products","faq","reviews"] as const`
  - `type SystemBlockType`, `type ContentBlockType`, `isSystemBlockType(v: string)`, `isContentBlockType(v: string)`
  - `type PageBlockRow = { id: string; page_id: string | null; block_type: string; sort_order: number; visible: boolean; content: Record<string, unknown> }`
  - `CONTENT_BLOCK_DEFS: Record<ContentBlockType, { name: string; description: string; defaultContent: () => Record<string, unknown> }>`
  - `DEFAULT_HOME_BLOCKS: PageBlockRow[]` (id syntetyczne `system:<typ>`)
  - `mergeHomeBlocks(rows: PageBlockRow[] | null): PageBlockRow[]`

- [ ] **Step 1: Napisz failing test**

Utwórz `app/_lib/__tests__/blocks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SYSTEM_BLOCK_TYPES,
  CONTENT_BLOCK_TYPES,
  isSystemBlockType,
  isContentBlockType,
  CONTENT_BLOCK_DEFS,
  DEFAULT_HOME_BLOCKS,
  mergeHomeBlocks,
  type PageBlockRow,
} from "@/app/_lib/blocks";

const row = (over: Partial<PageBlockRow>): PageBlockRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  page_id: null,
  block_type: "banner",
  sort_order: 0,
  visible: true,
  content: {},
  ...over,
});

describe("type guards i rejestr", () => {
  it("rozróżnia typy systemowe i treściowe", () => {
    expect(isSystemBlockType("hero")).toBe(true);
    expect(isSystemBlockType("banner")).toBe(false);
    expect(isContentBlockType("banner")).toBe(true);
    expect(isContentBlockType("hero")).toBe(false);
    expect(isContentBlockType("nieznany")).toBe(false);
  });
  it("rejestr treściowy ma wpis dla każdego typu z nazwą, opisem i defaultem", () => {
    for (const t of CONTENT_BLOCK_TYPES) {
      const def = CONTENT_BLOCK_DEFS[t];
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.defaultContent()).toBeTypeOf("object");
    }
  });
  it("defaultContent zwraca świeży obiekt (bez współdzielenia referencji)", () => {
    expect(CONTENT_BLOCK_DEFS.faq.defaultContent()).not.toBe(
      CONTENT_BLOCK_DEFS.faq.defaultContent()
    );
  });
});

describe("DEFAULT_HOME_BLOCKS", () => {
  it("5 bloków systemowych w kolejności hero,tiles,featured,trust_bar,collections", () => {
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.block_type)).toEqual([
      ...SYSTEM_BLOCK_TYPES,
    ]);
    expect(DEFAULT_HOME_BLOCKS.map((b) => b.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });
  it("defaulty nagłówków = dzisiejszy wygląd (słowniki)", () => {
    const tiles = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "tiles")!;
    expect(tiles.content.heading).toBe("Znajdź swój styl");
    expect(tiles.content.heading_de).toBe("Finden Sie Ihren Stil");
    expect(tiles.content.subheading).toBe("Kolekcje");
    const hero = DEFAULT_HOME_BLOCKS.find((b) => b.block_type === "hero")!;
    expect(hero.content.heading ?? null).toBeNull();
  });
});

describe("mergeHomeBlocks", () => {
  it("null (błąd fetch) → kopia defaultów", () => {
    const out = mergeHomeBlocks(null);
    expect(out.map((b) => b.block_type)).toEqual([...SYSTEM_BLOCK_TYPES]);
    expect(out).not.toBe(DEFAULT_HOME_BLOCKS);
  });
  it("pusta tabela → defaulty (fail-open, wygląd 1:1)", () => {
    expect(mergeHomeBlocks([]).map((b) => b.block_type)).toEqual([
      ...SYSTEM_BLOCK_TYPES,
    ]);
  });
  it("wiersze z DB są prawdą; brakujący blok systemowy uzupełniony defaultem", () => {
    const rows = [
      row({ id: "a", block_type: "hero", sort_order: 3, visible: false }),
      row({ id: "b", block_type: "banner", sort_order: 1 }),
      row({ id: "c", block_type: "tiles", sort_order: 0, content: { heading: "X" } }),
    ];
    const out = mergeHomeBlocks(rows);
    // tiles(0), banner(1), featured(2 default), hero(3, ukryty), trust_bar(3 def), collections(4 def)
    expect(out.find((b) => b.block_type === "tiles")!.content.heading).toBe("X");
    expect(out.find((b) => b.block_type === "hero")!.visible).toBe(false);
    expect(out.some((b) => b.block_type === "featured")).toBe(true);
    expect(out.some((b) => b.block_type === "collections")).toBe(true);
    expect(out.filter((b) => b.block_type === "banner")).toHaveLength(1);
  });
  it("sortuje po sort_order z deterministycznym tie-breakiem po id", () => {
    const rows = [
      row({ id: "b", block_type: "banner", sort_order: 1 }),
      row({ id: "a", block_type: "gallery", sort_order: 1 }),
    ];
    const out = mergeHomeBlocks(rows).filter((b) => isContentBlockType(b.block_type));
    expect(out.map((b) => b.id)).toEqual(["a", "b"]);
  });
  it("ignoruje nieznane block_type (kompatybilność w przód)", () => {
    const out = mergeHomeBlocks([row({ block_type: "wideo" })]);
    expect(out.some((b) => b.block_type === "wideo")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — FAIL** (brak modułu)

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`

- [ ] **Step 3: Implementacja — utwórz `app/_lib/blocks.ts`**

```ts
// System bloków stron (spec 2026-07-14, krok B) — tabela page_blocks,
// migracja 52. Zastępuje home-sections.ts. Bloki SYSTEMOWE = dotychczasowe
// sekcje home (nieusuwalne, dedykowane case'y w page.tsx); bloki TREŚCIOWE =
// klocki dodawane przez admina (rejestr CONTENT_BLOCK_DEFS, render w
// app/_components/blocks/). Defaulty w kodzie odtwarzają dzisiejszy wygląd
// 1:1 (fail-open: brak tabeli/wierszy → strona jak dziś).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import type { Locale } from "./i18n";
import { pl } from "./dictionaries/pl";
import { de } from "./dictionaries/de";
import { createAdminClient } from "./supabase/server";

export const SYSTEM_BLOCK_TYPES = [
  "hero",
  "tiles",
  "featured",
  "trust_bar",
  "collections",
] as const;
export type SystemBlockType = (typeof SYSTEM_BLOCK_TYPES)[number];

export const CONTENT_BLOCK_TYPES = [
  "banner",
  "gallery",
  "products",
  "faq",
  "reviews",
] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

export type BlockType = SystemBlockType | ContentBlockType;

export function isSystemBlockType(v: string): v is SystemBlockType {
  return (SYSTEM_BLOCK_TYPES as readonly string[]).includes(v);
}
export function isContentBlockType(v: string): v is ContentBlockType {
  return (CONTENT_BLOCK_TYPES as readonly string[]).includes(v);
}

export type PageBlockRow = {
  id: string;
  page_id: string | null;
  block_type: string;
  sort_order: number;
  visible: boolean;
  content: Record<string, unknown>;
};

// Rejestr typów treściowych — nazwy/opisy dla galerii „Dodaj sekcję"
// (panel admina jest PL-only). defaultContent() zwraca ŚWIEŻY obiekt —
// nowy blok startuje jako ukryty z tą treścią.
export const CONTENT_BLOCK_DEFS: Record<
  ContentBlockType,
  { name: string; description: string; defaultContent: () => Record<string, unknown> }
> = {
  banner: {
    name: "Tekst + zdjęcie",
    description:
      "Nagłówek, akapit tekstu i zdjęcie (po lewej, prawej albo jako tło), opcjonalny przycisk z linkiem.",
    defaultContent: () => ({ heading: "", body: "", image_url: null, layout: "left" }),
  },
  gallery: {
    name: "Galeria zdjęć",
    description: "Siatka zdjęć (np. inspiracje, realizacje) z opcjonalnym nagłówkiem.",
    defaultContent: () => ({ heading: "", images: [] }),
  },
  products: {
    name: "Sekcja produktowa",
    description:
      "Wybrane produkty, kolekcja albo kategoria — siatka kafelków jak „Polecane".",
    defaultContent: () => ({ heading: "", source: "manual", product_ids: [], limit: 4 }),
  },
  faq: {
    name: "Pytania i odpowiedzi (FAQ)",
    description: "Rozwijana lista pytanie–odpowiedź.",
    defaultContent: () => ({ heading: "", items: [] }),
  },
  reviews: {
    name: "Opinie klientów",
    description: "Cytaty klientów z podpisem, w kartach obok siebie.",
    defaultContent: () => ({ heading: "", items: [] }),
  },
};

// Defaulty systemowe = dzisiejszy wygląd 1:1 (te same wartości co seed
// migracji 49 → przeniesione do page_blocks migracją 52). Id syntetyczne
// "system:<typ>" — realne uuid mają tylko wiersze z DB; akcje admina na
// syntetycznym id zwrócą błąd (stan możliwy tylko przed migracją 52).
export const DEFAULT_HOME_BLOCKS: PageBlockRow[] = [
  { id: "system:hero", page_id: null, block_type: "hero", sort_order: 0, visible: true, content: {} },
  { id: "system:tiles", page_id: null, block_type: "tiles", sort_order: 1, visible: true, content: { heading: pl.home.collectionsHeading, heading_de: de.home?.collectionsHeading ?? pl.home.collectionsHeading, subheading: pl.home.collectionsEyebrow, subheading_de: de.home?.collectionsEyebrow ?? pl.home.collectionsEyebrow } },
  { id: "system:featured", page_id: null, block_type: "featured", sort_order: 2, visible: true, content: { heading: pl.home.featuredHeading, heading_de: de.home?.featuredHeading ?? pl.home.featuredHeading } },
  { id: "system:trust_bar", page_id: null, block_type: "trust_bar", sort_order: 3, visible: true, content: { heading: pl.trustBar.heading, heading_de: de.trustBar?.heading ?? pl.trustBar.heading, subheading: pl.trustBar.eyebrow, subheading_de: de.trustBar?.eyebrow ?? pl.trustBar.eyebrow } },
  { id: "system:collections", page_id: null, block_type: "collections", sort_order: 4, visible: true, content: { heading: pl.home.seriesHeading, heading_de: de.home?.seriesHeading ?? pl.home.seriesHeading, subheading: pl.home.seriesEyebrow, subheading_de: de.home?.seriesEyebrow ?? pl.home.seriesEyebrow } },
];

// Scala wiersze z DB z gwarancjami: null (błąd) → defaulty; nieznane typy
// odpadają; każdy z 5 bloków systemowych obecny (brakujący → default,
// nieusuwalność odporna także na ręczne grzebanie w DB); wiersz z DB jest
// prawdą (content NIE jest głęboko scalany z defaultem — brak klucza
// nagłówka = świadomie wyczyszczone). Sort po sort_order, tie-break po id.
export function mergeHomeBlocks(rows: PageBlockRow[] | null): PageBlockRow[] {
  if (rows === null) return DEFAULT_HOME_BLOCKS.map((b) => ({ ...b }));
  const known = rows.filter(
    (r) => r && (isSystemBlockType(r.block_type) || isContentBlockType(r.block_type))
  );
  if (known.length === 0) return DEFAULT_HOME_BLOCKS.map((b) => ({ ...b }));
  const presentSystem = new Set(
    known.map((r) => r.block_type).filter(isSystemBlockType)
  );
  const missingDefaults = DEFAULT_HOME_BLOCKS.filter(
    (d) => !presentSystem.has(d.block_type as SystemBlockType)
  ).map((b) => ({ ...b }));
  return [...known, ...missingDefaults].sort(
    (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
  );
}
```

⚠️ Importy `cache`/`unstable_cache`/`createAdminClient` zostają na razie nieużyte (Task 5 je skonsumuje) — jeśli lint/tsc protestuje o nieużyte importy, DODAJ je dopiero w Tasku 5 zamiast na górze teraz.

- [ ] **Step 4: Uruchom test — PASS**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Run: `npx tsc --noEmit` — Expected: 0 błędów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/blocks.ts app/_lib/__tests__/blocks.test.ts
git commit -m "feat(bloki): rejestr typow, defaulty systemowe i merge page_blocks (TDD)"
```

---

### Task 3: `blocks.ts` — lokalizacja bloków (TDD)

**Files:**
- Modify: `app/_lib/blocks.ts`
- Test: `app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: typy/guardy z Taska 2
- Produces:
  - `type BannerLayout = "left" | "right" | "background"`
  - `type LocalizedBannerContent = { heading: string | null; body: string | null; image_url: string | null; layout: BannerLayout; cta_label: string | null; cta_href: string | null }`
  - `type LocalizedGalleryContent = { heading: string | null; images: { url: string; alt: string | null }[] }`
  - `type LocalizedProductsContent = { heading: string | null; source: "manual" | "collection" | "category"; product_ids: string[]; collection_slug: string | null; category_slug: string | null; limit: number }`
  - `type LocalizedFaqContent = { heading: string | null; items: { question: string; answer: string }[] }`
  - `type LocalizedReviewsContent = { heading: string | null; items: { quote: string; author: string | null }[] }`
  - `type LocalizedSystemBlock = { id: string; visible: boolean; type: SystemBlockType; heading: string | null; subheading: string | null }`
  - `type LocalizedContentBlock = { id: string; visible: boolean } & ({ type: "banner"; content: LocalizedBannerContent } | { type: "gallery"; content: LocalizedGalleryContent } | { type: "products"; content: LocalizedProductsContent } | { type: "faq"; content: LocalizedFaqContent } | { type: "reviews"; content: LocalizedReviewsContent })`
  - `type LocalizedBlock = LocalizedSystemBlock | LocalizedContentBlock`
  - `localizeBlock(row: PageBlockRow, locale: Locale): LocalizedBlock | null` (null dla nieznanego typu)

- [ ] **Step 1: Dopisz failing testy**

```ts
import { localizeBlock } from "@/app/_lib/blocks";

describe("localizeBlock — systemowe", () => {
  it("PL bierze heading/subheading, DE per-pole z fallbackiem PL", () => {
    const r = row({
      block_type: "trust_bar",
      content: { heading: "Dlaczego my?", heading_de: "Warum wir?", subheading: "MEBLE" },
    });
    const plB = localizeBlock(r, "pl")!;
    const deB = localizeBlock(r, "de")!;
    expect(plB).toMatchObject({ type: "trust_bar", heading: "Dlaczego my?", subheading: "MEBLE" });
    expect(deB).toMatchObject({ heading: "Warum wir?", subheading: "MEBLE" });
  });
  it("brak klucza nagłówka = wyczyszczone (null), NIE fallback na słownik", () => {
    const r = row({ block_type: "tiles", content: {} });
    expect(localizeBlock(r, "pl")).toMatchObject({ heading: null, subheading: null });
  });
});

describe("localizeBlock — treściowe", () => {
  it("banner: pola per locale, layout waliduje się do left przy śmieciu", () => {
    const r = row({
      block_type: "banner",
      content: {
        heading: "Salon marzeń", heading_de: "Traumsalon",
        body: "Opis", layout: "zle", image_url: "https://x/y.jpg",
        cta_label: "Zobacz", cta_href: "/sklep",
      },
    });
    const b = localizeBlock(r, "de")!;
    expect(b).toMatchObject({
      type: "banner",
      content: { heading: "Traumsalon", body: "Opis", layout: "left", cta_label: "Zobacz", cta_href: "/sklep" },
    });
  });
  it("gallery: odfiltrowuje wpisy bez url", () => {
    const r = row({
      block_type: "gallery",
      content: { images: [{ url: "https://x/a.jpg", alt: "A" }, { alt: "bez url" }, "smiec"] },
    });
    const b = localizeBlock(r, "pl")!;
    expect(b.type).toBe("gallery");
    if (b.type === "gallery") expect(b.content.images).toEqual([{ url: "https://x/a.jpg", alt: "A" }]);
  });
  it("products: normalizuje source i limit (clamp 1..12, default 4)", () => {
    const r = row({
      block_type: "products",
      content: { source: "collection", collection_slug: "lisbon", limit: 99 },
    });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "products") {
      expect(b.content).toMatchObject({ source: "collection", collection_slug: "lisbon", limit: 12, product_ids: [] });
    }
    const bad = localizeBlock(row({ block_type: "products", content: { source: "x" } }), "pl")!;
    if (bad.type === "products") expect(bad.content.source).toBe("manual");
  });
  it("faq/reviews: itemy z kompletem pól, DE per pole; puste odpadają", () => {
    const r = row({
      block_type: "faq",
      content: { items: [
        { question: "Q1", question_de: "F1", answer: "A1" },
        { question: "", answer: "bez pytania" },
      ] },
    });
    const b = localizeBlock(r, "de")!;
    if (b.type === "faq") expect(b.content.items).toEqual([{ question: "F1", answer: "A1" }]);
    const rv = localizeBlock(
      row({ block_type: "reviews", content: { items: [{ quote: "Super!", author: "Anna" }] } }),
      "pl"
    )!;
    if (rv.type === "reviews") expect(rv.content.items).toEqual([{ quote: "Super!", author: "Anna" }]);
  });
  it("nieznany typ → null", () => {
    expect(localizeBlock(row({ block_type: "wideo" }), "pl")).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — nowe FAILują**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`

- [ ] **Step 3: Implementacja w `blocks.ts`**

Dopisz (typy z bloku Interfaces powyżej — przepisz je dosłownie — oraz):

```ts
// ── Lokalizacja ──────────────────────────────────────────────────────────
// Bezpieczne czytanie z jsonb: string niepusty albo null.
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}
// DE per pole z fallbackiem PL (idiom repo; NIE ?? na całości).
function pickLoc(content: Record<string, unknown>, field: string, locale: Locale): string | null {
  const deVal = s(content[`${field}_de`]);
  return locale === "de" && deVal ? deVal : s(content[field]);
}
function clampLimit(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 4;
  return Math.min(12, Math.max(1, n));
}

export function localizeBlock(row: PageBlockRow, locale: Locale): LocalizedBlock | null {
  const c = row.content ?? {};
  const base = { id: row.id, visible: row.visible };
  if (isSystemBlockType(row.block_type)) {
    return {
      ...base,
      type: row.block_type,
      heading: pickLoc(c, "heading", locale),
      subheading: pickLoc(c, "subheading", locale),
    };
  }
  switch (row.block_type) {
    case "banner": {
      const rawLayout = c.layout;
      const layout: BannerLayout =
        rawLayout === "right" || rawLayout === "background" ? rawLayout : "left";
      return {
        ...base,
        type: "banner",
        content: {
          heading: pickLoc(c, "heading", locale),
          body: pickLoc(c, "body", locale),
          image_url: s(c.image_url),
          layout,
          cta_label: pickLoc(c, "cta_label", locale),
          cta_href: s(c.cta_href),
        },
      };
    }
    case "gallery": {
      const images = (Array.isArray(c.images) ? c.images : [])
        .map((img) => {
          if (typeof img !== "object" || img === null) return null;
          const o = img as Record<string, unknown>;
          const url = s(o.url);
          return url ? { url, alt: s(o.alt) } : null;
        })
        .filter((x): x is { url: string; alt: string | null } => x !== null);
      return { ...base, type: "gallery", content: { heading: pickLoc(c, "heading", locale), images } };
    }
    case "products": {
      const source =
        c.source === "collection" || c.source === "category" ? c.source : "manual";
      const product_ids = (Array.isArray(c.product_ids) ? c.product_ids : []).filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      return {
        ...base,
        type: "products",
        content: {
          heading: pickLoc(c, "heading", locale),
          source,
          product_ids,
          collection_slug: s(c.collection_slug),
          category_slug: s(c.category_slug),
          limit: clampLimit(c.limit),
        },
      };
    }
    case "faq": {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const o = it as Record<string, unknown>;
          const question = pickLoc(o, "question", locale);
          const answer = pickLoc(o, "answer", locale);
          return question && answer ? { question, answer } : null;
        })
        .filter((x): x is { question: string; answer: string } => x !== null);
      return { ...base, type: "faq", content: { heading: pickLoc(c, "heading", locale), items } };
    }
    case "reviews": {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const o = it as Record<string, unknown>;
          const quote = pickLoc(o, "quote", locale);
          return quote ? { quote, author: s(o.author) } : null;
        })
        .filter((x): x is { quote: string; author: string | null } => x !== null);
      return { ...base, type: "reviews", content: { heading: pickLoc(c, "heading", locale), items } };
    }
    default:
      return null; // nieznany typ — fail-open (kompatybilność w przód)
  }
}
```

- [ ] **Step 4: Uruchom — PASS** (`npx vitest run app/_lib/__tests__/blocks.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add app/_lib/blocks.ts app/_lib/__tests__/blocks.test.ts
git commit -m "feat(bloki): lokalizacja blokow systemowych i tresciowych (TDD)"
```

---

### Task 4: `blocks.ts` — walidacja treści per typ (TDD)

**Files:**
- Modify: `app/_lib/blocks.ts`
- Test: `app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: typy z Tasków 2-3
- Produces: `validateBlockContent(type: ContentBlockType, raw: unknown): { ok: true; content: Record<string, unknown> } | { ok: false; error: string }` — normalizuje (trim, obcięcia długości, czyszczenie pustych itemów) i wymusza minimum sensownej treści; komunikaty błędów PO POLSKU (widzi je koleżanka). Używane przez server actions (Task 9).

- [ ] **Step 1: Dopisz failing testy**

```ts
import { validateBlockContent } from "@/app/_lib/blocks";

describe("validateBlockContent", () => {
  it("banner: wymaga nagłówka; CTA wymaga pary etykieta+link; link tylko / lub https://", () => {
    expect(validateBlockContent("banner", { heading: "  " }).ok).toBe(false);
    expect(
      validateBlockContent("banner", { heading: "H", cta_label: "Zobacz" }).ok
    ).toBe(false);
    expect(
      validateBlockContent("banner", { heading: "H", cta_label: "Zobacz", cta_href: "javascript:x" }).ok
    ).toBe(false);
    const ok = validateBlockContent("banner", {
      heading: " H ", heading_de: "", body: "B", layout: "right",
      cta_label: "Zobacz", cta_href: "/sklep", image_url: "https://x/y.jpg",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.heading).toBe("H");        // trim
      expect(ok.content.heading_de).toBeUndefined(); // puste pola nie zaśmiecają jsonb
      expect(ok.content.layout).toBe("right");
    }
  });
  it("banner: zły layout odrzucony", () => {
    expect(validateBlockContent("banner", { heading: "H", layout: "diag" }).ok).toBe(false);
  });
  it("gallery: wymaga ≥1 zdjęcia, max 24, url https:// lub /", () => {
    expect(validateBlockContent("gallery", { images: [] }).ok).toBe(false);
    expect(
      validateBlockContent("gallery", { images: [{ url: "ftp://x" }] }).ok
    ).toBe(false);
    const many = { images: Array.from({ length: 25 }, (_, i) => ({ url: `https://x/${i}.jpg` })) };
    expect(validateBlockContent("gallery", many).ok).toBe(false);
    const ok = validateBlockContent("gallery", {
      heading: "G", images: [{ url: "https://x/a.jpg", alt: " A " }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((ok.content.images as { alt?: string }[])[0].alt).toBe("A");
  });
  it("products: manual wymaga ≥1 id (max 12); collection/category wymagają sluga", () => {
    expect(validateBlockContent("products", { source: "manual", product_ids: [] }).ok).toBe(false);
    expect(validateBlockContent("products", { source: "collection" }).ok).toBe(false);
    const ok = validateBlockContent("products", {
      heading: "P", source: "category", category_slug: "sofy", limit: 99,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.content.limit).toBe(12); // clamp
  });
  it("faq/reviews: wymaga ≥1 kompletnego itemu, max 20; puste itemy czyszczone", () => {
    expect(validateBlockContent("faq", { items: [{ question: "Q" }] }).ok).toBe(false);
    const ok = validateBlockContent("faq", {
      items: [{ question: " Q ", answer: "A" }, { question: "", answer: "" }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.content.items).toEqual([{ question: "Q", answer: "A" }]);
    expect(validateBlockContent("reviews", { items: [] }).ok).toBe(false);
    expect(validateBlockContent("reviews", { items: [{ quote: "Ok!", author: "" }] }).ok).toBe(true);
  });
  it("odrzuca nie-obiekt", () => {
    expect(validateBlockContent("banner", "zupa").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**, potem **Step 3: Implementacja**

Dopisz do `blocks.ts`:

```ts
// ── Walidacja treści (server actions) ────────────────────────────────────
// Normalizuje treść z formularza admina do czystego jsonb: trim, obcięcia,
// puste pola pomijane (bez kluczy-śmieci), itemy bez kompletu pól odpadają.
// Komunikaty PO POLSKU — widzi je administratorka w toaście.
type ValidationResult =
  | { ok: true; content: Record<string, unknown> }
  | { ok: false; error: string };

const MAX_SHORT = 200;   // nagłówki, etykiety, autorzy
const MAX_LONG = 2000;   // body, odpowiedzi, cytaty
const MAX_IMAGES = 24;
const MAX_ITEMS = 20;
const MAX_PRODUCTS = 12;

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}
function isSafeHref(href: string): boolean {
  return href.startsWith("/") || href.startsWith("https://");
}
// Para PL+DE → obiekt tylko z istniejącymi kluczami.
function locPair(o: Record<string, unknown>, field: string, max: number) {
  const out: Record<string, string> = {};
  const plV = cleanStr(o[field], max);
  const deV = cleanStr(o[`${field}_de`], max);
  if (plV) out[field] = plV;
  if (deV) out[`${field}_de`] = deV;
  return out;
}

export function validateBlockContent(
  type: ContentBlockType,
  raw: unknown
): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Nieprawidłowa treść sekcji" };
  }
  const o = raw as Record<string, unknown>;
  switch (type) {
    case "banner": {
      const heading = cleanStr(o.heading, MAX_SHORT);
      if (!heading) return { ok: false, error: "Nagłówek jest wymagany" };
      const layout = o.layout ?? "left";
      if (layout !== "left" && layout !== "right" && layout !== "background") {
        return { ok: false, error: "Nieprawidłowy układ banera" };
      }
      const ctaLabel = cleanStr(o.cta_label, MAX_SHORT);
      const ctaLabelDe = cleanStr(o.cta_label_de, MAX_SHORT);
      const ctaHref = cleanStr(o.cta_href, 500);
      if ((ctaLabel || ctaLabelDe) && !ctaHref) {
        return { ok: false, error: "Przycisk ma etykietę, ale brakuje linku" };
      }
      if (ctaHref && !isSafeHref(ctaHref)) {
        return { ok: false, error: "Link przycisku musi zaczynać się od / albo https://" };
      }
      if (ctaHref && !ctaLabel) {
        return { ok: false, error: "Przycisk ma link, ale brakuje etykiety" };
      }
      const imageUrl = cleanStr(o.image_url, 1000);
      if (imageUrl && !isSafeHref(imageUrl)) {
        return { ok: false, error: "Adres zdjęcia musi zaczynać się od / albo https://" };
      }
      return {
        ok: true,
        content: {
          heading,
          ...locPair(o, "heading", MAX_SHORT).heading_de ? { heading_de: locPair(o, "heading", MAX_SHORT).heading_de } : {},
          ...locPair(o, "body", MAX_LONG),
          ...(imageUrl ? { image_url: imageUrl } : {}),
          layout,
          ...(ctaLabel ? { cta_label: ctaLabel } : {}),
          ...(ctaLabelDe ? { cta_label_de: ctaLabelDe } : {}),
          ...(ctaHref ? { cta_href: ctaHref } : {}),
        },
      };
    }
    case "gallery": {
      const rawImages = Array.isArray(o.images) ? o.images : [];
      const images = rawImages
        .map((img) => {
          if (typeof img !== "object" || img === null) return null;
          const io = img as Record<string, unknown>;
          const url = cleanStr(io.url, 1000);
          if (!url || !isSafeHref(url)) return null;
          const alt = cleanStr(io.alt, MAX_SHORT);
          return { url, ...(alt ? { alt } : {}) };
        })
        .filter((x): x is { url: string; alt?: string } => x !== null);
      if (images.length === 0) return { ok: false, error: "Dodaj przynajmniej jedno zdjęcie" };
      if (images.length > MAX_IMAGES) {
        return { ok: false, error: `Maksymalnie ${MAX_IMAGES} zdjęć w galerii` };
      }
      return { ok: true, content: { ...locPair(o, "heading", MAX_SHORT), images } };
    }
    case "products": {
      const source =
        o.source === "collection" || o.source === "category" ? o.source : "manual";
      const content: Record<string, unknown> = {
        ...locPair(o, "heading", MAX_SHORT),
        source,
        limit: clampLimit(o.limit),
      };
      if (source === "manual") {
        const ids = (Array.isArray(o.product_ids) ? o.product_ids : [])
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .slice(0, MAX_PRODUCTS);
        if (ids.length === 0) return { ok: false, error: "Wybierz przynajmniej jeden produkt" };
        content.product_ids = ids;
      } else if (source === "collection") {
        const slug = cleanStr(o.collection_slug, MAX_SHORT);
        if (!slug) return { ok: false, error: "Wybierz kolekcję" };
        content.collection_slug = slug;
      } else {
        const slug = cleanStr(o.category_slug, MAX_SHORT);
        if (!slug) return { ok: false, error: "Wybierz kategorię" };
        content.category_slug = slug;
      }
      return { ok: true, content };
    }
    case "faq":
    case "reviews": {
      const isFaq = type === "faq";
      const rawItems = Array.isArray(o.items) ? o.items : [];
      const items = rawItems
        .map((it) => {
          if (typeof it !== "object" || it === null) return null;
          const io = it as Record<string, unknown>;
          if (isFaq) {
            const q = locPair(io, "question", MAX_SHORT);
            const a = locPair(io, "answer", MAX_LONG);
            return q.question && a.answer ? { ...q, ...a } : null;
          }
          const quote = locPair(io, "quote", MAX_LONG);
          const author = cleanStr(io.author, MAX_SHORT);
          return quote.quote ? { ...quote, ...(author ? { author } : {}) } : null;
        })
        .filter((x): x is Record<string, string> => x !== null);
      if (items.length === 0) {
        return {
          ok: false,
          error: isFaq ? "Dodaj przynajmniej jedno pytanie z odpowiedzią" : "Dodaj przynajmniej jedną opinię",
        };
      }
      if (items.length > MAX_ITEMS) {
        return { ok: false, error: `Maksymalnie ${MAX_ITEMS} pozycji` };
      }
      return { ok: true, content: { ...locPair(o, "heading", MAX_SHORT), items } };
    }
  }
}
```

⚠️ W gałęzi `banner`: podwójne wywołanie `locPair(o, "heading", ...)` jak wyżej jest brzydkie — uprość do zmiennej lokalnej `const headingPair = locPair(o, "heading", MAX_SHORT);` i użyj `...(headingPair.heading_de ? { heading_de: headingPair.heading_de } : {})` (heading już zwalidowany osobno). Test tego nie rozróżnia — liczy się wynik.

- [ ] **Step 4: Uruchom — PASS** (`npx vitest run app/_lib/__tests__/blocks.test.ts`), `npx tsc --noEmit` — 0 błędów.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/blocks.ts app/_lib/__tests__/blocks.test.ts
git commit -m "feat(bloki): walidacja tresci blokow per typ (TDD)"
```

---

### Task 5: `blocks.ts` — fetch z cache + odczyt admina + inwalidacja

**Files:**
- Modify: `app/_lib/blocks.ts`

**Interfaces:**
- Consumes: `mergeHomeBlocks`, `PageBlockRow` (Task 2)
- Produces: `PAGE_BLOCKS_CACHE_TAG = "page-blocks"`, `getHomeBlocks(): Promise<PageBlockRow[]>` (cache 60 s), `getAllHomeBlocksAdmin(): Promise<PageBlockRow[]>` (świeży), `invalidatePageBlocksCache(): void`

- [ ] **Step 1: Dopisz do `blocks.ts`** (importy `cache`, `unstable_cache, revalidateTag`, `createAdminClient` — jeśli nie zostały dodane w Tasku 2):

```ts
export const PAGE_BLOCKS_CACHE_TAG = "page-blocks";

// Cross-request cache (wzorzec home-sections/trust-items). Wewnątrz
// unstable_cache nie wolno cookies() — createAdminClient jest bez cookies.
// Błąd/brak tabeli → null → mergeHomeBlocks zwraca defaulty (fail-open,
// sklep nigdy nie pada przez brak migracji 52).
const fetchHomeBlocks = unstable_cache(
  async (): Promise<PageBlockRow[] | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("page_blocks")
      .select("id, page_id, block_type, sort_order, visible, content")
      .is("page_id", null)
      .order("sort_order", { ascending: true });
    if (error || !data) return null;
    return data as PageBlockRow[];
  },
  ["home-blocks"],
  { tags: [PAGE_BLOCKS_CACHE_TAG], revalidate: 60 }
);

export const getHomeBlocks = cache(async (): Promise<PageBlockRow[]> =>
  mergeHomeBlocks(await fetchHomeBlocks())
);

// Admin: świeży odczyt bez cache (po mutacji router.refresh() widzi zmiany).
export async function getAllHomeBlocksAdmin(): Promise<PageBlockRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .select("id, page_id, block_type, sort_order, visible, content")
    .is("page_id", null)
    .order("sort_order", { ascending: true });
  if (error) console.error("getAllHomeBlocksAdmin:", error.message);
  return mergeHomeBlocks(error ? null : ((data ?? []) as PageBlockRow[]));
}

export function invalidatePageBlocksCache(): void {
  revalidateTag(PAGE_BLOCKS_CACHE_TAG, "max");
}
```

- [ ] **Step 2: Weryfikacja**

Run: `npx tsc --noEmit` — 0 błędów. Run: `npm test` — wszystko zielone (bez nowych testów jedn. — integracja; regresję łapie suita).

- [ ] **Step 3: Commit**

```bash
git add app/_lib/blocks.ts
git commit -m "feat(bloki): fetch page_blocks z cache (tag page-blocks) + odczyt admina"
```

---

### Task 6: Renderery prezentacyjne — Banner, Gallery, FAQ, Reviews

**Files:**
- Create: `app/_components/blocks/BannerBlock.tsx`
- Create: `app/_components/blocks/GalleryBlock.tsx`
- Create: `app/_components/blocks/FaqBlock.tsx` (client — akordeon)
- Create: `app/_components/blocks/ReviewsBlock.tsx`

**Interfaces:**
- Consumes: `LocalizedBannerContent`/`LocalizedGalleryContent`/`LocalizedFaqContent`/`LocalizedReviewsContent` z `@/app/_lib/blocks` (Task 3); `LocalizedLink` z `@/app/_components/layout/... ` — sprawdź faktyczną ścieżkę importu `LocalizedLink` w `app/page.tsx` i użyj tej samej.
- Produces: `BannerBlock({ content })`, `GalleryBlock({ content })`, `FaqBlock({ content })`, `ReviewsBlock({ content })` — każdy zwraca `null` przy braku minimalnej treści (defensywnie: nowy blok ukryty ma pustą treść, ale renderer i tak nie może się wywalić).

Wzorce (Global Constraints + kanon z `app/page.tsx`): nagłówek sekcji wycentrowany = `<div className="text-center mb-16">` + `<h2 className="font-display text-4xl font-bold text-[var(--fg)]">`; sekcja `max-w-7xl mx-auto px-6 py-24`.

- [ ] **Step 1: `BannerBlock.tsx`**

```tsx
import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { LocalizedBannerContent } from "@/app/_lib/blocks";

// CTA: wewnętrzne ścieżki przez LocalizedLink (zachowuje /de), zewnętrzne <a>.
function Cta({ label, href }: { label: string; href: string }) {
  const cls =
    "inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors";
  if (href.startsWith("/")) {
    return (
      <LocalizedLink href={href} className={cls}>
        {label}
      </LocalizedLink>
    );
  }
  return (
    <a href={href} rel="noopener noreferrer" className={cls}>
      {label}
    </a>
  );
}

export default function BannerBlock({ content }: { content: LocalizedBannerContent }) {
  const { heading, body, image_url, layout, cta_label, cta_href } = content;
  if (!heading && !body && !image_url) return null;

  const text = (
    <div className={layout === "background" ? "max-w-2xl mx-auto text-center" : ""}>
      {heading && (
        <h2
          className={`font-display text-4xl font-bold mb-6 ${
            layout === "background" ? "text-white" : "text-[var(--fg)]"
          }`}
        >
          {heading}
        </h2>
      )}
      {body && (
        <p
          className={`whitespace-pre-wrap leading-relaxed mb-8 ${
            layout === "background" ? "text-white/90" : "text-[var(--muted)]"
          }`}
        >
          {body}
        </p>
      )}
      {cta_label && cta_href && <Cta label={cta_label} href={cta_href} />}
    </div>
  );

  if (layout === "background") {
    return (
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="relative rounded-2xl overflow-hidden min-h-[380px] flex items-center justify-center px-6 py-16 bg-[var(--color-navy)]">
          {image_url && (
            <Image src={image_url} alt={heading ?? ""} fill className="object-cover" />
          )}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div className="relative">{text}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
        {image_url && (
          <div
            className={`relative aspect-[4/3] rounded-2xl overflow-hidden ${
              layout === "right" ? "md:order-2" : ""
            }`}
          >
            <Image src={image_url} alt={heading ?? ""} fill className="object-cover" />
          </div>
        )}
        {text}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `GalleryBlock.tsx`**

```tsx
import Image from "next/image";
import type { LocalizedGalleryContent } from "@/app/_lib/blocks";

export default function GalleryBlock({ content }: { content: LocalizedGalleryContent }) {
  const { heading, images } = content;
  if (images.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((img, i) => (
          <div key={`${img.url}-${i}`} className="relative aspect-square rounded-2xl overflow-hidden">
            <Image src={img.url} alt={img.alt ?? ""} fill className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `FaqBlock.tsx`** (client — jedyny z interakcją; wzorzec wizualny `TextSection` z `ProductDescriptionSections.tsx`, ale treść to CZYSTY TEKST — żadnego dangerouslySetInnerHTML):

```tsx
"use client";

import { useState } from "react";
import type { LocalizedFaqContent } from "@/app/_lib/blocks";

export default function FaqBlock({ content }: { content: LocalizedFaqContent }) {
  const { heading, items } = content;
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  if (items.length === 0) return null;

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="border-t border-[var(--border)]">
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <div key={i} className="border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-display text-lg md:text-xl font-semibold text-[var(--fg)]">
                  {item.question}
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <p className="pb-5 whitespace-pre-wrap leading-relaxed text-[var(--muted)]">
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `ReviewsBlock.tsx`**

```tsx
import type { LocalizedReviewsContent } from "@/app/_lib/blocks";

export default function ReviewsBlock({ content }: { content: LocalizedReviewsContent }) {
  const { heading, items } = content;
  if (items.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map((item, i) => (
          <figure
            key={i}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4"
          >
            <span aria-hidden="true" className="font-display text-5xl leading-none text-[var(--color-gold)]">
              „
            </span>
            <blockquote className="whitespace-pre-wrap leading-relaxed text-[var(--fg)] flex-1">
              {item.quote}
            </blockquote>
            {item.author && (
              <figcaption className="text-sm text-[var(--muted)]">— {item.author}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Weryfikacja + commit**

Sprawdź ścieżkę importu `LocalizedLink` (grep w `app/page.tsx`) i popraw w BannerBlock jeśli inna niż `@/app/_components/ui/LocalizedLink`. Run: `npx tsc --noEmit` — 0 błędów; `npm test` — zielone.

```bash
git add app/_components/blocks/
git commit -m "feat(bloki): renderery banner/galeria/FAQ/opinie w design systemie sklepu"
```

---

### Task 7: Blok produktowy + dispatcher `ContentBlock`

**Files:**
- Create: `app/_lib/block-products.ts`
- Create: `app/_components/blocks/ProductsBlock.tsx` (async server)
- Create: `app/_components/blocks/ContentBlock.tsx` (dispatcher)

**Interfaces:**
- Consumes: `LocalizedProductsContent`, `LocalizedContentBlock` (Task 3); komponenty z Taska 6; `getUserWishlistIds` (`@/app/_lib/wishlist`), `getEurRate` (`@/app/_lib/store-settings`), `getCategories` (`@/app/_lib/categories`), `localizeProduct` (`@/app/_lib/localize`), `createClient` (`@/app/_lib/supabase/server`), `ProductCard` (`@/app/_components/ui/ProductCard`), słownik `t.home.seeAll`.
- Produces: `getBlockProducts(content: LocalizedProductsContent, locale: Locale): Promise<Product[]>`; `ProductsBlock({ content, locale })`; `ContentBlock({ block, locale }: { block: LocalizedContentBlock; locale: Locale })`.

- [ ] **Step 1: `app/_lib/block-products.ts`**

```ts
// Produkty dla bloku "products" (sekcja produktowa z admina).
// Klient anon (createClient) — RLS is_active odfiltrowuje ukryte produkty.
// Bez cache: strona i tak renderuje się per request (cookies/wishlist),
// a źródła (kolekcja/kategoria/ręczny wybór) zmieniają się w adminie.

import { createClient } from "./supabase/server";
import { localizeProduct } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Product } from "./types";
import type { LocalizedProductsContent } from "./blocks";

export async function getBlockProducts(
  content: LocalizedProductsContent,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]> {
  const supabase = await createClient();

  if (content.source === "manual") {
    if (content.product_ids.length === 0) return [];
    const { data } = await supabase
      .from("products")
      .select("*")
      .in("id", content.product_ids);
    const byId = new Map(((data ?? []) as Product[]).map((p) => [p.id, p]));
    // Kolejność = kolejność wyboru admina; usunięte/ukryte produkty odpadają.
    return content.product_ids
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined)
      .map((p) => localizeProduct(p, locale));
  }

  if (content.source === "collection") {
    if (!content.collection_slug) return [];
    const { data: coll } = await supabase
      .from("collections")
      .select("id")
      .eq("slug", content.collection_slug)
      .maybeSingle();
    if (!coll) return [];
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("collection_id", (coll as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(content.limit);
    return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
  }

  // category
  if (!content.category_slug) return [];
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("category", content.category_slug)
    .order("created_at", { ascending: false })
    .limit(content.limit);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}
```

- [ ] **Step 2: `ProductsBlock.tsx`** (async server component — naśladuje sekcję „featured" z page.tsx: `py-24`, wrapper `max-w-7xl mx-auto px-6`, header flex z linkiem „Wszystkie →", grid `lg:grid-cols-4 gap-6`; bez badge i ratingu — jak featured):

```tsx
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ProductCard from "@/app/_components/ui/ProductCard";
import { getBlockProducts } from "@/app/_lib/block-products";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { getEurRate } from "@/app/_lib/store-settings";
import { getCategories } from "@/app/_lib/categories";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";
import type { LocalizedProductsContent } from "@/app/_lib/blocks";

export default async function ProductsBlock({
  content,
  locale,
}: {
  content: LocalizedProductsContent;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const [products, wishlistIds, rate, categories] = await Promise.all([
    getBlockProducts(content, locale),
    getUserWishlistIds(), // React.cache — deduplikacja z resztą strony
    getEurRate(),
    getCategories(locale),
  ]);
  if (products.length === 0) return null;
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.label]));

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-16">
          <div>
            {content.heading && (
              <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                {content.heading}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryLabel={categoryLabels.get(product.category)}
              isInWishlist={wishlistIds.has(product.id)}
              locale={locale}
              rate={rate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `ContentBlock.tsx`** (dispatcher, server):

```tsx
import BannerBlock from "./BannerBlock";
import GalleryBlock from "./GalleryBlock";
import ProductsBlock from "./ProductsBlock";
import FaqBlock from "./FaqBlock";
import ReviewsBlock from "./ReviewsBlock";
import type { LocalizedContentBlock } from "@/app/_lib/blocks";
import type { Locale } from "@/app/_lib/i18n";

// Blok treściowy → komponent. Typy systemowe renderuje page.tsx we własnych
// case'ach (mają dane strony: slajdy, kafelki, kolekcje).
export default function ContentBlock({
  block,
  locale,
}: {
  block: LocalizedContentBlock;
  locale: Locale;
}) {
  switch (block.type) {
    case "banner":
      return <BannerBlock content={block.content} />;
    case "gallery":
      return <GalleryBlock content={block.content} />;
    case "products":
      return <ProductsBlock content={block.content} locale={locale} />;
    case "faq":
      return <FaqBlock content={block.content} />;
    case "reviews":
      return <ReviewsBlock content={block.content} />;
  }
}
```

- [ ] **Step 4: Weryfikacja + commit**

Sprawdź faktyczne ścieżki importów (`getEurRate` w `app/_lib/store-settings.ts`? `getCategories` sygnatura z locale?) — grep zanim skompilujesz. Run: `npx tsc --noEmit` — 0; `npm test` — zielone.

```bash
git add app/_lib/block-products.ts app/_components/blocks/
git commit -m "feat(bloki): sekcja produktowa (manual/kolekcja/kategoria) + dispatcher ContentBlock"
```

---

### Task 8: Integracja `page.tsx` — home renderuje z `page_blocks`

**Files:**
- Modify: `app/page.tsx` (importy linie 20-24; `Promise.all` linia 73; lokalizacja linia 75; `sectionHeader` linia 87; `renderSection` linie 105-275; render linie 279-283)
- Modify: `app/_components/ui/TrustBar.tsx:14` (komentarz)

**Interfaces:**
- Consumes: `getHomeBlocks`, `localizeBlock`, `type LocalizedBlock`, `isSystemBlockType` z `@/app/_lib/blocks`; `ContentBlock` z `@/app/_components/blocks/ContentBlock`.
- Produces: home renderuje bloki (systemowe + treściowe) wg `page_blocks`. `app/_lib/home-sections.ts` NA RAZIE ZOSTAJE (używa go admin — usunięcie w Tasku 10).

- [ ] **Step 1: Podmień importy i fetch**

W `app/page.tsx` USUŃ import z `@/app/_lib/home-sections` i DODAJ:

```ts
import {
  getHomeBlocks,
  localizeBlock,
  type LocalizedBlock,
} from "@/app/_lib/blocks";
import ContentBlock from "@/app/_components/blocks/ContentBlock";
```

W `Promise.all` zamień `getHomeSections()` na `getHomeBlocks()` (zmienna `dbSections` → `dbBlocks`). Zamień lokalizację (linia 75) na:

```ts
  const blocks = dbBlocks
    .map((b) => localizeBlock(b, locale))
    .filter((b): b is LocalizedBlock => b !== null);
```

- [ ] **Step 2: Dostosuj `sectionHeader` i `renderSection`**

`sectionHeader` zmienia tylko typ argumentu — przyjmuje `{ heading: string | null; subheading: string | null }` (ciało bez zmian):

```ts
  function sectionHeader(s: { heading: string | null; subheading: string | null }) {
```

`renderSection(s: LocalizedHomeSection)` przemianuj na `renderBlock(b: LocalizedBlock)`; switch przełącz z `s.key` na dyskryminant:

```tsx
  function renderBlock(b: LocalizedBlock): ReactNode {
    switch (b.type) {
      case "hero":
        // ... (dotychczasowe ciało case'a "hero" BEZ ZMIAN)
      case "tiles":
        // ... (dotychczasowe ciało; sectionHeader(s) → sectionHeader(b))
      case "featured":
        // ... (dotychczasowe ciało; s.heading → b.heading)
      case "trust_bar":
        // ... (dotychczasowe ciało; heading={s.heading} eyebrow={s.subheading}
        //      → heading={b.heading} eyebrow={b.subheading})
      case "collections":
        // ... (dotychczasowe ciało; sectionHeader(s) → sectionHeader(b))
      default:
        // Bloki treściowe — wspólny dispatcher.
        return <ContentBlock block={b} locale={locale} />;
    }
  }
```

UWAGA: ciała case'ów systemowych przenosisz 1:1 (zamieniając tylko `s.` na `b.`) — ŻADNYCH zmian w JSX. `default` musi być zwężone przez TS do `LocalizedContentBlock` (dyskryminowana unia — jeśli tsc protestuje, dodaj po case'ach systemowych `return <ContentBlock block={b} locale={locale} />;` bez `default`, TS zawęzi resztę unii).

Render na dole (linie 279-283): `sections.filter((s) => s.visible).map(...)` → `blocks.filter((b) => b.visible).map((b) => <Fragment key={b.id}>{renderBlock(b)}</Fragment>)`.

- [ ] **Step 3: Komentarz w TrustBar**

W `app/_components/ui/TrustBar.tsx` linia 14 zamień komentarz `// Nagłówek sekcji z home_sections (admin) — fallback na słownik.` na `// Nagłówek sekcji z page_blocks (admin) — fallback na słownik.`

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` — 0 błędów. Run: `npm test` — zielone. Run: `npm run dev` i sprawdź `http://localhost:3000/` oraz `http://localhost:3000/de` — strona wygląda JAK DZIŚ (tabela `page_blocks` nie istnieje → fail-open defaulty; w logu dopuszczalny błąd „relation page_blocks does not exist" z fetcha — strona ma działać mimo niego). Zatrzymaj dev server.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/_components/ui/TrustBar.tsx
git commit -m "feat(bloki): home renderuje sekcje z page_blocks (systemowe + tresciowe)"
```

---

### Task 9: Server actions bloków

**Files:**
- Modify: `app/admin/strona-glowna/actions.ts` (plik `"use server"` — TYLKO async funkcje, zero `export type`)

**Interfaces:**
- Consumes: `isContentBlockType`, `SYSTEM_BLOCK_TYPES`, `CONTENT_BLOCK_DEFS`, `validateBlockContent`, `invalidatePageBlocksCache` z `@/app/_lib/blocks`; istniejące `requireAdmin`, `createAdminClient`, `ActionResult` (z `@/app/_lib/types`), helpery `sanitize`/`emptyToNull` i `revalidateHome()` już w pliku.
- Produces (wołane przez Taski 10-12):
  - `updateSystemBlockHeadings(formData: FormData): Promise<ActionResult>` — pola: `id`, `heading`, `heading_de`, `subheading`, `subheading_de`
  - `addContentBlock(formData: FormData): Promise<ActionResult>` — pole `type`; nowy blok ląduje na końcu, **ukryty**
  - `updateContentBlock(id: string, rawContent: unknown): Promise<ActionResult>`
  - `deleteContentBlock(formData: FormData): Promise<ActionResult>` — pole `id`; systemowych nie usuwa
  - `togglePageBlockVisible(formData: FormData): Promise<ActionResult>` — pola `id`, `visible` ("1"/"0")
  - `reorderPageBlocks(ids: string[]): Promise<ActionResult>` — RPC `reorder_page_blocks`
- STARE akcje sekcji (`updateHomeSection`, `toggleHomeSectionVisible`, `reorderHomeSections`) ZOSTAJĄ w tym tasku (używa ich jeszcze stary edytor) — usunie je Task 12.

- [ ] **Step 1: Rozszerz importy i `revalidateHome`**

Dodaj do importów w `actions.ts`:

```ts
import {
  isContentBlockType,
  SYSTEM_BLOCK_TYPES,
  CONTENT_BLOCK_DEFS,
  validateBlockContent,
  invalidatePageBlocksCache,
} from "@/app/_lib/blocks";
```

W funkcji `revalidateHome()` dodaj PIERWSZĄ linię `invalidatePageBlocksCache();` (obok istniejącego `invalidateHomeSectionsCache()` — stare wywołanie usunie Task 12).

- [ ] **Step 2: Dopisz akcje bloków (na końcu pliku)**

```ts
// ============================================================
// Bloki strony głównej (page_blocks, migracja 52)
// ============================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Id syntetyczne ("system:hero") ma tylko stan sprzed migracji 52.
function requireBlockId(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
}
const NO_ROW_ERROR =
  "Sekcja nie ma jeszcze wpisu w bazie (migracja 52 nie została uruchomiona)";

export async function updateSystemBlockHeadings(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  // System content = wyłącznie nagłówki; zapis w całości (brak klucza po
  // wyczyszczeniu pola = świadomie puste — semantyka undefined-vs-null z kroku 1).
  const content: Record<string, string> = {};
  for (const field of ["heading", "heading_de", "subheading", "subheading_de"]) {
    const v = emptyToNull(sanitize(formData.get(field)));
    if (v !== null) content[field] = v;
  }
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .update({ content, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .in("block_type", [...SYSTEM_BLOCK_TYPES])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono sekcji" };
  revalidateHome();
  return { ok: true, message: "Zapisano nagłówki" };
}

export async function addContentBlock(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const type = formData.get("type");
  if (typeof type !== "string" || !isContentBlockType(type)) {
    return { ok: false, error: "Nieznany typ sekcji" };
  }
  const supabase = await createAdminClient();
  const { data: maxRows } = await supabase
    .from("page_blocks")
    .select("sort_order")
    .is("page_id", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder =
    ((maxRows?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("page_blocks").insert({
    page_id: null,
    block_type: type,
    sort_order: nextOrder,
    visible: false, // nowa sekcja ukryta — koleżanka wypełnia treść i włącza
    content: CONTENT_BLOCK_DEFS[type].defaultContent(),
  } as never);
  if (error) return { ok: false, error: error.message };
  revalidateHome();
  return {
    ok: true,
    message: `Dodano sekcję „${CONTENT_BLOCK_DEFS[type].name}" (ukryta) — uzupełnij treść i włącz widoczność`,
  };
}

export async function updateContentBlock(
  id: string,
  rawContent: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const blockId = requireBlockId(id);
  if (!blockId) return { ok: false, error: NO_ROW_ERROR };
  const supabase = await createAdminClient();
  const { data: row, error: readError } = await supabase
    .from("page_blocks")
    .select("block_type")
    .eq("id", blockId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  const blockType = (row as { block_type: string } | null)?.block_type;
  if (!blockType || !isContentBlockType(blockType)) {
    return { ok: false, error: "Nie znaleziono sekcji do edycji" };
  }
  const valid = validateBlockContent(blockType, rawContent);
  if (!valid.ok) return { ok: false, error: valid.error };
  const { error } = await supabase
    .from("page_blocks")
    .update({ content: valid.content, updated_at: new Date().toISOString() } as never)
    .eq("id", blockId);
  if (error) return { ok: false, error: error.message };
  revalidateHome();
  return { ok: true, message: "Zapisano treść sekcji" };
}

export async function deleteContentBlock(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  const supabase = await createAdminClient();
  // Guard w zapytaniu: systemowych nie da się usunąć nawet spreparowanym requestem.
  const { data, error } = await supabase
    .from("page_blocks")
    .delete()
    .eq("id", id)
    .not("block_type", "in", `(${[...SYSTEM_BLOCK_TYPES].join(",")})`)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Nie znaleziono sekcji (systemowych nie można usuwać)" };
  }
  revalidateHome();
  return { ok: true, message: "Usunięto sekcję" };
}

export async function togglePageBlockVisible(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = requireBlockId(formData.get("id"));
  if (!id) return { ok: false, error: NO_ROW_ERROR };
  const visible = formData.get("visible") === "1";
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .update({ visible, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono sekcji" };
  revalidateHome();
  return { ok: true, message: visible ? "Sekcja widoczna" : "Sekcja ukryta" };
}

export async function reorderPageBlocks(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return { ok: false, error: "Nieprawidłowa kolejność sekcji" };
  }
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_page_blocks", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };
  revalidateHome();
  return { ok: true, message: "Zmieniono kolejność" };
}
```

- [ ] **Step 3: Weryfikacja + commit**

Run: `npx tsc --noEmit` — 0 błędów; `npm test` — zielone.

```bash
git add app/admin/strona-glowna/actions.ts
git commit -m "feat(admin): akcje blokow strony glownej (CRUD + widocznosc + reorder RPC)"
```

---

### Task 10: Formularze treści — AddBlockModal, Banner, Gallery

**Files:**
- Create: `app/admin/strona-glowna/AddBlockModal.tsx`
- Create: `app/admin/strona-glowna/BlockForms.tsx` (w tym tasku: typy wspólne + `BannerForm` + `GalleryForm`; Task 11 dopisze resztę do TEGO SAMEGO pliku)

**Interfaces:**
- Consumes: akcje z Taska 9; `CONTENT_BLOCK_DEFS`, `CONTENT_BLOCK_TYPES`, `type PageBlockRow`, `type ContentBlockType` z `@/app/_lib/blocks`; `useImageUpload` z `@/app/admin/produkty/[id]/useImageUpload` (drag-and-drop + kompresja + upload do bucketa `products`); `Field`, `inputCls` (sprawdź faktyczne nazwy eksportów w `app/admin/_shared.tsx` — Explore wskazuje `Card, Field, ToastView, inputCls, Toast`); `ActionResult` z `@/app/_lib/types`.
- Produces:
  - `AddBlockModal({ onClose, onResult }: { onClose: () => void; onResult: (r: ActionResult) => void })`
  - w `BlockForms.tsx`: `type BlockFormProps = { block: PageBlockRow; onResult: (r: ActionResult) => void }`, helpery `cs(v: unknown): string` (content-string) i `SaveButton`, `BannerForm(props: BlockFormProps)`, `GalleryForm(props: BlockFormProps)`
  - eksport `type BlockPickerData = { products: { id: string; name: string }[]; collections: { slug: string; label: string }[]; categories: { slug: string; label: string }[] }` (użyje go ProductsForm w Tasku 11 i BlocksEditor w Tasku 12)

- [ ] **Step 1: `AddBlockModal.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { addContentBlock } from "./actions";
import {
  CONTENT_BLOCK_DEFS,
  CONTENT_BLOCK_TYPES,
  type ContentBlockType,
} from "@/app/_lib/blocks";
import type { ActionResult } from "@/app/_lib/types";

// Galeria typów sekcji — wzorzec modala jak ConfirmDialog (fixed overlay + karta).
export default function AddBlockModal({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (r: ActionResult) => void;
}) {
  const [adding, startTransition] = useTransition();

  function add(type: ContentBlockType) {
    const fd = new FormData();
    fd.set("type", type);
    startTransition(async () => {
      const res = await addContentBlock(fd);
      onResult(res);
      if (res.ok) onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dodaj sekcję"
    >
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Dodaj sekcję
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Nowa sekcja trafia na koniec strony jako ukryta — uzupełnij treść
          i włącz widoczność, gdy będzie gotowa.
        </p>
        <div className="flex flex-col gap-2">
          {CONTENT_BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              disabled={adding}
              className="text-left border border-[var(--border)] rounded-xl p-4 hover:border-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              <p className="font-display text-base font-semibold text-[var(--fg)]">
                {CONTENT_BLOCK_DEFS[type].name}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {CONTENT_BLOCK_DEFS[type].description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `BlockForms.tsx` — szkielet wspólny + BannerForm + GalleryForm**

```tsx
"use client";

// Formularze treści bloków (panel admina, PL-only). Każdy formularz trzyma
// lokalny stan zbudowany z block.content (surowy jsonb) i na zapis wysyła
// obiekt treści do updateContentBlock — walidacja jest po stronie serwera
// (validateBlockContent), toast z błędem wraca przez onResult.

import { useState, useTransition } from "react";
import Image from "next/image";
import { updateContentBlock } from "./actions";
import { useImageUpload } from "@/app/admin/produkty/[id]/useImageUpload";
import type { PageBlockRow } from "@/app/_lib/blocks";
import type { ActionResult } from "@/app/_lib/types";
import { Field, inputCls } from "@/app/admin/_shared";

export type BlockFormProps = {
  block: PageBlockRow;
  onResult: (r: ActionResult) => void;
};

export type BlockPickerData = {
  products: { id: string; name: string }[];
  collections: { slug: string; label: string }[];
  categories: { slug: string; label: string }[];
};

// Bezpieczny odczyt stringa z jsonb do kontrolowanego inputa.
export function cs(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function SaveButton({ saving }: { saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      data-guard-save
      className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
    >
      {saving ? "Zapisuję..." : "Zapisz sekcję"}
    </button>
  );
}

// ── Banner (tekst + zdjęcie) ─────────────────────────────────────────────

export function BannerForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [body, setBody] = useState(cs(c.body));
  const [bodyDe, setBodyDe] = useState(cs(c.body_de));
  const [layout, setLayout] = useState(cs(c.layout) || "left");
  const [imageUrl, setImageUrl] = useState(cs(c.image_url));
  const [ctaLabel, setCtaLabel] = useState(cs(c.cta_label));
  const [ctaLabelDe, setCtaLabelDe] = useState(cs(c.cta_label_de));
  const [ctaHref, setCtaHref] = useState(cs(c.cta_href));
  const [saving, startTransition] = useTransition();

  const upload = useImageUpload({
    onUploaded: (urls) => {
      if (urls[0]) setImageUrl(urls[0]);
    },
    onToast: (t) => onResult(t.type === "error" ? { ok: false, error: t.message } : { ok: true, message: t.message }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, {
          heading, heading_de: headingDe, body, body_de: bodyDe,
          layout, image_url: imageUrl || null,
          cta_label: ctaLabel, cta_label_de: ctaLabelDe, cta_href: ctaHref,
        })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek" required>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Tekst">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} className={inputCls} />
        </Field>
        <Field label="Tekst (DE)">
          <textarea value={bodyDe} onChange={(e) => setBodyDe(e.target.value)} rows={4} maxLength={2000} className={inputCls} />
        </Field>
      </div>

      <Field label="Układ">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["left", "Zdjęcie po lewej"],
              ["right", "Zdjęcie po prawej"],
              ["background", "Zdjęcie jako tło"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                layout === value
                  ? "bg-[var(--color-navy)] text-white"
                  : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Zdjęcie">
        <div
          {...upload.dropProps}
          className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-start gap-3 ${
            upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
          }`}
        >
          {imageUrl && (
            <div className="relative w-40 aspect-[4/3] rounded-lg overflow-hidden">
              <Image src={imageUrl} alt="" fill className="object-cover" />
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <label className="cursor-pointer px-3 py-1.5 border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full uppercase tracking-widest hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors">
              {imageUrl ? "Zmień zdjęcie" : "Wybierz zdjęcie"}
              <input type="file" accept="image/*" className="hidden" {...upload.inputProps} />
            </label>
            {imageUrl && (
              <button type="button" onClick={() => setImageUrl("")} className="text-red-600 hover:underline">
                Usuń zdjęcie
              </button>
            )}
            {upload.uploading && <span className="text-[var(--muted)]">{upload.progressText}</span>}
            {!upload.uploading && <span className="text-[var(--muted)]">albo przeciągnij plik tutaj</span>}
          </div>
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Etykieta przycisku (opcjonalnie)">
          <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={200} className={inputCls} placeholder="np. Zobacz kolekcję" />
        </Field>
        <Field label="Etykieta przycisku (DE)">
          <input value={ctaLabelDe} onChange={(e) => setCtaLabelDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Link przycisku">
          <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} maxLength={500} className={inputCls} placeholder="np. /sklep?kolekcja=lisbon" />
        </Field>
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Galeria zdjęć ────────────────────────────────────────────────────────

type GalleryImage = { url: string; alt: string };

export function GalleryForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [images, setImages] = useState<GalleryImage[]>(() =>
    (Array.isArray(c.images) ? c.images : [])
      .map((img) => {
        const o = (typeof img === "object" && img !== null ? img : {}) as Record<string, unknown>;
        return { url: cs(o.url), alt: cs(o.alt) };
      })
      .filter((img) => img.url.length > 0)
  );
  const [saving, startTransition] = useTransition();

  const upload = useImageUpload({
    onUploaded: (urls) =>
      setImages((prev) => [...prev, ...urls.map((url) => ({ url, alt: "" }))]),
    onToast: (t) => onResult(t.type === "error" ? { ok: false, error: t.message } : { ok: true, message: t.message }),
  });

  function moveImage(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, { heading, heading_de: headingDe, images })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      <div
        {...upload.dropProps}
        className={`border-2 border-dashed rounded-xl p-4 flex flex-col gap-3 ${
          upload.isDragging ? "border-[var(--color-gold)]" : "border-[var(--border)]"
        }`}
      >
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="cursor-pointer px-3 py-1.5 border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full uppercase tracking-widest hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors">
            + Dodaj zdjęcia
            <input type="file" accept="image/*" multiple className="hidden" {...upload.inputProps} />
          </label>
          {upload.uploading ? (
            <span className="text-[var(--muted)]">{upload.progressText}</span>
          ) : (
            <span className="text-[var(--muted)]">albo przeciągnij pliki tutaj (max 24)</span>
          )}
        </div>
        {images.length > 0 && (
          <ul className="flex flex-col gap-2">
            {images.map((img, i) => (
              <li key={`${img.url}-${i}`} className="flex items-center gap-3 border border-[var(--border)] rounded-lg p-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Przesuń zdjęcie wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} aria-label="Przesuń zdjęcie niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                  <Image src={img.url} alt="" fill className="object-cover" />
                </div>
                <input
                  value={img.alt}
                  onChange={(e) =>
                    setImages((prev) => prev.map((x, xi) => (xi === i ? { ...x, alt: e.target.value } : x)))
                  }
                  placeholder="Opis zdjęcia (opcjonalnie)"
                  maxLength={200}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, xi) => xi !== i))}
                  aria-label="Usuń zdjęcie"
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SaveButton saving={saving} />
    </form>
  );
}
```

⚠️ Sprawdź przed implementacją: (a) dokładny kontrakt `useImageUpload` (nazwa callbacku `onUploaded`, kształt `onToast` — dopasuj wywołania do faktycznej sygnatury z `app/admin/produkty/[id]/useImageUpload.ts`); (b) czy `app/admin/_shared.tsx` eksportuje `Field` i `inputCls` (Explore raportuje `inputCls` — jeśli w innym pliku jest `inputClass`, tu obowiązuje wersja z `app/admin/_shared.tsx`); (c) czy `next.config.ts` dopuszcza domenę storage w `Image` (bucket products jest już renderowany `<Image>` w sklepie — powinno działać bez zmian).

- [ ] **Step 3: Weryfikacja + commit**

Run: `npx tsc --noEmit` — 0 błędów; `npm test` — zielone. (Komponenty jeszcze nieużywane — podepnie je Task 12.)

```bash
git add app/admin/strona-glowna/AddBlockModal.tsx app/admin/strona-glowna/BlockForms.tsx
git commit -m "feat(admin): modal Dodaj sekcje + formularze banner/galeria z uploadem"
```

---

### Task 11: Formularze treści — FAQ, Opinie, Produkty

**Files:**
- Modify: `app/admin/strona-glowna/BlockForms.tsx` (dopisz na końcu pliku)

**Interfaces:**
- Consumes: `BlockFormProps`, `BlockPickerData`, `cs`, `SaveButton`, `updateContentBlock` (Task 10/9)
- Produces: `FaqForm(props: BlockFormProps)`, `ReviewsForm(props: BlockFormProps)`, `ProductsForm(props: BlockFormProps & { picker: BlockPickerData })`

- [ ] **Step 1: Dopisz `FaqForm` i `ReviewsForm`**

```tsx
// ── FAQ ──────────────────────────────────────────────────────────────────

type FaqItem = { question: string; question_de: string; answer: string; answer_de: string };

export function FaqForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [items, setItems] = useState<FaqItem[]>(() =>
    (Array.isArray(c.items) ? c.items : []).map((it) => {
      const o = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
      return { question: cs(o.question), question_de: cs(o.question_de), answer: cs(o.answer), answer_de: cs(o.answer_de) };
    })
  );
  const [saving, startTransition] = useTransition();

  function setItem(i: number, patch: Partial<FaqItem>) {
    setItems((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  }
  function moveItem(i: number, delta: -1 | 1) {
    const t = i + delta;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[i], next[t]] = [next[t], next[i]];
    setItems(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(await updateContentBlock(block.id, { heading, heading_de: headingDe, items }));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      {items.map((item, i) => (
        <div key={i} className="border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <div className="flex flex-col gap-0.5 shrink-0">
            <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} aria-label="Przesuń pytanie wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} aria-label="Przesuń pytanie niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <Field label={`Pytanie ${i + 1}`} required>
              <input value={item.question} onChange={(e) => setItem(i, { question: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
            <Field label="Pytanie (DE)">
              <input value={item.question_de} onChange={(e) => setItem(i, { question_de: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
            <Field label="Odpowiedź" required>
              <textarea value={item.answer} onChange={(e) => setItem(i, { answer: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Odpowiedź (DE)">
              <textarea value={item.answer_de} onChange={(e) => setItem(i, { answer_de: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
            aria-label={`Usuń pytanie ${i + 1}`}
            className="self-start w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, { question: "", question_de: "", answer: "", answer_de: "" }])}
        className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj pytanie
      </button>

      <SaveButton saving={saving} />
    </form>
  );
}

// ── Opinie ───────────────────────────────────────────────────────────────

type ReviewItem = { quote: string; quote_de: string; author: string };

export function ReviewsForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [items, setItems] = useState<ReviewItem[]>(() =>
    (Array.isArray(c.items) ? c.items : []).map((it) => {
      const o = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
      return { quote: cs(o.quote), quote_de: cs(o.quote_de), author: cs(o.author) };
    })
  );
  const [saving, startTransition] = useTransition();

  function setItem(i: number, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(await updateContentBlock(block.id, { heading, heading_de: headingDe, items }));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      {items.map((item, i) => (
        <div key={i} className="border border-[var(--border)] rounded-xl p-4 flex gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <Field label={`Opinia ${i + 1}`} required>
              <textarea value={item.quote} onChange={(e) => setItem(i, { quote: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Opinia (DE)">
              <textarea value={item.quote_de} onChange={(e) => setItem(i, { quote_de: e.target.value })} rows={3} maxLength={2000} className={inputCls} />
            </Field>
            <Field label="Podpis (np. Anna z Warszawy)">
              <input value={item.author} onChange={(e) => setItem(i, { author: e.target.value })} maxLength={200} className={inputCls} />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((_, xi) => xi !== i))}
            aria-label={`Usuń opinię ${i + 1}`}
            className="self-start w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-950 text-red-600 shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setItems((prev) => [...prev, { quote: "", quote_de: "", author: "" }])}
        className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj opinię
      </button>

      <SaveButton saving={saving} />
    </form>
  );
}
```

- [ ] **Step 2: Dopisz `ProductsForm`**

```tsx
// ── Sekcja produktowa ────────────────────────────────────────────────────

export function ProductsForm({
  block,
  onResult,
  picker,
}: BlockFormProps & { picker: BlockPickerData }) {
  const c = block.content;
  const [heading, setHeading] = useState(cs(c.heading));
  const [headingDe, setHeadingDe] = useState(cs(c.heading_de));
  const [source, setSource] = useState<string>(
    c.source === "collection" || c.source === "category" ? (c.source as string) : "manual"
  );
  const [productIds, setProductIds] = useState<string[]>(() =>
    (Array.isArray(c.product_ids) ? c.product_ids : []).filter(
      (x): x is string => typeof x === "string"
    )
  );
  const [collectionSlug, setCollectionSlug] = useState(cs(c.collection_slug));
  const [categorySlug, setCategorySlug] = useState(cs(c.category_slug));
  const [limit, setLimit] = useState(
    typeof c.limit === "number" && Number.isFinite(c.limit) ? String(c.limit) : "4"
  );
  const [search, setSearch] = useState("");
  const [saving, startTransition] = useTransition();

  const q = search.trim().toLowerCase();
  const visibleProducts = q
    ? picker.products.filter((p) => p.name.toLowerCase().includes(q))
    : picker.products;

  function toggleProduct(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(
        await updateContentBlock(block.id, {
          heading, heading_de: headingDe, source,
          product_ids: productIds, collection_slug: collectionSlug,
          category_slug: categorySlug, limit: Number(limit) || 4,
        })
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nagłówek (opcjonalnie)">
          <input value={heading} onChange={(e) => setHeading(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Nagłówek (DE)">
          <input value={headingDe} onChange={(e) => setHeadingDe(e.target.value)} maxLength={200} className={inputCls} />
        </Field>
      </div>

      <Field label="Skąd brać produkty?">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["manual", "Wybieram ręcznie"],
              ["collection", "Cała kolekcja"],
              ["category", "Cała kategoria"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSource(value)}
              aria-pressed={source === value}
              className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                source === value
                  ? "bg-[var(--color-navy)] text-white"
                  : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      {source === "manual" && (
        <div className="flex flex-col gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj produktu…"
            className={inputCls}
          />
          <div className="max-h-64 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {visibleProducts.length === 0 && (
              <p className="p-3 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
            )}
            {visibleProducts.map((p) => (
              <label key={p.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-[var(--bg)]">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={() => toggleProduct(p.id)}
                  className="h-4 w-4 accent-[var(--color-gold)]"
                />
                <span className="text-sm text-[var(--fg)]">{p.name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            Wybrano: {productIds.length} (max 12; kolejność = kolejność zaznaczania)
          </p>
        </div>
      )}

      {source === "collection" && (
        <Field label="Kolekcja" required>
          <select value={collectionSlug} onChange={(e) => setCollectionSlug(e.target.value)} className={inputCls}>
            <option value="">— wybierz —</option>
            {picker.collections.map((col) => (
              <option key={col.slug} value={col.slug}>{col.label}</option>
            ))}
          </select>
        </Field>
      )}

      {source === "category" && (
        <Field label="Kategoria" required>
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className={inputCls}>
            <option value="">— wybierz —</option>
            {picker.categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>{cat.label}</option>
            ))}
          </select>
        </Field>
      )}

      {source !== "manual" && (
        <Field label="Ile produktów pokazać (1–12)">
          <input
            type="number" min={1} max={12} inputMode="numeric"
            value={limit} onChange={(e) => setLimit(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </Field>
      )}

      <SaveButton saving={saving} />
    </form>
  );
}
```

- [ ] **Step 3: Weryfikacja + commit**

Run: `npx tsc --noEmit` — 0; `npm test` — zielone.

```bash
git add app/admin/strona-glowna/BlockForms.tsx
git commit -m "feat(admin): formularze FAQ/opinie/sekcja produktowa"
```

---

### Task 12: `BlocksEditor` + przełączenie huba + usunięcie starego modelu

**Files:**
- Create: `app/admin/strona-glowna/BlocksEditor.tsx`
- Modify: `app/admin/strona-glowna/page.tsx`
- Modify: `app/admin/strona-glowna/actions.ts` (usuń stare akcje sekcji)
- Delete: `app/admin/strona-glowna/HomeSectionsEditor.tsx`
- Delete: `app/_lib/home-sections.ts`
- Delete: `app/_lib/__tests__/home-sections.test.ts`

**Interfaces:**
- Consumes: wszystko z Tasków 5, 9, 10, 11; `TrustItemsEditor`, `SiteTextsCard` (istniejące — PRZECZYTAJ ich propsy przed użyciem, wzorzec osadzenia identyczny jak w starym HomeSectionsEditor); `Card`, `ToastView`/`Toast` z `app/admin/_shared` (sprawdź eksporty); `useConfirm` z `@/app/_context/ConfirmContext`; `getAvailableProductsForFeatured` (`@/app/_lib/featured`), `getAllCollections` (`@/app/_lib/collections`), `getCategories` (`@/app/_lib/categories`), `localizeCollection` (`@/app/_lib/localize`) — sprawdź sygnatury.
- Produces: hub `/admin/strona-glowna` działa w całości na `page_blocks`; po tym tasku NIC w repo nie importuje z `home-sections`.

- [ ] **Step 1: PRZECZYTAJ stary `HomeSectionsEditor.tsx` w całości**

Nowy edytor przenosi z niego 1:1: wzorzec sync-props-po-refresh (`prevInitial`), `showToast`/`handleResult`, `move()` z rollbackiem, `toggleVisible()` przez FormData z rollbackiem, JSX wiersza (strzałki `w-7 h-7`, switch `w-11 h-6`, line-through ukrytych, `data-guard-section`/`data-guard-save`), nagłówek strony i osadzenie `TrustItemsEditor`/`SiteTextsCard`. Metadane systemowe skopiuj ze starego `SECTION_META` (nazwy/opisy/linki contentHref — bez zmian treści).

- [ ] **Step 2: Utwórz `BlocksEditor.tsx`**

Struktura (kompletna logika — JSX wiersza i formularzy przenosisz wg wzorców ze Steps 1; poniżej pełny szkielet decyzyjny):

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateSystemBlockHeadings,
  togglePageBlockVisible,
  deleteContentBlock,
  reorderPageBlocks,
} from "./actions";
import AddBlockModal from "./AddBlockModal";
import {
  BannerForm, GalleryForm, FaqForm, ReviewsForm, ProductsForm,
  type BlockPickerData, cs,
} from "./BlockForms";
import TrustItemsEditor from "./TrustItemsEditor";
import SiteTextsCard from "./SiteTextsCard";
import {
  CONTENT_BLOCK_DEFS,
  isSystemBlockType,
  isContentBlockType,
  type PageBlockRow,
  type SystemBlockType,
} from "@/app/_lib/blocks";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { SiteTextsMap } from "@/app/_lib/site-texts";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

// Metadane bloków SYSTEMOWYCH — skopiowane 1:1 ze starego SECTION_META
// (HomeSectionsEditor.tsx). PL-only, panel admina.
const SYSTEM_META: Record<
  SystemBlockType,
  { name: string; desc: string; contentHref?: string; contentCta?: string; hasHeadings: boolean }
> = {
  /* ...przenieś dokładne wpisy hero/tiles/featured/trust_bar/collections
     ze starego pliku (nazwy, opisy, linki /admin/slider itd., hasHeadings)... */
};

export default function BlocksEditor({
  initialBlocks,
  initialTrustItems,
  initialSiteTexts,
  picker,
}: {
  initialBlocks: PageBlockRow[];
  initialTrustItems: TrustItemRow[];
  initialSiteTexts: SiteTextsMap;
  picker: BlockPickerData;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [prevInitial, setPrevInitial] = useState(initialBlocks);
  if (initialBlocks !== prevInitial) {
    setPrevInitial(initialBlocks);
    setBlocks(initialBlocks);
  }
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  // showToast / handleResult — 1:1 wzorzec ze starego edytora.
  // move(index, delta) — 1:1 wzorzec (optymistyczny swap + rollback),
  //   ale wysyła reorderPageBlocks(next.map((b) => b.id)).
  // toggleVisible(b) — 1:1 wzorzec przez FormData (id, visible) na
  //   togglePageBlockVisible, z rollbackiem.

  async function remove(b: PageBlockRow) {
    const meta = isContentBlockType(b.block_type) ? CONTENT_BLOCK_DEFS[b.block_type] : null;
    if (!meta) return;
    const ok = await confirm({
      message: `Usunąć sekcję „${meta.name}"? Tej operacji nie można cofnąć.`,
      danger: true,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", b.id);
    startTransition(async () => {
      const res = await deleteContentBlock(fd);
      handleResult(res);
    });
  }

  // Etykieta wiersza: systemowe z SYSTEM_META; treściowe = nazwa typu
  // z rejestru + skrót nagłówka z content (albo „(bez nagłówka)").
  // Render wiersza: identyczny JSX jak stary edytor (strzałki/switch/
  // line-through/chevron), plus dla treściowych przycisk „Usuń" (czerwony,
  // wzorzec z TrustItemsEditor) i plakietka „Ukryta" gdy !visible.
  // Rozwinięcie (expandedId === b.id):
  //   - systemowe hasHeadings → <SystemHeadingsForm block={b} onResult={handleResult} />
  //     (przeniesiony SectionHeadingsForm: ukryte pole "id" zamiast "key",
  //      wartości initial z cs(b.content.heading) itd., action updateSystemBlockHeadings)
  //   - trust_bar dodatkowo <TrustItemsEditor initialItems={initialTrustItems} onResult={handleResult} />
  //   - banner → <BannerForm block={b} onResult={handleResult} />
  //   - gallery → <GalleryForm .../>; faq → <FaqForm .../>; reviews → <ReviewsForm .../>
  //   - products → <ProductsForm block={b} onResult={handleResult} picker={picker} />
  // Pod listą: przycisk „+ Dodaj sekcję" (otwiera AddBlockModal) i osobno
  // <SiteTextsCard initialTexts={initialSiteTexts} onResult={handleResult} />.
  // Modal: {addOpen && <AddBlockModal onClose={() => setAddOpen(false)} onResult={handleResult} />}
}
```

Komentarze `// 1:1 wzorzec` odnoszą się do kodu, który MUSISZ przenieść ze starego pliku (Step 1) — to przeniesienie, nie projektowanie: te same klasy, te same rollbacki, ta sama dostępność (aria-label z nazwą sekcji, `role="switch"`, `aria-checked`). `SystemHeadingsForm` = stary `SectionHeadingsForm` z trzema zmianami: prop `block: PageBlockRow` zamiast `section`, ukryty input `name="id"` `value={block.id}`, defaultValue pól z `cs(block.content.heading)` / `cs(block.content.heading_de)` / `cs(block.content.subheading)` / `cs(block.content.subheading_de)`, submit → `updateSystemBlockHeadings`.

- [ ] **Step 3: Przełącz `page.tsx` huba**

```tsx
// app/admin/strona-glowna/page.tsx — pobiera dane bloków + dane pickerów.
// requireAdmin() jest w layoucie admina; akcje mutujące mają własny guard.
import { getAllHomeBlocksAdmin } from "@/app/_lib/blocks";
import { getAllTrustItems } from "@/app/_lib/trust-items";
import { getAllSiteTexts } from "@/app/_lib/site-texts";
import { getAvailableProductsForFeatured } from "@/app/_lib/featured";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import BlocksEditor from "./BlocksEditor";

export default async function AdminHomePageSettings() {
  const [blocks, trustItems, siteTexts, products, collections, categories] =
    await Promise.all([
      getAllHomeBlocksAdmin(),
      getAllTrustItems(),
      getAllSiteTexts(),
      getAvailableProductsForFeatured(),
      getAllCollections(),
      getCategories(),
    ]);
  return (
    <BlocksEditor
      initialBlocks={blocks}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
      picker={{
        products: products.map((p) => ({ id: p.id, name: p.name })),
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
  );
}
```

⚠️ Sprawdź faktyczne kształty zwrotek `getAvailableProductsForFeatured` / `getAllCollections` / `getCategories` i dopasuj mapowanie (np. kolekcje mogą wymagać `localizeCollection`; kategorie zwracają `label` po lokalizacji — wywołaj bez locale = PL, panel jest PL-only).

- [ ] **Step 4: Sprzątanie starego modelu**

1. Usuń plik `app/admin/strona-glowna/HomeSectionsEditor.tsx`.
2. Z `app/admin/strona-glowna/actions.ts` usuń akcje `updateHomeSection`, `toggleHomeSectionVisible`, `reorderHomeSections` oraz import z `@/app/_lib/home-sections` (w `revalidateHome()` zostaje tylko `invalidatePageBlocksCache()` + `revalidatePath`).
3. Usuń `app/_lib/home-sections.ts` i `app/_lib/__tests__/home-sections.test.ts`.
4. Grep kontrolny: `home-sections|home_sections|HomeSection` w `app/` — 0 trafień (poza ewentualnymi komentarzami historycznymi w docs).

- [ ] **Step 5: Weryfikacja**

Run: `npx tsc --noEmit` — 0 błędów. Run: `npm test` — zielone (stary test usunięty, `blocks.test.ts` pokrywa merge/localize/validate). Run: `npm run dev` → `/admin/strona-glowna` renderuje listę 5 sekcji systemowych (defaulty fail-open — bez migracji brak wierszy w DB; formularze pokażą błąd „migracja 52" przy próbie zapisu — to oczekiwane do czasu Task 13). Zatrzymaj dev server.

- [ ] **Step 6: Commit**

```bash
git add -A app/admin/strona-glowna app/_lib
git commit -m "feat(admin): BlocksEditor - hub strony glownej na page_blocks + usuniecie home_sections"
```

---

### Task 13: Pełna weryfikacja automatyczna

**Files:** żadnych nowych zmian kodu (ewentualne poprawki z weryfikacji — osobne commity).

- [ ] **Step 1:** `npx tsc --noEmit` — 0 błędów.
- [ ] **Step 2:** `npm test` — wszystkie zielone.
- [ ] **Step 3:** `npm run build` — zielony.
- [ ] **Step 4:** Smoke z dev serverem (`npm run dev`, potem zatrzymaj): `/` i `/de` — wygląd jak dziś (fail-open); `/admin/strona-glowna` — lista sekcji + przycisk „Dodaj sekcję" otwiera galerię 5 typów.
- [ ] **Step 5:** Raport końcowy (wyniki komend). NIE uruchamiaj migracji 52 — kontroler zapuści ją na prod za zgodą usera, potem wykona e2e mutacyjny (dodanie bannera → widoczny na home → usunięcie → przywrócenie stanu) i klik-test.

---

## Sekwencja wdrożenia (kontroler, poza taskami)

1. Final review całego brancha.
2. **Migracja 52 na prod** (Supabase MCP, za zgodą usera) — przenosi 5 wierszy `home_sections` → `page_blocks` i dropuje starą tabelę. Od tej chwili STARY kod na prodzie (jeszcze bez merge) czyta nieistniejącą `home_sections` → jego fail-open pokazuje defaulty słownikowe; dlatego merge + deploy wykonać NIEZWŁOCZNIE po migracji.
3. Merge PR + deploy → e2e mutacyjny na żywej bazie (za zgodą; przywrócić stan) + klik-test Mikołaja.
