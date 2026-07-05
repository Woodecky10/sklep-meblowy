# Filtr tkanin na /sklep (naprawa filtra materiałów) — design

Data: 2026-07-05. Zatwierdzone przez użytkownika (2 decyzje produktowe niżej).

## Kontekst i problem (root cause z dowodami)

Filtr „Materiał" na `/sklep` opiera się w całości na kolumnie `products.material`:
facety = `select material, material_de from products where material is not null`
(`products.ts:316-328`), filtrowanie = `.in("material", materials)` (`products.ts:129`).
Stan danych (zweryfikowany na prod przez Supabase MCP, 2026-07-05):

- 23/28 aktywnych produktów ma `material` NULL/puste → filtr „widzi" 5 produktów.
- Realne dane o tkaninach żyją w `variants.options` (opcja „Tkanina", wartości
  formatu „Rodzina numer", np. „Poso 105") — 26/28 produktów, 10 rodzin tkanin.
- 9/12 tkanin z katalogu `fabrics` (Poso, Tilia, Vena, Chill Me, Inari, Quelle,
  Woolly, Baloo, Manila) nie występuje w ŻADNYM `products.material` → **„nie można
  wyszukać niektórych materiałów"** (zgłoszenie użytkownika).
- Śmieci w kolumnie: „sztruks" (faktura, nie tkanina; produkt ma tkaninę Poso),
  „Monolith + Solar" (sklejona wartość), material_de „Cord".
- Edge case'y w wariantach: opcja pisana „TKANINA" (sofa Fado); narożnik FADO L
  trzyma tkaniny w opcji „Wariant" z wartościami combo „Monolith 84 + Solar 99".

Root cause: filtr filtruje po martwej kolumnie; źródło prawdy o tkaninach to
opcje wariantów + katalog `fabrics`.

## Decyzje produktowe (odpowiedzi użytkownika)

1. **Nazwa „Materiał"→„Tkanina" TYLKO w filtrze na /sklep** (nagłówek pill +
   chipy aktywnych filtrów). DE: „Material"→„Stoff". Wiersz „Materiał" w
   Specyfikacji na karcie produktu zostaje bez zmian.
2. **Facety = UNIA dwóch źródeł**: rodziny tkanin realnie użyte w aktywnych
   produktach (z wariantów × katalog `fabrics`) + dotychczasowe wartości kolumny
   `products.material` (nic nie znika — „sztruks", „Monolith + Solar" zostają).
3. (Z prezentacji designu, bez sprzeciwu) **Param URL `material` → `tkanina`**,
   spójnie z resztą polskich paramów (`kolor`, `cena_od`, `sortuj`…). Stare linki
   `?material=` przestają filtrować (stary filtr i tak pokrywał 5/28 produktów).

## Semantyka dopasowania

Produkt pasuje do wybranej wartości `V`, gdy:
- `V` ∈ `deriveFabricFamilies(product.variants, nazwyKatalogu)` (rodzina tkaniny
  wyprowadzona z wartości opcji wariantów), **LUB**
- `V` == `product.material` (dokładna wartość kolumny — legacy).

Wybór wielu wartości = OR między wartościami (jak dotąd: SQL IN → teraz unia id).

## Wyprowadzanie rodzin — `app/_lib/fabric-filter.ts` (czysty moduł, TDD)

- `deriveFabricFamilies(variants: ProductVariants | null, familyNames: string[]): string[]`
  — zwraca kanoniczne nazwy rodzin (pisownia z katalogu), których nazwa występuje
  jako **osobne słowo/prefiks** w JAKIEJKOLWIEK wartości JAKIEJKOLWIEK opcji
  (nie tylko „Tkanina" — łapie też „TKANINA" i „Wariant" z combo). Dopasowanie
  case-insensitive na granicach słów: „Poso 105" → Poso; „Monolith 84 + Solar 99"
  → Monolith i Solar; „Chill Me 22" → Chill Me; wartość równa samej nazwie też
  pasuje. Bez fałszywych trafień typu „Solaris" → Solar (granica słowa).
- `productMatchesFabric(variants, material: string | null, selected: string[], familyNames: string[]): boolean`
  — implementuje semantykę dopasowania (rodziny ∪ legacy material, exact).
- Moduł bez importów server-only — testowalny w node (konwencja repo).

## Facety — `getFilterFacets` (products.ts)

- Pobiera: (a) `variants, material, material_de` z `products` klientem anon
  (RLS ogranicza do aktywnych — jak dotąd), (b) katalog `fabrics`
  (`name, name_de, sort_order`) przez istniejącą ścieżkę server-side (fabrics ma
  RLS admin-only — czytane createAdminClient, wzorzec jak `getFabricDeMap`).
- Buduje facety tkanin: rodziny z (a)×(b) przez `deriveFabricFamilies` —
  `value` = nazwa PL z katalogu, `label` = `name_de` na /de (fallback PL).
  Pokazujemy TYLKO rodziny użyte w aktywnych produktach (Baloo/Manila — martwe
  pozycje katalogu — nie zaśmiecają listy).
- Dokłada legacy wartości `material` (te, których nie ma już na liście rodzin;
  dedupe po value PL), `label` z `material_de` jak dotąd (buildLocalizedFacets).
- Sortowanie: jak dotąd `localeCompare` po labelu.
- Kolory: bez zmian.

## Filtrowanie — `getProducts` (products.ts)

Gdy filtr tkanin aktywny: przed głównym zapytaniem pobierz lekko
(`id, variants, material` klientem anon) wszystkie produkty, policz pasujące
`ids` czystą funkcją i dodaj `.in("id", ids)` do głównego zapytania (paginacja,
sortowanie, pozostałe filtry zostają w DB — AND-semantyka zachowana).
`ids` puste → zwróć pusty wynik bez głównego zapytania (kształt zwrotki bez
zmian). Skala: ~28 produktów — koszt pomijalny; zawsze spójne z danymi (zero
denormalizacji/migracji).

## UI / i18n

- Słownik: `filter.material` zmienia WARTOŚCI: PL „Materiał"→„Tkanina",
  DE „Material"→„Stoff" (klucz zostaje — zero churnu typów; test parytetu PL/DE
  przechodzi bez zmian struktury). `product.specMaterial` NIE ruszamy (decyzja 1).
- `FilterBar.tsx`: odczyt/zapis parametru `tkanina` zamiast `material`
  (etykiety idą ze słownika — pill, chip „Tkanina: Poso", aria-label „Usuń filtr"
  automatycznie).
- `app/sklep/page.tsx`: typ SearchParams `tkanina?: string`, parsowanie,
  propagacja do paginacji (rawParams).
- /de działa od razu: `value` zawsze kanoniczne PL (kontrakt istniejący),
  `label` z `fabrics.name_de` / `material_de`.

## Nie-cele (YAGNI)

- Zmiany schematu DB / denormalizacja rodzin do kolumny (28 produktów — liczenie
  przy odczycie wystarcza; jak katalog urośnie o rząd wielkości, wtedy kolumna).
- Wyszukiwarka tekstowa (SearchBox) — osobny mechanizm, poza zakresem.
- Panel admina (pole „Materiał (do filtra)" zostaje — nadal zasila Specyfikację
  i legacy facety).
- Uzupełnianie/czyszczenie danych kolumny material (decyzja 2 czyni to zbędnym).
- Przekierowanie starego parametru `?material=`.

## Testy

- `app/_lib/__tests__/fabric-filter.test.ts` (node, describe/it PL z „→"):
  - deriveFabricFamilies: „Poso 105"→[Poso]; „TKANINA" uppercase; opcja „Wariant"
    z „Monolith 84 + Solar 99"→[Monolith, Solar]; „Chill Me 22"→[Chill Me];
    wartość == nazwie; case-insensitive; granica słowa (Solaris ≠ Solar);
    variants null / bez opcji → []; kanoniczna pisownia z katalogu w wyniku.
  - productMatchesFabric: match po rodzinie; match po legacy material (exact);
    OR wielu wartości; brak matcha → false.
- Weryfikacja końcowa: tsc/eslint/pełny vitest/build + smoke na dev
  (/sklep?tkanina=Poso zwraca narożniki VEGAS; /de/sklep pokazuje „Stoff",
  etykiety DE tkanin; chip i usuwanie filtra działają).

## Gałąź i wdrożenie

- Gałąź `feat/filtr-tkaniny` od `main` (df018c0). Zero migracji DB.
- Przed kodem: docsy Next w `node_modules/next/dist/docs/` w razie wątpliwości
  (AGENTS.md); zmiany nie dodają nowych API Next.
- Po implementacji: weryfikacja, merge do main, push (deploy prod).
