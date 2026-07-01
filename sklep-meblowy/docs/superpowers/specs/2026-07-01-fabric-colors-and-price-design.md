# Tkaniny z numerami kolorów + dopłata (cena)

Data: 2026-07-01

## Cel

Tkanina to kolekcja (np. „Monolith") z wieloma **numerami kolorów** (02, 04,
09…). Admin definiuje kolekcję + jej kolory + dopłatę raz w katalogu; przy
produkcie wybiera kolekcje, a warianty rozwijają się na wartości „kolekcja +
numer" z dopłatą. Reużywa istniejący mechanizm dopłat per wartość.

## Stan obecny

- `fabrics`: name, name_de, sort_order (bez koloru, bez ceny).
- Opcja wariantu „Tkanina" (`FABRIC_OPTION_NAME`), values = nazwy tkanin.
- Dopłaty per wartość (`value_prices`) już działają dla „Tkanina".
- Picker (`FabricPicker`) zaznacza tkaniny po nazwie; `applyFabricSelection`
  ustawia values = zaznaczone nazwy.

## Zakres

### 1. DB — migracja 40_fabric_colors_price.sql
```sql
alter table public.fabrics add column if not exists colors text[] not null default '{}';
alter table public.fabrics add column if not exists price  numeric(10,2) not null default 0 check (price >= 0);
```
Additywne, bezpieczne. Zastosować też do bazy produkcyjnej (Supabase nie
migruje przy deployu).

### 2. Typ `Fabric` (types.ts)
Dodać `colors: string[]` i `price: number`. Kod defensywny: `colors ?? []`,
`price ?? 0` (gdyby DB jeszcze bez kolumn).

### 3. Katalog admina (tkaniny/actions.ts + FabricsEditor)
- Formularz: pole „Kolory / numery" (textarea, rozdzielane przecinkiem/nową
  linią/spacją → `string[]`, trim + dedupe) i „Dopłata (zł)" (number ≥ 0).
- Karta tkaniny: pokaż liczbę kolorów i dopłatę.
- create/update: parsują `colors` i `price`.

### 4. Helpery (variants.ts, czyste + testowalne)
- `FabricLite = { name; colors: string[]; price: number }`.
- `expandFabrics(fabrics: FabricLite[]): { values: string[]; valuePrices: Record<string,number> }`
  — dla każdej: `colors.length ? colors.map(c => `${name} ${c}`) : [name]`;
  `valuePrices[value] = price` gdy price>0. Zachowuje kolejność, dedupe.
- `fabricValueBelongsTo(value, fabric)` — `value===name` lub
  `value.startsWith(name+" ")` i reszta ∈ colors. Do seedowania pickera i
  wykrywania „sierot".
- `applyFabricSelection(options, combinations, values: string[], valuePrices)` —
  zmieniona sygnatura: przyjmuje gotowe values + value_prices. Pusty → usuwa
  opcję „Tkanina"; inaczej ustawia `{name, values, value_prices}` +
  `rebuildCombinations` + `applyValuePricing`.

### 5. Picker w VariantsEditor (poziom kolekcji)
- Checkboxy = kolekcje z katalogu. Seed „zaznaczone" = kolekcje, których
  jakakolwiek wartość jest obecna (`fabricValueBelongsTo`).
- Wartości obecne, nienależące do żadnej kolekcji z katalogu = „spoza katalogu"
  — pokazywane jako zachowywane (można odznaczyć, by usunąć).
- Apply: `values = expandFabrics(zaznaczone kolekcje).values ∪ zachowane sieroty`;
  `valuePrices` analogicznie (sieroty zachowują istniejące dopłaty).

### 6. Sklep / DE (bez zmian)
Wartości „Monolith 02" renderują się w `VariantSelector` z dopłatą (już działa).
Mapa DE mapuje po nazwie kolekcji — dla „Monolith 02" brak wpisu → fallback do
PL. Akceptowalne (numery są neutralne językowo, nazwy kolekcji to brandy).

## Zgodność wsteczna

Tkaniny bez kolorów → wartość = sama nazwa (jak dziś). Istniejące produkty i
warianty działają bez zmian. Dopłaty istniejących wartości zachowane.

## Testy / weryfikacja

- Vitest: `expandFabrics` (z kolorami / bez / dopłata), `fabricValueBelongsTo`,
  zaktualizowane testy `applyFabricSelection` (nowa sygnatura).
- Build + lint + pełny suite. Playwright na koniec (opcjonalnie).
- Migracja zastosowana do prod DB (additywna).

## Poza zakresem (YAGNI)

- Dwa zależne selekty (Tkanina → Numer) — combined value wystarcza na teraz.
- Zdjęcia/próbki kolorów w katalogu.
- Dopłata per pojedynczy numer koloru (dopłata jest per kolekcja; admin może
  dostroić per wartość istniejącym polem „+zł").
