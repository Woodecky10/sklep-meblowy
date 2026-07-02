# Przelewy24 — checklista rejestracji + audyt mollien.pl

Data audytu: 2026-07-02. Źródła: centrum pomocy Przelewy24 (linki na końcu).

> Weryfikacja sklepu przez P24 wynika z obowiązku informacyjnego (ustawa o
> prawach konsumenta) i wytycznych regulatorów. Poniżej: wymagania + stan
> mollien.pl (✅ jest / ⚠️ do sprawdzenia/poprawy / ✗ brak).

## A. Konto i formalności (poza kodem)

- [ ] Rejestracja na formularzu P24 (`registration.przelewy24.pl` / `s.przelewy24.pl/register2024`).
- [ ] Dokumenty wg formy działalności. **Mollien = JDG (LOGAN KAMIL DERKACZ)** →
      skan dowodu właściciela. (Spółki: dowody reprezentantów + oświadczenia PEP + KRS.)
- [ ] Przelew weryfikacyjny z rachunku do wypłat (JDG może prywatny).
- [ ] Rachunek bankowy do wypłat — **`COMPANY.bankAccount` = null**, do uzupełnienia.
- [ ] Poczekać na akceptację i pełną aktywację konta.

## B. Wymagania wobec strony — stan mollien.pl

| Wymaganie P24 | Stan | Gdzie |
|---|---|---|
| Dane sprzedawcy: nazwa/forma, **NIP (10 cyfr, zgodny z kontem P24)**, REGON, KRS (jeśli spółka), adres | ✅ jest | `company.ts` (NIP 6192055737, REGON 521700369, KRS null=JDG, Dworzyszcze 4, 63-630 Rychtal); render w regulamin §1, kontakt |
| NIP zgodny z kontem P24 | ⚠️ do potwierdzenia po rejestracji | — |
| Regulamin: dane sprzedawcy, płatności, dostawa, reklamacje, odstąpienie | ✅ jest | `(legal)/regulamin/page.tsx` §1–§8 (PL+DE w jednym pliku) |
| Link do regulaminu aktywny **przed** finalizacją zamówienia | ✅ jest | `CheckoutForm.tsx` — wymóg zaznaczenia regulaminu + polityki przed „Zapłać" |
| Polityka prywatności + obowiązek informacyjny RODO (kompletna, nie sam generator) | ✅ jest | `(legal)/prywatnosc/page.tsx` |
| Informacja o **operatorze płatności (Przelewy24 / PayPro S.A.)** | ✅ jest | polityka §9 (pełne dane PayPro: KRS 0000347935, NIP 7792369887, KNF IP24/2014); regulamin §4.3 metody płatności wymienia „Przelewy24"; dostawa – metody płatności |
| Ceny + **koszt dostawy** widoczne przed zamówieniem | ✅ jest (po zmianie: **darmowa wysyłka**) | dostawa, koszyk, checkout, karta produktu |
| Prawo odstąpienia (14 dni) + procedura reklamacyjna | ✅ jest | regulamin §6–§7, `(legal)/zwroty/page.tsx` |
| Dane kontaktowe sprzedawcy | ✅ jest | stopka, kontakt, regulamin §1.3 |

## C. Do poprawy / decyzji przed weryfikacją

1. **⚠️ Niespójność terminu zwrotu (ryzyko konsumenckie/P24):** plakietki UI mówią
   **„Zwrot do 30 dni"** (`dictionaries` product/cart, `ProductMainSection`), a
   regulamin i strona zwrotów mówią o ustawowych **14 dniach**. Trzeba ujednolicić:
   albo oferować realnie 30 dni (i wpisać 30 w regulaminie/zwrotach), albo zmienić
   plakietki na 14 dni. **Decyzja biznesowa — do ustalenia.**
2. **NIP/REGON/rachunek:** potwierdzić, że dane w `company.ts` są ostateczne i
   zgodne z kontem P24; uzupełnić `bankAccount` (jeśli gdziekolwiek pokazywany).
3. **Weryfikacja prawnicza** treści (regulamin/polityka mają komentarze
   „do przeglądu przez prawnika") — zwłaszcza wersje DE (tłumaczenie maszynowe).

## D. Stan zmian „darmowa wysyłka na terenie całej Polski" (2026-07-02)

Checkout i tak nie doliczał kosztu dostawy do płatności — zmiana jest wyłącznie
tekstowa. Zaktualizowane: strona dostawy, regulamin (PL+DE), koszyk, checkout,
karta produktu, „o nas", słowniki PL/DE. Dostawa pozostaje tylko na terenie
Polski (bez zagranicy).

## Źródła (P24, centrum pomocy)

- Warunki pozytywnej weryfikacji sklepu: https://www.przelewy24.pl/centrum-pomocy/sprzedaje-z-przelewy24/weryfikacja-sklepu-internetowego/jakie-warunki-musze-spelnic-sklep-byl-zweryfikowany-pozytywnie
- Kroki aktywacji konta: https://www.przelewy24.pl/centrum-pomocy/sprzedaje-z-przelewy24/rejestracja-w-przelewy24/jakie-kroki-musze-podjac-aby-moje-konto-bylo-aktywne
- Wymagane dokumenty: https://www.przelewy24.pl/centrum-pomocy/sprzedaje-z-przelewy24/rejestracja-w-przelewy24/zarejestrowalemam-sie-w-p24-jakie-dokumenty-mam-wyslac
- Gdzie umieścić regulamin: https://www.przelewy24.pl/centrum-pomocy/sprzedaje-z-przelewy24/weryfikacja-sklepu-internetowego/gdzie-dokladnie-umiescic-regulamin-sprzedazy
- Generowany regulamin/polityka: https://www.przelewy24.pl/centrum-pomocy/sprzedaje-z-przelewy24/weryfikacja-sklepu-internetowego/czy-wystarczy-generowac-regulamin-i-polityke-prywatnosci-automatycznie
- Obowiązek informacyjny RODO (akceptanci): https://www.przelewy24.pl/obowiazek-informacyjny-rodo-akceptanci
