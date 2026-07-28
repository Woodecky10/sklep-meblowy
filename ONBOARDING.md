# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Stripe**. Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny: **PL** (korzeń) + **DE** (`/de`, ceny w EUR).

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-07-28)
`origin/main` = `a58e8d3` (2026-07-27), **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`, sprawdzone 2026-07-28: `npx tsc --noEmit` 0 błędów · `npm run lint` 0 błędów (4 ostrzeżenia o nieużywanych zmiennych) · **748 testów w 61 plikach** (vitest) · `npm run build` przechodzi (Turbopack). Dodatkowo 7 plików e2e (Playwright, odpalane ręcznie).

Ostatnio scalone (pełna lista: `gh pr list --state merged`):
- **#96 / #97** — **cechy tkanin**: wodoodporna / przyjazna zwierzętom / łatwa w czyszczeniu jako pigułki na karcie produktu + **edytowalny słownik cech** w panelu (migracje 63/64).
- **#89 / #90** — krótkie info o tkaninie w pickerze (ikona obok „szczegóły"), limit 500 znaków.
- **#91 / #93** — parametry produktu w adminie: nazwy i wartości wybierane z listy zamiast wpisywania z palca.
- **#94** — wybór już wgranego zdjęcia zamiast ponownego uploadu.
- **#85 / #86 / #88** — warianty: zdjęcia jako swatche (poza główną galerią), tooltip „info o wariancie" + globalny słownik, a11y tooltipa.
- **#83 / #84 / #87 / #95** — fixy: zapis kategorii produktu (auto-reset formularza React 19), lightbox galerii przez portal, strażnik niezapisanych zmian łapie „wstecz", dymki wariantów nie chowają się pod nagłówkiem.
- **#45** (starsze, ale wciąż istotne) — przełącznik języka DE/PL używa natywnego `<a>`, nie `<Link>`. Locale niesie nagłówek `x-locale` (proxy), a chrome (TopBar/Navbar/Footer) jest serwerowy w root layoucie — App Router NIE re-renderuje root layoutu przy soft-nav, więc soft-switch tłumaczył tylko stronę. **Nie zamieniać `<a>` z powrotem na `<Link>` w `LanguageSwitcher`.**

### Otwarte PR-y (2026-07-28 — wszystkie zielone i scalalne, `main` domergowany do każdego)
- **#62** — usunięcie jednorazowego skryptu `rehost-bl-images.mjs`; domyka wycięcie BaseLinkera. Bez wpływu na runtime.
- **#98** — `.gitignore` na zrzuty ekranu i `.playwright-mcp/` w korzeniu repo.
- **#78** — przycisk „na górę" w adminie + wyszukiwanie odporne na spacje i kolejność słów. Migracja `65_products_search_key` **jest już na produkcji** (odpalona 2026-07-21 jeszcze pod numerem 61; przenumerowana przy merge'u main-a, bo 61 zajęło `61_variant_info`). Cała jest idempotentna, więc ponowne odpalenie to no-op.
- **#92** — filtry na `/sklep` z parametrów produktu zamiast koloru/tkaniny (moduł `fabric-filter` usunięty; katalog tkanin i `/tkaniny` nietknięte). Do merge'a dochodzi **osobna operacja SQL na prodzie**: odznaczenie flagi „filtrowalna" dla opcji „Kolor nóżek".
- **#48** — migracja płatności **Stripe → bezpośrednie Przelewy24/PayPro**. ⚠️ Migracje `47_p24_payment_ref` i `48_drop_stripe_payment_intent` **NIE są jeszcze na produkcji** — odpalić przy merge'u. Konflikt z zestawami (bundles) rozstrzygnięty w merge-commicie `9466ce6` — uzasadnienia decyzji o kwotach są w jego komunikacie, przeczytaj przed merge'em.

## Duży kierunek: rezygnacja z BaseLinkera — ZAKOŃCZONA
Decyzja właścicielki (2026-06-17): sklep przejął funkcje BaseLinkera natywnie. **BaseLinker został KOMPLETNIE wycięty** z kodu, configu, env, kolumn DB i danych (obrazy przehostowane). `grep -ri baselinker app/` = pusty. **Konto BaseLinker można zamknąć** bez utraty obrazów ani funkcji. Dawne audyty BL (`docs/audyt-baselinker-*`, `docs/bl-*`) są nieaktualne (legacy).

4 podprojekty programu „zastąpienie BL":
1. ✅ **Panel zarządzania zamówieniami** — na `main`.
2. ✅ **Natywne tworzenie produktów** — na `main`.
3. ⬜ **Faktury / VAT — przez KSeF** — TODO, czeka na odpowiedzi właścicielki. USTALENIE 2026-06-18: faktury **MUSZĄ być w KSeF** (obowiązkowy od 1.04.2026 dla „pozostałych przedsiębiorców"). **Rekomendacja: NIE budować bezpośredniej integracji KSeF** — sklep zbiera dane → API programu fakturowego (Fakturownia/wFirma/inFakt/Comarch), który robi KSeF+FA(3)+numerację+PDF+UPO. W kodzie ZERO podstaw (brak NIP/danych firmy/VAT/podziału netto-brutto). Najważniejsze pytanie: z jakiego programu fakturowego korzysta księgowa.
4. 🟡 **Wysyłka — transport firmą transportową (NIE kurier)** — slice 1 ZROBIONY (PR #38: klient widzi przewoźnika + tracking w `/konto/zamowienia/[id]`). ⬜ Reszta: planowany termin dostawy, dane dla firmy transportowej (piętro/winda/wniesienie/telefon), model kosztu. Gabarytów nie wozi kurier → bez integracji API kuriera, moduł ręczny.

Pytania do właścicielki (faktury KSeF + wysyłka): `sklep-meblowy/docs/2026-06-18-rozpoznanie-faktury-wysylka.md`.

## Ceny EUR na /de (2026-06-24, PR #42)
Klient na `/de` widzi i **płaci w EUR**; PL (`/`) bez zmian (PLN). Stały kurs PLN→EUR w tabeli `store_settings`, edytowalny w **`/admin/ustawienia`** (bez deploya). Konwersja `eur = ceil(pln × kurs)` tylko przy wyświetlaniu (`formatMoney`) i w checkoutcie; ceny w DB/koszyku zostają w PLN. Każde zamówienie zapisuje `orders.currency` + `fx_rate`; kwoty zamówień (konto/admin/sukces) formatowane wg **waluty zamówienia**, nie locale. Checkout DE: Stripe `currency:"eur"`, `locale:"de"`, `payment_method_types:["card","p24"]` (BLIK = PLN-only → wykluczony z DE; p24 wspiera EUR — potwierdzone w docs Stripe). Klucz: `app/_lib/money.ts`, `getEurRate` (`store-settings.ts`, cache+fallback), `RateProvider`/`useEurRate` (seed w root layoucie), `ProductCard` z **wymaganym** propem `rate`.
> ⚠️ **GO-LIVE EUR (po stronie człowieka):** ustaw realny kurs w `/admin/ustawienia` (seed startowy `0.23`); zrób testową sesję EUR (card+p24) na `/de` — fix BLIK nie był weryfikowany na żywym Stripe.

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
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`. Pełny szablon: `sklep-meblowy/.env.example`.
> Zmienne `BASELINKER_*`/`BL_STATUS_*`/`CRON_SECRET` zostały USUNIĘTE (BL wycięty) — nie są już potrzebne.
> **Baza i storage są ZDALNE/współdzielone (Supabase).** Migracje (29–34) już wgrane, obrazy w storage. Nowy komp **nie robi setupu bazy** — wystarczy `.env.local` wskazujący na ten sam projekt Supabase. `.env.local` i `node_modules` są gitignored, więc nie przychodzą z klonem.

## Baza — migracje
**Wszystkie migracje z `main` (60 plików, numeracja do 64) są ODPALONE** na produkcyjnym Supabase — sprawdzone `list_migrations` 2026-07-28. Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `sklep-meblowy/supabase/migrations/`.

**Odpalanie:** agent MA dostęp DDL przez **Supabase MCP** (`apply_migration`) — connected project to **produkcja**, więc każde wywołanie idzie na żywą bazę. Wariant awaryjny: człowiek w Supabase SQL Editorze.

> ⚠️ **Auto-apply po merge'u nie działa** — migracja scalona do `main` NIE wjeżdża sama na bazę (potwierdzone 2× na migracjach 57 i 58). Po każdym merge'u PR-a z migracją: `list_migrations` / `list_tables` i zaaplikuj ręcznie.
> ⚠️ **Numeracja kolizjuje na długo żyjących branchach.** Dwa równolegle otwarte PR-y potrafią zająć ten sam numer (61 = `variant_info` na `main` i `products_search_key` w #78). Przed merge'em sprawdź, czy numer jest wolny na `main`, i przenumeruj plik brancha — migracje pisz idempotentnie (`if not exists`), żeby przenumerowanie nie groziło podwójnym odpaleniem.

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0 błędów; 4 ostrzeżenia o nieużywanych zmiennych są znane) · `npm test` (vitest — **748 zielonych** w 61 plikach) · `npm run build` (Turbopack przechodzi) · `npm run test:e2e` (Playwright, 7 plików — wymaga sesji admina, patrz `e2e/.auth`).
> Po przełączeniu gałęzi build/tsc potrafi pokazać „phantom" błędy ze stale cache `.next` (referencje do nieistniejących już tras — np. `Cannot find module '../../../app/api/webhook/route.js'` po skoku na branch #48, który wycina Stripe'a). Jeśli tak — `rm -rf .next` i ponów.
> Nie odpalaj `npm run build`, gdy w tle chodzi `next dev` — build psuje `.next` dev-serwera i localhost zaczyna serwować stary render. Wtedy: ubij proces na `:3000`, `rm -rf .next`, restart.

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
0. **Domknięcie otwartych PR-ów** (kolejność: 62 → 98 → 78 → 92 → 48) — patrz „Otwarte PR-y" wyżej. Przy #92 i #48 dochodzi robota na bazie prod.
1. **EUR go-live:** ustaw realny kurs w `/admin/ustawienia`; testowa sesja EUR (card+p24) na `/de`.
2. **Zamknięcie konta BaseLinker** — można (obrazy przehostowane, kod/dane czyste).
3. **Podprojekt 3 (faktury KSeF)** — czeka na odpowiedź: z jakiego programu fakturowego korzysta księgowa (przesądza drogę); potem spec → plan → wdrożenie.
4. **Reszta podprojektu 4 (wysyłka)** — termin dostawy, dane transportu, model kosztu.

## Drobne follow-upy (nieblokujące)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są **migracje**.
- `.env.local` może mieć puste `BASELINKER_*` (gitignored) — można wyczyścić ręcznie.
- `scripts/rehost-bl-images.mjs` — jednorazowy, idempotentny skrypt migracji obrazów; zostaje w repo jako ślad (nieszkodliwy).
