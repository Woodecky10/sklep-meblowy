# Płatności: migracja Stripe → bezpośredni Przelewy24/PayPro (design)

**Data:** 2026-06-29
**Status:** zatwierdzony design (przed planem implementacji)
**Autor decyzji biznesowej:** właścicielka / Mikołaj

## Kontekst i decyzja

Sklep płaci dziś przez **Stripe Checkout** (`payment_method_types: card, blik, p24` dla PL;
`card, p24` dla DE — Przelewy24 i BLIK są tu *metodami* udostępnianymi przez Stripe, a
operatorem płatności w sensie prawnym jest Stripe). Decyzja biznesowa: przejść na
**bezpośrednią integrację z Przelewy24/PayPro** i zrezygnować ze Stripe.

Motywacja: niższe prowizje (P24 ~1% na przelewach/BLIK vs Stripe ~1,4%).

### Świadomie przyjęte ryzyka (odnotowane podczas brainstormu)

- **Ekonomia graniczna.** Przy wolumenie ~20–100 zam./mc opłacanych online i wysokim
  AOV mebli, optymistyczna oszczędność to rząd ~6,5 tys. zł/rok; rebuild płatności +
  utrzymanie to wielodniowy projekt o zwrocie liczonym w latach. Właściciel zaakceptował.
- **Rynek EUR `/de`.** P24 jest PLN-centryczny; EUR obsługuje realnie tylko dla **kart**
  (multicurrency). Decyzja: `/de` zostaje na EUR, ale tylko płatność kartą przez P24.
- **Brak konta PayPro.** Na dziś nie ma podpisanej umowy. Budowa i testy idą na otwartym
  **sandboxie P24** (`sandbox.przelewy24.pl`, darmowa rejestracja); **produkcja zablokowana**
  do czasu: umowa PayPro + KYC + włączenie EUR + klucze produkcyjne.

## Zasada przewodnia

Zastępujemy **tylko warstwę bramki**. Cała sprawdzona logika zamówień zostaje nietknięta:
`createOrder`, `markOrderPaid` (atomowy CAS `pending→paid`), `incrementPromoUsage`,
serwerowe wyliczanie cen, walidacje koszyka/adresu/e-maila, model statusów, maile,
infrastruktura EUR (`getEurRate`, `convertToEur`, gałąź `isDe`).

Kluczowa różnica modelu: P24 **wymaga aktywnej weryfikacji** płatności (Stripe sam zgłasza
„paid"; w P24 robimy krok `transaction/verify` i dopiero on jest bramką do `paid`).

## Architektura i przepływ

```
1. POST /api/checkout   (bez zmian: walidacja, ceny serwerowe, createOrder → status=pending)
        │  zamiast sesji Stripe:
        ▼
2. p24.registerTransaction()   (REST, sign = SHA-384)
        → zwraca token  →  302 redirect na secure.przelewy24.pl/trnRequest/{token}
        ▼
3. Klient płaci na hostowanej stronie P24
        ▼
4. P24 → POST /api/p24/status   (notyfikacja async — odpowiednik webhooka Stripe)
        a) weryfikacja podpisu notyfikacji (CRC); niezgodny → 400
        b) p24.verifyTransaction()  (serwer-do-serwera, asercja oczekiwanej kwoty/waluty)
        c) markOrderPaid (CAS pending→paid) + incrementPromoUsage   ← logika bez zmian
        ▼
5. Klient wraca na /checkout/success (urlReturn) — SAM POWRÓT; status NIE pochodzi stąd
```

`sessionId` w P24 = nasze `order.id` (UUID, globalnie unikalny). Każda próba płatności tworzy
nowe pending-zamówienie (jak dziś przy Stripe), więc `sessionId` nigdy się nie powtórzy.
`orderId` (numeryczny id transakcji P24) wraca w notyfikacji i służy do zwrotów.

## Komponenty i pliki

### Nowe
- **`app/_lib/p24.ts`** — klient P24: `registerTransaction()`, `verifyTransaction()`,
  `refundTransaction()` + helpery podpisu CRC (SHA-384). Lazy-init kluczy z env (wzorzec jak
  `stripe.ts`). `P24_BASE_URL` przełącza sandbox/produkcję.
- **`app/api/p24/status/route.ts`** — endpoint notyfikacji P24. Weryfikacja podpisu →
  `verify` → `markOrderPaid`. Przenosi 1:1 sprawdzoną logikę dedup/CAS/promo z obecnego
  `api/webhook/route.ts`.

### Modyfikowane
- **`app/api/checkout/route.ts`** — `stripe.checkout.sessions.create` → `registerTransaction()`;
  zwraca redirect na token P24. Reszta route (walidacje, ceny, `createOrder`) bez zmian.
  Rabat: rejestrujemy po prostu niższą kwotę transakcji (znika koncept dynamicznego kuponu Stripe).
- **`app/_lib/orders.ts`** — `markOrderPaid(orderId, paymentRef)`: sygnatura ta sama, w UPDATE
  zmienia się nazwa kolumny + zapis `payment_provider='p24'`.
- **`app/_lib/types.ts`** — `stripe_payment_intent` → `payment_ref` (typ `Order` i insert-type);
  dodać `payment_provider: 'stripe' | 'p24' | null`.
- **`app/admin/zamowienia/[id]/page.tsx`** — etykieta „Referencja P24 (do zwrotów)"; pokazuje
  `payment_provider`, żeby admin wiedział, w której bramce robić zwrot w oknie przejściowym.
- **`app/(legal)/regulamin/page.tsx`** — **przywrócić klauzulę #12** (teraz prawdziwa:
  PayPro jako operator) — z commita `336d036`.
- **`app/_components/layout/Footer.tsx`** + **`app/_lib/dictionaries/{pl,de}.ts`** +
  **`public/payments/*.svg`** — **przywrócić pasek logotypów #13** z commita `600131c`
  (docelowo oficjalne logo Przelewy24 zamiast placeholderów).
- **env** — `STRIPE_*` → `P24_*`: `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`,
  `P24_BASE_URL`.

### Usuwane
- `app/_lib/stripe.ts`, `app/api/webhook/route.ts`, `app/_lib/stripe-events.ts`
  (+ `__tests__/stripe-events.test.ts`), zależność `stripe` z `package.json`.

## Model danych — migracja `39_p24_payment_ref`

```sql
ALTER TABLE orders RENAME COLUMN stripe_payment_intent TO payment_ref;          -- uogólnienie referencji
ALTER TABLE orders ADD COLUMN payment_provider text;                            -- 'stripe' | 'p24'
UPDATE orders SET payment_provider = 'stripe' WHERE payment_ref IS NOT NULL;     -- istniejące opłacone = Stripe
-- nowe zamówienia zapisują payment_provider = 'p24'
```

- `payment_ref` (`text`, nullable) trzyma numeryczny `orderId` P24 (dla nowych) lub
  `stripe_payment_intent` (dla starych — rename zachowuje dane).
- `payment_provider` rozstrzyga, w której bramce robić zwrot — kluczowe w oknie przejściowym,
  gdy w bazie współistnieją zamówienia z obu systemów.
- Brak utraty danych. Migracja musi pójść **w lockstep z deployem kodu** (jeden prod Supabase,
  Vercel auto-deploy z `main`) — patrz Cutover.

## Bezpieczeństwo, podpisy, idempotencja

### Podpisy CRC (SHA-384) — trzy miejsca
- **`register`**: sign z `{sessionId, merchantId, amount, currency, crc}`.
- **notyfikacja przychodząca**: weryfikujemy sign z pól notyfikacji + `crc`; **niezgodny → 400,
  odrzucamy** (endpoint jest publiczny — każdy mógłby na niego POST-nąć).
- **`verify`**: sign z `{sessionId, orderId, amount, currency, crc}`.

Dokładne listy pól i kolejność wg aktualnej dokumentacji P24 REST API v1 — do potwierdzenia
na etapie implementacji (test na wektorach P24).

### `verify` jako jedyna bramka do `paid`
Nawet po poprawnym podpisie notyfikacji wykonujemy serwer-do-serwera `transaction/verify`
(Basic Auth: `P24_POS_ID` + `P24_API_KEY`), w którym **asercjujemy oczekiwaną kwotę i walutę
z naszego zamówienia**. Dopiero zgodne `verify` → `markOrderPaid`. Niezgodna kwota/waluta →
**NIE** oznaczamy paid, głośny log + `admin_note`, zamówienie zostaje pending.

### Idempotencja
P24 ponawia notyfikację aż otrzyma `200`. Przenosimy wzorzec z obecnego webhooka: guard
statusu (dedup duplikatów) + CAS `pending→paid` (tylko zwycięzca claimu inkrementuje promo).
Przejściowy błąd DB → `500` (P24 ponowi).

### Powrót klienta bez zaufania
`/checkout/success` (urlReturn) **nie** oznacza opłaty — pokazuje „płatność w toku" i czyta
status z `order.status`. Flip `pending→paid` robi wyłącznie notyfikacja + `verify`.

### Błędy
- `register` nieudany → komunikat wg języka (jak dziś 500-path), zamówienie pending.
- Notyfikacja dla **anulowanego** zamówienia → ten sam ślad „płatność po anulowaniu — wymaga
  ręcznej obsługi (zwrot/przywrócenie)", co obecny kod Stripe.

## EUR na `/de`

Infrastruktura EUR zostaje. W `register` dla `/de`:
- `currency: "EUR"` (P24 multicurrency — działa dla **kart**; BLIK/przelewy PL nie wejdą przy
  EUR, P24 sam pokaże klientowi tylko kartę),
- `language: "de"`, `country: "DE"`.

`/pl` bez zmian: `currency: "PLN"`, `language: "pl"`, pełen wachlarz metod.

Zero nowej logiki walutowej — tylko zmapowanie istniejących `isDe`/`rate`/kwoty (w eurocentach,
`×100`) na pola `register`.

**Zależność operacyjna (nie kod):** konto PayPro musi mieć włączone rozliczenia EUR. Do
potwierdzenia z PayPro: rozliczenie EUR-kart na konto EUR vs przewalutowanie na PLN (wpływ na
księgowość, nie na implementację).

## Refundy — model ręczny (YAGNI, jak dziś)

Bez zmiany zakresu: admin czyta `payment_ref` + `payment_provider` i robi zwrot w panelu
właściwej bramki (P24 dla nowych, Stripe dla starych w oknie przejściowym). `p24.ts` dostaje
gotową `refundTransaction()` pod przyszły przycisk in-app, ale UI zwrotu **nie** budujemy teraz.

## Testy (TDD — testy przed kodem)

- **Jednostkowe (czysta logika):** liczenie podpisu CRC SHA-384 (wektory testowe P24),
  kontrola zgodności kwoty/waluty w `verify`, guard dedup/CAS (port
  `stripe-events.test.ts` → `p24-events.test.ts`).
- **E2E w sandbox P24:** karta PL, karta EUR `/de`, przelew, BLIK; płatność nieudana (zostaje
  pending); duplikat notyfikacji (idempotentnie); podrobiony podpis (odrzucony 400).
- Utrzymać zielony zestaw (dziś 229 testów).

## Cutover (lockstep)

1. Cała praca na branchu, pełne testy w sandbox.
2. *Równolegle, właścicielka:* umowa PayPro + KYC + włączenie EUR + klucze produkcyjne.
3. Wdrożenie w oknie niskiego ruchu: merge → migracja `39` → deploy P24; ustawić `P24_*` w
   Vercel; w panelu P24 ustawić `urlStatus = /api/p24/status` i `urlReturn`.
4. **Okno zwrotów Stripe:** nie zamykać konta Stripe, dopóki nie minie termin
   zwrotów/reklamacji ostatniego zamówienia opłaconego Stripe (~do 30 dni). Pending-zamówienia
   Stripe w locie, które nigdy nie zapłaciły, zostają pending (nieszkodliwe).
5. **Rollback:** revert deployu + odwrócenie migracji (rename z powrotem, drop
   `payment_provider`) — w pełni odwracalne.

## Poza zakresem (YAGNI)

- Przycisk zwrotu in-app (zostaje ręczny w panelu P24).
- Utrzymywanie obu bramek równolegle (odrzucony wariant hybrydowy).
- Zmiany w modelu statusów zamówienia, mailach, cenach, promocjach.
