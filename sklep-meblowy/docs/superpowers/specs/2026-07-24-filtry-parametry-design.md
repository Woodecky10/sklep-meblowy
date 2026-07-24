# Przebudowa filtrów /sklep: minus kolor/tkanina/kolor nóżek, plus filtry z parametrów

Data: 2026-07-24. Zatwierdzone przez użytkownika (lista usunięć/dodań + „pomiń
funkcję spania, dodam ręcznie"). Bez migracji schematu — kod + 3 operacje na
danych (JSONB) na prodzie.

## Kontekst i problem

FilterBar na /sklep ma dziś: cena, dostępność, kategoria/sekcja/kolekcja,
wymiary (zakresy), **Kolor** (`?kolor=`, kolumna `products.color`), **Tkanina**
(`?tkanina=`, rodziny tkanin ∪ legacy `material` — `fabric-filter.ts`) oraz
generyczne **filtry opcji wariantów** (`?opcja_<slug>=`, flaga
`filterable` w adminie — jedyna włączona: „Kolor nóżek", 111 produktów).
Mikołaj chce wymienić zestaw: kolor/tkanina/kolor nóżek wypadają, wchodzą
filtry z **parametrów produktu** (`products.features`): Powierzchnia spania
(73 prod.), Pojemnik na pościel (45), Tył mebla tapicerowany (7), Wysokość
nóżek (69).

## Cel

1. **Usunąć** z /sklep: filtr Kolor, filtr Tkanina, filtr „Kolor nóżek".
2. **Dodać** generyczne filtry z parametrów produktu, stała lista (kolejność
   sekcji): `["Powierzchnia spania", "Pojemnik na pościel", "Tył mebla
   tapicerowany", "Wysokość nóżek"]`.
3. Porządek w danych: ujednolicić klucze „Wysokość nóżki"→„Wysokość nóżek"
   (2 prod.) i „Wbudowany materac"→„Materac wbudowany" (5 prod.).

## Nie-cele (YAGNI)

- „Funkcja spania" — pominięte świadomie (parametr nie istnieje; Mikołaj doda
  ręcznie; włączenie filtra później = 1 wpis w liście).
- Admin UI do zarządzania listą filtrowanych parametrów (stała w kodzie).
- Filtr zakresowy dla wysokości nóżek (lista wartości wystarczy).
- Usuwanie mechanizmu `filterable` opcji wariantów (zostaje — „Kolor nóżek"
  znika przez odznaczenie flagi w DANYCH, odwracalne w adminie).
- Zmiany na /tkaniny, w katalogu tkanin, na karcie produktu.

## Architektura

### Usunięcia (kod)

- **`app/_lib/products.ts` — `getProducts`**: wypadają param `colors`
  (`.in("color", ...)`) i `materials` (gałąź `productMatchesFabric` +
  fetch `getAllFabrics` w bloku filtrów JS); importy z `fabric-filter`
  wypadają.
- **`app/_lib/products.ts` — `getFacetSource`/`getFilterFacets`**: wypadają
  zapytanie `colors`, katalog `fabrics` i budowa `fabricFacetRows`; wypadają
  pola `colors`/`materials` ze zwrotki. Zapytanie źródłowe zostaje (karmi
  opcje + wymiary), kolumny `material, material_de` wypadają z selecta.
  ⚠️ Klucz cache `["facet-source-v2"]` → **`["facet-source-v3"]`** (zmiana
  kształtu zwrotki; stary wpis nie może się przykleić).
- **`app/sklep/page.tsx`**: wypadają `sp.kolor`/`sp.tkanina` (parsing, typ
  SearchParams, propsy `colors`/`materials`).
- **`app/_components/ui/FilterBar.tsx`**: wypadają propsy/sekcje/chipy/labelki
  kolorów i tkanin.
- **`app/_lib/fabric-filter.ts` + `app/_lib/__tests__/fabric-filter.test.ts`**:
  DELETE (ostatni konsument znika; komentarz-wzmianka w option-filter.ts
  zostaje/do poprawki).
- **e2e `e2e/filter-pending.spec.ts`**: dławik nawigacji przechodzi
  z `?tkanina=` na `?cecha_powierzchnia-spania=` (ten sam scenariusz pending).

### Usunięcie „Kolor nóżek" (dane, prod przez MCP — pokazać SQL → potwierdzić → wykonać)

```sql
UPDATE products SET variants = jsonb_set(variants, '{options}', (
  SELECT jsonb_agg(CASE WHEN opt->>'name' = 'Kolor nóżek'
    THEN opt || '{"filterable": false}'::jsonb ELSE opt END ORDER BY ord)
  FROM jsonb_array_elements(variants->'options') WITH ORDINALITY AS t(opt, ord)))
WHERE variants->'options' @> '[{"name":"Kolor nóżek","filterable":true}]';
```

Facety w cache (`revalidate: 300`) — zmiana widoczna ≤5 min, bez deploya.

### Dodanie: `app/_lib/feature-filter.ts` (nowy CZYSTY moduł, wzorzec option-filter.ts)

```ts
export const FEATURE_PARAM_PREFIX = "cecha_";
// Separator wartości w URL: "|" zamiast "," — wartości typu "4,5 cm" mają
// przecinek w środku (PL ułamek) i nie przeżyłyby rundy przez CSV.
export const FEATURE_PARAM_SEPARATOR = "|";
// Kolejność = kolejność sekcji w FilterBarze (decyzja Mikołaja, nie alfabet).
export const FILTERABLE_FEATURE_KEYS: string[] = [
  "Powierzchnia spania",
  "Pojemnik na pościel",
  "Tył mebla tapicerowany",
  "Wysokość nóżek",
];

export type FeatureFacetGroup = { slug: string; name: string; values: string[] };

// collectFeatureFacets(rows: { features: unknown }[]): FeatureFacetGroup[]
//  - klucz dopasowany do FILTERABLE_FEATURE_KEYS case-insensitive po trim
//    (normalizeOptionName z option-filter.ts), nazwa grupy = kanoniczna
//    z listy; slug = optionParamSlug(klucza) („powierzchnia-spania",
//    „pojemnik-na-posciel", „tyl-mebla-tapicerowany", „wysokosc-nozek");
//  - wartość: trim; pusta lub zawierająca FEATURE_PARAM_SEPARATOR pomijana
//    (analogia CSV w opcjach); dedupe (pierwsza pisownia wygrywa);
//  - wejście defensywne (features: unknown — nie-tablice/śmieci pomijane);
//  - sort wartości localeCompare("pl", { numeric: true })
//    (80x200 < 100x200, "1 cm" < "4,5 cm" < "15 cm");
//  - grupy w kolejności FILTERABLE_FEATURE_KEYS, puste grupy wypadają.

// productMatchesFeatureFilters(features: unknown, selected: Record<string, string[]>)
//  - AND między grupami, OR w grupie; wartości porównywane po trim;
//    klucz produktu dopasowany case-insensitive; brak parametru w produkcie
//    przy aktywnej grupie = brak dopasowania (spójnie z opcjami/wymiarami).

// parseFeatureFilterParams(sp): Record<string, string[]>
//  - klucze `cecha_<slug>` (slug waliduje /^[a-z0-9-]+$/), wartość
//    splitowana po FEATURE_PARAM_SEPARATOR, trim, puste odpadają.

// localizeFeatureFacets(groups, locale): { slug, label, values: {value,label}[] }[]
//  - label grupy: FEATURE_KEY_DE[name] na /de (fallback PL);
//  - label wartości: FEATURE_VALUE_DE[value] na /de (fallback surowa — kody
//    wymiarów "80x200"/"15 cm" przechodzą bez zmian);
//  - value zostaje surowe PL (niesie URL i dopasowanie).
```

### Wpięcie

- **`app/_lib/de-content-maps.ts`**: do `FEATURE_KEY_DE` dochodzą
  `"Pojemnik na pościel": "Bettkasten"`, `"Tył mebla tapicerowany":
  "Gepolsterte Rückseite"`, `"Wysokość nóżek": "Fußhöhe"`
  („Powierzchnia spania"→„Liegefläche" i Tak/Nie→Ja/Nein już są).
- **`products.ts` — `getProducts`**: nowy param `featureFilters?:
  Record<string, string[]>`; blok filtrów JS: warunek aktywacji
  + `features` w selectcie + `productMatchesFeatureFilters` w filtrze.
- **`products.ts` — `getFacetSource`**: `features` dochodzi do selecta
  źródłowego; `featureGroups = collectFeatureFacets(rows)` w zwrotce;
  `getFilterFacets` zwraca `features: localizeFeatureFacets(featureGroups,
  locale)`.
- **`app/sklep/page.tsx`**: `const featureFilters =
  parseFeatureFilterParams(sp)` → `getProducts`; prop
  `featureFacets={facets.features}` → FilterBar.
- **`FilterBar.tsx`**: nowy prop `featureFacets` (ten sam kształt co
  `optionFacets`); sekcje pigułek + chipy aktywnych + zliczanie do licznika
  filtrów — lustrzane do opcji, z prefixem `cecha_` i separatorem `|`
  (toggle/join po `|`); „wyczyść wszystko" czyści też `cecha_*`.
  Sekcje parametrów renderują się w kolejności grup (po opcjach wariantów).

### Porządek w danych (prod przez MCP, z potwierdzeniem)

```sql
-- „Wysokość nóżki" → „Wysokość nóżek" (2 prod.), „Wbudowany materac" →
-- „Materac wbudowany" (5 prod.); wzorzec jak fix literówek 2026-07-24.
UPDATE products SET features = (
  SELECT jsonb_agg(CASE
    WHEN f->>'key' = 'Wysokość nóżki'    THEN jsonb_set(f, '{key}', '"Wysokość nóżek"')
    WHEN f->>'key' = 'Wbudowany materac' THEN jsonb_set(f, '{key}', '"Materac wbudowany"')
    ELSE f END ORDER BY ord)
  FROM jsonb_array_elements(features) WITH ORDINALITY AS t(f, ord))
WHERE features::text LIKE '%Wysokość nóżki%' OR features::text LIKE '%Wbudowany materac%';
```

Uwaga: produkt mający OBA klucze („Wysokość nóżki" i „Wysokość nóżek") zrobiłby
duplikat — sprawdzić SELECT-em przed UPDATE (2026-07-24: brak takich).

## Przypadki brzegowe

- Wartość parametru z `|` w środku → nie wchodzi do facetu (jak przecinek
  w opcjach); dzisiejsze dane nie mają takich wartości.
- Produkt bez danego parametru przy aktywnym filtrze → odpada (spójne
  z opcjami/tkaniną/wymiarami).
- Stare URL-e `?kolor=`/`?tkanina=`/`?opcja_kolor-nozek=` → parametry
  ignorowane (kolor/tkanina: brak parsingu; opcja: facet zniknie, a
  `productMatchesOptionFilters` dalej dopasowuje po wartościach opcji —
  produkty z tą opcją nadal pasują, wynik sensowny), zero błędów.
- `?cecha_zly-slug=x` / śmieciowe wartości → ignorowane (walidacja sluga,
  puste po trim odpadają).
- Wszystkie 4 grupy puste (teoretycznie) → sekcje nie renderują się wcale.
- DE: nazwy grup i „Tak" tłumaczone mapami; wartości wymiarowe bez zmian.

## Pliki dotknięte

- **Nowe:** `app/_lib/feature-filter.ts`;
  `app/_lib/__tests__/feature-filter.test.ts`.
- **Edycja:** `app/_lib/products.ts`; `app/_lib/de-content-maps.ts`;
  `app/sklep/page.tsx`; `app/_components/ui/FilterBar.tsx`;
  `e2e/filter-pending.spec.ts`.
- **DELETE:** `app/_lib/fabric-filter.ts`;
  `app/_lib/__tests__/fabric-filter.test.ts`.
- **Dane (prod, MCP, za potwierdzeniem):** flaga filterable „Kolor nóżek";
  rename 2 kluczy features.

## Testy

- **Unit `feature-filter.test.ts`:** facety (kolejność grup wg stałej listy,
  dopasowanie klucza case-insensitive, dedupe wartości, sort numeric,
  pomijanie separatora/pustych/śmieci, puste grupy wypadają); matching
  (AND/OR, brak parametru, trim); parse (split po `|`, walidacja sluga,
  puste odpadają); lokalizacja (DE label z mapy + fallback, value surowe).
- Usunięcie `fabric-filter.test.ts` razem z modułem; `npm test` całość
  zielona po usunięciu.
- `tsc` + lint + build; e2e filter-pending po przełączeniu na `cecha_`
  (uruchamiany świadomie — default E2E_BASE_URL=PROD, patrz gotcha repo).
- Klik-testy Mikołaja na prodzie po deployu.

## Uwagi wdrożeniowe

- Kolejność: merge/deploy kodu i operacje na danych są NIEZALEŻNE
  (filtr „Kolor nóżek" znika flagą danych; nowe filtry czytają istniejące
  parametry). Sugerowana kolejność: dane najpierw (flaga + renames — od razu
  komplet produktów w facetach), potem merge.
- Facety cache 300 s — po operacjach na danych bez deploya odświeżą się same.
- Branch + PR (konto Woodecky10), auto-deploy po merge.
