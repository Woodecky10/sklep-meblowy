# Produkt w kilku kategoriach (główna + dodatkowe)

Projekt z 2026-10-15. Prośba właściciela: jedna oferta ma móc być w więcej niż
jednej kategorii — pracownik utworzył zakładkę i chce do niej dopinać
produkty, które mają już swoją kategorię.

## Stan wyjściowy — odczytany z kodu i danych

- `products.category text not null`, klucz obcy `products_category_fk` →
  `categories(slug)` **ON UPDATE CASCADE ON DELETE RESTRICT** (migracja 09),
  indeks `idx_products_category`. Drzewo kategorii przez `categories.parent_id`
  (migracja 68); produkt może wisieć na dowolnym węźle.
- 2026-10-13 pracownik utworzył kategorię najwyższego poziomu **„Szybka
  dostawa"** (`szybka-dostawa`) — ma 0 produktów. Każdy kandydat ma już
  kategorię typu (Narożniki, Fotele…), więc dziś da się go tylko przenieść,
  a nie dopiąć.
- Listing `/sklep`: `getProducts` (`app/_lib/products.ts`) →
  `resolveCategoryFilter(getAllCategories(), …)` → `.in("category", slugi
  poddrzewa)`; nieznany slug → pusty wynik. Bez cache (zapytanie per request).
  W tym samym zapytaniu wyszukiwanie dokłada `.or()` dla każdej grupy
  synonimów (`applyTokenGroup`).
- Blok „produkty" na stronach, źródło „kategoria": `app/_lib/block-products.ts`
  → `.eq("category", slug)` — dokładny węzeł, bez poddrzewa.
- Jedna wartość `product.category` zasila: okruszki i JSON-LD
  `BreadcrumbList` oraz eyebrow (`app/produkt/[id]/page.tsx`,
  `ProductMainSection`), etykietę na karcie (`ProductCard`), feed
  (`g:product_type`, `g:google_product_category` przez `resolveGpc`),
  „podobne produkty" (`getRelatedProducts`, dokładny węzeł), cross-sell
  (`getCrossSellProducts`, `getSizeMatchedCrossSell`), koszyk
  (`CartItem.category` w localStorage), przełącznik strony narożnika
  (`isCornerCategorySlug`) i ostrzeżenie o cross-sellu w panelu produktu.
- Panel: `ProductEditor.tsx` ma jeden `<select name="category">`
  (`flattenForSelect`, opcje z `getAllCategories()`), zapis w
  `updateProductBasics` (`app/admin/produkty/actions.ts`). Tworzenie:
  `buildNewProductPayload`, duplikowanie: `buildDuplicatePayload`
  (`app/_lib/new-product.ts`).
- `/admin/kategorie`: liczniki z `from("products").select("category")` →
  `subtreeProductCounts` (własne + poddrzewo). Te same liczniki napędzają
  ostrzeżenie „kategoria z produktami bez kategorii Google".
  `deleteCategory` odmawia, gdy węzeł ma dzieci albo produkty
  (`.eq("category", slug)`); FK RESTRICT jest zabezpieczeniem w bazie.
- Slugu nie da się zmienić w aplikacji (`updateCategory` nie rusza `slug`);
  zmiana zrobiona w SQL kaskaduje po FK na `products.category`.
- GA4 i Pixel Meta nie wysyłają kategorii. Adres produktu nie zawiera
  kategorii. Sitemap ma jedną pozycję na węzeł, produkty są bez kategorii.

## Rozstrzygnięcia z właścicielem (2026-10-15)

1. Produkt ma **kategorię główną** (jak dziś) i dowolną liczbę **kategorii
   dodatkowych**. Dodatkowe decydują wyłącznie o tym, na których listach
   produkt się pojawia; wszystko, co potrzebuje jednej kategorii, zostaje
   na głównej.
2. Dopinanie **w edytorze produktu** (pole „Dodatkowe kategorie"). Na start
   bez masowego dopinania z listy produktów i bez zarządzania z poziomu
   kategorii.
3. Zapis jako kolumna-tablica na produkcie (wariant 1 poniżej).

## Rozważone warianty

1. **`products.extra_categories text[]`** — wybrany. Filtr listingu zmienia
   się w jednym miejscu („główna z poddrzewa LUB któraś dodatkowa
   z poddrzewa"), spójność pilnują triggery.
2. Tabela łącząca produkt–kategoria — odrzucona. Klucze obce za darmo, ale
   PostgREST nie zrobi „kolumna LUB tabela" jednym zapytaniem; potrzebne RPC
   albo dwa zapytania, co komplikuje paginację, licznik i fasety
   w `getProducts`.
3. Zamiana `category` na tablicę wszystkich kategorii — odrzucona. Psuje
   każde miejsce, które potrzebuje jednej kategorii, i traci klucz obcy.

## Sekcja 1 — Model (migracja 84)

- `products.extra_categories text[] not null default '{}'` + indeks GIN
  `idx_products_extra_categories`.
- Tablica nie ma klucza obcego, więc zastępują go triggery:
  - na `products` (BEFORE INSERT OR UPDATE OF `extra_categories`): każdy
    element musi istnieć w `categories.slug`, inaczej `raise exception`.
    Trigger pilnuje tylko istnienia; duplikaty i kategorię główną usuwa serwer
    (Sekcja 3).
  - na `categories` (AFTER UPDATE OF `slug`): `array_replace` starego sluga
    na nowy w `products.extra_categories` — odpowiednik ON UPDATE CASCADE.
  - na `categories` (BEFORE DELETE): `array_remove` sluga z
    `products.extra_categories`. Kategoria **dodatkowa nie blokuje**
    usunięcia; **główna nadal blokuje** (FK RESTRICT + `deleteCategory`).
    Jeśli usunięcie się nie uda, transakcja cofa też `array_remove`.
- RLS bez zmian (nowa kolumna istniejącej tabeli).
- Typ: `Product.extra_categories?: Category[] | null`. Kod czyta zawsze
  `p.extra_categories ?? []` — `select("*")` na bazie bez kolumny daje
  `undefined`, nie `null`.
- Czysta funkcja `categoryMatchFilter(slugs)` w `app/_lib/category-tree.ts`
  zwraca warunek do `.or()`:
  `category.in.(a,b),extra_categories.ov.{a,b}`. Dostaje wyłącznie slugi
  z drzewa (z `resolveCategoryFilter` albo z konfiguracji bloku sprawdzonej
  względem drzewa), nigdy surowy tekst z adresu; slugi to `[a-z0-9-]`.

## Sekcja 2 — Gdzie produkt się pojawia

- `getProducts`: `.in("category", slugs)` → `.or(categoryMatchFilter(slugs))`.
  Poddrzewo działa jak dziś: produkt z dodatkową „Fotele tapicerowane do
  salonu" pokaże się też w „Fotelach". Gałąź „nieznany slug → pusty wynik"
  zostaje.
- Przy wyszukiwaniu w obrębie kategorii zapytanie ma kilka parametrów `or=`
  (kategoria + grupy synonimów). PostgREST łączy je przez AND — **do
  potwierdzenia na buildzie**, zanim uznamy to za działające.
- `block-products.ts` (źródło „kategoria"): `.eq("category", slug)` →
  `.or(categoryMatchFilter([slug]))` — dalej dokładny węzeł, bez poddrzewa.
- `/admin/kategorie`: zapytanie pobiera `category, extra_categories`.
  - Licznik wyświetlany = produkty z węzłem jako główną **lub** dodatkową;
    w poddrzewie produkt liczony **raz**, nawet jeśli ma główną i dodatkową
    w tej samej gałęzi. Nowa czysta funkcja zamiast `ownCounts` liczonych
    w stronie.
  - Ostrzeżenie o brakującej kategorii Google liczy **tylko kategorie
    główne** — feed bierze `google_product_category` z głównej, więc
    „Szybka dostawa" z samymi dopiętymi produktami nie może wywołać
    fałszywego alarmu.
- Bez zmian (kategoria główna): okruszki, eyebrow, karta produktu, feed,
  podobne produkty, cross-sell, koszyk, narożnik, sitemap, podpowiedzi
  wyszukiwarki. Produkt z „Narożników" wyświetlony w „Szybkiej dostawie"
  ma okruszek „Narożniki".

## Sekcja 3 — Panel

- `ProductEditor`: pod „Kategorią" pole **„Dodatkowe kategorie"** —
  checkboxy `name="extra_categories"` z tych samych opcji co select
  (`flattenForSelect`: nagłówek na każdy korzeń, wcięcie wg głębokości),
  w przewijanym pudełku. Bieżąca kategoria główna jest na liście
  wyłączona (reaguje na zmianę selecta bez zapisu). Nad listą krótkie
  podsumowanie wybranych.
  - Jeśli pole idzie przez `Field`, to z propem `composite` (pułapka
    `<label>`: klik w etykietę zaznaczałby pierwszy checkbox).
  - Zapis tym samym formularzem i przyciskiem co dane podstawowe
    (`onSubmit`, nie `action`).
  - Ukryte pole `extra_categories_present=1`: odznaczone checkboxy nie
    trafiają do `FormData`, więc bez znacznika „wszystko odznaczone"
    byłoby nie do odróżnienia od „pola nie było w formularzu".
- `updateProductBasics`: gdy jest znacznik, `formData.getAll(
  "extra_categories")` → `normalizeExtraCategories(raw, główna,
  znaneSlugi)`: tylko slugi z `getAllCategories()`, bez duplikatów, bez
  kategorii głównej, w kolejności drzewa. Zmiana kategorii głównej na taką,
  która była dodatkową, usuwa ją z dodatkowych. Rewalidacja jak dziś.
- `buildDuplicatePayload` kopiuje `extra_categories`.
- Formularz nowego produktu: bez pola (dopina się po utworzeniu; domyślnie
  `{}`).
- Lista produktów w panelu: bez zmian.

## Sekcja 4 — Wdrożenie

- Migrację 84 aplikujemy **ręcznie na produkcji przed merge'em** (auto-apply
  u nas nie działa). Kolejność jest twarda: kod z
  `extra_categories.ov.{…}` na bazie bez kolumny dostaje błąd PostgREST
  i listing kategorii przestaje działać.
- Po wdrożeniu pracownik dopina produkty do „Szybkiej dostawy" w edytorze.

## Testy

- Vitest (czyste funkcje):
  - `categoryMatchFilter` — format warunku dla jednego i wielu slugów.
  - `normalizeExtraCategories` — odrzuca nieznane slugi, duplikaty
    i kategorię główną; pusty input → `[]`; kolejność drzewa.
  - liczniki panelu — produkt z główną i dodatkową w tej samej gałęzi
    liczony raz; licznik do ostrzeżenia Google tylko z kategorii głównych.
  - `buildDuplicatePayload` kopiuje `extra_categories`.
- Build lokalny (`npm run build` + `npm start`, baza produkcyjna po
  migracji, tylko odczyt): `/sklep?kategoria=…` dla węzła z produktami
  głównymi pokazuje to samo co przed zmianą; wyszukiwanie w obrębie
  kategorii działa (dwa parametry `or=`).
- Na żywo po wdrożeniu: zaznaczyć „Szybka dostawa" przy jednym produkcie →
  produkt widać w `/sklep?kategoria=szybka-dostawa`, okruszek na jego
  stronie pokazuje kategorię główną, licznik w `/admin/kategorie` = 1,
  brak ostrzeżenia Google przy „Szybkiej dostawie"; odznaczyć → znika.

## Poza zakresem (świadomie)

- Masowe dopinanie z listy produktów i zarządzanie produktami z poziomu
  kategorii.
- Pole „Dodatkowe kategorie" przy tworzeniu produktu.
- Okruszek zależny od zakładki, z której klient przyszedł.
- Plakietka „Szybka dostawa" na kartach produktów.
- Kategorie dodatkowe w feedzie (`g:product_type` zostaje z głównej).
- Sprzątanie martwego `category_groups` i zdublowanych numerów migracji
  82/83.
