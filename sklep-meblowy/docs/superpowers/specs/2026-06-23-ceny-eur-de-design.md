# Projekt: pełne ceny w EUR na wersji `/de`

**Data:** 2026-06-23
**Status:** kierunek zaakceptowany (Mikołaj). Spec do przeglądu przed pisaniem planu implementacji.
**Powiązane:** i18n PL/DE (PR #41 — domknięcie leaków), migracja Stripe→Przelewy24 (osobny wątek), wycofanie BaseLinker (osobny wątek).

---

## 1. Kontekst (stan obecny)

- Cały pipeline pieniędzy jest w **PLN**:
  - `app/_lib/format.ts` → `formatPrice(amount, locale)` zwraca zawsze `"… zł"` (zmienia tylko separatory pl-PL / de-DE).
  - `app/api/checkout/route.ts` — Stripe `currency: "pln"`, `unit_amount = round(plnPrice*100)`; promo coupon `amount_off` w `pln`; `locale: "pl"` (UI Stripe na sztywno polskie); `success_url`/`cancel_url` mają już prefiks `/de`.
  - `createOrder(...)` (`app/_lib/orders.ts`) zapisuje `total` w PLN; `order_items.price` w PLN.
  - JSON-LD na karcie produktu: `priceCurrency: "PLN"`.
- Waluta jest **związana z locale**: PL (`/`) i DE (`/de`); proxy ustawia `x-locale`.
- Ceny liczone w checkoutcie **po stronie serwera z DB** (nie ufamy cenom z klienta) — to zostaje.

## 2. Decyzje (ustalone w brainstormie)

1. **Pełne EUR**: klient na `/de` widzi ceny w EUR i **faktycznie płaci w EUR**.
2. **BaseLinker — poza zakresem** (wycofywany osobno; nie projektujemy pod niego).
3. **Stały, konfigurowalny kurs** PLN→EUR (nie live API, nie ceny per-produkt).
4. **Kurs trzymany w bazie, edytowalny w `/admin`** (bez deploya).
5. **Zaokrąglanie w górę do pełnych euro**: `cenaEUR = ceil(cenaPLN × kurs)` (bez groszy).
6. Waluta **związana z locale**: `/de` → EUR, `/` → PLN. Bez osobnego przełącznika walut.

## 3. Architektura (podejście A)

Jedno źródło prawdy = **ceny w PLN** (w DB i w koszyku/zustand). Przeliczenie na EUR dzieje się **tylko w dwóch miejscach**: przy *formatowaniu do wyświetlenia* oraz w *checkoutcie* (kwota pobrania). Każde zamówienie **zapisuje użyty kurs** (snapshot), żeby historyczne ceny były stabilne.

Odrzucone podejście B (prekonwersja w warstwie danych — każdy fetch zwraca już EUR): inwazyjne, psuje koszyk (zustand trzyma PLN), ryzyko podwójnej konwersji.

### Konwersja
```
eur(plnAmount, rate) = Math.ceil(plnAmount * rate)   // pełne euro, w górę
```
`rate` = liczba `€ za 1 zł` (np. 0,23). Jedna globalna wartość.

## 4. Komponenty i zmiany

### 4.1 Model waluty / moduł `money`
- Nowy `app/_lib/money.ts`:
  - `convertToEur(pln: number, rate: number): number` — `Math.ceil(pln*rate)`.
  - `formatMoney(plnAmount: number, locale: Locale, rate: number): string` — dla `de` → `"506 €"` (grupowanie de-DE), dla `pl` → istniejące `"2 199 zł"`.
- `app/_lib/format.ts` / `formatPrice`: zachowujemy istniejące zachowanie dla PL; nowe wywołania idą przez `formatMoney` (z kursem). Strategia migracji wywołań — w planie (większość call-sites bierze `locale`; trzeba dołożyć `rate`).

### 4.2 Dostarczenie kursu do komponentów
- **Serwer**: kurs ładowany z DB (cache na request/proces; helper `getEurRate()`).
- **Klient**: `RateProvider` (kontekst) seedowany wartością z serwera w `app/layout.tsx` (analogicznie do tego, jak locale trafia do klienta). Hook `useEurRate()`.
- Komponenty klienckie wyświetlające ceny (ProductCard, koszyk, CartToast, checkout summary, OrdersList, itd.) biorą `rate` z hooka; serwerowe — z `getEurRate()`.

### 4.3 Kurs w panelu admina + przechowywanie
- **Migracja SQL**: tabela ustawień sklepu (np. `store_settings` z pojedynczym wierszem) z kolumną `eur_rate numeric not null default <wartość startowa>`. (Albo reuse istniejącego mechanizmu ustawień, jeśli jest — do sprawdzenia w planie.)
- **`/admin`**: małe pole „Kurs EUR (1 zł = … €)" + zapis (server action, `requireAdmin`, service role). Walidacja: liczba > 0.
- RLS: odczyt publiczny (kurs potrzebny do renderu), zapis tylko service_role (wzorzec jak migracja 28).

### 4.4 Checkout (pobieranie w EUR)
- Gdy `locale === "de"`:
  - przelicz każdą cenę pozycji PLN→EUR (`convertToEur`), `stripeLineItems` z `currency: "eur"`, `unit_amount = eurPrice*100`;
  - koszt dostawy i rabat promo (`amount_off`) również w EUR;
  - Stripe `locale: "de"` (UI płatności po niemiecku — przy okazji naprawia obecny hardcode `"pl"`);
  - `total`/`finalTotal` przekazywane do `createOrder` w EUR.
- Gdy `locale === "pl"`: bez zmian (PLN).
- **Spójność cena widoczna == pobierana**: ten sam kurs (bieżący z DB) używany do wyświetlania i do sesji Stripe.

### 4.5 Zamówienia (DB + wyświetlanie)
- **Migracja SQL**:
  - `orders.currency text not null default 'pln' check (currency in ('pln','eur'))` — wstecznie zgodne (istniejące = PLN).
  - `orders.fx_rate numeric` — snapshot kursu użytego przy zamówieniu (NULL dla starych/PLN).
- Kwoty (`orders.total`, `order_items.price`, dostawa, `promo_discount`) zapisywane **w walucie pobrania** (EUR dla zamówień DE).
- Wyświetlanie (`/konto/zamowienia`, `/konto/zamowienia/[id]`, panel admina zamówień, mail potwierdzenia) — formatuje wg `order.currency` (nie wg locale przeglądającego!). Tj. zamówienie EUR pokazuje EUR również adminowi/po PL.

### 4.6 JSON-LD / SEO
- `priceCurrency` na karcie produktu: `"EUR"` dla `/de`, `"PLN"` dla `/`. Cena w JSON-LD = przeliczona EUR dla `/de`.

## 5. Poza zakresem / ryzyka

- **BaseLinker** — wycofywany osobno; nie dotykamy. Jeśli gdzieś jeszcze jest push do BL przy zamówieniu, pozostaje PLN-owy i jest osobno wygaszany (do potwierdzenia w planie, by EUR nie rozjechało się z ewentualnym pushem).
- **⚠️ VAT / OSS / faktury przy sprzedaży w EUR do Niemiec** — odpowiedzialność biznesowa/księgowa. Spec NIE rozwiązuje kwestii podatkowych/fakturowych; flaga ryzyka prawnego.
- **Przelewy24** — migracja płatności osobno; warstwa cen EUR (`money.ts` + konwersja) jest provider-agnostyczna i przeniesie się do P24 (tam też trzeba ustawić walutę EUR).
- **FX po stronie sklepu** — sklep ma koszty w PLN; ryzyko kursowe to świadoma decyzja biznesowa (mitygacja: zaokrąglanie w górę daje drobny bufor).

## 6. Przypadki brzegowe

- **Zmiana kursu w trakcie sesji klienta**: checkout liczy bieżącym kursem (autorytatywnie); wyświetlanie też bieżącym. Jeśli admin zmieni kurs między obejrzeniem a płatnością — rzadkie, akceptowalne; zamówienie zapisuje faktycznie użyty kurs.
- **Istniejące zamówienia / strona PL**: `currency` default `'pln'`, brak zmian; PL bez EUR.
- **Brak/0 kursu w DB**: walidacja przy zapisie (>0) + sensowna wartość startowa w migracji; fallback obronny (np. nie renderować EUR / log) do ustalenia w planie.

## 7. Testy

- Unit: `convertToEur` (zaokrąglanie w górę, granice), `formatMoney` (de „506 €" / pl „2 199 zł", separatory).
- Checkout: dla `locale=de` sesja Stripe ma `currency:"eur"` i poprawne `unit_amount`; dla `pl` — `pln`. Promo/dostawa w EUR.
- Zamówienia: `currency` i `fx_rate` zapisane; wyświetlanie wg waluty zamówienia (nie locale).
- Admin: zapis kursu (walidacja >0, tylko admin).

## 8. Otwarte pytania do planu

- Dokładny kształt przechowywania kursu (`store_settings` vs istniejący mechanizm) i miejsce pola w `/admin` (osobna sekcja „Ustawienia" czy dołożone gdzieś istniejącego ekranu).
- Strategia podmiany wszystkich call-sites `formatPrice` → `formatMoney` (ile ich jest, czy wprowadzić `RateProvider` globalnie w layout).
- Czy koszt dostawy ma osobny próg/kwotę w EUR, czy przeliczany z PLN tym samym kursem.
- Potwierdzić brak aktywnego pushu BL przy tworzeniu zamówienia (żeby EUR nie rozjechało się z BL przed jego wygaszeniem).

---

**Następny krok:** przegląd tego speca → skill `writing-plans` (plan implementacji) → implementacja (TDD).
