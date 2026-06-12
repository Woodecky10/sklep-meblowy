# Dwujęzyczność PL/DE — etap ① (treść + routing + SEO)

**Data:** 2026-06-12
**Status:** zaakceptowany (brainstorming)
**Część programu:** „Sprzedaż w Niemczech" — etap ① z 4.

## Cel

Sklep dostępny w dwóch językach (PL domyślny, DE) z lokalnym SEO na Google.pl
i Google.de. Treść produktów (z syncu BaseLinker + ręcznej edycji w panelu)
ma być **automatycznie tłumaczona PL→DE bez stałych opłat**, z możliwością
ręcznej korekty przez admina.

## Zakres tego spec

Routing locale, przechowywanie tłumaczeń, pipeline tłumaczeń (DeepL), odczyt/render
wg locale, SEO (hreflang/sitemap/meta), override w panelu.

### Poza zakresem (osobne etapy programu — własne spec→plan→wdrożenie)

- **② Ceny w EUR** dla DE (przeliczanie/wyświetlanie waluty, płatność EUR). Ceny w
  tym etapie **zostają w PLN**, formatowane wg locale.
- **③ Niemieckie wymogi prawne**: Impressum (obowiązkowy), Widerrufsbelehrung, AGB,
  DE polityka prywatności. **Maszynowe tłumaczenie polskiego regulaminu NIE spełnia
  niemieckiego prawa** — wymaga osobnej treści/szablonu. Strony legal DE NIE są
  publikowane w tym etapie.
- **④ VAT/OSS** dla sprzedaży do DE (wiąże się z otwartą luką „VAT 23% na sztywno"
  i BaseLinkerem).

## Decyzje (z brainstormingu)

| Temat | Decyzja |
|---|---|
| Struktura URL | PL w korzeniu (`mollien.pl/...`, bez zmian) + DE pod `mollien.pl/de/...`, spięte hreflang |
| Silnik tłumaczeń | DeepL API Free (architektura pluggable — zmiana silnika w jednym miejscu) |
| Zakres auto-tłumaczenia | Produkty (nazwa/opis/sekcje) + etykiety kategorii/sekcji + wartości filtrów (kolor/materiał) + recenzje. UI z ręcznego słownika. |
| Fallback braku DE | Pokaż PL + **wyklucz z sitemap DE / hreflang** dopóki brak DE (żeby Google.de nie indeksował półpolskiej strony) |
| Trigger tłumaczenia | Hybryda: panel (1 encja) inline; sync BL hurtem → sweep/cron |
| Routing — podejście | A: custom-light (middleware rewrite + nagłówek `x-locale`), bez next-intl; storage w kolumnach `_de` |

## Architektura

### 1. Routing i rozpoznanie locale

- **Nowy root `proxy.ts`** (Next 16 zmienił `middleware.ts` → `proxy.ts`, ten sam
  mechanizm): dla `/de` i `/de/:path*` → `NextResponse.rewrite` na ścieżkę bez
  prefiksu (`/de/sklep` → `/sklep`), wstrzykując nagłówek `x-locale: de` przez
  `NextResponse.rewrite(url, { request: { headers } })`. URL w przeglądarce zostaje
  `/de/...`. (Świadomie NIE używamy segmentu `app/[lang]` z guide'a Next — to
  przesunęłoby wszystkie pliki; rewrite+nagłówek zachowuje URL-e PL bez ruszania struktury.)
  Pozostałe ścieżki → locale `pl` (domyślne), bez rewrite. Istniejące URL-e PL
  nietknięte (zero redirectów, SEO PL bez zmian).
- **`app/_lib/i18n.ts`**: `LOCALES = ['pl','de'] as const`, `DEFAULT_LOCALE = 'pl'`,
  `getLocale()` (server — czyta nagłówek `x-locale` przez `headers()`, fallback 'pl'),
  `localizePath(path, locale)` / `stripLocale(path)`.
- **Przełącznik języka** (Navbar/TopBar): link do bieżącej ścieżki z przełączonym
  prefiksem `/de`, zachowując query string.
- **`<html lang>`** w root layout — dynamiczne wg `getLocale()`.
- **Integracja Supabase**: istnieje helper `app/_lib/supabase/middleware.ts`, ale
  brak aktywnego root-proxy/middleware. Nowy `proxy.ts` zhostuje rewrite locale i —
  jeśli wymagane — wywoła odświeżanie sesji Supabase.

> **Zweryfikowane wobec `node_modules/next/dist/docs/` (Next 16):** mechanizm to
> `proxy.ts` (d. middleware), `export function proxy(request)` + `config.matcher`,
> `NextResponse.rewrite(url, { request: { headers } })` do przekazania `x-locale`
> server-side (czytane przez `headers()`). Oficjalny i18n-guide używa `app/[lang]` +
> redirect; my robimy wariant rewrite+nagłówek (zachowuje URL-e PL, zero przesuwania plików).

### 2. Przechowywanie tłumaczeń (model danych)

**Migracja 29** (kolumny `_de`, nullable; brak = fallback do PL):

- `products`: `name_de text`, `description_de text`, `description_sections_de jsonb`,
  `color_de text`, `material_de text`.
- `categories`: `label_de text`. `category_groups`: `label_de text`.
- `product_reviews`: `comment_de text`.
- Śledzenie świeżości na każdej z powyższych tabel:
  `needs_translation boolean not null default true`, `translated_at timestamptz`.

**Odczyt**: `localized(row, locale, field)` → zwraca `row[field+'_de']` gdy `de`
i niepuste, inaczej `row[field]` (PL). Jedno miejsce reguły fallbacku.

**Świeżość (app-level, bez triggerów DB)** — reguła `needs_translation`:
- `=true` przy: insercie, **zmianie pól źródłowych PL**, lub ręcznym „Przetłumacz ponownie".
- `=false` przy: udanym auto-tłumaczeniu (zapis `_de` + `translated_at=now()`) **lub**
  ręcznym zapisie DE w panelu.
- Sweep przetwarza **tylko** wiersze `needs_translation=true`.
- Konsekwencja: ręczne DE jest zachowane, dopóki nie zmieni się źródło PL ani admin
  nie wymusi retłumaczenia. Przy zmianie PL manualne DE może zostać nadpisane przez
  sweep — świadomy trade-off (stare DE i tak nieaktualne wobec nowego źródła).

### 3. Pipeline tłumaczeń (DeepL + triggery)

- **`app/_lib/translate.ts`** — cienki klient DeepL Free
  (`https://api-free.deepl.com/v2/translate`), `DEEPL_API_KEY` z env, source PL →
  target DE. **HTML-aware** (`tag_handling: html`) dla opisów/sekcji, żeby tagi
  HTML przetrwały. Budowanie zapytania (params, flaga HTML, batching wielu pól)
  testowalne przez wstrzyknięty `fetch`.
- **Helpery per encja** (`translateProduct`, `translateCategory`, `translateReview`):
  składają pola PL → DeepL → zwracają wartości `_de`. Dla `description_sections`
  (jsonb): tłumaczą `title/body` (oraz `admin_title/admin_body`) sekcji tekstowych
  i `alt/caption` obrazów; `image_url` i flagi (`hidden`, `admin_custom`) zostają.
- **Triggery (hybryda):**
  - **Inline** — `updateProductBasics`, `updateProductDescriptionSections`, zapis
    kategorii, submit recenzji: po zapisie PL tłumaczą tę jedną encję, zapis `_de`,
    `needs_translation=false`. **Best-effort, nieblokujące** — błąd/limit DeepL NIE
    wywala zapisu (zostaje PL + `needs_translation=true`, sweep dobierze).
  - **Sweep** — hurtowy sync BL tylko **oznacza** nowe/zmienione produkty
    `needs_translation=true` (bez tłumaczenia inline → brak ryzyka timeoutu funkcji
    i limitu tempa). Endpoint `GET /api/cron/translate` (auth jak `reconcile-bl`:
    `Authorization: Bearer $CRON_SECRET` **lub** `x-sync-secret: $BASELINKER_SYNC_SECRET`,
    `safeCompareSecret`) bierze partię flagowanych wierszy (LIMIT/przebieg), tłumaczy,
    zapisuje `_de`, czyści flagę; zwraca podsumowanie + `backlog` przy nadmiarze
    (zero cichego capu). Harmonogram w `vercel.json` (Hobby: raz/dzień; częściej:
    zewnętrzny pinger / `pg_cron` z `x-sync-secret`).
  - **Ręcznie** — przycisk „Przetłumacz ponownie" per produkt + „przetłumacz zaległe"
    w panelu BaseLinker (ta sama ścieżka tłumaczenia).
- **Czysta orkiestracja** (selekcja partii + kategoryzacja `translated/failed/skipped`
  + LIMIT/backlog) wydzielona do testowalnego modułu — wzorzec jak
  `app/_lib/baselinker-reconcile.ts`.

### 4. Odczyt i render wg locale

- **Warstwa danych świadoma locale** (`products.ts`, `categories.ts`, `reviews.ts`,
  facets): czytają `getLocale()` i zwracają pola przez `localized()` (DE z fallbackiem
  PL). `getFilterFacets` na /de agreguje `color_de`/`material_de` (fallback PL).
- **Wyszukiwanie na /de**: `.or()` po `name_de`/`description_de` — **reużywa
  `buildSearchOrFilter`** (ten sam sanitizer z audytu), tylko inne kolumny zależnie
  od locale.
- **Teksty UI**: słownik `app/_lib/dictionaries/{pl,de}.ts` (typowane klucze) + `t(key)`
  wg `getLocale()`. Ręczne tłumaczenie DE (wysoka jakość). Pokrywa nawigację,
  przyciski, puste stany, toasty, checkout-UI.
- **Ceny/liczby/daty**: wartości **PLN** (EUR = etap ②), formatowane wg locale
  (`toLocaleString('de-DE')` vs `'pl-PL'`).
- **Render produktu/recenzji/kategorii** korzysta z pól zlokalizowanych
  (`description_sections_de` → komponent sekcji; `comment_de` → lista recenzji;
  `label_de` → nawigacja/breadcrumb). Imiona autorów recenzji bez zmian.

### 5. SEO

- **hreflang**: każda publiczna strona wystawia `alternates.languages`
  (`pl`, `de`, `x-default`→PL) w `generateMetadata`. Strona/produkt **bez DE**
  (`needs_translation=true` / brak `_de`) → **pomijamy alternate `de`**.
- **Sitemap** (`app/sitemap.ts`): wpisy PL (jak dziś) **+** `/de/...`. Do DE wchodzą:
  strony zakupowe sterowane słownikiem UI (home, sklep) oraz produkty/kategorie/kolekcje
  DE **tylko gdy `needs_translation=false`**. Strony informacyjne/prawne z prozą
  (o-nas, dostawa, zwroty, regulamin, prywatność, kontakt) **NIE** wchodzą do DE w tym
  etapie — ich niemiecka treść powstaje w etapie ③ (razem z wymogami prawnymi DE).
  Wpisy niosą `alternates.languages`. Filtr DE wydzielony do pure-helpera (testowalny).
- **`<html lang>`** per locale; **og:locale** `pl_PL`/`de_DE`.
- **Canonical**: self-referencing per locale (PL→PL, DE→DE). Canonical PL bez zmian.
- **robots.ts**: bez zmian (admin/konto/checkout/koszyk/ulubione już wykluczone;
  ich `/de` i tak poza sitemapą).

### 6. Panel admina (override + status)

- **Override DE**: edytor produktu dostaje sekcję DE z auto-tłumaczeniem
  (`name_de`/`description_de`/sekcje DE) do **ręcznej korekty** (wzorzec jak override
  sekcji opisu z `DescriptionSectionsEditor`). Zapis ręcznej korekty → `needs_translation=false`,
  nie nadpisywany przez sweep; tylko „Przetłumacz ponownie" go zastępuje.
- **Edytor kategorii**: pole `label_de`.
- **Status**: per produkt znacznik „DE: przetłumaczone / oczekuje / błąd"; panel
  BaseLinker pokazuje licznik zaległych + „przetłumacz zaległe".
- **Panel zostaje po PL** (admin nie jest lokalizowany — poza zakresem).

## Testy (zgodnie ze stylem repo — pure helpery w vitest, bez testów komponentów)

- `i18n`: rozpoznanie locale z nagłówka, `localizePath`/`stripLocale`, fallback
  `localized()`.
- `translate.ts`: budowanie zapytania DeepL (params, flaga HTML, batching) przez
  wstrzyknięty `fetch`; obsługa błędu/limitu (zwraca brak DE, nie rzuca w górę).
- Orkiestracja sweepa: selekcja partii, kategoryzacja `translated/failed/skipped`,
  LIMIT/backlog (jak `baselinker-reconcile.test.ts`).
- Sitemap: filtr DE (tylko `needs_translation=false` trafia do wpisów/hreflang DE).
- Smoke-test routingu/renderu — ręcznie (brak infry e2e).

## Env i deploy

- **Env**: `DEEPL_API_KEY` (DeepL Free; rejestracja wymaga podpięcia karty —
  weryfikacja, bez obciążeń w limicie 500k znaków/mc). `CRON_SECRET` /
  `BASELINKER_SYNC_SECRET` już istnieją (reużyte do auth sweepa).
- **Deploy**: migracja 29 (kolumny `_de` + `needs_translation`) na Supabase;
  harmonogram sweepa w `vercel.json` (lub zewnętrzny pinger z `x-sync-secret`).
  Po wdrożeniu jednorazowo „przetłumacz zaległe" dla istniejącego katalogu.

## Ryzyka / otwarte punkty

1. **Middleware/rewrite w Next 16** — sprawdzić docs przed kodem (jedyny realny punkt
   niepewności mechanizmu routingu).
2. **DeepL Free wymaga karty** przy rejestracji (bez obciążeń w limicie) — do
   zakomunikowania właścicielce.
3. **Jakość maszynowego DE** — override admina łagodzi; nazwy/hasła marketingowe
   warto przejrzeć ręcznie.
4. **Wolumen vs limit DeepL** — przy meblach śladowy; sweep i tak respektuje LIMIT
   i raportuje `backlog`.
