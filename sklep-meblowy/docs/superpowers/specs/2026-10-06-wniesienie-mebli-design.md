# Wniesienie mebli (+250 zł) przy każdym produkcie

Projekt z 2026-10-06. Prośba właściciela: przy każdym produkcie opcja
„wniesienie mebli" za +250 zł.

## Stan wyjściowy — odczytany z kodu i danych

- Wniesienie istnieje dziś na **jednym** produkcie (Narożnik Vegas Twin,
  `1105e534-…`) jako ręcznie dodany wariant: opcja „Dostawa z wniesieniem do
  4-tego piętra", wartości `Tak`/`Nie`, `value_prices: { Tak: 250 }`.
- Dopłaty wariantów (`value_prices`) wchodzą w cenę sztuki: serwer liczy
  `effectivePrice(price + dopłata, sale_price + dopłata)`
  (`app/api/checkout/route.ts`, `sumValueSurcharges` z `app/_lib/variants.ts`).
  Przez to rabat zestawu (`computeBundleDiscount`) i kod rabatowy
  (`eligiblePromoBase` → `validatePromoCode`) obniżają też dopłaty.
- Checkout przyjmuje `variantValues` **tylko** dla produktów z wariantami
  (`if (hasVariants(product))`) — przy produkcie bez wariantów są wyrzucane,
  a do zamówienia idzie `variant_values: null`. Przy produkcie z wariantami
  zapisuje wszystko, co przysłał klient, bez filtrowania kluczy.
- `variant_values` zamówienia wyświetlają: panel (`admin/zamowienia/[id]`),
  mail do klienta i do admina, konto klienta, koszyk i checkout — wszędzie
  przez `formatVariantLabel` („Klucz: wartość"), z tłumaczeniem DE przez
  `VARIANT_OPTION_DE` / `VARIANT_VALUE_DE` (`Tak` → `Ja` już istnieje).
- Klucz pozycji koszyka (`itemKey`) i klucz egzemplarza zestawu
  (`bundleUnitKey`) zawierają `variantValues`.
- Katalog: 413 aktywnych produktów, 83 bez wariantów (głównie materace).
- `/dostawa` mówi: „Wniesienie mebli na konkretne piętro lub do mieszkania
  można zamówić dodatkowo – szczegóły podaj przy telefonicznym ustalaniu
  terminu dostawy." Regulamin o wniesieniu nie wspomina.

## Rozstrzygnięcia z właścicielem (2026-10-06)

1. **Pole do zaznaczenia, domyślnie odznaczone** — nie wariant Tak/Nie do
   wyboru. Nie blokuje „Dodaj do koszyka" ani „Kup teraz".
2. Opcja dodawana **w kodzie** do każdego produktu (także przyszłych), nie
   kopiowana do danych. Cena w jednym miejscu w kodzie.
3. **Za sztukę**: 2 fotele z wniesieniem = +500 zł. Wszystkie produkty, bez
   wyjątków kategorii. W zestawie — osobno przy każdym elemencie.
4. **Rabaty nie obejmują wniesienia**: kod rabatowy, rabat zestawu i próg
   minimalnej kwoty kodu liczą się od ceny bez wniesienia. Wniesienie zawsze
   kosztuje pełne 250 zł.
5. Cena na stronie produktu **się nie zmienia** po zaznaczeniu — przy polu
   stoi „+250 zł". Omnibus i przekreślona cena dotyczą samego mebla.
6. Ręczny wariant z Vegas Twin usuwamy po wdrożeniu.

## Sekcja 1 — Model

Nowy moduł `app/_lib/carry-in.ts` (czysty, bez zależności serwerowych —
używa go klient i serwer):

```ts
export const CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";
export const CARRY_IN_VALUE = "Tak";
export const CARRY_IN_PRICE = 250;

carryInSurcharge(values?: Record<string, string> | null): number
  // 250, gdy values[CARRY_IN_KEY] === "Tak"; inaczej 0
setCarryIn(values: Record<string, string>, on: boolean): Record<string, string>
  // nowy obiekt z kluczem albo bez niego (nigdy "Nie" — brak klucza = brak usługi)
discountableSubtotal(unitPrice: number, qty: number, values?): number
  // (unitPrice − carryInSurcharge(values)) × qty — podstawa rabatów
```

Wniesienie **nie jest opcją wariantu** (`product.variants` się nie zmienia).
Żyje obok wybranych wartości wariantu, w tym samym słowniku `variantValues`.
Dzięki temu bez zmian działają: klucz pozycji koszyka (z wniesieniem i bez =
dwie pozycje), klucz zestawu, zapis w zamówieniu i wyświetlanie
„Wniesienie mebli do 4. piętra: Tak" w panelu, mailach i koncie.
`isVariantSelectionComplete`, `sumValueSurcharges`, `getVariantImages`,
`VariantSelector` iterują po opcjach produktu, więc nieznany im klucz ignorują.

⚠️ `CARRY_IN_KEY` to klucz zapisu, nie tylko napis: zmiana tekstu sprawi, że
koszyki zapisane w przeglądarkach przed zmianą stracą wniesienie przy
checkoucie. Napis na stronie produktu jest osobno w słowniku i można go
zmieniać swobodnie.

## Sekcja 2 — Strona produktu, zestaw, koszyk

- **`CarryInOption.tsx`** (nowy): checkbox „Wniesienie mebli (do 4. piętra)"
  + „+250 zł" (`formatMoney`, z kursem EUR na `/de`). Etykiety w słownikach
  `pl.ts`/`de.ts` (`product.carryInLabel`).
- **`ProductActions`**: renderuje `CarryInOption` pod `VariantSelector`
  (także przy produktach bez wariantów). Stan wniesienia trzyma ten sam
  `selected` z `ProductMainSection` (przez `setCarryIn`). Cena przekazywana do
  `AddToCartButton` = `getVariantEffectivePrice(product, selected) +
  carryInSurcharge(selected)`. `needsVariant` bez zmian.
- **`ProductMainSection`**: cena, Omnibus, galeria bez zmian (ignorują klucz).
- **`AddToCartButton`**: bez zmian w logice — `variantValues` idą, gdy
  `selected` nie jest pusty, więc samo wniesienie przy produkcie bez wariantów
  też trafia do koszyka. Wariant `compact` (karty listingu) bez wniesienia.
- **`BundleConfigurator`**: `CarryInOption` przy każdym elemencie. Cena
  elementu z wniesieniem, rabat zestawu od podstawy bez wniesienia.
  `variantValues` przekazywane, gdy niepuste (dziś tylko `hasVariants(p)` —
  zgubiłoby wniesienie przy elemencie bez wariantów).
- **Koszyk / checkout (UI)**: `groupCartBundles` liczy `base` przez
  `discountableSubtotal`; koszyk liczy `eligiblePromoBase` z
  `discountableSubtotal` i tę kwotę wysyła do `applyPromoCodeAction`.
  Wyświetlanie pozycji bez zmian (dopisek przez `formatVariantLabel`).
- **DE**: `VARIANT_OPTION_DE[CARRY_IN_KEY] = "Hereintragen bis 4. Etage"`.

## Sekcja 3 — Checkout (serwer)

Nowa czysta funkcja `priceCheckoutItem(product, rawValues)` w
`app/_lib/checkout-pricing.ts`, wywoływana z `/api/checkout` zamiast
obecnego bloku `if (hasVariants(product)) { … }`:

1. Jeśli produkt ma warianty i wybór jest niekompletny → `{ ok: false }`
   (route odpowiada 400 „Brak wyboru wariantu", jak dziś).
2. Filtrowanie kluczy: zostają nazwy opcji produktu + `CARRY_IN_KEY`, ale ten
   tylko z wartością `"Tak"`. Reszta odpada. Pusty wynik → `null`.
3. `unitPrice = effectivePrice(price + dopłata, sale + dopłata) +
   carryInSurcharge(values)` — 250 zł z serwerowej stałej, nie z klienta.
4. Zwraca `{ ok: true, unitPrice, variantValues }`.

W route `computedItems[].subtotal` = `discountableSubtotal(unitPrice, qty,
variantValues)` — z tego liczy się rabat zestawu (`groupBundleUnits`) i
podstawa kodu (`eligiblePromoBase`). `total` (do P24) dalej sumuje pełne
`unitPrice × qty`. GA/Meta dostają pełną kwotę pozycji.

Zmiana zachowania: przy produkcie z wariantami serwer przestaje zapisywać
obce klucze z przeglądarki. Dziś koszyki zawierają tylko klucze opcji, więc
klient tego nie odczuje.

## Sekcja 4 — Porządki po wdrożeniu

- **Vegas Twin**: usunąć opcję „Dostawa z wniesieniem do 4-tego piętra" w
  panelu (edytor wariantów) zaraz po wdrożeniu — inaczej dwa wniesienia
  (+500 zł). Przez kilka minut po wdrożeniu produkt ma oba. Koszyk, w którym
  ktoś ma starą opcję, po usunięciu zapłaci bez tych 250 zł (serwer odfiltruje
  klucz) — rzadkie i na korzyść klienta. Zapis w żywej bazie → przed
  kliknięciem potwierdzenie właściciela.
- **`/dostawa`** (PL i DE): „Wniesienie mebli do 4. piętra możesz zamówić przy
  produkcie — 250 zł za sztukę." w miejsce zdania o telefonie.

## Testy

- `carry-in.test.ts`: `carryInSurcharge` (Tak / brak / inna wartość / null),
  `setCarryIn` (dodaje, usuwa, nie mutuje), `discountableSubtotal`.
- `checkout-pricing.test.ts`: produkt bez wariantów z wniesieniem i bez;
  z wariantami + dopłata + wniesienie; promocja (wniesienie doliczone po
  `effectivePrice`, nie obniżone); niekompletny wybór → `ok: false`; obce
  klucze i `"Nie"` odfiltrowane.
- `bundles.test.ts`: `groupCartBundles` — `base` bez wniesienia.
- E2E `e2e/wniesienie.spec.ts` na lokalnym buildzie: zaznaczenie → koszyk
  z dopiskiem i ceną +250 zł; bez zaznaczenia — bez dopisku. Checkoutu do
  końca nie przeklikujemy (zamówienie w żywej bazie) — ceny serwera pokrywają
  testy jednostkowe.

## Poza zakresem (świadomie)

- Wniesienie z karty produktu w listingu (szybkie dodawanie bez niego).
- Wniesienie raz na zamówienie zamiast za sztukę.
- Wyłączanie kategorii (np. materace nawierzchniowe).
- Cena wniesienia edytowalna w panelu — stała w kodzie.
