# Cron rekoncyliacyjny BaseLinker — design / ops

**Data:** 2026-06-10
**Status:** zaakceptowany (brainstorming)
**Powiązany problem:** code review `5a1dd55..acf31ac`, znalezisko **HIGH** — opłacone
zamówienie może na trwałe nie trafić do BaseLinkera po twardym crashu pushu (brak
auto-recovery).

## Cel

Siatka bezpieczeństwa pod best-effort pushem zamówień do BL. Cyklicznie znajduje
opłacone zamówienia, które nie mają prawdziwego `baselinker_order_id`, i ponawia
push. Z modelu „uda się albo przepadnie" robi *eventually consistent*.

## Kontekst (dlaczego)

Push do BL (`pushOrderToBaseLinker`) jest best-effort i wołany tylko z webhooka
Stripe oraz ręcznego `/api/baselinker/push-order`. Jeśli proces zginie twardo
(timeout/OOM/deploy Vercela) między ustawieniem sentinela `pending:<ts>` a
`addOrder`/release, sentinel zostaje, retry Stripe'a dostaje „push w toku" →
webhook 200 → Stripe przestaje ponawiać → orphan bez automatycznego wznowienia.
Jedyny ślad to `console.warn`.

## Architektura

Cienki cron reużywający istniejącą `pushOrderToBaseLinker` — zero duplikacji
logiki claim/sentinel/idempotencji.

- `GET /api/cron/reconcile-bl` — endpoint wywoływany przez Vercel Cron.
- `app/_lib/baselinker-reconcile.ts` — czysta orchestracja (testowalna): dostaje
  listę id zamówień + funkcję `pushOne`, iteruje sekwencyjnie, kategoryzuje
  wyniki, zwraca podsumowanie. Nie zna Supabase ani HTTP.
- Route handler: autoryzacja → zapytanie po kandydatów → wywołanie orchestratora
  → JSON.

## Autoryzacja

Przepuść, gdy spełniony którykolwiek:
- `Authorization: Bearer $CRON_SECRET` — Vercel Cron dokleja automatycznie, gdy
  env `CRON_SECRET` ustawiony;
- `x-sync-secret: $BASELINKER_SYNC_SECRET` — ręczny curl, spójnie z
  `/api/baselinker/push-order`.

Brak obu → `401`. Brak ustawionego `CRON_SECRET` **i** `BASELINKER_SYNC_SECRET`
→ `500` (nic nie autoryzuje). Nowy env: `CRON_SECRET`.

## Definicja „osieroconego" (zapytanie)

```sql
status IN ('paid','processing','shipped','delivered')
AND (baselinker_order_id IS NULL OR baselinker_order_id LIKE 'pending:%')
ORDER BY created_at ASC
LIMIT 50
```

Pomijamy `pending` (nieopłacone) i `cancelled` (osobna ścieżka, nie pushujemy do
BL). Limit 50/przebieg; gdy kandydatów więcej — `backlog: true` w odpowiedzi +
log (żaden cichy cap).

## Pętla i przypadki

Dla każdego kandydata **sekwencyjnie** `await pushOrderToBaseLinker(id)`
(sekwencyjnie — szanujemy limity API BL). Istniejąca funkcja obsługuje przypadki:

- `NULL` → czysty push;
- świeży sentinel (<10 min) → zwraca „push w toku" (skip, łapiemy w następnym
  przebiegu);
- przedawniony sentinel (>10 min) → **przejęcie claimu + re-push** (patrz decyzja
  niżej).

Kategoryzacja wyniku per zamówienie:
- `pushed` — dostało numeryczne BL id (`baselinker_order_id != null`);
- `in_progress` — `reason` zawiera „push w toku" (świeży sentinel albo
  przegrany CAS);
- `skipped` — inny `reason` (brak emaila, brak/zły `BASELINKER_DEFAULT_STATUS_ID`);
- `failed` — `pushOrderToBaseLinker` rzuciło (łapane per-zamówienie, **nie**
  przerywa sweepa).

## Trade-off przedawnionych sentineli — DECYZJA: auto-fix + ślad

Re-push przedawnionego sentinela może utworzyć **duplikat w BL**, jeśli poprzedni
(zcrashowany) push zdążył utworzyć zamówienie przed śmiercią procesu. To **to samo
ryzyko**, które już akceptuje istniejący kod przejęcia claimu — i tak jak on,
zostawia ślad `baselinker_push_error` „zweryfikuj duplikat w BL". Wybrane
świadomie: pełny automatyczny fix buga HIGH > rzadki, widoczny i oznaczony
duplikat.

## Odpowiedź

```json
{
  "scanned": 3,
  "pushed": 2,
  "in_progress": 0,
  "skipped": 1,
  "failed": 0,
  "backlog": false,
  "results": [{ "orderId": "...", "outcome": "pushed", "baselinker_order_id": 123 }]
}
```

Plus jednolinijkowe `console.log` podsumowania (do logów Vercela).

## Harmonogram (`vercel.json`)

```json
{ "crons": [{ "path": "/api/cron/reconcile-bl", "schedule": "0 3 * * *" }] }
```

- **Hobby (teraz):** `0 3 * * *` = raz dziennie o 3:00. Hobby pozwala na cron
  maks. raz dziennie — częstszy harmonogram **wywala deploy**.
- **Pro (wkrótce):** zmień `schedule` na `*/15 * * * *` (co 15 min). To **jedna
  linijka**, endpoint bez zmian.

## Testy (TDD)

`app/_lib/__tests__/baselinker-reconcile.test.ts` (vitest): czysty orchestrator z
wstrzykniętym fejkowym `pushOne` — kategoryzacja wszystkich 4 wyników, łapanie
rzuconego błędu bez przerwania pętli, respektowanie limitu i flaga `backlog`.
Route handler (auth + zapytanie Supabase) bez unit-testu — spójnie z repo.

## Env do ustawienia (Vercel + .env.local)

- `CRON_SECRET` — sekret dla Vercel Cron (Vercel sam dokleja go jako
  `Authorization: Bearer`).

## Pliki

- `app/api/cron/reconcile-bl/route.ts` (nowy)
- `app/_lib/baselinker-reconcile.ts` (nowy)
- `app/_lib/__tests__/baselinker-reconcile.test.ts` (nowy)
- `vercel.json` (nowy)
- `.env.example` (dodaj `CRON_SECRET`)
