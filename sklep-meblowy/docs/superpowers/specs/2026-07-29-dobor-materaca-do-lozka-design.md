# Spec: Dobór materaca do łóżka (karuzela dopasowana rozmiarem)

Data: 2026-07-29
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- Sekcja cross-sell pod produktem już istnieje: `app/produkt/[id]/page.tsx:341`
  renderuje siatkę 4 kart, dane z `getCrossSellProducts`
  (`app/_lib/products.ts:283`).
- Mapowanie jest **na poziomie kategorii**: `categories.cross_sell_categories
  text[]` (migracja `16_cross_sell_and_collections.sql`), edytowane w
  `/admin/kategorie` (`KategorieEditor.tsx:387`). Stan w bazie na 2026-07-29:
  - `lozka-tapicerowane` → `['materace-nawierzchniowe','materace-piankowe']`
  - `lozka-dzieciece` → `['materace-nawierzchniowe','materace-piankowe']`
  - `lozko-kontynentalne` → `['materace-nawierzchniowe']`
  - `materace`, `materace-piankowe`, `materace-nawierzchniowe` i wszystkie
    kategorie sof/narożników → `[]`
- `getCrossSellProducts` zwraca **4 najnowsze** produkty z kategorii docelowych
  (`order created_at desc limit 4`). Brak dopasowania rozmiaru, brak sortu
  biznesowego. Ta sama funkcja obsługuje cross-sell w koszyku
  (`app/koszyk/actions.ts:122`).
- Nagłówek sekcji składa się z etykiety **pierwszej** kategorii z
  `cross_sell_categories` (`page.tsx:129-135`): „Polecane materace
  nawierzchniowe".
- Dane rozmiarowe (aktywne produkty, stan na 2026-07-29):
  - `products.size_label` jest wypełnione i znormalizowane do formy `160x200`:
    łóżka tapicerowane 21/21, kontynentalne 53/53, materace 40/40, piankowe
    16/16, nawierzchniowe 44/44. Jedyny brak: 1 aktywne łóżko dziecięce
    (rozmiar jest w nazwie: „… 90x200 cm").
  - Rozmiary łóżek: `120x200`, `140x200`, `160x200`, `180x200`, `200x200`
    (dziecięce `90x200`). Materace pokrywają je wszystkie plus `70..100x200`.
  - Na każdy rozmiar przypada 12 materacy: 5 kieszeniowych + 2 piankowe +
    5 nawierzchniowych (wyjątki: `70x200` tylko nawierzchniowe, `90x200`
    ma 4 nawierzchniowe).
  - `products.dimensions` **nie jest** wspólnym mianownikiem: dla materaca to
    powierzchnia spania (160×200), dla łóżka wymiar zewnętrzny (180×210).
- Gotowego komponentu karuzeli produktów nie ma. `HomeHeroSlider.tsx` to slider
  hero (pełnoekranowe slajdy), `FilterBar.tsx` używa `overflow-x-auto` tylko dla
  chipów filtrów.
- Istnieją „Zestawy" (`/admin/zestawy`, `getBundlesForProduct`) — ręczne pary
  mebli z rabatem, pokazywane jako box „Kup w zestawie" w sekcji głównej. To
  osobny mechanizm, ten spec go nie dotyka.

## Cel

Klient na stronie łóżka widzi pod produktem materace **w rozmiarze tego łóżka**
(a nie losowe najnowsze), w przewijanej karuzeli ze strzałkami, żeby móc
przejrzeć więcej niż 4 pozycje bez opuszczania strony.

## Zakres — zatwierdzone decyzje

### Dopasowanie rozmiaru — czysta logika

Nowy plik `app/_lib/sleep-size.ts` — bez importów server-only, wzorzec jak
`size-groups.ts` / `localize.ts`, żeby był testowalny bez mockowania Supabase.

- `sleepSizeOf({ size_label, name })` → kanoniczne `"160x200"` albo `null`.
  Kolejność źródeł:
  1. `size_label` po normalizacji: lowercase, `×` → `x`, usunięcie spacji,
     usunięcie sufiksu `cm`, walidacja wzorcem `^\d{2,3}x\d{2,3}$`.
  2. Regex z nazwy: `(\d{2,3})\s*[x×]\s*(\d{2,3})`, pierwsze trafienie.
  - `dimensions` **nie jest źródłem** — dla łóżka to wymiar zewnętrzny, więc
    dopasowanie po nim dawałoby błędne pary (łóżko 160x200 ma
    `dimensions` 180×210).
- `formatSleepSize("160x200")` → `"160×200 cm"` (typograficzny `×` do
  wyświetlenia; kanoniczna forma z `x` zostaje do porównań).
- `pickSizeMatched(products, size, categoryOrder)` → produkty o
  `sleepSizeOf(p) === size`, posortowane: najpierw pozycja `p.category` w
  `categoryOrder` (kolejność z `cross_sell_categories`), w grupie cena efektywna
  rosnąco (`effectivePrice` z `app/_lib/pricing.ts`), remis → `name` z
  `localeCompare("pl", { numeric: true })` dla determinizmu. Produkt o kategorii
  poza `categoryOrder` idzie na koniec. Zwraca `[]` gdy nic nie pasuje —
  decyzję o fallbacku podejmuje warstwa wywołująca.

### Warstwa danych

`getCrossSellProducts` (istniejąca, wołana z koszyka `app/koszyk/actions.ts:122`)
zostaje **nietknięta** — ta sama sygnatura, ten sam typ zwrotny `Product[]`,
to samo zachowanie. Wspólny fragment (odczyt `cross_sell_categories` i złożenie
listy kategorii docelowych) wyjeżdża do prywatnego helpera
`resolveCrossSellTargets(cartCategorySlugs)` → `string[]` w kolejności z bazy,
z którego korzystają obie funkcje.

Nowa funkcja `getSizeMatchedCrossSell(categorySlug, sleepSize, excludeProductIds,
limit, locale)` → `{ products: Product[]; sizeMatched: boolean }`:

- `sleepSize === null` lub brak kategorii docelowych → oddaje wynik
  `getCrossSellProducts` (4 najnowsze) z `sizeMatched: false`.
- W przeciwnym razie dwa zapytania:
  1. tani scan: `select id, category, size_label, name, price, sale_price`
     po `in("category", targetSlugs)`, bez limitu (ok. 100 wąskich wierszy),
  2. `pickSizeMatched` w JS → lista ID (przycięta do `limit`),
  3. `select("*").in("id", ids)` tylko dla wybranych, kolejność z kroku 2
     odtworzona w JS (`in` nie gwarantuje kolejności).
  Powód dwóch zapytań: wiersz produktu zawiera ciężkie `variants` z listami
  tkanin, więc `select("*")` po całych kategoriach materacy to megabajty
  transferu przy każdym renderze strony łóżka, z czego 90% do odrzucenia.
- Zero dopasowań w kroku 2 → ten sam fallback co wyżej (`sizeMatched: false`),
  żeby sekcja nie zniknęła.
- `limit`: **12** dla ścieżki dopasowanej (tyle maksymalnie jest materacy w
  jednym rozmiarze), **4** dla fallbacku (jak dziś).

Strona produktu (`app/produkt/[id]/page.tsx`) liczy `sleepSizeOf(product)`,
woła `getSizeMatchedCrossSell` i na podstawie `sizeMatched` wybiera kopię
nagłówka. Karuzela renderuje się w obu ścieżkach — przy 4 kartach na `lg`
treść się mieści, więc strzałki same się chowają i sekcja wygląda jak
dzisiejsza siatka.

### Karuzela

Nowy `app/_components/ui/ProductCarousel.tsx`, `"use client"`, w środku
istniejący `ProductCard` (ulubione, ceny, przeliczenie EUR działają bez zmian).

- Mechanika: **`embla-carousel-react` ^8.6.0** — już w zależnościach, używany
  przez `HomeHeroSlider.tsx:44`. Daje przeciąganie na mobile, snap i gotowe
  `canScrollPrev()` / `canScrollNext()` do stanu strzałek, więc nie piszemy
  własnych listenerów `scroll` + `ResizeObserver`. Opcje:
  `{ align: "start", slidesToScroll: "auto", containScroll: "trimSnaps" }`
  (bez `loop` i bez autoplay — to lista produktów, nie hero).
- Szerokości kart: 1 na mobile (~78% szerokości, żeby następna wystawała jako
  afordancja), 2 od `sm`, 4 od `lg` — te same proporcje co dzisiejsza siatka
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Strzałki: okrągłe przyciski `type="button"` w stylu sekcji (border
  `--border`, hover `--color-gold`), wyśrodkowane pionowo na pasku kart.
  Ukryte na mobile (przeciąganie wystarcza, `hidden sm:flex`), wyszarzone i
  `disabled` gdy `canScroll*()` zwraca `false` — przy liście mieszczącej się w
  całości oba są nieaktywne, więc pasek nie udaje przewijalnego.
- `aria-label` przycisków z dictionary, sekcja `a11y` (obok istniejących
  `prevSlide` / `nextSlide`): nowe `prevProducts` / `nextProducts`. Locale w
  komponencie klienckim przez `useClientLocale()`, jak w `HomeHeroSlider`.
- Klik w kartę = przejście na stronę materaca (standardowy `ProductCard`).
  Dodawania do koszyka z karuzeli **nie ma**.
- Pozostałe sekcje strony produktu („Podobne produkty", „Pełna kolekcja")
  zostają siatkami — karuzela wchodzi tylko do sekcji cross-sell.

### Nagłówek i i18n

Nowe klucze w `pl.ts` (typ `PlShape` + wartości) i `de.ts` — test parytetu
`dictionaries.test.ts` wymaga niepustego tłumaczenia DE dla każdego klucza PL:

- `product.crossSellSizeEyebrow`: PL „Dobierz materac", DE „Passende Matratze"
- `product.crossSellSizeHeading`: PL „Materace w rozmiarze", DE „Matratzen in
  Größe" — rozmiar dokleja się w JSX (`${...crossSellSizeHeading} ${formatSleepSize(size)}`),
  bez interpolacji `{placeholder}`, zgodnie z konwencją reszty słownika
  (por. `crossSellRecommendedPrefix` w `page.tsx:349`)
- `a11y.prevProducts` / `a11y.nextProducts`: PL „Poprzednie produkty" /
  „Następne produkty", DE „Vorherige Produkte" / „Nächste Produkte"

Ścieżka `sizeMatched === false` zostaje przy dzisiejszej kopii („Dopełnienie" /
„Polecane {label pierwszej kategorii}" / fallback „Może Cię zainteresować").

Świadomy kompromis: nowa kopia mówi wprost „materace", choć produkty pochodzą z
konfigurowalnej listy `cross_sell_categories`. Alternatywa (etykieta pierwszej z
trzech kategorii, czyli „Polecane materace kieszeniowe" nad listą mieszającą
kieszeniowe, piankowe i nawierzchniowe) byłaby nieprawdziwa. Dziś cross-sell jest
skonfigurowany wyłącznie dla pary łóżka→materace i tylko te produkty mają
`size_label`, więc ryzyko jest zerowe. Jeśli kiedyś dojdzie cross-sell rozmiarowy
dla innej pary kategorii, ta kopia wymaga zmiany na sterowaną danymi (np. nowe
pole `cross_sell_heading` na kategorii).

### Zmiana danych na produkcji

`cross_sell_categories` dla łóżek bez materaca w komplecie:

- `lozka-tapicerowane` → `['materace','materace-piankowe','materace-nawierzchniowe']`
- `lozka-dzieciece` → `['materace','materace-piankowe','materace-nawierzchniowe']`
- `lozko-kontynentalne` → **bez zmian** (`['materace-nawierzchniowe']`) — te
  łóżka mają materac w komplecie, sensowny dokup to topper/nawierzchniowy.

Kolejność w tablicy ma znaczenie biznesowe: steruje sortem karuzeli
(`categoryOrder`), więc realne materace kieszeniowe idą przed piankowymi i
topperami. Zmiana wchodzi przez `/admin/kategorie` (albo `UPDATE` przez MCP) —
to dane, nie schema, więc bez migracji. Do wykonania **po** wdrożeniu kodu:
przed nim dodanie kategorii `materace` zmieniłoby dzisiejszy nagłówek na
„Polecane materace kieszeniowe" nad niedopasowaną listą.

### Poza zakresem

- Cross-sell w koszyku (zostaje na 4 najnowszych, bez rozmiaru).
- Dodawanie materaca do koszyka wprost z karuzeli.
- Ręczne nadpisywanie listy materacy per produkt w panelu.
- Zamiana pozostałych siatek produktów na karuzele.
- Rabat na parę łóżko+materac (to domena istniejących „Zestawów").

## Testy i weryfikacja

Vitest, `app/_lib/__tests__/sleep-size.test.ts`:

- `sleepSizeOf`: `size_label` w formach `"160x200"`, `"160 × 200 cm"`,
  `"160X200"` → `"160x200"`; puste/whitespace `size_label` → fallback do nazwy
  („Łóżko … 90x200 cm" → `"90x200"`); brak rozmiaru w obu → `null`;
  `size_label` śmieciowy (np. `"duże"`) → fallback do nazwy, nie wyjątek.
- `sleepSizeOf` nie patrzy na `dimensions` — łóżko z `size_label: "160x200"`
  i `dimensions {width:180,depth:210}` daje `"160x200"`.
- `pickSizeMatched`: odfiltrowuje inne rozmiary; sort respektuje
  `categoryOrder` przed ceną; cena efektywna (produkt z `sale_price` niżej niż
  jego `price` sugeruje); kategoria poza `categoryOrder` na końcu; brak
  dopasowań → `[]`.

Weryfikacja końcowa: `npm run lint`, `npx vitest run`, `npm run build`, potem
zrzut z Playwrighta na localhost (strona łóżka 160×200): w karuzeli wyłącznie
materace 160×200, nagłówek z rozmiarem, strzałki przesuwają i wyszarzają się na
krawędziach. Uwaga operacyjna: `npm run build` przy działającym `next dev`
psuje `.next` deva — build robić po zabiciu deva (patrz notatka
„Dev .next stale after build").
