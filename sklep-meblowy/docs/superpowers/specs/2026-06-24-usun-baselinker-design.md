# Projekt: pełne wycięcie BaseLinkera

**Data:** 2026-06-24
**Status:** zaakceptowany (Mikołaj). Spec do przeglądu przed planem implementacji.
**Powiązane:** wycofanie BaseLinkera (podprojekty 1–4, [[baselinker-removal-2026-06-17]]); ceny EUR na /de (PR #42 — warunek wstępny #4 „wyłącz push BL" zostaje spełniony tą zmianą).

---

## 1. Kontekst (stan obecny)

BaseLinker (BL) jest już w ~90% nieaktywny:
- Zmienne env (`BASELINKER_*`, `BL_STATUS_*`, `BASELINKER_SYNC_SECRET`) **puste** → push, sync produktów i sync statusów cicho wyłączone.
- `vercel.json` → `{ "crons": [] }` — cron `reconcile-bl` **nie jest zaplanowany**.
- Brak linku do BL w nawigacji admina (`NAV_ITEMS`, `CARDS`).
- Zero BL w UI zamówień (admin i `/konto`).
- `POST /api/baselinker/sync-products` zwraca `410`.

Pozostałości BL **wciąż obecne w kodzie/bazie**:
- **Widoczne w adminie:** strona `/admin/baselinker` (archiwum, dostępna z bezpośredniego URL), akordeon „Surowe dane z BaseLinker" w `ProductEditor`, mapowanie `baselinker_category_id` w `KategorieEditor`.
- **Kod (uśpiony):** moduły `app/_lib/baselinker*.ts` (5 plików) + 4 pliki testów; routes `app/api/baselinker/*` i `app/api/cron/reconcile-bl`; `pushOrderToBaseLinker` wciąż wywoływalny z route `push-order` i cronu.
- **Baza:** kolumny `products.baselinker_id`, `orders.baselinker_order_id`, `orders.baselinker_push_error`, `categories.baselinker_category_id`; tabela `baselinker_sync_log`.
- **Typy/env:** `Product.baselinker_id` w `types.ts`; zmienne BL w `.env.example`.

## 2. Decyzja

**Pełne wycięcie BL** z kodu, env i bazy. Zachowujemy jedną przydatną, niezwiązaną z BL funkcję, która dziś żyje na stronie BL: **licznik zaległych tłumaczeń DE** (`needs_translation=true`) — przeniesiony w czyste miejsce.

Zmiana destrukcyjna (drop kolumn = utrata historycznych odniesień `baselinker_*` na starych zamówieniach/produktach) — świadomie zaakceptowane. Bezpieczne, bo push nie działa (env puste, cron pusty), więc żadne zamówienie nie jest „w locie" do BL.

## 3. Zakres usunięcia

### 3.1 Moduły kodu (`app/_lib/`)
Usunąć: `baselinker.ts`, `baselinker-sync.ts`, `baselinker-orders.ts`, `baselinker-reconcile.ts`, `baselinker-status-sync.ts` oraz testy: `__tests__/baselinker-retry.test.ts`, `baselinker-orders.test.ts`, `baselinker-reconcile.test.ts`, `baselinker-status-sync.test.ts`.

### 3.2 API / cron
Usunąć katalogi: `app/api/baselinker/` (w tym `sync-products`, `test`, `raw`, `push-order`) oraz `app/api/cron/reconcile-bl/`. (`vercel.json` jest już pusty — bez zmian, chyba że są tam ślady BL.)

### 3.3 Admin UI
- Usunąć cały katalog `app/admin/baselinker/` (po przeniesieniu licznika — patrz §4).
- `ProductEditor.tsx`: usunąć akordeon „Surowe dane z BaseLinker" (warunek `product.baselinker_id`) + komponent/funkcję `BaseLinkerRawSection` + fetch do `/api/baselinker/raw`.
- `KategorieEditor.tsx`: usunąć wyświetlanie `· BL: {baselinkerCategoryId}` i pola edycji `baselinker_category_id`.
- `app/admin/kategorie/actions.ts`: usunąć odczyt/zapis `baselinker_category_id` z akcji kategorii.

### 3.4 Lib kategorii
- `app/_lib/categories.ts`: usunąć odczyty/mapowanie `baselinker_category_id` (martwe po usunięciu syncu produktów). Zachować resztę logiki kategorii nietkniętą.

### 3.5 Typy / env
- `app/_lib/types.ts`: usunąć `Product.baselinker_id` (i ewentualne pola kategorii związane z BL).
- `.env.example`: usunąć blok zmiennych BL (`BASELINKER_API_TOKEN`, `BASELINKER_DEFAULT_STATUS_ID`, `BASELINKER_SYNC_SECRET`, `BL_STATUS_*_IDS`) wraz z komentarzami. (`.env.local` — wartości puste; w planie odnotować, że można je usunąć ręcznie, ale to nie blokuje.)

## 4. Zachowanie licznika tłumaczeń DE

- Wyciągnąć logikę z lokalnej `getPendingTranslationCount()` (`app/admin/baselinker/page.tsx:26`) do współdzielonego, czystego-ile-się-da helpera `app/_lib/translations.ts` → `getPendingTranslationCount(): Promise<number>` (zlicza produkty z `needs_translation=true`; serwerowy, `createAdminClient`/`createClient` zgodnie z istniejącym wzorcem).
- **Lokalizacja widoku:** mała sekcja na dashboardzie `/admin` (`app/admin/page.tsx`), nad/obok siatki `CARDS`: tekst „X produktów czeka na tłumaczenie DE" z linkiem do listy produktów (`/admin/produkty`). Gdy `0` — sekcja może się nie renderować albo pokazać stan „brak zaległości". Panel admina jest PL-only.

## 5. Migracja bazy (uruchamia człowiek, PO deployu kodu)

`supabase/migrations/34_drop_baselinker.sql` — idempotentnie (`if exists`):
- `alter table products drop column if exists baselinker_id;`
- `alter table orders drop column if exists baselinker_order_id, drop column if exists baselinker_push_error;`
- `alter table categories drop column if exists baselinker_category_id;`
- `drop table if exists baselinker_sync_log;`
- (Drop powiązanych indeksów następuje automatycznie wraz z kolumną/tabelą.)

**Kolejność deployu:** najpierw merge + deploy kodu bez BL (żaden kod nie odwołuje się już do tych kolumn), **dopiero potem** uruchomić migrację 34. Odwrotna kolejność też nie crashuje (kod nie czyta tych pól), ale rekomendowana jest „kod → migracja".

## 6. Poza zakresem / ryzyka

- **Utrata danych historycznych** `baselinker_*` — świadoma decyzja. Brak kopii w nowym schemacie (gdyby kiedyś była potrzebna reintegracja, trzeba by od zera).
- **Reintegracja z BL w przyszłości** — ten projekt zakłada, że nie wróci; ewentualny powrót = nowa integracja od podstaw.
- **Migracja 33 (EUR) i 32 (i18n)** to osobne, zaległe deploye — nie mieszać z 34; 34 jest niezależna.
- **PR #42 (EUR)** może po obu mergach dać drobne konflikty w `types.ts` / `app/admin/page.tsx` (oba pliki dotykane przez oba wątki, różne fragmenty) — rozwiązywalne trywialnie przy merdżu.

## 7. Testy / weryfikacja

- `npx tsc --noEmit` 0, `npm run lint` 0, `npm run build` przechodzi.
- `npm test` zielony — **liczba testów spadnie** (znikają 4 pliki testów BL). Dodać krótki test `getPendingTranslationCount` jeśli logikę da się odpiąć od DB (inaczej weryfikacja przez tsc/build + smoke).
- Smoke (ręczny): brak `/admin/baselinker` (404), dashboard pokazuje licznik tłumaczeń DE z linkiem, edytor produktu otwiera się bez sekcji BL (także dla starego produktu z importu), edytor kategorii bez pól BL, sklep/koszyk/checkout działają.
- `grep -ri baselinker app/` po zmianie → brak trafień w kodzie aplikacji (poza ewentualnie docs/migracjami historycznymi).

## 8. Branch / proces

- Gałąź `chore/usun-baselinker` z `main` (niezależna od PR #42).
- Implementacja: plan TDD → wykonanie → review → PR (konto Woodecky10, za zgodą).

---

**Następny krok:** przegląd tego speca → skill `writing-plans` (plan implementacji) → wykonanie.
