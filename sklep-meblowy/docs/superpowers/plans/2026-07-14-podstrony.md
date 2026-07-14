# Podstrony (krok C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nietechniczna administratorka tworzy nowe podstrony (tytuł → adres, SEO, szkic/publikacja z podglądem) składane z tych samych bloków treściowych co home; klient widzi je pod `/<slug>` i `/de/<slug>`.

**Architecture:** Tabela `pages` (migracja 53) + FK `page_blocks.page_id → pages(id) on delete cascade`. Czysty moduł `app/_lib/pages.ts` (slug/walidacja/lokalizacja — importowalny przez klienta) + `app/_lib/pages-server.ts` (fetch z cache, tag `pages`) — split pure/server OD RAZU (lekcja z kroku B). Publiczny routing: pierwszy top-level dynamiczny segment `app/[slug]/page.tsx` (statyczne trasy mają pierwszeństwo; walidacja + lista zarezerwowana w kodzie); `/de/<slug>` działa automatycznie (proxy `stripLocale` jest czysto prefiksowe). Admin: `/admin/podstrony` (lista + tworzenie) i `/admin/podstrony/[id]` (meta + edytor bloków reużywający `BlockForms`/`AddBlockModal` i istniejące akcje bloków — tylko `addContentBlock` uczy się `page_id`).

**Tech Stack:** Next.js (⚠️ NIETYPOWA wersja — `proxy.ts` zamiast middleware, `params: Promise<...>`), TypeScript, Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-rozbudowa-strony-filtry-design.md` (sekcja „Krok C").

## Global Constraints

- **Next.js z breaking changes** (AGENTS.md): przed kodem dotykającym API Next czytaj guide w `node_modules/next/dist/docs/`. W tej wersji `params` w page/generateMetadata to **`Promise`** (`const { slug } = await params` — wzorzec `app/produkt/[id]/page.tsx:41-97`).
- **Gotcha Turbopack:** pliki `"use server"` — tylko async funkcje, zero `export type`/`export const`.
- **Split pure/server (lekcja kroku B):** `pages.ts` NIE może importować niczego server-only (klienckie formularze admina użyją `slugifyTitle`/`validatePageSlug` na żywo); fetch wyłącznie w `pages-server.ts`/`blocks-server.ts`. tsc/vitest NIE łapią naruszenia — dopiero `npm run build`, który jest bramą w każdym tasku dotykającym granicy klient/serwer.
- **Baza = PROD.** Migracji 53 NIE zapuszcza żaden task (kontroler, za zgodą, na końcu). Fail-open: brak tabeli `pages` → każda podstrona = 404, home/reszta sklepu działa bez zmian.
- **UX admina MUST BE TRIVIAL:** polskie etykiety, zero żargonu; panel hardcoded PL.
- **Slug:** tylko `^[a-z0-9]+(-[a-z0-9]+)*$`, max 80 znaków; lista zarezerwowana = wszystkie istniejące segmenty top-level (patrz Task 2 — dokładna lista); auto-generowany z tytułu (edytowalny).
- **Publikacja:** `published=false` → `notFound()` dla klientów; zalogowany ADMIN widzi szkic (plakietka „Szkic"); szkice poza sitemapą; metadata szkicu z `robots: { index: false, follow: false }`.
- **i18n:** `title_de`/`seo_description_de` z fallbackiem PL per pole (idiom `de && de.trim() ? de : pl`); `hasDe` strony = niepusty `title_de` (steruje hreflang w metadata i sitemapie).
- **Cache:** strony pod tagiem `pages` (unstable_cache, revalidate 60, zero `cookies()` — `createAdminClient`); bloki podstron pod ISTNIEJĄCYM wspólnym tagiem `page-blocks` (świadome uproszczenie vs per-page tagi ze specu: stron będzie kilka, każda mutacja bloków i tak woła `invalidatePageBlocksCache()` — odnotowane odstępstwo).
- Komendy: `npx vitest run <plik>` / `npm test` / `npx tsc --noEmit` / `npm run build`.
- Branch: `feat/podstrony` od `main`.

---

### Task 1: Migracja 53 — `pages` + FK na `page_blocks.page_id`

**Files:**
- Create: `supabase/migrations/53_pages.sql`

**Interfaces:**
- Produces: tabela `public.pages (id uuid pk, slug text unique, title, title_de, seo_description, seo_description_de, published bool default false, created_at, updated_at)`; FK `page_blocks_page_id_fkey` z `on delete cascade`.

- [ ] **Step 0: Utwórz branch**

```bash
git checkout main && git pull && git checkout -b feat/podstrony
```

- [ ] **Step 1: Utwórz plik migracji** (wzorce RLS 1:1 z migracji 49/50/52; NIE uruchamiaj nigdzie):

```sql
-- supabase/migrations/53_pages.sql
-- Podstrony (spec 2026-07-14, krok C): strona = slug + tytuł + SEO + flaga
-- publikacji; treść to bloki w page_blocks (page_id -> pages.id). Usunięcie
-- strony kasuje jej bloki (FK on delete cascade). Szkice (published=false)
-- są niewidoczne dla klientów — egzekwowane w kodzie (odczyt idzie przez
-- service_role); RLS select-true jak w pozostałych tabelach treści.

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  title_de text,
  seo_description text,
  seo_description_de text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.pages enable row level security;

drop policy if exists pages_read on public.pages;
create policy pages_read on public.pages
  for select using (true);

revoke insert, update, delete on public.pages from anon, authenticated;

-- Bloki podstron: usunięcie strony sprząta jej bloki. Istniejące wiersze
-- page_blocks mają page_id null (home) — FK dopuszcza null.
alter table public.page_blocks
  drop constraint if exists page_blocks_page_id_fkey;
alter table public.page_blocks
  add constraint page_blocks_page_id_fkey
  foreign key (page_id) references public.pages(id) on delete cascade;
```

- [ ] **Step 2: Weryfikacja (bez wykonywania)** — porównaj wzorce RLS/revoke z `supabase/migrations/52_page_blocks.sql`; sprawdź, że check-constraint sluga jest zgodny z `PAGE_SLUG_RE` z Taska 2 (ta sama semantyka: kebab-case bez wiodących/końcowych/dublowanych myślników).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/53_pages.sql
git commit -m "feat(db): migracja 53 - tabela pages + FK cascade na page_blocks.page_id"
```

---

### Task 2: `pages.ts` — czysty moduł slug/walidacja/lokalizacja (TDD)

**Files:**
- Create: `app/_lib/pages.ts`
- Test: `app/_lib/__tests__/pages.test.ts`

**Interfaces:**
- Consumes: `Locale` z `./i18n` (tylko typ)
- Produces (używane przez Taski 3-8):
  - `RESERVED_SLUGS: Set<string>`, `PAGE_SLUG_RE: RegExp`, `PAGE_SLUG_MAX = 80`
  - `slugifyTitle(title: string): string`
  - `validatePageSlug(slug: string): { ok: true } | { ok: false; error: string }` (komunikaty PO POLSKU)
  - `type PageRow = { id: string; slug: string; title: string; title_de: string | null; seo_description: string | null; seo_description_de: string | null; published: boolean; updated_at: string }`
  - `localizePageMeta(row: PageRow, locale: Locale): { title: string; seoDescription: string | null }`
  - `pageHasDe(row: PageRow): boolean`
  - `canViewPage(published: boolean, isAdminViewer: boolean): boolean`

- [ ] **Step 1: Napisz failing test** — utwórz `app/_lib/__tests__/pages.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RESERVED_SLUGS,
  PAGE_SLUG_RE,
  slugifyTitle,
  validatePageSlug,
  localizePageMeta,
  pageHasDe,
  canViewPage,
  type PageRow,
} from "@/app/_lib/pages";

const page = (over: Partial<PageRow>): PageRow => ({
  id: "00000000-0000-0000-0000-000000000001",
  slug: "pielegnacja-mebli",
  title: "Pielęgnacja mebli",
  title_de: null,
  seo_description: null,
  seo_description_de: null,
  published: true,
  updated_at: "2026-07-14T00:00:00Z",
  ...over,
});

describe("slugifyTitle", () => {
  it("zdejmuje polskie znaki i robi kebab-case", () => {
    expect(slugifyTitle("Pielęgnacja mebli")).toBe("pielegnacja-mebli");
    expect(slugifyTitle("  Łóżka & Sofy!  ")).toBe("lozka-sofy");
  });
  it("tytuł bez znaków alfanumerycznych daje pusty slug", () => {
    expect(slugifyTitle("***")).toBe("");
  });
});

describe("validatePageSlug", () => {
  it("pusty slug odrzucony z polskim komunikatem", () => {
    const r = validatePageSlug("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Adres");
  });
  it("zły format odrzucony (wielkie litery, spacje, podkreślenia, skrajne myślniki)", () => {
    for (const bad of ["Duze-Litery", "ze spacja", "pod_kreslenie", "-od-myslnika", "do-myslnika-", "po--dwojnym"]) {
      expect(validatePageSlug(bad).ok).toBe(false);
    }
  });
  it("zarezerwowane slugi tras sklepu odrzucone", () => {
    for (const reserved of ["sklep", "admin", "de", "o-nas", "produkt"]) {
      expect(RESERVED_SLUGS.has(reserved)).toBe(true);
      expect(validatePageSlug(reserved).ok).toBe(false);
    }
  });
  it("za długi slug odrzucony (max 80)", () => {
    expect(validatePageSlug("a".repeat(81)).ok).toBe(false);
    expect(validatePageSlug("a".repeat(80)).ok).toBe(true);
  });
  it("poprawny slug przechodzi", () => {
    expect(validatePageSlug("pielegnacja-mebli-2")).toEqual({ ok: true });
    expect(PAGE_SLUG_RE.test("pielegnacja-mebli-2")).toBe(true);
  });
});

describe("localizePageMeta", () => {
  const row = page({
    title_de: "Möbelpflege",
    seo_description: "Opis PL",
    seo_description_de: "",
  });
  it("PL bierze pola PL", () => {
    expect(localizePageMeta(row, "pl")).toEqual({
      title: "Pielęgnacja mebli",
      seoDescription: "Opis PL",
    });
  });
  it("DE per pole z fallbackiem PL (pusty string DE = brak)", () => {
    expect(localizePageMeta(row, "de")).toEqual({
      title: "Möbelpflege",
      seoDescription: "Opis PL",
    });
  });
  it("brak opisu → null", () => {
    expect(localizePageMeta(page({}), "pl").seoDescription).toBeNull();
  });
});

describe("pageHasDe", () => {
  it("niepusty title_de → true; pusty/whitespace/null → false", () => {
    expect(pageHasDe(page({ title_de: "Über uns" }))).toBe(true);
    expect(pageHasDe(page({ title_de: "   " }))).toBe(false);
    expect(pageHasDe(page({ title_de: null }))).toBe(false);
  });
});

describe("canViewPage", () => {
  it("opublikowaną widzi każdy, szkic tylko admin", () => {
    expect(canViewPage(true, false)).toBe(true);
    expect(canViewPage(true, true)).toBe(true);
    expect(canViewPage(false, true)).toBe(true);
    expect(canViewPage(false, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL** (`npx vitest run app/_lib/__tests__/pages.test.ts`)

- [ ] **Step 3: Implementacja — utwórz `app/_lib/pages.ts`**

```ts
// Podstrony (spec 2026-07-14, krok C) — CZYSTY moduł: slug, walidacja,
// lokalizacja metadanych. Zero importów server-only (formularze admina
// używają slugifyTitle/validatePageSlug na żywo w kliencie) — fetch żyje
// w pages-server.ts (lekcja kroku B: split pure/server).

import type { Locale } from "./i18n";

// Wszystkie istniejące segmenty top-level (trasy statyczne mają pierwszeństwo
// nad app/[slug], ale rezerwacja chroni przed dezorientacją: strona o slugu
// "sklep" nigdy by się nie wyrenderowała). "de" = prefiks locale w proxy.
export const RESERVED_SLUGS: Set<string> = new Set([
  "admin",
  "api",
  "auth",
  "checkout",
  "de",
  "dostawa",
  "konto",
  "kontakt",
  "koszyk",
  "logowanie",
  "o-nas",
  "produkt",
  "prywatnosc",
  "regulamin",
  "rejestracja",
  "reset-hasla",
  "sklep",
  "ulubione",
  "zapomnialem-hasla",
  "zwroty",
]);

// Kebab-case bez wiodących/końcowych/podwójnych myślników — ta sama semantyka
// co check-constraint pages_slug_format w migracji 53.
export const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PAGE_SLUG_MAX = 80;

// "Pielęgnacja mebli" → "pielegnacja-mebli". ł nie rozkłada się przez NFD —
// ręcznie (wzorzec optionParamSlug z option-filter.ts).
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PAGE_SLUG_MAX)
    .replace(/-+$/g, "");
}

// Komunikaty PO POLSKU — widzi je administratorka w toaście.
export function validatePageSlug(
  slug: string
): { ok: true } | { ok: false; error: string } {
  if (!slug) return { ok: false, error: "Adres strony jest wymagany" };
  if (slug.length > PAGE_SLUG_MAX) {
    return { ok: false, error: `Adres może mieć najwyżej ${PAGE_SLUG_MAX} znaków` };
  }
  if (!PAGE_SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "Adres może zawierać tylko małe litery, cyfry i pojedyncze myślniki",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Ten adres jest zajęty przez istniejącą stronę sklepu" };
  }
  return { ok: true };
}

export type PageRow = {
  id: string;
  slug: string;
  title: string;
  title_de: string | null;
  seo_description: string | null;
  seo_description_de: string | null;
  published: boolean;
  updated_at: string;
};

// DE per pole z fallbackiem PL (idiom repo).
export function localizePageMeta(
  row: PageRow,
  locale: Locale
): { title: string; seoDescription: string | null } {
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return {
    title: pick(row.title_de, row.title) ?? row.title,
    seoDescription: pick(row.seo_description_de, row.seo_description),
  };
}

// Steruje hreflang/sitemap: strona "ma DE", gdy admin świadomie przetłumaczył tytuł.
export function pageHasDe(row: PageRow): boolean {
  return !!row.title_de && row.title_de.trim().length > 0;
}

// Kto widzi stronę: opublikowaną każdy, szkic tylko admin (podgląd).
export function canViewPage(published: boolean, isAdminViewer: boolean): boolean {
  return published || isAdminViewer;
}
```

⚠️ Regex diakrytyków w `slugifyTitle` MUSI być zapisany escape'ami (backslash-u-0300 do backslash-u-036f), nie literalnymi znakami łączącymi. Jeśli po przepisaniu `grep -c 'u0300' app/_lib/pages.ts` daje 0 — NIE naprawiaj edytorem; napraw PowerShellem budującym string z kodów znaków (wzorzec: `$bs = [char]0x5C; $esc = '[' + $bs + 'u0300-' + $bs + 'u036f]'`) i zweryfikuj ponownie.

- [ ] **Step 4: Uruchom — PASS** + `npx tsc --noEmit` — 0 błędów. Dodatkowo: `grep -c 'u0300' app/_lib/pages.ts` → 1.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/pages.ts app/_lib/__tests__/pages.test.ts
git commit -m "feat(podstrony): slug, walidacja i lokalizacja metadanych (TDD)"
```

---

### Task 3: Warstwa serwerowa — `pages-server.ts`, `getIsAdmin`, bloki per strona

**Files:**
- Create: `app/_lib/pages-server.ts`
- Modify: `app/_lib/admin.ts` (dopisz `getIsAdmin`)
- Modify: `app/_lib/blocks-server.ts` (dopisz fetch bloków podstrony)

**Interfaces:**
- Consumes: `PageRow` z `./pages`; `mergeHomeBlocks`/`PageBlockRow`/`isContentBlockType` z `./blocks`; `isAdmin`, `createClient` (istniejące w admin.ts)
- Produces:
  - `PAGES_CACHE_TAG = "pages"`, `getPageBySlug(slug: string): Promise<PageRow | null>` (cache 60 s), `getAllPagesAdmin(): Promise<PageRow[]>`, `getPageAdmin(id: string): Promise<PageRow | null>`, `getPagesForSitemap(): Promise<{ slug: string; updated_at: string; title_de: string | null }[]>` (tylko published), `invalidatePagesCache(): void`
  - w admin.ts: `getIsAdmin(): Promise<boolean>` (NIE przekierowuje)
  - w blocks-server.ts: `getPageBlocks(pageId: string): Promise<PageBlockRow[]>` (cache, tylko typy treściowe), `getPageBlocksAdmin(pageId: string): Promise<PageBlockRow[]>` (świeży)

- [ ] **Step 1: `app/_lib/pages-server.ts`**

```ts
// Serwerowa część podstron — fetch z cache i inwalidacja (split pure/server
// jak blocks.ts/blocks-server.ts). pages.ts trzyma czystą logikę.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { PageRow } from "./pages";

export const PAGES_CACHE_TAG = "pages";

const PAGE_COLUMNS =
  "id, slug, title, title_de, seo_description, seo_description_de, published, updated_at";

// Argument slug wchodzi do klucza cache (unstable_cache dokłada argumenty).
// Błąd/brak tabeli → null → strona 404 (fail-open: reszta sklepu bez zmian).
const fetchPageBySlug = unstable_cache(
  async (slug: string): Promise<PageRow | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("pages")
      .select(PAGE_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as PageRow;
  },
  ["page-by-slug"],
  { tags: [PAGES_CACHE_TAG], revalidate: 60 }
);

export const getPageBySlug = cache(fetchPageBySlug);

// Admin: świeże odczyty bez cache (po mutacji router.refresh() widzi zmiany).
export async function getAllPagesAdmin(): Promise<PageRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select(PAGE_COLUMNS)
    .order("title", { ascending: true });
  if (error) {
    console.error("getAllPagesAdmin:", error.message);
    return [];
  }
  return (data ?? []) as PageRow[];
}

export async function getPageAdmin(id: string): Promise<PageRow | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select(PAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as PageRow;
}

// Sitemapa czyta tylko opublikowane (szkice poza indeksem).
export async function getPagesForSitemap(): Promise<
  { slug: string; updated_at: string; title_de: string | null }[]
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select("slug, updated_at, title_de")
    .eq("published", true);
  if (error || !data) return [];
  return data as { slug: string; updated_at: string; title_de: string | null }[];
}

export function invalidatePagesCache(): void {
  revalidateTag(PAGES_CACHE_TAG, "max");
}
```

- [ ] **Step 2: `getIsAdmin` w `app/_lib/admin.ts`** — dopisz na końcu pliku:

```ts
// Nie-przekierowujący wariant do stron publicznych: podgląd szkicu podstrony
// (published=false renderuje się TYLKO adminowi, klient dostaje notFound()).
export async function getIsAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user);
}
```

- [ ] **Step 3: Bloki podstrony w `app/_lib/blocks-server.ts`** — dopisz na końcu (rozszerz import z `./blocks` o `isContentBlockType`):

```ts
// ── Bloki podstron (krok C) ──────────────────────────────────────────────
// Wspólny tag page-blocks (świadome uproszczenie vs per-page tagi ze specu:
// stron kilka, każda mutacja bloków woła invalidatePageBlocksCache()).
// Podstrony nie mają bloków systemowych — bez merge'u z defaultami; nieznane
// typy odpadają tutaj (fail-open, jak mergeHomeBlocks dla home).
const fetchPageBlocks = unstable_cache(
  async (pageId: string): Promise<PageBlockRow[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("page_blocks")
      .select("id, page_id, block_type, sort_order, visible, content")
      .eq("page_id", pageId)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return (data as PageBlockRow[]).filter((b) => isContentBlockType(b.block_type));
  },
  ["page-blocks-by-page"],
  { tags: [PAGE_BLOCKS_CACHE_TAG], revalidate: 60 }
);

export const getPageBlocks = cache(fetchPageBlocks);

export async function getPageBlocksAdmin(pageId: string): Promise<PageBlockRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .select("id, page_id, block_type, sort_order, visible, content")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getPageBlocksAdmin:", error.message);
    return [];
  }
  return ((data ?? []) as PageBlockRow[]).filter((b) =>
    isContentBlockType(b.block_type)
  );
}
```

- [ ] **Step 4: Weryfikacja** — `npx tsc --noEmit` (0), `npm test` (zielone; bez nowych testów jedn. — integracja).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/pages-server.ts app/_lib/admin.ts app/_lib/blocks-server.ts
git commit -m "feat(podstrony): fetch stron i blokow podstrony z cache + getIsAdmin"
```

---

### Task 4: Publiczna trasa `app/[slug]/page.tsx`

**Files:**
- Create: `app/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getPageBySlug` (T3), `getPageBlocks` (T3), `getIsAdmin` (T3), `PAGE_SLUG_RE`/`localizePageMeta`/`pageHasDe` (T2), `localizeBlock`/`isSystemBlockType`/`type LocalizedContentBlock` z `@/app/_lib/blocks`, `ContentBlock` z `@/app/_components/blocks/ContentBlock`, `getLocale` (`@/app/_lib/i18n-server`), `localizePath` (`@/app/_lib/i18n`), `alternatesFor` (`@/app/_lib/sitemap-i18n`)
- Produces: publiczne `/<slug>` i `/de/<slug>` (proxy przepisuje automatycznie); szkic → 404 dla klienta, podgląd z plakietką dla admina.

- [ ] **Step 1: Utwórz `app/[slug]/page.tsx`** (wzorzec params-Promise z `app/produkt/[id]/page.tsx`):

```tsx
import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import {
  PAGE_SLUG_RE,
  localizePageMeta,
  pageHasDe,
  canViewPage,
} from "@/app/_lib/pages";
import { getPageBySlug } from "@/app/_lib/pages-server";
import { getPageBlocks } from "@/app/_lib/blocks-server";
import {
  localizeBlock,
  isSystemBlockType,
  type LocalizedContentBlock,
} from "@/app/_lib/blocks";
import { getIsAdmin } from "@/app/_lib/admin";
import ContentBlock from "@/app/_components/blocks/ContentBlock";

// Pierwszy top-level dynamiczny segment: statyczne trasy (sklep, koszyk,
// (legal) itd.) mają pierwszeństwo — tu trafiają tylko nieznane slugi.
// /de/<slug> działa automatycznie (proxy stripLocale jest prefiksowe).

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!PAGE_SLUG_RE.test(slug)) return {};
  const [page, locale] = await Promise.all([getPageBySlug(slug), getLocale()]);
  if (!page) return {};
  const meta = localizePageMeta(page, locale);
  const plPath = `/${page.slug}`;
  return {
    title: meta.title,
    description: meta.seoDescription ?? undefined,
    // Szkic nigdy nie trafia do indeksu (podgląd admina renderuje się z 200).
    ...(page.published ? {} : { robots: { index: false, follow: false } }),
    alternates: {
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe: pageHasDe(page) }).languages,
    },
    openGraph: { locale: locale === "de" ? "de_DE" : "pl_PL" },
  };
}

export default async function PodstronaPage({ params }: Props) {
  const { slug } = await params;
  if (!PAGE_SLUG_RE.test(slug)) notFound();
  const [page, locale] = await Promise.all([getPageBySlug(slug), getLocale()]);
  if (!page) notFound();
  const isDraftPreview = !page.published;
  // Short-circuit: auth sprawdzamy tylko dla szkiców (opublikowane bez kosztu).
  if (isDraftPreview && !canViewPage(page.published, await getIsAdmin())) {
    notFound();
  }

  const blocks = (await getPageBlocks(page.id))
    .map((b) => localizeBlock(b, locale))
    .filter(
      (b): b is LocalizedContentBlock =>
        b !== null && b.visible && !isSystemBlockType(b.type)
    );
  const meta = localizePageMeta(page, locale);

  return (
    <div className="pb-8">
      {isDraftPreview && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <p className="inline-flex px-4 py-2 rounded-full text-xs font-sans uppercase tracking-widest bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Szkic — widoczny tylko dla administratora
          </p>
        </div>
      )}
      <header className="max-w-7xl mx-auto px-6 pt-16 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--fg)]">
          {meta.title}
        </h1>
      </header>
      {blocks.map((b) => (
        <Fragment key={b.id}>
          <ContentBlock block={b} locale={locale} />
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Weryfikacja** — `npx tsc --noEmit` (0), `npm test` (zielone), **`npm run build`** (MUSI przejść — pierwszy top-level `[slug]` nie może kolidować ze statycznymi trasami; build to jedyna brama tej klasy błędów). Potem `npm run dev` (ŻYWA baza — tylko odczyt): `curl` na `http://localhost:3000/nie-ma-takiej-strony` → 404 (globalny not-found), `http://localhost:3000/sklep` → 200 (statyczna trasa nietknięta), `http://localhost:3000/de/nie-ma-takiej-strony` → 404. Zatrzymaj dev server.

- [ ] **Step 3: Commit**

```bash
git add "app/[slug]/page.tsx"
git commit -m "feat(podstrony): publiczna trasa /[slug] z podgladem szkicu dla admina"
```

---

### Task 5: Sitemapa — wpisy opublikowanych podstron

**Files:**
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `getPagesForSitemap` (T3); istniejące `sitemapAlternates(plPath, { hasDe }, BASE)` i wzorzec `productRoutes` w tym pliku.
- Produces: wpisy `/<slug>` (+ `/de/<slug>` gdy `hasDe`) dla `published=true`.

- [ ] **Step 1: PRZECZYTAJ CAŁY `app/sitemap.ts`**, znajdź blok `try` z odczytami DB i miejsce, gdzie budowane jest `productRoutes` oraz zwracana tablica.

- [ ] **Step 2: Dodaj import i wpisy podstron** — import: `import { getPagesForSitemap } from "@/app/_lib/pages-server";` (dopasuj styl do istniejących importów). Wewnątrz bloku `try`, po zbudowaniu `productRoutes`, dodaj:

```ts
    // Podstrony (krok C): tylko opublikowane; DE tylko przy przetłumaczonym
    // tytule (hasDe) — spójnie z wpisami produktów.
    const pages = await getPagesForSitemap();
    const pageRoutes: MetadataRoute.Sitemap = pages.flatMap((p) => {
      const plPath = `/${p.slug}`;
      const hasDe = !!p.title_de && p.title_de.trim().length > 0;
      const lastModified = new Date(p.updated_at);
      const alternates = sitemapAlternates(plPath, { hasDe }, BASE);
      const entries: MetadataRoute.Sitemap = [
        {
          url: `${BASE}${plPath}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.5,
          alternates,
        },
      ];
      if (hasDe) {
        entries.push({
          url: `${BASE}/de${plPath}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.5,
          alternates,
        });
      }
      return entries;
    });
```

Dopisz `...pageRoutes` do zwracanej tablicy (tam, gdzie łączone są categoryRoutes/collectionRoutes/productRoutes — dopasuj się do faktycznej struktury; jeśli identyfikatory BASE/sitemapAlternates różnią się nazwą, użyj faktycznych z pliku).

- [ ] **Step 3: Weryfikacja** — `npx tsc --noEmit` (0); `npm run dev` → `curl http://localhost:3000/sitemap.xml` zwraca XML bez błędu 500 (podstron w bazie brak — sekcja pusta, to OK). Zatrzymaj dev server.

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(podstrony): opublikowane podstrony w sitemapie (PL + /de przy tlumaczeniu)"
```

---

### Task 6: Akcje — CRUD stron + `page_id` w dodawaniu bloków

**Files:**
- Create: `app/admin/podstrony/actions.ts` (`"use server"` — tylko async funkcje)
- Modify: `app/admin/strona-glowna/actions.ts` (funkcja `addContentBlock`)
- Modify: `app/admin/strona-glowna/AddBlockModal.tsx` (prop `pageId`)

**Interfaces:**
- Consumes: `slugifyTitle`/`validatePageSlug` (T2), `invalidatePagesCache` (T3), `invalidatePageBlocksCache` (istniejące), `requireAdmin`, `createAdminClient`, `ActionResult` z `@/app/_lib/types`
- Produces:
  - `createPage(formData: FormData): Promise<ActionResult>` — pola `title` (+opcjonalnie `slug`); sukces → `data: { id }`
  - `updatePageMeta(formData: FormData): Promise<ActionResult>` — pola `id`, `title`, `title_de`, `slug`, `prev_slug`, `seo_description`, `seo_description_de`
  - `togglePagePublished(formData: FormData): Promise<ActionResult>` — pola `id`, `published` ("1"/"0")
  - `deletePage(formData: FormData): Promise<ActionResult>` — pole `id` (bloki kasuje FK cascade)
  - `addContentBlock` przyjmuje w FormData opcjonalne pole `page_id` (uuid) — blok ląduje na wskazanej podstronie
  - `AddBlockModal` przyjmuje opcjonalny prop `pageId?: string`

- [ ] **Step 1: Utwórz `app/admin/podstrony/actions.ts`**

```ts
"use server";

// Akcje CRUD podstron (krok C). Wzorce z app/admin/strona-glowna/actions.ts.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { slugifyTitle, validatePageSlug } from "@/app/_lib/pages";
import { invalidatePagesCache } from "@/app/_lib/pages-server";
import { invalidatePageBlocksCache } from "@/app/_lib/blocks-server";
import type { ActionResult } from "@/app/_lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitize(input: unknown, max = 300): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Strona /<slug> renderuje się dynamicznie per request (headers/locale), ale
// unstable_cache trzyma dane 60 s — tagi czyszczą oba źródła; ścieżki dla
// pewności (PL + DE). Kasowanie/zmiana sluga: rewalidujemy też starą ścieżkę.
function revalidatePages(slugs: (string | null | undefined)[]): void {
  invalidatePagesCache();
  invalidatePageBlocksCache();
  for (const slug of slugs) {
    if (!slug) continue;
    revalidatePath(`/${slug}`);
    revalidatePath(`/de/${slug}`);
  }
  revalidatePath("/admin/podstrony");
}

export async function createPage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };
  const requested = sanitize(formData.get("slug"), 100);
  const slug = requested || slugifyTitle(title);
  const valid = validatePageSlug(slug);
  if (!valid.ok) return { ok: false, error: valid.error };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .insert({ slug, title } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Strona o takim adresie już istnieje" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePages([slug]);
  return {
    ok: true,
    message: "Utworzono stronę (szkic) — uzupełnij treść i opublikuj",
    data: { id: (data as { id: string }).id },
  };
}

export async function updatePageMeta(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };
  const slug = sanitize(formData.get("slug"), 100);
  const prevSlug = sanitize(formData.get("prev_slug"), 100);
  const valid = validatePageSlug(slug);
  if (!valid.ok) return { ok: false, error: valid.error };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .update({
      title,
      title_de: emptyToNull(sanitize(formData.get("title_de"), 200)),
      slug,
      seo_description: emptyToNull(sanitize(formData.get("seo_description"), 300)),
      seo_description_de: emptyToNull(
        sanitize(formData.get("seo_description_de"), 300)
      ),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Strona o takim adresie już istnieje" };
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug, prevSlug !== slug ? prevSlug : null]);
  return { ok: true, message: "Zapisano ustawienia strony" };
}

export async function togglePagePublished(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const published = formData.get("published") === "1";
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .update({ published, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("slug");
  if (error) return { ok: false, error: error.message };
  const slug = (data as { slug: string }[] | null)?.[0]?.slug;
  if (!slug) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug]);
  return {
    ok: true,
    message: published ? "Strona opublikowana" : "Strona cofnięta do szkicu",
  };
}

export async function deletePage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .delete()
    .eq("id", id)
    .select("slug");
  if (error) return { ok: false, error: error.message };
  const slug = (data as { slug: string }[] | null)?.[0]?.slug;
  if (!slug) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug]);
  return { ok: true, message: "Usunięto stronę (razem z jej sekcjami)" };
}
```

- [ ] **Step 2: `addContentBlock` z opcjonalnym `page_id`** — w `app/admin/strona-glowna/actions.ts` PRZECZYTAJ funkcję `addContentBlock` i zmień dokładnie trzy miejsca:

1. Po walidacji `type` dodaj odczyt page_id:

```ts
  // Krok C: blok może trafić na podstronę (page_id z FormData); brak/niepoprawny → home.
  const pageIdRaw = formData.get("page_id");
  const pageId =
    typeof pageIdRaw === "string" && UUID_RE.test(pageIdRaw) ? pageIdRaw : null;
```

2. Zapytanie o max `sort_order`: zamień stałe `.is("page_id", null)` na warunkowe:

```ts
  let maxQuery = supabase
    .from("page_blocks")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  maxQuery = pageId ? maxQuery.eq("page_id", pageId) : maxQuery.is("page_id", null);
  const { data: maxRows } = await maxQuery;
```

3. W INSERT zamień `page_id: null` na `page_id: pageId`.

`revalidateHome()` na końcu ZOSTAJE (inwaliduje wspólny tag `page-blocks`, więc pokrywa też podstrony; strona `/<slug>` renderuje się dynamicznie).

- [ ] **Step 3: Prop `pageId` w `AddBlockModal.tsx`** — rozszerz propsy i wywołanie:

```tsx
export default function AddBlockModal({
  onClose,
  onResult,
  pageId,
}: {
  onClose: () => void;
  onResult: (r: ActionResult) => void;
  pageId?: string;
}) {
```

a w funkcji `add(type)` po `fd.set("type", type);` dodaj:

```ts
    if (pageId) fd.set("page_id", pageId);
```

(Istniejące wywołanie w `BlocksEditor` bez `pageId` działa bez zmian — home.)

- [ ] **Step 4: Weryfikacja** — `npx tsc --noEmit` (0), `npm test` (zielone).

- [ ] **Step 5: Commit**

```bash
git add app/admin/podstrony/actions.ts app/admin/strona-glowna/actions.ts app/admin/strona-glowna/AddBlockModal.tsx
git commit -m "feat(admin): akcje CRUD podstron + page_id w dodawaniu blokow"
```

---

### Task 7: Admin — lista `/admin/podstrony`, tworzenie, nawigacja, karta w hubie

**Files:**
- Create: `app/admin/podstrony/page.tsx`
- Create: `app/admin/podstrony/CreatePageForm.tsx`
- Create: `app/admin/podstrony/PagesList.tsx`
- Modify: `app/admin/AdminShell.tsx` (`NAV_ITEMS` + ikona)
- Modify: `app/admin/strona-glowna/BlocksEditor.tsx` (karta-link „Podstrony" przed `SiteTextsCard`)

**Interfaces:**
- Consumes: `getAllPagesAdmin` (T3), `createPage`/`togglePagePublished`/`deletePage` (T6), `slugifyTitle` (T2), `PageRow` (T2), `Card`/`ToastView`/`Toast`/`Field`/`inputCls` z `@/app/admin/_shared` (sprawdź faktyczne eksporty), `useConfirm` z `@/app/_context/ConfirmContext`, `requireAdmin`
- Produces: działająca lista + tworzenie strony (redirect do edytora — trasa powstaje w Tasku 8; do tego czasu link prowadzi do 404 admina, co jest akceptowalne w obrębie brancha).

- [ ] **Step 1: `app/admin/podstrony/page.tsx`**

```tsx
import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { getAllPagesAdmin } from "@/app/_lib/pages-server";
import CreatePageForm from "./CreatePageForm";
import PagesList from "./PagesList";

export const metadata: Metadata = { title: "Podstrony — panel admina" };

export default async function AdminPagesPage() {
  await requireAdmin();
  const pages = await getAllPagesAdmin();
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)]">Podstrony</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Własne strony sklepu (np. „Pielęgnacja mebli") składane z tych samych
          sekcji co strona główna. Nowa strona zaczyna jako szkic — publikujesz
          ją, gdy będzie gotowa.
        </p>
      </div>
      <CreatePageForm />
      <PagesList initialPages={pages} />
    </div>
  );
}
```

- [ ] **Step 2: `app/admin/podstrony/CreatePageForm.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPage } from "./actions";
import { slugifyTitle } from "@/app/_lib/pages";
import { Card, Field, inputCls } from "@/app/admin/_shared";

export default function CreatePageForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startTransition] = useTransition();
  const previewSlug = slugifyTitle(title);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("title", title);
    startTransition(async () => {
      const res = await createPage(fd);
      if (res.ok) {
        const id = (res.data as { id: string } | undefined)?.id;
        if (id) router.push(`/admin/podstrony/${id}`);
        else router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
          Nowa strona
        </h2>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Tytuł strony" required className="flex-1 min-w-[240px]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="np. Pielęgnacja mebli"
              className={inputCls}
            />
          </Field>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {creating ? "Tworzę..." : "Utwórz stronę"}
          </button>
        </div>
        {previewSlug && (
          <p className="text-xs text-[var(--muted)]">
            Adres strony: <code className="font-mono">/{previewSlug}</code>{" "}
            (możesz go zmienić w ustawieniach strony)
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Card>
  );
}
```

⚠️ Jeśli `Field` z `app/admin/_shared.tsx` nie przyjmuje `className` — owiń w `<div className="flex-1 min-w-[240px]">` zamiast przekazywać prop (sprawdź sygnaturę).

- [ ] **Step 3: `app/admin/podstrony/PagesList.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { togglePagePublished, deletePage } from "./actions";
import type { PageRow } from "@/app/_lib/pages";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

export default function PagesList({ initialPages }: { initialPages: PageRow[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [prevInitial, setPrevInitial] = useState(initialPages);
  if (initialPages !== prevInitial) {
    setPrevInitial(initialPages);
    setPages(initialPages);
  }
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }
  function handleResult(result: ActionResult) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      router.refresh();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  function togglePublished(p: PageRow) {
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("published", p.published ? "0" : "1");
    const prev = pages;
    setPages(pages.map((x) => (x.id === p.id ? { ...x, published: !x.published } : x)));
    startTransition(async () => {
      const res = await togglePagePublished(fd);
      if (!res.ok) {
        setPages(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  async function remove(p: PageRow) {
    const ok = await confirm({
      message: `Usunąć stronę „${p.title}" razem ze wszystkimi jej sekcjami? Tej operacji nie można cofnąć.`,
      danger: true,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", p.id);
    startTransition(async () => {
      handleResult(await deletePage(fd));
    });
  }

  if (pages.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic">
        Nie ma jeszcze żadnych podstron — utwórz pierwszą powyżej.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ToastView toast={toast} />
      {pages.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display text-lg font-semibold text-[var(--fg)]">
                  {p.title}
                </p>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest ${
                    p.published
                      ? "bg-[var(--color-gold)]/15 text-[var(--color-gold-text)]"
                      : "bg-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {p.published ? "Opublikowana" : "Szkic"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-mono">/{p.slug}</span>
                {" · "}
                {new Date(p.updated_at).toLocaleDateString("pl-PL")}
              </p>
            </div>
            <a
              href={`/${p.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors shrink-0"
            >
              Podgląd ↗
            </a>
            <button
              type="button"
              role="switch"
              aria-checked={p.published}
              aria-label={`Publikacja strony ${p.title}`}
              onClick={() => togglePublished(p)}
              disabled={isPending}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                p.published ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  p.published ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
            <Link
              href={`/admin/podstrony/${p.id}`}
              className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
            >
              Edytuj
            </Link>
            <button
              type="button"
              onClick={() => remove(p)}
              disabled={isPending}
              className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
            >
              Usuń
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Nawigacja w `AdminShell.tsx`** — w `NAV_ITEMS` dopisz po wpisie „Strona główna":

```ts
  { href: "/admin/podstrony", label: "Podstrony", icon: PagesIcon },
```

a obok pozostałych ikon (na dole pliku, wzorzec sąsiednich) dodaj:

```tsx
function PagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}
```

(Dopasuj rozmiar/atrybuty SVG do sąsiednich ikon w tym pliku — mają być identyczne stylistycznie.)

- [ ] **Step 5: Karta „Podstrony" w hubie** — w `app/admin/strona-glowna/BlocksEditor.tsx`, bezpośrednio PRZED `<SiteTextsCard .../>`, dodaj (import `Link` z `next/link` już jest w pliku — sprawdź):

```tsx
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
              Podstrony
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Własne strony (np. „Pielęgnacja mebli") składane z tych samych
              sekcji co strona główna.
            </p>
          </div>
          <Link
            href="/admin/podstrony"
            className="shrink-0 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline"
          >
            Zarządzaj →
          </Link>
        </div>
      </Card>
```

- [ ] **Step 6: Weryfikacja** — `npx tsc --noEmit` (0), `npm test` (zielone), `npm run build` (zielony — nowe strony admina). 

- [ ] **Step 7: Commit**

```bash
git add app/admin/podstrony app/admin/AdminShell.tsx app/admin/strona-glowna/BlocksEditor.tsx
git commit -m "feat(admin): lista podstron + tworzenie + nawigacja + karta w hubie"
```

---

### Task 8: Admin — edytor strony `/admin/podstrony/[id]`

**Files:**
- Create: `app/admin/podstrony/[id]/page.tsx`
- Create: `app/admin/podstrony/[id]/PageEditor.tsx`

**Interfaces:**
- Consumes: `getPageAdmin`/`getAllPagesAdmin` NIE — tylko `getPageAdmin` (T3), `getPageBlocksAdmin` (T3), `getProductsForBlockPicker` (`@/app/_lib/blocks-server`), `getAllCollections` (`@/app/_lib/collections`), `getCategories` (`@/app/_lib/categories`), `updatePageMeta`/`togglePagePublished` (T6), `reorderPageBlocks`/`togglePageBlockVisible`/`deleteContentBlock` z `@/app/admin/strona-glowna/actions`, `AddBlockModal` (z `pageId` — T6), formularze + `BlockPickerData` + `cs` z `@/app/admin/strona-glowna/BlockForms`, `CONTENT_BLOCK_DEFS`/`isContentBlockType`/`PageBlockRow` z `@/app/_lib/blocks`, `PageRow` (T2), `Card`/`ToastView`/`Toast`/`Field`/`inputCls`, `useConfirm`.
- Produces: pełny edytor podstrony (meta + bloki). Mechanika wierszy bloków = ŚWIADOMY bliźniak gałęzi treściowej `BlocksEditor` (bez systemowych) — wydzielanie wspólnego komponentu odłożone (follow-up), żeby nie ruszać działającego edytora home.

- [ ] **Step 1: `app/admin/podstrony/[id]/page.tsx`** (wzorzec params-Promise z `app/admin/produkty/[id]/page.tsx`):

```tsx
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getPageAdmin } from "@/app/_lib/pages-server";
import {
  getPageBlocksAdmin,
  getProductsForBlockPicker,
} from "@/app/_lib/blocks-server";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import PageEditor from "./PageEditor";

export default async function AdminPageEdit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [page, blocks, products, collections, categories] = await Promise.all([
    getPageAdmin(id),
    getPageBlocksAdmin(id),
    getProductsForBlockPicker(),
    getAllCollections(),
    getCategories(),
  ]);
  if (!page) notFound();
  return (
    <PageEditor
      initialPage={page}
      initialBlocks={blocks}
      picker={{
        products,
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
  );
}
```

⚠️ Mapowanie pickera skopiuj 1:1 z `app/admin/strona-glowna/page.tsx` (tam już działa — dopasuj się do faktycznych kształtów).

- [ ] **Step 2: `app/admin/podstrony/[id]/PageEditor.tsx`** — kompletny komponent:

```tsx
"use client";

// Edytor podstrony: ustawienia (tytuł/adres/SEO/publikacja) + sekcje-bloki.
// Mechanika wierszy bloków to świadomy bliźniak gałęzi treściowej
// BlocksEditor (home) — bez bloków systemowych; wydzielenie wspólnego
// komponentu odłożone, żeby nie ruszać działającego edytora home.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updatePageMeta, togglePagePublished } from "../actions";
import {
  reorderPageBlocks,
  togglePageBlockVisible,
  deleteContentBlock,
} from "@/app/admin/strona-glowna/actions";
import AddBlockModal from "@/app/admin/strona-glowna/AddBlockModal";
import {
  BannerForm,
  GalleryForm,
  FaqForm,
  ReviewsForm,
  ProductsForm,
  cs,
  type BlockPickerData,
} from "@/app/admin/strona-glowna/BlockForms";
import {
  CONTENT_BLOCK_DEFS,
  isContentBlockType,
  type PageBlockRow,
} from "@/app/_lib/blocks";
import type { PageRow } from "@/app/_lib/pages";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, Field, inputCls, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

export default function PageEditor({
  initialPage,
  initialBlocks,
  picker,
}: {
  initialPage: PageRow;
  initialBlocks: PageBlockRow[];
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

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
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

  // ── Bloki: mechanika 1:1 z BlocksEditor (gałąź treściowa) ────────────────
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = blocks;
    setBlocks(next);
    startTransition(async () => {
      const res = await reorderPageBlocks(next.map((b) => b.id));
      if (!res.ok) {
        setBlocks(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function toggleVisible(b: PageBlockRow) {
    const fd = new FormData();
    fd.set("id", b.id);
    fd.set("visible", b.visible ? "0" : "1");
    const prev = blocks;
    setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)));
    startTransition(async () => {
      const res = await togglePageBlockVisible(fd);
      if (!res.ok) {
        setBlocks(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

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
      handleResult(await deleteContentBlock(fd));
    });
  }

  function togglePublished() {
    const fd = new FormData();
    fd.set("id", initialPage.id);
    fd.set("published", initialPage.published ? "0" : "1");
    startTransition(async () => {
      handleResult(await togglePagePublished(fd));
    });
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/admin/podstrony"
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Podstrony
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
            {initialPage.title}
          </h1>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest ${
              initialPage.published
                ? "bg-[var(--color-gold)]/15 text-[var(--color-gold-text)]"
                : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {initialPage.published ? "Opublikowana" : "Szkic"}
          </span>
          <a
            href={`/${initialPage.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
          >
            Podgląd ↗
          </a>
          <button
            type="button"
            onClick={togglePublished}
            disabled={isPending}
            className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-60"
          >
            {initialPage.published ? "Cofnij do szkicu" : "Opublikuj"}
          </button>
        </div>
      </div>

      <ToastView toast={toast} />

      <Card>
        <MetaForm page={initialPage} onResult={handleResult} />
      </Card>

      <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
        Sekcje strony
      </h2>
      {blocks.length === 0 && (
        <p className="text-sm text-[var(--muted)] italic">
          Strona nie ma jeszcze sekcji — dodaj pierwszą poniżej.
        </p>
      )}
      <div className="flex flex-col gap-4" data-guard-section>
        {blocks.map((b, i) => {
          const meta = isContentBlockType(b.block_type)
            ? CONTENT_BLOCK_DEFS[b.block_type]
            : null;
          if (!meta) return null;
          const expanded = expandedId === b.id;
          return (
            <Card key={b.id}>
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || isPending}
                    aria-label={`Przesuń sekcję ${meta.name} wyżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1 || isPending}
                    aria-label={`Przesuń sekcję ${meta.name} niżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-display text-lg font-semibold ${b.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                      {meta.name}
                    </p>
                    {!b.visible && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest bg-[var(--border)] text-[var(--muted)]">
                        Ukryta
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {cs(b.content.heading) || "(bez nagłówka)"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.visible}
                  aria-label={`Widoczność sekcji ${meta.name}`}
                  onClick={() => toggleVisible(b)}
                  disabled={isPending}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${b.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${b.visible ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(b)}
                  disabled={isPending}
                  className="shrink-0 px-3 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
                >
                  Usuń
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : b.id)}
                  aria-expanded={expanded}
                  aria-label={`Edytuj treść sekcji ${meta.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
              {expanded && (
                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                  {b.block_type === "banner" && <BannerForm block={b} onResult={handleResult} />}
                  {b.block_type === "gallery" && <GalleryForm block={b} onResult={handleResult} />}
                  {b.block_type === "faq" && <FaqForm block={b} onResult={handleResult} />}
                  {b.block_type === "reviews" && <ReviewsForm block={b} onResult={handleResult} />}
                  {b.block_type === "products" && <ProductsForm block={b} onResult={handleResult} picker={picker} />}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="self-start px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj sekcję
      </button>

      {addOpen && (
        <AddBlockModal
          pageId={initialPage.id}
          onClose={() => setAddOpen(false)}
          onResult={handleResult}
        />
      )}
    </div>
  );
}

// Ustawienia strony — uncontrolled form z FormData (wzorzec SystemHeadingsForm).
function MetaForm({
  page,
  onResult,
}: {
  page: PageRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      onResult(await updatePageMeta(formData));
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
        Ustawienia strony
      </h2>
      <input type="hidden" name="id" value={page.id} />
      <input type="hidden" name="prev_slug" value={page.slug} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tytuł" required>
          <input name="title" defaultValue={page.title} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Tytuł (DE)">
          <input name="title_de" defaultValue={page.title_de ?? ""} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Adres strony (po sklep.pl/)">
          <input name="slug" defaultValue={page.slug} maxLength={100} className={`${inputCls} font-mono`} />
        </Field>
        <p className="text-xs text-[var(--muted)] self-end pb-3">
          Małe litery, cyfry i myślniki. Zmiana adresu zmienia link do strony —
          stary przestanie działać.
        </p>
        <Field label="Opis dla wyszukiwarek (SEO)">
          <textarea name="seo_description" defaultValue={page.seo_description ?? ""} rows={2} maxLength={300} className={inputCls} />
        </Field>
        <Field label="Opis SEO (DE)">
          <textarea name="seo_description_de" defaultValue={page.seo_description_de ?? ""} rows={2} maxLength={300} className={inputCls} />
        </Field>
      </div>
      <button
        type="submit"
        disabled={saving}
        data-guard-save
        className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {saving ? "Zapisuję..." : "Zapisz ustawienia"}
      </button>
    </form>
  );
}
```

⚠️ Sprawdź przed kompilacją: (a) czy `Field` przyjmuje children tak jak w pozostałych formularzach (tak — wzorzec BlockForms); (b) czy `<form action={submit}>` z funkcją `(formData: FormData) => void` jest wzorcem używanym w `SystemHeadingsForm` w `BlocksEditor.tsx` — skopiuj dokładnie tamten idiom, jeśli się różni.

- [ ] **Step 3: Weryfikacja** — `npx tsc --noEmit` (0), `npm test` (zielone), **`npm run build`** (zielony). `npm run dev`: `/admin/podstrony` → 307 na `/logowanie` (parytet z innymi trasami admina), `/` → 200. Zatrzymaj dev server.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/podstrony/[id]"
git commit -m "feat(admin): edytor podstrony - ustawienia + sekcje-bloki"
```

---

### Task 9: Pełna weryfikacja automatyczna

**Files:** żadnych nowych zmian (poprawki z weryfikacji — osobne commity).

- [ ] **Step 1:** `npx tsc --noEmit` — 0 błędów.
- [ ] **Step 2:** `npm test` — wszystkie zielone.
- [ ] **Step 3:** `npm run build` — zielony.
- [ ] **Step 4:** Smoke z dev serverem (`npm run dev`, potem zatrzymaj): `/` 200, `/de` 200, `/sklep` 200, `/nie-ma-takiej-strony` 404, `/sitemap.xml` 200 (bez wpisów podstron — tabela `pages` jeszcze nie istnieje, fail-open pusta sekcja).
- [ ] **Step 5:** Raport końcowy (wyniki komend). NIE uruchamiaj migracji 53 — kontroler zapuści ją na prod za zgodą usera, potem: merge, e2e mutacyjny (create draft przez SQL → anon 404 → publish → 200 z treścią bloku → delete → cascade bloków zweryfikowany → 404) i klik-test.

---

## Sekwencja wdrożenia (kontroler, poza taskami)

1. Final review całego brancha.
2. **Migracja 53 na prod** (Supabase MCP, za zgodą usera) — czysto addytywna (nowa tabela + FK na kolumnie, w której są tylko NULL-e); ZERO okna widocznego dla klientów (stary kod nie zna trasy `[slug]`, home bez zmian).
3. Merge PR + deploy → e2e mutacyjny na żywej bazie (za zgodą; przywrócić stan) + klik-test Mikołaja.
