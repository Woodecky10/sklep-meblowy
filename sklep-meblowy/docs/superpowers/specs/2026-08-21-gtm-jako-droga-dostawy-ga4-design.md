# GTM jako droga dostawy GA4 (spec)

**Data:** 2026-08-21
**Powiązane:** GA4 za zgodą — PR #129 (start tagu po zgodzie), PR #144 (zdarzenia
e-commerce). Pixel Meta — PR #140. Oba pozostają w mocy; ten spec **nie dotyczy
Pixela Meta**.

## 1. Czego chce właściciel

Właściciel dostał od osoby zajmującej się marketingiem gotowy pojemnik
**GTM-5CHQ99MZ** wraz z fragmentem kodu do wklejenia i pytaniem, czy nie da się
„zamiast tych wszystkich GA, GSC itp. użyć Google Tag i mieć wszystko w jednym".

**To nieprawda i zostało właścicielowi wyjaśnione:** GTM sam nic nie zbiera ani nie
raportuje — to pojemnik na tagi. GA4 zostaje potrzebne (GTM go tylko ładuje),
a Search Console bierze dane od robota Google i GTM nie ma ich skąd wziąć
(weryfikacja GSC już jest, `verification.google` w `app/layout.tsx`).

Prawdziwy powód, dla którego robimy to mimo wszystko, właściciel podał wprost:
**nie chce być wąskim gardłem** przy dodawaniu tagów. Dodanie tagu ma nie
wymagać commita.

### Rozstrzygnięcia właściciela — nie wracać bez powodu

| Pytanie | Decyzja |
|---|---|
| Co GTM przejmuje | **GA4 tak, Pixel Meta NIE** |
| Czy przenosić zdarzenia e-commerce do panelu GTM | **Nie** — zostają w kodzie, GTM je tylko odbiera |
| Czy GTM ładuje się bez zgody | **Nie.** Brak zgody analitycznej = pojemnik się nie wczytuje |
| Przełącznik na wdrożenie | **Tak, obowiązkowo** |
| Kto konfiguruje pojemnik | Osoba zajmująca się marketingiem — **nie mamy dostępu do panelu GTM** |

Wariant „GTM przejmuje wszystko" i wariant „GTM tylko dla marketingu" zostały
przedstawione i **odrzucone** — uzasadnienie w sekcji 9.

## 2. Stan dzisiejszy (zmierzony, nie z pamięci)

- `app/_lib/analytics.ts` — czysta logika: `GA_MEASUREMENT_ID` z
  `NEXT_PUBLIC_GA_ID` (puste = analityka wyłączona), `gaConsentSignals()` mapuje
  dwa przełączniki banera na cztery sygnały Consent Mode v2.
- `app/_lib/ga-client.ts` — runtime: wstrzykuje `gtag/js?id=…` **z kodu, nie
  inline**, bo `script-src` nie ma `unsafe-inline`. Kolejność: `consent default`
  (wszystko `denied`) → `consent update` → `js` → `config` → wstrzyknięcie.
  Publiczne API: `trackGaEvent`, `startGaIfConsented`, `pushGaConsentUpdate`,
  `isGaStarted`, `clearGaCookies`.
- `app/_lib/ga-ecommerce.ts` — ładunki już w kształcie GA4:
  `{ currency, value, items }`, a `purchase` dodatkowo `transaction_id`
  (po nim GA4 odsiewa podwójne zakupy).
- **Pięć miejsc wywołania** `trackGaEvent`: karta produktu (`view_item`),
  `CartContext` (`add_to_cart` ×2 — pojedynczy mebel i zestaw jako JEDNO
  zdarzenie), koszyk (`begin_checkout`), `GaEventOnce` (`purchase` na
  `/checkout/success`, zdarzenie na `/probki/sukces`).
- `app/_lib/csp.ts` — `script-src`: `'self'` + nonce + `strict-dynamic`, **bez**
  `unsafe-inline`. Hosty GA (w tym `googletagmanager.com`) są w `connect-src`
  i `img-src`, ale **nie** w `script-src` — celowo, bo `strict-dynamic`
  unieważnia listę hostów dla skryptów.
- `app/_lib/supabase/middleware.ts:54` — `gaEnabled: GA_MEASUREMENT_ID !== ""`.

**Wniosek, który przesądza o rozmiarze roboty:** `trackGaEvent(name, payload)` to
jedyne wyjście dla wszystkich zdarzeń, a ładunki są już w kształcie GA4. Zmiana
formatu na rodzimy dla GTM jest zmianą **wewnątrz jednej funkcji**. Żadne z pięciu
miejsc wywołania nie wymaga zmiany.

## 3. Architektura

Trzy pliki, każdy z jedną robotą:

- **`app/_lib/analytics.ts`** (istniejący, rozszerzany) — czysta logika:
  `isValidGtmId()`, `GTM_CONTAINER_ID` z `NEXT_PUBLIC_GTM_ID`,
  `buildGtmMessages(name, payload)` zwracające komunikaty do wypchnięcia.
  Bez DOM-u, więc **to jest ta część, którą da się przetestować jednostkowo**.
- **`app/_lib/gtm-client.ts`** (nowy) — runtime drogi GTM: wstrzyknięcie
  `gtm.js?id=…`, pchnięcia zgody, pchnięcia zdarzeń. Bliźniak `ga-client.ts`
  co do konstrukcji.
- **`app/_lib/ga-client.ts`** (istniejący, staje się fasadą) — publiczne API bez
  zmian w sygnaturach; na wejściu każdej funkcji wybiera drogę. **Dzisiejsza
  ścieżka `gtag.js` zostaje nietknięta** — musi działać, bo inaczej powrót
  przełącznikiem jest fikcją.

Wywołujący (karta produktu, koszyk, `GaEventOnce`) nie wiedzą, która droga jest
czynna, i nie mają się dowiedzieć.

## 4. Przełącznik: jedna zmienna, nie dwie

`NEXT_PUBLIC_GTM_ID`. Ustawione na poprawny identyfikator = droga przez GTM;
puste albo z literówką = dzisiejsza droga przez `gtag.js`.

Odrzucono osobną flagę `NEXT_PUBLIC_GA_VIA_GTM` obok ID, mimo że tak brzmiała
pierwotna propozycja: dwie zmienne dopuszczają stan bez sensu (flaga włączona,
ID puste), a wzorzec „puste = wyłączone" jest już w `NEXT_PUBLIC_GA_ID`
i `NEXT_PUBLIC_META_PIXEL_ID`. Walidacja jak przy GA: zły format = traktujemy jak
wyłączone, **nie rzucamy wyjątkiem** — brak analityki nie może wywalić sklepu.

`NEXT_PUBLIC_GA_ID` **zostaje ustawione w Vercelu**. Na drodze GTM nie jest już
używane do ładowania, ale bez niego nie ma jak wrócić przełącznikiem.

⚠️ `NEXT_PUBLIC_*` jest wstrzykiwane na etapie builda — zmiana wartości w panelu
Vercela **wymaga Redeploy**.

## 5. Format zdarzeń

```js
dataLayer.push({ ecommerce: null });
dataLayer.push({ event: "add_to_cart", ecommerce: payload });
```

⚠️ Pierwsze pchnięcie jest **konieczne, nie ozdobne**. `dataLayer` kumuluje
wartości między komunikatami, więc bez wyczyszczenia pozycje z poprzedniego
zdarzenia wsiąkają w następne: obejrzenie dwóch kart produktu po kolei wysłałoby
drugie `view_item` z pozycjami pierwszego mebla. Tego nie widać w żadnym
komunikacie błędu — widać dopiero w raportach, jako zawyżone koszyki.

Ładunki z `ga-ecommerce.ts` idą **bez zmian w treści**, tylko zapakowane w klucz
`ecommerce`. Dotyczy to również `transaction_id` przy `purchase`.

Świadomie **nie** polegamy na tym, że pojemnik GTM podniesie dzisiejsze pchnięcia
w stylu `gtag('event', …)`. Dokumentacja Google tego nie rozstrzyga, a pchnięcie
`gtag` to obiekt `arguments` (klucze `0`, `1`, `2`), nie obiekt z kluczem `event`,
którego szuka wyzwalacz zdarzenia własnego. Projekt jest tak zrobiony, że
odpowiedź na to pytanie **nie ma znaczenia** — pchamy w formacie rodzimym dla GTM.

## 6. Zgoda

Kolejność bez zmian względem dzisiejszej: `consent default` (wszystko `denied`) →
`consent update` z banera → **dopiero potem** wstrzyknięcie pojemnika. Powód
kolejności ten sam co dziś: pierwszy komunikat po starcie tagu poleciałby
z domyślami Google, nie naszymi.

Twarda bramka zostaje w naszym kodzie: **brak zgody analitycznej = pojemnik się
nie ładuje.** Odrzucono zalecany przez Google wariant „ładuj zawsze, niech Consent
Mode decyduje" (dawałby modelowanie konwersji bez cookies), bo skrypt ładowałby się
też osobie, która odmówiła, a co się w nim odpali zależy od konfiguracji w panelu,
nie od naszego kodu — czyli odpowiedzialność RODO na żywym sklepie przechodziłaby
na osobę bez dostępu do repo.

Cofnięcie zgody działa jak dziś: sygnał `consent update` + czyszczenie cookies
`_ga*` i `_gid` po wszystkich wariantach domeny (`clearGaCookies`). GA4 wewnątrz
GTM ustawia **te same** cookies, więc funkcja zostaje bez zmian. Samego pojemnika
nie da się „odładować" — dokładnie jak dziś `gtag.js`, i tak samo to obsługujemy.

## 7. CSP

Jedna linia w `app/_lib/supabase/middleware.ts:54`:

```ts
gaEnabled: GA_MEASUREMENT_ID !== "" || GTM_CONTAINER_ID !== "",
```

Nic więcej się nie luzuje: `googletagmanager.com` jest już w `connect-src`
i `img-src`, a `script-src` i tak nie filtruje po hostach przy `strict-dynamic` —
pojemnik wstrzyknięty z zaufanego skryptu bundla dziedziczy zaufanie, tak jak dziś
`gtag.js` i `fbevents.js`.

⚠️ **Konsekwencja dla osoby obsługującej panel: tagi „Custom HTML" w GTM nie będą
działać** (to ten sam brak `unsafe-inline`). Wbudowane szablony — GA4, Google Ads,
LinkedIn — działają, bo GTM ładuje je jako skrypty zewnętrzne. Szablony z galerii:
zależy od szablonu. Trafia do instrukcji z sekcji 10.

## 8. Testy

**Jednostkowo** (vitest, `environment: node`) — czysta część z `analytics.ts`:
`isValidGtmId` (poprawny, literówka, pusty), `buildGtmMessages` (kształt
komunikatu, obecność `transaction_id` przy `purchase`, oraz **że `ecommerce: null`
jest pierwsze** — to asercja na kolejność, nie na zawartość).

**Wstrzyknięcia skryptu nie da się przetestować jednostkowo** — projekt ma
`environment: "node"`, zero jsdom, zero testów komponentów. Dlatego spec
Playwrighta na **buildzie produkcyjnym** (`npm run build` + `npm start`, nie
`next dev` — na devie serwer umiera po pierwszym teście):

1. przed decyzją o cookies: w DOM **nie ma** `gtm.js`;
2. po zgodzie analitycznej: `gtm.js` jest, a `window.dataLayer` zawiera
   `consent default` → `consent update` → resztę, w tej kolejności;
3. po odmowie: `gtm.js` nadal nie ma.

⚠️ Spec musi być **niezapisujący** — baza jest wspólna z produkcją.
Czerwono-zielono udowodnić przez `git stash` na działającym buildzie.

## 9. Odrzucone warianty

| Wariant | Dlaczego nie |
|---|---|
| **GTM przejmuje wszystko** (GA4 + Pixel, kod pomiarowy usunięty) | Wymaga przepisania wszystkich zdarzeń e-commerce na konfigurację w panelu i odtworzenia obu bramek zgody w GTM. W okresie przejściowym łatwo policzyć podwójnie albo zgubić pomiar, a GA4 nie ma cofnij. Duże ryzyko na żywym sklepie. |
| **GTM tylko dla marketingu** (Pixel do GTM, GA4 w kodzie) | Dwa równoległe mechanizmy zgody do utrzymania i dwa miejsca do szukania przyczyny, gdy coś nie mierzy. Osoba obsługująca panel nadal nie dotknęłaby GA4, czyli cel niespełniony. |
| **GTM tylko dla nowych tagów** (GA4 i Pixel zostają w kodzie) | Najmniejsza zmiana i pierwotna rekomendacja, ale właściciel wybrał inaczej: chce, żeby GA4 dało się obsłużyć z panelu. |
| **Ładowanie GTM zawsze, zgoda przez Consent Mode** | Patrz sekcja 6 — oddaje odpowiedzialność RODO osobie bez dostępu do repo. |
| **Wklejenie fragmentu ze zrzutu** | Skrypt inline; `script-src` bez `unsafe-inline` odrzuci go w całości. Pojemnik nie wczytałby się wcale. |

## 10. Kolejność wdrożenia

Konfiguracja pojemnika jest po stronie marketingu, kod po naszej, i nie da się ich
wdrożyć w tej samej sekundzie. **Bez przełącznika kończy się to zawsze jednym
z dwóch:** kod pierwszy → pomiar milknie i nikt tego nie zauważa; tag pierwszy →
wszystko liczone dwa razy.

1. Kod wchodzi na produkcję z **pustym** `NEXT_PUBLIC_GTM_ID`. Sklep działa jak
   dziś, nic nie widać. Weryfikacja: `gtag.js` nadal się ładuje, zdarzenia lecą.
2. Osoba obsługująca panel konfiguruje pojemnik (instrukcja niżej).
3. Ustawiamy `NEXT_PUBLIC_GTM_ID` w Vercelu (Production) + **Redeploy**.
4. Weryfikacja na żywo: Czas rzeczywisty w GA4 — odsłona, `view_item`,
   `add_to_cart`; przy zakupie sprawdzić, czy **kwota i pozycje** dochodzą.
5. Kłopot → czyścimy `NEXT_PUBLIC_GTM_ID` + Redeploy. Wracamy na `gtag.js`.

### Instrukcja dla osoby obsługującej panel

Treść jest tutaj; przy wdrożeniu wychodzi z niej **osobny plik do przekazania**,
żeby nie wysyłać całego specu. Póki co to jedno źródło.

Najważniejszy punkt, bo jego pominięcie wygląda jak „działa":
**tag GA4 w GTM musi przepuszczać obiekt `ecommerce`** (opcja wysyłania danych
e-commerce). Bez tego zdarzenia dolecą, ale **bez kwot i pozycji** — przychód
w raportach wyjdzie zerowy.

Dalej: wyzwalacze na zdarzenia własne o nazwach `view_item`, `add_to_cart`,
`begin_checkout`, `purchase`; identyfikator GA4 ten sam co dziś w
`NEXT_PUBLIC_GA_ID` (**nie zakładać nowej usługi** — historia zostaje w starej);
Consent Mode włączony w pojemniku; **żadnych tagów „Custom HTML"** (sekcja 7).

## 11. Czego ten spec NIE obejmuje

- **Pixel Meta** — zostaje w kodzie, `MetaPixel.tsx` i `meta-pixel-client.ts`
  nietknięte. Skutek uboczny bez zmian: liczby w GA4 i w Menedżerze reklam nie
  będą równe, bo bramki zgody są różne (analityczna vs marketingowa). To nie
  usterka.
- **Przeniesienie zdarzeń do panelu GTM** — zdarzenia zostają w kodzie.
- **Nowe tagi** (Google Ads, LinkedIn, Hotjar) — to właśnie dostaje panel; nie
  robimy ich po naszej stronie.
- **Server-side GTM** — nie było tematu.
