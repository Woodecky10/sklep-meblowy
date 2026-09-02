# Zamówienia zewnętrzne — dodawanie w panelu i mail „Dziękujemy"

Projekt z 2026-09-02. Zgłoszenie właściciela: zamówienia wpadają też z innych
sklepów (Allegro itp.) i mają być wpisywane ręcznie w panelu — dane klienta,
skąd przyszło zamówienie, produkt wybrany z naszego katalogu (przez
wyszukiwarkę) i **cena z tamtego sklepu**, bo różni się od naszej. Po ręcznej
zmianie statusu klient ma dostać mail „Dziękujemy za zamówienie – Mollien 🤍"
z nazwą źródła podstawioną w miejsce „[Allegro]".

## Stan wyjściowy — odczytany z kodu

- Wszystkie zamówienia leżą w jednej tabeli `orders` ze statusami
  `pending → paid → processing → shipped → delivered` i bocznym `cancelled`
  (`app/_lib/order-status.ts`, `canTransition` pilnuje ruchu tylko do przodu).
- Ręcznego dodawania zamówień w panelu **nie ma** — wiersze w `orders` tworzą
  wyłącznie `/api/checkout` (P24, pobranie).
- Maile do klienta po zmianie statusu idą tylko przy `shipped` i `cancelled`
  (`app/_lib/mail/status-notify.ts`, `NOTIFY_STATUSES`). `processing` celowo
  milczy: to status, którym admin „zabiera" zamówienie i gasi licznik nowych
  (`getNewOrdersCount` liczy `paid`/`processing` z `status_updated_at is null`).
- Wysyłka po zmianie statusu jest w `updateOrderStatus`
  (`app/admin/zamowienia/actions.ts`): CAS na statusie, potem `after()` →
  `notifyStatusChange(orderId, to, from)`. Mail nigdy nie blokuje akcji admina.
- Zamówienia gości mają `user_id = null` i `guest_email`; po rejestracji na ten
  e-mail `linkGuestOrders` podpina je do konta.
- `payment_method` ma CHECK `('online','cod')` i jest czytany w 9 plikach.
- Wyszukiwarka produktów w panelu istnieje w edytorze zestawów
  (`app/admin/zestawy/BundlesEditor.tsx`): lista aktywnych produktów pobrana raz
  na serwerze, filtrowanie w przeglądarce przez `filterBySearch`
  (`app/_lib/search-normalize.ts`) — odporne na literówki i brak polskich znaków.

## Rozstrzygnięcia z właścicielem (2026-09-02)

| pytanie | decyzja |
|---|---|
| kiedy wychodzi mail „Dziękujemy" | przy ręcznej zmianie statusu na **„W realizacji"** (`processing`) |
| skąd lista źródeł | **stała lista w kodzie**: Allegro, OLX, Empik, Facebook / Instagram, Telefon / e-mail, Inne; przy „Inne" **nazwa jest obowiązkowa** i to ona idzie do maila |
| wariant produktu | **wolny tekst** w notatce pozycji (bez opcji strukturalnych — ceny z opcji i tak nie pasują do cen zewnętrznych) |
| maile „Wysłane" i „Anulowane" | **tak, klient zewnętrzny dostaje oba**; mail o anulowaniu **nie obiecuje zwrotu** — zwrot idzie przez marketplace |
| model danych | **ta sama tabela `orders` + kolumna `source`** (podejście A); osobna tabela odrzucona — dublowałaby listę, kartę, statusy, licznik i wysyłkę |

Rozstrzygnięte przeze mnie, zaakceptowane bez uwag:

- wiele pozycji w jednym zamówieniu; suma = Σ cena × ilość; koszt dostawy jak
  dziś, osobno na karcie zamówienia;
- dane klienta: imię i nazwisko, e-mail (wymagany — bez niego nie ma maili),
  telefon, ulica, kod, miasto; kraj zawsze PL;
- po zapisie edytowalne tylko to, co dziś (status, dostawa, notatka admina);
  pomyłkę w pozycjach naprawia się „Usuń" + dodanie od nowa;
- „do 21 dni roboczych" i link „Odwiedź sklep Mollien" na sztywno w szablonie;
- zamówienia zewnętrzne **nie trafiają do GA4/Meta** (te liczą wyłącznie zakupy
  przez stronę, po stronie przeglądarki); przyszły raport sprzedaży z bazy ma po
  czym je odróżnić (`source is not null`);
- mail do właścicielki o nowym zamówieniu (`AdminNewOrder`) **nie** idzie —
  sama je wpisuje.

## Sekcja 1 — Dane i migracja

**Migracja 81** (`81_orders_source.sql`):

```sql
alter table public.orders
  add column if not exists source text
    check (source is null or (char_length(source) between 1 and 60));
-- Filtr „Zewnętrzne" na liście; sklepowe (null) nie wchodzą do indeksu.
create index if not exists idx_orders_source
  on public.orders (source) where source is not null;
```

`null` = zamówienie ze sklepu, więc istniejących wierszy nie ruszamy. Migrację
po merge aplikuję **ręcznie przez MCP** (auto-apply nie odpala — patrz pamięć).

Zamówienie zewnętrzne zapisywane jako wiersz `orders`:

| kolumna | wartość |
|---|---|
| `source` | etykieta z listy („Allegro") albo nazwa wpisana przy „Inne" — dokładnie ten tekst idzie do maila |
| `user_id` | `null` |
| `guest_email` | e-mail klienta, małymi literami, po `trim` |
| `shipping_address` | `{ fullname, phone, street, postal_code, city, country: "Polska" }` (`phone` pomijany, gdy pusty; „Polska" — tak zapisuje checkout sklepu i tak drukuje karta zamówienia) |
| `status` | `'paid'`, `status_updated_at = null` → wpada do licznika „nowe zamówienia" i gaśnie przy „W realizacji" jak zakup ze sklepu |
| `payment_method` | `'online'` (bez nowej wartości — rozróżnienie daje `source`, a CHECK i 9 plików zostają w spokoju) |
| `payment_provider`, `payment_ref` | `null` |
| `currency` / `fx_rate` | `'pln'` / `null` |
| `promo_code_id`, `promo_discount`, `bundle_discount` | `null`, `0`, `0` |
| `total` | Σ cena × ilość, zaokrąglone do grosza |

Pozycje w `order_items`: `product_id`, `quantity`, `price` (cena **zewnętrzna**
wpisana ręcznie), `notes` = tekst wariantu/uwag (może być `null`),
`variant_values = null`, `bundle_id`/`bundle_label` = `null`.

Typ `Order` w `app/_lib/types.ts` dostaje `source: string | null`.

## Sekcja 2 — Formularz „Dodaj zamówienie"

Nowa trasa `app/admin/zamowienia/nowe/page.tsx` (`requireAdmin`), link
„Dodaj zamówienie" obok szukajki na liście `/admin/zamowienia`. Strona pobiera
raz listę aktywnych produktów (`id, name, price, sale_price, images`) i renderuje
klientowy formularz `ExternalOrderForm.tsx` z trzema blokami:

1. **Źródło** — `<select>` z listy w nowym module `app/_lib/order-source.ts`
   (`ORDER_SOURCES`, `resolveOrderSource(selected, customName)`): przy „Inne"
   pojawia się wymagane pole „Nazwa źródła" (1–60 znaków). Moduł czysty,
   testowalny bez bazy.
2. **Klient** — imię i nazwisko*, e-mail*, telefon, ulica*, kod pocztowy*,
   miasto*.
3. **Pozycje** — pole „Szukaj produktu…" filtruje listę przez `filterBySearch`
   po nazwie; klik w wynik dodaje wiersz: nazwa, **cena** (wstępnie
   `sale_price ?? price`, do nadpisania), ilość (domyślnie 1), „Wariant /
   uwagi". Wiele wierszy, ten sam produkt może wystąpić dwa razy (np. dwa różne
   warianty). Usuwanie wiersza. Pod listą suma na żywo.

Zapis: server action `createExternalOrder(formData)` w istniejącym
`app/admin/zamowienia/actions.ts`:

- `requireAdmin()`;
- walidacja przez czystą funkcję `parseExternalOrderInput(raw)` (w
  `app/_lib/external-order.ts`, bez `server-only`, testowalna): źródło z listy
  albo „Inne" z nazwą; e-mail w sensownym formacie; pola adresu wymagane;
  ≥ 1 pozycja; cena to liczba ≥ 0 (przecinek dopuszczony), ilość to całkowita
  ≥ 1; notatka ≤ 500 znaków; zwraca `{ ok: true, value } | { ok: false, error }`
  z komunikatem po polsku;
- sprawdzenie, że wszystkie `product_id` istnieją w `products` (jedno zapytanie
  `in`); brakujący → błąd, nic nie zapisujemy;
- `insert orders … select("id, order_number")`, potem `insert order_items`;
  **jeśli pozycje się nie zapiszą, zamówienie jest kasowane** (`delete` po id),
  żeby nie został pusty wiersz z numerem;
- `revalidatePath("/admin/zamowienia")` i zwrot `{ ok: true, orderId }`;
  formularz przekierowuje na `/admin/zamowienia/<id>`.

Formularz **nie wysyła żadnego maila** — mail idzie dopiero przy zmianie statusu
(Sekcja 3). Zapis nie dotyka GA4/Meta ani `notifyOrderPlaced`.

## Sekcja 3 — Maile

`app/_lib/mail/status-notify.ts`:

```ts
shouldNotifyCustomer(status, source: string | null): boolean
// source === null  → ["shipped", "cancelled"]          (jak dotąd)
// source !== null  → ["processing", "shipped", "cancelled"]
wasOrderPaid(paymentMethod, previousStatus, source): boolean
// source !== null → false (zwrot idzie przez marketplace, mail o anulowaniu
//                          nie ma obiecywać pieniędzy od sklepu)
```

`notifyStatusChange` czyta `order.source` po `getOrderById` i dla
`processing` + źródło renderuje **nowy szablon**
`app/_lib/mail/templates/ExternalOrderAccepted.tsx` w istniejącym `MailLayout`
(logo i kolory z panelu „Wygląd", `getMailBranding`). Treść dokładnie ta od
właściciela, tylko PL (zewnętrzne są w PLN):

- temat: `Dziękujemy za zamówienie – Mollien 🤍`
- akapity jak w zgłoszeniu; wiersz `Źródło zamówienia: {order.source}`
- `MailButton` „Odwiedź sklep Mollien" → `NEXT_PUBLIC_APP_URL ?? "https://mollien.pl"`
- bez numeru zamówienia i bez listy pozycji — klient ma je w marketplace.

`shipped` i `cancelled` bez zmian w szablonach: przycisk „Zobacz zamówienie"
już dziś znika dla gości (`hasAccount = false`), a anulowanie po nowym
`wasOrderPaid` nie wspomina o zwrocie.

Wywołanie zostaje w `updateOrderStatus` przez `after()` po wygranym CAS-ie —
mail nigdy nie blokuje zmiany statusu. Jak dziś przy „Wysłane": jeśli Resend
padnie, status i tak się zmieni, a maila nie ma jak powtórzyć. Nie zmieniam
tego (świadomie, jak w `notifyOrderPlaced`: „nie zepsuj akcji" > „dostarcz
powiadomienie").

Komentarz w `NOTIFY_STATUSES` tłumaczący, dlaczego `processing` milczy,
trzeba uzupełnić: dla sklepowych nadal milczy, dla zewnętrznych to jedyny moment,
w którym klient dowiaduje się od nas, że zamówienie przyjęliśmy.

## Sekcja 4 — Lista, karta, etykiety

- **Lista** (`page.tsx`, `OrderRow.tsx`): plakietka ze źródłem obok numeru
  (np. „Allegro"); nowy filtr **„Zewnętrzne"** obok filtrów statusu
  (`getAdminOrders({ external: true })` → `.not("source", "is", null)`).
  Szukajka bez zmian — numer, e-mail i nazwisko już siedzą w tych samych polach.
- **Karta** (`[id]/page.tsx`): wiersz „Źródło: Allegro" w nagłówku; etykieta
  kwoty „Zapłacono (Allegro)" zamiast „Zapłacono".
- **Etykieta statusu** `paid` dla zamówień ze źródłem: „Opłacone (zewn.)" na
  liście i karcie — żeby nie sugerowała wpłaty przez P24. Reszta etykiet bez
  zmian. Realizacja: `adminStatusLabel(status, source)` obok
  `ADMIN_STATUS_LABELS`, nie druga mapa.
- Widok klienta (`/konto/zamowienia`) bez zmian: zamówienie zewnętrzne pojawi
  się tam tylko, jeśli klient założy konto na ten e-mail (przez
  `linkGuestOrders`) — wtedy to poprawne i pożądane.

## Testy

Vitest (`environment: node`, bez bazy i bez Resenda):

- `order-source.test.ts` — `ORDER_SOURCES` ma 5 pozycji, „Inne" jest osobną
  stałą (`OTHER_SOURCE`), nie elementem listy — nie jest nazwą źródła i nie
  powinno trafić do maila jako etykieta; „Inne" bez nazwy → błąd; „Inne" z
  nazwą → nazwa po `trim`; pozycja z listy ignoruje wpisaną nazwę.
- `status-notify.test.ts` (rozszerzenie) — `shouldNotifyCustomer("processing",
  null) === false`, `("processing", "Allegro") === true`; `wasOrderPaid(…,
  "Allegro") === false` niezależnie od metody i poprzedniego statusu.
- `external-order.test.ts` — `parseExternalOrderInput`: brak pozycji, zły
  e-mail, cena „1 299,50" → 1299.5, ilość „0" → błąd, suma Σ cena × ilość
  z zaokrągleniem do grosza, notatka ucinana do 500 znaków.
- `external-order-accepted.test.ts` — render szablonu zawiera źródło, frazę
  „do 21 dni roboczych" i link do sklepu; temat zgodny ze zgłoszeniem.

Playwright na buildzie (`npm run build && npm start`), **bez zapisu** — baza
jest wspólna z produkcją: wejście na `/admin/zamowienia/nowe` z sesją admina
(`e2e/.auth/admin.json`), wpisanie fragmentu nazwy produktu, sprawdzenie, że
lista wyników się zawęża i że po kliku pojawia się wiersz z ceną; zrzut ekranu.
Przycisk „Zapisz" w teście **nie jest klikany**.

## Poza zakresem (świadomie)

- edycja pozycji/ceny po zapisie;
- ponowna wysyłka maila „Dziękujemy" przyciskiem;
- import zamówień z API Allegro/OLX;
- wersja DE maila;
- lista źródeł edytowalna w panelu;
- raport sprzedaży z bazy (osobny pomysł właściciela, ma tylko zyskać kolumnę
  do odróżnienia).
