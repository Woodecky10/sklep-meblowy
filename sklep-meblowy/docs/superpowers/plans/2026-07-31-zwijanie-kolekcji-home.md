# Zwijanie kolekcji na stronie głównej — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strona główna pokazuje 6 kafelków kolekcji, resztę po kliknięciu; admin ustala kolejność przeciąganiem i może ukryć kolekcję z home.

**Architecture:** Dwie nowe kolumny w `collections` (`sort_order`, `show_on_home`) plus atomowa funkcja `reorder_collections`. Warstwa danych zwraca gotowe kafelki (`CollectionTile`) zamiast obiektów produktów, a cała logika składania siedzi w czystych funkcjach testowanych bez bazy. Front: markup kafelka przenoszony z `app/page.tsx` do klienckiego `HomeCollections`, który pierwsze 6 renderuje zawsze, a nadwyżkę trzyma w kontenerze z `display: none` do kliknięcia.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres, service-role client), Tailwind, `@dnd-kit` (już w projekcie), vitest (node, testy czystych funkcji), Playwright (e2e).

---

## ✅ STAN WYKONANIA — ZAKOŃCZONE 2026-08-01

> Ta sekcja była w repo **celowo**: ledger wykonania (`.superpowers/sdd/…`) jest gitignorowany, więc nie jedzie z klonem, a praca przechodziła między dwoma komputerami. Zostaje jako zapis tego, co i dlaczego odbiega od treści planu.

**Gałąź:** `feat/kolekcje-zwijanie-home`, ostatni commit `5c8478aa`. Wszystkie taski zrobione, każdy zrecenzowany, końcowa recenzja całej gałęzi + fala naprawcza zamknięte.

**Bramki na koniec:** `tsc --noEmit` 0 błędów · `npm test` **895 testów w 75 plikach** · `npm run build` przechodzi · `npx playwright test home-collections --no-deps` na localhoście `1 passed` (z weryfikacją negatywną: celowo zepsute id → `1 failed`).

**Migracja 66 jest zaaplikowana na produkcyjnej bazie** (11 kolekcji, `sort_order` 0-10, RPC `reorder_collections` istnieje, `prosecdef = false` → zapis chroniony przez RLS). ⚠️ **NIE aplikuj jej ponownie** — a gdyby ktoś odpalił plik drugi raz, guard idempotentności backfillu i tak nie nadpisze kolejności ustawionej w panelu (zweryfikowane na żywej bazie: 10 wierszy z niezerowym `sort_order`).

### Gdzie plan był BŁĘDNY — rozstrzygnięcia obowiązujące ponad jego treścią

Nie „poprawiaj" kodu z powrotem do tego, co pisze plan w tych sześciu miejscach:

1. **Czyste funkcje żyją w `app/_lib/collection-tiles.ts`**, nie w `collections.ts` (ten dostał `import "server-only"`). Plan pokazywał importy z `collections.ts` — komponent kliencki wciągnąłby przez to `next/cache`. Bez re-eksportu, świadomie: re-eksport maskował problem.
2. **Panel sortuje KOPIĘ listy komparatorem `byHomeOrder`.** Plan wpuszczał wynik `getAllCollections()` (sortowany po `label`) wprost do przeciągania — drugie przeciągnięcie cicho kasowałoby układ, a błąd ujawniłby się dopiero na produkcji. Kopia jest obowiązkowa, bo `getAllCollections` jest cache'owane, a `sort()` mutuje.
3. **`select` w `app/admin/kolekcje/page.tsx` ma `category` i `price`** ponad listę z planu — bez nich picker produktów rzuca `undefined.toLocaleString`, a rzutowanie `as Product[]` ukrywa to przed `tsc`.
4. **Brak `void` w `startHomeTransition(() => onToggleHome())`.** Plan miał `void`; z nim `disabled={pendingHome}` nie blokował niczego, bo transition kończył się po części synchronicznej.
5. **Guard e2e: `test.skip` opiera się na liczbie kafelków w widocznej siatce (`#home-collections-visible`), nie na braku przycisku**, a liczenie jest zawężone do tej siatki. Wersja z planu zamieniała zniknięcie sekcji w cichy zielony skip i pękała od treści edytowalnej z panelu (`?kolekcja=` w navbarze/stopce/blokach home).
6. **Przy błędzie zapytania o produkty panel renderuje banner błędu ZAMIAST edytora.** Picker nad pustą listą + RPC `save_collection` (`not (id = any(p_product_ids))`) odpiąłby wszystkie produkty od kolekcji jednym „Zapisz".

Do tego dwie rzeczy dołożone poza planem, obie z powodu znalezisk recenzji: `createCollection` wstawia `max(sort_order) + 1` (plan zostawiał default `0`, więc nowa kolekcja lądowała na pierwszej pozycji strony głównej), a lista kolumn zapytania o produkty jest wspólną stałą `COLLECTION_TILE_COLUMNS`.

### Follow-upy (nieblokujące, świadomie odłożone)

- **e2e da fałszywą CZERWIEŃ przy dokładnie sześciu kolekcjach na home** (przycisk się nie renderuje, więc `toHaveCount(1)` pada mimo zdrowego kodu). Fix ~4 linijki: `data-collections-total={tiles.length}` na siatce i skip na `total <= VISIBLE`. Fałszywy alarm, nigdy fałszywa zieleń.
- `app/admin/kolekcje/page.tsx` pobiera te same wiersze **własnym literałem kolumn** — wycięcie stamtąd `is_active` nadal przechodzi `tsc` i gasi wszystkie liczniki w panelu. Domknięcie: `` .select(`id, name, category, price, ${COLLECTION_TILE_COLUMNS}`) ``.
- `COLLECTION_TILE_COLUMNS` jest guardem społecznym, nie mechanicznym — utwardzenie: `Record<keyof CollectionProductRow, true>` + `Object.keys().join(", ")`.
- `onToggleHome` czyta `collections` z domknięcia zamiast przez updater funkcyjny — klikanie ptaszków w dwóch wierszach pod rząd potrafi wizualnie cofnąć pierwszą zmianę (baza dostaje oba UPDATE-y poprawnie).
- Kreska „poniżej dopiero po rozwinięciu" nie jest sortowalna, więc wiersze przejeżdżają po niej w trakcie przeciągania; `aria-hidden` ukrywa ją przed czytnikiem ekranu.
- Komunikaty sukcesu obu nowych akcji nigdy nie docierają do UI (klient reaguje tylko na `!ok`).
- Guard reordera łapie tylko puste id (duplikaty i id spoza tabeli dają `ok: true`); `update().eq("id")` na nieistniejącym id też zwraca `ok: true`.
- `fetchAllCollections` połyka błąd zapytania i zwraca `[]` → przy awarii Supabase panel pokaże „Brak kolekcji. Dodaj pierwszą" (pre-existing, ale teraz obok stoi banner dla produktów).
- Test „lokalizuje etykietę dla DE z fallbackiem do PL" nie testuje fallbacku; gałąź `images: null` bez pokrycia (na produkcji 0 takich wierszy); brak pokrycia `/de` (zamrożone flagą `DE_ENABLED`).

Odrzucone świadomie: indeks na `collections(sort_order)` (nic nie sortuje po nim w SQL — sortowanie dzieje się w JS), sygnatura `reorderCollections` z nieużywanym `sort_order` (1:1 z `reorderTiles`), zmiana dedupe miniatur (jedno duże zdjęcie zamiast czterech kopii tego samego to poprawa).

### Czego NIE zweryfikowała automatyka — klik-testy właścicielki

Panel operuje na produkcyjnej bazie, więc przeciąganie i ptaszek nie zostały ani razu wykonane; panel admina nie ma ani jednego testu. Lista scenariuszy do wyklikania jest w opisie PR.

---

## Global Constraints

- **To NIE jest Next.js z treningu** — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (`sklep-meblowy/AGENTS.md`)
- Wszystkie polecenia uruchamiać z katalogu `sklep-meblowy/` (appka jest w zagnieżdżonym podkatalogu repo).
- **Panel admina jest PL-only** (bez i18n). Front dwujęzyczny: każdy nowy klucz słownika musi mieć wersję **PL i DE**, bo interfejs słownika jest typowany w `pl.ts` i brak odpowiednika wywala `tsc`.
- Server actions: `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult`, updaty castowane `as never`.
- **localhost i preview używają PRODUKCYJNEJ bazy Supabase** — każda mutacja danych dotyka żywego sklepu.
- Migracje **nie aplikują się automatycznie** — wgrywa się je ręcznie przez Supabase MCP (`apply_migration`).
- Limit widocznych kafelków to stała `HOME_COLLECTIONS_VISIBLE = 6` — jedno miejsce w kodzie, bez ustawienia w panelu.
- Bramki jakości przed każdym commitem: `npx tsc --noEmit` (0 błędów), `npm test` (wszystko zielone), `npm run build` (przechodzi).

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `supabase/migrations/66_collections_order_and_home_flag.sql` | **Nowy.** Kolumny `sort_order`, `show_on_home`, backfill alfabetyczny, RPC `reorder_collections` + uprawnienia. |
| `app/_lib/types.ts` | **Zmiana.** Typ `Collection` dostaje `sort_order: number` i `show_on_home: boolean`. |
| `app/_lib/collections.ts` | **Zmiana.** Nowe: `CollectionTile`, `CollectionProductRow`, `HOME_COLLECTIONS_VISIBLE`, `countActiveProductsByCollection`, `buildCollectionTiles`, `foldAfterIndex`, `getCollectionTilesForHome`. Usunięte: `getCollectionsForHome`. |
| `app/_lib/__tests__/collection-tiles.test.ts` | **Nowy.** Testy czystych funkcji składania kafelków i pozycji kreski. |
| `app/_components/blocks/HomeCollections.tsx` | **Nowy.** Kliencki komponent sekcji kolekcji: siatka, zwijanie, przycisk. Zawiera przeniesiony `mosaicTileClass`. |
| `app/page.tsx` | **Zmiana.** `case "collections"` renderuje `<HomeCollections>`; `mosaicTileClass` i markup kafelka wychodzą z pliku. |
| `app/_lib/dictionaries/pl.ts`, `de.ts` | **Zmiana.** Klucze `home.collectionsShowAll` i `home.collectionsCollapse`. |
| `app/admin/kolekcje/actions.ts` | **Zmiana.** Nowe akcje `reorderCollections`, `toggleCollectionOnHome`. |
| `app/admin/kolekcje/page.tsx` | **Zmiana.** Wąskie zapytanie o produkty, licznik tylko aktywnych przez wspólny helper. |
| `app/admin/kolekcje/CollectionsEditor.tsx` | **Zmiana.** Przeciąganie (dnd-kit), ptaszek „pokazuj na home", kreska po szóstej widocznej pozycji. |
| `e2e/home-collections.spec.ts` | **Nowy.** Guard: 6 kafelków, „+N", rozwinięcie, `display: none` na ukrytym kontenerze. |

---

### Task 1: Migracja 66 — kolumny, backfill, RPC

**Files:**
- Create: `supabase/migrations/66_collections_order_and_home_flag.sql`
- Modify: `app/_lib/types.ts` (typ `Collection`, linie 137-146)

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces: kolumny `collections.sort_order integer not null default 0`, `collections.show_on_home boolean not null default true`; funkcja `public.reorder_collections(p_ids uuid[]) returns void`; typ `Collection` z polami `sort_order: number`, `show_on_home: boolean`.

- [ ] **Step 1: Napisz plik migracji**

Utwórz `supabase/migrations/66_collections_order_and_home_flag.sql`:

```sql
-- Migracja 66: kolejność kolekcji na stronie głównej + flaga widoczności.
-- Spec: docs/superpowers/specs/2026-07-31-zwijanie-kolekcji-home-design.md
--
-- Wzorzec sort_order jest już w categories, home_tiles i fabric_groups.
-- Kolekcje były sortowane alfabetycznie po label i admin nie miał wpływu.
alter table public.collections
  add column if not exists sort_order   integer not null default 0,
  add column if not exists show_on_home boolean not null default true;

-- BACKFILL OBOWIĄZKOWY. Bez niego wszystkie kolekcje mają sort_order = 0
-- i kolejność na stronie robi się przypadkowa (zależna od tego, co baza
-- zwróci pierwsze). Numerujemy alfabetycznie, czyli zachowujemy kolejność
-- obowiązującą przed migracją — wdrożenie nie zmienia nic, co widzi klient.
--
-- GUARD dopisany 2026-07-31 PO zaaplikowaniu tej migracji na produkcji
-- (backfill już wykonany i zweryfikowany: 11 kolekcji, 11 różnych numerów).
-- Projekt aplikuje migracje ręcznie i ma niepełny rejestr — plik może
-- zostać odpalony ponownie. Bez guarda kolejne odpalenie bezwarunkowo
-- nadpisze sort_order z powrotem na alfabetyczny, kasując bez ostrzeżenia
-- ustawienia admina zrobione przeciąganiem w /admin/kolekcje (Task 3/4,
-- funkcja reorder_collections). Guard: backfill działa tylko, gdy żadna
-- kolekcja nie ma jeszcze niezerowego sort_order, czyli tylko przy
-- pierwszym uruchomieniu na świeżej bazie.
update public.collections c
set sort_order = t.rn
from (select id, (row_number() over (order by label)) - 1 as rn
      from public.collections) t
where c.id = t.id
  -- GUARD: tylko gdy kolejność nie jest jeszcze ustawiona
  and not exists (
    select 1 from public.collections where sort_order <> 0
  );

-- Atomowy reorder jedną instrukcją — jak reorder_home_tiles z migracji 28.
-- Pętla UPDATE po jednym wierszu przy padzie w połowie zostawia kolekcje
-- z pomieszanymi numerami.
create or replace function public.reorder_collections(p_ids uuid[])
returns void language sql as $$
  update public.collections c
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id;
$$;

revoke execute on function public.reorder_collections(uuid[]) from public;
grant  execute on function public.reorder_collections(uuid[]) to service_role;
```

- [ ] **Step 2: Zaaplikuj migrację przez Supabase MCP**

Wywołaj `mcp__supabase__apply_migration` z `name: "collections_order_and_home_flag"` i treścią pliku (bez komentarzy nagłówkowych jest OK, ale treść SQL musi być identyczna).

⚠️ Auto-apply na tym projekcie **nie działa** — bez tego kroku kolumny nie powstaną, a Task 2 wywali się na `column does not exist`.

- [ ] **Step 3: Zweryfikuj migrację zapytaniem**

Wywołaj `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='collections'
       and column_name in ('sort_order','show_on_home')) as kolumny,
  (select count(distinct sort_order) from collections) as roznych_numerow,
  (select count(*) from collections) as kolekcji,
  (select count(*) from pg_proc where proname = 'reorder_collections') as rpc;
```

Oczekiwane: `kolumny = 2`, `roznych_numerow = kolekcji` (backfill dał każdej inny numer), `rpc = 1`.

- [ ] **Step 4: Uzupełnij typ `Collection`**

W `app/_lib/types.ts` (typ `Collection`, po `description_de`):

```ts
export type Collection = {
  id: string;
  slug: string;
  label: string;
  label_de: string | null;
  description: string | null;
  description_de: string | null;
  // Kolejność na stronie głównej (migracja 66). Mniejsze = wyżej; przy równych
  // rozstrzyga label. Ustawiana przeciąganiem w /admin/kolekcje.
  sort_order: number;
  // Czy kolekcja pokazuje się w sekcji kolekcji na stronie głównej (migracja 66).
  // Nie wpływa na /sklep?kolekcja=... ani na kartę produktu.
  show_on_home: boolean;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 5: Sprawdź, że typy się kompilują**

Run: `npx tsc --noEmit`
Expected: 0 błędów. `getAllCollections` robi `select("*")`, więc nowe pola dojdą same; nic dotąd nie konstruuje `Collection` z literału, więc dodanie pól wymaganych nie psuje istniejącego kodu. Jeśli `tsc` wskaże miejsce, które buduje `Collection` ręcznie — dopisz tam oba pola, nie zmieniaj typu na opcjonalny.

- [ ] **Step 6: Commit**

```bash
git add sklep-meblowy/supabase/migrations/66_collections_order_and_home_flag.sql sklep-meblowy/app/_lib/types.ts
git commit -m "feat(kolekcje): sort_order i show_on_home + atomowy reorder (migracja 66)"
```

---

### Task 2: Warstwa danych — czyste funkcje i kafelki

**Files:**
- Modify: `app/_lib/collections.ts` (usuń `getCollectionsForHome`, linie 65-99)
- Test: `app/_lib/__tests__/collection-tiles.test.ts` (nowy)

**Interfaces:**
- Consumes: `Collection` z `sort_order` i `show_on_home` (Task 1).
- Produces:
  - `export const HOME_COLLECTIONS_VISIBLE = 6`
  - `export type CollectionProductRow = { collection_id: string | null; images: string[] | null }`
  - `export type CollectionTile = { collection: Collection; thumbnails: string[]; productCount: number }`
  - `countActiveProductsByCollection(rows: CollectionProductRow[]): Map<string, number>`
  - `buildCollectionTiles(collections: Collection[], rows: CollectionProductRow[], locale: Locale): CollectionTile[]`
  - `foldAfterIndex(collections: Collection[], counts: Map<string, number>): number | null`
  - `getCollectionTilesForHome(locale?: Locale): Promise<CollectionTile[]>`

- [ ] **Step 1: Napisz testy (najpierw czerwone)**

Utwórz `app/_lib/__tests__/collection-tiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCollectionTiles,
  countActiveProductsByCollection,
  foldAfterIndex,
  HOME_COLLECTIONS_VISIBLE,
  type CollectionProductRow,
} from "@/app/_lib/collections";
import type { Collection } from "@/app/_lib/types";

// Fabryka kolekcji — pełny typ, żeby test nie rozjechał się przy dodaniu pola.
function col(over: Partial<Collection> & { id: string; label: string }): Collection {
  return {
    slug: over.label.toLowerCase(),
    label_de: null,
    description: null,
    description_de: null,
    sort_order: 0,
    show_on_home: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Collection;
}

function row(collectionId: string | null, image?: string | null): CollectionProductRow {
  return { collection_id: collectionId, images: image === undefined ? ["img.jpg"] : image ? [image] : [] };
}

describe("countActiveProductsByCollection", () => {
  it("liczy wiersze per kolekcja i ignoruje produkty bez kolekcji", () => {
    const counts = countActiveProductsByCollection([row("a"), row("a"), row("b"), row(null)]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("produkt bez zdjęcia też się liczy", () => {
    const counts = countActiveProductsByCollection([row("a", null), row("a")]);
    expect(counts.get("a")).toBe(2);
  });
});

describe("buildCollectionTiles", () => {
  it("sortuje po sort_order rosnąco", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "b", label: "Bergen", sort_order: 1 }), col({ id: "a", label: "Oslo", sort_order: 0 })],
      [row("a"), row("b")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["a", "b"]);
  });

  it("przy równym sort_order rozstrzyga label", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "z", label: "Zamora", sort_order: 3 }), col({ id: "a", label: "Avila", sort_order: 3 })],
      [row("a"), row("z")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["a", "z"]);
  });

  it("pomija kolekcję z show_on_home=false", () => {
    const tiles = buildCollectionTiles(
      [col({ id: "a", label: "Oslo", show_on_home: false }), col({ id: "b", label: "Bergen" })],
      [row("a"), row("b")],
      "pl"
    );
    expect(tiles.map((t) => t.collection.id)).toEqual(["b"]);
  });

  it("pomija kolekcję bez produktów", () => {
    const tiles = buildCollectionTiles([col({ id: "a", label: "Oslo" })], [], "pl");
    expect(tiles).toEqual([]);
  });

  it("bierze najwyżej 4 zdjęcia, ale licznik pokazuje wszystkie produkty", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row("a", `img${i}.jpg`));
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toHaveLength(4);
    expect(tile.productCount).toBe(20);
  });

  it("produkt bez zdjęcia nie zajmuje kafelka w mozaice, ale liczy się do licznika", () => {
    const rows = [row("a", null), row("a", "img1.jpg"), row("a", null), row("a", "img2.jpg")];
    const [tile] = buildCollectionTiles([col({ id: "a", label: "Oslo" })], rows, "pl");
    expect(tile.thumbnails).toEqual(["img1.jpg", "img2.jpg"]);
    expect(tile.productCount).toBe(4);
  });

  it("lokalizuje etykietę dla DE z fallbackiem do PL", () => {
    const [tile] = buildCollectionTiles(
      [col({ id: "a", label: "Sofy", label_de: "Sofas" })],
      [row("a")],
      "de"
    );
    expect(tile.collection.label).toBe("Sofas");
  });
});

describe("foldAfterIndex", () => {
  const counts = new Map<string, number>();
  const many = Array.from({ length: 9 }, (_, i) => {
    counts.set(`c${i}`, 1);
    return col({ id: `c${i}`, label: `K${i}`, sort_order: i });
  });

  it("zwraca indeks szóstej kolekcji, która realnie trafi na home", () => {
    expect(foldAfterIndex(many, counts)).toBe(HOME_COLLECTIONS_VISIBLE - 1);
  });

  it("nie liczy kolekcji ukrytych ani pustych — kreska przesuwa się dalej", () => {
    const mixed = [
      col({ id: "hidden", label: "Ukryta", sort_order: 0, show_on_home: false }),
      col({ id: "empty", label: "Pusta", sort_order: 1 }),
      ...many,
    ];
    const c = new Map(counts);
    c.set("hidden", 5); // ma produkty, ale jest ukryta
    // "empty" celowo bez wpisu w liczniku
    expect(foldAfterIndex(mixed, c)).toBe(HOME_COLLECTIONS_VISIBLE + 1);
  });

  it("zwraca null gdy widocznych kolekcji jest 6 lub mniej", () => {
    const few = many.slice(0, 5);
    expect(foldAfterIndex(few, counts)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź, że padają**

Run: `npm test -- collection-tiles`
Expected: FAIL — `countActiveProductsByCollection is not a function` / błędy importu, bo funkcji jeszcze nie ma.

- [ ] **Step 3: Zaimplementuj czyste funkcje**

W `app/_lib/collections.ts` **zastąp** całą sekcję `getCollectionsForHome` (linie 65-99) poniższym kodem:

```ts
// ============================================================
// Kafelki kolekcji na stronę główną
// ============================================================
// Ile kafelków widać przed rozwinięciem. 6 dzieli się bez resztki przez 1, 2
// i 3 — tyle kolumn ma siatka na kolejnych szerokościach ekranu — więc granica
// zwinięcia wypada na końcu pełnego rzędu na każdym urządzeniu.
export const HOME_COLLECTIONS_VISIBLE = 6;

// Minimalny wiersz produktu potrzebny do kafelka. Świadomie NIE `Product`:
// mozaika ma alt="" i nie używa nazw ani opisów, więc nie ma po co ich pobierać.
export type CollectionProductRow = {
  collection_id: string | null;
  images: string[] | null;
};

export type CollectionTile = {
  collection: Collection; // zlokalizowana (label/description)
  thumbnails: string[]; // do 4 adresów zdjęć na mozaikę
  productCount: number; // liczba AKTYWNYCH produktów w kolekcji
};

// Wspólne dla strony głównej i panelu — żeby "aktywny produkt" miał jedną
// definicję po obu stronach i nie rozjechał się przy zmianie warunku.
export function countActiveProductsByCollection(
  rows: CollectionProductRow[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.collection_id) continue;
    counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
  }
  return counts;
}

// Cała logika składania kafelków — bez I/O, więc testowalna bez bazy.
export function buildCollectionTiles(
  collections: Collection[],
  rows: CollectionProductRow[],
  locale: Locale
): CollectionTile[] {
  const counts = countActiveProductsByCollection(rows);

  // Zdjęcia tylko z produktów, KTÓRE JE MAJĄ. Dotąd produkt bez zdjęcia
  // zajmował miejsce w mozaice i zostawał po nim szary prostokąt.
  const thumbnails = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.collection_id) continue;
    const first = r.images?.[0];
    if (!first) continue;
    const arr = thumbnails.get(r.collection_id) ?? [];
    if (arr.length < 4) arr.push(first);
    thumbnails.set(r.collection_id, arr);
  }

  return collections
    .filter((c) => c.show_on_home && (counts.get(c.id) ?? 0) > 0)
    .sort(
      (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pl")
    )
    .map((c) => ({
      collection: localizeCollection(c, locale),
      thumbnails: thumbnails.get(c.id) ?? [],
      productCount: counts.get(c.id) ?? 0,
    }));
}

// Indeks pozycji, PO której panel rysuje kreskę "poniżej dopiero po
// rozwinięciu". Liczy tylko kolekcje, które realnie trafią na stronę —
// liczenie wszystkich wierszy pokazywałoby granicę w złym miejscu.
// null = widocznych jest 6 lub mniej, więc kreski nie ma.
export function foldAfterIndex(
  collections: Collection[],
  counts: Map<string, number>
): number | null {
  let shown = 0;
  for (let i = 0; i < collections.length; i++) {
    const c = collections[i];
    if (c.show_on_home && (counts.get(c.id) ?? 0) > 0) shown++;
    if (shown === HOME_COLLECTIONS_VISIBLE) return i;
  }
  return null;
}

// Cienka skorupa nad buildCollectionTiles: dwa zapytania i nic więcej.
export async function getCollectionTilesForHome(
  locale: Locale = DEFAULT_LOCALE
): Promise<CollectionTile[]> {
  const collections = await getAllCollections();
  if (collections.length === 0) return [];

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("collection_id, images")
    .eq("is_active", true)
    .not("collection_id", "is", null)
    .order("name", { ascending: true });

  // Dotąd błąd był ignorowany bez śladu: awaria bazy = sekcja znika ze strony
  // głównej i nikt nie wie dlaczego. Znikanie zostaje (jedenaście kafelków
  // z szarymi prostokątami wygląda na zepsute bardziej), ale z logiem.
  if (error) {
    console.error("[collections] produkty do kafelków niedostępne:", error);
    return [];
  }

  return buildCollectionTiles(
    collections,
    (data ?? []) as CollectionProductRow[],
    locale
  );
}
```

- [ ] **Step 4: Uruchom testy i potwierdź, że przechodzą**

Run: `npm test -- collection-tiles`
Expected: PASS, 11 testów.

- [ ] **Step 5: Sprawdź, kto jeszcze woła usuniętą funkcję**

Run: `grep -rn "getCollectionsForHome" app/`
Expected: jedyne trafienie w `app/page.tsx` (naprawiane w Task 3). Gdyby było więcej — zatrzymaj się i zgłoś, plan tego nie przewiduje.

`npx tsc --noEmit` na tym etapie **będzie** zgłaszać błąd w `app/page.tsx` — to oczekiwane, Task 3 to naprawia. Nie commituj z zepsutym `tsc`: ten task i Task 3 idą w jednym commicie.

- [ ] **Step 6: Nie commituj osobno — przejdź do Task 3**

Warstwa danych bez frontu nie kompiluje się, więc commit powstaje na końcu Task 3.

---

### Task 3: Front — komponent `HomeCollections` i strona główna

**Files:**
- Create: `app/_components/blocks/HomeCollections.tsx`
- Modify: `app/page.tsx` (import + `case "collections"` w linii ~213, usunięcie `mosaicTileClass` z linii 50-57)
- Modify: `app/_lib/dictionaries/pl.ts` (interfejs sekcji `home` ~linia 32 i wartości ~linia 387), `app/_lib/dictionaries/de.ts` (~linia 38)

**Interfaces:**
- Consumes: `CollectionTile`, `HOME_COLLECTIONS_VISIBLE`, `getCollectionTilesForHome` (Task 2).
- Produces: komponent `HomeCollections({ tiles, locale })`; klucze słownika `home.collectionsShowAll`, `home.collectionsCollapse`; kontener o `id="home-collections-rest"` (używa go Task 5).

- [ ] **Step 1: Dodaj klucze do słownika PL**

W `app/_lib/dictionaries/pl.ts`, w **interfejsie** sekcji `home` (obok `seeCollection: string;`):

```ts
    collectionsShowAll: string;
    collectionsCollapse: string;
```

I w **wartościach** PL (obok `seeCollection: "Zobacz kolekcję",`):

```ts
    collectionsShowAll: "Pokaż wszystkie kolekcje",
    collectionsCollapse: "Zwiń",
```

- [ ] **Step 2: Dodaj odpowiedniki DE**

W `app/_lib/dictionaries/de.ts` (obok `seeCollection: "Kollektion ansehen",`):

```ts
    collectionsShowAll: "Alle Kollektionen anzeigen",
    collectionsCollapse: "Einklappen",
```

⚠️ Bez tego `tsc` się wywali — interfejs jest typowany w `pl.ts` i wymaga obu języków. Zamrożenie `/de` (`DE_ENABLED`) niczego tu nie zwalnia: tłumaczenia zostają w kodzie i mają wrócić.

- [ ] **Step 3: Utwórz komponent**

Utwórz `app/_components/blocks/HomeCollections.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pluralForm } from "@/app/_lib/plural";
import { HOME_COLLECTIONS_VISIBLE, type CollectionTile } from "@/app/_lib/collections";
import type { Locale } from "@/app/_lib/i18n";

// Klasa grid dla i-tego zdjęcia w mozaice kolekcji (do 4 zdjęć). Pojedyncze
// zdjęcie wypełnia całość, dwa dzielą się na pół wysokości, przy trzech
// pierwsze zajmuje cały górny wiersz, przy czterech siatka 2×2.
// Przeniesione z app/page.tsx razem z markupem kafelka.
function mosaicTileClass(total: number, index: number): string {
  if (total === 1) return "col-span-2 row-span-2";
  if (total === 2) return "col-span-1 row-span-2";
  if (total === 3 && index === 0) return "col-span-2";
  return "";
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6";
const REST_ID = "home-collections-rest";

// Sekcja "Nasze kolekcje". Pierwsze HOME_COLLECTIONS_VISIBLE kafelków widać od
// razu, nadwyżka siedzi w drugim kontenerze do kliknięcia.
export default function HomeCollections({
  tiles,
  locale,
}: {
  tiles: CollectionTile[];
  locale: Locale;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = getDictionary(locale);

  const visible = tiles.slice(0, HOME_COLLECTIONS_VISIBLE);
  const rest = tiles.slice(HOME_COLLECTIONS_VISIBLE);

  function card({ collection, thumbnails, productCount }: CollectionTile) {
    return (
      <LocalizedLink
        key={collection.id}
        href={`/sklep?kolekcja=${collection.slug}`}
        className="group flex flex-col bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--color-gold)] transition-colors"
      >
        {/* Mozaika do 4 zdjęć produktów z kolekcji */}
        <div className="relative aspect-[4/3] grid grid-cols-2 gap-1 p-1 bg-stone-100 dark:bg-stone-900">
          {thumbnails.map((src, i) => (
            <div
              key={src}
              className={`relative bg-stone-200 dark:bg-stone-800 rounded-lg overflow-hidden ${mosaicTileClass(
                thumbnails.length,
                i
              )}`}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform group-hover:scale-105"
              />
            </div>
          ))}
        </div>
        <div className="p-6 flex flex-col gap-2">
          <h3 className="font-display text-2xl font-bold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
            {collection.label}
          </h3>
          {collection.description && (
            <p className="text-sm text-[var(--muted)] leading-snug line-clamp-2">
              {collection.description}
            </p>
          )}
          <span className="mt-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
            {t.home.seeCollection} ({productCount}{" "}
            {pluralForm(productCount, {
              one: t.home.productOne,
              few: t.home.productFew,
              many: t.home.productMany,
            })})
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </LocalizedLink>
    );
  }

  return (
    <>
      <div className={GRID}>{visible.map(card)}</div>

      {rest.length > 0 && (
        <>
          {/*
            UKRYCIE MUSI BYĆ `hidden` (display: none), NIE opacity-0 ani
            max-height: 0. Tylko wtedy przeglądarka nie pobiera leniwych zdjęć
            (next/image domyślnie loading="lazy") ze schowanego kontenera.
            Przy opacity-0 wszystkie zdjęcia ładują się normalnie i cały zysk
            przepada — NIEWIDOCZNIE, bo wizualnie zachowanie jest identyczne.
            Pilnuje tego e2e/home-collections.spec.ts.
          */}
          <div id={REST_ID} className={expanded ? `${GRID} mt-6` : "hidden"}>
            {rest.map(card)}
          </div>

          <div className="flex justify-center mt-10">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={REST_ID}
              className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
            >
              {expanded
                ? t.home.collectionsCollapse
                : `${t.home.collectionsShowAll} (+${rest.length})`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Podepnij komponent na stronie głównej**

W `app/page.tsx`:

1. Zamień import warstwy danych:

```ts
import { getCollectionTilesForHome } from "./_lib/collections";
```

2. Dodaj import komponentu obok pozostałych bloków:

```ts
import HomeCollections from "./_components/blocks/HomeCollections";
```

3. W `Promise.all` (linia ~69) zamień `getCollectionsForHome(locale)` na `getCollectionTilesForHome(locale)`, a nazwę zmiennej `collectionsForHome` na `collectionTiles`.

4. Zamień całe ciało `case "collections":` na:

```tsx
      case "collections":
        // Nasze kolekcje — auto-render kolekcji z DB które mają aktywne produkty.
        // Zwijanie i markup kafelka: _components/blocks/HomeCollections.tsx
        if (collectionTiles.length === 0) return null;
        return (
          <section className="max-w-7xl mx-auto px-6 py-24">
            {sectionHeader(b)}
            <HomeCollections tiles={collectionTiles} locale={locale} />
          </section>
        );
```

5. Usuń z `app/page.tsx` funkcję `mosaicTileClass` wraz z komentarzem (linie 50-57) — przeniosła się do komponentu.

6. Usuń nieużywane już importy, jeśli `tsc` je wskaże (`Image` i `pluralForm` mogą być używane przez inne bloki — sprawdź, nie usuwaj na wyczucie).

- [ ] **Step 5: Sprawdź bramki**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 0 błędów, wszystkie testy zielone, build przechodzi.

- [ ] **Step 6: Sprawdź stronę oczami**

Run: `npm run dev`, otwórz `http://localhost:3000`.
Sprawdź: widać 6 kafelków; przycisk „Pokaż wszystkie kolekcje (+5)"; po kliknięciu widać wszystkie i przycisk mówi „Zwiń"; licznik na kafelku pokazuje realną liczbę produktów (a nie 4).

⚠️ Jeśli w tle chodził `npm run build`, dev może serwować stary render — zabij proces na porcie 3000, usuń `.next`, uruchom dev ponownie.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/_lib/collections.ts sklep-meblowy/app/_lib/__tests__/collection-tiles.test.ts sklep-meblowy/app/_components/blocks/HomeCollections.tsx sklep-meblowy/app/page.tsx sklep-meblowy/app/_lib/dictionaries/pl.ts sklep-meblowy/app/_lib/dictionaries/de.ts
git commit -m "feat(home): zwijanie kolekcji do pierwszych 6 + kafelki z realnym licznikiem"
```

---

### Task 4: Panel — przeciąganie, przełącznik, kreska

**Files:**
- Modify: `app/admin/kolekcje/actions.ts` (dopisz dwie akcje na końcu)
- Modify: `app/admin/kolekcje/page.tsx` (całość, 38 linii)
- Modify: `app/admin/kolekcje/CollectionsEditor.tsx` (lista ~linie 109-142, komponent `Row` ~linia 155+)

**Interfaces:**
- Consumes: `countActiveProductsByCollection`, `foldAfterIndex`, `HOME_COLLECTIONS_VISIBLE` (Task 2); RPC `reorder_collections` (Task 1).
- Produces: `reorderCollections(order: { id: string; sort_order: number }[]): Promise<ActionResult>`, `toggleCollectionOnHome(formData: FormData): Promise<ActionResult>`.

- [ ] **Step 1: Dopisz akcje serwerowe**

Na końcu `app/admin/kolekcje/actions.ts`:

```ts
// ============================================================
// Kolejność na stronie głównej (spec 2026-07-31)
// ============================================================
// Atomowy reorder przez RPC — pętla UPDATE po jednym wierszu przy padzie
// w połowie zostawia kolekcje z pomieszanymi numerami (jak reorderTiles).
export async function reorderCollections(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_collections", {
    p_ids: order.map((o) => o.id).filter(Boolean),
  });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/");
  return { ok: true, message: "Kolejność zapisana" };
}

// Ptaszek "pokazuj na stronie głównej" — zapis od razu, osobno od formularza
// edycji. Metadane kolekcji idą przez save_collection(uuid,text,text,uuid[])
// o ustalonej sygnaturze; dopisanie tam pola wymagałoby zmiany funkcji
// używanej też przez inną ścieżkę.
export async function toggleCollectionOnHome(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const show = formData.get("show") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("collections")
    .update({ show_on_home: show } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/");
  return {
    ok: true,
    message: show ? "Kolekcja wróciła na stronę główną" : "Kolekcja ukryta ze strony głównej",
  };
}
```

- [ ] **Step 2: Zwęź zapytanie i policz tylko aktywne produkty**

Zamień całość `app/admin/kolekcje/page.tsx` na:

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import {
  countActiveProductsByCollection,
  getAllCollections,
  type CollectionProductRow,
} from "@/app/_lib/collections";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import CollectionsEditor from "./CollectionsEditor";

export const metadata = { title: "Kolekcje — Admin" };

export default async function AdminCollectionsPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const [collections, { data: productsRaw }] = await Promise.all([
    getAllCollections(),
    // Picker produktów potrzebuje nazwy i miniatury — ale NIE opisów HTML,
    // które przy select("*") ciągnęły cały katalog razem z treścią.
    supabase
      .from("products")
      .select("id, name, images, collection_id, is_active")
      .order("name", { ascending: true }),
  ]);

  const products = (productsRaw ?? []) as Product[];

  // Licznik liczy TYLKO aktywne produkty — tym samym helperem, co strona
  // główna, żeby "aktywny produkt" nie miał w panelu innej definicji.
  const activeRows: CollectionProductRow[] = products
    .filter((p) => p.is_active)
    .map((p) => ({ collection_id: p.collection_id, images: p.images }));
  const counts = countActiveProductsByCollection(activeRows);

  return (
    <CollectionsEditor
      initialCollections={collections}
      allProducts={products}
      productCounts={Object.fromEntries(counts)}
    />
  );
}
```

⚠️ `Product` to szerszy typ niż to, co zwraca zwężony `select` — rzutowanie zostaje jak dotąd (`as Product[]`), bo picker używa tylko `id`, `name`, `images`, `collection_id`. Jeśli `tsc` wskaże w `CollectionsEditor` użycie innego pola produktu, dopisz je do listy kolumn, **nie** wracaj do `select("*")`.

- [ ] **Step 3: Dodaj przeciąganie do edytora**

W `app/admin/kolekcje/CollectionsEditor.tsx`:

1. Dopisz importy:

```tsx
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { foldAfterIndex, HOME_COLLECTIONS_VISIBLE } from "@/app/_lib/collections";
import { reorderCollections, toggleCollectionOnHome } from "./actions";
```

2. W komponencie głównym dodaj sensory i handler (wzór: `TilesEditor`):

```tsx
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = collections.findIndex((c) => c.id === active.id);
    const newIndex = collections.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(collections, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort_order: i,
    }));

    // Cofnięcie wraca do OSTATNIEGO DOBREGO stanu, nie do initialCollections —
    // inaczej nieudany zapis wymazuje wcześniejsze udane przestawienia
    // (wniosek z audytu, ten sam komentarz jest w TilesEditor).
    const prev = collections;
    setCollections(reordered);
    startTransition(async () => {
      const res = await reorderCollections(
        reordered.map((c) => ({ id: c.id, sort_order: c.sort_order }))
      );
      if (!res.ok) {
        setCollections(prev);
        showToast({ type: "error", message: res.error });
      }
    });
  }
```

Jeśli w tym komponencie nie ma jeszcze `startTransition`, dodaj `const [, startTransition] = useTransition();` (import `useTransition` z `react`).

3. Zamień renderowanie listy (obecnie `<div className="flex flex-col gap-3">{collections.map(...)}`) na wersję z DnD i kreską:

```tsx
        <DndContext
          id="collections-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={collections.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {collections.map((c, index) => (
                <Fragment key={c.id}>
                  <Row
                    collection={c}
                    productCount={productCounts[c.id] ?? 0}
                    allProducts={allProducts}
                    expanded={editingId === c.id}
                    onToggleExpand={() => setEditingId(editingId === c.id ? null : c.id)}
                    onUpdate={/* bez zmian — jak dotąd */ undefined as never}
                    onDelete={/* bez zmian — jak dotąd */ undefined as never}
                    onToggleHome={async () => {
                      const prev = collections;
                      setCollections(
                        collections.map((x) =>
                          x.id === c.id ? { ...x, show_on_home: !x.show_on_home } : x
                        )
                      );
                      const fd = new FormData();
                      fd.set("id", c.id);
                      fd.set("show", c.show_on_home ? "0" : "1");
                      const res = await toggleCollectionOnHome(fd);
                      if (!res.ok) {
                        setCollections(prev);
                        showToast({ type: "error", message: res.error });
                      }
                    }}
                  />
                  {foldIndex === index && (
                    <div className="flex items-center gap-3 py-1" aria-hidden="true">
                      <div className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[11px] font-sans uppercase tracking-widest text-[var(--muted)]">
                        poniżej dopiero po rozwinięciu
                      </span>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </SortableContext>
        </DndContext>
```

⚠️ `onUpdate` i `onDelete` zostawiasz **dokładnie takie, jakie są w pliku dziś** — powyżej są zaznaczone jako „bez zmian", nie przepisuj ich na `undefined`. Dodajesz tylko `onToggleHome` i owinięcie we `Fragment` (import `Fragment` z `react`).

4. Nad `return` policz pozycję kreski:

```tsx
  // Kreska liczy tylko kolekcje, które realnie trafią na home (widoczne
  // i mające aktywne produkty) — inaczej pokazywałaby granicę w złym miejscu.
  const foldIndex = foldAfterIndex(
    collections,
    new Map(Object.entries(productCounts))
  );
```

- [ ] **Step 4: Dodaj uchwyt i ptaszek w wierszu**

W komponencie `Row`:

1. Rozszerz propsy o `onToggleHome: () => Promise<void>`.
2. Na początku ciała dodaj:

```tsx
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: collection.id });
  const [pendingHome, startHomeTransition] = useTransition();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
```

3. Na kontenerze wiersza ustaw `ref={setNodeRef}` i `style={style}`; jeśli kolekcja nie trafi na home, wyszarz go: dopisz do klasy `` `${!collection.show_on_home || productCount === 0 ? "opacity-60" : ""}` ``.
4. Jako pierwszy element w rzędzie wstaw uchwyt (te same ikony i klasy co w `TilesEditor`):

```tsx
        <button
          {...attributes}
          {...listeners}
          aria-label="Przeciągnij żeby zmienić kolejność"
          className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] cursor-grab active:cursor-grabbing"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="6" r="1" fill="currentColor" />
            <circle cx="9" cy="12" r="1" fill="currentColor" />
            <circle cx="9" cy="18" r="1" fill="currentColor" />
            <circle cx="15" cy="6" r="1" fill="currentColor" />
            <circle cx="15" cy="12" r="1" fill="currentColor" />
            <circle cx="15" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>
```

5. Obok liczby produktów dodaj ptaszek i plakietkę:

```tsx
        <label className="flex items-center gap-2 text-xs text-[var(--fg)] cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={collection.show_on_home}
            disabled={pendingHome}
            onChange={() => startHomeTransition(() => void onToggleHome())}
          />
          na stronie głównej
        </label>
        {productCount === 0 && (
          <span className="shrink-0 text-[11px] text-[var(--muted)]">
            brak aktywnych produktów — nie pokaże się
          </span>
        )}
```

- [ ] **Step 5: Sprawdź bramki**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: 0 błędów, testy zielone, build przechodzi.

- [ ] **Step 6: Sprawdź panel ręcznie**

Run: `npm run dev`, otwórz `http://localhost:3000/admin/kolekcje`.
Sprawdź: przeciągnięcie zmienia kolejność i zostaje po odświeżeniu; kreska stoi po szóstej **widocznej** kolekcji; odznaczenie ptaszka wyszarza wiersz i przesuwa kreskę; strona główna po odświeżeniu pokazuje nową kolejność.

⚠️ To produkcyjna baza — przestawiasz prawdziwe kolekcje. Zapamiętaj kolejność przed testem albo przywróć ją po.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/admin/kolekcje/
git commit -m "feat(admin): kolejnosc kolekcji przeciaganiem + przelacznik pokazywania na home"
```

---

### Task 5: Guard e2e

**Files:**
- Create: `e2e/home-collections.spec.ts`

**Interfaces:**
- Consumes: kontener `id="home-collections-rest"` i przycisk z `aria-controls="home-collections-rest"` (Task 3).
- Produces: nic (test).

- [ ] **Step 1: Napisz test**

Utwórz `e2e/home-collections.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Zwijanie kolekcji na stronie glownej (spec 2026-07-31): widocznych 6,
// reszta po kliknieciu.
//
// URUCHAMIANIE: ustaw E2E_BASE_URL na localhost i dodaj --no-deps. Bez
// E2E_BASE_URL playwright.config.ts celuje w PRODUKCJE (www.mollien.pl).
const VISIBLE = 6;

test.beforeEach(async ({ page }) => {
  // Zgoda cookie z gory - baner (fixed, z-50) nie zaslania nic w tescie.
  await page.addInitScript(() => {
    localStorage.setItem(
      "mollien.cookie-consent",
      JSON.stringify({ analytics: false, marketing: false, ts: Date.now() })
    );
  });
});

test("pierwsze 6 kolekcji widoczne, reszta ukryta i rozwijana", async ({ page }) => {
  await page.goto("/");

  const rest = page.locator("#home-collections-rest");
  const button = page.locator('button[aria-controls="home-collections-rest"]');

  // Sekcja moze nie miec nadwyzki (<= 6 kolekcji) - wtedy nie ma czego testowac.
  if ((await button.count()) === 0) {
    test.skip(true, "mniej niz 7 kolekcji na home - brak przycisku");
  }

  // Kluczowa asercja: ukrycie musi byc display:none, bo tylko wtedy
  // przegladarka nie pobiera leniwych zdjec ze schowanego kontenera.
  // Zamiana na opacity-0 jest wizualnie niewykrywalna i niszczy caly zysk.
  await expect(rest).toBeHidden();
  await expect(rest).toHaveCSS("display", "none");

  const hiddenCount = await rest.locator('a[href*="kolekcja="]').count();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toContainText(`+${hiddenCount}`);

  // Widocznych dokladnie VISIBLE - liczymy linki spoza ukrytego kontenera.
  const allLinks = page.locator('a[href*="kolekcja="]');
  expect((await allLinks.count()) - hiddenCount).toBe(VISIBLE);

  await button.click();

  await expect(rest).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(button).toHaveText("Zwiń");

  // Zwijanie z powrotem
  await button.click();
  await expect(rest).toBeHidden();
});
```

- [ ] **Step 2: Uruchom test na lokalnym serwerze**

Run (dwa okna): `npm run dev`, a potem
`E2E_BASE_URL=http://localhost:3000 npx playwright test home-collections --no-deps`
Expected: PASS.

⚠️ Bez `E2E_BASE_URL` test poleci na **produkcję**, gdzie tej funkcji jeszcze nie ma — i wywali się mylącym błędem.

- [ ] **Step 3: Commit**

```bash
git add sklep-meblowy/e2e/home-collections.spec.ts
git commit -m "test(e2e): guard zwijania kolekcji na stronie glownej"
```

- [ ] **Step 4: Otwórz PR**

```bash
gh auth switch --user Woodecky10
git push -u origin feat/kolekcje-zwijanie-home
gh pr create --base main --title "Kolekcje na home: pierwsze 6 + zwijanie, kolejność przeciąganiem"
```

W opisie PR wymień: migrację 66 (zaaplikowaną ręcznie przed merge'em), trzy naprawione po drodze błędy (licznik max 4, brak filtru `is_active`, produkt bez zdjęcia w mozaice) i wynik bramek. Push wymaga konta **Woodecky10** — `mwlo1403` dostaje 403.

---

## Self-review planu

**Pokrycie speca:**

| Wymaganie ze speca | Task |
|---|---|
| Kolumny `sort_order`, `show_on_home` + backfill + RPC | 1 |
| Typ `Collection` | 1 |
| `CollectionTile`, wąskie zapytanie, licznik aktywnych | 2 |
| `buildCollectionTiles` jako czysta funkcja + testy | 2 |
| Wspólny `countActiveProductsByCollection` | 2 (front), 4 (panel) |
| Log błędu zapytania zamiast cichego znikania | 2 |
| Przeniesienie kafelka do `HomeCollections` | 3 |
| `display: none`, nie `opacity-0` | 3 (komentarz), 5 (asercja) |
| „Zwiń" po rozwinięciu | 3 |
| Klucze słownika PL + DE | 3 |
| Przeciąganie + rollback do ostatniego dobrego stanu | 4 |
| Ptaszek zapisywany od razu, osobno od `save_collection` | 4 |
| Kreska licząca tylko realnie widoczne kolekcje | 2 (`foldAfterIndex`), 4 (render) |
| Kolekcje ukryte/puste zostają na miejscu, wyszarzone | 4 |
| Testy jednostkowe (7 przypadków ze speca) | 2 |
| Guard e2e | 5 |
| Weryfikacja migracji przez MCP | 1 |

Bez luk.

**Placeholdery:** brak „TBD"/„TODO". Jedyne miejsca opisowe zamiast kodu to `onUpdate`/`onDelete` w Task 4 Step 3 — celowo, bo mają zostać nietknięte, i jest to wyraźnie zaznaczone ostrzeżeniem.

**Spójność typów:** `CollectionProductRow` jest zdefiniowany w Task 2 i używany w Task 2 (front) oraz Task 4 (panel) pod tą samą nazwą. `foldAfterIndex` przyjmuje `Map<string, number>`, a panel trzyma `productCounts` jako `Record<string, number>` — dlatego Task 4 Step 3 jawnie konwertuje przez `new Map(Object.entries(...))`. `HOME_COLLECTIONS_VISIBLE` jest jednym źródłem liczby 6 w kodzie; e2e trzyma własną stałą `VISIBLE = 6`, bo test nie importuje kodu aplikacji.
