# Edycja zamówienia w panelu admina

Projekt z 2026-10-06. Prośba właściciela: admin ma móc edytować zamówienie —
„daj to, co jest możliwe do edycji, żeby móc zmienić". W szczególności: dane
klienta i adres, pozycje (ilość, cena, dodaj/usuń), warianty pozycji, cena;
także e-mail, gdy pracownica wpisze go źle przy zamówieniu ręcznym.

## Stan wyjściowy — odczytany z kodu

- Karta zamówienia `app/admin/zamowienia/[id]/page.tsx` pozwala dziś zmienić
  tylko: status (`updateOrderStatus`), dostawę — przewoźnik, numer
  przesyłki, koszt dostawy, „dostawa opłacona" (`updateOrderFulfillment`),
  notatkę admina (`updateOrderNote`), oraz usunąć zamówienie (`deleteOrder`).
  Akcje w `app/admin/zamowienia/actions.ts`, kontrolki w `OrderControls.tsx`,
  mail do klienta ręcznie w `CustomerMailCard.tsx`.
- Dane klienta siedzą w `orders.shipping_address` (`Address`: `street`,
  `city`, `postal_code`, `country`, opcjonalnie `fullname`, `phone`).
  E-mail: `orders.guest_email` (gość, w tym każde zamówienie wpisane ręcznie)
  albo e-mail profilu przy `user_id` (`customerEmailOf` w
  `app/_lib/mail/notify-order.ts` bierze najpierw `guest_email`).
- Pozycje: `order_items` (`product_id` nullable + `custom_name` NOT NULL
  default '' od migracji 82; `quantity`, `price` w walucie zamówienia,
  `variant_values` jsonb, `notes`, `bundle_id`, `bundle_label`).
  Wiersze do wstawienia normalizuje `toOrderItemRows`
  (`app/_lib/order-items.ts`) — postgrest-js przy insercie tablicy wysyła NULL
  za brakujące klucze (pułapka z PR #187).
- `orders.total` = Σ cena × ilość − `bundle_discount` − `promo_discount`
  (dostawa osobno, `delivery_cost`, poza sumą). Waluta `pln`/`eur`
  (`fx_rate` dla starych zamówień z `/de`).
- Formularz „Dodaj zamówienie" (`app/admin/zamowienia/nowe/ExternalOrderForm.tsx`)
  ma: wyszukiwarkę produktów (`filterBySearch`), pozycje z katalogu i spoza
  katalogu, cenę, ilość, uwagi; bez wariantów. Walidacja w czystym
  `parseExternalOrderInput` (`app/_lib/external-order.ts`, limity
  `MAX_ITEMS = 50`, `NOTES_MAX_LENGTH = 500`, `CUSTOM_NAME_MAX_LENGTH = 200`,
  `parsePrice`).
- Guard niezapisanych zmian (`app/admin/UnsavedChangesGuard.tsx`) działa sam
  dla każdego `<form>` w panelu.
- Mail potwierdzenia `OrderConfirmation` (szablon z pozycjami, rabatami
  i sumą, PL/DE przez `COPY`), wysyłka `notifyOrderPlaced` (klient + admin).
- Wniesienie mebli to pozycja spoza katalogu `CARRY_IN_LINE_NAME`
  („Wniesienie mebli do 4. piętra"), 250 zł (`CARRY_IN_PRICE`,
  `carryInOrderLine()` w `app/_lib/carry-in.ts`).

## Rozstrzygnięcia z właścicielem (2026-10-06)

1. Edytowalne: dane klienta i adres, e-mail (patrz 2), pozycje — dodaj
   (z katalogu, spoza katalogu, wniesienie), usuń, ilość, cena, warianty,
   uwagi — oraz kwoty rabatów.
2. E-mail zmienia się w zamówieniu gościa (`guest_email`) — także w każdym
   wpisanym ręcznie. W zamówieniu klienta z kontem e-mail należy do konta:
   tylko do odczytu.
3. **Cena = cena pozycji; suma liczy się sama** (Σ − rabaty). Bez ręcznie
   wpisywanej sumy.
4. **Bez blokad**: edycja działa w każdym statusie i przy zamówieniu
   opłaconym online. Przy opłaconym online ostrzeżenie, że zmiana sumy nie
   zmienia kwoty pobranej przez Przelewy24 (dopłata/zwrot ręcznie). Kwoty
   zapłaconej sklep nie zapamiętuje (bez migracji).
5. Mail do klienta **do wyboru przy zapisie** (pole domyślnie odznaczone).
6. Podejście A: osobna strona edycji, zapis seria operacji, **bez migracji**.
7. Ślad edycji: linijka dopisywana do notatki admina.

## Sekcja 1 — Co widzi admin

- Na karcie zamówienia przycisk „Edytuj zamówienie" → nowa strona
  `/admin/zamowienia/[id]/edytuj` (każde zamówienie, każdy status).
- **Klient:** imię i nazwisko (`shipping_address.fullname`), telefon
  (`shipping_address.phone`), e-mail (zasada z rozstrzygnięcia 2; przy
  koncie: wartość z profilu, tylko odczyt, dopisek „e-mail konta klienta").
- **Adres dostawy:** ulica, kod, miasto, kraj.
- **Pozycje** — tabela wzorem „Dodaj zamówienie" (wspólny edytor pozycji
  wydzielony z `ExternalOrderForm`, oba formularze z niego korzystają):
  - wyszukiwarka mebli z katalogu, „Dodaj pozycję spoza katalogu",
    „Dodaj wniesienie (+250 zł)" (wstawia `CARRY_IN_LINE_NAME` za
    `CARRY_IN_PRICE`; nieaktywny, gdy wniesienie już jest);
  - w wierszu z katalogu: **warianty** — lista wyboru dla każdej opcji
    produktu (`product.variants.options`, wartości z `option.values`),
    wartości bieżące wstępnie wybrane; wartość spoza aktualnych opcji
    (np. tkanina usunięta z katalogu) zostaje i jest pokazana jako wybrana;
  - **cena** z podpowiedzią „cennik: X zł" (cena efektywna produktu +
    dopłaty wybranych wariantów) i przyciskiem „wstaw z cennika"; zmiana
    wariantu NIE zmienia ceny sama; podpowiedź tylko przy zamówieniach w PLN;
  - ilość, uwagi, „Usuń"; pozycja z zestawu ma widoczny znacznik zestawu.
- **Rabaty:** kwota rabatu zestawu i kwota rabatu z kodu (pola liczbowe).
- **Podsumowanie:** suma pozycji − rabaty = nowa suma, obok „było X".
  Przy `payment_method = online` i statusie innym niż `pending` (czyli po
  potwierdzeniu płatności przez P24):
  ostrzeżenie „Przelewy24 pobrały X — zmiana sumy nie zmienia pobranej
  kwoty; dopłatę lub zwrot rozlicz ręcznie" (X = suma z chwili otwarcia
  edycji; przy kolejnych edycjach to suma po poprzedniej edycji — sklep nie
  pamięta kwoty pobranej, rozstrzygnięcie 4).
- Pole „Powiadom klienta mailem o zmianach" (domyślnie odznaczone),
  „Zapisz" / „Anuluj". Guard niezapisanych zmian działa sam (`<form>`).
- Po zapisie: powrót na kartę zamówienia z komunikatem, w notatce linijka
  śladu.

## Sekcja 2 — Zapis

Czyste moduły (bez Supabase) w `app/_lib/order-edit.ts`:

- `parseOrderEditInput(raw)` — walidacja jak `parseExternalOrderInput`
  (te same limity i `parsePrice`): 1–50 pozycji, ilość całkowita 1–99, cena
  ≥ 0, uwagi ≤ 500, nazwa spoza katalogu 1–200 znaków, pozycja ma ALBO
  `product_id` ALBO `custom_name`, adres (ulica, kod, miasto) wymagany,
  e-mail poprawny gdy edytowalny, rabaty ≥ 0. Komunikaty po polsku.
- `planOrderEdit(current, edited)` — pozycje mają `id` (istniejące) albo nie
  (nowe) → `{ inserts, updates, deletes }`; `updates` tylko dla wierszy, które
  faktycznie się zmieniły (ilość, cena, warianty, uwagi, nazwa spoza
  katalogu); `bundle_id`/`bundle_label` istniejących wierszy bez zmian.
- `orderEditTotal(items, bundleDiscount, promoDiscount)` —
  `max(0, round2(Σ cena × ilość − rabaty))`.
- `orderEditNoteLine(date, oldTotal, newTotal, currency)` — np.
  `06.10.2026 14:22 — edycja zamówienia: suma 2900,00 zł → 3150,00 zł`
  (czas w strefie Europe/Warsaw).
- `orderEditFingerprint(order, items)` — skrót stanu z chwili otwarcia:
  posortowane `id:quantity:price` pozycji + `total`; formularz go niesie.

Akcja `updateOrder(formData)` w `app/admin/zamowienia/actions.ts`:

1. `requireAdmin()`, `parseOrderEditInput`.
2. Odczyt zamówienia i pozycji (admin client); gdy
   `orderEditFingerprint` ≠ ten z formularza → błąd „Zamówienie zmieniło się
   w międzyczasie — odśwież stronę i wprowadź zmiany ponownie" (nic nie
   zapisujemy).
3. `planOrderEdit` → kolejno: insert nowych (przez `toOrderItemRows`),
   update zmienionych (po `id` + `order_id`), delete usuniętych (po `id` +
   `order_id`). Błąd w trakcie → przerwij i zwróć błąd; to, co już weszło,
   zostaje (rozstrzygnięcie 6) — patrz krok 4 przy błędzie.
4. Odczyt pozycji z bazy → `orderEditTotal` → update `orders`
   (`shipping_address`, `guest_email` gdy gość, `bundle_discount`,
   `promo_discount`, `total`, `admin_note` = dotychczasowa + `\n` + linijka
   śladu). Ten krok wykonuje się także po błędzie z kroku 3, żeby suma
   zawsze odpowiadała pozycjom w bazie; wtedy linijka śladu kończy się
   „(zapis przerwany — sprawdź pozycje)".
5. Gdy zaznaczono mail i zapis się udał: `after(() => notifyOrderUpdated(id))`.
6. `revalidatePath` karty admina, listy zamówień, `/konto/zamowienia/[id]`.

Status zamówienia, `delivery_*`, `promo_code_id`, `payment_*` — bez zmian.

## Sekcja 3 — Mail o zmianach

- `notifyOrderUpdated(orderId)` w `app/_lib/mail/notify-order.ts`: tylko do
  klienta (`customerEmailOf`), nie do admina; błędy logowane, nigdy rzucane.
- Szablon `OrderConfirmation` dostaje prop `kind: "placed" | "updated"`
  (domyślnie `"placed"`); `"updated"`: podgląd/nagłówek/tytuł
  „Zaktualizowaliśmy Twoje zamówienie #N" (DE: „Wir haben Ihre Bestellung #N
  aktualisiert"); reszta szablonu bez zmian.

## Testy

- `app/_lib/__tests__/order-edit.test.ts`: walidacja (każdy limit, ALBO
  produkt ALBO nazwa, e-mail przy koncie ignorowany), plan (nowe/zmienione/
  usunięte/niezmienione, warianty, uwagi), suma (rabaty, zaokrąglenie,
  minimum 0), linijka śladu (format, strefa), fingerprint (kolejność pozycji
  bez znaczenia, zmiana ceny zmienia skrót).
- Test szablonu maila: `kind: "updated"` daje nowy nagłówek PL i DE.
- E2E: brak (formularz zapisuje do żywej bazy). Weryfikacja na żywo za zgodą
  właściciela: testowe zamówienie przez „Dodaj zamówienie" (jednorazowy
  e-mail), edycja (e-mail, wariant, cena, dodanie wniesienia, mail
  zaznaczony), sprawdzenie bazy i karty, usunięcie zamówienia.

## Poza zakresem (świadomie)

- Zapamiętywanie kwoty pobranej przez Przelewy24 i automatyczne
  dopłaty/zwroty.
- Zmiana e-maila konta klienta.
- Historia zmian jako osobna tabela (wystarcza linijka w notatce).
- Zmiana statusu, metody płatności, kodu rabatowego (jako kodu) w edycji.
- Atomowy zapis (funkcja w bazie) — wymagałby migracji.
