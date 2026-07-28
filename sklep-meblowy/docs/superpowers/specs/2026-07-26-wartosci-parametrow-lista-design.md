# Wartości parametrów wybierane z listy (edytor produktu)

Data: 2026-07-26. Zatwierdzone przez użytkownika (makieta klikalna: strzałka ▾
przy polu wartości otwierająca listę wartości już użytych; potwierdzone, że
źródłem są wartości wpisane w produktach). Rozszerzenie PR #91
(`2026-07-24-wybor-gotowych-parametrow-design.md`). Bez migracji.

## Kontekst i problem

Po PR #91 nazwę parametru wybiera się z listy, ale **wartość** wciąż wpisuje
się ręcznie za każdym razem. Wartości silnie się powtarzają między produktami
(„12 cm", „Tak", „160 x 200 cm", …) — wpisywanie jest wolne, a odmienne
pisownie psują spójność specyfikacji.

## Cel

Przy polu **wartości** parametru strzałka ▾ otwierająca listę wartości
**już użytych dla tej nazwy parametru w dowolnym produkcie** (także ukrytym).
Lista utrzymuje się sama z danych — zero konfiguracji, zero seedu.

## Nie-cele (YAGNI)

- Seed wartości (nazwy miały kanoniczną 14-tkę; wartości są zbyt różnorodne).
- Lista edytowalna w adminie.
- Tłumaczenia DE wartości — `features` pass-through na /de (bez zmian).
- Zmiany zapisu (`features_json` + `parseFeatureRows`), akcji, karty produktu, DB.

## Architektura

**`app/_lib/product-features.ts`** (rozszerzenie CZYSTEGO modułu):

```ts
// Mapa: nazwa parametru (trim + lowercase) → wartości już użyte.
// Wejście: surowe kolumny `features` (jsonb) wielu produktów — defensywnie
// (unknown[]). Wartość/klucz nie-string, pusty po trim, klucz >100 zn.,
// wartość >300 zn. → pomijane. Dedupe wartości per klucz: trim +
// case-insensitive, pierwsza spotkana pisownia wygrywa. Sort wartości:
// localeCompare("pl", { numeric: true }) — „9 cm" przed „10 cm".
export function collectFeatureValueSuggestions(
  featuresLists: unknown[]
): Record<string, string[]>;
```

**Serwer — `app/_lib/products.ts`:** `getFeatureKeySuggestionsAdmin`
przemianowane na `getFeatureSuggestionsAdmin(): Promise<{ keys: string[];
valuesByKey: Record<string, string[]> }>` — to samo JEDNO zapytanie
(`select features from products`, admin client), wynik liczony przez
`collectFeatureKeySuggestions` + `collectFeatureValueSuggestions`.
Błąd zapytania → `{ keys: [], valuesByKey: {} }` (edytor działa dalej,
tylko bez podpowiedzi).

**`app/admin/produkty/[id]/page.tsx`:** wynik helpera rozpakowany na dwa
propsy `ProductEditor`: istniejący `featureKeySuggestions: string[]` (bez
zmian) + nowy `featureValueSuggestions: Record<string, string[]>`.

**UI — `ProductEditor.tsx`, blok „Parametry produktu":**

- W polu wartości wiersza mała strzałka ▾ (przycisk w prawym rogu inputa;
  istniejący wrapper `div.flex-1.min-w-0` dostaje `relative`; input dostaje
  `pr-…` gdy strzałka widoczna):
  - strzałka renderowana **tylko gdy** `row.key.trim()` niepusty **i**
    `featureValueSuggestions[row.key.trim().toLowerCase()]` ma ≥1 pozycję —
    inaczej brak przycisku (zero bałaganu przy nazwach bez historii),
  - klik otwiera dropdown identyczny stylistycznie z listą nazw
    (`max-h` + przewijanie, `role="listbox"`), pozycjonowany pod polem,
  - klik pozycji → `setFeatureValue(i, v)` (nadpisuje obecną wartość),
    dropdown się zamyka,
  - zamykanie: wybór, `Esc`, klik poza panelem (rozszerzenie istniejącego
    efektu z pickera nazw lub bliźniaczy efekt; otwarty może być najwyżej
    jeden dropdown — otwarcie wartości zamyka picker nazw i odwrotnie),
  - stan: `valuePickerIdx: number | null` (indeks wiersza z otwartą listą),
  - `aria-label="Wybierz wartość z listy"`, `aria-expanded`, `aria-haspopup`.
- Ręczne wpisywanie bez zmian — lista to skrót, nie przymus.
- Przyciski „+ Wybierz z listy" / „+ Dodaj własny parametr" bez zmian.

## Przypadki brzegowe

- Nazwa wpisana inną wielkością liter / ze spacjami („wysokość nóżek ") →
  dopasowanie do tych samych wartości (lookup po trim + lowercase).
- Literówka w nazwie → brak podpowiedzi wartości (jak przy nazwach —
  akceptowane; seed nazw ogranicza literówki u źródła).
- Odmienne pisownie wartości w bazie („Tak" vs „tak") → jedna pozycja,
  pierwsza spotkana pisownia wygrywa (kolejność iteracji po produktach).
- Wartość obecna w polu → strzałka i tak jest; wybór nadpisuje.
- Zmiana nazwy wiersza przy otwartym dropdownie wartości → dropdown się
  zamyka, gdy strzałka znika (brak wartości dla nowej nazwy).
- Brak produktów z `features` / błąd zapytania → brak strzałek; edytor
  działa normalnie.
- `features` nie-tablica / elementy bez `key`/`value` → pomijane defensywnie.
- Klucze z `DEDICATED_FEATURE_KEYS` NIE są filtrowane z mapy wartości —
  jeśli ktoś ręcznie wpisze taką nazwę, podpowiedzi działają (nieszkodliwe).

## Pliki dotknięte

- **Edycja:** `app/_lib/product-features.ts` (collect wartości);
  `app/_lib/products.ts` (rename + rozszerzenie helpera);
  `app/admin/produkty/[id]/page.tsx` (destrukturyzacja + nowy prop);
  `app/admin/produkty/[id]/ProductEditor.tsx` (strzałka + dropdown wartości);
  `app/_lib/__tests__/product-features.test.ts` (przypadki collect).
- **Bez zmian:** `app/admin/produkty/actions.ts`, `parseFeatureRows`, DB,
  słowniki i18n, render karty produktu.

## Testy

- **Unit (pure) `collectFeatureValueSuggestions`:** grupowanie po kluczu
  trim + case-insensitive; dedupe wartości (pierwsza pisownia wygrywa);
  sort numeryczny polski („9 cm" < „10 cm", ą/ł/ó poprawnie); limity
  długości (klucz >100, wartość >300); śmieciowe wejścia (nie-tablice,
  elementy bez pól, nie-stringi, puste po trim); puste wejście → `{}`.
- `tsc` + pełne testy + build; po deployu klik-test Mikołaja na prodzie
  (strzałka przy nazwie z historią, brak strzałki bez historii, wybór
  wartości, zapis, widoczność na karcie).

## Uwagi wdrożeniowe

- Bez migracji → zwykły branch (`feat/wartosci-parametrow-lista`) + PR
  (konto Woodecky10), auto-deploy po merge.
- Implementacja: subagenty na Opusie (SDD), review po każdym tasku.
- Makieta zatwierdzona przez użytkownika:
  https://claude.ai/code/artifact/9c2f0e2b-b3df-43b6-9ddf-0d01c59d6626
