# Wybór strony narożnika (Lewostronny/Prawostronny) — design

Data: 2026-07-03. Zatwierdzone przez użytkownika (poprawka: podpisy i wartości
`Lewostronny`/`Prawostronny`, nie `Lewa`/`Prawa`).

## Kontekst i problem

Narożniki L są produkowane w dwóch lustrzanych wersjach (szezlong po lewej albo
prawej stronie, patrząc od frontu). Klient musi móc wybrać stronę na karcie
produktu, a wybór musi dotrzeć do produkcji (pozycja zamówienia w adminie).
Nie każdy narożnik ma dwie strony — funkcja musi być włączana per produkt
w panelu admina. Istnieją gotowe grafiki `naroznik-lewostronny.svg` /
`naroznik-prawostronny.svg`, ale leżą w `public/` w **korzeniu repo** — poza
serwowanym `sklep-meblowy/public/` (dziś: 404 na mollien.pl) — i mają wtopiony
polski tekst „Lewy"/„Prawy" (problem na wersji DE).

W katalogu **już istnieją** produkty z ręcznie dodanymi opcjami wariantów
`STRONA`/`Strona`/`STRONA MEBLA` i wartościami `LEWOSTRONNY`/`PRAWOSTRONNY`/
`Lewa`/`Prawa` (w DB jest też literówka `LEWOSTORNNY`). Funkcja musi je
uszanować — klient nie może zobaczyć dwóch selektorów strony.

## Decyzje produktowe (odpowiedzi użytkownika)

1. **Wybór wymagany** — żadna strona nie jest wstępnie zaznaczona; bez wyboru
   nie da się dodać do koszyka.
2. **Strona nigdy nie wpływa na cenę** — czysty atrybut wykonania.
3. **Backfill: cała kategoria `naroznik-l` ON (opt-out)** — istniejące i przyszłe
   produkty kategorii mają wybór domyślnie włączony; admin wyłącza wyjątkom.
4. **Przełącznik w adminie widoczny tylko dla kategorii narożników**
   (grupa kategorii `naroznik`: `naroznik-l` + `naroznik-u`); dla `naroznik-u`
   domyślnie OFF.
5. **Podpisy i zapisywane wartości: `Lewostronny` / `Prawostronny`.**

## Podejście (wybrane: A)

Strona narożnika = **opcja wariantu** `"Strona": ["Lewostronny", "Prawostronny"]`
w istniejącym JSONB `products.variants`, wstawiana jako **pierwsza opcja**
(nad „Tkanina"). „Produkt ma wybór strony" = obecność opcji side-like
w `variants.options`. **Zero migracji schematu DB.**

Dzięki temu cały istniejący łańcuch działa bez zmian: walidacja kompletności
wyboru (`isVariantSelectionComplete` blokuje CTA i checkout — realizuje
decyzję 1), klucz pozycji koszyka, zapis `order_items.variant_values`,
widoki zamówień klienta/admina, ponowne zamówienie, reklamacje, tłumaczenia DE
(`formatVariantLabel`).

Odrzucone: **B** — dedykowana kolumna + osobne pole pozycji (zmiany w ~10
plikach ścieżki zakupowej; checkout dziś zapisuje `variant_values` tylko gdy
`hasVariants(product)` — atrybut spoza wariantów ginie). **C** — hybryda
flaga-DB + zapis do variantValues (dwa źródła prawdy, rozjazdy).

## Moduł `app/_lib/corner-side.ts` (czyste funkcje)

- `CORNER_SIDE_OPTION_NAME = "Strona"`, `CORNER_SIDE_VALUES = ["Lewostronny", "Prawostronny"]`
  — wzorzec zarezerwowanej nazwy jak `FABRIC_OPTION_NAME` w `variants.ts`.
- `isCornerSideOptionName(name)` — rozpoznanie **znormalizowane**
  (trim + case-insensitive): `Strona`, `STRONA`, `STRONA MEBLA` ⇒ produkty
  z ręcznymi opcjami dostają graficzny picker bez zmiany swoich danych.
- `cornerSideOf(value): 'left' | 'right' | null` — po znormalizowanym prefiksie
  (`LEW*` → left, `PRAW*` → right); pokrywa `Lewa`, `LEWOSTRONNY`, `LEWOSTORNNY`,
  `Lewostronny` itd.
- `applyCornerSideSelection(variants, enabled)` — dodaje/usuwa opcję kanoniczną:
  - **Włączanie na produkcie z istniejącymi wariantami:** kombinacje są
    rozmnażane ×2 z **zachowaniem** `stock`/`price_modifier`/`sale_price`/
    `omnibus_price`/`images` (kopiowane na obie strony — strona nie zmienia
    ceny, duplikacja jest poprawna). Świadomie NIE używamy tu naiwnego
    `rebuildCombinations`, który wyzerowałby promocje i zdjęcia kombinacji.
  - **Włączanie na produkcie bez wariantów (`variants: null`):** powstaje
    struktura z jedną opcją i dwiema kombinacjami.
  - **Wyłączanie:** kolaps do jednej kombinacji per pozostały klucz (pierwsza
    pasująca); usunięcie ostatniej opcji ⇒ `variants: null`.
  - Idempotentne w obie strony.

## Grafiki

- **Przeniesienie** obu SVG z korzenia repo do `sklep-meblowy/public/`
  (płasko, obok `logo.svg`); kopie w korzeniu usunięte — jedno źródło prawdy.
  Upload adminem odpada celowo (`validateImageUpload` odrzuca SVG — stored XSS).
- **Edycja SVG:** usunąć `<text>Lewy/Prawy</text>` oraz wewnętrzne
  `aria-label`/`<title>` (etykieta idzie z HTML w języku strony; przy `<Image>`
  wewnętrzne atrybuty i tak nie są czytane). Figurka osoby zostaje (punkt
  odniesienia „patrząc od frontu"). Kolory bez zmian (`#1a1a2e` + `#c9a84c`).
  Prawostronny pozostaje lustrem lewego (`translate(200,0) scale(-1,1)`);
  lewy = źródło prawdy geometrii.
- Render przez `next/image` z jawnym `width`/`height` (wzorzec ikon płatności
  w `Footer.tsx`; `images.unoptimized: true` w `next.config.ts`).

## Karta produktu (klient)

- `VariantSelector.tsx`: nowy branch `isCornerSideOptionName(option.name)` →
  `CornerSideGroup` (obok istniejącego case'a `FABRIC_OPTION_NAME` →
  `FabricSwatchGroup` — ten sam wzorzec).
- `CornerSideGroup`: dwa kafelki-przyciski obok siebie — SVG na jasnym kafelku
  (czytelnym w dark mode), podpis pod grafiką z wartości opcji przez istniejący
  mechanizm etykiet (`overrides.value_labels` → mapy DE), `aria-pressed`,
  złota obwódka aktywnego (spójnie z próbkami tkanin). Przy wartości
  nierozpoznanej przez `cornerSideOf` — fallback do zwykłego chipa tekstowego.
- Pod grupą drobna podpowiedź „Strony patrząc od frontu" — **jedyny nowy klucz
  słownika** (`product.cornerSideHint` w `pl.ts` + `de.ts`; deepMerge obsługuje
  tylko 2 poziomy — klucz płaski; test parytetu wymusza PL i DE razem).
- Nagłówek opcji („Strona"→„Seite") — automatycznie z `VARIANT_OPTION_DE`.
- Bez preselekcji: stan `selected` startuje pusty — wymóg wyboru załatwia
  istniejąca walidacja (CTA + serwer).

## Panel admina

- `VariantsEditor` dostaje kategorię produktu z `ProductEditor` (props);
  gdy kategoria należy do grupy `naroznik` → przełącznik **„Wybór strony
  narożnika (Lewostronny/Prawostronny)"** obok „Wybierz z katalogu tkanin".
- Przełącznik działa na lokalnym stanie edytora (`setVariants` przez
  `applyCornerSideSelection`) + zapis istniejącym „Zapisz warianty"
  (`updateProductVariants`) — dziedziczy dirty-detection (JSON.stringify vs
  baseline), walidację serwerową i `revalidatePath`. Żadnej osobnej akcji.
- Stan przełącznika = wykrycie opcji side-like w bieżących `options`
  (uwzględnia ręczne `STRONA`/`STRONA MEBLA`).
- **Nowe produkty:** tworzone w kategorii `naroznik-l` dostają opcję Strona
  automatycznie (`buildNewProductPayload` — czysta funkcja + test);
  `naroznik-u` — przełącznik dostępny, domyślnie OFF.

## Backfill (decyzja 3)

- Idempotentna server action `enableCornerSideForCategory('naroznik-l')`
  (wzorzec: `requireAdmin` → `createAdminClient` → per produkt
  `applyCornerSideSelection(true)` → update + `revalidatePath`).
  Pomija produkty, które już mają opcję side-like (ręczne warianty nietknięte).
- Uruchomienie: **tymczasowy przycisk** w `/admin/produkty` („Włącz wybór
  strony dla narożników L"). Po potwierdzonym wykonaniu na prodzie przycisk
  usuwamy osobnym commitem — żeby przypadkowe kliknięcie w przyszłości nie
  nadpisało opt-outów.
- Dlaczego nie migracja SQL: cross-join JSONB w SQL jest nietestowalny
  lokalnie (env tylko na Vercelu, migracje aplikowane ręcznie — numeracja już
  zdublowana: 40/40, 41/41), a server action reuse'uje przetestowaną czystą
  funkcję TS i istniejącą ścieżkę zapisu z walidacją.

## i18n

- Nazwa i wartości opcji: dopisać do `de-content-maps.ts` dwie pozycje
  mixed-case `Lewostronny→Links`, `Prawostronny→Rechts` (mapy mają już
  `LEWOSTRONNY`/`PRAWOSTRONNY`/`Lewa`/`Prawa` i `Strona→Seite`) + aktualizacja
  snapshotów w `__tests__/de-content-maps.test.ts`.
- Zawsze przechowujemy **kanoniczne PL** w koszyku/zamówieniu; tłumaczenie
  wyłącznie przy renderze (`formatVariantLabel` / `mapDe`) — admin widzi PL
  na sztywno.
- Nowy klucz `product.cornerSideHint` w `pl.ts` i `de.ts` (razem — test
  parytetu).

## Nie-cele (YAGNI)

- Osobna kolumna/flaga w DB, migracje schematu.
- E-maile potwierdzenia (nie istnieją w kodzie — nic do zmiany).
- Normalizacja/migracja ręcznie dodanych opcji `STRONA`/`STRONA MEBLA`
  w istniejących produktach (picker rozpozna je bez zmiany danych).
- Automatyczne lustrzane zdjęcia kombinacji per strona (admin może podmienić
  ręcznie po włączeniu).
- Tłumaczenie UI panelu admina (panel jest po polsku na twardo).

## Testy (TDD, vitest — tylko czyste funkcje, środowisko node)

- Nowy `app/_lib/__tests__/corner-side.test.ts` (konwencja: describe/it po
  polsku ze strzałką →, wąskie importy):
  - rozpoznawanie nazw (`Strona`, `STRONA`, `strona `, `STRONA MEBLA`; odrzuca
    `Kolor`),
  - `cornerSideOf` (`Lewostronny`, `LEWOSTRONNY`, `LEWOSTORNNY`, `Lewa` → left;
    `Prawostronny`, `Prawa` → right; `Sawana 21` → null),
  - `applyCornerSideSelection`: `null` → 2 kombinacje; z tkaninami →
    podwojenie z zachowaniem `stock`/`sale_price`/`omnibus_price`/`images`;
    OFF → kolaps; ostatnia opcja → `null`; idempotencja obu kierunków.
- Aktualizacja `new-product.test.ts` (default dla `naroznik-l`)
  i `de-content-maps.test.ts` (nowe wpisy map).
- Testów komponentów nie ma w infrastrukturze (brak jsdom) — logika wyboru
  wyciągnięta do czystych funkcji; UI weryfikowane end-to-end na dev serwerze
  (karta produktu → koszyk → checkout → admin zamówienia).

## Znane konsekwencje (zaakceptowane)

- Stare koszyki localStorage z narożnikiem sprzed włączenia: checkout odrzuci
  pozycję z prośbą o ponowny wybór (istniejące zachowanie przy każdej zmianie
  wariantów).
- Historia cen (Omnibus) kluczowana po kombinacji — kopiowanie `omnibus_price`
  zachowuje wyświetlane dane, ale historia liczy się od nowa dla nowych kluczy.
- Zdjęcia per kombinacja po włączeniu strony są zdublowane na obie strony.

## Gałąź i wdrożenie

- Implementacja na gałęzi `feat/naroznik-strona` od `origin/main` — funkcja
  niezależna od `feat/platnosci-direct-p24`.
- Przed pisaniem kodu: przeczytać odpowiednie docsy w
  `node_modules/next/dist/docs/` (AGENTS.md: wersja Next ma breaking changes).
- Po deployu: admin klika backfill w `/admin/produkty`, weryfikacja na
  produkcie narożnika, usunięcie przycisku backfillu osobnym commitem.
