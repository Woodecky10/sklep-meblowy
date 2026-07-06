# Płatność za pobraniem (COD) — design

Data: 2026-07-06

## Cel

Klient może złożyć zamówienie z płatnością przy odbiorze (kurierowi), zamiast
płatności online przez Stripe. Wariant A z brainstormu: wybór metody płatności
w istniejącym formularzu checkout + rozgałęzienie w `/api/checkout`.

## Decyzje (ustalone z Mikołajem)

- **Zasięg: PL i DE** — pobranie dostępne też na `/de` (niem. „Nachnahme"),
  kwoty w EUR wg istniejącego kursu.
- **Bez limitu kwoty i bez opłaty za pobranie.**
- **Telefon obowiązkowy przy pobraniu** (przy płatności online bez zmian —
  opcjonalny). Kurier wymaga kontaktu; naturalna bariera przed fałszywymi
  zamówieniami. Innych barier świadomie nie budujemy.

## Model danych — migracja 45

```sql
alter table public.orders
  add column payment_method text not null default 'online'
    check (payment_method in ('online','cod'));
```

Metoda płatności jest ortogonalna do statusu realizacji — kolumna, nie nowy
status. Istniejące zamówienia dostają `'online'` (historycznie poprawne).

**Cykl życia zamówienia COD:** tworzone od razu ze statusem **`processing`**
(przyjęte do realizacji — nie ma etapu płatności). Dzięki temu:
- nie miesza się z porzuconymi `pending` (porzucone checkouty Stripe),
- jest natychmiast widoczne w panelu admina jako „do zrobienia",
- `markOrderPaid` (webhook Stripe) pozostaje nietknięty — nigdy nie dotyczy COD.

Dalej normalnie: `processing → shipped → delivered` (admin). Anulowanie przez
klienta: bez zmian (dziś klient może anulować tylko `pending` — COD od razu
jest `processing`, więc anuluje tylko admin; świadome).

## API — `/api/checkout` (jeden endpoint, rozgałęzienie)

`CheckoutBody` dostaje `paymentMethod?: "online" | "cod"` (brak = `"online"`,
kompatybilnie wstecz).

Wspólne (bez zmian): walidacja items/email/adresu, ceny serwerowe + dopłaty
wariantów, walidacja promo, przeliczenie EUR dla `/de`.

Dodatkowa walidacja dla `cod`: `address.phone` wymagany — po odfiltrowaniu
znaków innych niż cyfry musi mieć 7–15 cyfr (format międzynarodowy luźno);
błąd 400 z komunikatem PL/DE.

Rozgałęzienie po `createOrder`:
- **online**: jak dziś — kupon Stripe, sesja Stripe, `{ url: session.url }`.
- **cod**: zero wywołań Stripe (bez sesji i bez kuponu). `createOrder`
  z `payment_method: 'cod'` i statusem `processing`. Po utworzeniu:
  `incrementPromoUsage(promoCodeId)` (best-effort, jak w webhooku — COD nie
  ma webhooka, więc licznik rośnie przy złożeniu; anulowanie nie cofa,
  used_count to miękka statystyka — tak samo jak dziś przy Stripe).
  Odpowiedź: `{ url: `${origin}${localePrefix}/checkout/success?order_id=<uuid>` }`
  — klient przekierowuje się identycznie jak przy Stripe (ten sam kontrakt).

`createOrder` w `app/_lib/orders.ts` przyjmuje nowe pole
`paymentMethod: "online" | "cod"` i SAM wyprowadza status: `cod` →
`status: 'processing'`, `online` → bez zmian (default DB `pending`).
Caller nie przekazuje statusu — jedna reguła w jednym miejscu.

Kupon Stripe NIE jest tworzony przy COD (rabat i tak siedzi w
`orders.total`/`promo_discount` — Stripe nie uczestniczy).

## UI — `app/checkout/CheckoutForm.tsx`

- Nowa sekcja „Metoda płatności" (radio, nad przyciskiem submit):
  - „Płatność online — karta, BLIK, Przelewy24" (domyślna),
  - „Za pobraniem — zapłacisz kurierowi przy odbiorze" /
    DE: „Nachnahme — Zahlung bei Lieferung an den Kurier".
- Przy wyborze pobrania pole telefonu staje się wymagane (`required` +
  gwiazdka w labelu); walidacja klienta przed submit (7–15 cyfr), serwer
  i tak waliduje autorytatywnie.
- Submit wysyła `paymentMethod` w body. Tekst przycisku przy COD:
  „Złóż zamówienie" / „Bestellung aufgeben" (zamiast „Przejdź do płatności").
- Teksty inline `de ? … : …` — istniejący wzorzec tego komponentu.

## Strona potwierdzenia — `app/checkout/success/page.tsx`

Obsługa drugiego parametru: `?order_id=<uuid>` (obok istniejącego
`session_id`). Dla `order_id`:
- `getOrderById(order_id)`; szczegóły pokazujemy **tylko gdy**
  `payment_method === 'cod'` — strona nie może być wyrocznią do podglądania
  zamówień online po id (UUID jest niezgadywalny, ale zawężenie nic nie
  kosztuje). Email z `guest_email` lub pomijany dla zalogowanych.
- Treść wariantu COD: „Zamówienie przyjęte — zapłacisz kurierowi przy
  odbiorze. Kwota do zapłaty: X" / DE analogicznie („Nachnahme"). Bez
  obietnicy e-maila (sklep nie wysyła potwierdzeń).
- `ClearCart` działa jak dotąd (czyści koszyk w obu wariantach).

## Panel admina

- `app/_lib/types.ts`: `Order.payment_method: "online" | "cod"`.
- Lista zamówień (`app/admin/zamowienia/page.tsx`) i szczegóły
  (`[id]/page.tsx`): badge „Pobranie" przy zamówieniach COD (żółty/złoty
  akcent, obok statusu). Admin od razu widzi, że kurier ma pobrać gotówkę
  i że „processing" nie oznacza „opłacone".
- Filtry/przejścia statusów bez zmian.

## Testy / weryfikacja

- Unit (vitest): walidacja telefonu (helper `isValidCodPhone` w
  `app/_lib/`), logika wyboru statusu/metody w `createOrder` (jeśli
  wyniesiona do czystej funkcji).
- `npx tsc --noEmit` + pełna suita.
- Smoke dev: checkout COD end-to-end na PL i /de (zamówienie w DB ze
  statusem processing + payment_method cod, redirect na success z poprawną
  treścią, koszyk wyczyszczony); checkout online bez regresu (redirect do
  Stripe). Badge w adminie.
- ⚠️ Dev = baza PROD: zamówienia testowe usunąć po sobie.

## Poza zakresem

- E-maile potwierdzające (sklep ich nie wysyła — osobny temat).
- Limit kwoty pobrania / opłata (decyzja: bez — łatwe do dodania później
  w ustawieniach sklepu).
- Migracja Stripe → Przelewy24 (niezależna; COD jej nie blokuje ani nie
  wyprzedza).
- BaseLinker (wycofany).
