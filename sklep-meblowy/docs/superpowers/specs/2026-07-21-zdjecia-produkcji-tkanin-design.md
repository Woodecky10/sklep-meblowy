# Zdjęcia z produkcji na stronie tkaniny (zamiast linku do sklepu)

Data: 2026-07-21. Zatwierdzone przez użytkownika (wariant: **zdjęcie z produkcji +
opcjonalnie podpięty produkt**, model JSONB na tkaninie). Follow-up do specu
2026-07-21-grupy-cenowe-tkanin (PR #71/#72 — zmergowane).

## Kontekst i problem

Strona tkaniny (`app/tkaniny/[slug]/page.tsx`) kończy się przyciskiem
„Zobacz produkty z tą tkaniną" → `/sklep?tkanina=<nazwa>`. **Każdy produkt jest
dostępny w każdej tkaninie**, więc filtr zwraca (docelowo) wszystkie produkty —
link nie niesie informacji. Sklep ma za to **zdjęcia z produkcji** (mebel uszyty
w konkretnej tkaninie) — klient powinien widzieć tkaninę na prawdziwym meblu,
nie na wygenerowanym zdjęciu katalogowym.

## Cel

1. Usunąć przycisk „Zobacz produkty z tą tkaniną" (i martwy klucz słownika).
2. Na stronie tkaniny sekcja **„Ta tkanina na naszych meblach"**: ręcznie wgrywane
   zdjęcia z produkcji; każde może mieć podpięty produkt — wtedy zdjęcie jest
   klikalną kartą (podpis = nazwa produktu) prowadzącą do `/produkt/[id]`.
3. Admin zarządza zdjęciami w formularzu tkaniny (`/admin/tkaniny`).

## Nie-cele (YAGNI)

- Lightbox / powiększanie zdjęć.
- Pokazywanie tych zdjęć na karcie produktu lub w selektorze tkanin.
- Osobne podpisy/alt per zdjęcie (alt = nazwa produktu, fallback nazwa tkaniny).
- Zmiana kolejności przeciąganiem (kolejność = kolejność wierszy w formularzu).
- Osobna tabela z FK (skala: kilka zdjęć per tkanina — JSONB jak `color_images`).

## Model danych

**Migracja `supabase/migrations/58_fabric_production_photos.sql`** (uwaga z
lekcji PR #71: po merge zweryfikować przez `list_tables`, czy auto-apply
zadziałał; jeśli nie — ręcznie przez MCP `apply_migration`, idempotentnie):

```sql
alter table public.fabrics
  add column if not exists production_photos jsonb not null default '[]'::jsonb;
```

**Typ** (`app/_lib/types.ts`), obok `Fabric`:

```ts
export type FabricProductionPhoto = {
  url: string;              // zdjęcie z produkcji (nasz storage)
  product_id: string | null; // opcjonalnie produkt widoczny na zdjęciu
};
```

`Fabric` + `production_photos: FabricProductionPhoto[]`. Kolejność = kolejność
w tablicy. Brak FK — martwy `product_id` (produkt usunięty/nieaktywny) jest
obsługiwany przy renderze (zdjęcie bez linku), nic nie pęka.

## Admin

- **`FabricForm`** (`app/admin/tkaniny/FabricsEditor.tsx`): nowa sekcja
  **„Zdjęcia z produkcji"** — dynamiczne wiersze (wzorzec sekcji „Kolory /
  numery"): miniatura + upload (`uploadProductImageFile` z
  `app/admin/produkty/[id]/_shared.tsx:21` + `compressIfNeeded`) + **wybór
  produktu z szukajką po nazwie** (wzorzec `PickerProduct` +
  `normalizeSearchText` z `app/admin/zestawy/BundlesEditor.tsx`; puste = zdjęcie
  bez produktu) + usuwanie wiersza. Serializacja do ukrytego pola
  `production_photos_json` (jak `colors_json`).
- **Dane pickera**: `app/admin/tkaniny/page.tsx` dociąga listę produktów
  (id, name — jak zestawy) i przekazuje przez `FabricsEditor` do `FabricForm`.
- **Akcje** (`app/admin/tkaniny/actions.ts`): `parseProductionPhotos(input)` —
  wzorzec `parseColorRows`: JSON parse, tylko URL http(s), `product_id` =
  niepusty string albo null, twardy limit 20 wierszy (nadmiar ucinany); **walidacja serwerowa
  istnienia produktów**: jedno zapytanie `products.select("id").in(...)`,
  nieznane id → null (zdjęcie zostaje, link nie). Zapis w `createFabric` /
  `updateFabric`. Propagacja dopłat NIE dotyczy tego pola (bez zmian).

## Strona tkaniny (`app/tkaniny/[slug]/page.tsx`)

- **Usunąć** blok `LocalizedLink` „Zobacz produkty z tą tkaniną".
- Po sekcji wzornika, gdy `production_photos.length > 0`, sekcja
  **„Ta tkanina na naszych meblach"** (nagłówek h2 jak wzornik):
  - dociągnięcie podpiętych produktów jednym zapytaniem
    (`products.select("id, name, name_de, is_active").in("id", ids)` przez
    `createAdminClient`, tylko `is_active`),
  - siatka (2 kol. mobile / 3 desktop): zdjęcie `aspect-[4/3] object-cover`,
    zaokrąglenia/obwódki jak kafelki katalogu;
  - zdjęcie z aktywnym produktem → `LocalizedLink` do `/produkt/[id]`, podpis
    pod zdjęciem = `pickLocalized(name, name_de)`, hover jak kafelki katalogu;
  - zdjęcie bez produktu / produkt nieaktywny lub nieznaleziony → sam `<img>`
    bez linku i bez podpisu; `alt` = nazwa produktu lub nazwa tkaniny.
- Brak zdjęć → sekcja nie renderuje się wcale.

## Słownik (`pl.ts` / `de.ts`, sekcja `fabrics`)

- **Usunąć** `seeProducts` (PL i DE) — jedyne użycie znika.
- **Dodać** `productionHeading`: PL „Ta tkanina na naszych meblach",
  DE „Dieser Stoff auf unseren Möbeln".

## Przypadki brzegowe

- Produkt podpięty, potem usunięty/dezaktywowany → zdjęcie renderuje się bez
  linku (lookup po `is_active`); żaden błąd.
- Ten sam produkt podpięty do wielu zdjęć → dozwolone (różne ujęcia).
- Upload pliku nie-obrazka / za duży → istniejąca ścieżka `uploadProductImageFile`
  (komunikat błędu z helpera).
- Stare tkaniny bez kolumny w cache: `getAllFabrics` ma `select("*")` — nowa
  kolumna dojdzie sama; default `[]` w DB, więc typ zawsze tablicą.

## Pliki dotknięte

- **Nowe:** `supabase/migrations/58_fabric_production_photos.sql`.
- **Edycja:** `app/_lib/types.ts` (typ + pole); `app/admin/tkaniny/actions.ts`
  (parse + zapis + walidacja produktów); `app/admin/tkaniny/FabricsEditor.tsx`
  (sekcja wierszy + prop z produktami); `app/admin/tkaniny/page.tsx` (lista
  produktów do pickera); `app/tkaniny/[slug]/page.tsx` (sekcja + usunięcie CTA);
  `app/_lib/dictionaries/pl.ts`, `de.ts` (klucze).
- **Bez zmian:** `variants.ts`, propagacja dopłat, katalog `/tkaniny`, sitemap.

## Testy

- **Unit (pure):** `parseProductionPhotos` (poprawne wiersze, odrzucanie złych
  URL-i, puste `product_id` → null, limit, zły JSON → `[]`) — rozszerzenie
  testów akcji/`fabrics.test.ts` wg wzorca repo.
- Reszta: `tsc` + lint + build + smoke po deployu (strona tkaniny z/bez zdjęć).

## Uwagi wdrożeniowe

- Deploy = merge PR do main; migracja: sprawdzić po deployu `list_tables`
  (auto-apply potrafi nie zadziałać — lekcja z PR #71), fallback MCP.
- Konto gh: Woodecky10.
