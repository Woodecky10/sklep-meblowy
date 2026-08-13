# Synonimy i wyjście ze stanu „zero wyników" — projekt

**Data:** 2026-08-13
**Poprzednik:** `2026-08-13-wyszukiwanie-dopasowanie-design.md` (ogonki i odmiana, wdrożone w PR #136 i #137)

## Problem

Wyszukiwanie rozumie już ogonki i odmianę, ale nie rozumie, że klient nazywa meble inaczej niż katalog. Zmierzone na produkcji (349 aktywnych produktów):

| wpisuje klient | wyników dziś | a w katalogu jest |
|---|---|---|
| `łóżeczko` | **0** | 41 łóżek dziecięcych |
| `materacyk` | **0** | 83 materace |
| `fotelik` | **0** | 9 foteli |
| `kanapa` | **0** | 41 sof |
| `wersalka`, `tapczan`, `sofka`, `otomana` | **0** | 41 sof |
| `podnóżek` | **0** | 9 puf |
| `kącik` | **0** | 40 narożników |
| `dziecinne` | **0** | 41 łóżek dziecięcych |

Zdrobnienia są tu większą dziurą niż synonimy w ścisłym sensie. Rodzic szukający łóżka dla dziecka wpisuje „łóżeczko", nie „łóżko dziecięce".

Osobno: fraza, która nie pasuje do niczego, kończy się ślepym zaułkiem — „Brak produktów. Spróbuj zmienić filtry lub frazę wyszukiwania". Dla `szafa` czy `komoda` zero jest odpowiedzią **prawidłową**, bo sklep ich nie prowadzi, ale klient tego z tego komunikatu nie wie i szuka dalej.

## Czego ten projekt świadomie nie robi

**Materiałów.** `welur` daje zero i naprawa nie należy do tego projektu, bo blokują ją brakujące dane, nie wyszukiwanie. Zmierzony stan: `products.variants` trzyma nazwy handlowe tkanin („Baloo 2071", „Kronos 01"), `fabric_groups` to progi cenowe (Standard, Premium, Premium High), a informacja o materiale istnieje wyłącznie w opisach tkanin wolnym tekstem. Kolumna `fabrics.category` jest przygotowana i edytowalna z panelu (`FabricsEditor.tsx:329`, pole z podpowiedziami z istniejących wartości), ale **pusta u wszystkich 17 tkanin**.

### Zadanie dla właściciela, które odblokowuje ten etap

Wypełnić pole „kategoria" przy tkaninach w panelu. Poniżej materiał **wykryty z opisów** — punkt wyjścia do zatwierdzenia lub poprawienia, nie prawda objawiona, bo pochodzi z wolnego tekstu:

| tkanina | wykryty materiał | uwaga |
|---|---|---|
| Chill Me, Vena | Welur | jednoznaczne |
| Magic Velvet | Welwet | jednoznaczne |
| Poso, Tilia | Sztruks | jednoznaczne |
| Baloo | Bawełna | jednoznaczne |
| Inari | Len | jednoznaczne |
| Matt Velvet | Welur **i** Welwet | opis wymienia oba — rozstrzygnąć |
| Kronos, Manila | Welur **i** Plusz | opis wymienia oba — rozstrzygnąć |
| Monolith, Trinity | Welur **i** Len | opis wymienia oba — rozstrzygnąć |
| **Leo, Quelle, Sawana, Solar, Woolly** | **brak** | opis nie mówi o materiale — tu trzeba wiedzy właściciela |

Czyli: 6 tkanin jednoznacznych, 5 z konfliktem do rozstrzygnięcia, 5 bez żadnej informacji. Dopóki tego nie ma, każde rozwiązanie po stronie wyszukiwania byłoby zgadywaniem z opisów — nieskutecznym u pięciu tkanin i niejednoznacznym u pięciu kolejnych. Osobny spec po wprowadzeniu danych.

**Wyszukiwania po etykiecie kategorii.** `2-osobowa` i `3-osobowa` dają zero w kluczu wyszukiwania, bo klucz to nazwa plus opis, a rozmiar sofy siedzi w **kategorii**. Dlatego „dwójka" i „trójka" nie wchodzą do słownika — nie mają celu, w który mogłyby trafić. Naprawa wymaga innego mechanizmu (dopasowanie frazy również do etykiet kategorii) i jest odrębnym tematem.

**Logowania fraz.** Bez niego kolejne wpisy słownika dalej dobiera się na wyczucie.

## Architektura

Dwie niezależne zmiany, wspólne źródło wiedzy o katalogu.

### Nowy plik: `app/_lib/search-vocabulary.ts`

Jedno miejsce na wiedzę „jak klient nazywa to, co sprzedajemy" i „czego nie sprzedajemy". Dwie stałe, obie ręcznie utrzymywane w kodzie — decyzja właściciela, bo zbiór jest domknięty (siedem rodzin produktów) i rzadko się zmienia, a nowa rodzina produktów to i tak większa zmiana.

**`SEARCH_SYNONYMS`** — mapa jednokierunkowa: rdzeń słowa klienta → lista rdzeni z katalogu.

Klucze i wartości to **rdzenie po złożeniu znaków i obcięciu końcówki**, czyli dokładnie to, co zwraca `searchKeyTokens`. Nie surowe słowa: inaczej „kanapy" nie trafiłoby we wpis „kanapa". Mapowanie jednokierunkowe, bo w drugą stronę nie ma sensu — „kanapa" nie występuje w żadnej nazwie produktu.

| klucz (rdzeń frazy) | wartości (rdzenie z katalogu) | uzasadnienie |
|---|---|---|
| `kanap`, `kanapk` | `sof` | najczęstsza polska nazwa sofy |
| `wersalk` | `sof` | |
| `tapczan` | `sof`, `lozk` | tapczan bywa i sofą, i łóżkiem |
| `sofk` | `sof` | zdrobnienie; stemowanie nie zejdzie z „sofk" na „sof" |
| `otoman` | `sof` | |
| `szezlong` | `sof` | dziś 2 trafienia z opisów |
| `lezank` | `sof` | dziś 1 trafienie |
| `kacik` | `naroznik` | „kącik wypoczynkowy" |
| `podnozek`, `podnozk` | `puf` | dwa klucze, bo stem różni się dla „podnóżek" i „podnóżka" |
| `poslan` | `lozk` | |
| `boxspring` | `kontynentaln` | boxspring to łóżko kontynentalne |
| `lozeczk` | `lozk` | **najważniejszy wpis** — 41 łóżek dziecięcych |
| `fotelik` | `fotel` | |
| `materacyk` | `materac` | |
| `dziecinn` | `dzieciec` | katalog mówi „dziecięce", klient też „dziecinne" |

Wartości zweryfikowane pomiarem na produkcji, wszystkie niepuste: `lozk` 167, `materac` 157, `kontynentaln` 113, `sof` 41, `naroznik` 40, `dzieciec` 25, `fotel` 9, `puf` 9.

Uwaga do `dzieciec`: rdzeń trafia w 25 produktów, choć kategoria „Łóżka dziecięce" ma 41 pozycji — pozostałe 16 nie ma tego słowa w nazwie ani opisie. To znów ograniczenie „klucz to nazwa plus opis, nie kategoria", nie błąd wpisu.

**`NOT_CARRIED`** — mapa rdzeń → nazwa w mianowniku liczby mnogiej, do komunikatu: `szaf` → „szaf", `komod` → „komód", `stol` → „stołów", `krzesl` → „krzeseł", `biurk` → „biurek", `dywan` → „dywanów", `lamp` → „lamp", `regal` → „regałów".

Zweryfikowane: każdy z tych rdzeni daje dziś **zero** trafień w katalogu, więc żaden nie odbiera wyników istniejącemu produktowi. Na przyszłość chroni to samo, co dziś: `NOT_CARRIED` sprawdzamy **wyłącznie wtedy, gdy wynik jest pusty**. Gdyby sklep zaczął sprzedawać stoliki, fraza `stol` coś by zwróciła i do tej gałęzi nigdy byśmy nie doszli.

### Zmiana 1: rozszerzanie zapytania synonimami

Dziś każdy token dostaje własne `.ilike(keyCol, %token%)` i PostgREST ANDuje te warunki. Token, który ma synonimy, dostaje zamiast tego jedno `.or(...)` z alternatywą `token OR syn1 OR syn2`. Wiele wywołań `.or()` również jest ANDowanych, więc semantyka „każde słowo frazy musi wystąpić" zostaje nietknięta.

Zasięg: te same trzy miejsca, które przeszły na `searchKeyTokens` w poprzednim projekcie — `app/_lib/products.ts` (storefront `/sklep`), `app/api/search/suggest/route.ts` (rozwijka podpowiedzi), `app/admin/produkty/actions.ts` (`searchProductsForSizeGroup`). Rozjazd między nimi znaczyłby, że klient i panel widzą inny katalog.

**Bezpieczeństwo.** `.or()` to ścieżka, którą uszczelniał audyt MEDIUM z 2026-06-11: `sanitizeSearchTerm` usuwa z frazy znaki znaczące dla składni `.or()` (`, . ( )`) oraz wildcardy ILIKE. Ta ochrona zostaje bez zmian — token użytkownika dalej przez nią przechodzi i dalej owija go `escapeIlike`. Operandy dołożone przez słownik są stałymi w kodzie, nie danymi z zewnątrz. Do tego test pilnujący, że każda wartość w `SEARCH_SYNONYMS` (klucz i element listy) pasuje do `/^[a-z0-9]+$/` — gdyby ktoś dopisał wpis z przecinkiem lub nawiasem, test padnie, zanim rozjedzie filtr.

**Ranking.** Trafienie przez synonim nie może udawać trafienia dokładnego. „kanapa" nie występuje w nazwie żadnej sofy, więc przy dzisiejszym trójpoziomowym rankingu wszystkie wyniki z synonimu wpadłyby na poziom trzeci — ten dla trafień wyłącznie z opisu — i mieszałyby się z prawdziwym szumem opisowym. Synonim wchodzi więc jako **poziom rdzenia** (drugi), nigdy pierwszy. Zgodne z definicją: synonim to z założenia nie jest dokładne trafienie.

Konsekwencja dla `rankByNameMatch`: token uznajemy za obecny w nazwie, jeśli nazwa zawiera rdzeń tokenu **albo którykolwiek z jego synonimów**. Poziom pierwszy (dokładny) pozostaje bez zmian — liczy wyłącznie formę wpisaną przez użytkownika.

### Zmiana 2: stan pustego wyniku na `/sklep`

Gdy wyszukiwanie jest aktywne i zwróciło zero produktów:

- fraza trafia w `NOT_CARRIED` → nagłówek „Nie prowadzimy szaf." plus jedno zdanie, co sklep sprzedaje
- każde inne zero → „Nie znaleźliśmy nic dla «fraza»"

W obu przypadkach pod komunikatem **kafelki kategorii nadrzędnych, które mają produkty**: ŁÓŻKA, MATERACE, Narożniki, SOFY, Fotele, PUFY. Kafelki to zwykłe linki do kategorii, bez nowego mechanizmu danych — kategorie są już wczytane na tej stronie.

Filtry (cena, kategoria) zostają nietknięte: jeśli zero wynika z filtrów, a nie z frazy, dalej obowiązuje dzisiejsza podpowiedź o zmianie filtrów.

## Testowanie

**Jednostkowo** (`vitest`): rozszerzanie tokenów synonimami — wejście „kanapa" daje alternatywę zawierającą `sof`; wejście bez wpisu w słowniku zwraca sam token; klucze i wartości słownika przechodzą test kształtu `/^[a-z0-9]+$/`; `rankByNameMatch` stawia trafienie po synonimie na poziomie rdzenia, nie dokładnym; fraza wielosłowna z jednym synonimem i jednym zwykłym słowem dalej wymaga obu.

**Na żywej bazie**: dla każdego klucza słownika liczba wyników po zmianie musi być większa od zera, a dla fraz kontrolnych z poprzedniego projektu (`łóżko`, `lozko`, `sofy`, `poso`) **niezmieniona** — synonimy nie mają prawa ruszyć fraz, których nie dotyczą.

**Wizualnie**: stan pustego wyniku zrzutem z Playwrighta na `npm run build` + `npm start`, dla frazy z `NOT_CARRIED` (`szafa`) i dla frazy nieznanej (`xyzabc`). Playwright nie działa na `next dev` w tym projekcie.

## Ryzyka

**Słownik się zestarzeje.** Gdy sklep zacznie sprzedawać nową rodzinę produktów, wpisy trzeba dopisać ręcznie i nic o tym nie przypomni. Ograniczenie świadome — zbiór jest domknięty, a nowa rodzina produktów to i tak zmiana z udziałem programisty. Plik ma o tym mówić wprost w komentarzu.

**Synonim może dorzucić hałas.** `tapczan` → `sof` + `lozk` daje sumę dwóch dużych zbiorów. Akceptowalne, bo dziś ta fraza daje zero, a ranking porządkuje wynik.

**`NOT_CARRIED` może kłamać, gdy asortyment się rozszerzy.** Gdyby sklep zaczął sprzedawać komody, komunikat „nie prowadzimy komód" byłby fałszem. Chroni przed tym warunek „tylko przy zerowym wyniku": produkt w katalogu automatycznie wyłącza ten komunikat.
