# Zgłoś problem z zamówieniem (reklamacje) — design

**Data:** 2026-06-25
**Status:** zaakceptowany (brainstorming), czeka na plan implementacji

## Problem

Klient po zakupie nie ma ustrukturyzowanej, podpiętej pod zamówienie ścieżki zgłoszenia
problemu (uszkodzenie, brak elementu, zła sztuka, problem z dostawą). Dziś jest tylko
statyczna strona `/zwroty` + e-mail/telefon na `/kontakt` — reklamacje lądują luzem w
skrzynce, admin nie ma ich w panelu ani nie śledzi statusu. Pre-sprzedażowe „Zapytaj o
produkt" (`InquiryModal` → `product_inquiries`) dotyczy innego etapu i nie ma kontekstu
zamówienia.

Cel: dać zalogowanemu klientowi przycisk **„Zgłoś problem"** na stronie zamówienia,
zbierający kategorię + opis + zdjęcia, podpięty pod zamówienie (i opcjonalnie pozycję),
oraz panel admina do obsługi tych zgłoszeń.

## Decyzje z brainstormingu

- **Zakres:** opcjonalnie pozycja — domyślnie całe zamówienie, klient może wskazać
  konkretną pozycję z listy.
- **Kategoria + opis:** dropdown kategorii (`damage` / `missing` / `wrong` / `delivery`
  / `other`) + pole opisu.
- **Zdjęcia:** 1–5 zdjęć (np. uszkodzenia).
- **Dostępność:** tylko statusy po opłaceniu — `paid`, `processing`, `shipped`,
  `delivered`. NIE dla `pending` (mają anulowanie) ani `cancelled`.
- **Tylko zalogowani:** strona zamówienia jest pod loginem; goście (zamówienia z
  `guest_email`) korzystają z `/kontakt` (poza zakresem tej funkcji).
- **Model danych:** dedykowana tabela `order_issues` + osobny panel `/admin/reklamacje`
  (podejście B — czyste rozdzielenie od zapytań przedsprzedażowych).
- **Bez maili do klienta** — spójne z brakiem infry mailowej; klient widzi potwierdzenie,
  admin kontaktuje się sam (telefon/e-mail z danych zgłoszenia).

## Non-goals (YAGNI)

- Brak maili/powiadomień do klienta.
- Brak ścieżki dla gości (niezalogowanych) — `/kontakt` to pokrywa.
- Brak automatyki zwrotów/refundów ani integracji z `/zwroty` (osobny, ewentualny krok).
- Brak edycji/usuwania zgłoszenia przez klienta po wysłaniu (tylko utworzenie).

## 1. Model danych + storage

Nowa tabela `public.order_issues`:

| kolumna        | typ          | uwagi                                                     |
|----------------|--------------|-----------------------------------------------------------|
| id             | uuid pk      | `default uuid_generate_v4()`                              |
| order_id       | uuid not null| `references orders(id) on delete cascade`                 |
| order_item_id  | uuid         | `references order_items(id) on delete set null`; null = całe zamówienie |
| category       | text not null| `check in ('damage','missing','wrong','delivery','other')`|
| message        | text not null|                                                           |
| photos         | text[] not null default '{}' | publiczne URL-e zdjęć                     |
| status         | text not null default 'new' | `check in ('new','read','replied','closed')`|
| customer_name  | text         | snapshot (z profilu/sesji w chwili zgłoszenia)            |
| customer_email | text not null| snapshot                                                  |
| created_at     | timestamptz not null default now() |                                     |
| updated_at     | timestamptz not null default now() |                                     |

- Indeks: `(status, created_at desc)` pod listę admina + licznik nowych.
- RLS jak `product_inquiries`: **brak polityki anon/authenticated** — insert wyłącznie
  przez server action na service-role; admin czyta/zmienia przez `createAdminClient`
  (service role omija RLS). `alter table ... enable row level security` + brak policy
  publicznej (lub policy admin-all, spójnie z konwencją repo).
- Migracja: `supabase/migrations/38_order_issues.sql` (idempotentna). Człowiek odpala w
  Supabase po wdrożeniu. **Numer 38** (DB jest na 37 po katalogu tkanin).

**Zdjęcia — storage:** reuse istniejącego bucketa `products` (public-read) z prefiksem
ścieżki `order-issues/<orderId>/<timestamp>-<uuid>.<ext>`. **Zero ręcznej konfiguracji**
(bucket już istnieje, upload idzie service-rolem). URL-e nieodgadywalne. (Alternatywa:
dedykowany bucket `order-issues` — wymaga ręcznego utworzenia + polityk; nie wybrana.)

## 2. Flow klienta — `/konto/zamowienia/[id]`

Strona jest server component (mamy `user` z sesji + `order` z `items`/`status`).
Dodajemy nową sekcję (kartę) z przyciskiem **„Zgłoś problem"**, renderowaną tylko gdy
`order.status ∈ {paid, processing, shipped, delivered}`.

`OrderIssueModal` (client, wzorzec jak `InquiryModal` — `useModal`, focus-trap, Escape):
- **Kategoria** — `<select>` z 5 opcji (etykiety zlokalizowane PL/DE).
- **Pozycja** — `<select>`: „Całe zamówienie" (wartość pusta → `order_item_id=null`) +
  każda pozycja zamówienia (wartość = `order_item_id`, etykieta = nazwa produktu +
  ew. wariant). Lista pozycji przekazana propem ze strony (server).
- **Opis** — `<textarea>` (min. 5 znaków, max 2000).
- **Zdjęcia** — input file (accept image/\*, multiple), max 5. Klient: `compressIfNeeded`
  → `uploadIssuePhoto(fd)` → URL do stanu (miniatury + usuwanie, wzorzec jak galeria w
  `ProductEditor`/`VariantsEditor`). Blokada > 5.
- **Imię/email** — prefill z zalogowanego usera (email z sesji; imię z profilu jeśli
  jest). Pola ukryte/readonly — wysyłane jako snapshot.
- Sukces: komunikat „Dziękujemy — zajmiemy się zgłoszeniem i skontaktujemy się z Tobą."
  (bez maila). Modal pokazuje stan sukcesu (jak `InquiryModal`).

**Server actions** (w istniejącym `app/konto/zamowienia/actions.ts` — plik akcji
klienckich zamówienia, obok anulowania/reorder):
- `uploadIssuePhoto(formData)` — **gated na zalogowanego usera** (`createClient`+`getUser`;
  brak usera → błąd). Walidacja pliku przez istniejący `validateImageUpload`. Upload do
  `products` bucket pod prefiksem `order-issues/...` przez `createAdminClient`. Zwraca
  `{ ok, url }`. (Analog `uploadProductImage`, ale bez `requireAdmin`, z `getUser`.)
- `submitOrderIssue(formData)` — `createClient`+`getUser` (musi być zalogowany);
  **weryfikuje własność**: `order_id` istnieje i `orders.user_id == user.id` (anty-
  podszywanie pod cudze zamówienie). Walidacja: kategoria z dozwolonych, opis ≥ 5 znaków,
  `photos` ≤ 5 i każde to string-URL, `order_item_id` (jeśli podany) należy do tego
  zamówienia. Insert przez `createAdminClient`. Snapshot `customer_email` z sesji,
  `customer_name` z profilu. Zwraca `ActionResult`-podobne (PL/DE komunikat).

## 3. Flow admina — `/admin/reklamacje`

- Data layer `app/_lib/order-issues.ts`:
  - `type OrderIssue` (+ `OrderIssueStatus`, `OrderIssueCategory`).
  - `getAllOrderIssues()` — lista, najnowsze pierwsze, z dołączonym kontekstem zamówienia
    (`order_number`, status) i nazwą pozycji (join `orders` + `order_items`+`products`).
  - `getNewOrderIssuesCount()` — liczba `status='new'` (badge w nawigacji).
- Strona `app/admin/reklamacje/page.tsx` + `ReklamacjeList.tsx` (wzorzec `/admin/zapytania`
  + `InquiriesList`): lista z kategorią (etykieta PL), której pozycji dotyczy (lub „całe
  zamówienie"), opisem, **miniaturami zdjęć** (klik → pełny rozmiar/nowa karta), danymi
  klienta, **linkiem do zamówienia** `/admin/zamowienia/[id]`, oraz przełącznikiem statusu.
- Actions `app/admin/reklamacje/actions.ts`: `setOrderIssueStatus(id, status)` (`requireAdmin`,
  `createAdminClient`, `revalidatePath`). Wzorzec jak `app/admin/zapytania/actions.ts`.
- Nawigacja: pozycja **„Reklamacje"** w `app/admin/layout.tsx` (po „Zapytania") + licznik
  nowych (z `getNewOrderIssuesCount`) — render licznika tylko gdy > 0.

## 4. i18n + brak maili

- Storefront PL+DE: etykiety kategorii, chrome modala, komunikaty sukcesu/błędu — nowa
  sekcja w słownikach (`t.orderIssue.*`), wzorzec `t.inquiry.*`. Dynamiczne komunikaty z
  server action zlokalizowane przez `getLocale()` (jak `submitInquiry`).
- Panel admina: PL (jak `/admin/zapytania`).
- Kategorie: klucz w DB (`damage`…), etykieta z mapy PL/DE w słowniku (czysty helper
  `orderIssueCategoryLabel(category, locale)`).
- Zero maili — brak jakiejkolwiek wysyłki do klienta/admina; obieg przez panel.

## 5. Edge cases

- Status spoza dozwolonych → sekcja/przycisk nie renderuje się (gate na serwerze).
- Niezalogowany wywołuje `uploadIssuePhoto`/`submitOrderIssue` bezpośrednio → odrzucone
  (brak `getUser`).
- `order_id` cudzego usera → odrzucone (ownership check).
- `order_item_id` spoza zamówienia → odrzucone (walidacja przynależności).
- > 5 zdjęć albo zły typ pliku → odrzucone (klient blokuje + serwer waliduje).
- Usunięcie zamówienia → `order_issues` kaskaduje (CASCADE); usunięcie pozycji →
  `order_item_id` SET NULL (zgłoszenie zostaje jako „całe zamówienie").

## 6. Testy

- Czyste helpery (jednostkowe, bez DB):
  - walidacja submitu: kategoria z dozwolonych, opis min. długość, ≤ 5 zdjęć, kształt
    payloadu (czysta funkcja `validateOrderIssueInput`, używana przez action).
  - `orderIssueCategoryLabel(category, locale)` — PL/DE + fallback.
  - budowa etykiety pozycji z `OrderItem` (nazwa + wariant).
- Reszta (server actions, strony, modal, upload) — `tsc`/`lint`/`build` + weryfikacja
  manualna. Bramki zielone (tsc 0, lint 0, pełny vitest, build).

## Kolejność wdrożenia (dla planu)

1. Migracja `38_order_issues.sql` + typy `OrderIssue`/status/category w `types.ts`.
2. Czyste helpery (`validateOrderIssueInput`, `orderIssueCategoryLabel`, etykieta pozycji)
   + testy.
3. Data layer `app/_lib/order-issues.ts` (server: getAll/getNewCount).
4. Server actions: `uploadIssuePhoto` (gated na usera) + `submitOrderIssue` (ownership +
   walidacja).
5. Storefront: słownik `t.orderIssue.*`, `OrderIssueModal`, wpięcie sekcji w
   `/konto/zamowienia/[id]` (gate na status).
6. Admin: `/admin/reklamacje` (page + ReklamacjeList + actions) + link/licznik w nawigacji.
7. Testy + bramki.

**Deploy:** migracja 38 odpalana ręcznie w Supabase (jedna instancja = produkcyjna; patrz
pamięć ops — `next dev` pisze do prod). Bez nowego bucketa (reuse `products`).
