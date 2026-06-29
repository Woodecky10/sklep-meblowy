# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Przelewy24** (PayPro, direct REST API v1). Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny: **PL** (korzeń) + **DE** (`/de`, ceny w EUR).

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-06-29)
`origin/main` = `f7ea7b6`, **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`: `tsc` 0 · `lint` 0 · **258 testów** (vitest) · `build` przechodzi (Turbopack).

Ostatnio scalone:
- **PR #41** — domknięcie wycieków PL na `/de` (redirecty/linki gubiły prefiks `/de`, komunikaty błędów po DE).
- **PR #42** — **ceny w EUR na `/de`** (patrz sekcja niżej).
- **PR #43** — **pełne wycięcie BaseLinkera** (kod, API, cron, panel admina, env, migr. 34 drop kolumn/tabeli).
- **PR #44** — przehostowanie obrazów 15 produktów z CDN BaseLinkera → Supabase storage (skrypt `scripts/rehost-bl-images.mjs`).
- **PR #45** — fix przełącznika języka DE/PL: `<Link>`→natywny `<a>` (pełny reload). Locale niesie nagłówek `x-locale` (proxy), a chrome (TopBar/Navbar/Footer) jest serwerowy w root layoucie — App Router NIE re-renderuje root layoutu przy soft-nav, więc soft-switch tłumaczył tylko stronę. **Nie zamieniać `<a>` z powrotem na `<Link>` w `LanguageSwitcher`.**

## Duży kierunek: rezygnacja z BaseLinkera — ZAKOŃCZONA
Decyzja właścicielki (2026-06-17): sklep przejął funkcje BaseLinkera natywnie. **BaseLinker został KOMPLETNIE wycięty** z kodu, configu, env, kolumn DB i danych (obrazy przehostowane). `grep -ri baselinker app/` = pusty. **Konto BaseLinker można zamknąć** bez utraty obrazów ani funkcji. Dawne audyty BL (`docs/audyt-baselinker-*`, `docs/bl-*`) są nieaktualne (legacy).

4 podprojekty programu „zastąpienie BL":
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
- **Migracja 39** (`39_p24_payment_ref.sql`) — dodaje kolumny `payment_ref` + `payment_provider` do `orders`. **NIE odpalona jeszcze** — uruchomić w Supabase SQL Editorze przy cutoverze P24 na produkcję.
- **Migracja 40** (`40_drop_stripe_payment_intent.sql`) — usuwa legacy kolumnę `stripe_payment_intent`. **NIE odpalać teraz** — poczekaj ~30 dni po cutoverze (okno zwrotów Stripe). Po odpaleniu: usunąć `stripe_payment_intent` z `types.ts` i panelu admina (osobny commit).

**Pliki kluczowe:** `app/_lib/p24.ts` (konfiguracja, podpisy CRC, funkcje klienckie: `registerTransaction` / `verifyTransaction` / `refundTransaction`), `app/_lib/p24-events.ts` (walidacja podpisu notyfikacji), `app/api/checkout/route.ts` (rejestruje transakcję P24 w ramach tworzenia zamówienia), `app/api/p24/status/route.ts` (notyfikacja → weryfikacja → settle + idempotencja). Funkcja `refundTransaction` istnieje w `p24.ts`, ale nie jest jeszcze wpięta w żaden endpoint ani panel.

**Sandbox:** panel + dane testowe → `https://sandbox.przelewy24.pl`. Ustaw `P24_BASE_URL=https://sandbox.przelewy24.pl` w `.env.local`.

> ⚠️ **GO-LIVE P24 (po stronie człowieka):** wpisz realne klucze sandbox w `.env.local`; odpal migrację 39 na prod (jeśli jeszcze nie); wykonaj E2E checklist (karta PL/DE, BLIK, przelew, porzucona płatność, duplikat notyfikacji, podrobiony sign). Po ~30 dniach od cutoveru odpal migrację 40 i zrób cleanup commit.

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
> Zmienne `STRIPE_*`, `BASELINKER_*`/`BL_STATUS_*`/`CRON_SECRET` zostały USUNIĘTE — nie są już potrzebne.
> **Baza i storage są ZDALNE/współdzielone (Supabase).** Migracje (29–34) już wgrane, obrazy w storage. Nowy komp **nie robi setupu bazy** — wystarczy `.env.local` wskazujący na ten sam projekt Supabase. `.env.local` i `node_modules` są gitignored, więc nie przychodzą z klonem.

## Baza — migracje
**Migracje 29–38 są ODPALONE** na produkcyjnym Supabase (29–32: 2026-06-23; 33+34: 2026-06-24; 35+36: 2026-06-25; 37+38: 2026-06-25). Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `supabase/migrations/`; odpala **człowiek** w Supabase SQL Editorze (agent NIE ma dostępu DDL).
> Migracja **39** (`39_p24_payment_ref.sql`) jest w repo ale **NIE odpalona** — uruchomić przy cutoverze P24 na produkcję. Migracja **40** (`40_drop_stripe_payment_intent.sql`) jest w repo ale **NIE odpalać teraz** — patrz sekcja Płatności.

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (vitest — 258 zielonych) · `npm run build` (Turbopack przechodzi).
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

## Następny krok
1. **P24 sandbox go-live (po stronie człowieka):** wpisz klucze sandbox P24 w `.env.local`; wykonaj E2E checklist (karta PL/DE, BLIK, przelew, porzucona, duplikat notyfikacji, podrobiony sign). Patrz sekcja Płatności wyżej.
2. **EUR go-live:** ustaw realny kurs w `/admin/ustawienia`; testowa sesja EUR (card) na `/de` w sandboxie P24.
3. **Migracja 40 (cleanup Stripe):** ~30 dni po cutoverze odpal `40_drop_stripe_payment_intent.sql`, potem usuń `stripe_payment_intent` z `types.ts` i panelu admina.
4. **Zamknięcie konta BaseLinker** — można (obrazy przehostowane, kod/dane czyste).
5. **Podprojekt 3 (faktury KSeF)** — czeka na odpowiedź: z jakiego programu fakturowego korzysta księgowa (przesądza drogę); potem spec → plan → wdrożenie.
6. **Reszta podprojektu 4 (wysyłka)** — termin dostawy, dane transportu, model kosztu.

## Drobne follow-upy (nieblokujące)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są **migracje**.
- `.env.local` może mieć puste `BASELINKER_*` (gitignored) — można wyczyścić ręcznie.
- `scripts/rehost-bl-images.mjs` — jednorazowy, idempotentny skrypt migracji obrazów; zostaje w repo jako ślad (nieszkodliwy).
