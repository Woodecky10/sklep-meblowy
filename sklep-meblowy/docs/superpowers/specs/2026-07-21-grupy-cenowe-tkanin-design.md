# Grupy cenowe tkanin — katalog publiczny, strony tkanin, grupy przy produkcie

Data: 2026-07-21. Zatwierdzone przez użytkownika (model: **grupa + korekta per tkanina**,
tabela grup w bazie, osobne strony tkanin, rozwijane karty grup przy produkcie).

## Kontekst i problem

Tkaniny (`public.fabrics`, migracje 37–42) mają dziś: `name`, `name_de`, `colors[]`,
`color_images` (zdjęcia próbek per kolor), `price` (indywidualna dopłata zł),
`category` (typ, np. „welur"), `sort_order`. **Brak pojęcia grupy cenowej.**
Publicznej strony `/tkaniny` nie ma — istnieje tylko ręcznie utrzymywana podstrona CMS
(`app/[slug]/page.tsx` + treść WYSIWYG z hardkodowanymi linkami „SPRAWDŹ").

Dopłata tkaniny trafia do produktu przez **kopiowanie do `value_prices` opcji „Tkanina"
w momencie zapisu produktu** (`expandFabrics`/`applyFabricSelection`,
`app/_lib/variants.ts:219-270`). Skutek: zmiana ceny tkaniny NIE propaguje się do
zapisanych produktów — dziś nieodczuwalne (wszystkie dopłaty = 0), po wprowadzeniu
grup +250/+400 stałoby się realnym błędem.

## Cel

1. Trzy grupy cenowe: **Standard (+0 zł), Premium (+250 zł), Premium High (+400 zł)**
   — kwoty i etykiety edytowalne w adminie.
2. Publiczny katalog `/tkaniny` z podziałem na grupy; każda tkanina ma własną stronę
   `/tkaniny/[slug]` z opisem i wzornikiem (siatka kolorów z `color_images`).
3. Przy produkcie po „Pokaż więcej" tkaniny pogrupowane w rozwijane karty grup.
4. Dopłata efektywna = **dopłata grupy + korekta tkaniny** (dotychczasowe pole `price`).
5. Zmiana grupy/korekty/kwoty grupy **automatycznie przelicza produkty**.

## Nie-cele (YAGNI)

- Dodawanie/usuwanie grup w adminie (v1: 3 stałe wiersze; edycja nazw i kwot tak).
- Edycja slugów tkanin w adminie (generowane z nazwy, stabilne po utworzeniu).
- Zmiana modelu zapisu wariantów — zostaje denormalizacja `value_prices` + propagacja.
- Obsługa Omnibus dla zmian dopłat (dopłata wariantu to nie przecena produktu).
- Grupowanie po `category` na stronach publicznych (`category` = metadana typu;
  na stronie tkaniny pokazywana co najwyżej jako etykieta „typ").
- Wirtualizacja / paginacja katalogu (~200 tkanin renderuje się wprost).

## Model danych

**Migracja `supabase/migrations/56_fabric_groups.sql`** (aplikowana automatycznie
przy deployu; NIE aplikować ręcznie przez MCP — podłączony projekt = produkcja):

- Nowa tabela `public.fabric_groups`:
  `id uuid PK default uuid_generate_v4()`, `code text UNIQUE NOT NULL`
  (`standard` / `premium` / `premium_high` — stały klucz dla kodu),
  `name text NOT NULL`, `name_de text`, `surcharge numeric(10,2) NOT NULL DEFAULT 0
  CHECK (surcharge >= 0)`, `sort_order int NOT NULL DEFAULT 0`.
  RLS admin-only jak `fabrics` (37:18-23); odczyt publiczny server-side przez
  `createAdminClient`.
- Seed: `('standard','Standard',0,0)`, `('premium','Premium',250,1)`,
  `('premium_high','Premium High',400,2)` (`name_de` null → fallback PL).
- `fabrics`: `+ group_id uuid NOT NULL REFERENCES fabric_groups(id)` — backfill:
  **wszystkie istniejące tkaniny → `standard`** (żadna nie ma dziś dopłaty, ceny bez zmian);
  `+ slug text UNIQUE` — backfill w SQL (lower + translate polskich znaków +
  regexp_replace, kolizje → sufiks `-2`, `-3`…); `+ description text`,
  `+ description_de text` (sanityzowany HTML, nullable).
- `fabrics.price` zostaje bez zmiany nazwy — semantyka: **korekta** doliczana ponad
  dopłatę grupy (w adminie tylko zmiana etykiety).

**Typy** (`app/_lib/types.ts`): nowy `FabricPriceGroup` (uwaga: nazwa celowo inna niż
istniejący `FabricGroup` z `fabric-groups.ts`, który oznacza grupowanie po `category`);
`Fabric` + `group_id`, `slug`, `description`, `description_de`.

**Fetch** (`app/_lib/fabrics.ts`): `getAllFabrics` bez zmian (`select("*")` pobierze nowe
kolumny); nowe `getFabricPriceGroups` (cache `unstable_cache`, tag `"fabric-groups"`,
revalidate 300) + `invalidateFabricGroupsCache`; `getFabricBySlug` = lookup w wyniku
`getAllFabrics`.

## Ceny i propagacja do produktów

- **Dopłata efektywna** tkaniny = `group.surcharge + fabric.price`.
- `expandFabrics` (`variants.ts:219`) przyjmuje dodatkowo mapę `groupId → surcharge`
  (albo dopłaty efektywne policzone przez callera) i wpisuje sumę do `valuePrices`
  każdej wartości tkaniny. `applyFabricSelection` i `sumValueSurcharges` bez zmian —
  strona produktu, koszyk i checkout działają jak dotąd.
- **Propagacja**: czysta funkcja `rebuildFabricValuePrices(variants, fabrics, groups)`
  (testowalna — przelicza `value_prices` opcji „Tkanina" dla jednego produktu,
  dopasowanie wartości przez `fabricValueBelongsTo`) + server-side
  `recomputeProductsForFabrics(fabricNames: string[])` w `app/admin/tkaniny/actions.ts`:
  pobiera produkty, dla każdego z opcją „Tkanina" zawierającą wartości tych tkanin
  przelicza i zapisuje `variants`, na końcu invaliduje cache produktów/facetów/tkanin.
  Wywoływana po: `createFabric`, `updateFabric` (zawsze — tanio, prościej niż diff),
  `updateFabricGroup` (dla wszystkich tkanin grupy).

## Admin (`/admin/tkaniny`)

- Nowa sekcja **„Grupy cenowe"** nad listą tkanin: 3 wiersze — nazwa PL, nazwa DE,
  dopłata (zł); zapis = server action `updateFabricGroup` z potwierdzeniem po stronie
  klienta („przeliczy dopłaty we wszystkich produktach").
- `FabricForm` (`app/admin/tkaniny/FabricsEditor.tsx:159-365`):
  - nowy select **„Grupa cenowa"** (opcje z `fabric_groups`, domyślnie Standard),
  - etykieta pola `price`: „Dopłata (zł)" → **„Korekta ceny (zł)"** z podpowiedzią
    „doliczana ponad dopłatę grupy",
  - nowe pole **„Opis"** — `RichTextEditor` (`app/admin/_shared/RichTextEditor.tsx`),
    zapis przez `sanitizeRichHtml` (`app/_lib/product-html.ts:308`); opcjonalny
    **„Opis (DE)"** obok istniejącej „Nazwa (DE)".
- Lista tkanin: plakietka grupy przy nazwie. `FabricPicker` w edycji produktu
  (`VariantsEditor.tsx:524-752`): przy tkaninie zamiast `+X zł` pokazuje dopłatę
  efektywną (grupa + korekta).
- CRUD (`app/admin/tkaniny/actions.ts`): zapis `group_id`, `description`,
  `description_de`; slug generowany przy tworzeniu (`slugifyTitle`,
  `app/_lib/pages.ts:43`, kolizje → sufiks), nie zmienia się przy edycji nazwy.

## Strony publiczne

- **`app/tkaniny/page.tsx`** — nowy statyczny route (przykrywa podstronę CMS o slugu
  `tkaniny`; starą podstronę można potem usunąć w adminie). Sekcje wg `fabric_groups`
  (sort_order): nagłówek „Premium **+250 zł**" (Standard bez kwoty), w sekcji kafelki
  tkanin: miniatura (pierwsza próbka z `color_images`, placeholder gdy brak), nazwa,
  liczba kolorów. Kafelek → `/tkaniny/[slug]`.
- **`app/tkaniny/[slug]/page.tsx`** — strona tkaniny: nazwa, plakietka grupy z dopłatą
  („bez dopłaty" dla 0), ewent. etykieta typu (`category`), opis (render jak
  `.rich-text` przy produktach), **wzornik**: siatka wszystkich kolorów (zdjęcie próbki
  + numer), link „Zobacz produkty z tą tkaniną" → `/sklep` z istniejącym filtrem tkanin.
  `generateMetadata`: title = nazwa, description = plain text z opisu
  (`extractShortDescription`, `app/_lib/product-html.ts:248`). 404 dla nieznanego sluga.
- **DE**: routing przez istniejący prefiks `/de` (`app/_lib/i18n.ts:12-13`), etykiety
  przez `pickLocalized`-owy fallback (`i18n.ts:41`) — `name_de`, `description_de`,
  `fabric_groups.name_de`; stałe UI przez `de-content-maps.ts` / słownik.
- **Sitemap** (`app/sitemap.ts`): wpisy `/tkaniny` + `/tkaniny/[slug]` (analogicznie
  do istniejących wpisów, wraz z wariantami DE jeśli sitemap je emituje).

## Produkt — selektor tkanin

`FabricSwatchGroup` (`app/_components/ui/VariantSelector.tsx:162-246`):

- **Widok kompaktowy bez zmian**: pierwsze `SWATCH_LIMIT = 5` próbek (+ wybrana, jeśli
  poza limitem) i przycisk „Zobacz więcej (+N)".
- **Po rozwinięciu**: zamiast płaskiej listy — **rozwijane karty grup** (akordeon):
  nagłówek = nazwa grupy + „+250 zł" + liczba tkanin; rozwinięcie pokazuje próbki
  tkanin tej grupy (wybór próbki działa jak dziś — cena przez `value_prices`).
  Grupa z wybraną tkaniną domyślnie rozwinięta. Wartości spoza katalogu (orphany)
  → sekcja „Pozostałe" na końcu, bez dopłaty grupowej.
- Przy każdej tkaninie w rozwiniętej grupie link **„szczegóły"** → `/tkaniny/[slug]`.
- **Dane dla klienta**: rozszerzenie kontekstu tkanin (`app/_lib/fabric-context.tsx`)
  o mapę `wartość → { slug, groupCode, groupLabel, groupSurcharge, groupSort }`
  budowaną server-side (wzorzec jak `FabricImageProvider`, seed w
  `app/produkt/[id]/page.tsx:276`).

## Przypadki brzegowe

- Tkanina bez kolorów → strona bez wzornika (sam opis), kafelek z placeholderem.
- Tkanina bez opisu → strona z samym wzornikiem.
- Kolizja slugów („Boss 12" vs „Boss-12") → sufiks liczbowy przy generowaniu.
- Zmiana nazwy tkaniny NIE zmienia sluga (stabilne URL-e); wartości wariantów na
  produktach dalej stringi „Nazwa Numer" — bez zmian.
- Usunięcie tkaniny: jak dziś (produkty zachowują wartości jako orphany); grupy
  nieusuwalne w v1 (brak UI), FK `restrict`.
- Grupa 0 zł: nagłówki bez „+0 zł"; strona tkaniny pokazuje „bez dopłaty".
- Propagacja przy wielu produktach: pętla server action (skala sklepu — setki
  produktów — bez batchowania w v1); update tylko produktów faktycznie zawierających
  daną tkaninę.
- Koszyk/checkout liczą ceny z aktualnych `variants` produktu — po propagacji nowe
  dopłaty obowiązują natychmiast; pozycje już w koszyku przeliczą się przy renderze
  (zachowanie jak przy każdej zmianie ceny produktu).

## Pliki dotknięte

- **Nowe:** `supabase/migrations/56_fabric_groups.sql`; `app/tkaniny/page.tsx`;
  `app/tkaniny/[slug]/page.tsx` (+ ewentualne wspólne komponenty katalogu).
- **Edycja:** `app/_lib/types.ts` (`FabricPriceGroup`, rozszerzenie `Fabric`);
  `app/_lib/fabrics.ts` (grupy + slug lookup); `app/_lib/variants.ts`
  (`expandFabrics` z grupami, `rebuildFabricValuePrices`); `app/_lib/fabric-context.tsx`
  (mapa meta tkanin); `app/_components/ui/VariantSelector.tsx` (karty grup);
  `app/admin/tkaniny/FabricsEditor.tsx` (sekcja grup, select, opis, etykieta);
  `app/admin/tkaniny/actions.ts` (CRUD + propagacja); 
  `app/admin/produkty/[id]/VariantsEditor.tsx` (dopłata efektywna w pickerze +
  przekazanie grup); `app/produkt/[id]/page.tsx` (seed kontekstu); `app/sitemap.ts`;
  `app/_lib/dictionaries/pl.ts`, `app/_lib/de-content-maps.ts` (stringi).
- **Bez zmian:** `sumValueSurcharges`/ceny koszyka i checkoutu, filtr tkanin
  (`fabric-filter.ts`), `fabric-groups.ts` (grupowanie po `category` — zostaje dla
  pickera; dochodzi analogiczne czyste grupowanie po grupie cenowej).

## Testy

- **Unit (pure):** grupowanie tkanin po grupach cenowych (kolejność `sort_order`,
  orphany na końcu); `expandFabrics` z mapą grup (suma grupa+korekta, tkanina
  bez kolorów, wiele kolorów); `rebuildFabricValuePrices` (przeliczenie `variants`
  produktu, nietykanie innych opcji, orphany bez zmian); generowanie slugów
  (polskie znaki, kolizje). Rozszerzenie `variants.test.ts`, `fabrics.test.ts`,
  `fabric-groups.test.ts`.
- Migracja, admin, strony — lint/build + ręczny smoke (wzorzec repo);
  weryfikacja wizualna Playwrightem przed wdrożeniem (pamięć projektu).

## Uwagi wdrożeniowe

- `AGENTS.md`: to zmodyfikowany Next.js — przed implementacją przeczytać odpowiednie
  przewodniki w `node_modules/next/dist/docs/`.
- Deploy = merge PR do `main` (Vercel); push wymaga konta gh `Woodecky10`.
