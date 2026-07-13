# Edycja strony głównej z admina + motywy wyglądu — spec

**Data:** 2026-07-13
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Nietechniczna administratorka ma mieć „wszystko pod ręką": edycję całej
zawartości strony głównej z panelu admina (bez dublowania istniejących
edytorów) oraz bezpieczną zmianę wyglądu sklepu (kolory, fonty) w ramach
spójnego design systemu. UX musi być trywialny: zero HTML, zwykłe pola
tekstowe, klikalne kafle, podgląd na żywo.

## Kontekst — co już jest edytowalne (NIE ruszamy)

| Sekcja home | Edytor | Tabela |
|---|---|---|
| Hero slider | `/admin/slider` | `home_slides` |
| Kafelki „Znajdź swój styl" | `/admin/kafelki` | `home_tiles` |
| Polecane produkty | `/admin/polecane` | `featured_products` |
| Kolekcje | `/admin/kolekcje` | `collections` |

Czego dziś NIE da się edytować: pasek zaufania (`TrustBar`, teksty w
słownikach i18n — jego spec z 2026-07-06 świadomie odłożył admina),
nagłówki/podtytuły sekcji (słowniki), kolejność i widoczność sekcji,
slogan TopBaru, tagline stopki.

`TrustBar` jest osadzony w DWÓCH miejscach (home z nagłówkiem, karta
produktu bez nagłówka) — edycja z bazy obejmie automatycznie oba.
Osadzenie w stopce usunięto z main 2026-07-06 (commit c72c5008).

## Zakres (decyzje użytkownika)

1. Edytowalne: pasek zaufania, nagłówki sekcji, kolejność + widoczność
   sekcji, TopBar i stopka (teksty).
2. Design: gotowe motywy + możliwość ręcznej podmiany pojedynczych kolorów
   z automatyczną kontrolą kontrastu (WCAG).
3. Fonty: wybór z kilku dobranych par.
4. Struktura admina: hub `/admin/strona-glowna` + osobny `/admin/wyglad`.
5. Podgląd motywu na żywo w adminie przed zapisem; po zapisie zmiana idzie
   od razu na sklep (bez systemu draftów).
6. Podejście A: dedykowane typowane tabele (rozszerzenie obecnego wzorca),
   definicje motywów/fontów w kodzie, w bazie tylko wybór.

## Model danych

Migracje od **numeru 49** (47/48 zarezerwowane przez otwarty PR #48 — P24).
RLS wszędzie jak w `store_settings`: odczyt publiczny (anon), zapis tylko
service_role (akcje admina).

### `home_sections` (migracja: create + seed)

Po jednym wierszu na sekcję strony głównej.

- `key text primary key` — `hero` | `tiles` | `featured` | `trust_bar` | `collections`
- `sort_order int not null` — kolejność renderowania (konwencja repo, jak
  `home_slides`/`home_tiles`; atomowy reorder przez RPC jak w migracji 28)
- `visible boolean not null default true`
- `heading text`, `heading_de text` — nagłówek sekcji (H2)
- `subheading text`, `subheading_de text` — eyebrow/podtytuł
- Seed: 5 sekcji w obecnej kolejności (hero=1, tiles=2, featured=3,
  trust_bar=4, collections=5) z obecnymi nagłówkami PL i DE przepisanymi ze
  słowników. Dla `hero` nagłówki NULL (slajdy mają własne teksty). Po
  migracji strona wygląda identycznie jak dziś.

### `trust_items` (migracja: create + seed)

Pozycje paska zaufania — struktura zgodna z obecnym komponentem:
duża ikona + złoty checkbox + pogrubiona etykieta + opcjonalna szara dopiska.

- `id uuid primary key default gen_random_uuid()`
- `icon text not null` — klucz z zestawu 10 ikon w kodzie (istniejące 4:
  `medal-pl`, `shield-check`, `truck-free`, `warranty-2y` + 6 nowych
  generycznych: `star`, `leaf`, `headset`, `wallet`, `hand-heart`, `clock`)
- `label text not null`, `label_de text` — pogrubiona etykieta
- `subline text`, `subline_de text` — szara dopiska (jak „na terenie całej Polski")
- `sort_order int not null`, `active boolean not null default true`
- Seed: obecne 4 pozycje z tekstami PL i DE ze słowników.

### `site_texts` (migracja: create + seed)

Krótkie teksty globalne, klucz → wartość.

- `key text primary key` — na start: `topbar_slogan`, `footer_tagline`
- `value text`, `value_de text`
- Seed: obecne wartości ze słowników.
- Dane firmowe (e-mail, telefon, NIP, adres — `app/_lib/company.ts`) zostają
  w kodzie: to dane prawne używane w regulaminie/P24/fakturach.

### `store_settings` (migracja: alter — nowe kolumny)

- `theme_preset text not null default 'klasyczny'`
- `theme_overrides jsonb not null default '{}'` — np. `{"gold": "#b87333"}`
- `font_pair text not null default 'inter-playfair'`

## Motywy i fonty (definicje w kodzie)

### Presety kolorów

Moduł `app/_lib/theme.ts` (+ typy). 4 presety, każdy z KOMPLETEM tokenów
brand dla trybu jasnego i ciemnego:

- tokeny: `--color-navy`, `--color-navy-light`, `--color-gold`,
  `--color-gold-light`, `--color-cream`, `--color-gold-text` (wersja złota
  do tekstu, kontrast ≥ WCAG AA wobec tła)
- presety (nazwy robocze): `klasyczny` (obecny granat+złoto),
  `butelkowa-zielen` (zieleń+mosiądz), `bez-braz` (beż+ciepły brąz),
  `grafit-miedz` (grafit+miedź)
- Presety definiują TAKŻE zmienne semantyczne (`--bg`, `--fg`, `--card-bg`,
  `--border`, `--muted`) dla trybu jasnego i ciemnego — dziś `--bg` to
  dosłownie krem, a `--card-bg` w dark mode to granat, więc bez tego motyw
  byłby niespójny. Wartości semantyczne w presetach są dobrane ręcznie;
  przy nadpisaniach własnych liczone automatycznie (pochodne od cream/navy).

### Nadpisania własne

`theme_overrides` może nadpisać kolory bazowe: `navy`, `gold`, `cream`.
Warianty pochodne liczone automatycznie czystymi funkcjami:
`navy-light`/`gold-light` (rozjaśnienie), `gold-text` (przyciemnianie/
rozjaśnianie aż kontrast wobec tła ≥ 4.5:1). Funkcje: konwersje hex↔RGB,
relative luminance, contrast ratio, lighten/darken — w pełni testowane
jednostkowo. Nie da się zapisać nieczytelnej kombinacji.

### Aplikacja motywu (zero FOUC)

Root layout czyta ustawienia motywu (cache z tagiem `theme`) i wstrzykuje
server-side: wartości jasne jako inline `style` (custom properties) na
`<html>`, wariant ciemny jako mały blok `<style>` z selektorem `.dark`.
To nadpisuje domyślne z `globals.css`. Ponieważ komponenty już używają
`var(--color-*)` (~183 miejsca), cała strona przemalowuje się bez zmian
w komponentach. Kolory statusowe (czerwień błędów, zieleń sukcesu,
`amber`/`stone` w adminie) celowo poza motywem.

### Pary fontów

4 pary przez `next/font/google` w root layout (wszystkie subset latin +
latin-ext — polskie znaki):

- `inter-playfair` — Inter + Playfair Display (obecna, domyślna)
- `lato-cormorant` — Lato + Cormorant Garamond
- `montserrat` — Montserrat + Montserrat (nowoczesna bezszeryfowa)
- `nunito-lora` — Nunito Sans + Lora

Wybrana para ustawia `--font-sans`/`--font-display` w tym samym wstrzyknięciu
co kolory. Przeglądarka pobiera tylko fonty faktycznie użyte w renderze —
zdefiniowanie wszystkich par nie obciąża użytkownika.

## Renderowanie strony

### `app/page.tsx`

- Pobiera `home_sections` (cache z tagiem `home-sections`) i renderuje
  sekcje w kolejności `position`, pomijając `visible = false`. Mapa
  key → funkcja renderująca sekcję.
- Nagłówki/podtytuły sekcji z bazy; na DE kolumny `_de` z fallbackiem na PL
  (wzorzec `localize*` jak w produktach/slajdach).
- Fallback całościowy: gdy zapytanie padnie lub tabela pusta → obecna
  kolejność i nagłówki ze słowników (wzorzec `DEFAULT_FALLBACK_SLIDE`).
  Sklep nigdy nie wysypuje się przez brak konfiguracji.

### `TrustBar`

- Pobiera aktywne `trust_items` (cache, tag `trust-items`) posortowane po
  `position`; ikony mapowane po kluczu na SVG z zestawu w kodzie; nieznany
  klucz ikony → pomijany bezpiecznie. Fallback: obecne 4 zahardkodowane
  pozycje. Zmiana obejmuje oba miejsca osadzenia.
- Nagłówek paska na home (`withHeading`) przechodzi na `home_sections`
  (wiersz `trust_bar`).

### TopBar / Footer

- Czytają `site_texts` (cache, tag `site-texts`) z fallbackiem na słowniki:
  `topbar_slogan`, `footer_tagline`. Reszta stopki bez zmian (kategorie już
  z DB, linki informacyjne statyczne, dane firmy z kodu).

### Cache i inwalidacja

`unstable_cache` z tagami: `theme`, `home-sections`, `site-texts`,
`trust-items` — wzorzec jak `facets`/`eur-rate`. Gotcha (znana): w
`unstable_cache` nie ma `cookies()` → czysty klient anon. Akcje admina po
zapisie wołają `revalidateTag` odpowiedniego taga.

## Panel admina

Admin pozostaje PL-only. Pulpit (`/admin`) dostaje 2 nowe karty:
„Strona główna" i „Wygląd".

### `/admin/strona-glowna` — hub

- Lista sekcji home w kolejności: przełącznik widoczności, strzałki ↑/↓,
  rozwijana edycja nagłówka + podtytułu (pola PL i DE obok siebie, plain
  text). Hero bez pól nagłówka.
- Sekcje z własnymi edytorami (slider/kafelki/polecane/kolekcje) mają
  przycisk „Edytuj zawartość →" linkujący do istniejącej podstrony —
  zero dublowania.
- Pasek zaufania: w rozwinięciu sekcji lista pozycji — wybór ikony
  (klikalna siatka z podglądem), etykieta + dopiska (PL i DE), strzałki
  kolejności, aktywność, dodawanie/usuwanie pozycji.
- Karta „Teksty ogólne": `topbar_slogan`, `footer_tagline` (PL i DE).

### `/admin/wyglad`

- Motywy jako duże klikalne kafle z próbkami kolorów; aktywny wyróżniony.
- Rozwijane „Dostosuj kolory": 3 color-pickery (główny/navy, akcent/gold,
  tło/cream); pochodne liczone na żywo, kontrast korygowany automatycznie.
- Wybór pary fontów — każda opcja wyrenderowana własnym fontem.
- Podgląd na żywo: makieta fragmentu strony (pasek nawigacji, nagłówek
  H2 + eyebrow, karta produktu, przyciski) w wybranych kolorach/fontach,
  aktualizowana natychmiast klient-side PRZED zapisem (scoped CSS vars
  na kontenerze podglądu).
- „Zapisz" (server action → `store_settings` + `revalidateTag('theme')`)
  i „Przywróć domyślne".

### Akcje serwerowe

Wzorzec jak istniejące akcje admina: guard admina, walidacja (hex kolorów,
znane klucze presetów/fontów/ikon/sekcji — nieznane odrzucane), komunikat
błędu w panelu przy niepowodzeniu. Gotcha Turbopack: w plikach `"use server"`
tylko async akcje, bez `export type`.

## Testy (TDD)

Jednostkowe (vitest):
- scalanie `home_sections` z domyślnymi + sortowanie + filtr widoczności,
- czyste funkcje kolorów: hex↔RGB, luminancja, contrast ratio,
  lighten/darken, auto-`gold-text` (kontrast ≥ 4.5:1),
- generowanie bloku zmiennych CSS z presetu + overrides (light i dark),
- lokalizacja `_de` z fallbackiem PL dla sekcji/trust items/site_texts,
- walidacje akcji (odrzucenie nieznanego presetu/ikony/klucza, zły hex).

Smoke: home renderuje się z pustą i pełną konfiguracją; /de pokazuje
teksty `_de`; przełączenie motywu przemalowuje stronę (weryfikacja
Playwright, light + dark). Całość: `tsc`, pełny zestaw testów, `npm run build`.

## Kolejność wdrożenia (3 osobno mergowalne kroki)

1. Migracja `home_sections` + renderowanie sekcji z bazy + hub
   `/admin/strona-glowna` (kolejność, widoczność, nagłówki, linki do
   istniejących edytorów).
2. Migracje `trust_items` + `site_texts` + edycja paska zaufania i tekstów
   ogólnych w hubie.
3. Migracja kolumn motywu w `store_settings` + `app/_lib/theme.ts` +
   wstrzykiwanie zmiennych + pary fontów + `/admin/wyglad` z podglądem.

## Poza zakresem (świadomie)

- Edycja danych firmowych (`COMPANY`) — dane prawne, zostają w kodzie.
- Edycja linków stopki/kategorii — kategorie już edytowalne w
  `/admin/kategorie`, linki informacyjne to stałe strony.
- Drag&drop kolejności sekcji (strzałki wystarczą przy 5 sekcjach).
- System draftów/publikacji — podgląd w adminie wystarcza.
- Osobna edycja dark mode — warianty ciemne liczone/zdefiniowane w presetach.
- Zmiana układu/layoutu sekcji (grid, szerokości) — tylko treść, kolejność,
  widoczność, kolory, fonty.
- Licznik tłumaczeń DE na pulpicie nie obejmuje nowych pól `_de` (można
  dodać później).
