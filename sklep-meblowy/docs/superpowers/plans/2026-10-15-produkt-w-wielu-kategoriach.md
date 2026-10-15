# Produkt w kilku kategoriach — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produkt zachowuje kategorię główną i dostaje dowolną liczbę kategorii dodatkowych, na których listach też się pojawia (pierwszy przypadek: zakładka „Szybka dostawa").

**Architecture:** Nowa kolumna `products.extra_categories text[]` (migracja 84) z triggerami zamiast klucza obcego. Filtr listingu `/sklep` i bloku „produkty z kategorii" zmienia się z `.in("category", …)` na `.or("category.in.(…),extra_categories.ov.{…}")`. Wszystko, co potrzebuje jednej kategorii (okruszki, feed, podobne, cross-sell, koszyk), zostaje na `category`. Edytor produktu dostaje checkboxy „Dodatkowe kategorie" zapisywane tym samym formularzem co dane podstawowe. Liczniki w `/admin/kategorie` liczą dodatkowe, ale ostrzeżenie o kategorii Google — tylko główne.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (PostgREST + Postgres), Tailwind v4, Vitest (`environment: "node"`, testy w `app/**/__tests__/**/*.test.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-produkt-w-wielu-kategoriach-design.md`

Wszystkie komendy z katalogu `sklep-meblowy/` (tam jest `package.json`; korzeń repo jest piętro wyżej). Gałąź: `feat/produkt-w-wielu-kategoriach`.

## Global Constraints

- Kategoria główna (`products.category`) zasila bez zmian: okruszki i JSON-LD `BreadcrumbList`, eyebrow, etykietę karty, feed (`g:product_type`, `g:google_product_category`), `getRelatedProducts`, cross-sell, koszyk, przełącznik strony narożnika, sitemap, podpowiedzi wyszukiwarki. Tych miejsc NIE ruszamy.
- Kategorie dodatkowe wpływają tylko na: listing `getProducts` (z poddrzewem), blok „produkty" ze źródłem „kategoria" (dokładny węzeł), liczniki w `/admin/kategorie`.
- Kod czyta zawsze `p.extra_categories ?? []` — `select("*")` na bazie bez kolumny daje `undefined`, nie `null`.
- Do składni filtra PostgREST trafiają wyłącznie slugi pasujące do `^[a-z0-9]+(?:-[a-z0-9]+)*$` (wszystkie 29 na produkcji 2026-10-15 pasują).
- Migracja 84 jest na produkcji **przed** merge'em gałęzi — kod z `extra_categories.ov.{…}` na bazie bez kolumny dostaje błąd PostgREST i listing kategorii pada.
- Migracje są idempotentne (`if not exists`, `create or replace`, `drop trigger if exists`); komunikaty `raise exception` bez polskich znaków (jak w migracji 68).
- Baza jest wspólna z produkcją: żadnych testów, które zapisują w panelu. Każda zmiana na produkcji (migracja, blok testowy SQL, merge = wdrożenie) tylko po wyraźnym „tak" właściciela w tej sesji.
- Pliki w repo mają CRLF w kopii roboczej (`core.autocrlf=true`, indeks LF): edytuj narzędziem Edit/Write; nigdy `sed -i`/`perl -pi`/PowerShell `Set-Content`. Po commicie: `git diff --stat` bez całoplikowych zmian, `git ls-files --eol <plik>` = `i/lf`, brak BOM.
- Każdy commit kończy się pustą linią i `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push na konto `Woodecky10` (domyślne `mwlo1403` dostaje 403).

## Review Focus

1. Wyszukiwanie w obrębie kategorii (`/sklep?kategoria=X&q=…`) → wynik to część wspólna kategorii i frazy, a nie suma ani samo wyszukiwanie (w zapytaniu są dwa lub więcej parametrów `or=`). Test: Task 1 krok 6 (curl z dwoma `or=`) i Task 5 krok 3 (build).
2. Admin odznacza wszystkie kategorie dodatkowe i zapisuje → kolumna staje się `[]`, a nie zostaje bez zmian. Test: Task 3 krok 1 (`extraCategoriesFromForm` ze znacznikiem i bez wartości).
3. Admin zmienia kategorię główną na taką, która była dodatkową → po zapisie nie ma jej w dodatkowych; checkbox wyłącza się od razu, przed zapisem. Test: Task 3 krok 1 (`normalizeExtraCategories`) i Task 3 krok 9 (e2e bez zapisu).
4. Usunięcie kategorii, która w jakimś produkcie jest dodatkowa → usunięcie przechodzi, a slug znika z produktu; jako kategoria główna nadal blokuje. Test: Task 1 krok 5 (blok `DO` z wycofaniem).
5. Wiersz bez kolumny albo z `null` (duplikat lub licznik czytany przed migracją) → traktowany jak brak dodatkowych, bez wyjątku. Test: Task 3 krok 1 (duplikat z `undefined`) i Task 4 krok 1 (liczniki z `undefined` i `null`).

---

### Task 1: Migracja 84 — kolumna i triggery, zastosowanie na produkcji

**Files:**
- Create: `supabase/migrations/84_product_extra_categories.sql`

**Interfaces:**
- Produces: kolumna `public.products.extra_categories text[] not null default '{}'`; indeks GIN `idx_products_extra_categories`; triggery `trg_products_extra_categories_check`, `trg_categories_slug_to_extra`, `trg_categories_delete_from_extra`.

- [ ] **Step 1: Napisz migrację**

Utwórz `supabase/migrations/84_product_extra_categories.sql`:

```sql
-- Migracja 84: produkt w kilku kategoriach (spec
-- docs/superpowers/specs/2026-10-15-produkt-w-wielu-kategoriach-design.md).
--
-- `products.category` zostaje kategorią GŁÓWNĄ (okruszki, feed Google,
-- podobne, cross-sell). `extra_categories` mówi tylko, na których listach
-- produkt pojawia się DODATKOWO. Prośba właściciela 2026-10-15: pracownik
-- założył zakładkę „Szybka dostawa" i nie mógł do niej dopiąć produktów, bo
-- każdy ma już swoją kategorię.
--
-- Tablica nie może mieć klucza obcego, więc trzy jego zachowania odtwarzają
-- triggery: sprawdzenie istnienia (zamiast FK), zmiana sluga (zamiast
-- ON UPDATE CASCADE) i usunięcie kategorii — dodatkowa NIE blokuje, slug
-- znika z tablic; główna nadal blokuje przez products_category_fk RESTRICT.
--
-- Idempotentna: projekt aplikuje migracje ręcznie i plik bywa odpalany
-- drugi raz.

alter table public.products
  add column if not exists extra_categories text[] not null default '{}';

-- Filtr listingu: extra_categories && array[...] (operator `ov` w PostgREST).
create index if not exists idx_products_extra_categories
  on public.products using gin (extra_categories);

-- ============================================================
-- 1. Istnienie slugów (zamiast klucza obcego)
-- ============================================================
create or replace function public.products_extra_categories_check()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1
      from unnest(new.extra_categories) as s
     where s is null
        or not exists (select 1 from public.categories c where c.slug = s)
  ) then
    raise exception 'Nieznana kategoria dodatkowa w %', new.extra_categories;
  end if;
  return new;
end $$;

drop trigger if exists trg_products_extra_categories_check on public.products;
create trigger trg_products_extra_categories_check
  before insert or update of extra_categories on public.products
  for each row execute function public.products_extra_categories_check();

-- ============================================================
-- 2. Zmiana sluga kategorii (zamiast ON UPDATE CASCADE)
-- ============================================================
-- Aplikacja nie zmienia slugów (updateCategory nie rusza `slug`), ale zmiana
-- zrobiona w SQL kaskaduje po FK na `products.category` — tablica ma iść
-- za nią, inaczej trigger z punktu 1 zablokowałby każdy kolejny zapis
-- produktu z „osieroconym" slugiem.
create or replace function public.categories_slug_to_extra()
returns trigger language plpgsql as $$
begin
  update public.products
     set extra_categories = array_replace(extra_categories, old.slug, new.slug)
   where extra_categories @> array[old.slug];
  return null;
end $$;

drop trigger if exists trg_categories_slug_to_extra on public.categories;
create trigger trg_categories_slug_to_extra
  after update of slug on public.categories
  for each row when (old.slug is distinct from new.slug)
  execute function public.categories_slug_to_extra();

-- ============================================================
-- 3. Usunięcie kategorii: dodatkowa nie blokuje
-- ============================================================
-- BEFORE DELETE: jeśli usunięcie i tak padnie (dzieci, produkty z tą
-- kategorią jako główną → FK RESTRICT), transakcja cofa też array_remove.
create or replace function public.categories_delete_from_extra()
returns trigger language plpgsql as $$
begin
  update public.products
     set extra_categories = array_remove(extra_categories, old.slug)
   where extra_categories @> array[old.slug];
  return old;
end $$;

drop trigger if exists trg_categories_delete_from_extra on public.categories;
create trigger trg_categories_delete_from_extra
  before delete on public.categories
  for each row execute function public.categories_delete_from_extra();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/84_product_extra_categories.sql
git commit -m "feat(db): migracja 84 — kategorie dodatkowe produktu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Zgoda właściciela na zmiany na produkcji**

Zapytaj właściciela wprost: „Aplikuję migrację 84 na produkcji i odpalam na niej blok testowy, który na koniec sam się wycofuje (wyjątkiem). Migracja tylko dodaje kolumnę z wartością domyślną i triggery — nic dziś nie zmienia w sklepie. Zgoda?". Bez „tak" — STOP, wpisz w STAN WYKONANIA, że Task 1 czeka na zgodę, i przejdź do Task 2 (Taski 2–4 nie wymagają bazy). Merge (Task 5) jest zablokowany do czasu wykonania kroków 4–6.

- [ ] **Step 4: Zastosuj migrację**

Załaduj narzędzie `mcp__supabase__apply_migration` (ToolSearch `select:mcp__supabase__apply_migration`) i wywołaj je z `name: "84_product_extra_categories"` oraz `query` = cała treść pliku z kroku 1. Jeśli MCP zwraca 401 (token wygasa regularnie) — STOP i poproś właściciela o nowy osobisty token Supabase albo o wklejenie pliku w SQL Editor panelu Supabase.

Sprawdzenie (narzędzie `mcp__supabase__execute_sql`):

```sql
select column_name, data_type, column_default
  from information_schema.columns
 where table_name = 'products' and column_name = 'extra_categories';
select tgname from pg_trigger
 where tgname in ('trg_products_extra_categories_check',
                  'trg_categories_slug_to_extra',
                  'trg_categories_delete_from_extra');
```

Expected: jeden wiersz `extra_categories | ARRAY | '{}'::text[]` i trzy nazwy triggerów.

- [ ] **Step 5: Sprawdź triggery na produkcji blokiem, który się wycofuje**

`mcp__supabase__execute_sql`, najpierw odrzucenie nieznanego sluga (instrukcja pada, nic nie zapisuje):

```sql
update public.products set extra_categories = array['nie-ma-takiej-kategorii']
 where id = (select id from public.products limit 1);
```

Expected: błąd `Nieznana kategoria dodatkowa w {nie-ma-takiej-kategorii}`.

Potem zmiana sluga i usunięcie — cały blok kończy się wyjątkiem, więc Postgres wycofuje wszystko, a wynik przychodzi w treści błędu:

```sql
do $$
declare
  pid uuid;
  after_rename text[];
  after_delete text[];
begin
  insert into public.categories (slug, label) values ('tmp-test-84', 'tmp test 84');
  select id into pid from public.products limit 1;
  update public.products set extra_categories = array['tmp-test-84'] where id = pid;
  update public.categories set slug = 'tmp-test-84b' where slug = 'tmp-test-84';
  select extra_categories into after_rename from public.products where id = pid;
  delete from public.categories where slug = 'tmp-test-84b';
  select extra_categories into after_delete from public.products where id = pid;
  raise exception 'TEST84 rename=% delete=%', after_rename, after_delete;
end $$;
```

Expected: błąd `TEST84 rename={tmp-test-84b} delete={}`. Potem sprawdź, że nic nie zostało:

```sql
select count(*) from public.categories where slug like 'tmp-test-84%';
select count(*) from public.products where extra_categories <> '{}';
```

Expected: `0` i `0`.

- [ ] **Step 6: Sprawdź składnię filtra PostgREST (tylko odczyt, klucz anon)**

Z katalogu `sklep-meblowy/` w Bashu. `S` to kategoria z produktami, `W1`/`W2` to rdzenie słów, których NIE ma w nazwach produktów tej kategorii (dla narożników: materace):

```bash
URL=$(grep -h '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2- | tr -d '"\r')
KEY=$(grep -h '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | tr -d '"\r')
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -H "Range: 0-0")
S=narozniki-u; W1=materac; W2=topper
cnt() { curl -s -o /dev/null -D - "$URL/rest/v1/products?select=id&$1" "${H[@]}" | grep -i content-range; }
cnt "category=in.($S)"
cnt "or=(category.in.($S),extra_categories.ov.{$S})"
cnt "or=(search_key_fold.ilike.*$W1*,search_key_fold.ilike.*$W2*)"
cnt "or=(category.in.($S),extra_categories.ov.{$S})&or=(search_key_fold.ilike.*$W1*,search_key_fold.ilike.*$W2*)"
```

Expected:
- linie 1 i 2 mają ten sam licznik większy od 0 (nikt nie ma jeszcze dodatkowych);
- linia 3 ma licznik większy od 0;
- linia 4 ma licznik `*/0` — dwa `or=` łączą się przez AND. Jeśli linia 4 pokazuje licznik z linii 3, PostgREST bierze tylko ostatni `or=` — STOP i zgłoś, bo filtr w `getProducts` trzeba wtedy złożyć w jeden `and=(or(…),or(…))`.

Jeśli `narozniki-u` ma 0 produktów, weź inny slug z `GET $URL/rest/v1/categories?select=slug`.

- [ ] **Step 7: Zapisz wynik w STAN WYKONANIA (sekcja na końcu planu) i zacommituj plan**

```bash
git add docs/superpowers/plans/2026-10-15-produkt-w-wielu-kategoriach.md
git commit -m "docs(plan): kategorie dodatkowe — migracja 84 na produkcji

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Filtr „główna LUB dodatkowa" w listingu i bloku produktów

**Files:**
- Create: `app/_lib/extra-categories.ts`
- Create: `app/_lib/__tests__/extra-categories.test.ts`
- Modify: `app/_lib/products.ts` (import na górze; gałąź `if (categoryFilter)` w `getProducts`, ok. linia 182)
- Modify: `app/_lib/block-products.ts` (źródło „category", ok. linia 50)

**Interfaces:**
- Produces (`app/_lib/extra-categories.ts`):
  - `NO_MATCH_FILTER: string` = `"id.eq.00000000-0000-0000-0000-000000000000"`
  - `categoryMatchFilter(slugs: readonly string[]): string`

- [ ] **Step 1: Write the failing test**

Utwórz `app/_lib/__tests__/extra-categories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { categoryMatchFilter, NO_MATCH_FILTER } from "@/app/_lib/extra-categories";

describe("categoryMatchFilter", () => {
  it("jeden slug: kategoria główna LUB dodatkowa", () => {
    expect(categoryMatchFilter(["szybka-dostawa"])).toBe(
      "category.in.(szybka-dostawa),extra_categories.ov.{szybka-dostawa}"
    );
  });

  it("poddrzewo: kolejność zachowana, duplikat raz", () => {
    expect(categoryMatchFilter(["narozniki", "naroznik-l", "narozniki"])).toBe(
      "category.in.(narozniki,naroznik-l),extra_categories.ov.{narozniki,naroznik-l}"
    );
  });

  it("odrzuca slugi, które rozbiłyby składnię PostgREST", () => {
    expect(categoryMatchFilter(["a,b", "x)", "y}", "Sofy", " sofy", "sofy"])).toBe(
      "category.in.(sofy),extra_categories.ov.{sofy}"
    );
  });

  it("pusta lista albo same złe slugi → warunek, który nic nie dopasuje", () => {
    expect(categoryMatchFilter([])).toBe(NO_MATCH_FILTER);
    expect(categoryMatchFilter(["a,b"])).toBe(NO_MATCH_FILTER);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts`
Expected: FAIL — nie można rozwiązać `@/app/_lib/extra-categories`.

- [ ] **Step 3: Write minimal implementation**

Utwórz `app/_lib/extra-categories.ts`:

```ts
// Kategorie dodatkowe produktu (spec 2026-10-15, migracja 84). Kategoria
// główna zostaje w `products.category` i zasila wszystko, co potrzebuje
// jednej kategorii (okruszki, feed, podobne, cross-sell, koszyk);
// `products.extra_categories` decyduje tylko o tym, na których listach
// produkt się pojawia.
//
// Czysty moduł — bez importów serwerowych, bezpieczny także dla komponentów
// klienckich (stałe nazw pól formularza).

// Slugi kategorii: małe litery ASCII, cyfry, pojedyncze myślniki (wszystkie
// na produkcji 2026-10-15 tak wyglądają). Tylko takie wolno wkleić do składni
// filtra PostgREST — przecinek, nawias albo klamra rozbiłyby warunek.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Warunek, który niczego nie dopasuje — ten sam wzorzec co „nieznany slug →
// pusty listing" w getProducts.
export const NO_MATCH_FILTER = "id.eq.00000000-0000-0000-0000-000000000000";

// Warunek do `.or()`: kategoria główna z listy LUB któraś z dodatkowych
// z listy. Kilka `.or()` w jednym zapytaniu (kategoria + grupy synonimów
// wyszukiwania) PostgREST łączy przez AND — sprawdzone na produkcji
// (plan, Task 1 krok 6).
export function categoryMatchFilter(slugs: readonly string[]): string {
  const safe = [...new Set(slugs.filter((s) => SLUG_RE.test(s)))];
  if (safe.length === 0) return NO_MATCH_FILTER;
  const list = safe.join(",");
  return `category.in.(${list}),extra_categories.ov.{${list}}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts`
Expected: PASS (4 testy).

- [ ] **Step 5: Podłącz filtr w `getProducts`**

W `app/_lib/products.ts` pod linią `import { resolveCategoryFilter, expandCrossSellTargets } from "./category-tree";` dopisz:

```ts
import { categoryMatchFilter } from "./extra-categories";
```

i w `getProducts` zamień:

```ts
    } else {
      query = query.in("category", categoryFilter.slugs);
    }
```

na:

```ts
    } else {
      // Kategoria główna z poddrzewa LUB któraś z dodatkowych z poddrzewa
      // (spec 2026-10-15 — produkt w kilku kategoriach).
      query = query.or(categoryMatchFilter(categoryFilter.slugs));
    }
```

- [ ] **Step 6: Podłącz filtr w bloku produktów**

W `app/_lib/block-products.ts` pod `import type { LocalizedProductsContent } from "./blocks";` dopisz:

```ts
import { categoryMatchFilter } from "./extra-categories";
```

i w gałęzi `// category` zamień:

```ts
    .eq("category", content.category_slug)
```

na:

```ts
    // Dokładny węzeł jak dotąd (bez poddrzewa), ale także produkty, które
    // mają go jako kategorię dodatkową.
    .or(categoryMatchFilter([content.category_slug]))
```

- [ ] **Step 7: Testy, lint, typy**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: wszystko przechodzi.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/extra-categories.ts app/_lib/__tests__/extra-categories.test.ts app/_lib/products.ts app/_lib/block-products.ts
git commit -m "feat(sklep): listing kategorii pokazuje też produkty z kategorią dodatkową

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pole „Dodatkowe kategorie" w edytorze produktu, zapis i duplikowanie

**Files:**
- Modify: `app/_lib/extra-categories.ts` (dopisanie)
- Modify: `app/_lib/__tests__/extra-categories.test.ts` (dopisanie)
- Modify: `app/_lib/types.ts` (typ `Product`, pod `category: Category;`)
- Modify: `app/_lib/new-product.ts` (`DuplicateSource`, `DuplicateProductPayload`, `buildDuplicatePayload`)
- Modify: `app/_lib/__tests__/new-product.test.ts` (fixture `dupSource` + 2 testy)
- Modify: `app/admin/produkty/actions.ts` (`updateProductBasics`)
- Create: `app/admin/produkty/[id]/ExtraCategoriesField.tsx`
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (stan kategorii głównej, select, wstawienie pola)
- Create: `e2e/extra-categories-field.spec.ts`

**Interfaces:**
- Consumes: `flattenForSelect(nodes: CategoryNode[]): SelectGroup[]` i `type CategoryNode`, `type SelectGroup` z `app/_lib/category-tree.ts`; `getAllCategories(): Promise<CategoryDef[]>` z `app/_lib/categories.ts` (`CategoryDef` = `CategoryNode`).
- Produces (`app/_lib/extra-categories.ts`):
  - `EXTRA_CATEGORIES_FIELD = "extra_categories"`, `EXTRA_CATEGORIES_PRESENT_FIELD = "extra_categories_present"`
  - `normalizeExtraCategories(raw: readonly unknown[], mainCategory: string, nodes: CategoryNode[]): string[]`
  - `extraCategoriesFromForm(formData: FormData, mainCategory: string, nodes: CategoryNode[]): string[] | undefined`
- Produces (`app/_lib/types.ts`): `Product.extra_categories?: Category[] | null`

- [ ] **Step 1: Write the failing tests**

W `app/_lib/__tests__/extra-categories.test.ts` rozszerz import na:

```ts
import {
  categoryMatchFilter,
  NO_MATCH_FILTER,
  normalizeExtraCategories,
  extraCategoriesFromForm,
  EXTRA_CATEGORIES_FIELD,
  EXTRA_CATEGORIES_PRESENT_FIELD,
} from "@/app/_lib/extra-categories";
import type { CategoryNode } from "@/app/_lib/category-tree";
```

i dopisz na końcu pliku:

```ts
// Fabryka węzłów — testy podają tylko to, co dla nich istotne.
function node(partial: Partial<CategoryNode> & { id: string; slug: string }): CategoryNode {
  return {
    label: partial.slug.toUpperCase(),
    label_de: null,
    parent_id: null,
    sort_order: 0,
    active: true,
    crossSellCategories: [],
    ...partial,
  };
}

// meble (0)
//   narozniki (0)
//     naroznik-l (0)
//   fotele (1)
// szybka-dostawa (1)
const TREE: CategoryNode[] = [
  node({ id: "1", slug: "meble", sort_order: 0 }),
  node({ id: "2", slug: "narozniki", parent_id: "1", sort_order: 0 }),
  node({ id: "3", slug: "naroznik-l", parent_id: "2", sort_order: 0 }),
  node({ id: "4", slug: "fotele", parent_id: "1", sort_order: 1 }),
  node({ id: "5", slug: "szybka-dostawa", sort_order: 1 }),
];

describe("normalizeExtraCategories", () => {
  it("tylko istniejące slugi, bez duplikatów, w kolejności drzewa", () => {
    expect(
      normalizeExtraCategories(["szybka-dostawa", "nie-ma", "fotele", "fotele"], "naroznik-l", TREE)
    ).toEqual(["fotele", "szybka-dostawa"]);
  });

  it("usuwa kategorię główną — także gdy główną zmieniono na dawną dodatkową", () => {
    expect(normalizeExtraCategories(["szybka-dostawa", "fotele"], "fotele", TREE)).toEqual([
      "szybka-dostawa",
    ]);
  });

  it("ignoruje wartości niebędące tekstem i przycina spacje", () => {
    expect(normalizeExtraCategories([" szybka-dostawa ", 7, null], "fotele", TREE)).toEqual([
      "szybka-dostawa",
    ]);
  });

  it("pusta lista → pusta lista", () => {
    expect(normalizeExtraCategories([], "fotele", TREE)).toEqual([]);
  });
});

describe("extraCategoriesFromForm", () => {
  it("bez znacznika pola → undefined (kolumny nie ruszamy), nawet gdy są wartości", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_FIELD, "szybka-dostawa");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toBeUndefined();
  });

  it("znacznik bez zaznaczonych → [] (admin odznaczył wszystko)", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_PRESENT_FIELD, "1");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toEqual([]);
  });

  it("znacznik i zaznaczone → lista po normalizacji", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_PRESENT_FIELD, "1");
    fd.append(EXTRA_CATEGORIES_FIELD, "szybka-dostawa");
    fd.append(EXTRA_CATEGORIES_FIELD, "fotele");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toEqual(["szybka-dostawa"]);
  });
});
```

W `app/_lib/__tests__/new-product.test.ts` w obiekcie `dupSource` (pod `category: "lozka-tapicerowane",`) dopisz:

```ts
  extra_categories: ["szybka-dostawa"],
```

a w `describe("buildDuplicatePayload", …)` przed ostatnim `it` dopisz:

```ts
  it("kopiuje kategorie dodatkowe jako nową tablicę", () => {
    const p = buildDuplicatePayload(dupSource);
    expect(p.extra_categories).toEqual(["szybka-dostawa"]);
    expect(p.extra_categories).not.toBe(dupSource.extra_categories);
  });

  it("wiersz bez kolumny extra_categories (sprzed migracji 84) → pusta lista", () => {
    const bezKolumny: DuplicateSource = { ...dupSource, extra_categories: undefined };
    expect(buildDuplicatePayload(bezKolumny).extra_categories).toEqual([]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts app/_lib/__tests__/new-product.test.ts`
Expected: FAIL — brak eksportów `normalizeExtraCategories`, `extraCategoriesFromForm`, stałych pól; w `new-product.test.ts` błąd typu/asercji przy `extra_categories`.

- [ ] **Step 3: Implementacja w `extra-categories.ts`**

Na górze `app/_lib/extra-categories.ts`, pod blokiem komentarza, dopisz import:

```ts
import { flattenForSelect, type CategoryNode } from "./category-tree";
```

a na końcu pliku:

```ts
// Nazwy pól formularza „Podstawowe dane" (ExtraCategoriesField ↔
// updateProductBasics).
export const EXTRA_CATEGORIES_FIELD = "extra_categories";
// Odznaczone checkboxy nie trafiają do FormData, więc „wszystko odznaczone"
// i „pola nie było w formularzu" wyglądają tak samo — rozróżnia je ten
// ukryty znacznik.
export const EXTRA_CATEGORIES_PRESENT_FIELD = "extra_categories_present";

// Kolejność węzłów jak w selekcie kategorii — zapis nie zależy od kolejności
// zaznaczania checkboxów.
function treeOrder(nodes: CategoryNode[]): string[] {
  return flattenForSelect(nodes).flatMap((g) => g.options.map((o) => o.slug));
}

// Wartości z formularza → to, co zapisujemy: tylko istniejące slugi, bez
// duplikatów, bez kategorii głównej (gdy admin zmienił główną na dawną
// dodatkową, dodatkowa znika), w kolejności drzewa.
export function normalizeExtraCategories(
  raw: readonly unknown[],
  mainCategory: string,
  nodes: CategoryNode[]
): string[] {
  const wanted = new Set(
    raw.filter((v): v is string => typeof v === "string").map((v) => v.trim())
  );
  return treeOrder(nodes).filter((slug) => wanted.has(slug) && slug !== mainCategory);
}

// undefined = formularz bez tego pola → kolumny nie ruszamy.
export function extraCategoriesFromForm(
  formData: FormData,
  mainCategory: string,
  nodes: CategoryNode[]
): string[] | undefined {
  if (formData.get(EXTRA_CATEGORIES_PRESENT_FIELD) !== "1") return undefined;
  return normalizeExtraCategories(formData.getAll(EXTRA_CATEGORIES_FIELD), mainCategory, nodes);
}
```

- [ ] **Step 4: Typ `Product`**

W `app/_lib/types.ts` w typie `Product` pod `category: Category;` dopisz:

```ts
  // Kategorie DODATKOWE (migracja 84): produkt pojawia się też na ich
  // listach. Wszystko, co potrzebuje jednej kategorii (okruszki, feed,
  // podobne, cross-sell), bierze `category`. Opcjonalne i nullable, bo
  // `select("*")` na bazie bez kolumny daje undefined — czytaj `?? []`.
  extra_categories?: Category[] | null;
```

- [ ] **Step 5: Duplikowanie**

W `app/_lib/new-product.ts`:

w `DuplicateSource` pod `category: string;` dopisz:

```ts
  // Kategorie dodatkowe (migracja 84). Opcjonalne: wiersz z `select("*")`
  // sprzed migracji nie ma tej kolumny.
  extra_categories?: string[] | null;
```

w `DuplicateProductPayload` dopisz `"extra_categories"` do listy w `Omit<…>` (po `"promo_badge"`), a w części `& { … }` dopisz:

```ts
  extra_categories: string[];
```

w `buildDuplicatePayload` pod `category: source.category,` dopisz:

```ts
    extra_categories: [...(source.extra_categories ?? [])],
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts app/_lib/__tests__/new-product.test.ts`
Expected: PASS.

- [ ] **Step 7: Zapis w `updateProductBasics`**

W `app/admin/produkty/actions.ts` do importów dopisz:

```ts
import { getAllCategories } from "@/app/_lib/categories";
import { extraCategoriesFromForm } from "@/app/_lib/extra-categories";
```

pod linią `if (!category) return { ok: false, error: "Kategoria jest wymagana" };` dopisz:

```ts
  // Kategorie dodatkowe (spec 2026-10-15). undefined = formularz bez tego
  // pola → kolumny nie ruszamy; [] = admin odznaczył wszystko. Normalizacja
  // wyrzuca nieznane slugi i kategorię główną.
  const extraCategories = extraCategoriesFromForm(
    formData,
    category,
    await getAllCategories()
  );
```

a bezpośrednio pod zamknięciem obiektu `const updates: Record<string, unknown> = { … };` dopisz:

```ts
  if (extraCategories !== undefined) updates.extra_categories = extraCategories;
```

- [ ] **Step 8: Komponent pola i wpięcie w edytor**

Utwórz `app/admin/produkty/[id]/ExtraCategoriesField.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { SelectGroup } from "@/app/_lib/category-tree";
import {
  EXTRA_CATEGORIES_FIELD,
  EXTRA_CATEGORIES_PRESENT_FIELD,
} from "@/app/_lib/extra-categories";
import { Field } from "./_shared";

// Kategorie dodatkowe (spec 2026-10-15): produkt pojawia się też na listach
// tych kategorii; okruszki, feed i „podobne" zostają przy kategorii głównej.
// Checkboxy siedzą w formularzu „Podstawowe dane" i zapisują się jego
// przyciskiem. Kategoria główna jest wyłączona — wyłączony checkbox nie
// trafia do FormData, a serwer i tak ją odfiltrowuje.
export default function ExtraCategoriesField({
  groups,
  initial,
  mainCategory,
}: {
  groups: SelectGroup[];
  initial: string[];
  mainCategory: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const labels = new Map(
    groups.flatMap((g) => g.options.map((o) => [o.slug, o.label] as const))
  );
  const chosen = [...selected].filter((s) => s !== mainCategory && labels.has(s));

  function toggle(slug: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  return (
    // composite: <label> owijający całą listę zaznaczałby pierwszy checkbox
    // po kliknięciu w napis pola (pułapka z 2026-08-18).
    <Field
      label="Dodatkowe kategorie"
      composite
      className="md:col-span-2"
      hint="Produkt pojawi się też na listach tych kategorii. Okruszki, feed Google i „podobne produkty” zostają przy kategorii głównej."
    >
      <input type="hidden" name={EXTRA_CATEGORIES_PRESENT_FIELD} value="1" />
      <p className="text-sm text-[var(--fg)]">
        {chosen.length > 0
          ? `Wybrane: ${chosen.map((s) => labels.get(s)).join(", ")}`
          : "Brak — produkt widać tylko w kategorii głównej."}
      </p>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              {g.label}
            </p>
            {g.options.map((o) => {
              const isMain = o.slug === mainCategory;
              return (
                <label
                  key={o.slug}
                  className="flex items-center gap-2 py-0.5 text-sm"
                  style={{ paddingLeft: o.depth * 16 }}
                >
                  <input
                    type="checkbox"
                    name={EXTRA_CATEGORIES_FIELD}
                    value={o.slug}
                    checked={!isMain && selected.has(o.slug)}
                    disabled={isMain}
                    onChange={(e) => toggle(o.slug, e.target.checked)}
                  />
                  <span className={isMain ? "text-[var(--muted)]" : undefined}>
                    {o.label}
                    {isMain && " (kategoria główna)"}
                  </span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </Field>
  );
}
```

W `app/admin/produkty/[id]/ProductEditor.tsx`:

1. Pod `import SizeGroupEditor from "./SizeGroupEditor";` dopisz `import ExtraCategoriesField from "./ExtraCategoriesField";`.
2. Pod `const [badgeDraft, setBadgeDraft] = useState(product.promo_badge ?? "");` dopisz:

```tsx
  // Bieżąca kategoria główna — pole „Dodatkowe kategorie" wyłącza ją na
  // liście od razu, bez zapisu. Select zostaje niekontrolowany (defaultValue,
  // patrz komentarz przy formularzu), tylko śledzimy jego zmiany.
  const [mainCategory, setMainCategory] = useState(product.category);
```

3. W `<select name="category" defaultValue={product.category} required className={inputClass}>` dopisz atrybut `onChange={(e) => setMainCategory(e.target.value)}`.
4. Bezpośrednio pod zamknięciem `</Field>` pola „Stan magazynowy" (pole zajmuje oba kolumny siatki, więc stoi pod parą Kategoria | Stan magazynowy) dopisz:

```tsx
          <ExtraCategoriesField
            groups={categoryGroups}
            initial={product.extra_categories ?? []}
            mainCategory={mainCategory}
          />
```

- [ ] **Step 9: E2E bez zapisu**

Utwórz `e2e/extra-categories-field.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Pole „Dodatkowe kategorie" w edytorze produktu (spec 2026-10-15).
// NIE zapisuje — baza jest wspólna z produkcją. Sprawdza tylko UI: kategoria
// główna jest wyłączona na liście dodatkowych i podąża za selectem bez zapisu.
test("kategoria główna jest wyłączona na liście dodatkowych i podąża za selectem", async ({
  page,
}) => {
  await page.goto("/admin/produkty");
  await page.locator('a[href^="/admin/produkty/"]:not([href$="/nowy"])').first().click();
  await expect(page).toHaveURL(/\/admin\/produkty\/[0-9a-f-]+$/, { timeout: 15_000 });

  const select = page.locator('select[name="category"]');
  const box = (slug: string) =>
    page.locator(`input[name="extra_categories"][value="${slug}"]`);

  await expect(page.locator('input[name="extra_categories_present"]')).toHaveCount(1);
  const main = await select.inputValue();
  await expect(box(main)).toBeDisabled();

  const other = await select
    .locator(`option:not([value="${main}"])`)
    .first()
    .getAttribute("value");
  expect(other, "brak drugiej kategorii w systemie").toBeTruthy();
  await select.selectOption(other!);

  await expect(box(other!)).toBeDisabled();
  await expect(box(main)).toBeEnabled();
});
```

Run (wymaga migracji 84 na produkcji — Task 1; build, nie dev): `npm run build`, potem `npm start` w tle (Bash z `run_in_background`), a gdy `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sklep` zwraca `200`:

```bash
E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/extra-categories-field.spec.ts
```

Expected: `1 passed` (plus `setup`). Potem zrób zrzut sekcji „Podstawowe dane" (Playwright MCP `browser_take_screenshot` na `http://localhost:3000/admin/produkty/<id>`) i obejrzyj układ: „Dodatkowe kategorie" na całą szerokość pod parą „Kategoria | Stan magazynowy", bez pustej komórki obok „Kategorii". Jeśli „Kategoria" wypada w prawej kolumnie i powstaje dziura — przenieś pole bezpośrednio pod `</Field>` „Kategorii". Zatrzymaj serwer (port 3000) po sprawdzeniu.

Jeśli Task 1 czeka na zgodę: pomiń ten krok, zapisz w STAN WYKONANIA „e2e Task 3 do uruchomienia po migracji" i wróć do niego przed Task 5.

- [ ] **Step 10: Testy, lint, typy**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: wszystko przechodzi.

- [ ] **Step 11: Commit**

```bash
git add app/_lib/extra-categories.ts app/_lib/__tests__/extra-categories.test.ts app/_lib/types.ts app/_lib/new-product.ts app/_lib/__tests__/new-product.test.ts app/admin/produkty/actions.ts "app/admin/produkty/[id]/ExtraCategoriesField.tsx" "app/admin/produkty/[id]/ProductEditor.tsx" e2e/extra-categories-field.spec.ts
git commit -m "feat(panel): dodatkowe kategorie w edytorze produktu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Liczniki w `/admin/kategorie` — dodatkowe w liczniku, ostrzeżenie Google tylko z głównych

**Files:**
- Modify: `app/_lib/extra-categories.ts` (dopisanie)
- Modify: `app/_lib/__tests__/extra-categories.test.ts` (dopisanie)
- Modify: `app/_lib/category-tree.ts` (usunięcie `subtreeProductCounts`, ok. linie 293–309)
- Modify: `app/_lib/__tests__/category-tree.test.ts` (usunięcie importu i `describe("subtreeProductCounts")`)
- Modify: `app/admin/kategorie/page.tsx`
- Modify: `app/admin/kategorie/KategorieEditor.tsx` (typ `Counts`, ok. linia 42; licznik i ostrzeżenie, ok. linie 306–358)

**Interfaces:**
- Consumes: `descendantSlugs(nodes: CategoryNode[], slug: string): string[]` z `app/_lib/category-tree.ts`; `TREE` i `node()` z pliku testów (Task 3).
- Produces (`app/_lib/extra-categories.ts`):
  - `type ProductCategoryRow = { category: string; extra_categories?: readonly string[] | null }`
  - `type NodeProductCounts = { own: number; subtree: number; ownMain: number }`
  - `productCountsByNode(nodes: CategoryNode[], products: readonly ProductCategoryRow[]): Map<string, NodeProductCounts>`

- [ ] **Step 1: Write the failing test**

W `app/_lib/__tests__/extra-categories.test.ts` dopisz `productCountsByNode` do importu z `@/app/_lib/extra-categories`, a na końcu pliku:

```ts
describe("productCountsByNode", () => {
  const PRODUCTS = [
    { category: "naroznik-l" }, // wiersz bez kolumny (sprzed migracji 84)
    { category: "naroznik-l", extra_categories: ["szybka-dostawa"] },
    { category: "fotele", extra_categories: ["szybka-dostawa", "narozniki"] },
    // główna i dodatkowa w tej samej gałęzi — w poddrzewie liczony raz
    { category: "narozniki", extra_categories: ["naroznik-l"] },
  ];
  const counts = productCountsByNode(TREE, PRODUCTS);

  it("własne = główna LUB dodatkowa; ownMain = tylko główna", () => {
    expect(counts.get("naroznik-l")).toEqual({ own: 3, subtree: 3, ownMain: 2 });
    expect(counts.get("fotele")).toEqual({ own: 1, subtree: 1, ownMain: 1 });
  });

  it("poddrzewo liczy produkt raz, nawet z dwiema kategoriami w gałęzi", () => {
    expect(counts.get("narozniki")).toEqual({ own: 2, subtree: 4, ownMain: 1 });
    expect(counts.get("meble")).toEqual({ own: 0, subtree: 4, ownMain: 0 });
  });

  it("kategoria z samymi dopiętymi produktami ma ownMain = 0 (bez alarmu Google)", () => {
    expect(counts.get("szybka-dostawa")).toEqual({ own: 2, subtree: 2, ownMain: 0 });
  });

  it("extra_categories: null to brak dodatkowych", () => {
    const c = productCountsByNode(TREE, [{ category: "fotele", extra_categories: null }]);
    expect(c.get("fotele")).toEqual({ own: 1, subtree: 1, ownMain: 1 });
    expect(c.get("szybka-dostawa")).toEqual({ own: 0, subtree: 0, ownMain: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts`
Expected: FAIL — `productCountsByNode` nie jest eksportowane.

- [ ] **Step 3: Write minimal implementation**

W `app/_lib/extra-categories.ts` rozszerz import na:

```ts
import { descendantSlugs, flattenForSelect, type CategoryNode } from "./category-tree";
```

i dopisz na końcu pliku:

```ts
export type ProductCategoryRow = {
  category: string;
  // undefined, gdy wiersz przyszedł z bazy bez kolumny (przed migracją 84).
  extra_categories?: readonly string[] | null;
};

export type NodeProductCounts = {
  // Produkty z węzłem jako kategorią główną LUB dodatkową.
  own: number;
  // Produkty z którąkolwiek kategorią (główną lub dodatkową) w poddrzewie —
  // każdy raz, nawet gdy ma dwie kategorie w tej samej gałęzi.
  subtree: number;
  // Tylko kategoria główna — do ostrzeżenia o kategorii Google, bo feed
  // bierze google_product_category wyłącznie z głównej.
  ownMain: number;
};

// Liczniki dla /admin/kategorie (zastępują subtreeProductCounts).
export function productCountsByNode(
  nodes: CategoryNode[],
  products: readonly ProductCategoryRow[]
): Map<string, NodeProductCounts> {
  const rows = products.map((p) => ({
    main: p.category,
    all: [p.category, ...(p.extra_categories ?? [])],
  }));
  const result = new Map<string, NodeProductCounts>();
  for (const n of nodes) {
    const subtreeSlugs = new Set(descendantSlugs(nodes, n.slug));
    let own = 0;
    let subtree = 0;
    let ownMain = 0;
    for (const r of rows) {
      if (r.all.includes(n.slug)) own++;
      if (r.all.some((s) => subtreeSlugs.has(s))) subtree++;
      if (r.main === n.slug) ownMain++;
    }
    result.set(n.slug, { own, subtree, ownMain });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/extra-categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Strona `/admin/kategorie`**

Zastąp całą treść `app/admin/kategorie/page.tsx`:

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, type CategoryDef } from "@/app/_lib/categories";
import { productCountsByNode, type ProductCategoryRow } from "@/app/_lib/extra-categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [nodes, products] = await Promise.all([
    getAllCategories(),
    getProductCategoryRows(),
  ]);

  // Liczniki (własne, poddrzewo, tylko główna) liczy czysty moduł — panel
  // dostaje gotowe wartości, żeby nie powtarzać tej arytmetyki w komponencie
  // klienckim.
  const counts = Object.fromEntries(productCountsByNode(nodes, products));

  return <KategorieEditor nodes={nodes} counts={counts} />;
}

// Kategoria główna i dodatkowe każdego produktu.
async function getProductCategoryRows(): Promise<ProductCategoryRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("products").select("category, extra_categories");
  return (data ?? []) as ProductCategoryRow[];
}

export type { CategoryDef };
```

- [ ] **Step 6: `KategorieEditor`**

W `app/admin/kategorie/KategorieEditor.tsx`:

1. Dopisz import `import type { NodeProductCounts } from "@/app/_lib/extra-categories";` obok pozostałych importów z `@/app/_lib/…`.
2. Zamień `type Counts = Record<string, { own: number; subtree: number }>;` na `type Counts = Record<string, NodeProductCounts>;`.
3. Zamień `const c = counts[node.slug] ?? { own: 0, subtree: 0 };` na `const c = counts[node.slug] ?? { own: 0, subtree: 0, ownMain: 0 };`.
4. Zamień `const bezKategoriiGoogle = warnsAboutMissingGpc(allCategories, node.slug, c.own);` na:

```tsx
  // Tylko produkty z tą kategorią jako GŁÓWNĄ: feed bierze kategorię Google
  // z głównej, więc „Szybka dostawa" z samymi dopiętymi produktami nie może
  // wywoływać alarmu.
  const bezKategoriiGoogle = warnsAboutMissingGpc(allCategories, node.slug, c.ownMain);
```

5. W akapicie ze slugiem zamień:

```tsx
              {c.own === 1 ? "własny produkt" : "własnych produktów"}
              {c.subtree !== c.own && ` · ${c.subtree} w poddrzewie`}
```

na:

```tsx
              {c.own === 1 ? "własny produkt" : "własnych produktów"}
              {c.own !== c.ownMain && ` (w tym ${c.own - c.ownMain} jako dodatkowa)`}
              {c.subtree !== c.own && ` · ${c.subtree} w poddrzewie`}
```

- [ ] **Step 7: Usuń `subtreeProductCounts`**

W `app/_lib/category-tree.ts` usuń komentarz `// Liczniki dla panelu: …` i całą funkcję `subtreeProductCounts`. W `app/_lib/__tests__/category-tree.test.ts` usuń `subtreeProductCounts,` z importu i cały blok `describe("subtreeProductCounts", …)`. Potem:

Run: `grep -rn "subtreeProductCounts" app e2e`
Expected: brak wyników.

- [ ] **Step 8: Testy, lint, typy**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: wszystko przechodzi.

- [ ] **Step 9: Commit**

```bash
git add app/_lib/extra-categories.ts app/_lib/__tests__/extra-categories.test.ts app/_lib/category-tree.ts app/_lib/__tests__/category-tree.test.ts app/admin/kategorie/page.tsx app/admin/kategorie/KategorieEditor.tsx
git commit -m "feat(panel): liczniki kategorii z dodatkowymi, ostrzeżenie Google tylko z głównych

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sprawdzenie na buildzie, recenzja, wdrożenie, próba na żywo

**Files:**
- Modify: `docs/superpowers/plans/2026-10-15-produkt-w-wielu-kategoriach.md` (STAN WYKONANIA)

**Interfaces:**
- Consumes: wszystko z Tasków 1–4; migracja 84 na produkcji (Task 1 krok 4) jest warunkiem kroków 3–6.

- [ ] **Step 1: Pełny zestaw**

Run: `npm test && npm run lint && npm run build`
Expected: wszystko przechodzi.

- [ ] **Step 2: Uruchom build lokalnie**

`npm start` w tle (Bash z `run_in_background`), potem:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sklep
```

Expected: `200` (jeśli jeszcze nie — serwer wstaje; spróbuj ponownie za chwilę, bez pętli).

- [ ] **Step 3: Listing bez zmian względem produkcji (tylko odczyt)**

Po jednym zapytaniu na adres — bez pętli (Vercel blokuje IP przy gęstym odpytywaniu produkcji):

```bash
n() { curl -sL "$1" | grep -o 'href="/produkt/[^"]*"' | sort -u | wc -l; }
S=narozniki-u; Q=szar
n "http://localhost:3000/sklep?kategoria=$S"
n "https://www.mollien.pl/sklep?kategoria=$S"
n "http://localhost:3000/sklep?kategoria=$S&q=$Q"
n "https://www.mollien.pl/sklep?kategoria=$S&q=$Q"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/sklep?kategoria=szybka-dostawa"
```

Expected: pary 1–2 i 3–4 mają równe liczby (nikt nie ma jeszcze dodatkowych, więc wynik musi być identyczny jak na produkcji), a liczba 3 jest mniejsza lub równa 1; „Szybka dostawa" daje `200` (pusta lista, nie błąd). Jeśli `Q` nie daje wyników w `S`, weź słowo z nazwy produktu tej kategorii. Zatrzymaj serwer (port 3000).

- [ ] **Step 4: Recenzja całej gałęzi**

Zgodnie z wybraną metodą wykonania (subagent-driven: końcowy recenzent całej gałęzi; native: jeden świeży recenzent na najmocniejszym modelu) — od `git merge-base origin/main HEAD` do `HEAD`, ze specem i tym planem. Poprawki osobnymi commitami; zapisz rundę w STAN WYKONANIA.

- [ ] **Step 5: PR i wdrożenie (za zgodą właściciela)**

Warunek: Task 1 kroki 4–6 wykonane (migracja 84 na produkcji). Push na konto `Woodecky10`, PR do `main` z opisem kończącym się linią `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Przed merge'em: `git log origin/feat/produkt-w-wielu-kategoriach..feat/produkt-w-wielu-kategoriach` musi być pusty (wszystkie commity wypchnięte). Merge = wdrożenie na Vercelu — tylko po „tak" właściciela. Po merge'u sprawdź status wdrożenia (Vercel „success") i raz `curl -sL -o /dev/null -w "%{http_code}\n" "https://www.mollien.pl/sklep?kategoria=narozniki-u"` → `200`.

- [ ] **Step 6: Próba na żywo (właściciel lub za jego zgodą)**

Na produkcji, w panelu:
1. Dowolny produkt → „Dodatkowe kategorie" → zaznacz „Szybka dostawa" → „Zapisz".
2. `/sklep?kategoria=szybka-dostawa` pokazuje ten produkt.
3. Strona produktu: okruszek wskazuje kategorię główną, nie „Szybką dostawę".
4. `/admin/kategorie`: przy „Szybkiej dostawie" licznik `1 własny produkt (w tym 1 jako dodatkowa)` i brak ostrzeżenia o kategorii Google.
5. Odznacz „Szybka dostawa" → „Zapisz" → produkt znika z `/sklep?kategoria=szybka-dostawa`.

Wynik wpisz w STAN WYKONANIA.

- [ ] **Step 7: Commit stanu**

```bash
git add docs/superpowers/plans/2026-10-15-produkt-w-wielu-kategoriach.md
git commit -m "docs(plan): kategorie dodatkowe — stan wykonania

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## STAN WYKONANIA

(uzupełniane w trakcie — jedyny trwały nośnik stanu, `.superpowers/sdd/` jest gitignorowany)

- [x] Task 1 — plik `f07252b`, recenzja czysta. **Migracja 84 na produkcji 2026-10-15** (Management API, bo MCP dawał 401; wpis `schema_migrations` `20261015111817 / 84_product_extra_categories` dodany ręcznie). Kolumna, 3 triggery i indeks GIN obecne. Triggery: nieznany slug odrzucony; blok `DO` z wycofaniem → `rename={tmp-test-84b} delete={}`, po nim 0 kategorii testowych i 0 produktów z dodatkowymi. PostgREST (anon): `narozniki-u` 3 = 3; dwa `or=` → AND (fraza spoza kategorii 0, pasująca 3); wiele slugów w klamrach: „salon" (4) 35 = 35, „meble" (23) 393 = 393.
- [x] Task 2 — `cb31b57`, recenzja czysta
- [x] Task 3 — `a05b39d..e756a6d`; runda poprawek 1/5 (puste drzewo kategorii nie czyści kolumny)
- [x] Task 4 — `051c8ac`, recenzja czysta
- [ ] Task 5 — kroki 1–3 WYKONANE (2016 testów, lint 0 błędów, build OK; lokalnie = produkcja: `narozniki-u` 3 = 3, `&q=szar` 2 = 2, „Szybka dostawa" 200); krok 4 (recenzja całej gałęzi, Opus) WYKONANY — „With fixes", jedyna poprawka kodu `b82fb6f` (spacja w liczniku). Kroki 5–6 (PR, merge, próba na żywo) OTWARTE — czekają na zgodę właściciela.

**Rozstrzygnięcia (z dziennika wykonania):**

- (z planowania) Spec umieszcza `categoryMatchFilter` w `app/_lib/category-tree.ts`; plan trzyma całą logikę kategorii dodatkowych (filtr, normalizacja, odczyt formularza, liczniki) w jednym module `app/_lib/extra-categories.ts`, a `subtreeProductCounts` zastępuje `productCountsByNode`.
- Kroki produkcyjne (Task 1 kroki 3–6, Task 5 kroki 5–6) wykonuje wyłącznie kontroler, za zgodą właściciela; podagenci nie dotykają produkcji.
- Task 3: `extraCategoriesFromForm` zwraca `undefined` przy pustym drzewie kategorii (odstępstwo od tekstu planu, z recenzji): `getAllCategories()` przy błędzie bazy daje `[]` (`withFallback`), a wtedy zapis po cichu czyściłby kategorie dodatkowe produktu.
- Task 3: e2e pola uruchomiony przed migracją — edytor czyta `?? []` i test nic nie zapisuje.
- Task 4: komentarz „zastępują subtreeProductCounts" przeredagowany na „dawny licznik poddrzewa", bo krok 7 tego samego taska wymaga pustego `grep subtreeProductCounts`.
- Recenzja całej gałęzi, uwaga „Important" (kontrole objęły tylko liść, nie listę slugów w klamrach) zamknięta pomiarem na produkcji, bez zmiany kodu.
- Funkcje triggerów bez `set search_path` (ostrzeżenia advisora) — zostają, jak w migracji 68; migracja już zastosowana.

**Wycofanie (rollback):** najpierw revert kodu (wdrożenie), DOPIERO potem w SQL: `drop trigger` ×3, `drop function` ×3, `drop index idx_products_extra_categories`, `alter table products drop column extra_categories`. Usunięcie kolumny przy działającym kodzie wywraca listingi kategorii.

**Otwarte:**

- [ ] Task 5 krok 5: push (konto `Woodecky10`), PR, merge = wdrożenie — za zgodą właściciela.
- [ ] Task 5 krok 6: próba na żywo z „Szybką dostawą".
- [ ] Token Supabase z 2026-10-15 trafił do historii rozmowy — unieważnić po wdrożeniu i wygenerować nowy prosto do `.mcp.json`.

**Odroczone (follow-upy):**

- Okno usuwania kategorii nie mówi, że odepnie ją od produktów, w których jest dodatkowa; komunikat blokady usunięcia liczy tylko produkty z kategorią główną, a licznik w wierszu — także dodatkowe.
- Cross-sell ustawiony na kategorię z samymi dopiętymi produktami (np. „Szybka dostawa") nic nie znajdzie — cross-sell działa na kategorii głównej (spec).
- Lista produktów w panelu nie filtruje po kategorii dodatkowej.
- Literał zerowego UUID zdublowany (`NO_MATCH_FILTER` i `.eq("id", …)` w `getProducts`).
- Slug niezgodny z `^[a-z0-9]+(?:-[a-z0-9]+)*$` (możliwy tylko ręcznym SQL) po cichu wypada z filtra — bez ostrzeżenia w logach.
