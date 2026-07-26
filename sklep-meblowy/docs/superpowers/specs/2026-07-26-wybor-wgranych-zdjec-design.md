# Spec: Wybór już wgranego zdjęcia (bez ponownego uploadu)

Data: 2026-07-26
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- Zdjęcia per wartość opcji wariantu żyją w JSONB
  `products.variants.options[].value_images` (`Record<string, string[]>`).
  Admin dodaje je przyciskiem „📷" przy wartości → `ValueImagesPanel.tsx`
  (upload plików przez `useImageUpload` → `uploadProductImage`).
- Globalna galeria produktu (`products.images`) — sekcja „Zdjęcia produktu"
  w `ProductEditor.tsx` (upload w `headerAside`, `setImages` bez dedupe).
- Oba miejsca umieją **wyłącznie upload pliku**. Identyczne zdjęcie (np. rysunek
  stelaża, ten sam dla wielu produktów) trzeba wgrywać od nowa przy każdym
  produkcie — to jest zgłoszony problem.
- Dane w DB (pomiar z 2026-07-24): `value_images` mają opcje „Kolor nóżek"
  (54 produkty), „Strona" (20), „STELAŻ" (1); opcja „Tkanina" — 0.
- Nazwy opcji to wolne stringi admina o mieszanym casingu („STELAŻ"/„Stelaż").
  Normalizacja i wykluczenie tkaniny już istnieją w `app/_lib/option-filter.ts`:
  `normalizeOptionName`, `displayOptionName`, `optionParamSlug`,
  `EXCLUDED_OPTION_SLUGS = {"tkanina"}`.
- Wzorzec podpowiedzi z istniejących danych: `getFeatureSuggestionsAdmin()`
  (`app/_lib/products.ts:501`) + czyste kolektory w `product-features.ts`,
  ładowane w `Promise.all` w `app/admin/produkty/[id]/page.tsx`.
- Wzorzec modala wyboru: `FabricPicker` w `VariantsEditor.tsx` (szukajka,
  grupy, licznik w przycisku „Zastosuj (n)").
- Normalizacja szukajki: `normalizeSearchText` (`app/_lib/search-normalize.ts`).
- Współdzielenie URL-i między produktami jest **wspieranym wzorcem**: przy
  usuwaniu produktu `imageUrlsToDelete` (`actions.ts:398`) kasuje ze Storage
  tylko pliki, których nie używa żaden inny produkt (uwzględnia `images`
  i `value_images` — `collectProductImageUrls`). Kosz przy miniaturze w edytorze
  usuwa wyłącznie wpis w JSON-ie, pliku nie tyka.

## Cel

W edytorze produktu w panelu admina obok „+ Dodaj zdjęcia" pojawia się
„+ Wybierz z wgranych" — okno z miniaturami zdjęć już przypisanych do wartości
opcji wariantów w innych produktach. Wybrane zdjęcia dochodzą do listy jako te
same URL-e, bez ponownego uploadu pliku.

Po stronie klienta sklepu **zero zmian** — to samo `value_images`/`images`, te
same URL-e.

## Zakres — zatwierdzone zachowania

1. Przycisk „+ Wybierz z wgranych" w `ValueImagesPanel` (obok „+ Dodaj zdjęcia",
   ten sam styl pill-outline).
2. Ten sam przycisk w sekcji „Zdjęcia produktu" (`headerAside`, obok
   „+ Dodaj zdjęcia").
3. **Źródło listy: wyłącznie `value_images` z opcji wariantów wszystkich
   produktów**, z pominięciem opcji, której `optionParamSlug` jest w
   `EXCLUDED_OPTION_SLUGS` (czyli „Tkanina" w każdym casingu). Katalog tkanin
   (`fabrics.color_images`) i galerie produktów (`products.images`) **nie**
   zasilają listy — decyzja właściciela: zdjęcie mebla w konkretnej tkaninie
   nie nadaje się do ponownego użycia, a lista miałaby setki pozycji.
4. Grupowanie miniatur po znormalizowanej nazwie opcji, nagłówek = forma
   wyświetlana (`displayOptionName`, np. „Stelaż"). Grupa zgodna z kontekstem
   otwarcia (nazwa opcji, z której kliknięto 📷) jest pierwsza; pozostałe
   alfabetycznie. Otwarcie z galerii produktu = brak kontekstu → same grupy
   alfabetycznie.
5. Podpis pod miniaturą: `wartość · nazwa produktu` z **pierwszego** wystąpienia
   URL-a (po deduplikacji).
6. Wybór wielokrotny: klik zaznacza/odznacza (obwódka + ptaszek), przycisk
   „Dodaj wybrane (n)" wstawia wszystkie zaznaczone naraz. „Anuluj" zamyka bez
   zmian.
7. Zdjęcia już obecne w docelowej liście (ta wartość opcji / ta galeria)
   pokazują się wyszarzone, z podpisem „już dodane", i są nieklikalne.
8. Szukajka na górze modala filtruje po nazwie opcji, wartości i nazwie
   produktu. Dopasowanie tokenowe, odporne na diakrytyki i kolejność słów
   (`normalizeSearchText`, wszystkie tokeny zapytania muszą wystąpić).
9. Wybór **nie zapisuje** do bazy — utrwala go istniejący przycisk („Zapisz
   warianty" / „Zapisz zdjęcia"), jak przy uploadzie. Modal pokazuje tę
   informację w stopce.
10. Gdy lista sugestii jest pusta (żaden produkt nie ma `value_images` poza
    tkaniną) — przycisku „+ Wybierz z wgranych" nie ma wcale (zero martwych
    przycisków dla nietechnicznego admina).
11. Dodanie tego samego URL-a dwa razy jest niemożliwe: przy wartości opcji
    dedupe już robi `addValueImages` w `VariantsEditor`; dla galerii dokładamy
    filtr `!prev.includes(u)` przy wstawianiu z wybieraka.

## Model danych

Bez zmian, **bez migracji**. Wybierak tylko czyta istniejące `variants`
i wstawia znane URL-e do `value_images` / `images`.

## Zmiany

### `app/_lib/variant-image-suggestions.ts` (nowy, czysty — bez importów server-only)

Typy (eksportowane z tego modułu; `products.ts` deklaruje zwrotkę inline —
gotcha Turbopack z `export type` w plikach akcji):

```ts
export type VariantImageSuggestion = {
  url: string;
  value: string;        // wartość opcji z pierwszego wystąpienia
  productName: string;  // nazwa produktu z pierwszego wystąpienia
};
export type VariantImageGroup = {
  key: string;   // normalizeOptionName(name) — klucz grupowania i dopasowania kontekstu
  name: string;  // displayOptionName(name) — nagłówek grupy
  images: VariantImageSuggestion[];
};
```

Funkcje:

- `collectVariantImageSuggestions(rows: { name: unknown; variants: unknown }[]): VariantImageGroup[]`
  — przechodzi `variants.options[]`, pomija opcje o pustej nazwie i o slugu
  w `EXCLUDED_OPTION_SLUGS`, zbiera `value_images[value]` (tylko stringi),
  deduplikuje URL-e **globalnie** (ten sam URL pojawia się raz, w grupie
  pierwszego wystąpienia), grupuje po `normalizeOptionName`. Odporna na
  śmieciowy JSONB (`variants` nie-obiekt, `options` nie-tablica, `value_images`
  nie-obiekt, elementy nie-stringi) — takie wpisy pomijane bez wyjątku.
  Kolejność grup: alfabetycznie po `name`; kolejność zdjęć w grupie: kolejność
  napotkania.
- `sortGroupsForContext(groups: VariantImageGroup[], contextOptionName: string | null): VariantImageGroup[]`
  — grupa o `key === normalizeOptionName(contextOptionName)` na początek,
  reszta bez zmiany kolejności.
- `filterGroups(groups: VariantImageGroup[], query: string): VariantImageGroup[]`
  — puste zapytanie zwraca wejście; inaczej zostawia zdjęcia, których
  `"<nazwa opcji> <wartość> <produkt>"` zawiera **wszystkie** tokeny zapytania
  (po `normalizeSearchText`); grupy bez trafień wypadają.

### `app/_lib/products.ts`

- `getVariantImageSuggestionsAdmin(): Promise<VariantImageGroup[]>` —
  `createAdminClient()`, `select("name, variants")` z `products` (też ukryte),
  zwraca `collectVariantImageSuggestions(rows)`. Błąd zapytania → `[]` (edytor
  działa, tylko bez wybieraka). Typ importowany z czystego modułu —
  `products.ts` nie ma `"use server"`, więc import typu jest bezpieczny.

### `app/admin/produkty/[id]/page.tsx`

- Dołożyć `getVariantImageSuggestionsAdmin()` do istniejącego `Promise.all`
  i przekazać jako prop `variantImageGroups` do `ProductEditor`.

### `app/admin/produkty/[id]/ImagePickerModal.tsx` (nowy, `"use client"`)

Wspólny modal dla obu miejsc. Props:

```ts
{
  groups: VariantImageGroup[];
  contextOptionName?: string | null;  // nazwa opcji, z której otwarto (sortowanie)
  alreadyUsed: string[];              // URL-e już w docelowej liście
  onPick: (urls: string[]) => void;
  onCancel: () => void;
}
```

Render wzorowany na `FabricPicker`: `fixed inset-0 z-50`, `role="dialog"`,
`aria-modal="true"`, karta `max-w-2xl` (szersza od `FabricPicker`, bo siatka
miniatur), `max-h-[85vh]`, nagłówek z licznikiem zaznaczeń, autofocusowana szukajka,
przewijalna treść, stopka „Anuluj" / „Dodaj wybrane (n)" (disabled przy 0).
Miniatury: `next/image` 96 px w siatce `grid-cols-3 sm:grid-cols-4`, `sizes="96px"`
(lazy loading domyślny — bez paginacji, dziś to kilkadziesiąt zdjęć).
Stan lokalny: `selected: string[]`, `query: string`.

### `app/admin/produkty/[id]/ValueImagesPanel.tsx`

- Nowe propsy: `groups`, `optionName`. Obok „+ Dodaj zdjęcia" przycisk
  „+ Wybierz z wgranych" (render tylko gdy `groups` ma jakiekolwiek zdjęcie),
  otwiera `ImagePickerModal` z `contextOptionName={optionName}`,
  `alreadyUsed={urls}`, `onPick={onAdd}`.

### `app/admin/produkty/[id]/VariantsEditor.tsx`

- Przepuszcza nowy prop `variantImageGroups` przez `VariantsEditor` → `OptionRow`
  → `ValueImagesPanel` (+ `optionName={option.name}`). Bez zmian w logice
  zapisu i sprzątania `value_images`.

### `app/admin/produkty/[id]/ProductEditor.tsx`

- Przyjmuje prop `variantImageGroups`, przekazuje do `VariantsEditor`.
- W `headerAside` sekcji „Zdjęcia produktu" — przycisk „+ Wybierz z wgranych"
  (obok istniejącego, render pod tym samym warunkiem: `groups` ma jakiekolwiek
  zdjęcie) + `ImagePickerModal` bez kontekstu opcji,
  `alreadyUsed={images}`, `onPick` → `setImages((prev) => [...prev, ...urls.filter((u) => !prev.includes(u))])`.

## Poza zakresem

- Nazwana „Biblioteka zdjęć" (osobna tabela + ekran w adminie, referencje po id).
- Przypinanie / ulubione zdjęcia w wybieraku (możliwy follow-up, gdy lista urośnie).
- Listowanie kubełka Storage (pokazywałoby pliki sieroty bez kontekstu).
- Galerie produktów i próbki tkanin jako źródło listy (świadomie odcięte).
- Wybierak w blokach strony głównej, sekcjach opisu, kafelkach, sliderze.
- Kasowanie plików ze Storage, zmiana licznika referencji.
- Zmiany po stronie klienta sklepu, DE/i18n (panel admina jest tylko po polsku).
- Paginacja / wirtualizacja siatki miniatur.

## Testy

Nowy plik `app/_lib/__tests__/variant-image-suggestions.test.ts`:

- `collectVariantImageSuggestions`:
  - zbiera zdjęcia z wielu produktów, grupuje po nazwie opcji;
  - „STELAŻ" ∪ „Stelaż" ∪ „ stelaż " → jedna grupa, nagłówek „Stelaż";
  - pomija opcje „Tkanina" / „TKANINA" / „ tkanina " (slug w `EXCLUDED_OPTION_SLUGS`);
  - ten sam URL w dwóch produktach → jedna miniatura, podpis z pierwszego wystąpienia;
  - `variants: null` / `{}` / `options` nie-tablica / `value_images` nie-obiekt /
    element nie-string → pomijane, bez wyjątku;
  - opcja bez `value_images` i wartość z pustą tablicą → brak wpisu; grupa bez
    zdjęć nie powstaje;
  - pusta lista wierszy → `[]`.
- `sortGroupsForContext`: grupa kontekstu na początek (dopasowanie mimo casingu),
  brak kontekstu / kontekst bez grupy → kolejność bez zmian.
- `filterGroups`: puste zapytanie → wejście; dopasowanie po wartości, po nazwie
  produktu i po nazwie opcji; „lozko drewno" trafia „Łóżko … Drewno" (tokeny,
  diakrytyki, dowolna kolejność); brak trafień → `[]`.

Wszystkie istniejące testy (661 na main) pozostają zielone. Nowego e2e nie
dodajemy — mutacyjne e2e biją w prodową bazę (znana gotcha), a ryzyko regresji
po stronie klienta jest zerowe; weryfikacja przez klik-test w panelu.

## Kryteria akceptacji

1. W edytorze produktu przy wartości opcji „Stelaż" (📷) widać „+ Wybierz
   z wgranych"; modal pokazuje na górze grupę „Stelaż" ze zdjęciami stelaży
   z innych produktów.
2. Zaznaczenie dwóch miniatur i „Dodaj wybrane (2)" dodaje dwie miniatury do
   wartości; „Zapisz warianty" utrwala je i po odświeżeniu strony zdjęcia są
   na miejscu.
3. Modal nie pokazuje ani próbek z katalogu tkanin, ani zdjęć przypisanych do
   opcji „Tkanina", ani zdjęć z galerii produktów.
4. Zdjęcie już dodane do tej wartości jest w modalu wyszarzone i nieklikalne;
   nie da się zdublować URL-a.
5. Szukajka „stelaz" (bez ogonków) znajduje grupę „STELAŻ".
6. Sekcja „Zdjęcia produktu" ma ten sam przycisk i po „Zapisz zdjęcia" wybrane
   zdjęcie jest w galerii.
7. Produkt/instalacja bez żadnych `value_images` poza tkaniną → przycisku nie
   ma (zero martwych przycisków).
8. Karta produktu na `/sklep` i `/de` wygląda jak przed zmianą.
