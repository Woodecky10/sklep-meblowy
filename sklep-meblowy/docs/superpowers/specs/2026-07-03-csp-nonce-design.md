# Content-Security-Policy (nonce) — design

Data: 2026-07-03. Zatwierdzone przez użytkownika. Domyka rekomendację hardeningową z audytu 2026-06-11 (HIGH‑2 residual: brak CSP).

## Kontekst i problem

Konkretne wektory XSS w sanitizerze opisów (`app/_lib/product-html.ts`) są już załatane
i przetestowane, ale **repo nie ma żadnego CSP** — brakuje warstwy obrony w głębi
(backstop na przyszłe obejścia sanitizera + anty-clickjacking). Nagłówki produkuje dziś
wyłącznie proxy Next 16 (`proxy.ts` → `app/_lib/supabase/middleware.ts` `updateSession`,
gdzie ustawiany jest `x-locale`); `next.config.ts` nie ma `headers()`. Aplikacja **nie
ładuje żadnych obcych skryptów** (Stripe = redirect server-side, brak analytics), więc
`script-src` może być realnie mocny.

## Cel

Egzekwowany CSP oparty o **nonce** (mechanizm rekomendowany przez dokumentację
zainstalowanego Next 16), z mocnym `script-src` blokującym wstrzyknięty skrypt, oraz
twardymi dyrektywami anty-clickjacking / obce-origin. Bez łamania renderu (motyw,
JSON-LD, obrazki, upload w adminie).

## Nie-cele (YAGNI)

- Wymiana ręcznego sanitizera na `sanitize-html`/DOMPurify — luki załatane i przetestowane;
  swap = nowa zależność + ryzyko regresji. Zostaje ręczny sanitizer (jedyna zmiana tam:
  poprawka nieaktualnego komentarza „Bez img").
- Tryb Report-Only jako docelowy — wdrażamy egzekwująco (report-only tylko jako awaryjny
  fallback, jeśli smoke ujawni problem).
- Endpoint raportowania naruszeń (`report-uri`/`report-to`) — nie dodajemy.
- Zmiana strategii renderowania poza tym, co wymusza nonce (patrz Konsekwencje).

## Mechanizm — nonce w proxy

- Nonce generowany raz na request w `updateSession` (`app/_lib/supabase/middleware.ts`),
  obok istniejącego `x-locale`: `const nonce = Buffer.from(crypto.randomUUID()).toString("base64")`.
- `requestHeaders.set("x-nonce", nonce)` (żeby Server Components mogły go odczytać) +
  string CSP.
- Nagłówek `Content-Security-Policy` ustawiony na **każdej** zwracanej odpowiedzi
  `updateSession` (funkcja ma kilka ścieżek return: początkowy `supabaseResponse`,
  przebudowa w `setAll`, `rewriteResponse` dla locale `/de`). Ustawiamy na tej, która
  faktycznie wraca w danej ścieżce — inaczej część odpowiedzi wyjdzie bez CSP.
- Origin Supabase liczony z `NEXT_PUBLIC_SUPABASE_URL` (bez hardkodowania project-ref);
  z URL wyprowadzamy origin `https://<host>` i `wss://<host>`.

## Polityka CSP (dyrektywy)

```
default-src 'self';
script-src 'self' 'nonce-<n>' 'strict-dynamic'   # + 'unsafe-eval' TYLKO w dev (NODE_ENV!=='production')
style-src 'self' 'unsafe-inline'                  # BEZ nonce — inaczej CSP3 ignoruje 'unsafe-inline' i łamie inline style
img-src 'self' data: blob: <supabase-https> https://images.unsplash.com
font-src 'self'
connect-src 'self' <supabase-https> <supabase-wss>
worker-src 'self' blob:                           # browser-image-compression tworzy worker z blob: (upload w adminie)
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
frame-src 'none'
upgrade-insecure-requests
```

Uzasadnienia kluczowych decyzji:
- **`script-src` bez `'unsafe-inline'`** — to jest realna ochrona przed wstrzykniętym
  skryptem. `'strict-dynamic'` + nonce: skrypty ładowane przez zaufany (noncowany) skrypt
  Next są dozwolone (auto-propagacja Next), reszta zablokowana. `'unsafe-eval'` tylko w dev
  (React używa eval na stack-trace błędów).
- **`style-src 'self' 'unsafe-inline'`, BEZ nonce** — są inline `style={{}}` (m.in.
  dynamiczny zoom w `ImageGallery`) oraz `style=` produkowane przez sanitizer; nonce nie
  obejmuje atrybutu `style`. Gdyby w `style-src` był nonce, CSP3 zignorowałby
  `'unsafe-inline'` → połamane style. XSS liczy się przy `script-src`, nie `style-src`.
- **`worker-src 'self' blob:`** — bez tego worker z blob: (kompresja zdjęć w adminie)
  spada na `default-src 'self'` i zostaje zablokowany → upload w adminie przestaje działać.
- **Brak origin Stripe** — checkout to redirect server-side (`@stripe/stripe-js` nieużywany).
- **`frame-ancestors 'none'`** — anty-clickjacking (brak iframe'ów w app).

## Czysta funkcja (testowalna)

Nowy moduł `app/_lib/csp.ts` (pure, bez zależności server-only):

```ts
export function buildCsp(
  nonce: string,
  opts: { isDev: boolean; supabaseOrigin: string | null }
): string;
```

Składa string CSP wg powyższej polityki: wstrzykuje `'nonce-<nonce>'` do `script-src`;
dokłada `'unsafe-eval'` do `script-src` tylko gdy `isDev`; dokłada `https://<host>` i
`wss://<host>` do `img-src`/`connect-src` gdy `supabaseOrigin` niepusty; nigdy nie
umieszcza nonce w `style-src`. Zwraca jedną linię (spłaszczone whitespace). `updateSession`
liczy `supabaseOrigin` z `NEXT_PUBLIC_SUPABASE_URL` i woła `buildCsp`.

## Plumbing nonce (2 inline-skrypty, reszta automatyczna)

- **`next-themes`**: `app/layout.tsx` (Server Component) czyta
  `const nonce = (await headers()).get("x-nonce") ?? undefined` i przekazuje `nonce` do
  `ThemeProvider` → `NextThemesProvider nonce={nonce}`. `ThemeProvider.tsx` dostaje prop
  `nonce?: string`. Bez tego anty-flash skrypt next-themes jest blokowany → miganie motywu.
- **JSON-LD**: `app/produkt/[id]/page.tsx` — `nonce={nonce}` na
  `<script type="application/ld+json">` (nonce z `headers()`; strona jest async Server
  Component). `jsonLdHtml` już escapuje `</script>` — bez zmian.
- Framework Next, bundatki JS, inline style `next/font` — **nonce doklejany automatycznie**
  przez Next; nic nie robimy.

## Konsekwencje

- Odczyt `headers()` w root layout → **cały serwis renderuje się dynamicznie** (nonce jest
  niekompatybilny ze statycznym/ISR/PPR — udokumentowane). Storefront i tak jest w
  większości dynamiczny (cookies/locale); strony legal/home tracą prerender. Świadomie
  zaakceptowane.
- `next.config.ts` — bez zmian (CSP idzie przez proxy, nie przez `headers()`).

## Przypadki brzegowe

- Brak `NEXT_PUBLIC_SUPABASE_URL` (teoretycznie) → `buildCsp` pomija origin Supabase
  (obrazki/connect tylko `'self'` + data/blob); nie wywala nagłówka.
- API routes też przechodzą przez proxy → dostaną CSP; na odpowiedzi JSON nieszkodliwe.
- Dev vs prod: `'unsafe-eval'` w `script-src` tylko w dev; brak w prod.
- Kolejność: nonce musi być świeży per request (`crypto.randomUUID()` w proxy — runtime
  serwera, nie edge-cache).

## Pliki dotknięte

- **Nowe:** `app/_lib/csp.ts`; `app/_lib/__tests__/csp.test.ts`.
- **Edycja:** `app/_lib/supabase/middleware.ts` (`updateSession` — nonce + `x-nonce` +
  nagłówek CSP na każdej zwracanej odpowiedzi); `app/layout.tsx` (odczyt nonce, przekazanie
  do `ThemeProvider`); `app/_components/layout/ThemeProvider.tsx` (prop `nonce`, przekazanie
  do `NextThemesProvider`); `app/produkt/[id]/page.tsx` (nonce na JSON-LD);
  `app/_lib/product-html.ts` (tylko poprawka komentarza „Bez img").
- **Bez zmian:** `next.config.ts`, sanitizer (logika), storefront/klient poza powyższym.

## Testy

- **Nowe (unit, pure):** `buildCsp` — nonce wstrzyknięty w `script-src`; `'unsafe-eval'`
  obecny w dev / nieobecny w prod; `style-src` zawiera `'unsafe-inline'` i NIE zawiera
  nonce; origin Supabase (https+wss) obecny gdy podany, pominięty gdy null; obecność
  `worker-src blob:`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- Reszta (proxy, plumbing) → lint + build + **ręczny smoke**: konsola bez naruszeń CSP na
  home / sklep / karcie produktu / koszyku; motyw bez migania (toggle light/dark); JSON-LD
  obecny w źródle; obrazki (Supabase/Unsplash) ładują się; **upload zdjęcia w adminie
  działa** (worker blob); przełączenie `/de` (rewrite path) też ma nagłówek CSP.
