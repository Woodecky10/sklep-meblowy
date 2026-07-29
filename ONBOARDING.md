# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Przelewy24** (PayPro, direct REST API v1). Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny: **PL** (korzeń) + **DE** (`/de`, ceny w EUR).

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-07-29)
`origin/main` = `18bba5af`, **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`: `tsc` 0 · `lint` 0 błędów (4 znane warningi) · **856 testów** (vitest, 70 plików) · `build` przechodzi (Turbopack).

Wieczorem 2026-07-29 domknięta cała kolejka PR-ów: **#110** (pakiet techniczny SEO — `/og`, `/feed.xml`, JSON-LD Organization + breadcrumby), **#78** (BackToTop w adminie + wyszukiwanie odporne na spacje i kolejność słów), **#100** (licznik nowych zamówień w panelu), **#92** (filtry z parametrów produktu zamiast koloru/tkaniny), **#111** (sprzątanie migracji po BL). Zamknięte bez merge jako zdublowane dzisiejszą pracą: **#99** (ONBOARDING, zastąpiony przez #109) i **#62** (skrypt rehost, usunięty w #105/#106). Otwarty zostaje tylko **#48** (Przelewy24) — konfliktuje po dzisiejszym w `app/api/checkout/route.ts`, `app/api/webhook/route.ts` i `package.json`/lock (doszły `resend`/`react-email`), a przed merge wymaga migracji 47 na prodzie i transakcji w sandboxie P24.

### Maile transakcyjne — UZBROJONE i przetestowane na produkcji (2026-07-29)
Kod był gotowy od 2026-07-28, brakowało konfiguracji — zrobione i sprawdzone realnym zamówieniem na mollien.pl. Działa: potwierdzenie zamówienia, „Nowe zamówienie" do właścicielki, „w drodze" (z przewoźnikiem i trackingiem), „anulowane". Maile wychodzą TYLKO przy statusach `shipped` i `cancelled` (`NOTIFY_STATUSES` w `app/_lib/mail/status-notify.ts`) — „Dostarczone"/„W realizacji"/„Opłacone" świadomie nie mailują.

- **Adresy — jeden kontaktowy, celowo:** `MAIL_FROM` = `Mollien <zamowienia@mollien.pl>` (ten adres **nie jest skrzynką** i nie musi być — do wysyłki wystarcza zweryfikowana domena; nie „naprawiaj" tego zakładaniem skrzynki). `MAIL_REPLY_TO` = `MAIL_ADMIN_TO` = `COMPANY.email` = **mollien.julia@gmail.com**.
- **DNS:** strefa w **home.pl** (Domeny → mollien.pl → karta „Hosting DNS" → DZIAŁANIA → „Zarządzaj rekordami DNS"), NIE w Vercelu. Cztery rekordy: `TXT resend._domainkey`, `MX send` (prio 10), `TXT send` (SPF), `TXT _dmarc`. Domena w Resend = Verified. **MX na apex świadomie NIE ma** („Enable Receiving" w Resend wyłączone) — dlatego na `@mollien.pl` nie da się nic odebrać i dlatego reply-to jest na Gmailu.
- **Gdy maile nie dochodzą:** `sendMail` nigdy nie rzuca, tylko loguje. Vercel → zakładka **Logs** (Runtime, nie Build) → filtr `[mail]`. `brak RESEND_API_KEY`/`brak MAIL_FROM` = zmienna nie dojechała do wdrożenia (**po zmianie zmiennej trzeba Redeploy** — wdrożenie ma zamrożony zestaw z builda). Drugie źródło: Resend → Logs, jedyne miejsce gdzie widać nieudaną wysyłkę (kod nie zapisuje i nie ponawia).
- **ZOSTAŁO:** mail weryfikacyjny konta idzie wbudowanym mailerem Supabase (limit kilku/godzinę, domyślny szablon). Podpięcie: `docs/maile-konfiguracja.md` sekcja 3.

### Inne otwarte drobiazgi po 2026-07-29
- ~~**Zamówienia #36 i #37**~~ — ZROBIONE 2026-07-29: `#36` już nie istniało, `#37` (COD 139 zł, „Test Testowy", tracking `TEST123`) usunięte na życzenie Mikołaja — najpierw `order_items`, potem `orders`; zweryfikowane: 0 osieroconych pozycji, zostało 6 zamówień. Numeracja idzie dalej od 38 (luka po 35–37 zostaje, `order_number` to sekwencja).
- ⚠️ **Prod serwuje `www.mollien.pl`, a kod deklaruje apex.** `https://mollien.pl` → **308** → `https://www.mollien.pl`, ale canonicale, `sitemap.xml`, `og:image` i URL-e w JSON-LD wskazują apex (`metadataBase` z `NEXT_PUBLIC_APP_URL`, `COMPANY.domain`). Google podąża za 308 i skanonikalizuje do `www`, więc nie jest to awaria, ale **przed dodaniem usługi w Search Console trzeba wybrać jeden host**. Najprościej: ustawić apex jako primary domain w Vercelu (wtedy `www` → apex i cały kod jest już poprawny). Druga droga: przestawić `NEXT_PUBLIC_APP_URL` + `COMPANY.domain` na `www` i zredeployować.
- ⚠️ **Trzy aktywne produkty nie mają żadnego opisu** (ani plain `description`, ani sekcji tekstowych): `Fotel Luma…` `d0fb2cff`, `Narożnik Vegas Mini…` `60c7ccb6`, `schodki dla psa/kotka pupila` `965951d6`. Skutek: pusty `<g:description>` w `/feed.xml` (Merchant Center odrzuci te 3 oferty) i pusta meta description tych stron. Do uzupełnienia w panelu.
- **Migracje po BaseLinkerze — ZROBIONE 2026-07-29, ale nie wszystkie 5.** Usunięte trzy czysto BL-owe: `07_baselinker_integration`, `11_baselinker_sync_log`, `24_baselinker_sync_log_report`. ⚠️ **`25_bl_push_hardening` MUSI ZOSTAĆ** — mimo nazwy zawiera dwie rzeczy, które nadal żyją: RPC `increment_promo_usage` (atomowy licznik kodów rabatowych, wołany z `markOrderPaid`) i **polityki RLS write na `products`** dla admina (bez nich panel nie zapisuje produktów). ⚠️ **`34_drop_baselinker` też ZOSTAJE**, dopóki zostaje `25` — dropuje kolumnę `orders.baselinker_push_error`, którą `25` wciąż tworzy, więc świeży build bazy kończy bez śladów BL. Dlatego `grep -ri baselinker` nadal daje 2 trafienia i to NIE regresja czystki.
- **Zmienne `BASELINKER_*`/`CRON_SECRET` w Vercelu** — do sprawdzenia i usunięcia, jeśli zostały. Nic ich nie czyta.
- **Sesja e2e admina wygasła**, a `.env.e2e` nie ma `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` — bez tego nie da się fotografować panelu ani testować akcji admina.

Ostatnio scalone:
- **PR #41** — domknięcie wycieków PL na `/de` (redirecty/linki gubiły prefiks `/de`, komunikaty błędów po DE).
- **PR #42** — **ceny w EUR na `/de`** (patrz sekcja niżej).
- **PR #45** — fix przełącznika języka DE/PL: `<Link>`→natywny `<a>` (pełny reload). Locale niesie nagłówek `x-locale` (proxy), a chrome (TopBar/Navbar/Footer) jest serwerowy w root layoucie — App Router NIE re-renderuje root layoutu przy soft-nav, więc soft-switch tłumaczył tylko stronę. **Nie zamieniać `<a>` z powrotem na `<Link>` w `LanguageSwitcher`.**

## Duży kierunek: sklep obsługuje wszystko natywnie
Decyzja właścicielki (2026-06-17): sklep prowadzi produkty, kategorie i zamówienia **u siebie** — żadnego zewnętrznego systemu magazynowego, żadnej synchronizacji, żadnego crona. Produkty dodaje się w `/admin/produkty`, kategorie w `/admin/kategorie`, zamówienia obsługuje `/admin/zamowienia`. Zdjęcia leżą w Supabase Storage.

4 podprojekty tego programu:
1. ✅ **Panel zarządzania zamówieniami** — na `main`.
2. ✅ **Natywne tworzenie produktów** — na `main`.
3. ⬜ **Faktury / VAT — przez KSeF** — TODO, czeka na odpowiedzi właścicielki. USTALENIE 2026-06-18: faktury **MUSZĄ być w KSeF** (obowiązkowy od 1.04.2026 dla „pozostałych przedsiębiorców"). **Rekomendacja: NIE budować bezpośredniej integracji KSeF** — sklep zbiera dane → API programu fakturowego (Fakturownia/wFirma/inFakt/Comarch), który robi KSeF+FA(3)+numerację+PDF+UPO. W kodzie ZERO podstaw (brak NIP/danych firmy/VAT/podziału netto-brutto). Najważniejsze pytanie: z jakiego programu fakturowego korzysta księgowa.
4. 🟡 **Wysyłka — transport firmą transportową (NIE kurier)** — slice 1 ZROBIONY (PR #38: klient widzi przewoźnika + tracking w `/konto/zamowienia/[id]`). ⬜ Reszta: planowany termin dostawy, dane dla firmy transportowej (piętro/winda/wniesienie/telefon), model kosztu. Gabarytów nie wozi kurier → bez integracji API kuriera, moduł ręczny.

Pytania do właścicielki (faktury KSeF + wysyłka): `sklep-meblowy/docs/2026-06-18-rozpoznanie-faktury-wysylka.md`.

## Ceny EUR na /de (2026-06-24, PR #42)
Klient na `/de` widzi i **płaci w EUR**; PL (`/`) bez zmian (PLN). Stały kurs PLN→EUR w tabeli `store_settings`, edytowalny w **`/admin/ustawienia`** (bez deploya). Konwersja `eur = ceil(pln × kurs)` tylko przy wyświetlaniu (`formatMoney`) i w checkoutcie; ceny w DB/koszyku zostają w PLN. Każde zamówienie zapisuje `orders.currency` + `fx_rate`; kwoty zamówień (konto/admin/sukces) formatowane wg **waluty zamówienia**, nie locale. Checkout DE: P24 `currency:"EUR"` (karta PL/DE), BLIK = PLN-only → wykluczony z DE. Klucz: `app/_lib/money.ts`, `getEurRate` (`store-settings.ts`, cache+fallback), `RateProvider`/`useEurRate` (seed w root layoucie), `ProductCard` z **wymaganym** propem `rate`.
> ⚠️ **GO-LIVE EUR (po stronie człowieka):** ustaw realny kurs w `/admin/ustawienia` (seed startowy `0.23`); zrób testową sesję EUR (card) na `/de` w sandboxie P24.

## Płatności — Przelewy24 / PayPro (2026-06-29, direct REST API v1)
Operator płatności: **Przelewy24** (PayPro SA), direct REST API v1. Stripe został usunięty.

**Przepływ:**
1. Checkout (`POST /api/checkout`) rejestruje transakcję — wywołuje `registerTransaction()` z `app/_lib/p24.ts`, otrzymuje `token` i zwraca `{ url: trnRequestUrl(token) }` do klienta. Nie istnieje osobna trasa `/api/p24/register` ani Server Action `registerP24Transaction`.
2. Klient przekierowany na `https://secure.przelewy24.pl/trnRequest/{token}` (lub sandbox) — wybiera metodę, płaci.
3. P24 wysyła notyfikację `POST /api/p24/status` z `sign` CRC (podpis z `P24_CRC`). Endpoint weryfikuje kwotę przez `POST /api/v1/transaction/verify` i oznacza zamówienie `paid` + `payment_ref`.
4. Klient wraca na `/checkout/success?order=<orderId>` (dla EUR: `/de/checkout/success?order=<orderId>`) — strona sukcesu jest agnostyczna (nie ufa returnowi, czyta status zamówienia z DB; pokazuje widok „opłacone" lub „w toku" zależnie od statusu).

**Env (P24):**
- `P24_MERCHANT_ID` / `P24_POS_ID` — z panelu PayPro
- `P24_API_KEY` — klucz REST API
- `P24_CRC` — klucz do podpisów CRC (SHA384)
- `P24_BASE_URL` — `https://sandbox.przelewy24.pl` (dev) / `https://secure.przelewy24.pl` (prod)

**Migracje DB (expand-contract):**
- **Migracja 40** (`40_p24_payment_ref.sql`) — dodaje kolumny `payment_ref` + `payment_provider` do `orders`. **NIE odpalona jeszcze** — uruchomić w Supabase SQL Editorze przy cutoverze P24 na produkcję.
- **Migracja 41** (`41_drop_stripe_payment_intent.sql`) — usuwa legacy kolumnę `stripe_payment_intent`. **NIE odpalać teraz** — poczekaj ~30 dni po cutoverze (okno zwrotów Stripe). Po odpaleniu: usunąć `stripe_payment_intent` z `types.ts` i panelu admina (osobny commit).

**Pliki kluczowe:** `app/_lib/p24.ts` (konfiguracja, podpisy CRC, funkcje klienckie: `registerTransaction` / `verifyTransaction` / `refundTransaction`), `app/_lib/p24-events.ts` (walidacja podpisu notyfikacji), `app/api/checkout/route.ts` (rejestruje transakcję P24 w ramach tworzenia zamówienia), `app/api/p24/status/route.ts` (notyfikacja → weryfikacja → settle + idempotencja). Funkcja `refundTransaction` istnieje w `p24.ts`, ale nie jest jeszcze wpięta w żaden endpoint ani panel.

**Sandbox:** panel + dane testowe → `https://sandbox.przelewy24.pl`. Ustaw `P24_BASE_URL=https://sandbox.przelewy24.pl` w `.env.local`.

> ⚠️ **GO-LIVE P24 (po stronie człowieka):** wpisz realne klucze sandbox w `.env.local`; odpal migrację 40 na prod (jeśli jeszcze nie); wykonaj E2E checklist (karta PL/DE, BLIK, przelew, porzucona płatność, duplikat notyfikacji, podrobiony sign). Po ~30 dniach od cutoveru odpal migrację 41 i zrób cleanup commit.

## Edytor WYSIWYG opisów produktu (2026-06-22)
Opisy produktu edytuje się w panelu pełnym edytorem WYSIWYG (**TipTap**) — bez ręcznego HTML. Komponent `app/admin/produkty/[id]/RichTextEditor.tsx` (TipTap, client-only, `immediatelyRender:false`), wpięty w sekcje opisu (PL custom, override, DE) oraz pojedyncze pole „Opis produktu"/„Opis (DE)". Pasek: cofnij/ponów, B/I/U/S, listy, cytat, H2–H4, wyrównanie, kolor, marker, link, obraz (upload przez `uploadProductImage` + `compressIfNeeded`).

**Bezpieczeństwo (WAŻNE):** render = `dangerouslySetInnerHTML` po `sanitizeProductHtml` (`app/_lib/product-html.ts`) — regexowy, dependency-free sanitizer. Whitelist tagów: `p,br,ul,ol,li,strong,em,b,i,u,s,a,h2,h3,h4,span,blockquote,mark,img`. Atrybut `style` dopuszczony **wąsko**: tylko `text-align` (na blokach) i `color` (na `span`), z walidacją (`sanitizeStyleAttr` — odrzuca `url()`/`expression()`/escapes); `img src` tylko http/https. Sanitize-on-save w akcjach zapisu. **Nie poszerzać whitelisty bez adwersarskich testów** w `app/_lib/__tests__/product-html.test.ts`.

## Setup na nowym kompie
```bash
git clone https://github.com/Woodecky10/sklep-meblowy.git
cd sklep-meblowy/sklep-meblowy        # ⚠️ appka jest w ZAGNIEŻDŻONYM podfolderze (package.json tutaj)
npm install                           # node_modules NIE są w repo
# utwórz .env.local na bazie .env.example; sekrety z panelu Vercel albo starego kompa
npm run dev
```
Niezbędne env do dev (nazwy — wartości z Vercel/starego `.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_API_KEY`, `P24_CRC`, `P24_BASE_URL`, `NEXT_PUBLIC_APP_URL`. Pełny szablon: `sklep-meblowy/.env.example`.
> ⚠️ **Ta gałąź zamienia Stripe'a na bezpośredni Przelewy24.** Po merge `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` przestają być czytane przez cokolwiek, a `P24_*` stają się **wymagane** — bez nich `/api/checkout` nie zarejestruje transakcji. `BASELINKER_*`/`BL_STATUS_*`/`CRON_SECRET` usunięte dawno.
> Maile: `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_ADMIN_TO` są ustawione **w Vercelu (Production)**. Lokalnie NIE są potrzebne — bez `RESEND_API_KEY` kod działa w trybie no-op (loguje `[mail] brak RESEND_API_KEY` i nic nie wysyła), więc dev nie zaśmieca skrzynek. Dodaj je do `.env.local` tylko gdy chcesz testować maile z lokalnego builda.
> **Baza i storage są ZDALNE/współdzielone (Supabase).** Migracje już wgrane, obrazy w storage. Nowy komp **nie robi setupu bazy** — wystarczy `.env.local` wskazujący na ten sam projekt Supabase. `.env.local` i `node_modules` są gitignored, więc nie przychodzą z klonem.

## Baza — migracje
**Wszystkie migracje z repo są ODPALONE na produkcyjnym Supabase Z WYJĄTKIEM `47` i `48` (P24).** Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `sklep-meblowy/supabase/migrations/` (kanoniczny katalog); odpala człowiek w Supabase SQL Editorze albo agent przez Supabase MCP (model: pokaż SQL → potwierdź → wykonaj).
> Migracja **47** (`47_p24_payment_ref.sql`) jest **addytywna (expand)** — dodaje `payment_ref` + `payment_provider` i backfilluje istniejące zamówienia jako `stripe`, **nie rusza `stripe_payment_intent`**. Dlatego jest bezpieczna przy żywym kodzie Stripe i odpala się **PRZED** merge tej gałęzi (preview dzieli bazę z produkcją).
> Migracja **48** (`48_drop_stripe_payment_intent.sql`) — **NIE odpalać teraz.** Dopiero ~30 dni po cutoverze, gdy minie okno zwrotów/reklamacji ostatniego zamówienia opłaconego Stripe'em. Po niej: usunąć `stripe_payment_intent` z `types.ts` i z fallbacku w panelu admina.

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (vitest — 268 zielonych) · `npm run build` (Turbopack przechodzi).
> Po przełączeniu gałęzi build/tsc potrafi pokazać „phantom" błędy ze stale cache `.next` (referencje do nieistniejących już tras). Jeśli tak — `rm -rf .next` i ponów.

## Push do origin
Origin wymaga konta **Woodecky10** — `mwlo1403` NIE ma write (push → 403). Każdy push do `main` — za wyraźną zgodą właściciela.
- **Na nowym kompie (najprostsze):** `gh auth login` jako **Woodecky10** i ustaw je jako aktywne — wtedy zwykły `git push` działa.
- **Na kompie gdzie zalogowane są oba konta a GCM odpowiada jako mwlo1403** (stary komp): push jednorazowy z pominięciem GCM:
  ```
  gh auth switch --hostname github.com --user Woodecky10
  git -c credential.helper= -c "credential.https://github.com.helper=!'C:\Program Files\GitHub CLI\gh.exe' auth git-credential" push origin <branch>
  gh auth switch --hostname github.com --user mwlo1403
  ```
- **PR-em (standard):** po pushu brancha `gh pr create --repo Woodecky10/sklep-meblowy --base main --head <branch> ...`, potem `gh pr merge <nr> --merge --delete-branch` (operacje API jako Woodecky10). Po merge `main` auto-deployuje się na produkcję (Vercel). Uwaga: `gh pr merge` tuż po pushu bywa odrzucany (`mergeable: UNKNOWN`) bo GitHub liczy mergeability async — odczekaj i ponów.

## Metoda pracy (tak prowadzone są podprojekty)
brainstorming → spec (`docs/superpowers/specs/`) → plan TDD (`docs/superpowers/plans/`) → implementacja subagent-driven (świeży subagent na task + recenzja po każdym + final whole-branch review) → merge. Panel admina jest **PL-only** (bez i18n). Server actions: `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult` (typ w `app/_lib/types.ts`), updaty castowane `as never`. Komponenty klienckie używają `app/admin/_shared` + `useTransition`.

## ⏸ Gdzie stanęliśmy — P24, 2026-07-29 wieczór (czytaj to pierwsze po przesiadce na inny komputer)

**Ta gałąź (`feat/platnosci-direct-p24`, PR #48) jest przetestowana w sandboxie i gotowa do cutoveru. Na produkcji NADAL płaci Stripe** — dopóki nie ma merge'a, nic się nie zmieniło dla klientów.

Zrobione i potwierdzone pomiarem:
- **Migracja 47 jest na prodzie** (addytywna; `stripe_payment_intent` nietknięta, żywy kod Stripe działa).
- **Pełny przepływ w sandboxie przeszedł na preview:** zamówienie → `trnRequest` → symulator „Mój bank" → Zapłać → notyfikacja → `status=paid`, `payment_ref`, `payment_provider=p24`. Mail potwierdzenia **doszedł**. Duplikat notyfikacji idempotentny; nieudana płatność zostaje `pending`; podrobiony podpis → 400; zaniżona kwota → `pending` + `admin_note`. Zamówienia testowe (#38, #39) usunięte z bazy.
- **Podpisy `register` i `verify` potwierdzone na żywym API**, podpis notyfikacji potwierdzony realną płatnością.
- Klucz API to **„Klucz do raportów"** z panelu (nie „Klucz do zamówień"). Sandbox uruchamia się jednym klikiem: panel produkcyjny → Moje konto → **Konto w SANDBOX**. Panel sandboxa: `https://sandbox.przelewy24.pl/panel` (sam korzeń hosta zwraca 400 — jako `P24_BASE_URL` jest poprawny).
- Narzędzia: **`npm run p24:smoke [-- <url-wdrożenia>]`** (klucze + podpis + czy `urlStatus` trafia w nasz handler) i **`npm run p24:methods`** (metody aktywne na koncie; Apple Pay w sandboxie = `id 252`, aktywne — na produkcji jeszcze NIESPRAWDZONE). Oba tylko do odczytu, nie ruszają pieniędzy.

Co zostało, w tej kolejności:
1. **Klucze produkcyjne `P24_*` w Vercelu w zakresie Production** + `P24_BASE_URL=https://secure.przelewy24.pl`. ⚠️ MUSI być PRZED merge'em — bez nich `/api/checkout` rzuca i płatności online przestają działać (za pobraniem dalej idzie). ⚠️ **Nigdy nie zostawiać kluczy sandboxowych w Production** — kod nie rozpozna, że są testowe, więc sklep „przyjmowałby" płatności, które nigdy nie wpłyną.
2. **Sprawdzić w panelu P24, czy konto jest zweryfikowane/aktywne** („Weryfikacja konta"). Sandbox działa od razu, prawdziwe płatności wymagają zakończonej weryfikacji.
3. Merge #48 → auto-deploy → `npm run p24:smoke -- https://mollien.pl` (potwierdza, że env dojechały i notyfikacja trafia w handler).
4. **Jedna prawdziwa transakcja na 1 zł** na produkcji + zwrot w panelu P24.
5. **Migracja 48** (`drop stripe_payment_intent`) — **bez czekania 30 dni**, bo w bazie NIE MA ani jednego zamówienia opłaconego Stripe'em (sprawdzone: 0 referencji, 0 w statusie `paid`). Potem usunąć `stripe_payment_intent` z `types.ts` i z fallbacku w panelu admina.
6. Usunąć z Vercela `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, wyłączyć webhook w panelu Stripe, zamknąć konto.
7. **Podmienić logotypy** — `public/payments/*.svg` to placeholdery (własne SVG z tekstem, w tym Visa/Mastercard/BLIK — znaków zastrzeżonych nie wolno rysować samemu). Pobrać oficjalny zestaw z panelu P24.

Gotchy, które kosztowały czas i wrócą:
- ⚠️ **Vercel Deployment Protection blokuje notyfikacje P24** — przy `vercel_auth_enabled` `/api/p24/status` oddaje **401**, więc rozliczenie nigdy nie dojdzie. Na czas testów na preview trzeba ją wyłączyć (Settings → Deployment Protection) i **włączyć z powrotem po testach** (preview jest publiczny i dzieli bazę z produkcją).
- ⚠️ **POST na nieistniejącą ścieżkę pod `/api/` zwraca 200 z HTML-em** (udokumentowane zachowanie `not-found` dla odpowiedzi strumieniowanych). Literówka w `urlStatus` = cicha awaria: P24 uzna notyfikację za dostarczoną i nie ponowi. Dlatego `p24:smoke` sprawdza ten adres osobno.
- **Zamówienia z preview lecą do produkcyjnej bazy** (wspólny Supabase) — testowe trzeba usuwać: najpierw `order_items`, potem `orders`.
- **`urlStatus` bierze się z nagłówka `Origin`** (fallback `NEXT_PUBLIC_APP_URL`), czyli z czegoś, co kontroluje klient. Świadomie zostawione, bo dzięki temu test na preview działa bez grzebania w env. Wpływ niski (atakujący płaci swoimi pieniędzmi, zamówienie zostaje `pending`), ale po cutoverze przestawić na źródło serwerowe.
- Poprawka regulaminu o **„płatności za pobraniem"** (§ 4 ust. 3, commit `a33a8853`) siedzi w tej gałęzi i wejdzie na produkcję razem z merge'em — nie wymaga osobnego działania.

**Na nowym komputerze:** `git pull` + `git checkout feat/platnosci-direct-p24` + `npm install`, a potem odtworzyć **`.env.local`** (gitignored, NIE przychodzi z klonem): Supabase (URL, anon, service_role), `NEXT_PUBLIC_APP_URL` oraz `P24_MERCHANT_ID`/`P24_POS_ID`/`P24_API_KEY`/`P24_CRC` + `P24_BASE_URL=https://sandbox.przelewy24.pl`. Wartości P24 sandbox: panel sandboxa → **MOJE DANE → Ustawienia** („Klucz do CRC" i „Klucz do raportów"), ID konta widać w nagłówku panelu.

## Następny krok
1. **Cutover P24** — kolejność wyżej, w sekcji „Gdzie stanęliśmy".
2. **EUR/Niemcy poza zakresem** (decyzja 2026-07-29: „na razie płatności tylko na Polskę"). Kod rejestruje transakcję w EUR dla `/de`, więc dopóki PayPro nie ma rozliczeń EUR, niemiecki checkout online pokaże błąd po niemiecku (zamówienie zostaje `pending`, bez 500). Dostawa i tak jest tylko po Polsce (regulamin § 5), a za pobraniem na `/de` działa.
4. **Podprojekt 3 (faktury KSeF)** — czeka na odpowiedź: z jakiego programu fakturowego korzysta księgowa (przesądza drogę); potem spec → plan → wdrożenie.
5. **Reszta podprojektu 4 (wysyłka)** — termin dostawy, dane transportu, model kosztu.

## Drobne follow-upy (nieblokujące)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są **migracje**.
- Stary `.env.local` (gitignored, nie przychodzi z klonem) może mieć nieużywane już zmienne po dawnej integracji magazynowej — można wyczyścić ręcznie, aplikacja ich nie czyta.
- Migracje `07`, `11`, `24`, `25` tworzyły, a `34` usunęła strukturę dawnej integracji magazynowej. Pliki zostają jako rejestr tego, co realnie odpalono na bazie — nie kasować, bo numeracja i historia schematu przestałyby się zgadzać.
