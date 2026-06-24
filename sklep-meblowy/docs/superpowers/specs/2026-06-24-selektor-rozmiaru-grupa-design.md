# Selektor rozmiaru przez grupę produktów (linki między aukcjami)

**Data:** 2026-06-24
**Branch:** `feat/selektor-rozmiaru-grupa`
**Status:** zaakceptowany design, przed planem implementacji

## Problem

Ten sam mebel (np. łóżko) istnieje w sklepie jako **osobne produkty/aukcje per rozmiar**
— każdy pod własnym adresem `/produkt/[id]`, z własną ceną, stockiem, zdjęciami.
Klient na stronie jednego rozmiaru nie ma jak przejść do innego rozmiaru tego samego
mebla. Cel: **kompaktowy selektor rozmiaru** przy przycisku „dodaj do koszyka", w którym
kliknięcie w inny rozmiar przenosi do odpowiedniej aukcji.

Rozmiary to osobne aukcje (linki **wewnętrzne** do innych produktów w tym sklepie).
Niezależnie od rozmiaru, ten sam mebel ma też warianty wybierane NA stronie (kolor,
strona narożnika) — obecny silnik kombinacji (`ProductVariants`) **musi zostać nietknięty**.

## Wybrane podejście (B): grupa rozmiarów przez wspólny klucz

Każdy produkt-rozmiar dostaje wspólny klucz grupy + etykietę swojego rozmiaru. Strona
produktu pobiera „rodzeństwo" z tym samym kluczem (dokładnie jak istniejące
`getCollectionSiblings`) i renderuje selektor: bieżący rozmiar podświetlony, pozostałe
to linki.

Zalety: auto-spójność (dodanie kolejnego rozmiaru z tym samym kluczem pojawia się
wszędzie automatycznie), minimalny schemat (2 kolumny), nie rusza silnika wariantów,
trywialne dla nietechnicznego admina (dwa pola tekstowe + autouzupełnianie kluczy).

Odrzucone:
- **A — link wpięty w `ProductVariants`**: psuje silnik kombinacji (rozmiary „obce" nie
  są realnymi kombinacjami danego produktu; mieszane z kolorem/stroną dają bezsensowne
  kombinacje).
- **C — ręczne linki rodzeństwa per produkt**: duplikacja N×(N−1), „footgun" przy
  dodaniu rozmiaru (trzeba edytować wszystkie pozostałe aukcje).

## 1. Model danych — migracja `supabase/migrations/35_size_groups.sql`

```sql
alter table products
  add column size_group text,
  add column size_label text;

create index products_size_group_idx
  on products (size_group)
  where size_group is not null;
```

- `size_group` — wspólny klucz grupy (np. `loze-vegas`); ten sam na wszystkich rozmiarach.
- `size_label` — etykieta tego rozmiaru (np. `140×200 cm`).
- Indeks częściowy pod lookup rodzeństwa.

Typ `Product` (`app/_lib/types.ts`) — dwa nowe pola:
```ts
size_group: string | null;
size_label: string | null;
```
Przechodzą przez `select("*")` i `localizeProduct` (które robi `...row`) bez zmian.
Etykieta typu „140×200 cm" jest uniwersalna PL/DE — brak kolumn `_de` (jak wymiary).

## 2. Warstwa odczytu — `app/_lib/products.ts`

### `getSizeSiblings(sizeGroup, locale)`
```ts
export async function getSizeSiblings(
  sizeGroup: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]>
```
- Anon client (`createClient`) → respektuje RLS `is_active`, więc ukryte produkty nie
  pojawią się w selektorze automatycznie.
- `select("*").eq("size_group", sizeGroup)` (zawiera też bieżący produkt — builder go oznaczy).
- `.map((p) => localizeProduct(p, locale))`.

### Czysty helper `buildSizeOptions(siblings, currentId)`
```ts
export type SizeOption = { id: string; label: string; current: boolean };

export function buildSizeOptions(
  siblings: Pick<Product, "id" | "size_label" | "name">[],
  currentId: string
): SizeOption[]
```
- Mapuje na `{ id, label, current }`; `label = size_label?.trim() || name` (fallback do nazwy gdy etykieta pusta).
- Sortuje naturalnie po etykiecie: `a.label.localeCompare(b.label, undefined, { numeric: true })`
  (140 < 160 < 180).
- `current = (id === currentId)`.
- Zwraca `[]` gdy wynik ma < 2 pozycji (jedna aukcja = brak sensu selektora).

Czysty, testowalny bez mockowania Supabase (wzorzec jak `app/_lib/variants.ts`).

## 3. Render — strona produktu

### `app/produkt/[id]/page.tsx` (server)
- Po `getProduct`, jeśli `product.size_group`:
  ```ts
  const sizeSiblings = await getSizeSiblings(product.size_group, locale);
  const sizeOptions = buildSizeOptions(sizeSiblings, product.id);
  ```
  (dołączyć do istniejącego `Promise.all`, gdzie ma to sens; w przeciwnym razie `[]`).
- Przekazać `sizeOptions` do `ProductMainSection`.

### `app/_components/ui/ProductMainSection.tsx`
- Nowy prop `sizeOptions: SizeOption[]`.
- Render nowego komponentu `<SizeSelector options={sizeOptions} />` **NAD `<ProductActions>`**
  (czyli nad selektorem koloru/strony), tylko gdy `sizeOptions.length >= 2`.

### Nowy `app/_components/ui/SizeSelector.tsx` ("use client")
- Nagłówek: `t.product.sizeLabel` (PL „Rozmiar" / DE „Größe"), styl jak etykieta opcji w `VariantSelector`.
- Chipy w stylu `VariantSelector`:
  - `current` → podświetlony (gold), `aria-current="true"`, **nieklikalny** (`<span>`).
  - pozostałe → `LocalizedLink` do `/produkt/{id}` (zachowuje prefiks `/de`).
- Obecny `VariantSelector` (kombinacje) **bez zmian**.

## 4. Admin — edytor produktu

### `app/admin/produkty/[id]/ProductEditor.tsx` — sekcja „Podstawowe dane"
Dwa nowe pola w istniejącym `<form action={updateProductBasics}>`:
- **Grupa rozmiarów (klucz)** — `<input name="size_group">` z `<datalist>` istniejących
  kluczy. Hint: „Wpisz ten sam klucz na wszystkich rozmiarach tego mebla, np. loze-vegas".
- **Etykieta rozmiaru** — `<input name="size_label">`. Hint: „np. 140×200 cm".

### `app/admin/produkty/[id]/page.tsx` (server)
- Helper `getSizeGroupKeys()` (w `products.ts`): distinct nie-null `size_group` z bazy
  (admin client). Przekazać do `ProductEditor` jako `sizeGroupKeys: string[]` → źródło `<datalist>`.

### `app/admin/produkty/actions.ts` — `updateProductBasics`
- Sparsować `size_group`, `size_label`: `trim()`, puste → `null`. Dopisać do payloadu update.

### Tworzenie nowego produktu — poza zakresem v1
Kolumny domyślnie `null`; admin ustawia grupę przez edycję istniejącego produktu.
Dołożenie pól do `NewProductForm` jest trywialne i można zrobić później.

## 5. i18n

- `app/_lib/dictionaries/pl.ts` → `product.sizeLabel = "Rozmiar"`.
- `app/_lib/dictionaries/de.ts` → `product.sizeLabel = "Größe"`.
- Wartości etykiet (`size_label`) bez tłumaczenia (pass-through, jak wymiary).

## 6. Edge cases / walidacja

- Grupa z 1 produktem (tylko on sam) → `buildSizeOptions` zwraca `[]` → selektor ukryty.
- `size_label` pusta przy ustawionej grupie → fallback do nazwy produktu.
- Klucz `size_group` trimowany przy zapisie; literówki łagodzone przez `<datalist>`.
- Nieaktywny / ukryty rozmiar nie pojawia się w selektorze (RLS na anon client).
- Bezpośredni link do nieaktywnego produktu → `getProduct` zwraca `null` → `notFound()` (bez zmian).

## 7. Testy

`app/_lib/__tests__/products-size.test.ts` (lub dopis do istniejącego pliku) — unit testy
czystego `buildSizeOptions`:
- sortowanie numeryczne (140/160/180, także gdy w bazie kolejność losowa),
- flaga `current` na właściwej pozycji,
- ukrycie (zwraca `[]`) gdy < 2 pozycji,
- fallback etykiety do `name` gdy `size_label` puste/whitespace.

## 8. Poza zakresem (YAGNI)

- Cena / dostępność per rozmiar w chipie selektora.
- Auto-dwukierunkowe linkowanie / synchronizacja grup.
- Osobny ekran zarządzania grupami w adminie.
- Pole grupy w formularzu nowego produktu (`NewProductForm`).
- Kolumny `_de` dla etykiety rozmiaru.

## Pliki dotykane

- `supabase/migrations/35_size_groups.sql` (nowy)
- `app/_lib/types.ts` (Product: +2 pola)
- `app/_lib/products.ts` (`getSizeSiblings`, `buildSizeOptions`, `getSizeGroupKeys`)
- `app/produkt/[id]/page.tsx` (fetch + przekazanie `sizeOptions`)
- `app/_components/ui/ProductMainSection.tsx` (prop + render `SizeSelector`)
- `app/_components/ui/SizeSelector.tsx` (nowy)
- `app/admin/produkty/[id]/ProductEditor.tsx` (2 pola + datalist)
- `app/admin/produkty/[id]/page.tsx` (przekazanie `sizeGroupKeys`)
- `app/admin/produkty/actions.ts` (`updateProductBasics`: parse + save)
- `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts` (`sizeLabel`)
- `app/_lib/__tests__/products-size.test.ts` (nowy)
