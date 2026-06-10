# Sync statusów zamówień BaseLinker → sklep — design / ops

**Data:** 2026-06-10
**Status:** zaakceptowany (brainstorming)
**Powiązany problem:** code review / audyt BL — klient widzi tylko status Stripe
(„Opłacone"); zmiana statusu w BL (Wysłane/Dostarczone/Anulowane) nie wraca do
sklepu. Najwyższa wartość biznesowa z otwartych pozycji.

## Cel

Ciągnąć aktualny status zamówienia z BaseLinkera i odzwierciedlać go w
`orders.status`, żeby klient w `/konto/zamowienia` widział „Wysłane/Dostarczone/
Anulowane", nie tylko „Opłacone". Wyświetlanie już działa (badge mapuje wszystkie
6 statusów) — dokładamy tylko aktualizację `orders.status`.

## Architektura

Cienki dodatek reużywający cron `reconcile-bl` i wzorce projektu.

- `app/_lib/baselinker.ts` — nowa `getOrders` (przez `blRequest`, wzorzec jak
  `getOrderStatusList`/`addOrder`) + typ `BLOrder`. Użycie: fetch po `order_id`.
- `app/_lib/baselinker-status-sync.ts` (nowy) — czyste, testowalne jednostki:
  `parseStatusIdConfig`, `mapBlStatusToShop`, `decideStatusUpdate` (forward-only),
  `reconcileOrderStatuses` (orchestrator z wstrzykniętym fetcherem statusu i
  `applyUpdate`).
- `app/api/cron/reconcile-bl/route.ts` — rozszerzenie: po push-sierot uruchom
  pull-statusów. Zwraca `{ push: {...}, statusSync: {...} }`.

## Pobieranie statusu — per zamówienie (nie paginacja okna)

Mamy `baselinker_order_id` każdego zamówienia, więc pytamy BL wprost o konkretne
zamówienie: `getOrders({ order_id })` → zwraca to jedno z aktualnym `status_id`.
Sekwencyjnie, N małych wywołań (N = liczba in-flight, mała), w granicach limitu
BL (100/min), z retry na błędy przejściowe. Świadomie zamiast paginacji po
`date_confirmed_from` — ta ma niejasne zachowanie dla zamówień
potwierdzonych/niepotwierdzonych i mogłaby cicho pominąć zamówienie. Per-order
jest trywialnie poprawne. Limit `STATUS_BATCH_LIMIT` na przebieg + flaga backlog
(jak w push-sierot).

## Mapowanie (env, ustawiane raz)

Statusy BL to dowolne numeryczne `status_id` per konto (lista z
`/api/baselinker/test` → `getOrderStatusList`). Env (CSV id-ków, kilka id → jeden
nasz stan dozwolone):
- `BL_STATUS_SHIPPED_IDS`
- `BL_STATUS_DELIVERED_IDS`
- `BL_STATUS_CANCELLED_IDS`
- `BL_STATUS_PROCESSING_IDS` (opcjonalny)

`mapBlStatusToShop(statusId, cfg)` → `'processing'|'shipped'|'delivered'|'cancelled'|null`
(`null` = brak mapowania → nie ruszaj).

## Reguły aktualizacji (bezpieczeństwo)

- Ruszamy tylko **in-flight**: `status ∈ {paid, processing, shipped}` z
  PRAWDZIWYM `baselinker_order_id` (filtr `hasCompletedBlPush` — nie NULL, nie
  sentinel `pending:%`). Nie dotykamy `pending` (nieopłacone), `delivered` /
  `cancelled` (terminalne).
- **Forward-only:** ranga `paid(1) < processing(2) < shipped(3) < delivered(4)`;
  aktualizuj tylko gdy `rank(target) > rank(current)`. **Wyjątek:** `cancelled`
  z dowolnego in-flight. `decideStatusUpdate(current, mappedTarget)` →
  `newStatus | null`.
- Update guarded: `update orders set status=? where id=? and status=<odczytany>`
  (CAS na odczytanym statusie — nie deptać równoległej zmiany).

## Przepływ (w cronie, po push-sierot)

1. Jeśli env mapowania puste → `statusSync = { configured: false }`, koniec
   (push-sierot działał niezależnie).
2. Pobierz z DB in-flight (status in paid/processing/shipped, `baselinker_order_id`
   not null), odfiltruj `hasCompletedBlPush`, utnij do `STATUS_BATCH_LIMIT`
   (reszta → backlog). Brak → `{ scanned: 0 }`.
3. Dla każdego in-flight sekwencyjnie: `statusId = getBlOrderStatus(order.baselinker_order_id)`
   (`getOrders({ order_id })`); brak → `notFoundInBl++` (zaloguj). Błąd wywołania
   łapany per-zamówienie (nie przerywa pętli).
4. `target = mapBlStatusToShop(statusId, cfg)`; `next = decideStatusUpdate(order.status, target)`;
   jeśli `next` → guarded update, tally wg stanu docelowego.
5. `statusSync = { scanned, updated, notFoundInBl, failed, backlog, breakdown: {processing, shipped, delivered, cancelled} }`.

## Maile

Brak ze sklepu. Zmiana statusu w BL i tak odpala maile po stronie BL (Automatyczne
akcje). Sklep tylko odzwierciedla status.

## Testy (TDD)

`app/_lib/__tests__/baselinker-status-sync.test.ts` (vitest):
- `parseStatusIdConfig` — CSV → zbiory; puste/śmieci/spacje.
- `mapBlStatusToShop` — trafienie w każdy stan + brak mapowania → null.
- `decideStatusUpdate` — forward (paid→shipped OK), backward (shipped→processing
  blok → null), `cancelled` z dowolnego in-flight, brak mapowania → null,
  ten sam stan → null.
- `reconcileOrderStatuses` — kategoryzacja (updated/notFound/skip/failed) z
  wstrzykniętym fetcherem statusu i `applyUpdate`; błąd fetchera nie przerywa pętli.
Route + `getOrders` bez unit-testu (spójnie z repo).

## Env do ustawienia (Vercel + .env.local)

`BL_STATUS_SHIPPED_IDS`, `BL_STATUS_DELIVERED_IDS`, `BL_STATUS_CANCELLED_IDS`
(+ opcjonalnie `BL_STATUS_PROCESSING_IDS`). Id-ki z `/api/baselinker/test`.

## Pliki

- `app/_lib/baselinker.ts` (+`getOrders`, typ `BLOrder`)
- `app/_lib/baselinker-status-sync.ts` (nowy)
- `app/_lib/__tests__/baselinker-status-sync.test.ts` (nowy)
- `app/api/cron/reconcile-bl/route.ts` (rozszerzenie)
- `.env.example` (+ env mapowania)
