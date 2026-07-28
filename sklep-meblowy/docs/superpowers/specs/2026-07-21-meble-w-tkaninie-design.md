# „Zdjęcia z produkcji" → wybór produktów przy tkaninie

Data: 2026-07-21. Zatwierdzone przez użytkownika. **Zastępuje** podejście ze
specu `2026-07-21-zdjecia-produkcji-tkanin-design.md` (ręcznie wgrywane zdjęcia
produkcyjne + opcjonalny produkt) — to podejście zostało zmergowane (migracja
58) i teraz jest wycofywane na rzecz prostszego modelu „wybierz produkty".

## Kontekst i problem

Świeżo zmergowana funkcja (migracja 58) pozwala adminowi **wgrać zdjęcie z
produkcji** na tkaninę i opcjonalnie podpiąć produkt. Po obejrzeniu działającej
wersji użytkownik uznał, że lepszy jest model jak na katalogu `/tkaniny`: zamiast
wgrywać osobne zdjęcia, admin ma **po prostu wybrać produkty**, a strona tkaniny
pokaże je jako siatkę kafelków (główne zdjęcie produktu + nazwa) linkujących do
karty produktu.

Uwaga do modelu: dawny link „Zobacz produkty z tą tkaniną" (`/sklep?tkanina=`)
był bezużyteczny, bo **każdy produkt jest dostępny w każdej tkaninie** — filtr
zwracał wszystko. Nowy model to **ręczna kuracja**: admin wskazuje wybrane
produkty do pokazania przy danej tkaninie, więc lista niesie informację.

## Cel

1. W adminie tkaniny: zamiast wgrywania zdjęć produkcyjnych — **wyszukiwarka i
   wybór produktów** (bez uploadu). Wybrane produkty jako wiersze z miniaturą.
2. Na stronie tkaniny sekcja **„Meble w tej tkaninie"**: siatka kafelków
   (główne zdjęcie katalogowe produktu + nazwa), kafelek = link do `/produkt/[id]`,
   wygląd jak kafelki katalogu `/tkaniny`.
3. Wycofać stary model (`production_photos` + upload + lightbox tej sekcji).

## Decyzje zatwierdzone

- **Źródło zdjęcia**: główne zdjęcie katalogowe produktu (`images[0]`). Nie
  używamy per-wariantowych `value_images`.
- **Nagłówek**: PL „Meble w tej tkaninie", DE „Möbel in diesem Stoff".
- Kolejność = kolejność dodania (bez przeciągania). Max 20. Ten sam produkt raz
  (dedupe).

## Nie-cele (YAGNI)

- Lightbox / powiększanie (kafelek to link do produktu — jak katalog `/tkaniny`).
- Zmiana kolejności przeciąganiem.
- Automatyczne wykrywanie produktów po `value_images` / wariancie tkaniny.
- Pokazywanie tej listy gdziekolwiek indziej (karta produktu, selektor tkanin).
- Osobna tabela z FK (skala: kilka produktów per tkanina — JSONB jak dotąd).

## Model danych

**Migracja `supabase/migrations/59_fabric_featured_products.sql`**
(idempotentnie; po merge zweryfikować przez MCP `list_tables`, czy auto-apply
zadziałał — lekcja z PR #71; fallback ręczny `apply_migration`):

```sql
alter table public.fabrics
  add column if not exists featured_product_ids jsonb not null default '[]'::jsonb;

alter table public.fabrics
  drop column if exists production_photos;
```

Kolumna `production_photos` (migracja 58, dodana tego samego dnia, praktycznie
bez danych) jest upuszczana. **Przed migracją** zweryfikować przez MCP, czy 58
jest w ogóle zaaplikowana na prodzie i czy jakaś tkanina ma niepuste
`production_photos` (gdyby były realne dane — zgłosić użytkownikowi przed
`drop`). `drop column if exists` jest bezpieczny także gdy 58 nie doszła.

**Typ** (`app/_lib/types.ts`): usunąć `FabricProductionPhoto`; w `Fabric`
zastąpić `production_photos` przez:

```ts
// Wybrane produkty pokazywane w sekcji „Meble w tej tkaninie" (kolejność =
// kolejność w tablicy; max 20 w adminie). Nieznane/nieaktywne id pomijane przy
// renderze.
featured_product_ids: string[];
```

`getAllFabrics` / `getFabricBySlug` używają `select("*")` — nowa kolumna dojdzie
sama; default `[]` w DB, więc typ zawsze tablicą (przy starym cache: `?? []`).

## Pure lib (`app/_lib/fabric-featured-products.ts` — rename z
`fabric-production-photos.ts`)

`parseFeaturedProductIds(input: unknown): string[]` — wzorzec dawnego
`parseProductionPhotos`:

- `input` nie-string → `[]`; zły JSON → `[]`; nie-tablica → `[]`.
- Każdy element: string, `trim`, pomiń puste; **dedupe** (zachowana kolejność
  pierwszego wystąpienia); twardy limit `MAX_FEATURED_PRODUCTS = 20` (nadmiar
  ucinany).

## Admin

- **`FabricForm`** (`app/admin/tkaniny/FabricsEditor.tsx`): sekcję „Zdjęcia z
  produkcji" zastąpić sekcją **„Meble w tej tkaninie"**:
  - **wyszukiwarka** (input filtrujący po nazwie przez `normalizeSearchText`) +
    lista pasujących produktów (nazwa + miniatura) → klik dodaje produkt do
    wybranych; produkty już wybrane wykluczone/oznaczone;
  - **wybrane produkty** jako wiersze: miniatura (`images[0]`) + nazwa + przycisk
    X (usuń). Kolejność = kolejność dodania.
  - serializacja do ukrytego pola `featured_product_ids_json`
    (`JSON.stringify(selectedIds)`), analogicznie do `colors_json`.
  - twardy limit 20 w UI (przycisk/dodawanie zablokowane po 20).
- **Dane pickera** (`app/admin/tkaniny/page.tsx`): rozszerzyć zapytanie do
  `select("id, name, images")` (tylko `is_active`, sort po nazwie). Typ
  `FabricPickerProduct` = `{ id: string; name: string; image: string | null }`
  (miniatura = `images?.[0] ?? null`).
- **Akcje** (`app/admin/tkaniny/actions.ts`):
  - `parseProductionPhotos` → `parseFeaturedProductIds` (z nowego pliku).
  - `validatePhotoProducts` → `validateFeaturedProducts(supabase, ids): Promise<string[]>`
    — jedno `products.select("id").in("id", ids)`; zostają tylko istniejące id
    (zachowana kolejność); przy błędzie zapytania zwrócić `ids` bez zmian (nie
    zerować istniejącego wyboru przez przejściowy błąd DB).
  - `createFabric` / `updateFabric`: czytać `featured_product_ids_json`, zapisać
    do kolumny `featured_product_ids`. Propagacja dopłat bez zmian.

## Strona tkaniny (`app/tkaniny/[slug]/page.tsx`)

- Zamiast dawnej sekcji zdjęć z produkcji: gdy `featured_product_ids.length > 0`,
  dociągnąć produkty jednym zapytaniem przez `createAdminClient`:
  `products.select("id, name, name_de, images").eq("is_active", true).in("id", ids)`.
- Zbudować listę w **kolejności `featured_product_ids`** (mapa po id; pominąć
  nieznalezione/nieaktywne). Każdy element: `{ id, name: pickLocalized(...),
  image: images?.[0] ?? null }`.
- Gdy po odfiltrowaniu lista pusta → sekcja się nie renderuje.
- Render przez nowy **server-component** `app/_components/ui/FabricFeaturedProducts.tsx`
  (bez `"use client"`): siatka `grid grid-cols-2 md:grid-cols-3 gap-6`, kafelek =
  `LocalizedLink href={/produkt/${id}}` z obrazkiem `aspect-[4/3] object-cover`
  (fallback gdy brak zdjęcia — inicjały/placeholder jak w katalogu) + nazwą pod
  spodem, hover jak kafelki katalogu `/tkaniny`.
- Nagłówek sekcji h2 = `t.fabrics.productionHeading`.

## Słownik (`pl.ts` / `de.ts`, sekcja `fabrics`)

- `productionHeading`: PL „Meble w tej tkaninie", DE „Möbel in diesem Stoff"
  (klucz zostaje, zmienia się tekst).

## Pliki dotknięte

- **Nowe**: `supabase/migrations/59_fabric_featured_products.sql`;
  `app/_components/ui/FabricFeaturedProducts.tsx`.
- **Rename**: `app/_lib/fabric-production-photos.ts` →
  `app/_lib/fabric-featured-products.ts` (+ jego test:
  `app/_lib/__tests__/fabric-production-photos.test.ts` →
  `fabric-featured-products.test.ts`, przepisany pod `parseFeaturedProductIds`).
- **Edycja**: `app/_lib/types.ts` (typ `Fabric`, usunięcie `FabricProductionPhoto`);
  `app/admin/tkaniny/actions.ts`; `app/admin/tkaniny/FabricsEditor.tsx`;
  `app/admin/tkaniny/page.tsx`; `app/tkaniny/[slug]/page.tsx`;
  `app/_lib/dictionaries/pl.ts`, `de.ts` (tekst nagłówka);
  `app/_lib/__tests__/fabric-groups.test.ts` (fixture: `production_photos: []`
  → `featured_product_ids: []`).
- **Usuń**: `app/_components/ui/FabricProductionPhotos.tsx`.
- **Bez zmian**: `ImageLightbox.tsx` (nadal używany przez wzornik
  `FabricSwatchGrid`), `variants.ts`, propagacja dopłat, katalog `/tkaniny`,
  sitemap, `FabricSwatchGrid`.

## Przypadki brzegowe

- Wybrany produkt usunięty/dezaktywowany → pomijany na stronie (lookup po
  `is_active`); w adminie walidacja odrzuca nieznane id. Żaden błąd.
- Ten sam produkt dodany dwa razy → dedupe w parserze i w UI.
- Brak wybranych / wszystkie nieaktywne → sekcja się nie renderuje.
- Produkt bez zdjęcia (`images` puste) → kafelek z placeholderem/inicjałami.
- Stary cache bez kolumny → `featured_product_ids ?? []`.

## Testy

- **Unit (pure)**: `parseFeaturedProductIds` — poprawne id, odrzucanie
  nie-stringów/pustych, dedupe z zachowaniem kolejności, limit 20, zły JSON →
  `[]`, nie-tablica → `[]`.
- Reszta: `tsc` + lint + build + smoke po deployu (strona tkaniny z/bez wybranych
  produktów; admin: dodanie/usunięcie produktu, zapis).

## Uwagi wdrożeniowe

- Deploy = merge PR do main; migracja: **przed** — sprawdzić przez MCP stan 58 i
  ewentualne dane w `production_photos`; **po** — `list_tables` czy 59 doszła
  (auto-apply potrafi nie zadziałać — lekcja z PR #71), fallback MCP
  `apply_migration`.
- Konto gh: Woodecky10.
- Implementacja: delegować subagentom na Opusie (stała zasada), review po każdym
  tasku.
