# Rozbudowa strony (bloki + podstrony + menu) i filtry wariantów — spec

**Data:** 2026-07-14
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Sklep ma docelowo działać bez programisty: nietechniczna administratorka
sama rozbudowuje stronę główną o kolejne sekcje („klocki" jak w
WordPressie), tworzy nowe podstrony i podpina je do menu — a wszystko
wygląda estetycznie z automatu, bo używa design systemu sklepu (w tym
motywów i fontów z `/admin/wyglad`). Równolegle klient sklepu dostaje
filtrowanie po opcjach wariantów (m.in. rozmiar) i po wymiarach w cm.
UX admina jak zawsze: zero HTML, zwykłe pola, drag-and-drop zdjęć.

## Zakres (decyzje użytkownika)

1. Typy nowych sekcji: **tekst+zdjęcie/banner, galeria zdjęć, sekcja
   produktowa, FAQ / opinie klientów** (wszystkie cztery).
2. Filtr rozmiaru: **jedno i drugie** — checkboxy z wartości opcji
   wariantów ORAZ zakresy wymiarów w cm.
3. Które opcje filtrują: **wybrane przez admina** — checkbox „Filtr
   w sklepie" przy opcji w edytorze produktu (nie automat, nie stała
   lista w kodzie).
4. Nawigacja do podstron: **też menu główne (Navbar)** + stopka.
5. Architektura rozbudowy: **rejestr typowanych bloków** (podejście 1)
   — typy bloków w kodzie, w bazie tylko instancje; odrzucone: WYSIWYG
   (ryzyko estetyczne, i18n) i zewnętrzny CMS (koszty, drugi panel).
6. Konwencje przyjęte z repo: każde pole tekstowe ma odpowiednik `_de`
   z fallbackiem PL; istniejące strony (`o-nas`, `kontakt`, prawne)
   zostają jak są — kreator służy do NOWYCH podstron.

## Podział na kroki

Każdy krok = osobny branch/PR + migracja zapuszczana na prod (Supabase
MCP, za potwierdzeniem) na końcu kroku. Kolejność: **A → B → C → D**
(A niezależne i pilne; B jest fundamentem C; D wymaga C).

| Krok | Zakres | Migracja |
|---|---|---|
| A | Filtry opcji wariantów + wymiarów na /sklep | brak |
| B | System bloków + rozbudowa home | 52 |
| C | Podstrony (kreator stron z bloków) | 53 |
| D | Edycja menu (Navbar + stopka) | 54 |

Numeracja migracji: 47/48 zarezerwowane przez otwarty PR #48 (P24),
49–51 zużyte (edycja home + motywy).

---

## Krok A — Filtry wariantów i rozmiarów

### Dane (bez migracji)

- `ProductOption` (JSON w `products.variants`) dostaje opcjonalną flagę
  `filterable?: boolean` (domyślnie false/brak → opcja nie filtruje).
- Wymiary z istniejącego `products.dimensions`
  (`{width, depth, height}` w cm, już edytowane w edytorze produktu).

### Admin

W `VariantsEditor` przy każdej opcji checkbox **„Filtr w sklepie"**.
Zapis istniejącą akcją `updateProductVariants` — ona już woła
`invalidateFacetsCache()`. Żadnych nowych akcji/tabel.

### Facety (`getFacetSource` w `products.ts`)

- Z aktywnych produktów zbierane są opcje `filterable=true`, grupowane
  po **znormalizowanej nazwie opcji** (trim, zbite spacje, porównanie
  case-insensitive: „ROZMIAR" i „Rozmiar" → jeden filtr; wyświetlana
  forma: pierwsza litera wielka, np. „Rozmiar").
- Opcja o znormalizowanej nazwie „Tkanina" jest **pomijana** — ma już
  dedykowany filtr rodzin tkanin (`fabric-filter.ts`), który zostaje
  bez zmian.
- Lokalizacja DE: nazwa opcji przez `VARIANT_OPTION_DE`, wartości przez
  `VARIANT_VALUE_DE` i nadpisania admina (`value_labels`), fallback —
  surowa wartość. Wzorzec `buildLocalizedFacets`.
- Facet wymiarów: min/maks szerokości/głębokości/wysokości aktywnych
  produktów (granice pól zakresu); produkty bez wymiarów nie wnoszą nic.
- Wszystko w istniejącym `unstable_cache` z tagiem `facets` (revalidate
  300); wewnątrz bez `cookies()` (bare anon client) — jak dziś.

### URL i filtrowanie

- Nowe parametry: `opcja_<slug-nazwy>=w1,w2` (multi-CSV, jak `tkanina`;
  slug ze znormalizowanej nazwy opcji, np. `opcja_rozmiar`,
  `opcja_powierzchnia-spania`) oraz `szer_od/szer_do`, `gl_od/gl_do`,
  `wys_od/wys_do` (liczby całkowite, cm).
- Filtrowanie wzorcem tkaniny (jedyny filtr czytający `variants`):
  przy aktywnym filtrze opcji/wymiarów pobierane są
  `id, variants, dimensions` wszystkich produktów, dopasowanie w JS
  (czyste funkcje), zawężenie głównego query przez `.in("id", ids)`.
  Paginacja / sort / pozostałe filtry zostają w DB (AND).
- Semantyka dopasowania: produkt pasuje do filtra opcji, gdy MA opcję
  o tej znormalizowanej nazwie i przynajmniej jedną z wybranych
  wartości (OR wewnątrz filtra, AND między filtrami — jak dziś kolor ×
  tkanina). Produkt bez danej opcji / bez wymiarów odpada przy aktywnym
  filtrze (spójnie z tkaniną).
- Flaga `filterable` wpływa na to, co pojawia się w facetach; przy
  dopasowywaniu wartości liczy się sama obecność opcji (facet nie
  pokaże filtra, którego nikt nie włączył).

### UI (`FilterBar`)

- Dynamiczne sekcje checkboxów per opcja filtrowalna (wzorzec sekcji
  „Tkanina", `toggleMulti`), renderowane tylko gdy facet niepusty.
- Zwijany panel **„Wymiary"** z trzema parami pól od–do (debounce
  500 ms jak cena). Optymistyczny pending-stan jak reszta filtrów.

### Testy

Czyste funkcje TDD (wzorzec `fabric-filter.test.ts`): normalizacja
nazw opcji, slug parametru, agregacja facetów (w tym scalanie casingu),
dopasowanie produktu (opcje + wymiary), parsowanie paramów zakresów.
Plus e2e pending-filtra wzorem istniejącego `filter-pending`.

---

## Krok B — System bloków + rozbudowa home

### Model danych — `page_blocks` (migracja 52)

Jedna tabela na bloki home i (od kroku C) podstron:

- `id uuid primary key default gen_random_uuid()`
- `page_id uuid` — **null = strona główna**; w kroku C FK → `pages`
- `block_type text not null` — klucz typu z rejestru w kodzie
- `sort_order int not null`
- `visible boolean not null default true`
- `content jsonb not null default '{}'` — treść wg schematu typu
- `created_at/updated_at`

RLS jak `home_sections` (odczyt publiczny, zapis service_role), RPC
atomowego reorderu (wzorzec migracji 49). Migracja **przenosi 5 sekcji
z `home_sections`** jako bloki systemowe (`hero`, `tiles`, `featured`,
`trust_bar`, `collections`; nagłówek/podnagłówek → `content`),
zachowując kolejność i widoczność, po czym **dropuje `home_sections`**.
Kod `home-sections.ts` zostaje zastąpiony przez `blocks.ts` (defaulty
5 bloków systemowych w kodzie = fail-open: pusta tabela/błąd → dzisiejszy
wygląd 1:1).

### Rejestr typów bloków (`app/_lib/blocks.ts`)

Każdy typ: klucz, nazwa+opis dla admina (PL/DE), schemat treści,
walidacja (czyste funkcje TS — bez nowych zależności), domyślna treść,
przypisany renderer i formularz admina.

**Bloki systemowe** (istniejące sekcje home): przestawialne
i ukrywalne, **nieusuwalne**, `content` = nagłówek/podnagłówek
(`heading`, `heading_de`, `subheading`, `subheading_de`) — jak dziś.
Nie do dodania na podstronach ani drugi raz na home.

**Bloki treściowe** (pełny CRUD, każde pole tekstowe z `_de`):

- `banner` — nagłówek, tekst, zdjęcie, układ (`left` | `right` |
  `background`), opcjonalny przycisk (etykieta + link).
- `gallery` — opcjonalny nagłówek, lista zdjęć (drag-and-drop upload,
  istniejący pipeline kompresji klienckiej + Supabase storage).
- `products` — nagłówek, źródło: `manual` (ręcznie wybrane ID) |
  `collection` (kolekcja) | `category` (kategoria) + limit; render
  siatką kafelków jak „Polecane".
- `faq` — nagłówek, lista `{question, answer}` — akordeon.
- `reviews` — nagłówek, lista `{quote, author}` — cytaty klientów.

Nieznany `block_type` przy renderze → blok pomijany (fail-open,
kompatybilność w przód).

### Render

Switch w `app/page.tsx` zastąpiony generycznym `<BlockList>`:
mapowanie typ → komponent. Bloki systemowe renderują dotychczasowe
komponenty (`HomeHeroSlider`, kafelki, polecane, `TrustBar`,
kolekcje). Bloki treściowe dostają komponenty w design systemie sklepu
— typografia, kolory i fonty motywu działają automatycznie.

### Admin (`/admin/strona-glowna`)

Ewolucja obecnego edytora: ta sama lista (strzałki kolejności, oko
widoczności, edycja nagłówków) + przycisk **„Dodaj sekcję"** →
galeria typów (miniaturka + opis po polsku) → formularz typu (proste
pola, zero HTML) → sekcja ląduje na dole listy. Usuwanie bloków
treściowych z potwierdzeniem; systemowych nie da się usunąć (brak
przycisku). Akcje serwerowe wzorem obecnych (walidacja treści po
stronie serwera przed zapisem).

### Cache

Tag `page-blocks` (home: klucz stały; od kroku C per strona —
`page-blocks:<page_id>`), `unstable_cache` + revalidate 60, inwalidacja
we wszystkich akcjach mutujących bloki. Wzorzec `home-sections`
(bez `cookies()` w środku).

### Testy

Adaptacja testów `home-sections` (merge z defaultami, lokalizacja,
sort determinizm) + walidacja treści per typ + rejestr (każdy typ ma
renderer i formularz). Testy czystych funkcji przed implementacją (TDD).

---

## Krok C — Podstrony

### Model danych — `pages` (migracja 53)

- `id uuid primary key default gen_random_uuid()`
- `slug text unique not null` — tylko `a-z0-9-`
- `title text not null`, `title_de text`
- `seo_description text`, `seo_description_de text`
- `published boolean not null default false`
- `created_at/updated_at`

`page_blocks.page_id` dostaje FK → `pages(id)` **`on delete cascade`**
(usunięcie strony sprząta bloki; w adminie z potwierdzeniem).
RLS: odczyt publiczny, zapis service_role.

### Routing

`app/[slug]/page.tsx` — dynamiczny segment najwyższego poziomu; Next
dopasowuje najpierw trasy statyczne, więc łapie wyłącznie nieznane
adresy. Slug przy tworzeniu/edycji walidowany przeciw **liście
zarezerwowanej** (wszystkie istniejące trasy top-level: `sklep`,
`koszyk`, `produkt`, `konto`, `admin`, `api`, `auth`, `checkout`,
`logowanie`, `rejestracja`, `reset-hasla`, `ulubione`,
`zapomnialem-hasla`, strony prawne: `o-nas`, `kontakt`, `dostawa`,
`prywatnosc`, `regulamin`, `zwroty` + `de` i prefiksy techniczne
`_next`, `sitemap.xml`, `robots.txt`, `favicon.ico`) i generowany
automatycznie z tytułu (edytowalny). Lista zarezerwowana w kodzie —
jedno miejsce, obok walidacji sluga.

DE bez dodatkowej pracy: proxy zdejmuje `/de` i ustawia `x-locale`,
podstrona czyta locale jak każda inna strona.

### Publikacja i podgląd

- `published=false` → `notFound()` dla klientów; **zalogowany admin
  widzi stronę** (podgląd przed publikacją — link „Podgląd" w adminie).
- Publikacja jednym przełącznikiem w edytorze strony.
- Nieopublikowane strony nie trafiają do sitemapy ani menu (krok D).

### SEO

`generateMetadata`: `title`/`seo_description` per locale (fallback PL).
`app/sitemap.ts` dostaje wpisy opublikowanych podstron (PL + `/de/…`).

### Admin (`/admin/podstrony`)

Lista stron (tytuł, adres, status opublikowana/szkic, data) + „Dodaj
stronę" (tytuł → auto-slug) → edytor: u góry pola tytułu/sluga/SEO
(PL+DE), niżej **ten sam edytor bloków co na home** (tylko bloki
treściowe). Karta „Podstrony" dołącza do huba `/admin/strona-glowna`
(spójnie z kartą „Teksty ogólne").

### Cache i błędy

Strony pod tagiem `pages`, bloki per strona `page-blocks:<page_id>`;
inwalidacja w akcjach admina (zapis/publikacja/kasowanie). Błąd DB przy
renderze podstrony → 404, nie 500.

### Testy

Walidacja sluga (format + lista zarezerwowana), lokalizacja metadanych,
logika published/podgląd admina (czyste funkcje), smoke render
podstrony PL i `/de`.

---

## Krok D — Edycja menu

### Model danych — `menu_items` (migracja 54)

- `id uuid primary key default gen_random_uuid()`
- `location text not null` — `navbar` | `footer`
- `page_id uuid not null` — FK → `pages(id)` `on delete cascade`
- `label text`, `label_de text` — puste → tytuł strony (fallback DE→PL)
- `sort_order int not null`, `visible boolean not null default true`

RLS: odczyt publiczny, zapis service_role; RPC reorderu per lokacja.
Świadome ograniczenie: menu edytowalne obejmuje **tylko linki do
podstron** — logo, sekcje kategorii, ikony (koszyk/konto/szukajka)
i systemowe linki stopki zostają stałe (koleżanka nie rozmontuje
głównej nawigacji).

### Render

- `Navbar` (desktop): linki podstron **za** sekcjami kategorii;
  powyżej **4 pozycji** nadmiar w dropdownie **„Więcej"** — pasek się
  nie rozjeżdża.
- `MobileMenu`: pozycje podstron jako osobna grupa pod kategoriami.
- `Footer`: pozycje `location=footer` w istniejącej kolumnie linków.
- Renderują się wyłącznie pozycje **opublikowanych** stron — cofnięcie
  publikacji chowa link automatycznie (join/filtr po `published`).

### Admin

Na `/admin/podstrony` karta **„Menu"**: dwie listy (Menu główne /
Stopka) — dropdown „Dodaj stronę do menu", strzałki kolejności
(atomowy RPC), oko widoczności, opcjonalna własna etykieta PL/DE,
usunięcie pozycji (strona zostaje).

### Cache

`unstable_cache` z tagiem `menu` (Navbar/Footer są na każdej stronie —
odczyt musi być tani), inwalidacja w akcjach menu **oraz** w akcjach
publikacji/kasowania stron. Fail-open: błąd/pusta tabela → nawigacja
wygląda jak dziś.

### Testy

Czyste funkcje: merge/lokalizacja pozycji, limit „Więcej", filtr
published (TDD); smoke Navbar/Footer PL/DE.

---

## Obsługa błędów — zasady wspólne

- Wszędzie fail-open na odczycie: błąd DB / pusta tabela → defaulty
  z kodu (home wygląda jak dziś, menu bez dodatkowych linków); wyjątek:
  podstrona bez danych → 404.
- Walidacja treści bloków i sluga po stronie serwera (akcje), komunikaty
  po polsku w adminie.
- Zapis wyłącznie przez server actions z klientem service-role (RLS
  blokuje zapis anonem) — wzorzec całego admina.

## Weryfikacja końcowa (per krok)

`tsc` + pełne testy + build + smoke PL/`/de`; krok A dodatkowo ręczny
test filtrów na żywych danych; kroki B–D — test klikowy edytorów
(dodanie sekcji/strony/pozycji menu, reorder, ukrycie, usunięcie)
i e2e mutacyjny A→B z przywróceniem stanu (wzorzec kroku 2 z 2026-07-13).
