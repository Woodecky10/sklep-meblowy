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

---

## Aktualizacja 2026-10-06 — wniesienie raz na zamówienie, w checkoucie

Kilka godzin po wdrożeniu powyższego (PR #185) właściciel zmienił zdanie:
wniesienie ma być wybierane **w podsumowaniu zamówienia, między „Adres
dostawy" a „Metoda płatności"**, i kosztować **250 zł raz na zamówienie**,
niezależnie od liczby mebli. Pole przy produkcie i w zestawach **znika**.
Ta sekcja ZASTĘPUJE rozstrzygnięcia 1, 3 i 5 oraz Sekcje 1–3 powyżej tam,
gdzie się z nimi kłóci; rozstrzygnięcie 4 (rabaty nie obejmują wniesienia)
i 6 (Vegas Twin — zrobione) zostają.

### Stan wyjściowy (odczytany 2026-10-06)

- Checkout (`app/checkout/CheckoutForm.tsx`), lewa kolumna: Kontakt →
  Adres dostawy → Metoda płatności; prawa: podsumowanie (Produkty, rabat
  zestawu, kod, Dostawa, Razem). Formularz wysyła do `/api/checkout`
  `items`, dane klienta, `promoCode`, `locale`, `paymentMethod`.
- Pozycja zamówienia spoza katalogu istnieje od migracji 82
  (`order_items.product_id` nullable + `custom_name`, CHECK „produkt ALBO
  nazwa"); na produkcji kolumna jest (PostgREST 200). Panel, oba maile,
  mail „przyjęte", konto klienta i lista zamówień nazywają pozycje przez
  `orderItemDisplayName`, więc taki wiersz pokażą bez zmian.
- `createOrder` wstawia pozycje tak, jak je dostanie (`custom_name` przejdzie).
- Zdarzenie zakupu (`app/checkout/success/page.tsx`) buduje listę pozycji
  z `order.items` (`productId: item.product_id ?? ""`), wartość = `order.total`.
- „Zamów ponownie" liczy pozycję bez produktu jako niedostępną.
- W bazie **0 zamówień** z kluczem wniesienia przy meblu (sprawdzone przez
  PostgREST). Koszyki w przeglądarkach mogą go mieć (kilka godzin na prodzie).

### Rozstrzygnięcia z właścicielem

A. Jedno pole w checkoucie, nowa sekcja między „Adres dostawy" a „Metoda
   płatności": „Dostawa z wniesieniem do 4. piętra +250 zł", domyślnie
   odznaczone.
B. 250 zł **raz na zamówienie**.
C. Pole przy produkcie i przy elementach zestawu znika.
D. W podsumowaniu wiersz „Wniesienie mebli +250 zł" (tylko gdy zaznaczone),
   suma +250 zł.
E. Wybór pamięta koszyk (powrót na checkout = pole nadal zaznaczone),
   czyści się po złożeniu zamówienia.
F. Koszyki z kluczem przy meblu: przy wczytaniu klucz znika z pozycji, cena
   pozycji −250 zł, a pole w checkoucie startuje zaznaczone.
G. Rabaty (kod, zestaw, próg kodu) nie obejmują wniesienia.
H. Analityka: wartość zakupu z wniesieniem; na liście produktów zdarzenia
   zakupu tylko meble (bez wiersza bez `product_id`).
I. „Zamów ponownie" pomija wiersz wniesienia po cichu (nie jako „niedostępny").
J. `/dostawa`: wniesienie zaznacza się w podsumowaniu zamówienia, 250 zł za
   zamówienie.

### Model

`app/_lib/carry-in.ts` po zmianie:

```ts
export const CARRY_IN_PRICE = 250;
// Nazwa pozycji zamówienia (order_items.custom_name) — klucz zapisu w
// zamówieniach, nie zmieniać (filtrowanie w „Zamów ponownie" i analityce).
export const CARRY_IN_LINE_NAME = "Wniesienie mebli do 4. piętra";
// Klucz z wersji „za sztukę" (PR #185) — zostaje WYŁĄCZNIE do migracji
// koszyków z localStorage.
export const LEGACY_ITEM_CARRY_IN_KEY = "Wniesienie mebli do 4. piętra";

carryInOrderLine(): { product_id: null; custom_name: string; quantity: 1;
  price: number; variant_values: null; notes: null }
isCarryInLine(item: { product_id?: string | null; custom_name?: string | null }): boolean
  // product_id == null && custom_name === CARRY_IN_LINE_NAME
migrateLegacyCarryIn<T extends { price: number; variantValues?: Record<string, string> }>(items: T[]):
  { items: T[]; carryIn: boolean }
  // usuwa klucz z variantValues (pusty słownik → undefined), price −250,
  // carryIn = czy którakolwiek pozycja miała klucz z wartością "Tak"
```

Znika: `CARRY_IN_KEY`/`CARRY_IN_VALUE` jako klucz pozycji, `hasCarryIn`,
`carryInSurcharge`, `setCarryIn`, `discountableSubtotal` (podstawy rabatów
wracają do `price × qty`), `discountBase` w `groupCartBundles`, wpis
`VARIANT_OPTION_DE` dla klucza. `Tak: "Ja"` w `VARIANT_VALUE_DE` zostaje
(poprawny niezależnie).

### Koszyk (stan)

- `CartState` dostaje `carryIn: boolean`; akcja `SET_CARRY_IN`; `HYDRATE`
  niesie `carryIn`; `CLEAR` zeruje. Persist w `localStorage`
  (`mollien-cart-carry-in`), czyszczony w `clear()` razem z resztą.
- Hydratacja: `migrateLegacyCarryIn(parsedItems)`; `carryIn` = zapisane
  `|| migracja`. Zmigrowane pozycje zapisują się z powrotem przy pierwszym
  persist.

### Checkout (UI)

- Nowa sekcja (nagłówek jak pozostałe, np. „Wniesienie mebli" /
  „Hineintragen") z checkboxem: etykieta „Dostawa z wniesieniem do 4. piętra"
  + „+250 zł" (`formatMoney`, EUR na `/de`). Stan z `useCart().carryIn`.
- Podsumowanie: wiersz „Wniesienie mebli" `+250 zł` pod rabatami, nad
  „Dostawa"; `grandTotal = max(0, total − bundleDiscount − discount) +
  (carryIn ? CARRY_IN_PRICE : 0)`.
- Payload: `carryIn: carryIn === true`.
- `CarryInOption` znika ze strony produktu i z `BundleConfigurator`
  (komponent można przerobić na checkout albo usunąć — bez martwego kodu).

### Serwer

- `/api/checkout` czyta `body.carryIn === true` (wszystko inne = brak).
- Pozycje i rabaty liczone jak przed PR #185 (`priceCheckoutItem` bez
  wniesienia; filtr kluczy zostaje: opcje produktu, kompletność na
  przefiltrowanych wartościach). Klucz z wersji „za sztukę" jest teraz
  obcym kluczem → odpada, nic nie dolicza.
- Po rabatach: gdy `carryIn`, `orderItems.push(carryInOrderLine())` i
  `total += CARRY_IN_PRICE` — przed przeliczeniem na EUR i przed P24/COD.
  Pozycja NIE wchodzi do `computedItems` (rabaty) ani do `body.items`.

### Inne miejsca

- Zakup (GA/Meta, `checkout/success/page.tsx`): lista pozycji bez
  `isCarryInLine`, wartość nadal `order.total`.
- „Zamów ponownie": `isCarryInLine` → pomiń bez liczenia do „niedostępnych";
  cena pozycji = `getVariantEffectivePrice` (poprawka z końcowej recenzji
  zostaje), bez dopłaty wniesienia.
- `/dostawa` PL/DE: „zaznacz w podsumowaniu zamówienia" + „250 zł za
  zamówienie" (PL z `CARRY_IN_PRICE`).

### Testy

- Jednostkowe: `carryInOrderLine`, `isCarryInLine`, `migrateLegacyCarryIn`
  (cena −250, klucz znika, pusty słownik → undefined, inne opcje zostają,
  flaga); reducer: `SET_CARRY_IN`, `HYDRATE` z `carryIn`, `CLEAR` zeruje;
  `priceCheckoutItem` — stary klucz wniesienia odpada i nie dolicza;
  `groupCartBundles` — rabat od pełnej ceny pozycji (powrót).
- Funkcja czysta dla serwera, jeśli route ma logikę ponad push/+= (np.
  `applyCarryIn(orderItems, total, requested)`), z testem.
- E2E (lokalny build, bez składania zamówienia): na stronie produktu brak
  pola wniesienia; na `/checkout` sekcja między adresem a płatnością,
  zaznaczenie → wiersz „Wniesienie mebli" i suma +250 zł; odświeżenie
  strony → pole nadal zaznaczone.

### Poza zakresem

- Wniesienie przełączane w `/koszyk` (tylko checkout).
- Różna cena zależnie od liczby mebli / piętra.
- Opis usługi w Regulaminie (decyzja właściciela/prawnika — bez zmian).
