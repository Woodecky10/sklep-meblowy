# Spec: Własne cechy tkanin (edytowalny słownik w panelu)

Data: 2026-07-27
Status: zatwierdzony projekt

## Kontekst (stan obecny, po PR #96)

- Cechy tkanin są **zamknięte w kodzie**: `app/_lib/fabric-properties.ts` eksportuje
  `FabricPropertyCode = "waterproof" | "pet_friendly" | "easy_clean"`,
  `FABRIC_PROPERTY_CODES` (stała kolejność) i `parseFabricProperties(unknown)`,
  która odsiewa wszystko spoza tej trójki.
- Zaznaczenia leżą w `fabrics.properties text[]` (migracja 63, na prodzie).
- Podpisy PL/DE są w słownikach w kodzie: `t.fabrics.propertyWaterproof`,
  `propertyPetFriendly`, `propertyEasyClean` (`app/_lib/dictionaries/pl.ts`, `de.ts`).
- Ikonki to inline SVG zaszyte w `app/_components/ui/FabricPropertyBadges.tsx`
  (mapa `ICONS: Record<FabricPropertyCode, ReactNode>`).
- Panel: trzy checkboxy w `app/admin/tkaniny/FabricsEditor.tsx` (stała
  `PROPERTY_LABELS_PL`), zapis w `createFabric`/`updateFabric`
  (`app/admin/tkaniny/actions.ts`) przez `parseFabricProperties(formData.getAll("properties"))`.
- Dane docierają do klienta trasą `buildFabricMetaMap` → `FabricValueMeta.properties`
  → `getFabricMetaMap()` → `FabricMetaProvider` → `useFabricMeta()` → `VariantSelector`.
- Wzorzec małego, edytowalnego słownika w tym samym panelu już istnieje:
  tabela `fabric_groups` (migracja 57: `code` niezmienny, `name`/`name_de`/`sort_order`
  edytowalne, RLS „tylko admin", odczyt server-side przez service role) plus
  `app/admin/tkaniny/FabricGroupsPanel.tsx`.
- Wzorzec stabilnego identyfikatora: `fabricSlug(name, taken)` w `app/_lib/fabric-slug.ts`
  (slug generowany raz przy tworzeniu, niezmienny przy zmianie nazwy).

## Cel

Osoba obsługująca sklep może **dodać własną cechę tkaniny** (nazwa, tłumaczenie DE,
ikonka) bez udziału programisty, a trzy istniejące cechy stają się edytowalne na tych
samych zasadach.

## Zakres — zatwierdzone decyzje

### Model danych

- Migracja **64** (`64_fabric_property_defs.sql`), wzorowana na 57:
  ```sql
  create table if not exists public.fabric_property_defs (
    id          uuid primary key default uuid_generate_v4(),
    code        text not null unique,
    label       text not null,
    label_de    text,
    icon        text not null,
    sort_order  int  not null default 0,
    created_at  timestamptz not null default now()
  );
  ```
  RLS identyczna jak `fabric_groups`: `enable row level security` + polityka
  „admin all" na `authenticated` po `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
  Odczyt publiczny idzie server-side przez service role, jak przy `fabrics`.
- Seed w tej samej migracji (`on conflict (code) do nothing`) — trzy obecne cechy
  z ich dzisiejszymi podpisami i ikonkami:
  `waterproof` / „Wodoodporna" / „Wasserabweisend" / `drop` / 0,
  `pet_friendly` / „Przyjazna zwierzętom" / „Tierfreundlich" / `paw` / 1,
  `easy_clean` / „Łatwa w czyszczeniu" / „Pflegeleicht" / `sparkle` / 2.
- `fabrics.properties text[]` **bez zmian** — dalej trzyma kody, a kody trzech
  obecnych cech pozostają identyczne. Zero migracji danych.
- `code` generowany ze slugu nazwy przy tworzeniu (wzorzec `fabricSlug`), potem
  **niezmienny**: zmiana nazwy nie odpina cechy od tkanin.

### Biblioteka ikonek

- Ikonki zostają w kodzie (SVG to kod); w bazie leży tylko klucz.
- Dokładnie dziesięć kluczy, w tej kolejności prezentacji w panelu:
  `drop`, `paw`, `sparkle`, `leaf`, `shield`, `sun`, `flame`, `weave`, `durability`,
  `breathable`.
- Nieznany klucz ikonki (np. usunięty z kodu) → pigułka renderuje się **bez ikonki**,
  nigdy nie wysypuje strony.

### Panel admina

- Nowa karta „Cechy tkanin" w `/admin/tkaniny`, obok „Grup cenowych"
  (`FabricPropertiesPanel.tsx`, wzorzec `FabricGroupsPanel.tsx`): lista cech z edycją
  nazwy, nazwy DE, ikonki (siatka piktogramów do kliknięcia) i kolejności, formularz
  dodania nowej, przycisk usunięcia.
- Checkboxy przy tkaninie w `FabricsEditor.tsx` generują się **z listy z bazy**,
  nie ze stałej — nowa cecha pojawia się przy wszystkich tkaninach automatycznie.
- **Usuwanie cechy używanej przez tkaniny:** potwierdzenie pokazuje licznik
  („używają jej N tkanin"), a po zatwierdzeniu cecha znika również z tych tkanin
  (`update fabrics set properties = array_remove(properties, $code)`). Blokada
  byłaby gorsza: zmuszałaby do ręcznego odznaczania w kilkunastu tkaninach.
- Po każdej zmianie inwalidacja cache definicji **i** cache tkanin.

### Klient

- Wizualnie bez zmian — te same pigułki w tych samych dwóch miejscach karty produktu.
- `FabricValueMeta.properties` przestaje być listą kodów, a staje się listą
  **rozwiązanych definicji** (`FabricPropertyDef[]`), posortowaną po `sort_order`;
  kody bez definicji są odsiewane.
- Podpisy pochodzą z bazy (`label` / `label_de` przez `pickLocalized`), więc trzy
  klucze `propertyWaterproof`/`propertyPetFriendly`/`propertyEasyClean` znikają ze
  słowników PL i DE. Puste `label_de` → fallback do `label`.
- **Odporność:** błąd zapytania o definicje (np. brak tabeli przed migracją) → pusta
  lista definicji → karta produktu renderuje się bez pigułek, bez wyjątku.

### Testy

- Vitest (env `node`, czyste funkcje):
  - `propertyCodeSlug` — slug z nazwy, polskie znaki, kolizje `-2`/`-3`, pusta nazwa → fallback,
  - `resolveFabricProperties(codes, defs)` — kolejność po `sort_order` niezależnie od
    kolejności kodów, odsiew kodów bez definicji, dedupe, wejście nie-tablicowe → `[]`,
  - `buildFabricMetaMap` z definicjami — cechy na każdej wartości rodziny, brak
    definicji → pusta lista,
  - render `FabricPropertyBadges` (`renderToStaticMarkup`, jak dziś) — pusta lista →
    zero markupu, nieznany klucz ikonki → pigułka bez ikonki, DE fallback do PL.
- E2E `e2e/fabric-properties.spec.ts` zostaje bez zmian (podpisy nadal te same).

## Poza zakresem (świadomie)

- Wgrywanie własnych plików SVG/PNG jako ikonek.
- Cechy per kolor tkaniny (dalej tylko poziom rodziny).
- Pokazywanie cech poza kartą produktu (`/tkaniny`, filtry `/sklep`).
- Tłumaczenia inne niż PL/DE.

## Ryzyka i uwagi

- **Kolejność wdrożenia jest twarda, tak jak przy migracji 63:** migracja 64 musi być
  na produkcji **przed** deployem kodu i przed otwarciem PR-a (preview dzieli bazę
  z produkcją). Panel i karta produktu odpytują nową tabelę; bez niej panel tkanin
  nie wyrenderuje checkboxów, a zapis cech nie zadziała. Karta produktu jest
  zabezpieczona i pokaże się bez pigułek.
- Usunięcie cechy jest nieodwracalne w tym sensie, że kasuje zaznaczenia w tkaninach —
  stąd wymóg potwierdzenia z licznikiem.
- Dziesięć ikonek to kompromis: cecha, która nie pasuje do żadnej, dostanie „mniej
  więcej pasującą". Dorzucenie jedenastej to jedna linijka w kodzie.
