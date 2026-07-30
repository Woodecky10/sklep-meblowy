# Tkaniny — zwijane sekcje grup cenowych (spec, 2026-07-30)

> ## ⚠️ KOREKTA (2026-07-30 wieczór) — ten spec trafił w złe miejsce
>
> Właściciel po obejrzeniu implementacji doprecyzował (zrzutem ekranu):
> zgłoszenie „grupy zwinięte" dotyczyło **wyboru tkaniny na KARCIE PRODUKTU**
> (`VariantSelector` → `FabricSwatchGroup`), nie katalogu `/tkaniny`.
> `/tkaniny` ma pokazywać wszystko bez zwijania — implementację z tego speca
> **cofnięto** (commit `fe370115`), zanim weszła na produkcję.
>
> Wykonane zamiast tego (commit `86e1d52e`): na karcie produktu karty grup
> cenowych widoczne **od wejścia, wszystkie zwinięte**, bez kroku „5 próbek +
> Zobacz więcej"; wyjątek — produkt bez tkanin z katalogu zostaje przy widoku
> kompaktowym. Guard: `e2e/fabric-group-cards.spec.ts`.
>
> Z tego speca przeżyło: wydzielenie `colorsLabel` do `app/_lib/fabric-labels.ts`
> z testami. Reszty poniższego tekstu **nie implementować ponownie**.

## Problem

`/tkaniny` wyświetla wszystkie tkaniny naraz: trzy sekcje grup cenowych, każda z
pełną siatką kafelków. Na produkcji to 17 tkanin (Standard 5, Premium 6, Premium
High 6), więc strona jest długa, a klient musi ją przewinąć, żeby zobaczyć, jakie
grupy w ogóle istnieją i ile kosztuje dopłata do każdej.

Zgłoszenie właściciela: pokazać grupy zwinięte i pozwolić klientowi rozwinąć tę,
która go interesuje.

> Uwaga na nieporozumienie w zgłoszeniu: strona **nie jest** płaską listą A–Z,
> jest już podzielona na grupy. Wrażenie „od A do Z" bierze się z sortowania
> tkanin wewnątrz grupy (`sort_order`, potem `name` — `app/_lib/fabrics.ts`).
> Sortowania nie zmieniamy. „Pierwsze 3 grupy" to w praktyce wszystkie trzy, bo
> tyle istnieje w bazie.

## Decyzje (ustalone z właścicielem)

1. **Zwijamy sekcje grup**, nie kafelki wewnątrz grup. Nagłówek grupy zostaje
   widoczny, siatka tkanin jest ukryta do kliknięcia.
2. **Sekcje niezależne** — klient może mieć otwarte wszystkie trzy naraz i
   porównywać tkaniny między grupami cenowymi. Bez akordeonu.
3. **Zwinięty nagłówek pokazuje podgląd** — rządek pięciu miniatur z tej grupy,
   żeby po wejściu na stronę było widać charakter tkanin, a nie trzy wiersze
   tekstu.
4. **Stan początkowy: wszystkie zwinięte.**

## Rozwiązanie

### Mechanizm: natywne `<details>/<summary>`

Bez JavaScriptu i bez komponentu klienckiego. Ten wzorzec jest już w projekcie —
`app/sklep/CollectionIntro.tsx` rozwija opis kolekcji dokładnie tak, z
uzasadnieniem w komentarzu („ZERO JavaScriptu (…) działa bez hydracji, jest
dostępne z klawiatury out of the box, a cały tekst siedzi w HTML od razu").

Konsekwencje, wszystkie pożądane:

- **SEO:** `<details>` ukrywa treść, ale nie usuwa jej z HTML. Wszystkie 17
  linków do `/tkaniny/[slug]` zostaje w źródle strony, więc linkowanie
  wewnętrzne nie ucierpi.
- **Dostępność:** `<summary>` jest natywnie interaktywny — Enter/Space, focus,
  poprawna rola dla czytników ekranu. Nie trzeba `role`, `aria-expanded` ani
  obsługi klawiatury.
- **Niezależność sekcji:** `<details>` bez atrybutu `name` nie tworzy
  akordeonu — dostajemy zachowanie z decyzji 2 bez żadnego kodu.
- **Ograniczenie:** nie ma płynnej animacji rozsuwania wysokości. Akceptujemy —
  pokazanie/ukrycie wystarcza, a animacja wymagałaby komponentu klienckiego.

Odrzucona alternatywa: komponent kliencki z `useState`. Dawałby animację, ale
kosztem `"use client"`, hydracji, większej ilości kodu i ryzyka, że zwinięte
kafelki wypadną z DOM (utrata linkowania wewnętrznego).

### Pliki

**`app/tkaniny/page.tsx`** — zostaje serwerowy i dalej pobiera dane
(`getAllFabrics`, `getFabricPriceGroups`, `getEurRate`) oraz składa `sections`.
Zamiast renderować nagłówek i siatkę inline, renderuje `<FabricGroupSection>` na
sekcję. Plik ma dziś 114 linii z całą siatką kafelków w środku; po zmianie
zostaje w nim tylko pobranie danych, metadane i nagłówek strony.

**`app/tkaniny/FabricGroupSection.tsx`** (nowy, serwerowy — bez `"use client"`) —
jedna sekcja grupy. Props:

```ts
{
  group: FabricPriceGroup;  // id, name, name_de, surcharge
  items: Fabric[];          // tkaniny tej grupy, już posortowane
  locale: Locale;
  rate: number;             // kurs EUR do formatMoney
}
```

> ⚠️ Typ nazywa się `FabricPriceGroup` (zwraca go `getFabricPriceGroups`).
> Nazwa `FabricGroup` jest już zajęta i **znaczy coś innego** —
> `app/_lib/fabric-groups.ts` definiuje ją jako `{ category, fabrics }`, czyli
> grupowanie tkanin po kategorii w pickerze admina. Nie mieszać.

Do nowego pliku przenosi się z `page.tsx` funkcja `fabricThumb` (pierwsze
zdjęcie koloru), używana i przez kafelki, i przez miniatury w nagłówku.

Funkcje od liczby mnogiej trafiają do osobnego, testowalnego modułu
**`app/_lib/fabric-labels.ts`**: przeniesiony `colorsLabel` (dziś siedzi w
`page.tsx` jako funkcja nieeksportowana i nieprzetestowana) oraz nowy
`fabricsLabel(n, t)` do licznika w nagłówku. Dzięki temu oba mają test
jednostkowy w miejscu, w którym projekt trzyma testy (`app/_lib/__tests__/`).

### Nagłówek (`<summary>`)

Zawiera, w jednym wierszu na desktopie i zawijając się na mobile:

- nazwa grupy — `pickLocalized(group.name, group.name_de, locale)`
- dopłata — `formatMoney(group.surcharge, locale, rate)` z prefiksem `+`, albo
  `t.fabrics.groupNoSurcharge`, gdy `surcharge === 0` (dokładnie jak dziś)
- licznik — `${items.length} ${fabricsLabel(items.length, t)}`
- rządek **pięciu** miniatur (`items.slice(0, 5)`), każda ~40×40, `rounded-md`.
  Tkanina bez zdjęcia dostaje dwa pierwsze znaki nazwy — jak w kafelku.
  Rządek ma klasę `group-open:hidden`, bo po rozwinięciu duplikowałby pierwsze
  kafelki siatki.
- chevron — `group-open:rotate-180`, `aria-hidden`

Marker przeglądarki ukryty przez `list-none` +
`[&::-webkit-details-marker]:hidden`, jak w `CollectionIntro.tsx`.

### Zawartość

Istniejąca siatka bez zmian merytorycznych: `grid grid-cols-2 sm:grid-cols-3
lg:grid-cols-5 gap-6`, kafelek jako `LocalizedLink` do `/tkaniny/${f.slug}`,
zdjęcie `aspect-square`, nazwa i licznik kolorów.

### i18n

Trzy nowe klucze w bloku `fabrics` — w typie i w wartościach `pl.ts` oraz `de.ts`
(wzorzec: istniejące `colorsOne/colorsFew/colorsMany`):

| klucz | PL | DE |
|---|---|---|
| `fabricsOne` | `tkanina` | `Stoff` |
| `fabricsFew` | `tkaniny` | `Stoffe` |
| `fabricsMany` | `tkanin` | `Stoffe` |

Niemiecki nie ma polskiego rozróżnienia 2–4 / 5+, więc `fabricsFew` i
`fabricsMany` mają tam tę samą wartość — tak samo jak przy kolorach.

## Testy

W projekcie **nie ma infrastruktury do testów renderu komponentów** — brak
`@testing-library`, brak środowiska `jsdom` w konfiguracji vitesta, zero plików
testowych `.tsx`. Nie dokładamy jej dla tej zmiany: byłaby większa niż sama
funkcjonalność. Dzielimy testy zgodnie z tym, co projekt już ma.

**Vitest (jednostkowo), `app/_lib/__tests__/fabric-labels.test.ts`:**

1. `fabricsLabel` — 1 → `tkanina`, 2/3/4 → `tkaniny`, 5/11/25 → `tkanin`,
   12/13/14 → `tkanin` (pułapka polskiej odmiany).
2. `colorsLabel` — te same przypadki dla kolorów. Funkcja istnieje od dawna i
   nigdy nie miała testu; przy przenoszeniu do modułu dostaje pokrycie.
3. Oba dla `de` — sprawdzenie, że wariant „few" i „many" dają tę samą wartość.

**Playwright (e2e), `e2e/tkaniny-grupy.spec.ts`** — projekt ma już zestaw e2e
(`e2e/*.spec.ts`, m.in. `fabric-properties.spec.ts`, `variant-tooltip.spec.ts`),
więc zachowanie w DOM sprawdzamy tam:

4. **Guard SEO:** przy wejściu na `/tkaniny`, ze wszystkimi sekcjami zwiniętymi,
   liczba linków `a[href^="/tkaniny/"]` w DOM równa się liczbie tkanin. Gdyby
   ktoś przepisał sekcje na render warunkowy, ten test padnie.
5. Klik w `summary` pierwszej grupy odsłania jej siatkę (kafelki stają się
   widoczne), a pozostałe sekcje zostają zwinięte — potwierdzenie, że sekcje są
   niezależne, a nie akordeonem.
6. Rządek miniatur w nagłówku znika po rozwinięciu sekcji.

> ⚠️ Uruchamiając e2e, ustaw `E2E_BASE_URL` na lokalny serwer. Bez tej zmiennej
> testy lecą na **produkcję** — patrz `e2e/README.md` i notatki projektowe.

## Poza zakresem (świadomie)

- Zapamiętywanie, które sekcje były otwarte (localStorage, URL).
- Przycisk „rozwiń wszystkie".
- Animacja wysokości przy rozwijaniu.
- Zmiana sortowania tkanin wewnątrz grupy.
- Wyszukiwanie i filtrowanie tkanin.

Przy trzech grupach i 17 tkaninach to złożoność bez zwrotu. Dodamy, jeśli
właścicielka zgłosi potrzebę.

## Ryzyka

- **Miniatury dublują treść kafelków.** Rozwiązane przez `group-open:hidden` —
  widoczne tylko przy zwiniętej sekcji.
- **Wzrost liczby grup w przyszłości.** Panel admina pozwala dodawać grupy
  cenowe; rozwiązanie skaluje się bez zmian, bo renderujemy wszystkie sekcje
  zwinięte, niezależnie od ich liczby.
- **Grupa bez tkanin** nie pojawi się wcale — `page.tsx` już dziś filtruje
  `items.length > 0` i to zostaje.
