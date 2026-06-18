# Spec: Klient widzi przewoźnika i numer śledzenia w szczegółach zamówienia

**Data:** 2026-06-18
**Podprojekt:** 4 (wysyłka) — pierwszy, samodzielny i niezablokowany slice.
**Kontekst:** Rezygnacja z BaseLinkera, sklep przejmuje funkcje natywnie. Transport realizuje
firma transportowa (nie kurier). Patrz `docs/2026-06-18-rozpoznanie-faktury-wysylka.md`.

## Problem
Admin wypełnia już pola dostawy zamówienia (`carrier`, `tracking_number`, `delivery_cost`,
`delivery_paid` — z migracji 31, akcja `updateOrderFulfillment` w `app/admin/zamowienia/[id]/`),
ale **zalogowany klient ich nie widzi** w `/konto/zamowienia/[id]`. Widzi tylko status (badge),
pozycje, kwoty i adres dostawy. Klient nie wie, kto wiezie zamówienie ani jaki jest numer śledzenia.

## Cel
Pokazać klientowi **przewoźnika** i **numer śledzenia** w szczegółach jego zamówienia.

## Zakres (potwierdzony z właścicielem zadania)
Pokazujemy **tylko** `carrier` + `tracking_number`. Koszt dostawy i status opłacenia
(`delivery_cost`/`delivery_paid`) są **poza zakresem** — zależą od nierozstrzygniętego modelu
płatności za transport (czeka na odpowiedź właścicielki sklepu).

## Rozwiązanie

### Umiejscowienie
Czysto prezentacyjna zmiana w jednym pliku: `app/konto/zamowienia/[id]/page.tsx`.
- **Bez migracji.**
- **Bez zmian zapytania** — dane już są pobierane (`select('*')` na `orders`, więc `order.carrier`
  i `order.tracking_number` są dostępne w obiekcie `order`).
- **Bez zmian** w checkoucie i panelu admina.

Nowa karta „Dostawa" renderowana **po** karcie „Adres dostawy" (obecnie ~linia 254),
w tym samym stylu co istniejące karty (`bg-[var(--card-bg)] border border-[var(--border)]
rounded-2xl p-8`, nagłówek `font-display text-lg font-bold`).

### Zawartość karty
- **Przewoźnik** (`carrier`) — tekst.
- **Numer śledzenia** (`tracking_number`) — tekst, monospace (`font-mono`) dla czytelności,
  **bez linku** (firma transportowa, brak portalu śledzenia).
- Jeśli ustawione jest tylko jedno z pól — renderujemy tylko ten wiersz.

### Warunek widoczności
Karta renderuje się **tylko gdy `carrier` lub `tracking_number` jest niepuste**
(po `trim()`, bo to nullable `text`). Admin wypełnia te pola dopiero przy wysyłce, więc karta
naturalnie pojawia się przy statusie „Wysłane"/„Dostarczone". Gdy pól brak — karty nie ma
(bez placeholderów). Status zamówienia (badge u góry) zostaje bez zmian.

### i18n (PL + DE)
Strona jest dwujęzyczna. Dodajemy etykiety do istniejącego obiektu `c` (oba warianty `de`/PL):
| klucz | PL | DE |
|-------|-----|-----|
| `delivery` | Dostawa | Versand |
| `carrier` | Przewoźnik | Spediteur |
| `trackingNumber` | Numer śledzenia | Sendungsnummer |

> Uwaga: w `c` istnieje już klucz `shipping` („Dostawa"/„Versand") używany w podsumowaniu kwot.
> Nowy nagłówek karty użyje osobnego klucza `delivery`, żeby nie kolidować — wartość PL może być
> identyczna („Dostawa"), ale semantycznie to inny element.

## Poza zakresem (świadomie — YAGNI / czeka na decyzje)
- Koszt dostawy i status opłacenia (`delivery_cost`/`delivery_paid`).
- Planowany termin dostawy (brak kolumny — wymaga migracji).
- Dane dla firmy transportowej od klienta (piętro/winda/wniesienie/telefon).
- Linki do portalu śledzenia.
- Placeholdery dla statusów „w przygotowaniu".

## Testy
Do doprecyzowania w planie: sprawdzić realne wsparcie testów dla tej strony (server component
z Supabase). Jeśli jest infrastruktura render-testów — test: karta widoczna gdy `carrier`/`tracking`
ustawione, ukryta gdy puste/null. Jeśli nie — weryfikacja manualna przez `run`. Plan rozstrzygnie
podejście na podstawie faktycznego stanu testów w repo.

## Ryzyka
Minimalne. Zmiana addytywna i prezentacyjna, dane już dostępne, brak wpływu na inne przepływy.
Jedyne wrażliwe miejsce — strona klienta (outward-facing), więc weryfikacja wizualna przed mergem.
