# Lista zamówień: widoczne wejście w szczegóły + usuwanie zamówienia

Data: 2026-07-01

## Kontekst

Zmiana statusu (i całe zarządzanie zamówieniem) już istnieje na stronie
szczegółów `/admin/zamowienia/[id]` (komponent `OrderControls`). Problem: z
listy `/admin/zamowienia` jedyne wejście to mały link numeru `#…` — łatwe do
przeoczenia. Dodatkowo brak usuwania zamówień.

## Zakres

### 1. Widoczne wejście z listy w szczegóły
- Wyodrębnić wiersz tabeli do klienckiego komponentu `OrderRow`
  (`app/admin/zamowienia/OrderRow.tsx`).
- Cały wiersz klikalny: `useRouter().push('/admin/zamowienia/<id>')`,
  `cursor-pointer`, hover. Dodać ostatnią kolumnę z wyraźnym linkiem
  „Zarządzaj →" (prawdziwy `<Link>` — dostępny z klawiatury; `stopPropagation`
  by nie dublować nawigacji). Link numeru `#…` zostaje.
- Strona listy (serwerowa) przekazuje do `OrderRow` gotowe prymitywy: `id`,
  `orderNumber`, `dateLabel`, `customerName`, `customerEmail`, `statusLabel`,
  `statusClassName`, `amountLabel`, `deliveryPaid`. Komponent pozostaje „głupi".
- Nagłówek tabeli: dodać pustą kolumnę na akcję.

### 2. Usuwanie zamówienia
- Akcja serwerowa `deleteOrder(orderId)` w `app/admin/zamowienia/actions.ts`:
  `requireAdmin` → walidacja id → `createAdminClient` → `DELETE from orders`.
  `order_items` i `order_issues` znikają kaskadowo (FK ON DELETE CASCADE).
  `revalidatePath('/admin/zamowienia')`. Zwraca `ActionResult`.
- UI: przycisk „Usuń zamówienie" (czerwony) w `OrderControls` (strona
  szczegółów) z `window.confirm` pokazującym numer zamówienia. Po sukcesie
  `router.push('/admin/zamowienia')`. Wzorzec jak `DeleteProductButton`.
- Kasowanie tylko ze szczegółów (nie z listy) — mniejsze ryzyko pomyłki.

## Uwagi / bezpieczeństwo

- Usuwanie jest TRWAŁE (znika z historii/raportów). Do zwykłego odwołania służy
  status „Anulowane"; dlatego delete jest schowany w szczegółach + potwierdzenie.
- Brak efektów na stock (meble na zamówienie — stock nie jest dekrementowany).
- Akcja przez service_role (jak reszta mutacji admina), po `requireAdmin`.

## Testy / weryfikacja

- Build + lint + typecheck + istniejące 274 testy zielone.
- Sama akcja `deleteOrder` to cienki I/O (bez nowej czystej logiki do testu
  jednostkowego). Reguły statusów (`canTransition`) mają już testy.

## Poza zakresem (YAGNI)

- Usuwanie wprost z listy (per-wiersz) — ryzyko pomyłkowych kliknięć.
- Mail do klienta przy zmianie statusu (osobny temat).
- Ograniczanie usuwania do statusu „Anulowane" (na życzenie usuwamy dowolne).
