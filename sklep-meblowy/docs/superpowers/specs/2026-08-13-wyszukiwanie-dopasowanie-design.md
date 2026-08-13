# Wyszukiwanie mebli — dopasowanie odporne na ogonki i odmianę — projekt

**Data:** 2026-08-13
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

Klient, który wpisuje frazę tak, jak się normalnie pisze po polsku, dostaje
**zero wyników** — mimo że w katalogu są setki pasujących produktów.

Wyszukiwanie opiera się na kolumnie generowanej `products.search_key`
(migracja 65), która trzyma `lower(name + description)` z wyciętymi tagami HTML
i **wszystkimi** spacjami, ale **z zachowanymi polskimi znakami**. Frazę tniemy
na słowa (`searchTokens`) i każde dopasowujemy przez `ILIKE %słowo%`; wiele
`.ilike()` na tej samej kolumnie PostgREST ANDuje.

Pomiary na bazie produkcyjnej, 2026-08-13, 357 produktów:

| Co wpisuje klient | Trafień dziś | Ile produktów faktycznie pasuje |
|---|---|---|
| `lozko` (bez ogonków) | **0** | 177 |
| `naroznik` (bez ogonków) | **0** | 40 |
| `rozkladana` (bez ogonków) | **0** | 7 |
| `narożniki` (liczba mnoga) | **0** | 40 |
| `fotele` (liczba mnoga) | 1 | 8 |
| `kanapa` (inne słowo na sofę) | **0** | 39 sof |

Trzy niezależne przyczyny:

1. **Brak składania diakrytyków.** `search_key` zachowuje `ą ć ę ł ń ó ś ź ż`,
   więc fraza bez ogonków nie ma jak trafić. Na telefonie i przy szybkim
   pisaniu brak ogonków jest normą, nie wyjątkiem.
2. **Brak tolerancji na odmianę.** Dopasowanie jest podciągiem, więc forma
   krótsza łapie dłuższą („narożnik" trafia w „narożnika"), ale **dłuższa nie
   łapie krótszej** — „narożniki" nie jest podciągiem niczego w katalogu.
3. **Brak synonimów.** Katalog mówi „sofa", klient mówi „kanapa", „wersalka",
   „tapczan".

Dodatkowo: **podpowiedzi nie są sortowane po trafności.**
`/api/search/suggest` bierze 6 pierwszych po `created_at desc`. Ranking
„nazwa przed opisem" (`rankByNameMatch`) istnieje i jest używany na `/sklep`
(`products.ts:241`), ale w podpowiedziach nie — wpisując „sofa" klient dostaje
6 najnowszych, nie 6 najtrafniejszych.

### Co obaliły pomiary

**Rozbudowa indeksu o kolejne pola nie ma sensu.** Sprawdzone:

- **332 z 357 produktów (93%) nie ma opisu** — `search_key` to de facto sama
  nazwa. To nie problem: nazwy są bogate i zawierają typ, model oraz cechy
  („Narożnik Alva L – nowoczesny narożnik do salonu").
- `color` i `material` wypełnione na **7 produktach z 357**.
- `features` (259 wypełnień) to wyłącznie wymiary siedziska („Wysokość
  siedziska: 44 cm") — indeksowanie dodałoby szumu, nie trafności.

Wniosek: **problem jest w dopasowaniu, nie w tym, co indeksujemy.**

## Zakres

W tej rundzie: **składanie diakrytyków, tolerancja na odmianę, ranking
podpowiedzi.** Decyzja właściciela z 2026-08-13.

Świadomie **poza zakresem** (osobne rundy):

- migracja sprzątająca stare kolumny `search_key` / `search_key_de` i ich
  indeksy — dopiero po potwierdzeniu nowych na produkcji;

- słownik synonimów (`kanapa` → `sofa`) — wymaga decyzji, kto go utrzymuje:
  kod czy pole „słowa kluczowe" w panelu;
- wyjście ze stanu „zero wyników" (dziś ślepy zaułek: „Brak produktów.
  Spróbuj zmienić filtry lub frazę wyszukiwania.");
- logowanie fraz wyszukiwania pod dobór synonimów na danych;
- deduplikacja rodzin produktów w podpowiedziach (fraza „alva" zwraca sześć
  niemal identycznych wariantów).

## Architektura

Trzy pliki i jedna migracja. **Zero zmian w wyglądzie.**

| Plik | Zmiana |
|---|---|
| `supabase/migrations/73_search_key_fold.sql` | odtwarza `search_key` i `search_key_de` ze składaniem znaków |
| `app/_lib/search-filter.ts` | nowe: `foldDiacritics`, `stemToken`, `searchKeyTokens`; poprawka `rankByNameMatch` |
| `app/api/search/suggest/route.ts` | podpowiedzi po trafności zamiast po dacie |

Numer 73 to kolejny wolny — najwyższy w `supabase/migrations/` na 2026-08-13
to 72. Jeśli w chwili implementacji na `main` będzie już 73, wziąć następny.

### Dlaczego składanie wchodzi w warstwę tokenizacji

`searchTokens()` jest **jednym wspólnym tokenizerem** dla wszystkich trzech
konsumentów `search_key`:

| Konsument | Miejsce |
|---|---|
| storefront `/sklep` | `app/_lib/products.ts:156` |
| podpowiedzi w headerze | `app/api/search/suggest/route.ts:29` |
| wyszukiwarka produktów w panelu | `app/admin/produkty/actions.ts:756` |

Składanie znaków musi zachodzić **po obu stronach dopasowania**. Gdyby weszło
tylko do bazy, wszystkie trzy zapytania przestałyby trafiać (token „łóżko"
kontra złożony klucz „lozko"), czyli **wyszukiwanie w panelu admina by
padło**. Wejście w tokenizację daje jedną zmianę i trzy spójne miejsca.

## Nowe jednostki w `search-filter.ts`

`searchTokens()` **zostaje nietknięty**. To przetestowany prymityw sanityzacji
(ochrona przed injection w PostgREST `.or()`, audyt MEDIUM 2026-06-11) i jego
kontrakt jest źródłem gwarancji bezpieczeństwa. Nowa funkcjonalność siada obok.

### `foldDiacritics(value: string): string`

Składa polskie znaki diakrytyczne na ASCII, jeden do jednego:

```
ą→a  ć→c  ę→e  ł→l  ń→n  ó→o  ś→s  ź→z  ż→z
```

Dla ścieżki DE dodatkowo `ä→a ö→o ü→u` oraz `ß→ss` (dwuznak, więc osobne
podstawienie, nie mapa 1:1).

Wejście jest już małoliterowe (`sanitizeSearchTerm` nie zmienia wielkości, więc
funkcja robi `toLowerCase()` sama, żeby nie zależeć od kolejności wywołań).

**Mapowanie musi być identyczne z `translate()` w migracji.** To jest główne
ryzyko projektu, opisane w sekcji „Ryzyka".

### `stemToken(token: string): string`

Obcina **jedną** końcówkę fleksyjną, jeśli rdzeń zostaje **co najmniej 3
znaki**. Lista końcówek w formie **już złożonej** (po `foldDiacritics`),
dopasowywana od najdłuższej:

```
ami, ach, owi, iem, ow, om, ie, em, y, i, e, a, u, o
```

Przykłady:

| Wejście | Po złożeniu | Po stemowaniu | Trafia w |
|---|---|---|---|
| `narożniki` | `narozniki` | `naroznik` | `naroznikalval…` |
| `łóżka` | `lozka` | `lozk` | `lozkokontynentalne…` |
| `fotele` | `fotele` | `fotel` | `fotelalva…` |
| `sofy` | `sofy` | `sof` | `sofaalva…` |
| `materace` | `materace` | `materac` | `materackieszeniowy…` |

Stemowanie działa **tylko na frazie**, nigdy w bazie. Baza trzyma pełne formy,
a dopasowanie podciągiem samo obsługuje formy dłuższe od rdzenia.

**Decyzja:** rdzeń minimum **3** znaki, nie 4. Przy progu 4 fraza „sofy"
(rdzeń „sof") nie zostałaby zestemowana i dalej dawałaby zero. Świadomie
przyjmujemy trochę nadmiarowych trafień w zamian za tę klasę zapytań.

### `searchKeyTokens(raw: string): string[]`

Potok używany przez wszystkie trzy konsumenty `search_key`:

```
searchTokens(raw) → foldDiacritics każdego tokenu → stemToken każdego tokenu
```

Zwraca tokeny gotowe do `ILIKE %token%` przeciwko złożonej kolumnie. Zachowuje
limit `MAX_SEARCH_TOKENS` (10) z `searchTokens`. Puste wejście → `[]`.

Po stemowaniu mogą powstać duplikaty (np. „sofa sofy" → `["sof","sof"]`) —
potok je odfiltrowuje, żeby nie generować identycznych warunków `ILIKE`.

### Poprawka `rankByNameMatch`

Funkcja porównuje tokeny frazy z **nazwą produktu**, która diakrytyki ma.
Po przejściu na złożone i zestemowane tokeny musi składać także nazwę — inaczej
żadna nazwa nie dopasuje się do tokenu „lozk" i **cały ranking cicho
zdegraduje się** do „wszystko potraktowane jak trafienie z opisu".

Zmiana: wewnętrznie użyć `searchKeyTokens` zamiast `searchTokens`, a klucz
nazwy budować jako `foldDiacritics(name)` z usuniętymi spacjami — spójnie
z tym, co robi kolumna w bazie.

## Migracja

### Kolumny dodatkowe, nie podmiana (korekta z 2026-08-13, etap planowania)

Migracja **dodaje** `search_key_fold` i `search_key_fold_de` obok istniejących
`search_key` / `search_key_de`, zamiast podmieniać te drugie.

Powód jest wdrożeniowy, nie estetyczny. Dopasowanie wymaga złożenia znaków po
**obu** stronach. Gdyby istniejąca kolumna zmieniła znaczenie pod działającym
kodem, powstałoby okno, w którym jedna strona jest złożona, a druga nie —
a wtedy **każde** zapytanie zwraca zero wyników, nie tylko te bez ogonków.
Kolejność deployu nie ratuje: kod przed migracją to złożone tokeny kontra
niezłożona kolumna, migracja przed kodem to sytuacja odwrotna. Migracje na tym
projekcie idą ręcznie, więc okno liczyłoby się w minutach żywego sklepu.

Wariant dodatkowy jest **neutralny dla starego kodu** — stara kolumna dalej
działa, dopóki nie przełączymy zapytań. Migracja może pójść przed deployem,
w dowolnym momencie, bez okna awarii. Jest to też warunek testowania lokalnie:
`npm start` łączy się z **tą samą bazą produkcyjną**, więc bez kolumny w bazie
nie da się sprawdzić zmiany przed merge.

Koszt: dwie dodatkowe kolumny generowane i dwa indeksy GIN na 357 wierszach —
nieistotny. Stare kolumny zostają jako martwe do osobnej migracji sprzątającej,
**po** potwierdzeniu, że nowe działają na produkcji.

Zależności sprawdzone na produkcji 2026-08-13 — poza dwoma indeksami trgm
(`products_search_key_trgm`, `products_search_key_de_trgm`) **zero widoków
i zero polityk RLS** odwołuje się do tych kolumn. Ustalenie zostaje
udokumentowane, bo będzie potrzebne przy migracji sprzątającej.

Kształt migracji:

1. `add column if not exists search_key_fold` jako
   `generated always as (...) stored` ze składaniem znaków,
2. to samo dla `search_key_fold_de`,
3. `create index if not exists` dwa indeksy GIN trgm na nowych kolumnach.

W pełni idempotentna, bez `drop`.

Wyrażenie PL:

```sql
translate(
  regexp_replace(
    regexp_replace(
      lower(coalesce(name,'') || ' ' || coalesce(description,'')),
      '<[^>]*>', ' ', 'g'),
    '\s+', '', 'g'),
  'ąćęłńóśźż', 'acelnoszz'
)
```

Wyrażenie DE: to samo na `name_de`/`description_de`, dodatkowo
`replace(…, 'ß', 'ss')` i `translate(…, 'äöü', 'aou')`.

`translate` i `replace` są `IMMUTABLE`, więc wolno ich użyć w kolumnie
generowanej. `unaccent` **nie jest** immutable i dlatego nie wchodzi w grę bez
opakowywania we własną funkcję — `translate` załatwia sprawę bez tego długu.

357 wierszy → przebudowa kolumn i indeksów w milisekundach. Migracja jest
bezpieczna do ponownego uruchomienia (kolumny są pochodne, `drop`+`add`
odtwarza je z aktualnych danych; żadne dane źródłowe nie giną).

**`/de` jest zamrożone** (flaga `DE_ENABLED`), ale kolumna DE zostaje złożona
tym samym ruchem — jedna linia, a nie chcemy zostawiać niespójności, która
odezwie się przy odmrażaniu.

**Migracje na tym projekcie nie aplikują się automatycznie.** Po merge trzeba
ją puścić ręcznie (MCP `apply_migration`) i potwierdzić przez
`list_migrations` oraz kontrolne zapytanie z sekcji „Weryfikacja".

## Podpowiedzi po trafności

`app/api/search/suggest/route.ts` dziś: `.order("created_at", desc).limit(6)`.

Po zmianie: pobrać szerszy zestaw dopasowań (**30**), przepuścić przez
istniejące `rankByNameMatch` i obciąć do 6. Sortowanie po `created_at`
zostaje jako rozstrzygnięcie remisów wewnątrz grup — `rankByNameMatch` jest
stabilny, więc kolejność z bazy przetrwa w obrębie każdej grupy.

Koszt: 30 wierszy zamiast 6 przy katalogu 357 pozycji — pomijalny. Zero nowego
kodu rankującego, wyłącznie reuse.

## Weryfikacja

### Testy jednostkowe

Rozszerzyć `app/_lib/__tests__/search-filter.test.ts` (vitest). Istniejące
testy `sanitizeSearchTerm`, `searchTokens` i `escapeIlike` **muszą zostać
zielone bez zmian** — to dowód, że kontrakt prymitywu się nie ruszył.

Testy `rankByNameMatch` to inna sprawa: ta funkcja świadomie zmienia
zachowanie (składanie + stemowanie), więc **niektóre jej asercje mogą wymagać
aktualizacji** i to jest dopuszczalne. Warunek: każda taka zmiana musi być
świadoma i uzasadniona tym, że dopasowanie stało się luźniejsze — nie wolno
„naprawiać" testu pod wynik. Jeśli test przestaje przechodzić z jakiegokolwiek
innego powodu, to regresja, nie aktualizacja.

Nowe przypadki:

- `foldDiacritics` — każdy z dziewięciu polskich znaków, `ß→ss`, tekst bez
  diakrytyków bez zmian, puste wejście;
- `stemToken` — każda końcówka z listy, próg rdzenia 3 znaki (token, który po
  obcięciu zostawiłby 2 znaki, wraca nietknięty), token bez końcówki z listy
  bez zmian, liczby (`160x200`) nietknięte;
- `searchKeyTokens` — potok end-to-end, limit 10 tokenów, deduplikacja,
  odporność na injection odziedziczona po `searchTokens`;
- `rankByNameMatch` — fraza bez ogonków rozpoznaje trafienie w nazwie
  **z** ogonkami; ścieżka DE; stabilność kolejności zachowana.

### Weryfikacja na bazie

Po zaaplikowaniu migracji, zapytaniem kontrolnym. Progi z pomiarów przed
zmianą:

| Fraza (token po potoku) | Dziś | Ma być |
|---|---|---|
| `lozko` | 0 | ≥ 177 |
| `naroznik` | 0 | ≥ 40 |
| `rozkladana` | 0 | ≥ 7 |
| `narożniki` → `naroznik` | 0 | ≥ 40 |
| `fotele` → `fotel` | 1 | ≥ 8 |
| `łóżko` → `lozk` | 177 | ≥ 177 (bez regresji) |

Ostatni wiersz jest najważniejszy: **fraza z ogonkami nie może stracić
trafień.**

### Weryfikacja ręczna

- Playwright na zbudowanym `npm start` (nie `next dev` — na tym projekcie
  Playwright na devie pada): wpisać `lozko` w pasek w headerze, sprawdzić
  podpowiedzi i wyniki na `/sklep`.
- **Regresja wyszukiwarki w panelu admina** (`/admin/produkty`) — to ona
  najłatwiej ucierpi na zmianie tokenizacji. Sesja i dane logowania:
  `e2e/.auth/admin.json` + `.env.e2e`; bez `E2E_BASE_URL` testy lecą w PROD.
- Podpowiedzi: fraza `sofa` ma zwracać sofy z nazwą „Sofa…", nie sześć
  najnowszych produktów, w których słowo pada gdziekolwiek.

## Ryzyka

**Rozjazd mapowania SQL ↔ TS.** Największe ryzyko. Dwie listy znaków muszą być
identyczne; rozjazd nie wywala błędu, tylko cicho zeruje wyszukiwanie.
Mitygacja: test trzymający pełną listę par znaków, komentarze w migracji i w
`foldDiacritics` wzajemnie się wskazujące, oraz kontrolne zapytanie na bazie
po migracji (wiersz „bez regresji" w tabeli wyżej).

**Nadmiarowe dopasowania ze stemowania.** „sofy" → „sof" złapie też „sofka".
Świadomy kompromis: przy 357 produktach nadmiar jest tańszy niż zero, a ranking
zsuwa luźne trafienia pod te z nazwy.

**Zmiana obejmuje panel admina.** Zamierzone — spójność tokenizacji jest celem
— ale wymaga sprawdzenia, nie założenia.

**Jednostronność ryzyka.** Zarówno składanie, jak i stemowanie mogą tylko
**dodać** trafienia. Krótszy, złożony token jest podciągiem tego, co dopasowywał
token dłuższy, a kolumna jest złożona tym samym mapowaniem. Żaden produkt
znajdowany dziś nie może zniknąć — pod warunkiem, że obie strony są złożone
spójnie, co sprowadza się do ryzyka pierwszego.

## Czego ta runda nie naprawi

`kanapa`, `wersalka` i `tapczan` nadal dadzą zero wyników — to potrzebuje
słownika synonimów, świadomie odłożonego. Po wdrożeniu warto zmierzyć, ile bólu
zostaje, zanim podejmiemy decyzję o utrzymaniu słownika.
