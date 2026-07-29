# Spec: Cechy tkanin (wodoodporna / przyjazna zwierzętom / łatwa w czyszczeniu)

Data: 2026-07-27
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- Katalog tkanin to tabela `fabrics`: `name`, `name_de`, `slug`, `colors text[]`,
  `color_images jsonb`, `price`, `group_id`, `description(_de)`,
  `short_info(_de)`, `featured_product_ids jsonb`. Panel: `/admin/tkaniny`
  (`FabricsEditor.tsx` + `FabricGroupsPanel.tsx`).
- Wartość opcji „Tkanina" na produkcie to string `„Rodzina Numer"` (np.
  „Inari 22"). Powiązanie wartość → tkanina robi
  `buildFabricMetaMap` (`app/_lib/variants.ts:368`), która produkuje
  `FabricValueMeta` (`variants.ts:354`): `fabricName`, `slug`, `groupCode`,
  `groupName(De)`, `groupSurcharge`, `groupSort`, `shortInfo(De)`.
- `FabricValueMeta` dociera do klienta przez `useFabricMeta()`
  (`app/_lib/fabric-context.tsx`) i jest konsumowana w `FabricSwatchGroup`
  wewnątrz `app/_components/ui/VariantSelector.tsx`.
- Rozwinięta lista tkanin na karcie produktu (po kliknięciu „Zobacz więcej"):
  karty grup cenowych → w karcie podsekcje per rodzina tkaniny, każda z
  wierszem nagłówka `nazwa rodziny + „szczegóły" + ⓘ (short_info)` i siatką
  próbek kolorów.
- Widok zwinięty (przed „Zobacz więcej") pokazuje pierwsze 5 **pojedynczych
  kolorów**, potencjalnie z różnych rodzin — nie ma tam poziomu rodziny.
- Dymek ⓘ (`ValueInfoTip.tsx`) po fixie z 2026-07-27 renderuje się portalem do
  `<body>` z `position: fixed` i pozycją z `computeTooltipPosition`.

## Cel

Klient wybierający tkaninę na karcie produktu od razu widzi, czy dana tkanina
jest wodoodporna, przyjazna zwierzętom i łatwa w czyszczeniu — bez najeżdżania
na cokolwiek i bez czytania opisu.

## Zakres — zatwierdzone decyzje

### Gdzie widać (i gdzie świadomie NIE widać)

1. **Rozwinięta lista tkanin na karcie produktu** — pigułki z podpisem
   (ikonka + tekst) w wierszu nazwy rodziny, obok „szczegóły" i ⓘ. To jest
   główne miejsce; wariant wybrany z makiety („B. Pigułki z podpisem”).
2. **Podpis wybranej tkaniny** nad listą („Tkanina: Inari 22") — te same
   pigułki, żeby klient, który nigdy nie rozwinie listy, też je zobaczył.
3. **Widok zwinięty (pierwsze 5 próbek) — BEZ pigułek.** Kafelki to pojedyncze
   kolory, często z różnych rodzin; pigułki powielałyby się przy każdym kolorze.
4. **Poza kartą produktu — nic.** Świadomie poza zakresem: katalog `/tkaniny`,
   strona `/tkaniny/[slug]`, filtry na `/sklep` (te ostatnie dotykają plików
   przebudowywanych przez otwarty PR #92).

### Model danych

- Migracja **63** (`63_fabric_properties.sql`): `alter table fabrics add column
  properties text[] not null default '{}'`. Typ `text[]` zgodnie z precedensem
  kolumny `colors`. Migracja typu „tylko dodaj kolumnę" — bezpieczna do
  zapuszczenia przed merge'em (wzorzec expand-first).
  Numer 63 to pierwszy wolny na `main` (ostatnia: `62_fabric_short_info.sql`).
- Cecha jest atrybutem **rodziny tkaniny**, nie pojedynczego koloru.
- Zestaw cech jest **zamknięty i trzymany w kodzie**, nie w bazie. Nowy plik
  `app/_lib/fabric-properties.ts` (czysty, bez importów server-only):
  - `FABRIC_PROPERTY_CODES = ["waterproof", "pet_friendly", "easy_clean"]`
    (stała kolejność wyświetlania),
  - typ `FabricPropertyCode`,
  - `parseFabricProperties(input: unknown): FabricPropertyCode[]` — wejście
    defensywne (nie-tablica → `[]`, nie-stringi pomijane, trim, nieznane kody
    odsiane, dedupe, wynik zawsze w kolejności `FABRIC_PROPERTY_CODES`).
  Uzasadnienie zamkniętego zestawu: każda nowa cecha wymaga ikonki i
  tłumaczenia PL/DE, czyli i tak zmiany w kodzie — słownik z CRUD-em w adminie
  byłby panelem, który niczego nie oszczędza.
- `FabricValueMeta` dostaje pole `properties: FabricPropertyCode[]`,
  wypełniane w `buildFabricMetaMap` przez `parseFabricProperties(f.properties)`.
  Sygnatura wejściowa `buildFabricMetaMap` rozszerzona o `properties?: unknown`.

### Panel admina

- W `app/admin/tkaniny/FabricsEditor.tsx`, przy każdej tkaninie, **trzy
  checkboxy** z podpisami PL („Wodoodporna", „Przyjazna zwierzętom", „Łatwa
  w czyszczeniu"). Zero HTML, zero wpisywania z ręki — zgodnie z zasadą
  prostoty panelu.
- `createFabric` i `updateFabric` (`app/admin/tkaniny/actions.ts:160` i `:210`)
  przepuszczają zaznaczenia przez `parseFabricProperties` i zapisują do kolumny
  `properties`; inwalidacja `FABRICS_CACHE_TAG` jak przy pozostałych polach
  tkaniny.

### Render po stronie klienta

- Nowy komponent `app/_components/ui/FabricPropertyBadges.tsx`: dostaje
  `codes: FabricPropertyCode[]` i `locale`, renderuje pigułki (ikonka SVG +
  podpis). Pusta lista → komponent nie renderuje nic (żadnego pustego wiersza).
- Ikonki: inline SVG w komponencie (kropla / łapa / iskry), `fill="currentColor"`,
  bez zewnętrznych zależności i bez emoji.
- Styl pigułki spójny z resztą sklepu: tło i obwódka w tonacji złota
  (`--color-gold` / `--border`), `text-xs`, `rounded-full`. Pigułki zawijają
  się (`flex-wrap`), więc na telefonie schodzą do dwóch wierszy.
- Osadzenia: wiersz nagłówka rodziny w `FabricSwatchGroup` (widok rozwinięty)
  oraz podpis wybranej wartości opcji „Tkanina" w `VariantSelector`.

### Języki

- Podpisy pigułek pochodzą ze słownika w kodzie (`dictionaries`), sekcja
  `fabrics`, klucze per kod cechy — **nie z bazy**. Ola nie tłumaczy nic
  ręcznie, `/de` dostaje niemieckie podpisy od razu.
- Proponowane DE: „Wasserabweisend", „Tierfreundlich", „Pflegeleicht".

### Testy

- Vitest (env node, czyste funkcje):
  - `parseFabricProperties` — poprawne kody, nieznane odsiane, duplikaty,
    wejście nie-tablicowe, kolejność wynikowa stała niezależnie od wejściowej.
  - `buildFabricMetaMap` — `properties` trafia do metadanych każdej wartości
    rodziny; brak kolumny (stary cache) → pusta lista, bez wyjątku.
- E2E (Playwright, wzorzec `variant-tooltip.spec.ts`): na produkcie z tkaniną
  mającą ustawioną cechę pigułka jest widoczna w rozwiniętej liście; przy
  tkaninie bez cech nie ma pustego kontenera. Test pomija się (`test.skip`),
  gdy dane katalogu nie mają żadnej tkaniny z cechą.

## Poza zakresem (świadomie)

- Katalog `/tkaniny` i strona `/tkaniny/[slug]`.
- Filtr cech tkanin na `/sklep` (kolizja z otwartym PR #92).
- Cechy per kolor tkaniny (tylko poziom rodziny).
- Edytowalny w adminie słownik cech, ikonki wgrywane przez admina.
- Automatyczne wypełnienie danych — po wdrożeniu wszystkie tkaniny mają pustą
  listę cech, dopóki ktoś nie zaznaczy checkboxów.

## Ryzyka i uwagi

- **„Wodoodporna" to mocna deklaracja handlowa.** Mechanizm jest neutralny, ale
  cechę należy zaznaczać wyłącznie tam, gdzie deklaruje ją producent tkaniny.
  To decyzja treściowa po stronie sklepu, nie techniczna.
- Cecha dotyczy całej rodziny tkaniny. Jeśli kiedyś okaże się, że w obrębie
  jednej rodziny część kolorów ma powłokę, a część nie, model wymaga zmiany
  (kolumna przy kolorze, nie przy rodzinie). Dziś takiego przypadku nie ma.
- Migracja 63 rezerwuje numer. Otwarty PR #48 (Przelewy24) rezerwuje 47/48,
  PR #92 nie dokłada migracji — bez kolizji. Uwaga niezależna od tego zadania:
  numer **61 był zdublowany** — `main` ma `61_variant_info.sql`, a PR #78
  `61_products_search_key.sql`. Rozstrzygnięte 2026-07-28 przy merge'u main do
  #78: plik z #78 przenumerowany na `65_products_search_key.sql` (na prodzie
  zaaplikowany 2026-07-21 pod starą nazwą; migracja idempotentna, więc ponowne
  uruchomienie to no-op).
