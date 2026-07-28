# Parametry produktu w adminie + sticky lewa kolumna karty produktu

Data: 2026-07-22. Zatwierdzone przez użytkownika (edytor parametrów + wariant A:
sticky lewa kolumna). Bez migracji — kolumna `products.features` (jsonb) już istnieje.

## Kontekst i problem

Karta produktu renderuje pod galerią sekcję „Specyfikacja"
(`ProductMainSection.tsx` — prop `specifications`, budowany w
`app/produkt/[id]/page.tsx` z pól stałych: wymiary, waga, materiał, kolor,
konstrukcja, czas realizacji, gwarancja + dowolnych `product.features`).
**`features` pochodzą wyłącznie z historycznego importu — w adminie nie da się
ich dodać ani edytować** (sekcja „Podstawowe dane" w
`app/admin/produkty/[id]/ProductEditor.tsx` ma tylko pola stałe;
`updateProductBasics` w `app/admin/produkty/actions.ts` nie zapisuje `features`).
Przy produktach z małą liczbą parametrów prawa kolumna (warianty/akcje) jest
dużo dłuższa i lewa kolumna świeci pustką pod galerią.

## Cel

1. W sekcji **„Podstawowe dane"** edytora produktu: blok **„Parametry
   produktu"** — dynamiczne wiersze klucz → wartość (np. „Wypełnienie" →
   „Pianka HR"), zapisywane istniejącym przyciskiem „Zapisz podstawowe dane"
   do istniejącej kolumny `products.features`.
2. Karta produktu: **lewa kolumna (galeria + specyfikacja) sticky** — przy
   dłuższej prawej kolumnie galeria podąża za scrollem i pusta przestrzeń nie
   jest widoczna, niezależnie od liczby parametrów.

## Nie-cele (YAGNI)

- Tłumaczenia DE parametrów — `features` są dziś pass-through na /de (jak
  `size_label`); zostaje.
- Strzałki zmiany kolejności wierszy (kolejność = kolejność dodania; wiersz
  można usunąć i dodać ponownie).
- Grupowanie/kategorie parametrów; walidacja słownikowa kluczy.
- Zmiany w renderze specyfikacji na karcie (już dokleja `features` i pomija
  duplikaty pól stałych przez `DEDICATED_KEYS` w `produkt/[id]/page.tsx`).
- Migracja DB (kolumna `features jsonb default '[]'` istnieje od dawna).

## Architektura

**`app/_lib/product-features.ts`** (nowy, CZYSTY — wzorzec
`fabric-featured-products.ts`):

```ts
import type { ProductFeature } from "./types";

export const MAX_FEATURES = 30;

// Wiersze parametrów z formularza admina (hidden input features_json,
// JSON [{key, value}]). Zły JSON / nie-tablica → []. Per wiersz: trim,
// key ≤ 100 zn., value ≤ 300 zn., puste key/value pomijane. Dedupe po
// key case-insensitive (pierwszy wygrywa — duplikat = kolizja React key
// w <dl> na karcie). Twardy limit MAX_FEATURES (nadmiar ucinany).
export function parseFeatureRows(input: unknown): ProductFeature[];
```

**Admin — `ProductEditor.tsx`, sekcja „Podstawowe dane"** (w TYM SAMYM
formularzu, przed przyciskiem zapisu):
- Blok „Parametry produktu" — dynamiczne wiersze (wzorzec wierszy kolorów w
  `FabricsEditor.tsx`): input klucz (placeholder „np. Wypełnienie",
  maxLength 100) + input wartość (placeholder „np. Pianka HR", maxLength 300)
  + przycisk usuń; „+ Dodaj parametr" (disabled przy 30).
- Stan `featureRows` seedowany z `product.features` (istniejące, w tym
  importowane, nic nie ginie); hidden input `features_json` =
  `JSON.stringify(rows.filter(r => r.key.trim() && r.value.trim()))`.
- Hint pod nagłówkiem bloku: „Wyświetlane w sekcji «Specyfikacja» pod zdjęciem.
  Nazwy: Kolor, Materiał, Wymiary, Waga, Konstrukcja, Czas realizacji,
  Gwarancja są na karcie pomijane (mają dedykowane pola wyżej) — nie dubluj."
  (Lista = `DEDICATED_KEYS` z `produkt/[id]/page.tsx`.)

**Akcja — `updateProductBasics`** (`app/admin/produkty/actions.ts`): dodaje
`features: parseFeatureRows(formData.get("features_json"))` do obiektu
`updates`. Uwaga: formularz zawsze wysyła pełny stan wierszy, więc zapis
nadpisuje całą tablicę (spójne z resztą pól sekcji).

**Karta produktu — `ProductMainSection.tsx`:** lewa kolumna
(`<div className="flex flex-col gap-8">` z galerią i specyfikacją) dostaje
`lg:sticky lg:top-40 lg:self-start` (offset pod wspólnym sticky headerem —
ta sama wartość co prawa kolumna na `app/zestaw/[slug]/page.tsx`; do
zweryfikowania wizualnie po wdrożeniu i ew. korekty). Na mobile (1 kolumna)
bez zmian.

## Przypadki brzegowe

- Produkt bez parametrów → blok w adminie pokazuje „Brak parametrów — dodaj
  pierwszy."; karta jak dziś (sticky i tak maskuje pustkę).
- Duplikat klucza (np. dwa razy „Wypełnienie") → parser zostawia pierwszy
  (dedupe case-insensitive); istniejące zaimportowane duplikaty znikną przy
  pierwszym zapisie sekcji (akceptowalne — admin widzi stan przed zapisem).
- Klucz z samych spacji / pusta wartość → wiersz pomijany przy serializacji
  i w parserze (podwójna ochrona).
- Lewa kolumna dłuższa od viewportu (dużo parametrów) → sticky pinuje górę,
  reszta scrolluje się naturalnie (standardowe zachowanie, jak zestaw).
- `features` używane też w `produkt/[id]/page.tsx` do specyfikacji z
  pominięciem `DEDICATED_KEYS` — bez zmian; edytor tylko zasila dane.

## Pliki dotknięte

- **Nowe:** `app/_lib/product-features.ts`;
  `app/_lib/__tests__/product-features.test.ts`.
- **Edycja:** `app/admin/produkty/[id]/ProductEditor.tsx` (blok wierszy w
  formularzu „Podstawowe dane"); `app/admin/produkty/actions.ts`
  (`updateProductBasics` + import parsera);
  `app/_components/ui/ProductMainSection.tsx` (sticky lewa kolumna — 1 linia
  klas).
- **Bez zmian:** `produkt/[id]/page.tsx` (render specyfikacji), typy
  (`ProductFeature` istnieje), DB, słowniki.

## Testy

- **Unit (pure):** `parseFeatureRows` — poprawne wiersze; trim + limity
  długości; puste pomijane; dedupe case-insensitive (pierwszy wygrywa);
  limit 30; zły JSON / nie-string / nie-tablica → `[]`.
- Admin + sticky: `tsc` + lint + build; po deployu smoke wizualny Playwright
  (dodanie parametru w adminie → widoczny na karcie; scroll karty z długą
  prawą kolumną → galeria podąża, brak pustki).

## Uwagi wdrożeniowe

- Bez migracji → czysty deploy (merge PR do main, konto gh Woodecky10).
- Smoke sticky wymaga produktu z długą prawą kolumną (np. z tkaninami).
