# Rozpoznanie: Faktury (KSeF) + Wysyłka — pytania do właścicielki

**Data:** 2026-06-18
**Kontekst:** Podprojekty 3 (faktury/VAT) i 4 (wysyłka) z planu rezygnacji z BaseLinkera.
Przed napisaniem spec/planu trzeba poznać obieg biznesowy. Poniżej pytania do właścicielki
+ notatki techniczne dla dewelopera. **Odpowiedzi wpisuj pod każdym pytaniem.**

---

## CZĘŚĆ 1 — FAKTURY / VAT (podprojekt 3)

### ⚠️ Kluczowy fakt: obowiązkowy KSeF
- **Od 1 kwietnia 2026** KSeF obowiązkowy dla „pozostałych przedsiębiorców" (wystawianie + odbiór).
- Wyjątek do 2027 tylko dla najmniejszych firm: faktury **do 450 zł** i sprzedaż **do 10 tys. zł/mies.**
  Sklep meblowy to przekracza (jeden mebel > 450 zł) → **wyjątek nie obejmuje Mollien**.
- Dziś jest czerwiec 2026 → obowiązek **prawdopodobnie już działa**. **Potwierdzić z księgową przed kodem.**
- Środowisko produkcyjne KSeF: `https://api.ksef.mf.gov.pl`, obowiązujący schemat faktury: **FA(3)**.

### Dwie drogi techniczne
- **Droga A (REKOMENDOWANA):** sklep zbiera dane → wysyła do API programu fakturowego
  (Fakturownia / wFirma / inFakt / Comarch / Symfonia), a program robi KSeF + FA(3) + numerację + PDF + UPO.
  → mało kodu, zgodność po stronie dostawcy, spójne z tym, czego używa księgowa.
- **Droga B:** bezpośrednia integracja sklepu z KSeF 2.0 (XML FA(3), token/certyfikat, sesje, UPO, środowiska).
  → tygodnie pracy + stałe utrzymanie, strefa regulowana. Niezalecane dla tego sklepu.

### Pytania do właścicielki
1. Czy teraz w ogóle wystawiacie faktury? Jeśli tak — w czym?
   > ODPOWIEDŹ:

2. Każde zamówienie ma fakturę, czy tylko na życzenie klienta? (paragon vs faktura na żądanie)
   > ODPOWIEDŹ:

3. Czy klient firmowy podaje NIP / dane do faktury przy zamówieniu? Czy jest dziś gdzie to wpisać?
   > ODPOWIEDŹ:

4. Sklep ma tworzyć gotową fakturę (PDF + numer), czy tylko zebrać dane, a faktura wystawiana w programie księgowym?
   > ODPOWIEDŹ:

5. Numeracja faktur — macie już format (np. „FV/2026/001")? Wspólna ze sprzedażą poza sklepem, czy osobna?
   > ODPOWIEDŹ:

6. Stawka VAT na meble — 23%? Wyjątki?
   > ODPOWIEDŹ:

7. Faktury korygujące / przy zwrocie pieniędzy — potrzebne, czy na razie pomijamy?
   > ODPOWIEDŹ:

8. Gdzie faktura ma trafić do klienta? (mail? pobranie z konta na stronie? tylko admin?)
   > ODPOWIEDŹ:

### Pytania rozstrzygające drogę KSeF (najważniejsze)
9. Czy macie biuro rachunkowe / księgową i z jakiego programu korzystają? (Fakturownia, wFirma, inFakt, Comarch, Symfonia…)
   > ODPOWIEDŹ:

10. Firma jest już zarejestrowana w KSeF (token / certyfikat / dostęp), czy trzeba dopiero załatwić?
    > ODPOWIEDŹ:

11. Sklep ma wysyłać faktury do KSeF przez ten program, czy bezpośrednio sam? (rekomendacja: przez program)
    > ODPOWIEDŹ:

---

## CZĘŚĆ 2 — WYSYŁKA / TRANSPORT (podprojekt 4)

### ⚠️ Kluczowy fakt: brak kuriera, transport firmą transportową
Właścicielka (2026-06-18): **żadna firma kurierska nie przewozi gabarytów**, więc transport realizuje
**firma transportowa**. To oznacza:
- **NIE budujemy** integracji z API kuriera (brak standardowego API, listów przewozowych, nr śledzenia).
- Podprojekt 4 staje się **mniejszy**: solidny **ręczny moduł zarządzania dostawą** + dane od klienta + status dla klienta.
- W panelu już jest ręczne pole przewoźnik + nr śledzenia oraz `delivery_cost` / `delivery_paid` — to baza do rozbudowy.

### Co realnie możemy zrobić (zakres do potwierdzenia)
- **Strukturalne dane dostawy w panelu:** nazwa firmy transportowej, planowany termin/okno dostawy, koszt, status, kontakt kierowcy/firmy.
- **Status widoczny dla klienta** w `/konto/zamowienia` (np. „dostawa zaplanowana / w transporcie / dostarczone").
  Bez maili (brak infrastruktury mailowej) — status tylko na stronie.
- **Dane dostawy zbierane od klienta** (ważne przy meblach): piętro, winda, czy potrzebne wniesienie/montaż, telefon kontaktowy, ograniczenia dojazdu.
- **Koszt transportu** — ręczna wycena / wg regionu / stały (`delivery_cost` ustalany osobno, nie przez Stripe — chyba że pyt. 6 niżej zmieni).
- **Opcjonalnie:** lista firm transportowych do wyboru (zamiast wolnego tekstu) dla spójności.

### Pytania do właścicielki
1. Zawsze ta sama firma transportowa, czy różne zależnie od regionu/zamówienia?
   > ODPOWIEDŹ:

2. Firma transportowa daje jakiś nr/link do śledzenia, czy termin ustalacie tylko telefonicznie?
   > ODPOWIEDŹ:

3. Jak ustalany jest termin dostawy? (kontakt telefoniczny z klientem po zamówieniu?)
   > ODPOWIEDŹ:

4. Jakie dane od klienta są potrzebne do dostawy? (piętro, winda, wniesienie/montaż, telefon, dojazd)
   > ODPOWIEDŹ:

5. Jak liczony koszt transportu? (stały / wg regionu / indywidualna wycena pod zamówienie)
   > ODPOWIEDŹ:

6. Klient płaci za transport z góry na stronie (Stripe), czy osobno (przy dostawie / przelew)?
   > ODPOWIEDŹ:

7. Czy potrzebny status dostawy widoczny dla klienta na stronie, czy wystarczy obsługa po stronie admina?
   > ODPOWIEDŹ:

---

---

## STAN OBECNY KODU (rozpoznanie 2026-06-18, weryfikacja statyczna)

### Model danych `orders` — co JEST
- klient: `user_id` (nullable, gość), `guest_email`
- dostawa/adres: `shipping_address` jsonb `{street, city, postal_code, country, fullname?, phone?}`
- płatność: `total` (jedna kwota brutto), `stripe_payment_intent`
- status: `status` (enum: pending/paid/processing/shipped/delivered/cancelled), `order_number`, `status_updated_at`
- **dostawa (migr. 31):** `carrier`, `tracking_number`, `delivery_cost`, `delivery_paid` ✅
- admin: `admin_note`; rabat: `promo_code_id`, `promo_discount`
- BL legacy: `baselinker_order_id`, `baselinker_push_error`
- `order_items`: `product_id`, `quantity`, `price` (jednostkowa, **bez VAT**), `variant_values`, `notes`

### FAKTURY — luki (zero podstaw)
Brak JAKICHKOLWIEK pól: NIP, nazwa firmy, adres do faktury, stawka VAT, podział netto/VAT/brutto, numer/ data/ status faktury, pola KSeF. **NIP klienta NIE jest dziś zbierany ani w checkoucie, ani nigdzie.** (Dane *sprzedawcy* — NIP/REGON — są w `app/_lib/company.ts`.)

### WYSYŁKA — luki (fundament częściowo jest)
- Admin **już** edytuje `carrier`/`tracking_number`/`delivery_cost`/`delivery_paid` (akcja `updateOrderFulfillment` w `app/admin/zamowienia/[id]/`).
- **Klient NIE widzi** dziś przewoźnika ani nr śledzenia w `/konto/zamowienia/[id]` (tylko adres + kwoty). → niezależny, mały win.
- Brak: planowanego terminu dostawy, statusu dostawy dla klienta, danych dla firmy transportowej (piętro/winda/wniesienie/telefon — dziś tylko opcjonalny `phone` w adresie).

### Przepływ (potwierdzone)
- Zamówienie: `app/checkout` → `POST /api/checkout` → `createOrder()` → Stripe Checkout → webhook `markOrderPaid` (CAS pending→paid).
- **Koszt dostawy NIE idzie przez Stripe** — checkout informuje „wycenę podajemy po zamówieniu". Potwierdza decyzję z brainstormingu (`delivery_cost` ustalany osobno).
- RLS utwardzony (migr. 26): wszystkie zmiany `orders` przez service_role; klient ma tylko SELECT. Każdy zapis faktury/dostawy = server action po stronie admina.
- Wzorce: `"use server"` + `requireAdmin()` + `createAdminClient()` + CAS + `revalidatePath`; UI z `app/admin/_shared` (`Card`/`Field`/`ToastView`/`inputCls`) + `useTransition`+toast.

> Uwaga: konkretne nazwy nowych kolumn (np. `invoice_data`, `billing_address`) to PROPOZYCJE z rozpoznania, do zaprojektowania w spec — nie są jeszcze ustalone.

---

## Dalsze kroki (po odpowiedziach)
- Faktury: gdy znamy program księgowej (pyt. 9) → sprawdzić jego API (np. Fakturownia ma wsparcie KSeF) i ocenić zakres po stronie sklepu → spec → plan TDD → wdrożenie.
- Wysyłka: gdy znamy zakres → spec → plan → rozbudowa ręcznego modułu dostawy (bez integracji kuriera).
