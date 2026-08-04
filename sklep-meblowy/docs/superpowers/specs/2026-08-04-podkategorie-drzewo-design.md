# Podkategorie — drzewo kategorii bez limitu głębokości — projekt

**Data:** 2026-08-04
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

Kategorie mają dziś **dokładnie dwa poziomy i oba są zaszyte w schemacie**: tabela
`category_groups` (pozycja w górnym pasku, np. „SOFY", „ŁÓŻKA") i tabela
`categories` (rozwijana lista pod nią, np. „Sofa 2-osobowa"). Produkt przypina się
do drugiego poziomu. Trzeciego poziomu nie da się dodać z panelu — trzeba migracji.

Na produkcji stoi **8 pozycji paska i 16 kategorii**. Pasek zawija się do drugiego
rzędu i każda nowa pozycja go poszerza. Właściciel chce móc schować całą ofertę
meblową pod jedną pozycją („MEBLE") z nagłówkami w rozwiniętym panelu — ale
**bez zaszywania tej pozycji w kodzie**: struktura, nazwy i kolejność na każdym
poziomie mają być danymi, którymi Ola zarządza sama.

## Decyzje właściciela

| Pytanie | Decyzja |
|---|---|
| Głębokość drzewa | **Bez limitu.** Jedna tabela z polem „rodzic", każdy węzeł może mieć dzieci |
| Gdzie wolno przypiąć produkt | **Do dowolnego węzła.** Listing węzła zbiera produkty z niego i z całego poddrzewa |
| Ile poziomów pokazuje megamenu | **Trzy** (pasek → nagłówek → link). Głębsze wyłącznie na stronie kategorii |
| Jak Ola ustawia układ | **Przeciąganie wśród rodzeństwa** (wzorem `/admin/kolekcje`) + pole „Rodzic" do przenoszenia gałęzi |
| Czy migracja tworzy „MEBLE" | **Nie.** Migracja zachowuje dzisiejszy układ 1:1; „MEBLE" i całą resztę Ola układa w panelu |
| Kolizje slugów | Kategoria produktowa ustępuje slugu węzłowi-rodzicowi (szczegóły niżej) |

Dlaczego megamenu zatrzymuje się na trzecim poziomie: panel rozwijany ma skończoną
wysokość, a wcięcia na wąskich ekranach zjadają szerokość. Przy drzewie bez limitu
głębokości Ola mogłaby sobie zepsuć nawigację i nie zauważyć tego, bo w panelu
admina drzewo wygląda dobrze. Poziom czwarty i dalsze są dostępne **paskiem dzieci
nad produktami** na stronie kategorii — to jest ich jedyna droga do klienta, więc
ten pasek jest wymaganiem, nie ozdobą.

Dlaczego produkt może wisieć na dowolnym węźle, a nie tylko na liściu: alternatywa
znaczy, że dodanie podkategorii pod kategorię z produktami wymaga najpierw
przeniesienia tych produktów. Ola dostałaby komunikat „najpierw przenieś 7
produktów" w momencie, w którym chce tylko doprecyzować podział.

## Zakres

W zakresie: migracja 68, nowy czysty moduł drzewa, przepisanie nawigacji (pasek,
mobile, stopka), listingu `/sklep` z filtrami i okruszkami, panelu
`/admin/kategorie`, wyboru kategorii w formularzach produktu, testy jednostkowe
i e2e, aktualizacja `docs/jak-dodac-kategorie.md`.

Trzy rzeczy naprawiane po drodze, bo siedzą w tym samym kodzie i zostawienie ich
byłoby zostawieniem znanych błędów:

1. **Kategoria `pufy` nazywa się „Narożnik w kształcie U", a `materace` to
   „Materace kieszeniowe"** — slug rozjechany z etykietą po jakiejś ręcznej
   zmianie w panelu. Kolizja z nazwami grup wymusza tu decyzję, więc porządkujemy
   przy okazji.
2. **Usunięcie kategorii sprawdza tylko produkty, nie dzieci** — po dodaniu
   poziomów brak tego warunku zostawiałby sieroty.
3. **Ukrycie węzła nie ukrywa poddrzewa** — bez tego wyłączenie „MEBLI" zostawia
   ich podkategorie w menu jako pozycje najwyższego poziomu.

Poza zakresem: strony kategorii pod własnym adresem (`/kategoria/<slug>` zamiast
`/sklep?kategoria=`), obrazki w megamenu, przenoszenie produktów hurtem między
kategoriami, zmiana wyglądu paska poza tym, co wymusza trzeci poziom.

## Architektura

### 1. Baza — migracja 68 (expand-first)

Jedno drzewo w jednej tabeli. `categories` dostaje `parent_id`, a wiersze
z `category_groups` wjeżdżają do `categories` jako węzły bez rodzica.

```sql
-- 1. Pole rodzica. on delete restrict — jak products_category_fk; usunięcie
--    węzła z dziećmi ma być zablokowane przez bazę, nie tylko przez UI.
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete restrict;

create index if not exists idx_categories_parent on public.categories (parent_id);

-- 2. Węzeł najwyższego poziomu nie ma grupy, więc group_id przestaje być wymagane.
alter table public.categories alter column group_id drop not null;

-- 3. KOLIZJE SLUGÓW — muszą pójść PRZED wstawieniem grup, bo slug jest unikalny
--    w całej tabeli. products.category jedzie samo (FK ma on update cascade).
--    Warunek `where slug = ...` jest sam z siebie idempotentny.
update public.categories set slug = 'materace-kieszeniowe' where slug = 'materace';
update public.categories set slug = 'naroznik-u'           where slug = 'pufy';

-- cross_sell_categories to TABLICA slugów (text[] not null default '{}',
-- migracja 16) — żaden FK jej nie pilnuje, więc bez tego dobór materaca do
-- łóżka przestaje proponować kieszeniowe i nie zgłasza błędu: sekcja po
-- prostu robi się pusta.
update public.categories
set cross_sell_categories = array_replace(cross_sell_categories, 'materace', 'materace-kieszeniowe')
where 'materace' = any(cross_sell_categories);
update public.categories
set cross_sell_categories = array_replace(cross_sell_categories, 'pufy', 'naroznik-u')
where 'pufy' = any(cross_sell_categories);

-- 4+5. Grupy → węzły najwyższego poziomu i przypięcie do nich kategorii.
--      GUARD wzorem migracji 66: projekt aplikuje migracje ręcznie i ma
--      niepełny rejestr, więc plik może zostać odpalony ponownie. Backfill
--      działa tylko, gdy żaden węzeł nie ma jeszcze rodzica — inaczej drugie
--      odpalenie przestawiłoby układ zrobiony w panelu z powrotem na dzisiejszy.
do $$
begin
  if exists (select 1 from public.categories where parent_id is not null) then
    raise notice 'Drzewo kategorii jest juz zbudowane — backfill pominiety';
    return;
  end if;

  -- Grupa, której slug pokrywa się ze slugiem istniejącej kategorii, NIE tworzy
  -- węzła. Dziś to `schodki-dla-pupila`: grupa i jej jedyna kategoria mają ten
  -- sam slug i tę samą nazwę, czyli nagłówek-atrapa. Kategoria zostaje na
  -- najwyższym poziomie, atrapa znika.
  -- needs_translation/translated_at jadą razem (obie tabele mają te kolumny od
  -- migracji 29) — inaczej przetłumaczona grupa wraca jako „do tłumaczenia".
  insert into public.categories
    (slug, label, label_de, parent_id, sort_order, active, needs_translation, translated_at)
  select g.slug, g.label, g.label_de, null, g.sort_order, g.active,
         g.needs_translation, g.translated_at
  from public.category_groups g
  where not exists (select 1 from public.categories c where c.slug = g.slug);

  -- Kategoria, której grupa nie dostała węzła, zostaje z parent_id = null.
  update public.categories c
  set parent_id = p.id
  from public.category_groups g
  join public.categories p on p.slug = g.slug and p.parent_id is null
  where c.group_id = g.id and c.id <> p.id;
end $$;

-- 6. Brak cykli. Bez tego pole „Rodzic" w panelu jednym zapisem odcina gałąź
--    od drzewa i wiesza każdy przebieg po ścieżce w górę.
create or replace function public.categories_no_cycle()
returns trigger language plpgsql as $$
declare
  cur  uuid := new.parent_id;
  hops int  := 0;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'Kategoria nie moze byc swoim wlasnym rodzicem';
  end if;
  while cur is not null loop
    if cur = new.id then
      raise exception 'Cykl w drzewie kategorii';
    end if;
    select parent_id into cur from public.categories where id = cur;
    hops := hops + 1;
    if hops > 50 then
      raise exception 'Drzewo kategorii zbyt glebokie (mozliwy cykl)';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_categories_no_cycle on public.categories;
create trigger trg_categories_no_cycle
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_no_cycle();

-- 7. Atomowy reorder wśród rodzeństwa — 1:1 wzorem reorder_collections (66).
--    Pętla UPDATE po jednym wierszu przy padzie w połowie zostawia rodzeństwo
--    z pomieszanymi numerami.
create or replace function public.reorder_categories(p_parent uuid, p_ids uuid[])
returns void language sql as $$
  update public.categories c
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id
     and c.parent_id is not distinct from p_parent;
$$;

revoke execute on function public.reorder_categories(uuid, uuid[]) from public;
grant  execute on function public.reorder_categories(uuid, uuid[]) to service_role;
```

`is not distinct from` w `reorder_categories` jest nośne: dla najwyższego poziomu
`p_parent` jest `null`, a `c.parent_id = null` nigdy nie jest prawdą. Bez tego
przeciąganie na najwyższym poziomie zapisywałoby ciszę.

Klauzula `and c.parent_id is not distinct from p_parent` jest jednocześnie
zabezpieczeniem: żądanie z pomieszanymi id z różnych gałęzi przestawi tylko te,
które faktycznie należą do wskazanego rodzica.

**`group_id` i `category_groups` zostają w bazie.** Kod przestaje je czytać, ale
kolumna i tabela stoją nietknięte, żeby cofnięcie deployu nie wywaliło sklepu
(model expand-first — ten sam, którym poszła migracja 67). Sprzątanie to osobna
migracja 69, do odpalenia, gdy nowa wersja posiedzi na produkcji.

RLS bez zmian: `categories: public read` i `categories: admin write` obejmują
`parent_id` bez dopisywania polityk.

### 2. Czysty moduł `app/_lib/category-tree.ts`

Cała logika drzewa mieszka w jednym module bez dostępu do bazy — wzorem
`collection-tiles.ts` i `sample-groups.ts`. Wejściem jest płaska lista węzłów,
wyjściem gotowe projekcje. Testowalny bez Supabase, w całości.

| Funkcja | Odpowiedzialność |
|---|---|
| `buildTree(nodes)` | płaska lista → las; sortuje rodzeństwo (`sort_order`, potem `id` dla determinizmu); węzły-sieroty (rodzic nie istnieje) traktuje jako korzenie |
| `descendantSlugs(nodes, slug)` | slug węzła → jego slug + slugi całego poddrzewa; odporne na cykl (zbiór odwiedzonych) |
| `pathTo(nodes, slug)` | ścieżka od korzenia do węzła — okruszki i nagłówek |
| `menuProjection(nodes, maxDepth = 3)` | projekcja dla paska: korzenie → nagłówki → linki; głębsze poziomy odcięte |
| `effectiveActive(nodes)` | zbiór slugów widocznych: węzeł jest widoczny tylko gdy on i **wszyscy jego przodkowie** są aktywni |
| `flattenForSelect(nodes)` | `optgroup` = korzeń, opcje = wszyscy potomkowie z wcięciem wg głębokości |
| `allowedParents(nodes, id)` | lista dla pola „Rodzic": wszystko poza samym węzłem i jego potomkami |

`categories.ts` zostaje tym, czym jest — fetch plus `unstable_cache` plus
lokalizacja — i nie dostaje ani grama logiki drzewa. Zmiany w nim:

- `CategoryDef` traci `group_id`/`group_slug`, dostaje `parent_id`/`parent_slug`.
  Typ `Section` i funkcje `getSections`, `getAllSections`, `getCategoriesBySection`,
  `groupCategoriesForSelect` odchodzą. To celowo psuje kompilację u każdego
  konsumenta — lista miejsc do przepisania powstaje z `tsc`, nie z grepowania.
- `getCategories()` filtruje **efektywną** widoczność (`effectiveActive`), nie samo
  `active`. Inaczej ukrycie „MEBLI" zostawia ich dzieci w menu jako korzenie.
- `getAllCategories()` (panel) dalej zwraca wszystko, bez filtra.

**Widoczność dotyczy nawigacji i filtrów, nie dostępności produktu.** Tak jest
dziś: ukrycie kategorii chowa ją z menu, a produkty zostają w `/sklep` i pod
własnymi adresami. Nie zmieniamy tego — i implementacja nie ma tego „naprawiać".

### 3. URL-e i filtrowanie

`?kategoria=<slug>` działa dla **każdego** węzła i pokazuje produkty z niego oraz
z całego poddrzewa. Jeden parametr zastępuje dzisiejszy podział.

`?sekcja=<slug>` zostaje aliasem na wymarcie: gdy `kategoria` nie jest ustawiona,
bierzemy `sekcja` i rozwiązujemy ją w tym samym drzewie. Slugi węzłów-rodziców nie
zmieniają się w migracji, więc `?sekcja=salon`, `?sekcja=sofy`, `?sekcja=sypialnia`
i pozostałe żyją dalej **bez mapy aliasów**. Menu, stopka, filtry i sitemap
linkują wyłącznie `?kategoria=`; kanonikal `/sklep` też.

`getProducts` upraszcza się: dziś ma osobną gałąź `category` (dokładne dopasowanie)
i `sectionSlug` (lookup po `group_slug` + `.in`). Po zmianie jest jedna gałąź —
`descendantSlugs` daje listę, do bazy idzie `.in("category", slugi)`. Zbieranie
poddrzewa dzieje się w kodzie, na już pobranej liście (po migracji 23 węzły: 16
kategorii + 8 grup minus scalone „schodki-dla-pupila"; jeden
`getData()`), bez rekurencyjnego SQL. Węzeł bez produktów w całym poddrzewie
zwraca pustkę tą samą ścieżką co dziś.

Sitemap dostaje wpis dla każdego węzła (dziś ma tylko liście, a sekcji nie miał
wcale). Listing rodzica jest nadzbiorem listingów dzieci — to zwykły układ
kategorii w sklepie, kanonikale są rozłączne per węzeł, więc nie robimy z tym nic
poza świadomym dopuszczeniem.

### 4. Menu, stopka, listing

**`NavStrip`** — poziom 1 to pozycja paska (link do listingu + chevron), a panel
rozwijany zawiera „Wszystkie w X" i kolumny: nagłówek kolumny to poziom 2
(klikalny, prowadzi do swojego listingu), pod nim poziom 3. Panel dostaje siatkę
`auto-fit` do czterech kolumn i zawija się niżej. Nadal **zero JS** — hover
i `focus-within`, jak dziś: brak przeskoku po hydracji i brak CLS.

**`MobileMenu`** — akordeon do trzech poziomów (dziś dwa).

**`Footer`** — kolumna to korzeń, w niej poziom 2, bez wnuków. Inaczej stopka
puchnie o kilkanaście linków przy pierwszym głębszym drzewie.

**`/sklep`** — nagłówek i okruszki ze ścieżki (`pathTo`), licznik produktów liczy
poddrzewo, a nad produktami stoi **pasek dzieci węzła**. To jedyna droga klienta
do poziomu 4+, więc jest częścią wymagania. Nadkreślenie („KATEGORIA") zostaje
z dzisiejszą kolejnością pierwszeństwa: kolekcja → wyszukiwanie → kategoria.

**`FilterBar`** — dzisiejsza płaska projekcja sekcja→kategorie ustępuje drzewu do
trzech poziomów z wcięciami; wybór węzła filtruje poddrzewem.

**Wybór kategorii w produkcie** (`/admin/produkty/nowy`, `/admin/produkty/[id]`) —
HTML nie zna zagnieżdżonych `optgroup`, więc `groupCategoriesForSelect` ustępuje
`flattenForSelect`: `optgroup` to korzeń, a opcje to wszyscy potomkowie z wcięciem
wg głębokości.

### 5. Panel `/admin/kategorie`

Zamiast „grupy, a w nich kategorie" jedna lista-drzewo z wcięciami:

```
⣿ MEBLE                              0 własnych · 24 w poddrzewie   [edytuj] [usuń]
   ⣿ Narożniki                       0 własnych · 10 w poddrzewie   [edytuj] [usuń]
      ⣿ Narożnik modułowy            3 własne                       [edytuj] [usuń]
      ⣿ Narożnik w kształcie L       7 własnych                     [edytuj] [usuń]
   ⣿ Sofy                            0 własnych ·  8 w poddrzewie   [edytuj] [usuń]
```

- **Przeciąganie chwytem wśród rodzeństwa** — dnd-kit i `reorder_categories`,
  dokładnie tym wzorcem co `/admin/kolekcje` (dnd-kit jest już w projekcie).
- **Pole „Rodzic"** w formularzu edycji, z listą z `allowedParents` (bez samego
  węzła i bez jego potomków) plus pozycja „— najwyższy poziom —".
- **Licznik pokazuje jedno i drugie**: własne i z poddrzewa. Sam licznik poddrzewa
  ukrywałby fakt, że rodzic nie ma nic swojego.
- **Usunięcie zablokowane, gdy węzeł ma produkty albo dzieci**, z komunikatem co
  trzeba przenieść (dziś jest tylko warunek na produkty).
- **Przy „Pokazuj w sklepie" stoi ostrzeżenie, że odznaczenie chowa całe
  poddrzewo.** Bez tego pierwsze odznaczenie „MEBLI" wygasza nawigację całego
  sklepu i nic nie tłumaczy dlaczego.

Akcje serwerowe walidują to samo, co trigger w bazie (rodzic ≠ węzeł, rodzic nie
jest potomkiem), żeby klient dostawał komunikat po polsku, a nie surowy błąd
Postgresa. Po każdej mutacji `revalidateTag("categories")` — jak dziś.

### 6. Wersja niemiecka

`GROUP_LABEL_DE` i `CATEGORY_LABEL_DE` scalają się w jedną mapę po slugu — dwie
tabele przestały istnieć, więc dwie mapy nie mają sensu. Scalenie **nie jest
mechaniczne**, bo obie mapy zawierają dziś śmieci i jedną kolizję:

- `sofy` jest w obu mapach z tą samą wartością („Sofas") — bez konfliktu.
- `fotele` jest **żywym slugiem grupy** (Fotele), a `CATEGORY_LABEL_DE` tłumaczy
  go jako „2-Sitzer-Sofa". Wartość jest zła i mechaniczne scalenie przeniosłoby ją
  na węzeł Fotele.
- Klucze `narozniki`, `lozka`, `lozko-tapicerowane` (żywy slug to
  `lozka-tapicerowane`), `materace-sprezynowe`, `inne`, `dostepne-od-reki` nie
  odpowiadają żadnemu slugowi w bazie — lecą.
- `materace` przechodzi na `materace-kieszeniowe`, ale jego wartość
  („Topper-Matratzen") opisuje toppery, nie materace kieszeniowe.

Zakres tej pracy to **struktura mapy, nie treść tłumaczeń**: scalamy, usuwamy
martwe klucze, przenosimy dwa przemianowane slugi, a `fotele` i
`materace-kieszeniowe` zostawiamy **bez wpisu** (fallback do PL) zamiast wstawiać
zgadnięte tłumaczenie. `/de` jest zamrożone flagą `DE_ENABLED`, więc nic to teraz
nie psuje, a przegląd wartości DE ląduje w follow-upach do odmrożenia niemieckiej
wersji.

## Stan po wdrożeniu

Sklep wygląda **dokładnie jak dziś**: te same 8 pozycji paska, te same kategorie
pod nimi, ta sama kolejność. Zmieniają się dwie rzeczy widoczne dla klienta:
pozycja „Schodki dla pupila" przestaje mieć rozwijaną listę z jedną, identycznie
nazwaną pozycją, a linki w menu przechodzą na `?kategoria=`. „MEBLE" i cały nowy
układ powstają dopiero wtedy, gdy Ola je zrobi w panelu.

## Obsługa błędów i przypadki brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Cykl w drzewie | trigger w bazie odrzuca zapis, akcja serwerowa mówi to po polsku |
| Sierota (rodzic usunięty poza aplikacją) | traktowana jak korzeń w panelu, **nie renderuje się w menu**, jej `?kategoria=` dalej działa — produktów nie chowamy po cichu |
| Ukryty przodek | całe poddrzewo znika z menu, filtrów i sitemapy; produkty zostają dostępne |
| Nieznany slug w `?kategoria=` | pusty listing, jak dziś — nie 404 i nie 500 |
| Awaria odczytu kategorii | jak dziś: nawigacja pusta, strona stoi (bez zmian w `getData()`) |
| Drzewo głębsze niż 3 poziomy | menu odcina, pasek dzieci na listingu prowadzi dalej |
| Przeciąganie po zmianie drzewa w innej zakładce | `reorder_categories` przestawia tylko id należące do wskazanego rodzica; reszta żądania jest ignorowana, a nie zapisywana w złe miejsce |

## Testy

**Jednostkowe (vitest) — `category-tree.test.ts`:** budowa drzewa i sortowanie
rodzeństwa, `descendantSlugs` (liść, rodzic, korzeń, cykl, sierota), `pathTo`,
`menuProjection` (trzeci poziom wchodzi, czwarty odpada), `effectiveActive`
(ukryty przodek chowa dziecko), `flattenForSelect` (wcięcia wg głębokości),
`allowedParents` (brak siebie i potomków).

**Warstwa danych:** `getProducts` filtruje węzłem po poddrzewie; alias `?sekcja=`
daje ten sam wynik co `?kategoria=`; `getCategories` filtruje efektywną
widoczność.

**Migracja:** idempotentność (drugie odpalenie nie rusza układu — guard wzorem 66),
scalenie `schodki-dla-pupila`, przepisanie obu slugów wraz z
`cross_sell_categories`.

**E2E (Playwright):** megamenu pokazuje trzeci poziom i linkuje `?kategoria=`;
`product-category-save.spec.ts` zostaje zielony; przeciąganie w panelu zapisuje
kolejność (wzorem e2e kolekcji).

## Ryzyka i świadome kompromisy

1. **`/sklep?kategoria=pufy` zmienia znaczenie.** Dziś to narożniki w kształcie U,
   po migracji — pufy (bo slug przechodzi na węzeł-rodzic PUFY). Jeden
   zaindeksowany URL, dane i tak były sprzeczne z etykietą. Świadomie przyjęte.
2. **`/sklep?kategoria=materace` poszerza się** z „Materace kieszeniowe" do całej
   grupy Materace. Nadzbiór, nie 404 — Google dostaje sensowną stronę.
3. **`cross_sell_categories` nie ma FK.** Jeśli przepisanie slugów w migracji
   zawiedzie, dobór materaca do łóżka cichnie bez błędu. Dlatego jest to osobny,
   sprawdzalny krok migracji, a nie skutek uboczny kaskady.
4. **Ola może zbudować drzewo, którego menu nie pokaże w całości** (poziom 4+).
   Zamierzone: pasek dzieci na listingu jest wtedy jedyną drogą, więc musi
   powstać razem z resztą, nie „później".
5. **Migracja 68 aplikowana ręcznie.** Automat w tym projekcie nie odpala (2/2
   razy przy migracjach 57–58) — po merge trzeba sprawdzić `list_tables`
   i zaaplikować przez MCP, jak przy 66 i 67.
