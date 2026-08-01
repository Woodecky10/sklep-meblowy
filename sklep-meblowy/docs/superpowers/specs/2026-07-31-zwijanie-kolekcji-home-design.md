# Zwijanie kolekcji na stronie głównej — projekt

**Data:** 2026-07-31
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

Sekcja „Nasze kolekcje" na stronie głównej renderuje **wszystkie** kolekcje, które mają produkty. Dziś jest ich 11, każda jako kafelek z mozaiką do 4 zdjęć — czyli do 44 zdjęć w jednej sekcji. Każda nowa kolekcja przedłuża stronę główną i dokłada zdjęć, więc problem rośnie wraz ze sklepem.

Kolejność jest **alfabetyczna po nazwie** i admin nie ma na nią żadnego wpływu: tabela `collections` nie ma kolumny porządkującej (mają ją `categories`, `home_tiles` i `fabric_groups`).

## Decyzje właściciela

| Pytanie | Decyzja |
|---|---|
| Jak admin ustala kolejność | **Przeciąganie**, jak w `/admin/kafelki` |
| Ile kafelków widocznych od razu | **6**, stała w kodzie (nie ustawienie w panelu) |
| Czy można ukryć kolekcję z home | **Tak** — przełącznik „pokazuj na stronie głównej" |
| Mechanika zwijania | Wszystkie karty w HTML, nadwyżka ukryta do kliknięcia |

Dlaczego 6 jako stała, a nie ustawienie: siatka ma 1 / 2 / 3 kolumny na kolejnych szerokościach ekranu, a 6 dzieli się bez resztki przez każdą z tych liczb — granica zwinięcia wypada na końcu pełnego rzędu na **każdym** urządzeniu. Zmiana na inną liczbę to jednolinijkowa poprawka; kolumna w bazie plus pole w panelu nie zarabiają na siebie, dopóki nikt tej liczby realnie nie kręci.

## Zakres

Trzy rzeczy naprawiane po drodze, bo siedzą w tym samym kodzie i zostawienie ich byłoby zostawieniem znanych błędów:

1. **Licznik „Zobacz kolekcję (N produktów)" pokazuje maksymalnie 4** — liczy próbki do mozaiki, nie produkty w kolekcji.
2. **Zapytanie nie filtruje `is_active`** — wyłączony produkt wystawia zdjęcie na stronę główną i jest doliczany, mimo że w `/sklep` go nie ma.
3. **Produkt bez zdjęcia zajmuje kafelek w mozaice** i zostaje po nim szary prostokąt: miejsce w siatce przydziela się przed sprawdzeniem, czy zdjęcie istnieje.

Poza zakresem: wygląd kafelka (markup przenoszony 1:1), optymalizacja obrazów (osobny temat — przejście na optymalizator Vercela), cache'owanie zapytania o produkty.

## Architektura

### 1. Baza — migracja 66

```sql
alter table public.collections
  add column if not exists sort_order   integer not null default 0,
  add column if not exists show_on_home boolean not null default true;

-- Backfill kolejnością alfabetyczną, czyli tą, która obowiązuje dziś.
-- GUARD (dopisany po zaaplikowaniu na produkcji 2026-07-31): backfill
-- działa tylko, gdy żadna kolekcja nie ma jeszcze niezerowego sort_order.
-- Bez tego powtórne odpalenie pliku (projekt aplikuje migracje ręcznie,
-- rejestr bywa niepełny) nadpisałoby kolejność ustawioną przeciąganiem
-- w /admin/kolekcje z powrotem na alfabetyczną.
update public.collections c
set sort_order = t.rn
from (select id, (row_number() over (order by label)) - 1 as rn
      from public.collections) t
where c.id = t.id
  and not exists (
    select 1 from public.collections where sort_order <> 0
  );

-- Atomowy reorder — jak reorder_home_tiles z migracji 28.
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

**Backfill jest obowiązkowy.** Bez niego wszystkie kolekcje mają `sort_order = 0` i kolejność na stronie robi się przypadkowa (zależna od tego, co baza zwróci pierwsze). Z backfillem wdrożenie migracji **nie zmienia niczego, co widzi klient** — dopiero pierwsze przeciągnięcie w panelu coś przestawia. Zmiana wyglądu ma być decyzją właściciela, nie efektem ubocznym migracji.

Sortowanie w zapytaniach: `sort_order, label`. Nazwa jako rozstrzygnięcie remisów, żeby dwie kolekcje z tym samym numerem nie zamieniały się miejscami między odświeżeniami.

Indeksu nie dodajemy — przy 11 wierszach byłby wyłącznie kosztem. Polityk RLS nie ruszamy: i strona, i panel czytają kolekcje klientem service-role.

`Collection` w `types.ts` dostaje oba pola.

### 2. Warstwa danych — `app/_lib/collections.ts`

`getCollectionsForHome` zastąpione przez:

```ts
export type CollectionTile = {
  collection: Collection;   // zlokalizowana (label/description)
  thumbnails: string[];     // do 4 adresów zdjęć na mozaikę
  productCount: number;     // liczba AKTYWNYCH produktów w kolekcji
};

export async function getCollectionTilesForHome(locale: Locale): Promise<CollectionTile[]>
```

Interfejs zwraca dokładnie to, co kafelek rysuje, i nic ponad to. Dziś funkcja robi `select("*")` na wszystkich produktach należących do jakiejkolwiek kolekcji — razem z pełnymi opisami HTML — i wyrzuca ponad 90% danych. Nowe zapytanie bierze **dwie kolumny** (`collection_id, images`) z filtrem `is_active = true`. Nazwy produktów nie są pobierane wcale, bo mozaika ma `alt=""`; `localizeProduct` znika z tej ścieżki.

Liczba produktów pochodzi z tego samego zapytania: liczone są wszystkie wiersze kolekcji, zdjęcia brane z pierwszych czterech **mających zdjęcie**.

**Świadomie bez `group by` w bazie.** Przy 44 produktach i dwóch wąskich kolumnach zliczanie w JS jest tańsze niż utrzymywanie funkcji RPC. Próg przeniesienia grupowania do bazy: rzędu **dziesiątek tysięcy** produktów w kolekcjach.

Rdzeń wydzielony do czystej funkcji:

```ts
export function buildCollectionTiles(
  collections: Collection[],
  productRows: { collection_id: string | null; images: string[] | null }[],
  locale: Locale
): CollectionTile[]
```

Tu mieszka cała logika — sortowanie, odsianie `show_on_home = false`, pominięcie kolekcji bez aktywnych produktów, obcięcie do 4 zdjęć, licznik. Funkcja z I/O jest cienką skorupą nad nią. To granica testowalności: logika sprawdzalna bez bazy.

Zliczanie wydzielone do osobnego, wspólnego helpera:

```ts
export function countActiveProductsByCollection(
  productRows: { collection_id: string | null; images: string[] | null }[]
): Map<string, number>
```

`buildCollectionTiles` woła go u siebie, a **panel woła go bezpośrednio** — bo potrzebuje liczb także dla kolekcji ukrytych i pustych, których lista kafelków nie zwraca. Wspólny helper znaczy, że „aktywny produkt" ma jedną definicję po obu stronach i nie rozjedzie się przy przyszłej zmianie (np. gdyby doszedł warunek na stan magazynowy).

Błąd zapytania → log do konsoli (jak w `sitemap.ts`) i pusta lista, czyli sekcja znika. Alternatywa — jedenaście kafelków z szarymi prostokątami — wygląda na zepsute bardziej niż brak sekcji, a log czyni awarię diagnozowalną w logach Vercela. Dziś błąd jest ignorowany bez śladu.

Cache: `getAllCollections` ma już `unstable_cache` z tagiem `collections` i `revalidate: 300`. Zapytanie o produkty pozostaje bez cache'u — dorobienie go wymagałoby unieważniania przy każdej edycji produktu i jest osobnym tematem. Bez zmiany względem dziś, więc bez regresji.

### 3. Front — `app/_components/blocks/HomeCollections.tsx`

Kafelek kolekcji przenoszony z `app/page.tsx` (290 linii, wielki `switch` po typach bloków) do własnego pliku. Nie jest to przenoszenie dla samego przenoszenia: każdy inny blok (`BannerBlock`, `GalleryBlock`, `ProductsBlock`…) już siedzi osobno w `_components/blocks/`; sekcja kolekcji jest jedyną, która trzyma cały markup — z mozaiką i helperem `mosaicTileClass` — wewnątrz strony.

Komponent kliencki, przyjmuje `tiles: CollectionTile[]` i `locale`, napisy z `getDictionary(locale)` — jak `LanguageSwitcher`, który też jest kliencki. **Wygląd kafelka bez zmian**, markup przenoszony jeden do jednego.

Zwijanie:

- pierwsze 6 kafelków renderuje się zawsze;
- nadwyżka trafia do drugiego kontenera z tą samą klasą siatki, w stanie zwiniętym z `hidden`;
- przycisk „Pokaż wszystkie (+N)", po rozwinięciu „Zwiń" (żeby nie trzeba było przewijać z powrotem);
- `aria-expanded` + `aria-controls` wskazujące ukryty kontener — jak w rozwijanych sekcjach opisu produktu;
- przy 6 kolekcjach lub mniej przycisku nie ma wcale;
- bez animacji: animowanie wysokości siatki CSS-owej działa nieprzewidywalnie.

Napisy przycisku wchodzą do słownika UI jako nowe klucze w `app/_lib/dictionaries/` (sekcja `home`) — **w obu językach**. Interfejs słownika jest typowany w `pl.ts`, więc brak odpowiednika DE wywali `tsc`; zamrożenie wersji niemieckiej niczego tu nie zwalnia, bo tłumaczenia zostają w kodzie i mają wrócić razem z `/de`.

**Ukrycie MUSI być `display: none`** (klasa `hidden`), a nie `opacity-0` ani `max-height: 0`. Tylko wtedy przeglądarka nie pobiera leniwych zdjęć (`next/image` domyślnie `loading="lazy"`) ze schowanego kontenera. Przy `opacity-0` wszystkie zdjęcia ładują się normalnie i cały zysk przepada — **niewidocznie**, bo wizualnie zachowanie jest identyczne.

Efekt: start strony głównej pobiera do 24 zdjęć zamiast dotychczasowych 44, a linki do wszystkich kolekcji zostają w HTML, więc pozostają widoczne dla Google.

### 4. Panel — `/admin/kolekcje`

Przeciąganie skopiowane z `TilesEditor`: `dnd-kit`, `PointerSensor` z progiem 8 px (żeby klik nie był brany za przeciągnięcie), `KeyboardSensor` z `sortableKeyboardCoordinates`, `arrayMove`, zapis po puszczeniu, optymistyczna zmiana w UI.

Przenoszony wniosek z audytu opisany w `TilesEditor`: **cofnięcie po błędzie wraca do ostatniego dobrego stanu, nie do stanu początkowego** — inaczej nieudany zapis wymazuje wcześniejsze udane przestawienia.

Nowa akcja serwerowa `reorderCollections(order)` — `requireAdmin()`, RPC `reorder_collections`, `invalidateCollectionsCache()`, `revalidatePath("/admin/kolekcje")`, `revalidatePath("/")`. Wzór: `reorderTiles` w `app/admin/kafelki/actions.ts`.

Przełącznik „pokazuj na stronie głównej": **ptaszek w wierszu listy, zapisywany od razu** osobną akcją, nie pole w formularzu edycji. Powody: spójność (kolejność też zapisuje się natychmiast) oraz to, że zapis metadanych kolekcji przechodzi przez funkcję `save_collection(uuid, text, text, uuid[])` o ustalonej sygnaturze — dopisanie pola wymagałoby zmiany funkcji używanej też przez inną ścieżkę.

Kolekcje ukryte i puste **zostają w liście na swoich miejscach** (mają `sort_order` jak wszystkie), wyszarzone i z plakietką „ukryta" / „brak aktywnych produktów". Nie są przenoszone na koniec: pozycja w liście to kolejność w bazie, a nie prognoza wyglądu strony — przenoszenie ich zmieniałoby numery przy każdym kliknięciu ptaszka. Do szóstki się nie liczą.

**Kreska po szóstej pozycji** („poniżej dopiero po rozwinięciu"), żeby granica była widoczna bez liczenia. Kreska liczy **tylko kolekcje, które realnie trafią na stronę**: z zaznaczonym ptaszkiem i mające przynajmniej jeden aktywny produkt. Liczenie wszystkich wierszy pokazywałoby granicę w złym miejscu. Dlatego lista pobiera też liczbę aktywnych produktów na kolekcję i oznacza adnotacją „brak aktywnych produktów" te, które nie pokażą się wcale — dziś takie kolekcje cicho nie istnieją na home i nie ma tego jak zauważyć.

## Testy

**Jednostkowe (vitest, node, bez bazy)** — `buildCollectionTiles`:

| Przypadek | Oczekiwanie |
|---|---|
| różne `sort_order` | kolejność rosnąco |
| równe `sort_order` | remis rozstrzyga `label` |
| `show_on_home = false` | kolekcja pominięta |
| kolekcja bez aktywnych produktów | pominięta |
| kolekcja z 20 produktami | `thumbnails.length === 4`, `productCount === 20` (regresja na dzisiejszy błąd „max 4") |
| produkt bez zdjęcia | nie zajmuje miejsca w `thumbnails`, ale liczy się do `productCount` |
| produkt `is_active = false` | nie liczy się i nie daje zdjęcia |

**E2E (Playwright)**, wzór `fabric-group-cards.spec.ts` — `home-collections.spec.ts`:

- przy >6 kolekcjach widocznych jest dokładnie 6 kafelków;
- przycisk pokazuje „+N" zgodne z liczbą ukrytych;
- po kliknięciu widoczne są wszystkie, przycisk zmienia się w „Zwiń";
- **ukryty kontener ma `display: none`** przed kliknięciem.

Ta ostatnia asercja pilnuje rzeczy nieoczywistej: zamiana `hidden` na animowaną przezroczystość jest wizualnie niewykrywalna, a niszczy cały zysk wydajnościowy. Bez testu nikt tego nie zauważy.

Uruchamiać z `E2E_BASE_URL=http://localhost:3000` — domyślnie e2e celuje w produkcję.

**Nie testujemy** podziału 6/reszta w komponencie: testy jednostkowe chodzą w środowisku node i nie renderują komponentów, a `slice(0, 6)` nie jest miejscem, w którym rodzą się błędy. Pokrywa to e2e.

**Weryfikacja migracji przez MCP** po wgraniu: kolumny istnieją, backfill dał każdej kolekcji inny `sort_order`, `reorder_collections` jest wywoływalna.

## Kolejność wdrożenia

1. Migracja 66 (kolumny + backfill + RPC) — addytywna, nic nie psuje starego kodu.
2. Warstwa danych + testy jednostkowe.
3. Front (przeniesienie kafelka + zwijanie).
4. Panel (przeciąganie + przełącznik + kreska).
5. E2E.

Kroki 2–4 mogą wejść jednym PR-em; migracja musi być zaaplikowana **przed** merge'em, bo nowy kod czyta `sort_order` i `show_on_home`. Auto-apply na tym projekcie nie działa — migrację wgrywa się ręcznie przez Supabase MCP.
