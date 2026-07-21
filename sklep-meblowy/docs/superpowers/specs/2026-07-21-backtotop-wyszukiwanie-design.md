# Przycisk „na górę" w adminie + wyszukiwanie odporne na spacje i kolejność słów

Data: 2026-07-21. Zatwierdzone przez użytkownika.

## Kontekst i problem

1. **Panel admina nie ma przycisku „na górę".** Storefront ma pływający
   `BackToTop`, ale root layout (`app/layout.tsx`) renderuje go wewnątrz
   `<HideOnAdmin>`, więc na `/admin/*` jest ukryty. Długie listy admina (produkty,
   edytory) wymagają ręcznego przewijania w górę.
2. **Wyszukiwanie jest czułe na spacje i kolejność słów.** Produkty mają długie
   nazwy (np. „Narożnik VEGAS L tkanina CHILL ME 02 ruchome zagłówki Duża Funkcja
   SPANIA"), a obecne dopasowanie to ciągły podłańcuch:
   - Admin (in-memory): `normalizeSearchText(name).includes(normalizeSearchText(query))`
     w `ProductsList`, `FabricsEditor`, `BundlesEditor`.
   - Storefront `/sklep` (SQL): `search-filter.ts` → pojedynczy `name/opis ILIKE
     %fraza%`.
   W obu „vegas narożnik" nie znajduje „Narożnik VEGAS", a „chillme" nie znajduje
   „Chill Me".

## Cel (zatwierdzona semantyka)

Dopasowanie ma być **niewrażliwe na spacje i kolejność słów, wszędzie**:
- frazę tniemy na słowa (po spacjach); **każde słowo** musi wystąpić w celu,
  w dowolnej kolejności (AND);
- spacje w celu są **całkowicie ignorowane** (usuwane przed porównaniem), więc
  „chillme" ↔ „Chill Me" oraz „chill me" ↔ „Chillme";
- pusta fraza → nie zawęża wyników.

Plus: pływający przycisk **„na górę"** w panelu admina.

## Nie-cele (YAGNI / świadome decyzje)

- **Diakrytyki bez zmian względem dziś.** Admin pozostaje diakrytyko-**nie**czuły
  (`normalizeSearchText` zdejmuje ą/ł/…), storefront pozostaje diakrytyko-**czuły**
  (kolumna nie zdejmuje diakrytyków). Zakres tej zmiany to spacje + kolejność słów,
  nie diakrytyki.
- Brak nowego komponentu przycisku — reuse istniejącego `BackToTop`.
- Brak zmian w `HideOnAdmin` (nadal poprawnie chowa chrome storefrontu na adminie).
- Brak fuzzy/typo-tolerancji, rankingu trafności ponad istniejący `rankByNameMatch`.

## Część A — wspólny helper dopasowania (admin)

**`app/_lib/search-normalize.ts`** — dodać czystą funkcję obok `normalizeSearchText`
(bez zmiany istniejącej):

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

`tokens.every(...)` na pustej tablicy = `true` (pusta fraza dopasowuje wszystko).

**Miejsca admina** (podmiana `normalizeSearchText(...).includes(...)` → `searchMatches`):
- `app/admin/produkty/ProductsList.tsx` — `searchMatches(p.name, query) || searchMatches(p.category, query)` (dotąd nazwa LUB kategoria).
- `app/admin/tkaniny/FabricsEditor.tsx` — picker „Meble w tej tkaninie":
  `filteredProducts = pickerProducts.filter((p) => searchMatches(p.name, productQuery))`.
- `app/admin/zestawy/BundlesEditor.tsx` — picker zestawów:
  `filtered = products.filter((p) => searchMatches(p.name, query))`.
- W każdym: usunąć teraz-zbędne lokalne `const q = normalizeSearchText(...)` i import
  `normalizeSearchText`, jeśli nieużywany po zmianie.

## Część B — storefront `/sklep` (SQL) + migracja

Pełne odspacjowanie w SQL wymaga znormalizowanej kolumny (ILIKE nie umie
„usuwać spacji" w locie).

### Migracja `supabase/migrations/61_products_search_key.sql`

```sql
-- Migracja 61: kolumny wyszukiwania odporne na spacje na products.
-- search_key = lower(name+description) z usuniętymi tagami HTML i WSZYSTKIMI
-- spacjami → ILIKE %token% dopasowuje niezależnie od spacji/kolejności (tokeny
-- ANDowane po stronie zapytania). Diakrytyki zachowane (jak dotychczasowe
-- wyszukiwanie storefrontu). Wyrażenie jest IMMUTABLE (lower/regexp_replace/
-- coalesce/||), więc może być kolumną STORED GENERATED. Idempotentnie.
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

Uwagi: dodanie kolumny STORED generated przepisuje tabelę (setki wierszy —
błyskawiczne, backfill automatyczny). `pg_trgm` na Supabase dostępny; indeks GIN
przyspiesza `%token%` (przy tej skali nie jest krytyczny — jeśli `create
extension` byłby zablokowany, indeksy można pominąć, ILIKE działa bez nich).

### `app/_lib/search-filter.ts`

- **Zostaje:** `escapeIlike`, `sanitizeSearchTerm` (allowlist chroni przed
  wstrzyknięciem składni `.or()`/wildcardów ILIKE).
- **Dodać** `MAX_SEARCH_TOKENS = 10` i:
  ```ts
  // Tokeny frazy: sanityzacja (allowlist + zwinięcie spacji) → słowa → limit.
  export function searchTokens(raw: string): string[] {
    const term = sanitizeSearchTerm(raw);
    if (!term) return [];
    return term.split(" ").filter(Boolean).slice(0, MAX_SEARCH_TOKENS);
  }
  ```
- **Usunąć** `buildSearchOrFilter` (jedyny użytkownik to `products.ts`).
- **Zmienić** `rankByNameMatch` na wielo-tokenowy: trafienie w nazwie = KAŻDY
  token jest podłańcuchem odspacjowanej, małoliterowej nazwy (diakrytyki
  zachowane — spójnie z kolumną):
  ```ts
  export function rankByNameMatch<T>(
    rows: T[], raw: string, getName: (row: T) => string | null | undefined
  ): T[] {
    const tokens = searchTokens(raw);
    if (tokens.length === 0) return rows;
    const nameHits: T[] = [], rest: T[] = [];
    for (const row of rows) {
      const key = (getName(row) ?? "").toLowerCase().replace(/\s+/g, "");
      if (tokens.every((t) => key.includes(t.toLowerCase()))) nameHits.push(row);
      else rest.push(row);
    }
    return [...nameHits, ...rest];
  }
  ```

### `app/_lib/products.ts`

W miejscu obecnego `buildSearchOrFilter`/`.or()`:
```ts
const tokens = searchTokens(search ?? "");
const searchActive = tokens.length > 0;
if (searchActive) {
  const col = locale === "de" ? "search_key_de" : "search_key";
  for (const token of tokens) {
    query = query.ilike(col, `%${escapeIlike(token)}%`);
  }
}
```
Wiele `.ilike()` na tej samej kolumnie jest **ANDowane** przez PostgREST → każde
słowo musi wystąpić. Reszta ścieżki (gałąź `if (searchActive)` z pobraniem i
`rankByNameMatch`, paginacja) bez zmian, poza tokenizacją w rankingu.

## Część C — przycisk „na górę" w adminie

`app/admin/AdminShell.tsx`: zaimportować `BackToTop` z
`@/app/_components/layout/BackToTop` i wyrenderować `<BackToTop />` wewnątrz
korzenia shella (obok `UnsavedChangesGuard`). Komponent jest window-based; admin
scrolluje okno (`body` = `min-h-screen flex flex-col`, brak sztywnej wysokości —
`overflow-y-auto` na `<main>` shella nie tworzy wewnętrznego scrolla), więc działa
bez zmian. Aria-label z `t.a11y.backToTop` (locale `pl` na adminie). z-index
przycisku `z-40` < drawer `z-50` (OK).

⚠️ Weryfikacja przy implementacji (skill `verify`/przeglądarka): po przewinięciu
listy produktów w adminie przycisk się pojawia i wraca na górę. Gdyby okazało
się, że scrolluje `<main>` a nie okno — uogólnić `BackToTop` o opcjonalny
element-scroll (target), default = window; ale spodziewane jest okno.

## Pliki dotknięte

- **Nowe:** `supabase/migrations/61_products_search_key.sql`.
- **Edycja:** `app/_lib/search-normalize.ts` (+ `searchMatches`);
  `app/_lib/search-filter.ts` (+`searchTokens`/`MAX_SEARCH_TOKENS`, `rankByNameMatch`
  wielo-tokenowy, − `buildSearchOrFilter`); `app/_lib/products.ts` (pętla ILIKE po
  tokenach); `app/admin/produkty/ProductsList.tsx`; `app/admin/tkaniny/FabricsEditor.tsx`;
  `app/admin/zestawy/BundlesEditor.tsx`; `app/admin/AdminShell.tsx`.
- **Testy:** `app/_lib/__tests__/search-normalize.test.ts` (+`searchMatches`);
  `app/_lib/__tests__/search-filter.test.ts` (`searchTokens`, `rankByNameMatch`
  wielo-tokenowy; usunąć testy `buildSearchOrFilter`).
- **Bez zmian:** `BackToTop.tsx`, `HideOnAdmin`, `app/layout.tsx`.

## Przypadki brzegowe

- Pusta / sama-spacja / sama-interpunkcja fraza → brak tokenów → nie zawęża
  (admin `searchMatches` → true; storefront `searchActive=false`).
- Bardzo długa fraza → limit `MAX_SEARCH_TOKENS` (10) tokenów.
- `search_key`/`_de` puste (brak nazwy/opisu) → `''`; token nigdy nie dopasuje →
  produkt nie w wynikach (poprawnie).
- Znaki specjalne we frazie → `sanitizeSearchTerm` (storefront) / `normalizeSearchText`
  (admin) je neutralizują; `escapeIlike` dodatkowo zabezpiecza `% _ \`.
- DE: `search_key_de` z name_de/description_de; produkty bez DE → puste → nie
  matchują na /de (spójnie z dotychczasową decyzją „DE bez fallbacku").

## Testy

- **Unit (pure):**
  - `searchMatches`: kolejność słów, spacje w obie strony (chillme↔Chill Me),
    diakrytyki (lozko↔Łóżko), pusta fraza → true, częściowy token.
  - `searchTokens`: tokenizacja, zwinięcie spacji, limit 10, sanityzacja
    (usunięcie `,`/`(`/`%`), pusta → `[]`.
  - `rankByNameMatch`: trafienia w nazwie (wszystkie tokeny) przed opisowymi,
    stabilność kolejności, pusta fraza → wejście bez zmian.
- Reszta: `tsc` + lint + build + smoke po deployu (wyszukiwarki admina + `/sklep`
  + `/de/sklep`; przycisk „na górę" w adminie).

## Uwagi wdrożeniowe

- Migracja 61 na prodzie przez Supabase MCP — osobno, po zaakceptowaniu (model:
  pokaż SQL → potwierdź → wykonaj). Storefront zacznie używać `search_key` dopiero
  po deployu nowego kodu; kolumna generowana jest niezależna od kodu (bezpieczna
  przed deployem). Kolejność: migrację puścić **przed lub równocześnie z deployem**
  — nowy kod odwołuje się do `search_key`, więc kolumna musi istnieć zanim kod
  trafi na prod (analogicznie do EXPAND). Stary kod kolumny nie zna → migracja
  przed merge jest bezpieczna.
- Konto gh: Woodecky10. Implementacja: subagenty na Opusie (stała zasada), review
  po każdym tasku.
