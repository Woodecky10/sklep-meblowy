# Płynne filtry na /sklep (opóźnienie ~1 s przy klikaniu) — design

Data: 2026-07-05. Zatwierdzone przez użytkownika.

## Kontekst i problem (root cause z pomiarów)

Zgłoszenie: klik w filtr (np. tkaninę) i wyszukiwanie reagują z ~1 s opóźnieniem;
„powinno być płynne". Dowody (workflow śledczy, 2026-07-05):

**Pomiary prod (mediany TTFB, rozgrzane):** `/sklep` = 1,20 s;
`/sklep?tkanina=Poso` = 1,12 s; `/sklep?kolor=bez` = 0,42 s. Dev-trace: ~99%
czasu żądania to application-code (data-fetch + render RSC); middleware/proxy
< 1 ms — NIE jest wąskim gardłem.

**Przyczyna 1 — zero natychmiastowego feedbacku (percepcja).**
`FilterBar.tsx` robi gołe `router.push` (update():122-128) bez
`useTransition`/`isPending`; podświetlenie chipów/suwaka/sortu liczone
WYŁĄCZNIE z `useSearchParams` (61-66), który aktualizuje się dopiero po
nadejściu odpowiedzi RSC. W `app/**` nie ma ŻADNEGO `loading.tsx`; jedyny
`Suspense` (wokół FilterBar) jest bez fallbacku. SearchBox po submit zamyka
modal i nic nie sygnalizuje (112-129). Repo ZNA wzorzec `useTransition`
(~20 miejsc: koszyk, admin) — brak go tylko na tej ścieżce.

**Przyczyna 2 — każdy klik = w pełni dynamiczny render z ~7–10 zapytaniami
do Supabase.** Strona dynamiczna przez `searchParams`+`headers()`+`cookies()`.
Niecachowane per klik: products (select \*, count exact), **facety = 2 pełne
skany tabeli products z ciężkim JSON `variants` co żądanie** (products.ts
getFilterFacets), oceny, kurs EUR (tylko `react cache` per request), wishlist.
Druga paczka (`Promise.all` #2: ratings/wishlist/eurRate) czeka SEKWENCYJNIE
na pierwszą. Cachowane 300 s są tylko: kategorie/sekcje/kolekcje/fabrics.
Zalogowany user (admin) płaci w middleware dodatkowo 1–2 sieciowe cale auth
per klik (`auth.getUser()`); anonimowy gość — 0.

## Decyzje projektowe

1. **Dwutorowo:** natychmiastowy feedback UI (A) + realne cięcie latencji (B).
   Samo B nie wystarczy (nawet 400 ms bez feedbacku czuć jako zacięcie);
   samo A maskowałoby wolny backend.
2. **Poza zakresem:** optymalizacja auth w middleware dla zalogowanych
   (ryzyko dla odświeżania sesji; goście tego nie płacą); paginacja
   (server-linki, niezgłaszana); PPR/streaming (duża zmiana architektury).

## A. Natychmiastowy feedback (FilterBar + SearchBox)

### FilterBar.tsx — useTransition + optymistyczny stan URL

- `const [isPending, startTransition] = useTransition()` oraz lokalny stan
  `const [pendingQuery, setPendingQuery] = useState<string | null>(null)`.
- `update()` (i przez to `toggleMulti()`, sort, toggle „dostępne", debounce
  ceny — wszystkie ścieżki nawigacji w komponencie) przechodzi przez wspólny
  helper: zbuduj `next = params.toString()`, `setPendingQuery(next)`,
  `startTransition(() => router.push(localizeHref(...)))`.
- **Źródło prawdy dla UI:** `const effectiveParams = new URLSearchParams(
  pendingQuery ?? searchParams.toString())` — WSZYSTKIE selected\*
  (kategoria, kolekcja, sort, dostepne, kolor, tkanina) czytane z
  `effectiveParams` zamiast z `searchParams`. Efekt: kliknięty chip/suwak/
  checkmark sortu/ActiveChip zaznacza się NATYCHMIAST.
- Zwolnienie stanu: `useEffect` — gdy `searchParams.toString()` się zmieni
  (nawigacja zatwierdzona), `setPendingQuery(null)`. Szybkie wieloklikanie:
  każdy klik nadpisuje `pendingQuery` (ostatni wygrywa — spójne z tym, że
  transitions się łączą).
- **Wskaźnik ładowania:** cienki animowany pasek (kolor `--color-gold`,
  animacja pulse/indeterminate) na dolnej krawędzi kontenera FilterBar,
  widoczny gdy `isPending || pendingQuery !== null`. Dodatkowo
  `aria-busy={isPending}` na kontenerze. (FilterBar nie ma dostępu do siatki
  produktów — sygnalizuje we własnym obszarze; optymistyczne chipy + pasek
  wystarczą jako „płynność".)
- Inputy ceny: bez zmian logiki debounce (500 ms), ale ich nawigacja idzie
  przez wspólny helper → pasek pending też się pokazuje.

### SearchBox.tsx — pending przy nawigacji do wyników

- `submit()` przechodzi na `startTransition(() => router.push(...))`;
  modal NIE zamyka się od razu — pokazuje istniejący tekst `t.search.searching`
  („Szukam…") / zablokowany input, a zamyka się w `useEffect`, gdy pending
  opadnie (ref `wasPending`: `if (wasPending.current && !isPending) close()`).
- Klik w sugestię (goToProduct) — ten sam wzorzec (pending na liście sugestii).

## B. Cięcie realnej latencji

### B1. Cache facetów (największy zysk: znikają 2 pełne skany per klik)

- Nowa cachowana funkcja źródłowa (products.ts):
  `getFacetSource()` → `unstable_cache(..., ["facet-source"],
  { tags: [FACETS_CACHE_TAG], revalidate: 300 })` zwracająca surowe,
  locale-NIEZALEŻNE dane: `{ colorRows: {value, value_de}[],
  fabricFacetRows: {value, value_de}[] }` (rodziny tkanin już wyliczone
  przez `deriveFabricFamilies` × `getAllFabrics` + legacy pary material).
- ⚠️ Wewnątrz `unstable_cache` NIE wolno używać `cookies()` → zamiast
  `createClient()` (SSR, cookies) użyć **czystego anon klienta bez cookies**
  (`createClient(URL, ANON_KEY)` z `@supabase/supabase-js`) — RLS widzi
  dokładnie to co gość (tylko `is_active`). Bonus: naprawia to też caveat
  „zalogowany admin widział w facetach materiały produktów ukrytych".
- `getFilterFacets(locale)` = cachowane źródło + `buildLocalizedFacets`
  per request (czysta, tania lokalizacja/sortowanie).
- **Inwalidacja:** `FACETS_CACHE_TAG = "facets"` + `invalidateFacetsCache()`
  (wzorzec `invalidateFabricsCache`, `revalidateTag(tag, "max")`). Wołana w
  akcjach admina mutujących produkty/tkaniny: `updateProductBasics`,
  `updateProductVariants`, `createProduct`, `deleteProduct`, toggle
  aktywności produktu oraz akcje `/admin/tkaniny` (zapis/usunięcie tkaniny).
  Efekt: w praktyce zero widocznej nieświeżości; 300 s revalidate to tylko
  siatka bezpieczeństwa na edycje bezpośrednio w DB.

### B2. Cache kursu EUR

- `getEurRate()` (store-settings.ts): opakować w `unstable_cache` z tagiem
  (np. `EUR_RATE_CACHE_TAG = "eur-rate"`, revalidate 300) — analogicznie
  bez `cookies()` w środku (czysty anon/admin klient wg wzorca pliku).
- Inwalidacja `revalidateTag` w akcji admina zapisującej kurs (plik akcji
  ustawień kursu — zidentyfikować w planie).

### B3. Spłaszczenie wodospadu zapytań (page.tsx)

- `getUserWishlistIds()` i `getEurRate()` NIE zależą od listy produktów —
  przenieść z drugiego `Promise.all` do pierwszego. W drugim zostaje tylko
  `getRatingsForProducts(products.map(...))` (naprawdę zależny). Usuwa
  jeden pełny łańcuch RTT.

### Świadomie zostaje (udokumentowane)

- Prefetch id dla `?tkanina=` (+~50 ms) — poprawność filtra > mikro-zysk.
- Główne zapytanie products bez cache — świeżość listy (ceny/promocje) jest
  krytyczna (Omnibus), a `revalidatePath("/sklep")` nie czyści
  `unstable_cache`.

## Testy / weryfikacja

- Czyste funkcje: jeśli wydzielimy budowę surowych wierszy facetów do czystej
  funkcji (products.ts) — pokryć testem kształt `{value, value_de}` i unie
  rodzin+legacy (rozszerzenie istniejących testów fabric-filter NIE jest
  wymagane — logika rodzin już pokryta).
- **Playwright (publiczne, bez logowania)** `e2e/filter-pending.spec.ts`:
  na dev, z dławieniem odpowiedzi `/sklep?*` (route delay ~1,5 s):
  klik w chip tkaniny → chip ma stan aktywny NATYCHMIAST (przed dojściem
  odpowiedzi) + wskaźnik pending widoczny; po dojściu odpowiedzi wskaźnik
  znika. Uruchamiane configiem lokalnym (wzorzec playwright.local.config.ts).
- Pomiar przed/po (curl TTFB, dev): `/sklep` i `/sklep?tkanina=Poso` —
  oczekiwany spadek o koszt facetów (~2 zapytania z JSON variants) + 1 RTT
  z B3. Na prod po deployu: oczekiwane ~1,2 s → ~0,4–0,6 s TTFB.
- Regresja: tsc / eslint / pełny vitest / build; smoke curl jak przy filtrze
  tkanin (Poso/sztruks/Stoff) — cache nie może zmienić WYNIKÓW, tylko czas.

## Nie-cele (YAGNI)

- Optymalizacja middleware auth dla zalogowanych; paginacja; PPR/streaming;
  loading.tsx (zachowanie z searchParams-nawigacjami niepewne w Next 16 —
  wskaźnik oparty o useTransition jest deterministyczny); cache głównego
  zapytania produktów; wirtualizacja siatki.

## Gałąź i wdrożenie

- Gałąź `feat/plynne-filtry` od `main` (0c724b1). Zero migracji DB.
- AGENTS.md: przy wątpliwościach o API Next (unstable_cache/revalidateTag/
  useTransition z routerem) czytać `node_modules/next/dist/docs/` — plan ma
  wskazać konkretne pliki docs dla implementerów.
- Po implementacji: weryfikacja + pomiary, merge do main, push (deploy),
  pomiar kontrolny TTFB na prod.
