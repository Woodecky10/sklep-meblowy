# Panel zarządzania zamówieniami w adminie + wygaszenie pushu BL (design)

**Data:** 2026-06-17
**Status:** zaakceptowany (brainstorming)
**Kontekst:** rezygnacja z BaseLinkera — sklep przejmuje funkcje, które dotąd pełnił BL. To **podprojekt 1 z 4** (patrz „Dekompozycja"). Dziś opłacone zamówienia trafiają tylko do bazy i były obsługiwane w BL (zmiana statusu, wysyłka, rozliczenie dostawy). Po wyłączeniu BL admin nie ma gdzie ich obsłużyć — to największa luka operacyjna.

## Dekompozycja „zastąpienie BaseLinkera" (4 podprojekty)

Każdy ma własny spec → plan → wdrożenie. Kolejność wg podejścia A i gotowości:

1. **Panel zamówień + wygaszenie pushu BL** ← *ten spec* (etap 1a)
2. **Natywne tworzenie/zarządzanie produktami + wygaszenie syncu BL** (etap 1b — osobny spec)
3. **Faktury / VAT** (po rozpoznaniu obecnego obiegu fakturowania)
4. **Wysyłka — integracja API kuriera** (po wyborze przewoźników)

## Cel

Admin obsługuje zamówienia w całości w panelu sklepu: przegląda listę, wchodzi w szczegóły, ręcznie zmienia status, zapisuje dane wysyłki (przewoźnik + nr śledzenia), rozlicza koszt dostawy i prowadzi notatki wewnętrzne. Klient nadal widzi status w `/konto/zamowienia` (bez nowych e-maili w tym etapie). Push zamówień do BL zostaje wyłączony; kod i kolumny BL — uśpione (pełne usunięcie poza zakresem).

## Decyzje (z brainstormingu)

| Temat | Decyzja |
|---|---|
| Podejście do etapu 1 | A — zamówienia najpierw, potem natywne produkty (osobny spec) |
| Powiadomienia e-mail | BRAK w tym etapie (status tylko w `/konto/zamowienia`); brak infrastruktury mailowej w repo |
| Wysyłka | Ręczna: pola `carrier` + `tracking_number` (przypadek „własny transport/spedycja"). API kuriera = podprojekt 4 |
| Faktury / VAT | Poza zakresem — wymagają osobnego rozpoznania (podprojekt 3) |
| Rozliczenie dostawy | `delivery_cost` + `delivery_paid` na zamówieniu (dostawa rozliczana osobno, dotąd `delivery_price` w BL) |
| Reguła przejść statusów | Tylko do przodu (`paid→processing→shipped→delivered`) + `cancelled` z każdego stanu poza `delivered` |
| Kod BL | Wygaszony (push wyłączony, cron wyłączony, kafelek ukryty); kolumny i pliki zostają jako legacy |
| Czytelny nr zamówienia | `order_number` int z sekwencji; backfill istniejących |

## Architektura

Nowa sekcja admina:
- `app/admin/zamowienia/page.tsx` — lista (server component).
- `app/admin/zamowienia/[id]/page.tsx` — szczegóły (server component).
- `app/admin/zamowienia/actions.ts` — server actions (mutacje).
- Komponenty klienckie tam, gdzie potrzebna interakcja (zmiana statusu, formularz wysyłki/dostawy, notatka) — prop-driven, wzorzec jak istniejące edytory admina (po `5f827f4 refactor(admin): edytory prop-driven`).

Wzorce do naśladowania (istniejące w repo): guard admina jak w pozostałych `/admin/*`, klient `admin` Supabase w server actions (service role), `revalidatePath` po mutacji, `Pagination` z `app/_components/ui`.

## Model danych — migracja 31

Do tabeli `orders` dochodzą kolumny:

| Kolumna | Typ | Uwagi |
|---|---|---|
| `order_number` | int unikalny | z sekwencji; przydzielany przy tworzeniu zamówienia; backfill istniejących wg `created_at` |
| `admin_note` | text NULL | notatki wewnętrzne admina |
| `carrier` | text NULL | przewoźnik (free text: „DPD", „własny transport"…) |
| `tracking_number` | text NULL | numer śledzenia / referencja |
| `delivery_cost` | numeric(10,2) NULL | koszt dostawy (rozliczany osobno) |
| `delivery_paid` | boolean NOT NULL default false | czy dostawa rozliczona |
| `status_updated_at` | timestamptz NULL | ostatnia zmiana statusu (do listy/sortowania) |

- `order_number`: utworzyć `sequence` + default (lub przydział w `createOrder`); backfill jednorazowy w migracji wg kolejności `created_at`. Decyzja implementacyjna (sekwencja vs przydział w kodzie) do rozstrzygnięcia w planie — wymóg: monotoniczny, unikalny, stabilny.
- Migracja DDL uruchamiana ręcznie przez admina (Mikołaja) w Supabase SQL Editorze — Claude nie ma dostępu DDL (tylko PostgREST przez service role). Plik: `supabase/migrations/31_orders_admin_fields.sql`. Aktualizacja `supabase/schema.sql` w tym samym commicie.

## Lista zamówień (`/admin/zamowienia`)

- Tabela kolumn: nr (`order_number`) / data / klient (imię + email; gość lub konto) / status (badge) / kwota (`total`) / znacznik „dostawa opłacona".
- Filtr po statusie (taby lub select), szukajka po nr / emailu / nazwisku.
- Sort malejąco po `created_at`. Paginacja (komponent `Pagination`).
- Domyślnie pokazujemy zamówienia „realne" (`paid` i dalej); `pending`/porzucone widoczne pod filtrem, z ograniczonymi akcjami.

## Szczegóły zamówienia (`/admin/zamowienia/[id]`)

- **Nagłówek:** `order_number`, data, badge statusu + zmiana statusu.
- **Klient:** imię, email (gość `guest_email` lub konto), adres dostawy (`shipping_address`).
- **Pozycje:** nazwa produktu (link do `/produkt/[id]`), etykieta wariantu (`formatVariantLabel(variant_values)`), notatka per pozycja (`notes`), ilość, cena jedn., suma pozycji.
- **Podsumowanie:** suma produktów, rabat + kod (`promo_discount`, `promo_code_id`), kwota zapłacona (`total`), status płatności + `stripe_payment_intent` (referencja do zwrotów w Stripe).
- **Blok dostawy:** `delivery_cost`, `delivery_paid` (toggle), `carrier`, `tracking_number` — zapis akcją `updateOrderFulfillment`.
- **Zmiana statusu:** `updateOrderStatus` z walidacją przejść (poniżej); aktualizuje `status_updated_at`.
- **Notatka admina:** `admin_note` — zapis akcją `updateOrderNote`.

## Reguła przejść statusów

Dozwolone (do przodu): `paid → processing → shipped → delivered`.
`cancelled` z dowolnego stanu **poza** `delivered`.
Cofanie i przeskoki wstecz — zabronione. Walidacja w czystej funkcji (testowalna), wywoływana w `updateOrderStatus`. `pending` nie jest celem zmian z panelu (powstaje tylko przy tworzeniu zamówienia).

## Server actions + dostęp do danych

`app/admin/zamowienia/actions.ts` (wszystko za guardem admina, klient `admin`):
- `updateOrderStatus(orderId, newStatus)` — walidacja przejścia → update `status` + `status_updated_at` → `revalidatePath`.
- `updateOrderFulfillment(orderId, { carrier, tracking_number, delivery_cost, delivery_paid })`.
- `updateOrderNote(orderId, note)`.

Odczyt (warstwa danych, np. `app/_lib/admin-orders.ts` lub rozszerzenie `app/_lib/orders.ts`):
- `listOrders({ status?, search?, page })` — z filtrami i paginacją.
- `getOrderDetail(id)` — zamówienie + pozycje (join do `products` po nazwę/zdjęcie) + email (konto/gość).

Snapshot nazwy produktu w `order_items` poza zakresem — czytamy join do `products` (FK `on delete restrict` gwarantuje istnienie; edycja nazwy odbije się na widoku historycznym — akceptowalne na tym etapie).

## Wygaszenie BL (w tym specu)

- `app/api/webhook/route.ts`: usunąć wywołanie `pushOrderToBaseLinker` (i powiązane logowanie); zostawić `markOrderPaid` + increment promo. Ślad „płatność doszła po anulowaniu zamówienia" zamiast w `baselinker_push_error` zapisać do `admin_note` (z prefiksem/oznaczeniem „wymaga ręcznej obsługi").
- Cron `reconcile-bl`: usunąć wpis z `vercel.json` (endpoint może zostać uśpiony).
- Dashboard admina: ukryć kafelek „BaseLinker" (strona `/admin/baselinker` zostaje dostępna pod URL, ale nieeksponowana).
- **Nie** usuwamy: `app/_lib/baselinker*.ts`, `app/admin/baselinker/*`, `app/api/baselinker/*`, kolumn `baselinker_*`, tabeli `baselinker_sync_log`. Pełny cleanup = osobne zadanie po wdrożeniu i sprawdzeniu natywnego obiegu.

## Testy (TDD, vitest — wzorce z `app/_lib/__tests__`)

- Walidacja przejść statusów: dozwolone i zabronione (cofanie, przeskoki, `delivered→*`, `cancelled` z każdego poza `delivered`).
- Format/wyprowadzenie `order_number` (jeśli helper czysty).
- Ewentualna czysta logika budowy filtrów listy.
- Bramki: tsc + eslint(0) + pełny vitest zielony + `next build`.

## Uwaga implementacyjna (Next.js w tym repo)

`AGENTS.md`: ta wersja Next.js ma breaking changes względem wiedzy z treningu — przed pisaniem kodu sprawdzić właściwy przewodnik w `node_modules/next/dist/docs/` (server actions, routing, komponenty). Heed deprecation notices.

## Poza zakresem (świadomie)

- E-maile do klienta o zmianie statusu (osobno, wymaga infrastruktury mailowej).
- Faktury / VAT (podprojekt 3).
- Integracja API kuriera, generowanie etykiet (podprojekt 4).
- Pełne usunięcie kodu i kolumn BL (osobny cleanup).
- Natywne tworzenie produktów (podprojekt 2 — osobny spec).
- Snapshot nazwy/wariantu w `order_items`.
- Twardy limit użycia kodów rabatowych, refundy w Stripe z poziomu panelu.
