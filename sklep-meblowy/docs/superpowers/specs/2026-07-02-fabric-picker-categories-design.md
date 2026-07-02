# Uporządkowanie wyboru tkanin w adminie — kategorie + picker „szukaj-first"

Data: 2026-07-02. Podejście **A + B** (przebudowa pickera + pole „kategoria" tkanin). Zatwierdzone przez użytkownika.

## Kontekst i problem

Przy edycji wariantów produktu admin klika „Wybierz z katalogu tkanin" → modal
`FabricPicker` (`app/admin/produkty/[id]/VariantsEditor.tsx:824-952`) renderuje
**płaską, przewijaną listę checkboxów ~200 tkanin** (`:889-930`) z jedynym filtrem —
małym polem szukania po nazwie (`:859-861`). Brak grupowania, kategorii, zaznaczania
hurtem i przeglądu zaznaczonych. Przy 200 tkaninach dotarcie do właściwej i zaznaczenie
wielu zajmuje za dużo czasu.

Model `Fabric` (`app/_lib/types.ts:152-164`) ma dziś: `name`, `name_de`, `colors[]`,
`color_images`, `price`, `sort_order` — **brak pola grupującego** (kategoria/typ).

## Cel

Wybór tkanin bez ślepego scrolla: lista pogrupowana po **kategorii** (zwijane sekcje),
mocne szukanie, zaznaczanie hurtem i szybki przegląd już zaznaczonych.

## Nie-cele (YAGNI)

- Grupowanie kategoriami na sklepie (klient) — kategoria to metadana admina.
- Wirtualizacja listy (przy ~200 zbędna).
- Sortowanie kategorii inne niż alfabetyczne (+ „Bez kategorii" zawsze na końcu).
- Zmiana sposobu zapisu wariantów — wartości dalej stringi „Nazwa Numer".
- Migracja danych / wymuszanie kategorii na istniejących tkaninach (kategoryzacja stopniowa).

## Model danych (B)

- **Migracja** `supabase/migrations/42_fabric_category.sql`:
  `alter table fabrics add column if not exists category text;` (nullable).
  Aplikowana na produkcję **ręcznie przez Supabase MCP** (migracje nie idą automatycznie
  z deployem; podłączony projekt = produkcja).
- **Typ** `Fabric` (`types.ts`): `+ category: string | null;`.
- **Pobranie:** `getAllFabrics`/`fetchAllFabrics` (`app/_lib/fabrics.ts`) używa `select("*")`,
  więc `category` dojdzie automatycznie; bez zmian w zapytaniu. Cache `unstable_cache`
  (tag `"fabrics"`) bez zmian.
- **Formularz tkaniny** `FabricForm` (`app/admin/tkaniny/FabricsEditor.tsx`): nowe pole
  **„Kategoria / typ"** — free-text `<input>` z `<datalist>` istniejących kategorii
  (autouzupełnianie dla spójności nazw, jak przy grupie rozmiarów). Puste = bez kategorii.
- **CRUD** `createFabric`/`updateFabric` (`app/admin/tkaniny/actions.ts`): zapis
  `category: emptyToNull(sanitize(formData.get("category"), 100))`. `invalidateFabricsCache()`
  bez zmian.
- Lista tkanin w `FabricsEditor` (karty) może pokazywać kategorię przy nazwie (drobiazg, nice-to-have).

## Picker tkanin (A + B) — nowy `FabricPicker`

Przebudowa modala (`VariantsEditor.tsx:824-952`). Zachowanie:

- **Szukanie** (autofokus, nagłówek): filtr case-insensitive po `name` (jak dziś).
  Przy aktywnym szukaniu sekcje z trafieniami są rozwinięte, puste — ukryte.
- **Lista pogrupowana po `category`** w zwijane sekcje. Kolejność: kategorie alfabetycznie
  (`localeCompare` „pl"), **„Bez kategorii" zawsze na końcu**. W sekcji tkaniny zachowują
  kolejność wejścia (`sort_order`, potem `name`). Nagłówek sekcji: nazwa + licznik +
  **checkbox „zaznacz całą grupę"** (tri-state: puste / część / całość — działa na tkaniny
  aktualnie widoczne w sekcji, tj. po filtrze).
- **Domyślnie sekcje zwinięte** (skan nazw kategorii → rozwinięcie jednej). Stan rozwinięcia
  w `useState<Set<string>>`. Gdy szukanie niepuste → wszystkie (pasujące) sekcje rozwinięte.
- **„Zaznacz pasujące" / „Odznacz pasujące"** — akcja na całym bieżącym wyniku szukania
  (wszystkie widoczne tkaniny naraz).
- **„Tylko zaznaczone"** — przełącznik pokazujący wyłącznie już wybrane (przegląd/odznaczanie
  bez scrolla). Łączy się z szukaniem (zawężenie).
- Wiersz tkaniny bez zmian: checkbox + nazwa + „N kol." + ewent. „+X zł".
- **„Spoza katalogu"** (orphan values — wartości na produkcie bez dopasowania w katalogu):
  osobna sekcja jak dziś, poza grupowaniem po kategorii.
- Licznik w tytule „(wybrano: N)" i przyciski Anuluj / Zastosuj — bez zmian w logice `applyFabrics`.

## Czysta logika grupowania (testowalna)

Nowy moduł `app/_lib/fabric-groups.ts` (pure, bez zależności server-only — wzorzec jak
`size-groups.ts`):

```ts
import type { Fabric } from "./types";

export const NO_CATEGORY_LABEL = "Bez kategorii";
export type FabricGroup = { category: string; fabrics: Fabric[] };

// Grupuje tkaniny po category (trim). Puste/null → NO_CATEGORY_LABEL. Kategorie
// sortowane alfabetycznie (pl), NO_CATEGORY_LABEL zawsze na końcu. Tkaniny w grupie
// zachowują kolejność wejściową (już posortowane sort_order/name z getAllFabrics).
export function groupFabricsByCategory(fabrics: Fabric[]): FabricGroup[];

// Stan zaznaczenia grupy względem zbioru zaznaczonych nazw: "none" | "some" | "all".
export function groupSelectionState(
  group: FabricGroup,
  selectedNames: Set<string>
): "none" | "some" | "all";
```

Warstwa komponentu (`FabricPicker`) filtruje po szukaniu, woła `groupFabricsByCategory`,
renderuje sekcje, a checkbox grupy używa `groupSelectionState` + toggluje nazwy tkanin
z grupy w istniejącym `selectedNames`.

## Przypadki brzegowe

- Tkaniny bez kategorii → sekcja „Bez kategorii" na końcu.
- Literówki w nazwie kategorii → mitygowane `<datalist>`; rozjazd pisowni = osobne sekcje
  (admin poprawia w formularzu tkaniny). Nie wymuszamy.
- Szukanie zwija/rozwija: przy aktywnym szukaniu sekcje z trafieniami rozwinięte, reszta
  ukryta; puste sekcje pominięte.
- Checkbox grupy działa na tkaniny widoczne w sekcji (po filtrze), nie na ukryte.
- Zapis wariantów bez zmian — `category` nie wchodzi do `product.variants`; dopasowanie
  orphanów (`fabricValueBelongsTo`) i mapy DE/obrazków bez zmian.

## Pliki dotknięte

- **Nowe:** `supabase/migrations/42_fabric_category.sql`; `app/_lib/fabric-groups.ts`;
  `app/_lib/__tests__/fabric-groups.test.ts`.
- **Edycja:** `app/_lib/types.ts` (`Fabric.category`); `app/admin/tkaniny/FabricsEditor.tsx`
  (pole Kategoria + datalist; ew. kategoria na karcie); `app/admin/tkaniny/actions.ts`
  (zapis `category`); `app/admin/produkty/[id]/VariantsEditor.tsx` (przebudowa `FabricPicker`).
- **Bez zmian:** `app/_lib/variants.ts` (expandFabrics/applyFabricSelection), storefront,
  klient, `getAllFabrics` (select `*` już pobiera nową kolumnę).

## Testy

- **Nowe (unit, pure):** `groupFabricsByCategory` (grupowanie, „Bez kategorii" na końcu,
  kategorie alfabetycznie, zachowanie kolejności w grupie) i `groupSelectionState`
  (none/some/all).
- Reszta (migracja, formularz, picker) — lint/build + ręczny smoke, zgodnie ze wzorcem repo.
