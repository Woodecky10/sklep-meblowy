# Wybór gotowych parametrów w edytorze produktu

Data: 2026-07-24. Zatwierdzone przez użytkownika (lista budowana automatycznie
z istniejących produktów + przycisk „+ Wybierz z listy" z rozwijaną listą).
Bez migracji — czysta zmiana admin UI + jedna czysta funkcja.

## Kontekst i problem

Blok „Parametry produktu" w edytorze (spec `2026-07-22-parametry-produktu-design.md`)
to wolne wiersze klucz → wartość — nazwę parametru wpisuje się za każdym razem
ręcznie. Te same nazwy („Wysokość nóżek", „Powierzchnia spania", …) powtarzają
się między produktami: wpisywanie jest wolne, a literówki/odmienne pisownie
psują spójność specyfikacji między kartami produktów.

## Cel

Przy dodawaniu parametru możliwość **wyboru nazwy z listy** zamiast wpisywania:

- lista = nazwy parametrów **już użyte w dowolnym produkcie** (auto,
  utrzymuje się sama) ∪ **stała lista startowa 14 nazw** od Mikołaja
  (gwarancja kompletu od pierwszego dnia, kanoniczna pisownia),
- dotychczasowa opcja własnej nazwy **zostaje** (przycisk „+ Dodaj własny
  parametr" = dzisiejszy pusty wiersz).

## Nie-cele (YAGNI)

- Lista edytowalna w adminie (utrzymuje się sama z danych produktów).
- Tłumaczenia DE nazw parametrów — `features` są pass-through na /de
  (świadoma decyzja z i18n); bez zmian.
- Podpowiedzi dla **wartości** parametrów.
- Zmiany zapisu (`features_json` + `parseFeatureRows`), akcji, karty produktu
  (poza centralizacją stałej, patrz niżej) i DB.

## Architektura

**`app/_lib/product-features.ts`** (rozszerzenie istniejącego CZYSTEGO modułu):

```ts
// Lista startowa — kanoniczna pisownia wygrywa z pisownią z bazy:
export const SEED_FEATURE_KEYS: string[] = [
  "Głębokość siedziska", "Grubość boczka", "Materac wbudowany",
  "Pojemnik na pościel", "Powierzchnia spania", "Szerokość dwójki",
  "Szerokość otomany", "Tył mebla tapicerowany", "Wysokość boczka",
  "Wysokość materaca", "Wysokość nóżek", "Wysokość poduszki",
  "Wysokość siedziska", "Wysokość skrzyni",
];

// Klucze pomijane na karcie (mają dedykowane pola) — centralizacja stałej
// dotąd zaszytej inline w app/produkt/[id]/page.tsx (DEDICATED_KEYS):
export const DEDICATED_FEATURE_KEYS: string[] = [
  "kolor", "materiał", "material", "wymiary", "konstrukcja",
  "czas realizacji", "gwarancja", "waga",
];

// Sugestie nazw parametrów dla edytora. Wejście: surowe kolumny `features`
// (jsonb) wielu produktów — defensywnie (unknown). Kolejność dedupe:
// najpierw seed (jego pisownia wygrywa), potem klucze z produktów.
// Dedupe po trim + case-insensitive; filtr DEDICATED_FEATURE_KEYS
// (case-insensitive); klucz nie-string/pusty/po trim >100 zn. pomijany.
// Wynik posortowany localeCompare("pl").
export function collectFeatureKeySuggestions(featuresLists: unknown[]): string[];
```

**`app/produkt/[id]/page.tsx`:** inline `DEDICATED_KEYS` zastąpione importem
`DEDICATED_FEATURE_KEYS` (jedno źródło prawdy; zachowanie identyczne).

**Serwer — `app/_lib/products.ts`:** nowy helper
`getFeatureKeySuggestionsAdmin(): Promise<string[]>` — admin client,
`select features from products` (wszystkie produkty, także ukryte),
zwraca `collectFeatureKeySuggestions(rows.map(r => r.features))`.
Błąd zapytania → `[]` (edytor działa dalej, tylko bez podpowiedzi).

**`app/admin/produkty/[id]/page.tsx`:** helper dokładany do istniejącego
`Promise.all`; wynik jako nowy prop `featureKeySuggestions: string[]`
do `ProductEditor`.

**UI — `ProductEditor.tsx`, blok „Parametry produktu":**

- Dwa przyciski pod wierszami: **„+ Wybierz z listy"** (nowy) i
  **„+ Dodaj własny parametr"** (istniejący `addFeatureRow`, zmiana etykiety
  z „+ Dodaj parametr").
- „+ Wybierz z listy" otwiera prosty dropdown (absolutnie pozycjonowany panel
  pod przyciskiem, `max-h` + przewijanie, stylistyka jak inputy admina):
  - pozycje = `featureKeySuggestions` minus nazwy już obecne w `featureRows`
    (porównanie trim + case-insensitive) — nie da się dodać duplikatu,
  - klik pozycji → nowy wiersz `{ key: nazwa, value: "" }`, dropdown się
    zamyka, **fokus ląduje w polu wartości nowego wiersza**,
  - zamykanie: wybór pozycji, `Esc`, klik poza panelem,
  - wszystkie nazwy użyte / lista pusta → przycisk disabled,
- oba przyciski disabled przy `MAX_FEATURES` (30) — jak dziś.

## Przypadki brzegowe

- Literówka w bazie (np. „Wysokosc nóżek" w starym produkcie) → osobna pozycja
  listy (dedupe tylko case-insensitive) — akceptowane przy liście auto; seed
  gwarantuje kanoniczne 14. Poprawienie = edycja parametru w tamtym produkcie.
- Klucz użyty w bieżącym produkcie inną wielkością liter → i tak chowany
  z listy (porównanie case-insensitive).
- Brak produktów z `features` / błąd zapytania → lista = sam seed / pusta;
  edytor działa normalnie.
- Wiersz dodany z listy bez wpisanej wartości → jak dziś pomijany przy
  serializacji (`key` bez `value` nie zapisuje się) — bez nowej walidacji.
- `features` w bazie nie-tablica / elementy bez `key` → pomijane defensywnie
  w `collectFeatureKeySuggestions`.

## Pliki dotknięte

- **Edycja:** `app/_lib/product-features.ts` (seed + dedicated + collect);
  `app/_lib/products.ts` (helper admin); `app/admin/produkty/[id]/page.tsx`
  (fetch + prop); `app/admin/produkty/[id]/ProductEditor.tsx` (przycisk +
  dropdown + fokus wartości); `app/produkt/[id]/page.tsx` (import wspólnej
  stałej zamiast inline); `app/_lib/__tests__/product-features.test.ts`
  (przypadki collect).
- **Bez zmian:** `app/admin/produkty/actions.ts`, `parseFeatureRows`, DB,
  słowniki i18n, render karty produktu.

## Testy

- **Unit (pure) `collectFeatureKeySuggestions`:** seed wygrywa pisownią
  z bazą; dedupe trim + case-insensitive; filtr DEDICATED (case-insensitive);
  sort polski (ą/ł/ó w dobrej kolejności); śmieciowe wejścia (nie-tablice,
  elementy bez `key`, nie-stringi, puste po trim, >100 zn.); brak wejścia →
  sam seed posortowany.
- `tsc` + pełne testy + build; po deployu klik-test Mikołaja na prodzie
  (dodanie parametru z listy + własnego, zapis, widoczność na karcie).

## Uwagi wdrożeniowe

- Bez migracji → zwykły branch + PR (konto Woodecky10), auto-deploy po merge.
- Implementacja: subagenty na Opusie (SDD), review po każdym tasku.
