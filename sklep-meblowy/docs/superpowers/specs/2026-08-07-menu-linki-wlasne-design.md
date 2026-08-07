# Menu edytowalne z panelu — linki własne obok podstron CMS — projekt

**Data:** 2026-08-07
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

W headerze mają stać: **Meble, Nasze realizacje, Tkaniny, O nas, Kontakt**.
Dziś stoją tam wyłącznie dwie pierwsze pozycje i nie ma sposobu, żeby dołożyć
pozostałe trzy z panelu.

Powód jest strukturalny, nie kosmetyczny. Pasek nawigacji składa się z dwóch
źródeł (`Navbar.tsx:74`):

1. **korzenie drzewa kategorii** — stąd „Meble" i „Nasze realizacje";
2. **pozycje z `menu_items`** — dziś w bazie **zero wierszy**.

`menu_items.page_id` jest `NOT NULL` i wskazuje na tabelę `pages`, czyli tabela
umie linkować **wyłącznie do podstron CMS-owych**. Tymczasem wszystkie trzy
brakujące cele to trasy zaszyte w kodzie:

| Cel | Plik | Widoczny w `/admin/podstrony`? |
|---|---|---|
| `/tkaniny` | `app/tkaniny/page.tsx` | nie |
| `/o-nas` | `app/(legal)/o-nas/page.tsx` | nie |
| `/kontakt` | `app/(legal)/kontakt/page.tsx` | nie |

Stąd obserwacja właściciela: „w stopce są, ale w panelu ich nigdzie nie widzę".
Stopka linkuje do nich listą zaszytą w `Footer.tsx:29`, z pominięciem
`menu_items` — dlatego działają mimo nieobecności w panelu.

## Ustalenia zweryfikowane przed spisaniem specu

| Ustalenie | Dowód |
|---|---|
| `menu_items` jest puste | `select … from menu_items` → `[]` |
| `pages` zawiera tylko nieopublikowany „test" | `select slug, title, published from pages` |
| Korzenie kategorii to `meble` i `z-produkcji` („Nasze realizacje") | `select … from categories where parent_id is null` |
| Kolejność „Meble" przed „Nasze realizacje" wychodzi sama | oba mają `sort_order = 0`, a `byTreeOrder` (`category-tree.ts:39`) przy remisie sortuje `localeCompare(pl)` |
| Etykiety dla wszystkich trzech pozycji już istnieją w obu słownikach | `nav.about` = O nas / Über uns, `nav.contact` = Kontakt, `fabrics.heading` = Tkaniny / Stoffe |
| `NavStrip` i `MobileMenu` przyjmują generyczne `{id, href, label}` | `NavStrip.tsx:4`, `MobileMenu.tsx:9` |

Ostatni wiersz jest kluczowy dla zakresu: **komponenty nawigacji nie wymagają
żadnej zmiany**. Renderują dowolne pozycje, których nikt im dziś nie podaje.

## Decyzje właściciela

- **Menu edytowalne z panelu**, nie trzy linki zaszyte w `Navbar.tsx`.
  Wariant zaszyty był tańszy o migrację i UI, ale został odrzucony świadomie —
  patrz „Odrzucone warianty".
- **Rejestr znanych tras zamiast wolnego pola** na adres.
- **Trzy pozycje zasiane w migracji**, żeby header był poprawny zaraz po
  deployu, a nie dopiero po ręcznym doklikaniu.

## Rozwiązanie

### Dane — migracja 71

```sql
alter table menu_items alter column page_id drop not null;
alter table menu_items add column href text;

-- dokładnie jedno z dwóch: albo podstrona CMS, albo własny adres
alter table menu_items add constraint menu_items_target_xor
  check ((page_id is not null) <> (href is not null));

-- link własny nie ma tytułu strony, z którego wziąłby etykietę awaryjną
alter table menu_items add constraint menu_items_href_needs_label
  check (page_id is not null or (label is not null and btrim(label) <> ''));

create unique index menu_items_location_href_idx on menu_items (location, href);
```

Istniejący `menu_items_location_page_idx` zostaje nietknięty. Postgres traktuje
NULL-e w unique index jako wzajemnie różne, więc dowolna liczba linków własnych
w jednej lokacji przechodzi bez konfliktu — i symetrycznie nowy indeks po `href`
nie przeszkadza wierszom wskazującym na podstrony.

**RLS.** Dzisiejsza polityka odczytu wymaga istnienia opublikowanej strony, co
wycięłoby każdy link własny. Rozszerzenie: `visible and (href is not null or
exists (… published …))`. Aplikacja czyta przez `service_role`, więc to
uporządkowanie ścieżki REST-owej, a nie zmiana zachowania sklepu.

### Walidacja adresu — tylko ścieżki wewnętrzne

`href` przyjmuje wyłącznie ścieżkę zaczynającą się od `/`, bez `//` na starcie
(adres protokołowo-względny) i bez schematu. Dwa powody:

1. `LocalizedLink` dokleja prefiks `/de`, co na adresie zewnętrznym dałoby
   bezsens w rodzaju `/de/https://…`;
2. wolne pole na `https://` w nawigacji to gotowy open redirect.

Linki zewnętrzne (Facebook, Instagram) świadomie poza zakresem — nie były
potrzebne, a ich dołożenie wymaga osobnej decyzji o `target`/`rel`.

### Odczyt — `_lib/menu.ts`

`prepareMenuItems` dostaje poluzowany filtr i wyliczany adres:

```ts
.filter(r => r.location === location && r.visible &&
             (r.href !== null || (r.page !== null && r.page.published)))
…
href: r.href ?? `/${r.page!.slug}`
```

Etykieta linku własnego jest gwarantowana niepusta przez `menu_items_href_needs_label`,
więc ścieżka „etykieta awaryjna z tytułu strony" dotyczy dalej wyłącznie
podstron CMS.

### Render — bez zmian w komponentach

`NavStrip` renderuje najpierw kategorie, potem `pageLinks`, więc pasek wychodzi:

```
Meble ▾   Nasze realizacje ▾   TKANINY   O NAS   KONTAKT
```

`MobileMenu` dostaje tę samą tablicę, więc menu mobilne aktualizuje się samo.

### Panel — `/admin/podstrony`, karta „Menu"

Formularz dodawania dostaje przełącznik trybu:

- **Podstrona** — dzisiejszy `<select>` z `pages`, bez zmian;
- **Link własny** — `<select>` ze znanymi trasami plus pole etykiety
  (wymagane, bo baza nie przyjmie pustego).

`<select>` karmi rejestr tras w `_lib/menu.ts`: `/sklep`, `/tkaniny`, `/probki`,
`/o-nas`, `/kontakt`, `/dostawa`, `/zwroty`, `/regulamin`, `/prywatnosc`.
Rejestr jest jedynym miejscem, które trzeba dopisać przy dodaniu nowej trasy
w kodzie.

Reszta karty — strzałki kolejności, switch widoczności, usuwanie, edycja
etykiety — działa bez zmian, bo operuje na `id`, nie na tym, co pozycja
wskazuje. Zmiany punktowe:

- wiersz podglądu pokazuje `href` zamiast `/{slug}`;
- plakietka „strona-szkic" tylko dla pozycji wskazujących podstronę;
- `updateMenuItemLabel` odrzuca pustą etykietę dla linku własnego, zanim
  odrzuci ją baza (komunikat po polsku zamiast błędu constraintu);
- opis lokacji „powyżej 4 pozycji reszta trafia do rozwijanego »Więcej«"
  (`MenuCard.tsx:28`) jest nieaktualny — limitu 4 nie ma od czasu, gdy pozycje
  zawijają się do drugiego rzędu. Poprawiany przy okazji, bo dotyczy dokładnie
  tego formularza.

### Zasiew trzech pozycji

W tej samej migracji, `on conflict do nothing` (idempotentne dzięki nowemu
indeksowi po `href`):

| `href` | `label` | `label_de` |
|---|---|---|
| `/tkaniny` | Tkaniny | Stoffe |
| `/o-nas` | O nas | Über uns |
| `/kontakt` | Kontakt | Kontakt |

Wszystkie z `location = 'navbar'`, `visible = true`, `sort_order` 0–2. Pozycje
zostają w pełni edytowalne — można je przestawić, przemianować albo usunąć
z panelu.

`label_de` uzupełniane mimo zamrożonego `/de` (brak niemieckiego numeru VAT):
wartości są znane teraz, a dopisywanie ich po odmrożeniu byłoby osobnym
zadaniem, o którym nikt by nie pamiętał.

## Odrzucone warianty

**Trzy linki zaszyte w `Navbar.tsx`.** Około 15 linii, bez migracji i bez UI.
Odrzucony przez właściciela: każda zmiana kolejności albo nazwy pozycji
wymagałaby wtedy deployu.

**Podstrony CMS o slugach `o-nas` i `kontakt`.** Statyczne trasy mają w Next
pierwszeństwo nad `[slug]`, więc takie podstrony byłyby **nieosiągalne** —
panel pokazywałby edytowalną stronę, której nikt nigdy nie zobaczy, a treść
istniałaby w dwóch miejscach.

**Wolne pole tekstowe na adres.** Jedna literówka daje pozycję menu prowadzącą
w 404, widoczną dla wszystkich klientów i niewidoczną dla autora. Rejestr tras
kosztuje ~10 linii i zamyka całą tę klasę błędów.

**Dodanie „Tkanin" jako korzenia drzewa kategorii.** `/tkaniny` to osobny
listing tkanin, nie listing produktów — korzeń kategorii prowadziłby do
`/sklep?kategoria=tkaniny`, czyli do pustej listy.

## Testy

Jednostkowe (vitest) na `prepareMenuItems`, bo moduł jest czysty:

- link własny renderuje swój `href`;
- pozycja niewidoczna wypada;
- pozycja wskazująca podstronę-szkic dalej wypada;
- podstrona bez własnej etykiety dalej bierze tytuł strony;
- link własny i podstrona mieszają się w jednej lokacji, sortowane po `sort_order`.

Do tego zrzut headera Playwrightem **na buildzie** (`npm run build` + `npm start`),
nie na `next dev` — dev pada po pierwszym teście.

## Zaległości po wdrożeniu (nie w kodzie)

- **Migrację 71 zaaplikować ręcznie** przez MCP `apply_migration` po merge’u —
  automat w tym repo nie odpala.
- Stopka dalej trzyma własną, zaszytą listę linków (`Footer.tsx:29`) i nie
  korzysta z `menu_items`. Ujednolicenie to osobne zadanie, świadomie poza
  zakresem tej zmiany.
