# Rozdwojenie apex/www — jeden origin kanoniczny — projekt

**Data:** 2026-08-17
**Źródło zadania:** audyt „Wygląd wyników w Google" w `ONBOARDING.md` (PR #134), punkt 1 oznaczony 🔴 jako błąd, nie kosmetyka.
**Decyzja kierunkowa (wcześniejsza, NIE do odwracania):** `ONBOARDING.md` sekcja „Prod serwuje www, a kod deklaruje apex" (2026-07-30) — **dopasować KOD do `www`**, nie przestawiać Vercela na apex.

## Problem

Serwer i kod mówią o tej samej stronie dwie różne rzeczy.

**Serwer (Vercel, poza kodem — nie ruszamy):** `https://mollien.pl` → **308** → `https://www.mollien.pl`. Klient zawsze ląduje na `www`.

**Kod:** deklaruje **apex**. Zmierzone na produkcji 2026-08-17:

| gdzie | co produkcja deklaruje dziś | powinno |
|---|---|---|
| `<link rel="canonical">` na `/` | `https://mollien.pl` | `https://www.mollien.pl` |
| `og:image` | `https://mollien.pl/og` | `https://www.mollien.pl/og` |
| `sitemap.xml`, pierwsze `<loc>` | `https://mollien.pl/` | `https://www.mollien.pl/` |
| `<g:link>` w `/feed.xml` | `https://mollien.pl/produkt/…` | `https://www.mollien.pl/produkt/…` |

Czyli: serwer odsyła na `www`, a strona po dojściu tam ogłasza, że „tak naprawdę jest" na apex.

### Dlaczego to warto naprawić, choć nie jest awarią

1. **Google to wybacza** — podąża za 308 i sam kanonikalizuje do `www`. `ONBOARDING.md` słusznie notuje, że **nie jest to awaria**. Ale sygnały rozkładają się na dwa hosty, a Google zgaduje tam, gdzie mógłby dostać jednoznaczną odpowiedź.
2. **Merchant Center i Pinterest są mniej wyrozumiałe** — porównują adres z feedu z domeną zaclaimowaną w panelu. Tu niezgodność kończy się odrzuceniem ofert, nie zgadywaniem. **Merchant Center jest uruchomiony i ma zaclaimowany apex** (potwierdzone przez właściciela 2026-08-17). Pinterest ma potwierdzone `www.mollien.pl` (PR #143) i katalog przesłany 2026-08-17 — dla niego ta zmiana jest wyłącznie zyskiem.
3. **`COMPANY.domain` służy dziś DWÓM różnym celom naraz** — jest i origin-em technicznym, i tekstem marki widocznym dla klienta. Kto naprawi origin podmianą tej stałej, zepsuje przy okazji trzy napisy. To główny powód, dla którego to nie jednolinijkowiec.

### Dlaczego `www`, a nie apex

Search Console pokazuje **409 stron zindeksowanych** i kliknięcia od 29.04.2026 — indeks jest ugruntowany pod `www`. Przełączenie hosta wymusiłoby migrację całego indeksu bez żadnego zysku. Rekomendacja w `ONBOARDING.md` została w tej sprawie **zmieniona 2026-07-30** (wcześniej było odwrotnie, przy błędnym założeniu, że nie ma czego chronić w indeksie) — nie odwracać jej po raz trzeci bez nowych danych.

## Czego ten projekt świadomie nie robi

- **Nie rusza konfiguracji domen w Vercelu ani przekierowania 308.** Ono działa poprawnie i jest właściwym miejscem na tę logikę.
- **Nie zmienia `COMPANY.domain`.** Ta stała zostaje `"mollien.pl"` i zostaje tekstem marki.
- **Nie dotyka `/de`.** Zamrożone, przekierowuje 307 (`/de/sklep` → `/sklep`) — sprawdzone 2026-08-17.
- **Nie naprawia braku blokady preview w `robots.ts`.** Obserwacja przy okazji: `robots.ts` zawsze zwraca `allow: "/"`, więc wdrożenia preview są w zasadzie indeksowalne. Pre-existing, osobny temat, świadomie poza zakresem.
- **Nie zmienia wartości awaryjnych `localhost:3000`** w `checkout/route.ts` i `auth-actions.ts` — patrz „Grupa C" niżej, to decyzja, nie przeoczenie.

## Mapa zmiany

Wszystkie 10 użyć `COMPANY.domain` rozdziela się bez wątpliwości.

### Grupa A — origin, PRZESTAWIĆ na `www` (6 miejsc)

| plik:linia | rola |
|---|---|
| `app/layout.tsx:106` | `metadataBase` — źródło canonical, `og:url` i `og:image` dla **wszystkich** stron. Największy zasięg. |
| `app/sitemap.ts:19` | `BASE` — wszystkie URL-e sitemapy |
| `app/robots.ts:7` | `BASE` — link do sitemapy w `robots.txt` |
| `app/_lib/seo-jsonld.ts:10` | `BASE` — JSON-LD Organization + breadcrumby |
| `app/produkt/[id]/page.tsx:210` | `productUrl` — URL produktu w JSON-LD |
| `app/_lib/product-feed.ts:107` | `base` dla `<g:link>` — Merchant Center i Pinterest |

### Grupa B — tekst marki, ZOSTAWIĆ `mollien.pl` (3 miejsca)

| plik:linia | co renderuje |
|---|---|
| `app/(legal)/regulamin/page.tsx:304` | nazwa serwisu w regulaminie |
| `app/og/route.tsx:138` | etykieta `MOLLIEN.PL` na obrazku udostępnień |
| `app/_lib/mail/templates/_Layout.tsx:121` | stopka maili transakcyjnych |

**Te trzy są testem poprawności całej zmiany.** Jeśli po wdrożeniu któreś z nich mówi `www.mollien.pl`, zmiana została zrobiona źle — przez podmianę `COMPANY.domain` zamiast przez nową stałą.

### Grupa C — `NEXT_PUBLIC_APP_URL`, ujednolicić wartości awaryjne

Znalezione przy mapowaniu, audyt tego nie zauważył: **6 miejsc wywołania w 5 plikach, 3 różne wartości awaryjne** — a `.env.example` dokłada czwartą konwencję.

| plik:linia | dziś | po zmianie |
|---|---|---|
| `app/_lib/mail/notify-order.ts:40` | `https://mollien.pl` | `ORIGIN` |
| `app/_lib/mail/notify-order.ts:102` | `https://mollien.pl` | `ORIGIN` |
| `app/_lib/mail/sample-notify.ts:36` | `https://mollien.pl` | `ORIGIN` |
| `app/probki/actions.ts:141` | `https://www.mollien.pl` (na sztywno) | `ORIGIN` |
| `app/api/checkout/route.ts:381` | `http://localhost:3000` | **bez zmian** |
| `app/_lib/auth-actions.ts:21` | `http://localhost:3000` | **bez zmian** |
| `.env.example:27` | `https://mollien.pl` | `https://www.mollien.pl` |

**Dlaczego dwa `localhost:3000` zostają — to decyzja, nie przeoczenie.** Te dwie ścieżki mają kontekst żądania i czytają origin z nagłówków (`auth-actions.ts:15-22` robi to wzorcowo: `origin` → `host` + `x-forwarded-proto` → env → localhost). Wartość awaryjna jest tam praktycznie martwa, a jej sens polega właśnie na tym, że przy lokalnej pomyłce konfiguracyjnej **nie** wskaże cicho na produkcję. Trzy maile powyżej nie mają kontekstu żądania nigdy, więc dla nich `ORIGIN` jest odpowiedzią prawidłową.

## Interfejs

Nowa, osobna stała w `app/_lib/company.ts`, obok `COMPANY` — nie w środku:

```ts
// Origin kanoniczny: adres, pod którym serwis JEST i który ogłasza światu
// (canonical, sitemapa, JSON-LD, og:image, <g:link> w feedzie).
//
// ⚠️ TO NIE JEST `COMPANY.domain`. Tamta stała jest TEKSTEM MARKI — renderuje
// się klientowi w regulaminie, w stopce maili i jako etykieta na /og. Ktoś, kto
// naprawi origin przez podmianę `COMPANY.domain`, zepsuje te trzy napisy.
// Dlatego są to dwie stałe, mimo że dziś różnią się tylko przedrostkiem.
//
// `www`, nie apex, bo indeks jest ugruntowany pod www (409 stron w Search
// Console, kliknięcia od 29.04.2026) — decyzja z ONBOARDING.md 2026-07-30.
// Vercel przekierowuje apex na www kodem 308; ta stała ma się z tym ZGADZAĆ,
// a nie zastępować tamto przekierowanie.
export const ORIGIN = "https://www.mollien.pl";
```

**Dlaczego stała, a nie `process.env.NEXT_PUBLIC_APP_URL`:** rozdzielamy dwa różne pojęcia, które dziś się mieszają.

- **Tożsamość kanoniczna** (grupa A) jest niezmienna niezależnie od tego, gdzie kod działa. Canonical z wdrożenia preview **powinien** wskazywać produkcję — to standardowa praktyka i dlatego stała jest tu właściwa. Zmienna środowiskowa wprowadzałaby możliwość, że preview ogłasza sam siebie jako kanoniczny.
- **Origin runtime** (grupa C) to „gdzie ja teraz jestem" i słusznie bierze się z żądania, z env jako zapasem.

Mieszanie tych dwóch jest przyczyną obecnego stanu, więc nie replikujemy go w nowej stałej.

## Plan weryfikacji

Bramka na sprzeczności, nie na dobre samopoczucie. Repo ma 1328 testów w vitest, `environment: "node"`, bez jsdom.

**Testy jednostkowe (nowe):**
1. `sitemap.ts` — każdy `<loc>` zaczyna się od `https://www.mollien.pl`; **żaden** nie zaczyna się od `https://mollien.pl/`.
2. `robots.ts` — pole `sitemap` wskazuje `www`.
3. `product-feed.ts` — każdy `<g:link>` wskazuje `www`. Test dostawia się do istniejącego `__tests__/product-feed.test.ts`.
4. `seo-jsonld.ts` — URL-e w Organization i breadcrumbach wskazują `www`.
5. **Bramka grupy B (najważniejsza):** `COMPANY.domain === "mollien.pl"` — bez `www` i bez `https://`. Ten test jest po to, żeby przyszła „naprawa" przez podmianę tej stałej padła natychmiast, zamiast cicho zepsuć trzy napisy widoczne dla klienta.

**Weryfikacja na buildzie (nie z lektury kodu):** `npm run build` + `npm start`, potem sprawdzić realne odpowiedzi HTTP:

| co | oczekiwane |
|---|---|
| `<link rel="canonical">` na `/` i na karcie produktu | `https://www.mollien.pl…` |
| `og:image` | `https://www.mollien.pl/og` |
| `/sitemap.xml` — brak wystąpień `https://mollien.pl/` | 0 trafień |
| `/robots.txt` — linia `Sitemap:` | `www` |
| `/feed.xml` — pierwszy `<g:link>` i brak apexu w całym pliku | 0 trafień apexu |
| `/og` — etykieta na obrazku | nadal `MOLLIEN.PL` |
| podgląd maila (`npm run preview:mail`) — stopka | nadal `mollien.pl` |

**Bramki repo:** `npm test` (1328 + nowe), `npx tsc --noEmit` 0, `npm run lint` 0 błędów (4 znane ostrzeżenia sprzed gałęzi: `fabrics.test.ts` ×2, `bundles-server.ts`, `variants.ts`).

## Kolejność wdrożenia — kroki manualne PRZED kodem

⚠️ **Kolejność ma znaczenie i jest zaprojektowana tak, żeby dała się wycofać.**

Rozważony i **odrzucony** wariant: wdrożyć najpierw samo SEO (canonical, sitemapa), a feed później. Powstałaby wtedy niespójność, której **dziś nie ma**: feed prowadzi na apex, a strona docelowa po 308 ogłasza canonical `www` — czyli dokładnie wzorzec, na który Merchant Center reaguje ostrzeżeniem „Mismatched value (page crawl): link". Dziś feed, canonical i claim mówią zgodnie „apex", więc rozbicie zmiany zrobiłoby szkodę tam, gdzie jej nie ma. **Wszystko idzie jedną gałęzią.**

1. **Właściciel — Merchant Center:** zmienić adres witryny na `https://www.mollien.pl` i potwierdzić, że weryfikacja przeszła. Powinna przejść od razu: Search Console ma usługę „Domena" `mollien.pl` (obejmuje subdomeny) **oraz** „Prefiks URL" `https://www.mollien.pl/` — obie potwierdzone 2026-07-30. **Gdyby się nie udało, kodu jeszcze nie tknęliśmy i nic nie trzeba wycofywać.**
2. **Właściciel — Vercel:** `NEXT_PUBLIC_APP_URL` = `https://www.mollien.pl` (Production). ⚠️ **Sama zmiana zmiennej nie wystarcza — wymaga Redeploy**, bo wdrożenie ma zamrożony zestaw zmiennych z builda.
3. **Kod:** gałąź, testy, bramki, PR, merge (= deploy z `main`).
4. **Po wdrożeniu:** sprawdzić na produkcji canonical, sitemapę, `robots.txt` i `feed.xml` (tabela wyżej). Potem obejrzeć diagnostykę Merchant Center — feed pobiera się raz na dobę, więc na wynik trzeba poczekać.
5. **Pinterest:** nic do zrobienia. Zmiana wyłącznie pomaga — katalog dostanie linki na potwierdzoną tam domenę. Oczekiwana liczba pozycji: **~353**.

## Ryzyka

| ryzyko | ocena | mitygacja |
|---|---|---|
| Merchant Center odrzuca oferty w trakcie przejścia | **główne** — dotyka żywego kanału sprzedaży | przeclaimowanie **przed** wdrożeniem kodu (krok 1); wycofanie = revert PR-a |
| `metadataBase` dotyka canonical **każdej** strony | duży zasięg, ale to jest cel zmiany | testy na sitemapie i canonicalu; sprawdzenie na buildzie przed mergem |
| Ktoś w przyszłości „naprawi" origin podmianą `COMPANY.domain` | realne — ta pułapka już raz zadziałała jako powód odłożenia zadania | test-bramka `COMPANY.domain === "mollien.pl"` + komentarz przy `ORIGIN` |
| Google przelicza sygnały po zmianie canonical | niski — Google i tak już kanonikalizuje do `www`, zmiana usuwa sprzeczność, nie wprowadza nową | brak; obserwować Search Console |

## STAN PRAC (2026-08-17)

**Nic z tego planu nie jest jeszcze zaimplementowane.** Ten dokument to sam projekt, spisany po zmapowaniu kodu i pomiarach na produkcji.

Rozstrzygnięte i niewymagające ponownej dyskusji:
- kierunek `www` (decyzja z 2026-07-30, uzasadniona 409 stronami w indeksie),
- jedna gałąź zamiast dwóch etapów (uzasadnienie w „Kolejność wdrożenia"),
- podział 6 / 3 / 5 miejsc na grupy A / B / C, z dokładnymi `plik:linia` wyżej,
- Merchant Center **jest** uruchomiony z zaclaimowanym apex — potwierdził właściciel.

Do zrobienia przy podjęciu:
- właściciel wykonuje kroki 1 i 2 („Kolejność wdrożenia") — **przed** kodem,
- implementacja przez `superpowers:writing-plans` → plan wykonawczy, potem TDD,
- ten dokument dostaje sekcję „STAN WYKONANIA" po zamknięciu, wzorem
  `2026-08-13-synonimy-i-zero-wynikow-design.md`.

Czego NIE sprawdzono na żywo, a co warto potwierdzić przy podjęciu:
- **aktualnej wartości `NEXT_PUBLIC_APP_URL` w Vercelu (Production).** `.env.example` mówi `https://mollien.pl`, więc prawdopodobnie tam też jest apex, ale nikt tego nie odczytał z panelu. Canonical tego nie zdradza, bo bierze się z `COMPANY.domain`, nie ze zmiennej.
- zachowania Merchant Center przy niezgodności `www`/apex — wiadomo, że porównuje link z feedu z zaclaimowaną domeną i że bywa to źródłem odrzuceń, ale nie zmierzono, jak dokładnie reaguje na różnicę wyłącznie w przedrostku `www`. Stąd kolejność z krokiem 1 na początku, a nie założenie, że „przecież podąży za przekierowaniem".
