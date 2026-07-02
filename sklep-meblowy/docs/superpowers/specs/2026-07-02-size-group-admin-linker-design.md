# Intuicyjne łączenie rozmiarów w panelu admina — design

Data: 2026-07-02. Podejście **A** (picker w edytorze produktu). Zatwierdzone przez użytkownika.

## Kontekst i problem

Ten sam mebel w różnych rozmiarach to **osobne produkty** (osobny `/produkt/{id}`,
stan, cena, zdjęcia). Na sklepie klient klika rozmiar → nawigacja na produkt-rodzeństwo.

Dziś rodzeństwo łączy **wspólny, ręcznie wpisywany klucz `size_group`** (text) na każdym
produkcie, plus ręczny `size_label` (np. „140×200 cm"). W edytorze
(`app/admin/produkty/[id]/ProductEditor.tsx:212-240`) to dwa pola tekstowe; przy kluczu jest
`<datalist>` z podpowiedziami, ale **nic nie wymusza zgodności**.

Bolączki obecnego rozwiązania:
- **Literówka w kluczu → grupa cicho się rozpada.** `buildSizeOptions` zwraca `[]` przy
  <2 elementach, `SizeSelector` renderuje `null` — selektor znika bez ostrzeżenia.
- Trzeba edytować **każdy produkt osobno**; z poziomu jednego produktu nie widać, co jest w grupie.
- Formularz **tworzenia** produktu w ogóle nie ma tych pól.
- Zmiana w jednym rodzeństwie **nie rewaliduje** stron pozostałych (stale cache) —
  `updateProductBasics` (`app/admin/produkty/actions.ts:199-201`) rewaliduje tylko edytowany produkt.

## Cel

Łączenie rozmiarów przez **zaznaczanie produktów** w edytorze, bez wpisywania/dopasowywania
klucza, z widokiem całej grupy. Zero zmian w doświadczeniu klienta na sklepie.

## Nie-cele (poza zakresem)

- Osobna strona „Grupy rozmiarów" (to było podejście B).
- Pola rozmiaru w formularzu **tworzenia** produktu — łączenie odbywa się po utworzeniu, z panelu edytora.
- Auto-generowanie etykiety z wymiarów produktu — na razie etykieta ręczna.
- Zmiana architektury na „rozmiar jako wariant jednego produktu" (odrzucone: utrata SEO per
  rozmiar, przeróbka synchronizacji, przekierowania).
- Filtrowanie rodzeństwa po stanie magazynowym (bez zmian — meble traktowane jako na zamówienie).

## Model danych — bez migracji

Zostają kolumny `size_group` (text) i `size_label` (text) z migracji
`supabase/migrations/35_size_groups.sql`. Typ `app/_lib/types.ts:124-129` bez zmian.

Zmienia się tylko **sposób nadawania** wartości:
- `size_group` staje się **kluczem wewnętrznym** — admin go nie widzi ani nie wpisuje.
  Generowany automatycznie przy tworzeniu pierwszego połączenia: slug z nazwy produktu
  (lowercase, bez znaków diakrytycznych, nie-alfanumeryczne → `-`) + krótki sufiks losowy
  (np. `marbella-7f3a`). Unikalność sprawdzana względem istniejących wartości `size_group`;
  kolizja → regeneracja sufiksu.
- `size_label` dalej per produkt, edytowany w panelu.

Storefront łączy dalej po zgodnym `size_group` — logika bez zmian.

## UX: panel „Rozmiary tego mebla" w edytorze produktu

Zastępuje dzisiejsze dwa pola tekstowe (`size_group` + `size_label`) w `ProductEditor.tsx`.
Nowy komponent kliencki (np. `app/admin/produkty/[id]/SizeGroupEditor.tsx`).

Panel pokazuje **całą grupę jako listę wierszy**:
- każdy wiersz: nazwa produktu (link do jego edycji) + edytowalne pole **etykiety**
  („140×200 cm") + przycisk **Odłącz**; bieżący produkt wyróżniony;
- na dole **wyszukiwarka „Dodaj rozmiar…"** — po wpisaniu nazwy pokazuje kandydatów;
  klik dołącza produkt do grupy (dwukierunkowo, klucz nadaje się sam);
- gdy produkt nie jest w żadnej grupie: widać tylko jego wiersz + wyszukiwarkę
  (pierwsze dodanie tworzy grupę).

Zapis **natychmiastowy** (add/remove/etykieta zapisują od razu), nie przez submit głównego
formularza — bo edytujemy też *inne* rekordy produktów. Panel jest niezależny od formularza
„Podstawowe dane".

## Akcje serwera + przepływ danych

Nowe akcje w `app/admin/produkty/actions.ts` (admin-only, wzorzec jak istniejące akcje):

- **`linkSizeSibling(currentId, targetId)`** — nadaje wspólny `size_group` obu produktom
  oraz **wszystkim dotychczasowym członkom obu grup** (pełne scalenie, nie przeniesienie
  pojedynczego produktu). Wspólny klucz rozstrzyga czysta funkcja `pickGroupKey` (niżej):
  bieżący ma grupę → wygrywa jego klucz, członkowie grupy targetu są do niego przepisywani;
  tylko target ma grupę → bieżący ją adoptuje; żaden nie ma → nowy klucz. Gdy target należy
  już do **innej** grupy (z własnymi członkami), UI prosi o potwierdzenie scalenia:
  „Ten produkt jest już w innej grupie rozmiarów (N produktów) — połączyć grupy?".
- **`unlinkSizeSibling(productId)`** — ustawia `size_group = null` dla produktu; jeśli w grupie
  zostaje **1 członek**, czyści `size_group` także jemu (grupa jednoelementowa nie ma sensu).
- **`updateSizeLabel(productId, label)`** — zapis `size_label` (`sanitize`/`emptyToNull` jak dziś).
- **`searchProductsForSizeGroup(query)`** — wyszukiwarka po nazwie (admin client), zwraca
  `{id, name, size_group, size_label}`, wyklucza bieżący produkt i obecnych członków, limit ~10.

**Rewalidacja:** każda mutacja rewaliduje strony **wszystkich członków** dotkniętych grup
(`/produkt/{id}`) + `/admin/produkty/{id}` + `/sklep`. Naprawia dzisiejszy stale-cache rodzeństwa.

Nowe funkcje dostępu do danych w `app/_lib/products.ts` (obok istniejących
`getSizeSiblings`/`getSizeGroupKeys`): pobranie członków grupy dla admina (z produktami
nieaktywnymi — admin client) do renderu panelu i do listy `id` do rewalidacji.

## Czysta logika rozstrzygania klucza (testowalna)

W `app/_lib/size-groups.ts` (wzorzec: czysta, bez zależności server-only, jak `buildSizeOptions`):

```ts
// Wybiera wspólny klucz size_group przy łączeniu dwóch produktów.
// newKey = świeżo wygenerowany klucz (wstrzykiwany, by funkcja była deterministyczna —
// bez losowości w środku, zgodnie z wzorcem pure-logiki).
export function pickGroupKey(
  currentKey: string | null,
  targetKey: string | null,
  newKey: string
): string {
  if (currentKey) return currentKey;   // bieżący ma grupę → target ją adoptuje (i ew. merge)
  if (targetKey) return targetKey;      // tylko target ma grupę → bieżący ją adoptuje
  return newKey;                        // żaden nie ma → nowa grupa
}
```

Warstwa akcji: pobiera członków obu grup, woła `pickGroupKey`, zapisuje wybrany klucz na
wszystkich dotkniętych produktach, rewaliduje ich strony. Generowanie `newKey`
(slug+sufiks, sprawdzenie unikalności) też w warstwie akcji, nie w czystej funkcji.

## Storefront — bez zmian

`getSizeSiblings` (`app/_lib/products.ts:260-270`), `buildSizeOptions`
(`app/_lib/size-groups.ts`), `SizeSelector` (`app/_components/ui/SizeSelector.tsx`) i
`app/produkt/[id]/page.tsx:97-111,275` — bez zmian. Klient dalej klika rozmiar → nawigacja na
`/produkt/{id}` rodzeństwa.

## Przypadki brzegowe / walidacja

- Nie można połączyć produktu ze sobą — wykluczony z wyszukiwarki.
- Pusta etykieta → storefront pokazuje nazwę produktu (fallback jak dziś); w panelu żółty hint
  „ustaw etykietę".
- Zduplikowana etykieta w grupie → ostrzeżenie w panelu (nie blokuje zapisu).
- Odłączenie do 1 członka → czyszczenie klucza (obu stron).
- Target w innej grupie → potwierdzenie scalenia obu grup (dołączają wszyscy członkowie
  targetu, nie tylko sam target).
- Wszystkie akcje admin-only; przy braku uprawnień — odrzucenie (istniejący wzorzec).

## Testy

- **Nowe (unit, czysta funkcja):** `pickGroupKey` — wszystkie gałęzie (oba puste → newKey;
  tylko current; tylko target; oba te same; oba różne → merge do current).
- **Zostają:** dotychczasowe testy `buildSizeOptions`.
- Logika „grupa spada do 1 → czyszczenie klucza" — jeśli wydzielona jako czysta funkcja
  (np. `membersToClearAfterUnlink(remainingKeys)`), też pokryta unit-testem.

## Pliki dotknięte

- **Nowe:** `app/admin/produkty/[id]/SizeGroupEditor.tsx` (panel kliencki).
- **Edycja:** `app/admin/produkty/[id]/ProductEditor.tsx` (usunięcie 2 pól tekstowych, wstawienie panelu);
  `app/admin/produkty/actions.ts` (nowe akcje: link/unlink/updateLabel/search + rewalidacja rodzeństwa);
  `app/_lib/products.ts` (pobranie członków grupy dla admina; ew. porządki wokół `getSizeGroupKeys`);
  `app/_lib/size-groups.ts` (dodanie `pickGroupKey` + ew. helper do czyszczenia);
  `app/admin/produkty/[id]/page.tsx` (przekazanie danych grupy zamiast/oprócz `sizeGroupKeys`).
- **Bez zmian:** storefront (`SizeSelector`, `getSizeSiblings`, `buildSizeOptions`, strona produktu),
  model danych (brak migracji).
