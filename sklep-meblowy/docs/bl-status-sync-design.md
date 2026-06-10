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
  `getOrderStatusList`/`addOrder`) + typy `BLOrder`, `BLOrdersResponse`.
- `app/_lib/baselinker-status-sync.ts` (nowy) — czyste, testowalne jednostki:
  `parseStatusIdConfig`, `mapBlStatusToShop`, `decideStatusUpdate` (forward-only),
  `fetchBlStatusMap` (paginacja getOrders, z wstrzykniętym fetcherem),
  `reconcileOrderStatuses` (orchestrator z wstrzykniętym `applyUpdate`).
- `app/api/cron/reconcile-bl/route.ts` — rozszerzenie: po push-sierot uruchom
  pull-statusów. Zwraca `{ push: {...}, statusSync: {...} }`.

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
   not null), odfiltruj `hasCompletedBlPush`. Brak → `{ scanned: 0 }`.
3. `fetchBlStatusMap`: `getOrders` po `date_confirmed_from` = (najstarszy in-flight
   `created_at`, max okno ~90 dni wstecz), paginacja (max 100/stronę, advance
   `date_confirmed_from`) → `Map<string blOrderId, status_id>`.
4. Dla każdego in-flight: `blStatusId = map.get(order.baselinker_order_id)`;
   brak → `notFoundInBl++` (zaloguj); jest → `next = decideStatusUpdate(order.status,
   mapBlStatusToShop(blStatusId, cfg))`; jeśli `next` → guarded update, tally.
5. `statusSync = { scanned, updated, notFoundInBl, breakdown: {shipped, delivered, cancelled, processing} }`.

## Maile

Brak ze sklepu. Zmiana statusu w BL i tak odpala maile po stronie BL (Automatyczne
akcje). Sklep tylko odzwierciedla status.

## Testy (TDD)

`app/_lib/__tests__/baselinker-status-sync.test.ts` (vitest):
- `parseStatusIdConfig` — CSV → zbiory, puste/śmieci.
- `mapBlStatusToShop` — trafienie w każdy stan + brak mapowania → null.
- `decideStatusUpdate` — forward (paid→shipped OK), backward (shipped→processing
  blok), `cancelled` z dowolnego in-flight, brak mapowania.
- `fetchBlStatusMap` — paginacja z wstrzykniętym getOrders (2 strony → scalona mapa).
- `reconcileOrderStatuses` — kategoryzacja (updated/notFound/skip) z wstrzykniętym
  applyUpdate.
Route + `getOrders` bez unit-testu (spójnie z repo).

## Env do ustawienia (Vercel + .env.local)

`BL_STATUS_SHIPPED_IDS`, `BL_STATUS_DELIVERED_IDS`, `BL_STATUS_CANCELLED_IDS`
(+ opcjonalnie `BL_STATUS_PROCESSING_IDS`). Id-ki z `/api/baselinker/test`.

## Pliki

- `app/_lib/baselinker.ts` (+`getOrders`, typy)
- `app/_lib/baselinker-status-sync.ts` (nowy)
- `app/_lib/__tests__/baselinker-status-sync.test.ts` (nowy)
- `app/api/cron/reconcile-bl/route.ts` (rozszerzenie)
- `.env.example` (+ env mapowania)
