# Spec: utwardzenie synchronizacji BaseLinker

- **Data:** 2026-06-07
- **Autor:** Mikołaj (+ Claude, brainstorming)
- **Status:** zaakceptowany design, przed planem implementacji
- **Branch docelowy:** do ustalenia przy planie (sugestia: `feat/bl-sync-hardening`)

## 1. Cel i kontekst

Mechanizm synchronizacji produktów BaseLinker → Supabase (`app/_lib/baselinker-sync.ts`,
funkcja `syncProductsFromBaseLinker`) jest dziś uruchamiany **ręcznie** z panelu
(`/admin/baselinker`, przycisk „Synchronizuj teraz") lub przez zabezpieczony sekretem
endpoint `/api/baselinker/sync-products`. Pull jest pełny (wszystkie magazyny, wszystkie
strony), mapuje pola BL, parsuje warianty i sekcje opisu, a merge zachowuje ręczne edycje
admina (zdjęcia per wariant, override nazw, custom sekcje, CASE wartości).

Ten spec utwardza ten mechanizm w trzech filarach (bez wprowadzania crona — automatyzacja
pozostaje poza zakresem):

1. **Sprzątanie usunięć** — produkt znikły z BL ma być automatycznie ukrywany (odwracalnie),
   a nie zostawać „duchem" w sklepie na zawsze.
2. **Niezawodność** — brak utraty ręcznych danych admina, czytelne rozróżnienie błędów
   „do poprawienia przez właścicielkę" vs „bug techniczny", auto-retry błędów przejściowych BL.
3. **Jakość parsera** — mniej produktów wpadających w brzydki fallback, ładniejsze nazwy
   wariantów, lepsze mapowanie sekcji opisu.

### Wybrane podejście

**Podejście A (chirurgiczne)** — punktowe zmiany w istniejącym `syncProductsFromBaseLinker`
bez przebudowy architektury, z jednym zapożyczeniem z podejścia „fazowego": destrukcyjny
krok ukrywania wydzielony jako **czysta, testowalna funkcja** `planDeactivations`.

### Zasada nadrzędna projektu (z AGENTS.md / pamięci)

Panel admina obsługuje **nietechniczną właścicielkę** — komunikaty po polsku, zero kodu/HTML
w polach, sensowne defaulty, akcje odwracalne. Wszystkie nowe elementy UI muszą trzymać ten
poziom. Produkty są źródłowo zarządzane w BaseLinkerze (BL = source of truth); sklep czyta.

## 2. Stan obecny (fakty z kodu)

- `Product` (`app/_lib/types.ts`) **nie ma** flagi widoczności (`is_active`/`hidden`/`archived`).
- BL **nie ma** per-produkt flagi „opublikowany" — produkt jest w magazynie albo go nie ma.
  „Zniknął z BL" = produkt w naszej DB z `baselinker_id`, którego nie było w pełnym pobraniu.
- Publiczne zapytania o produkty (`getProducts`, `getProduct`, `getCrossSellProducts`,
  `getFeaturedProducts`, `getRelatedProducts`, `getFilterFacets` w `products.ts`;
  `collections.ts`; `featured.ts`; `app/api/search/suggest/route.ts`; `app/sitemap.ts`) idą
  przez `createClient` z `./supabase/server` (klient SSR związany z RLS).
- Sync używa `createAdminClient` (service role) — omija RLS, widzi i zapisuje wszystko.
- Panel admina (rola `admin` w JWT) czyta przez RLS z polityką „admin all" (konwencja repo).
- `blRequest` (`app/_lib/baselinker.ts`) rzuca `BaseLinkerError(method, error_code, message)`
  przy `status: "ERROR"` i zwykły `Error` przy HTTP != ok. Brak retry.
- Istnieje tabela logów `baselinker_sync_log` + paski coverage (sekcje, warianty) w panelu.
- Istniejący „BLOCKER FIX": gdy BL chwilowo nie zwróci wariantów, a DB je ma — stare warianty
  są zachowywane (nie nadpisujemy `null`-em), z wpisem do `skipped`.
- Ostatnia migracja: `22_product_description_sections.sql` → nowa będzie `23_`.
- **Brak runnera testów** — `package.json` ma tylko `dev`/`build`/`start`/`lint`.

## 3. Zakres (co robimy / czego nie)

**W zakresie:**
- Kolumna `is_active` + widoczność przez RLS + 404 dla ukrytych.
- Auto-ukrywanie znikłych produktów z bezpiecznikami + raport + auto-reaktywacja.
- Ręczny toggle Ukryj/Przywróć w `/admin/produkty`.
- Auto-retry odczytów BL (backoff), kategoryzacja błędów (`owner`/`technical`).
- Ulepszenia parsera wariantów i mapowania sekcji opisu (konserwatywne).
- Vitest + testy jednostkowe czystych funkcji.

**Poza zakresem (świadomie):**
- Cron / automatyczne uruchamianie (sync zostaje ręczny).
- Nowy kanał alertów (mailer) — odrzucone, bo brak skonfigurowanego mailera, a przy
  ręcznym triggerze wynik widać od razu w panelu.
- Twarde usuwanie produktów z DB (odrzucone — ryzyko FK z `order_items`, brak cofnięcia).
- Migracja Stripe → Przelewy24 (osobny, niezależny temat).
- Sync statusów zamówień BL → `orders` (osobny temat).

## 4. Projekt szczegółowy

### 4.1. Model danych i widoczność — `is_active`

**Migracja `supabase/migrations/23_products_is_active.sql`:**
- `alter table products add column is_active boolean not null default true;`
- `create index ... on products (is_active) where is_active = false;` (ukrytych mało — szybki
  lookup w adminie).
- **RLS jako jedyny punkt egzekwowania widoczności publicznej:** polityka publicznego
  SELECT-a (anon/public) dostaje warunek `using (is_active = true)`; polityka roli `admin`
  zostaje `using (true)`. Skutek: listingi, wyszukiwarka, sitemap, kolekcje, featured,
  cross-sell, related — automatycznie pomijają ukryte, bez zmian w 9+ zapytaniach.
- Implementacja musi **podmienić** istniejącą politykę publicznego SELECT-a (znaleźć jej
  dokładną nazwę w dotychczasowych migracjach), a nie tworzyć drugą równoległą.

**Zmiany w typie:** `Product.is_active: boolean` w `app/_lib/types.ts` (+ `Insert`/`Update`).

**Strona produktu:** `getProduct(id)` dla ukrytego (RLS) zwróci `null` → `app/produkt/[id]/page.tsx`
renderuje 404. Klient nie wejdzie ukrytym deep-linkiem.

**Decyzja:** widoczność egzekwowana w RLS (nie przez rozsiane `.eq("is_active", true)`).
Jedyny dodatkowy filtr jawny dopisujemy tam, gdzie zapytanie używałoby klienta service-role
(dziś: tylko sync — który celowo ma widzieć ukryte).

### 4.2. Bezpieczne auto-ukrywanie

**Nowa czysta funkcja** (w `baselinker-sync.ts`, eksportowana dla testów):

```
planDeactivations(
  dbBlProducts: { baselinker_id: string }[],   // aktywne produkty z DB mające baselinker_id
  seenBlIds: Set<string>,                       // baselinker_id widziane w tym pełnym pobraniu
  guards: { completedFully: boolean; maxRatio: number; maxAbsoluteFloor: number }
): { toDeactivate: string[]; skippedReason: string | null }
```

**Reguły (wszystkie muszą przejść, inaczej `toDeactivate = []` + `skippedReason`):**

1. **Tylko po kompletnym pobraniu.** Jeśli `completedFully === false` (którekolwiek
   wywołanie listy/danych BL padło po wyczerpaniu retry albo paginacja się urwała) →
   krok ukrywania pomijany w całości. To gwarancja anty-data-loss / anty-mass-hide.
2. **Tylko produkty z `baselinker_id`.** Produkty dodane ręcznie (bez `baselinker_id`)
   nigdy nie są kandydatami do ukrycia.
3. **Próg anty-masowy.** Kandydaci do ukrycia = aktywne produkty BL z DB, których
   `baselinker_id` nie ma w `seenBlIds`. Jeśli liczba kandydatów przekracza
   `max(maxRatio * |aktywne produkty BL|, maxAbsoluteFloor)` → **nie ukrywamy automatycznie**,
   ustawiamy `skippedReason` w stylu „podejrzanie dużo (N) produktów do ukrycia — sprawdź BL
   i potwierdź ręcznie". **Defaulty:** `maxRatio = 0.20` (20%), `maxAbsoluteFloor = 5`
   (poniżej 5 sztuk próg procentowy się nie aktywuje — przy małym katalogu 20% to ułamek
   produktu).

**Zastosowanie w `syncProductsFromBaseLinker`:**
- W trakcie pętli zbieramy `seenBlIds` (wszystkie `blId` przetworzone z sukcesem upsertu)
  oraz flagę `completedFully` (czy każda lista/dane każdego magazynu pobrały się w całości).
- Po pętli wszystkich magazynów: pobieramy aktywne produkty BL z DB (service role),
  wołamy `planDeactivations`, i dla `toDeactivate` robimy batchowy `update is_active=false`.
- **Auto-reaktywacja:** każdy upsert produktu widzianego w BL ustawia `is_active = true`
  (produkt, który wrócił do BL, automatycznie wraca do sklepu). Realizowane przez dopisanie
  `is_active: true` do mapowanego rekordu w `mapBlToProduct`/upsert — bez osobnej logiki.

**Raport (rozszerzenie `SyncOutcome`/wyniku):**
- `deactivated: SyncedProduct[]` — co ukryto (id BL + nazwa).
- `reactivated: SyncedProduct[]` — co wróciło i zostało przywrócone.
- `hide_skipped_reason: string | null` — gdy próg wstrzymał ukrywanie.
- Zapisywane do `baselinker_sync_log.results` i pokazywane w panelu jako osobne sekcje.

### 4.3. Niezawodność

**Auto-retry odczytów BL** (`app/_lib/baselinker.ts`):
- `blRequest` dostaje opcjonalny parametr `retry` (np. `{ attempts: 3, baseDelayMs: 500 }`,
  backoff 0.5s → 1s → 2s).
- Ponawiamy **tylko błędy przejściowe:** HTTP 5xx, błędy sieci/timeout, oraz `BaseLinkerError`
  z kodem rate-limit. Pozostałe `BaseLinkerError` (np. zły token, zła metoda) → fail-fast.
  Dokładny kod rate-limit BL zweryfikować przy implementacji; do tego czasu zbiór kodów
  przejściowych trzymać w jednej, łatwej do uzupełnienia stałej.
- **Retry włączony tylko dla odczytów** używanych w sync (`getInventories`,
  `getInventoryProductsList`, `getInventoryProductsData`) — są idempotentne.
  `push-order` (zapis zamówienia) **bez retry** — ponawianie mogłoby zdublować zamówienie.
- Jeśli odczyt nie uda się po wyczerpaniu prób → wyjątek propaguje, `completedFully = false`,
  sync kończy się `ok: false` (`where: "BaseLinker API"`) i **nie wykonuje ukrywania**.
  Upserty, które zdążyły się wykonać, zostają (są wyłącznie addytywne — nic nie tracą).

**Kategoryzacja błędów:**
- `SyncSkippedProduct` dostaje pole `kind: "owner" | "technical"`.
  - `owner` (właścicielka poprawia w BL): brak nazwy, brak ceny / cena 0, brak kategorii w BL,
    kategoria BL niezmapowana.
  - `technical` (do Mikołaja): błąd zapisu do DB, nieoczekiwany wyjątek mapowania.
  - Istniejący wpis „BL nie zwrócił wariantów, zachowano stare" pozostaje informacyjny
    (klasyfikacja: `owner` — do sprawdzenia konfiguracji wariantów w BL).
- Panel grupuje pominięte w dwie sekcje z różnym wordingiem:
  „Do poprawienia w BaseLinkerze" vs „Błąd techniczny — zgłoś Mikołajowi".

**Gwarancja braku utraty danych admina:**
- Zostaje istniejący `mergeVariantsPreserveAdminEdits` (zdjęcia/case/overrides) oraz
  `mergeSectionsPreserveAdminImages` (image-sekcje, override, custom).
- Jedyny destrukcyjny krok (ukrywanie) jest zablokowany przy niekompletnym pobraniu (4.2 reguła 1).

### 4.4. Jakość parsera

**Warianty (`parseVariantsFromBl` + helpery):**
- **Tolerancyjny tryb strukturalny:** grupowanie kluczy case-insensitive + trim, żeby
  „Kolor:" i „kolor :" traktować jako tę samą opcję; drobne niespójności nie zrzucają całego
  produktu do fallbacku. Wymóg spójnego zestawu kluczy między kombinacjami pozostaje
  (siatka opcji musi być spójna), ale dopasowanie kluczy jest znormalizowane.
- **Strip wspólnego prefiksu *i* sufiksu:** dziś tylko prefiks. Dodać wspólny sufiks, np.
  „Sofa Boston - Lewa - tkanina X" / „Sofa Boston - Prawa - tkanina X" → „Lewa"/„Prawa".
  Próg długości analogiczny do `PREFIX_THRESHOLD`.
- **Szersze słowniki:** rozszerzyć `COLOR_KEYWORDS`; dodać detekcję **materiału**
  (welur, plusz, ekoskóra, sztruks, boucle/boucle, plecionka, len, mikrofibra…) →
  `detectOptionName` zwraca „Materiał", gdy wszystkie wartości pasują do słownika materiałów.
  Reguła konserwatywna bez zmian: wszystkie wartości muszą pasować do typu, inaczej „Wariant".

**Sekcje opisu (`extractDescriptionSections`):**
- Mapowanie pól → sekcje wyjąć do czytelnej stałej konfiguracyjnej (już jest
  `DESCRIPTION_SECTION_LABELS` — utrzymać/rozbudować jako jedyne źródło konwencji).
- Szersze wzorce wykrywania „Informacje dla klienta" (`INFO_SECTION_PATTERNS`) + skan
  wszystkich niespożytych `text_fields` po nagłówkach sekcji (nie tylko jeden wzorzec).
- **Siatka bezpieczeństwa:** istniejący edytor override per-produkt
  (`admin_title`/`admin_body`/`hidden`/`admin_custom`) pozostaje gwarantowanym sposobem
  ręcznej korekty, gdy heurystyka się myli.

**Zasada konserwatywna:** wszystkie zmiany parsera mają **nie psuć** tego, co dziś parsuje się
poprawnie. Testy regresyjne na obecnych przypadkach są obowiązkowe.

### 4.5. Testy i runner

- Dodać **Vitest** (devDependency) + skrypt `test` w `package.json` + `vitest.config.ts`.
- Konfiguracja musi współgrać z Next 16 / React 19 / TS — zgodnie z AGENTS.md doczytać
  `node_modules/next/dist/docs/` przed konfiguracją.
- Testy jednostkowe czystych funkcji (TDD — testy najpierw):
  - `parseVariantsFromBl` — strukturalne / fallback / none / tolerancyjne klucze /
    prefix+suffix / detekcja Kolor/Rozmiar/Materiał / dedup kombinacji.
  - `mergeVariantsPreserveAdminEdits` — zachowanie CASE admina, zachowanie zdjęć po zmianie
    case, drop wartości spoza BL.
  - `extractDescriptionSections` — mapowanie pól, wykrywanie „Informacje dla klienta",
    pomijanie pustych sekcji.
  - `planDeactivations` — abort przy `completedFully=false`, próg procentowy, podłoga
    bezwzględna, pomijanie produktów bez `baselinker_id`, poprawny zbiór `toDeactivate`.

## 5. Pliki do zmiany

- `supabase/migrations/23_products_is_active.sql` *(nowy)*
- `app/_lib/types.ts` — `Product.is_active`, pola raportu w typach sync, `SyncSkippedProduct.kind`
- `app/_lib/baselinker.ts` — opcjonalny retry w `blRequest`, zbiór kodów przejściowych
- `app/_lib/baselinker-sync.ts` — `planDeactivations`, krok ukrywania + reaktywacja,
  kategoryzacja `skipped`, ulepszenia parsera i mapowania sekcji
- `app/admin/baselinker/BaseLinkerSyncPanel.tsx` — sekcje „Ukryto"/„Przywrócono"/„Wstrzymano",
  grupowanie pominiętych owner/technical
- `app/admin/baselinker/actions.ts` — przeniesienie nowych pól wyniku
- `app/admin/produkty/page.tsx` — badge „ukryty" + ręczny toggle
- `app/admin/produkty/actions.ts` — akcja `setProductActive(id, active)` (chroniona `requireAdmin`)
- `package.json` + `vitest.config.ts` *(runner testów)*
- Testy: `app/_lib/__tests__/*.test.ts` (lub kolokowane)
- *(weryfikacja, możliwe drobne zmiany)* `app/sitemap.ts`, istniejące polityki RLS produktów,
  `app/produkt/[id]/page.tsx` (404 dla ukrytego)

## 6. Sekwencja implementacji (safest-first)

1. Migracja `is_active` + RLS + typ + 404 + filtr w sitemap/weryfikacja widoczności.
2. Vitest + testy obecnego zachowania parsera/merge (baseline regresji).
3. `planDeactivations` (TDD) + wpięcie kroku ukrywania + reaktywacja + raport.
4. Retry odczytów BL + kategoryzacja błędów.
5. Ulepszenia parsera (warianty: tolerancja + suffix + materiał; sekcje: wzorce/skan).
6. UI panelu (raport ukrytych/przywróconych, grupy błędów) + toggle Ukryj/Przywróć w produktach.

Po każdym kroku: `npm run build` + `npm test` muszą przejść; diff do review przed kolejnym
(workflow per-punkt, zgodnie z preferencją użytkownika).

## 7. Ryzyka i mitygacje

- **Mass-hide na wadliwym pobraniu** → bezpiecznik `completedFully` + próg 20%/podłoga 5.
- **Retry dubluje zapis** → retry tylko dla odczytów; `push-order` bez retry.
- **Regresja parsera** → testy baseline na obecnych przypadkach przed zmianami.
- **RLS: druga równoległa polityka zamiast podmiany** → najpierw zidentyfikować i podmienić
  istniejącą politykę publicznego SELECT-a.
- **Konfiguracja Vitest z Next 16/React 19** → doczytać docs Next przed konfiguracją.

## 8. Kryteria akceptacji

- Produkt usunięty z BL po sync ma `is_active=false`, znika z listingów/wyszukiwarki/sitemap,
  jego strona daje 404, ale rekord i historia zamówień zostają; powrót do BL → automatyczna
  reaktywacja.
- Przy niekompletnym pobraniu BL (symulowany błąd) sync **nie ukrywa** żadnego produktu.
- Gdy do ukrycia kwalifikuje się > próg — sync nie ukrywa, raportuje powód.
- Przejściowy błąd BL jest ponawiany; trwały — kończy sync czytelnym błędem, bez ukrywania.
- Pominięte produkty są w panelu rozdzielone na „do poprawienia w BL" i „błąd techniczny".
- Parser: brak regresji na obecnych przypadkach; nowe przypadki (suffix, materiał, tolerancja
  kluczy) pokryte testami.
- `npm test` zielony; `npm run build` przechodzi.

## 9. Open items (nie blokują)

- **Realne przykłady z BL** (3–4 nazwy wariantów / układy pól, które parser psuje) →
  pozwolą dostroić heurystyki precyzyjniej niż konserwatywne defaulty. Do dostarczenia przez
  użytkownika; w międzyczasie strojenie konserwatywne + override.
- Dokładny kod błędu rate-limit BL — do potwierdzenia przy implementacji retry.
- Dokładne nazwy istniejących polityk RLS na `products` — do potwierdzenia przy migracji.
