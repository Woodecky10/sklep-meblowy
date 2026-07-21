# Przycisk „na górę" w adminie + wyszukiwanie odporne na spacje/kolejność — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wyszukiwarki (admin + storefront) mają dopasowywać niezależnie od spacji i kolejności słów; panel admina dostaje pływający przycisk „na górę".

**Architecture:** Admin (filtry in-memory) dostaje wspólny helper `searchMatches` (normalizacja + usunięcie spacji z „siana" + słowa-AND). Storefront (SQL) dostaje kolumny generowane `search_key`/`search_key_de` (odspacjowane) + per-token `ILIKE` ANDowane. `BackToTop` (istniejący) wpięty w `AdminShell`.

**Tech Stack:** Next.js (App Router, wersja z breaking changes — patrz Global Constraints), TypeScript, Supabase (Postgres, generated columns, pg_trgm), Vitest, Tailwind.

## Global Constraints

- **AGENTS.md:** To NIE jest znany ci Next.js — przed pisaniem/zmianą server/client components lub server actions przejrzyj właściwy guide w `node_modules/next/dist/docs/` jeśli coś w API jest niepewne.
- **Implementacja przez subagentów na Opusie** (stała zasada repo): każdy task deleguj Agent tool z `model:"opus"`; review po każdym tasku.
- **⚠️ Git root = katalog domowy** (`C:/Users/wood1`); projekt = podkatalog `sklep-meblowy/`; dziesiątki nieśledzonych plików domowych. **NIGDY `git add -A` / `git add .`** — commituj WYŁĄCZNIE jawnymi ścieżkami. Git uruchamiaj z `C:/Users/wood1/sklep-meblowy`. Ścieżki z `[...]` (np. `[slug]`) stage'uj przez katalog nadrzędny (bracket-glob).
- **Test runner:** Vitest, NON-watch (`npx vitest run <wzorzec>`). Nigdy nie zostawiaj procesu watch.
- **Semantyka dopasowania:** frazę tnij na słowa; każde słowo musi wystąpić (AND); spacje w „sianie" całkowicie usuwane; pusta fraza → nie zawęża. Diakrytyki: admin nieczuły (przez `normalizeSearchText`), storefront czuły (kolumna nie zdejmuje diakrytyków) — bez zmian względem dziś.
- **Git:** gałąź `feat/admin-backtotop-search` (utworzona, spec zacommitowany). Konto gh do PR: Woodecky10.
- **Spec:** `docs/superpowers/specs/2026-07-21-backtotop-wyszukiwanie-design.md`.

---

## File Structure

- **Create:** `supabase/migrations/61_products_search_key.sql`.
- **Modify:** `app/_lib/search-normalize.ts` (+`searchMatches`); `app/_lib/search-filter.ts` (+`searchTokens`/`MAX_SEARCH_TOKENS`, `rankByNameMatch` wielo-tokenowy, −`buildSearchOrFilter`); `app/_lib/products.ts` (pętla ILIKE po tokenach); `app/admin/produkty/ProductsList.tsx`; `app/admin/tkaniny/FabricsEditor.tsx`; `app/admin/zestawy/BundlesEditor.tsx`; `app/admin/AdminShell.tsx`.
- **Tests:** `app/_lib/__tests__/search-normalize.test.ts` (+`searchMatches`); `app/_lib/__tests__/search-filter.test.ts` (`searchTokens`, `rankByNameMatch` wielo-token, −`buildSearchOrFilter`).
- **Bez zmian:** `BackToTop.tsx`, `HideOnAdmin`, `app/layout.tsx`.

---

## Task 1: `searchMatches` + 3 wyszukiwarki admina

**Files:**
- Modify: `app/_lib/search-normalize.ts`, `app/admin/produkty/ProductsList.tsx`, `app/admin/tkaniny/FabricsEditor.tsx`, `app/admin/zestawy/BundlesEditor.tsx`
- Test: `app/_lib/__tests__/search-normalize.test.ts`

**Interfaces:**
- Produces: `searchMatches(haystack: string, query: string): boolean` z `@/app/_lib/search-normalize`.

- [ ] **Step 1: Test (failing) dla `searchMatches`**

Dopisz w `app/_lib/__tests__/search-normalize.test.ts` (nowy import + blok):

```ts
import { normalizeSearchText, searchMatches } from "@/app/_lib/search-normalize";
```
```ts
describe("searchMatches — spacje i kolejność słów bez znaczenia", () => {
  it("dowolna kolejność słów", () => {
    expect(searchMatches("Narożnik VEGAS L", "vegas narożnik")).toBe(true);
  });
  it("spacje całkowicie ignorowane (obie strony)", () => {
    expect(searchMatches("Chill Me", "chillme")).toBe(true);
    expect(searchMatches("Chillme", "chill me")).toBe(true);
  });
  it("diakrytyki nieczułe", () => {
    expect(searchMatches("Łóżko Sawana", "lozko")).toBe(true);
  });
  it("wszystkie słowa muszą wystąpić", () => {
    expect(searchMatches("Sofa Modena", "sofa xyz")).toBe(false);
  });
  it("pusta / sama-spacja fraza → true (nie zawęża)", () => {
    expect(searchMatches("cokolwiek", "")).toBe(true);
    expect(searchMatches("cokolwiek", "   ")).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run search-normalize`
Expected: FAIL — `searchMatches is not a function` / brak eksportu.

- [ ] **Step 3: Implementacja `searchMatches`**

W `app/_lib/search-normalize.ts` dopisz pod istniejącą funkcją:

```ts
// Dopasowanie odporne na spacje i kolejność słów: normalizujemy obie strony
// (małe litery, bez diakrytyków — przez normalizeSearchText), z „siana" usuwamy
// WSZYSTKIE spacje, frazę tniemy na słowa; trafienie = każde słowo jest
// podłańcuchem odspacjowanego siana. Pusta fraza → true (nie zawęża).
export function searchMatches(haystack: string, query: string): boolean {
  const key = normalizeSearchText(haystack).replace(/\s+/g, "");
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return tokens.every((t) => key.includes(t));
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run search-normalize`
Expected: PASS (stare + nowe testy).

- [ ] **Step 5: Podmień filtr w `ProductsList.tsx`**

Import (linia 6): `import { normalizeSearchText } from "@/app/_lib/search-normalize";`
→ `import { searchMatches } from "@/app/_lib/search-normalize";`

Filtr (linie ~31-39):
```tsx
  const [query, setQuery] = useState("");
  const q = normalizeSearchText(query);
  const visible = q
    ? products.filter(
        (p) =>
          normalizeSearchText(p.name).includes(q) ||
          normalizeSearchText(p.category).includes(q)
      )
    : products;
```
→
```tsx
  const [query, setQuery] = useState("");
  const visible = query.trim()
    ? products.filter(
        (p) => searchMatches(p.name, query) || searchMatches(p.category, query)
      )
    : products;
```

- [ ] **Step 6: Podmień filtr w `FabricsEditor.tsx`**

Import (linia 10): `import { normalizeSearchText } from "@/app/_lib/search-normalize";`
→ `import { searchMatches } from "@/app/_lib/search-normalize";`

Filtr (linie ~242-246):
```tsx
  const filteredProducts = useMemo(() => {
    const q = normalizeSearchText(productQuery);
    if (!q) return pickerProducts;
    return pickerProducts.filter((p) => normalizeSearchText(p.name).includes(q));
  }, [pickerProducts, productQuery]);
```
→
```tsx
  const filteredProducts = useMemo(
    () => pickerProducts.filter((p) => searchMatches(p.name, productQuery)),
    [pickerProducts, productQuery]
  );
```

- [ ] **Step 7: Podmień filtr w `BundlesEditor.tsx`**

Import (linia 9): `import { normalizeSearchText } from "@/app/_lib/search-normalize";`
→ `import { searchMatches } from "@/app/_lib/search-normalize";`

Filtr (linie ~154-158):
```tsx
  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return products;
    return products.filter((p) => normalizeSearchText(p.name).includes(q));
  }, [products, query]);
```
→
```tsx
  const filtered = useMemo(
    () => products.filter((p) => searchMatches(p.name, query)),
    [products, query]
  );
```

- [ ] **Step 8: tsc + lint + test**

Run: `npx tsc --noEmit` (brak błędów — w tym: żaden plik nie importuje już nieużywanego `normalizeSearchText`).
Run: `npm run lint` (bez nowych błędów).
Run: `npx vitest run search-normalize` (PASS).

- [ ] **Step 9: Commit** (jawne ścieżki; `app/admin/tkaniny/` katalogiem — bezpieczne, tylko FabricsEditor tam zmieniony w tym tasku)

```bash
git add app/_lib/search-normalize.ts \
        app/_lib/__tests__/search-normalize.test.ts \
        app/admin/produkty/ProductsList.tsx \
        app/admin/tkaniny/FabricsEditor.tsx \
        app/admin/zestawy/BundlesEditor.tsx
git commit -m "feat(search): searchMatches — admin szuka niezaleznie od spacji i kolejnosci slow"
```

---

## Task 2: Przycisk „na górę" w `AdminShell`

**Files:**
- Modify: `app/admin/AdminShell.tsx`

**Interfaces:**
- Consumes: `BackToTop` (default export) z `@/app/_components/layout/BackToTop` (istniejący, window-based).

- [ ] **Step 1: Import**

W `app/admin/AdminShell.tsx` pod `import UnsavedChangesGuard from "./UnsavedChangesGuard";` dodaj:
```tsx
import BackToTop from "@/app/_components/layout/BackToTop";
```

- [ ] **Step 2: Render**

W `return (...)` tuż po `<UnsavedChangesGuard />`:
```tsx
    <div className="min-h-screen bg-[var(--bg)] lg:flex">
      <UnsavedChangesGuard />
```
→
```tsx
    <div className="min-h-screen bg-[var(--bg)] lg:flex">
      <UnsavedChangesGuard />
      <BackToTop />
```
(`BackToTop` jest `position:fixed` — nie wpływa na layout flex.)

- [ ] **Step 3: tsc + build**

Run: `npx tsc --noEmit` (brak błędów).
Run: `npm run build` (zielony).

- [ ] **Step 4: Weryfikacja w przeglądarce** (skill `verify`/`run`): otwórz `/admin/produkty`, przewiń w dół > 600px → przycisk pojawia się w prawym dolnym rogu; klik → płynny powrót na górę. Jeśli przycisk NIE reaguje (scrolluje `<main>`, nie okno) → zgłoś DONE_WITH_CONCERNS (potrzebny wariant element-scroll); spodziewane: działa (okno scrolluje).

- [ ] **Step 5: Commit**

```bash
git add app/admin/AdminShell.tsx
git commit -m "feat(admin): przycisk 'na gore' w panelu admina (BackToTop w AdminShell)"
```

---

## Task 3: Storefront — kolumny search_key + wyszukiwanie po tokenach

**Files:**
- Create: `supabase/migrations/61_products_search_key.sql`
- Modify: `app/_lib/search-filter.ts`, `app/_lib/products.ts`
- Test: `app/_lib/__tests__/search-filter.test.ts`

**Interfaces:**
- Produces (z `search-filter.ts`): `searchTokens(raw: string): string[]`, `MAX_SEARCH_TOKENS = 10`; `rankByNameMatch` (wielo-tokenowy, sygnatura bez zmian); `buildSearchOrFilter` USUNIĘTY.
- Consumes w `products.ts`: `searchTokens`, `rankByNameMatch`, `escapeIlike`.
- Runtime: kolumny `products.search_key` / `search_key_de` (migracja 61).

- [ ] **Step 1: Plik migracji**

Create `supabase/migrations/61_products_search_key.sql`:

```sql
-- Migracja 61: kolumny wyszukiwania odporne na spacje na products.
-- search_key = lower(name+description) z usuniętymi tagami HTML i WSZYSTKIMI
-- spacjami → ILIKE %token% dopasowuje niezależnie od spacji/kolejności (tokeny
-- ANDowane w zapytaniu). Diakrytyki zachowane (jak dotychczasowe wyszukiwanie
-- storefrontu). Wyrażenie IMMUTABLE (lower/regexp_replace/coalesce/||) → kolumna
-- STORED GENERATED. Idempotentnie.
create extension if not exists pg_trgm;

alter table public.products
  add column if not exists search_key text
  generated always as (
    regexp_replace(
      regexp_replace(
        lower(coalesce(name, '') || ' ' || coalesce(description, '')),
        '<[^>]*>', ' ', 'g'
      ),
      '\s+', '', 'g'
    )
  ) stored;

alter table public.products
  add column if not exists search_key_de text
  generated always as (
    regexp_replace(
      regexp_replace(
        lower(coalesce(name_de, '') || ' ' || coalesce(description_de, '')),
        '<[^>]*>', ' ', 'g'
      ),
      '\s+', '', 'g'
    )
  ) stored;

create index if not exists products_search_key_trgm
  on public.products using gin (search_key gin_trgm_ops);
create index if not exists products_search_key_de_trgm
  on public.products using gin (search_key_de gin_trgm_ops);
```

(Plik nie jest stosowany w tym tasku — aplikacja na prod = Task 4.)

- [ ] **Step 2: Testy (failing) w `search-filter.test.ts`**

Zmień import (linie 2-7): usuń `buildSearchOrFilter`, dodaj `searchTokens`:
```ts
import {
  escapeIlike,
  sanitizeSearchTerm,
  searchTokens,
  rankByNameMatch,
} from "@/app/_lib/search-filter";
```

USUŃ cały blok `describe("buildSearchOrFilter", ...)` (linie ~40-71).

DODAJ blok:
```ts
describe("searchTokens — tokenizacja frazy", () => {
  it("tnie na słowa, zwija spacje", () => {
    expect(searchTokens("  sofa   modena ")).toEqual(["sofa", "modena"]);
  });
  it("sanityzuje jak sanitizeSearchTerm (usuwa składnię .or())", () => {
    expect(searchTokens("x,price.gt.0")).toEqual(["xpricegt0"]);
  });
  it("sama interpunkcja / pusta → []", () => {
    expect(searchTokens(",.()")).toEqual([]);
    expect(searchTokens("")).toEqual([]);
  });
  it("limit MAX_SEARCH_TOKENS (10)", () => {
    const raw = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
    expect(searchTokens(raw)).toHaveLength(10);
  });
});
```

DODAJ do bloku `rankByNameMatch` test wielo-tokenowy:
```ts
  it("wiele słów w dowolnej kolejności — wszystkie muszą być w nazwie", () => {
    const rows = [
      { name: "Sofa Modena szara" },
      { name: "Narożnik VEGAS L Duża Funkcja SPANIA" },
    ];
    const ranked = rankByNameMatch(rows, "spania vegas", get);
    expect(ranked[0]).toEqual({ name: "Narożnik VEGAS L Duża Funkcja SPANIA" });
  });
```

- [ ] **Step 3: Uruchom — FAIL**

Run: `npx vitest run search-filter`
Expected: FAIL — brak `searchTokens` (i ewentualnie stary test buildSearchOrFilter usunięty).

- [ ] **Step 4: Implementacja w `search-filter.ts`**

USUŃ funkcję `buildSearchOrFilter` (cały blok komentarz + funkcja).

DODAJ (obok istniejących eksportów):
```ts
// Maksymalna liczba słów frazy branych pod uwagę (ochrona przed abuse/długim
// zapytaniem). Fraza jest tokenizowana; każde słowo → osobny warunek ILIKE.
export const MAX_SEARCH_TOKENS = 10;

// Tokeny frazy: sanityzacja (allowlist + zwinięcie spacji) → słowa → limit.
export function searchTokens(raw: string): string[] {
  const term = sanitizeSearchTerm(raw);
  if (!term) return [];
  return term.split(" ").filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
}
```

ZAMIEŃ `rankByNameMatch` na wielo-tokenowy (zachowaj sygnaturę i komentarz o rankingu name>opis):
```ts
export function rankByNameMatch<T>(
  rows: T[],
  raw: string,
  getName: (row: T) => string | null | undefined
): T[] {
  const tokens = searchTokens(raw);
  if (tokens.length === 0) return rows;
  const nameHits: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    // Odspacjowana, małoliterowa nazwa — spójnie z kolumną search_key (bez
    // zdejmowania diakrytyków). Trafienie w nazwie = KAŻDE słowo obecne.
    const key = (getName(row) ?? "").toLowerCase().replace(/\s+/g, "");
    if (tokens.every((t) => key.includes(t.toLowerCase()))) nameHits.push(row);
    else rest.push(row);
  }
  return [...nameHits, ...rest];
}
```

- [ ] **Step 5: Wiring w `products.ts`**

Import (linia 5): `import { buildSearchOrFilter, rankByNameMatch } from "./search-filter";`
→ `import { searchTokens, rankByNameMatch, escapeIlike } from "./search-filter";`

Blok filtra (linie ~139-147):
```ts
  // Sanityzacja + budowa filtra .or() w search-filter.ts (escape składni
  // .or() i wildcardów ILIKE). null = po sanityzacji nic nie zostało.
  // DE szuka po name_de/description_de (bez fallbacku — patrz search-filter).
  const searchOrFilter =
    search && search.trim() ? buildSearchOrFilter(search, locale) : null;
  if (searchOrFilter) query = query.or(searchOrFilter);
  // Aktywne wyszukiwanie zmienia tryb paginacji: ranking (nazwa > opis)
  // wymaga całego zestawu dopasowań naraz, więc paginujemy w JS (patrz niżej).
  const searchActive = searchOrFilter !== null;
```
→
```ts
  // Wyszukiwanie odporne na spacje/kolejność: frazę tniemy na słowa i każde
  // słowo dopasowujemy do kolumny search_key (odspacjowana, bez tagów) przez
  // ILIKE — wiele .ilike() na tej samej kolumnie PostgREST ANDuje, więc każde
  // słowo musi wystąpić, niezależnie od kolejności. DE → search_key_de.
  const searchTerms = searchTokens(search ?? "");
  const searchActive = searchTerms.length > 0;
  if (searchActive) {
    const keyCol = locale === "de" ? "search_key_de" : "search_key";
    for (const token of searchTerms) {
      query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
    }
  }
  // Aktywne wyszukiwanie zmienia tryb paginacji: ranking (nazwa > opis)
  // wymaga całego zestawu dopasowań naraz, więc paginujemy w JS (patrz niżej).
```
(Reszta — gałąź `if (searchActive)` z pobraniem i `rankByNameMatch` na liniach ~221-241 — BEZ ZMIAN; `rankByNameMatch` już przyjmuje `search!` i tokenizuje wewnętrznie.)

- [ ] **Step 6: Uruchom testy — PASS**

Run: `npx vitest run search-filter`
Expected: PASS (searchTokens + rankByNameMatch wielo-token + zachowane sanitize/escape).

- [ ] **Step 7: Weryfikacja braku martwych referencji + gate**

Run: `grep -rn "buildSearchOrFilter" app/` → BRAK wyników.
Run: `npx tsc --noEmit` (brak błędów).
Run: `npm run lint` (bez nowych błędów).
Run: `npm test` (pełny — wszystkie PASS).
Run: `npm run build` (zielony).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/61_products_search_key.sql \
        app/_lib/search-filter.ts \
        app/_lib/products.ts \
        app/_lib/__tests__/search-filter.test.ts
git commit -m "feat(search): storefront szuka po tokenach (search_key, migr 61) — spacje/kolejnosc bez znaczenia"
```

---

## Task 4: Weryfikacja e2e + PR

**Files:** brak zmian kodu.

- [ ] **Step 1: Weryfikacja** (skill `verify`): admin — 3 wyszukiwarki (produkty, picker tkanin, picker zestawów): „vegas narożnik" i „narożnikvegas" znajdują ten sam produkt; przycisk „na górę" działa. (Storefront `/sklep` pełną weryfikację po migracji 61 — patrz Task 5; przed migracją zapytanie z frazą zwróci błąd braku kolumny, więc storefront testuj dopiero po Task 5.)
- [ ] **Step 2: PR** (`gh`, konto Woodecky10) z `feat/admin-backtotop-search` do `main`. W opisie: streszczenie, checklista klik-testów, przypomnienie o migracji 61 (przed/przy deployu).

---

## Task 5: Migracja 61 na prodzie (Supabase MCP) — z potwierdzeniem, przy/przed deployem

**Wykonywane w głównej pętli (nie subagent), bo dotyka ŻYWEJ bazy = PROD.** Model: pokaż SQL → potwierdź → wykonaj. Kolumna generowana jest bezpieczna dla starego kodu (ignoruje ją), a nowy kod jej wymaga → migracja **przed lub równocześnie z** merge/deployem.

- [ ] **Step 1:** `mcp__supabase__apply_migration` z treścią `61_products_search_key.sql`. Jeśli `create extension pg_trgm` byłby zablokowany na Supabase — usunąć dwie linie `create index ... gin_trgm_ops` + `create extension` i zastosować bez indeksów (ILIKE działa bez nich; skala setek wierszy).
- [ ] **Step 2: Weryfikacja** — `execute_sql` na `information_schema.columns`: `products` ma `search_key` i `search_key_de`. Sanity: `select name, search_key from products limit 3;` (odspacjowane, małe litery).
- [ ] **Step 3:** Merge PR (jeśli jeszcze nie) → deploy. Smoke `/sklep?search=` i `/de/sklep?search=` (fraza z odwróconą kolejnością słów zwraca wynik).
- [ ] **Step 4:** Zaktualizuj pamięć (memory) o stanie migracji 61 i statusie PR.

---

## Self-Review (autor planu)

**Spec coverage:**
- searchMatches (spacje+kolejność, diakrytyki nieczułe admin) → Task 1. ✅
- 3 wyszukiwarki admina → Task 1 Step 5-7. ✅
- Storefront: search_key kolumny + per-token ILIKE + rank wielo-token → Task 3. ✅
- Migracja 61 (generated + trgm) → Task 3 Step 1 (plik) + Task 5 (prod). ✅
- BackToTop w AdminShell → Task 2. ✅
- Diakrytyki bez zmian (storefront czuły) → kolumna bez unaccent + rank bez zdejmowania diakrytyków (Task 3). ✅
- Testy (searchMatches, searchTokens, rankByNameMatch wielo-token) → Task 1 Step 1, Task 3 Step 2. ✅
- Usunięcie buildSearchOrFilter + brak martwych ref → Task 3 Step 4/7. ✅
- Przypadki brzegowe (pusta fraza, limit tokenów, puste search_key, DE bez fallbacku) → searchMatches/searchTokens + kolumny. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok kodu ma pełną treść. ✅

**Type consistency:** `searchMatches(string,string):boolean`, `searchTokens(string):string[]`, `MAX_SEARCH_TOKENS`, `rankByNameMatch` sygnatura bez zmian — spójne między search-filter.ts, products.ts, testami. `keyCol` ∈ {search_key, search_key_de} zgodne z migracją. ✅
