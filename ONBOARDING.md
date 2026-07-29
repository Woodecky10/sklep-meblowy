# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Stripe**. Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny: **PL** (korzeń) + **DE** (`/de`, ceny w EUR).

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-07-29)
`origin/main` = `396e3f4`, **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`: `tsc` 0 · `lint` 0 błędów (4 znane warningi) · **797 testów** (vitest) · `build` przechodzi (Turbopack).

### Maile transakcyjne — UZBROJONE i przetestowane na produkcji (2026-07-29)
Kod był gotowy od 2026-07-28, brakowało konfiguracji — zrobione i sprawdzone realnym zamówieniem na mollien.pl. Działa: potwierdzenie zamówienia, „Nowe zamówienie" do właścicielki, „w drodze" (z przewoźnikiem i trackingiem), „anulowane". Maile wychodzą TYLKO przy statusach `shipped` i `cancelled` (`NOTIFY_STATUSES` w `app/_lib/mail/status-notify.ts`) — „Dostarczone"/„W realizacji"/„Opłacone" świadomie nie mailują.

- **Adresy — jeden kontaktowy, celowo:** `MAIL_FROM` = `Mollien <zamowienia@mollien.pl>` (ten adres **nie jest skrzynką** i nie musi być — do wysyłki wystarcza zweryfikowana domena; nie „naprawiaj" tego zakładaniem skrzynki). `MAIL_REPLY_TO` = `MAIL_ADMIN_TO` = `COMPANY.email` = **mollien.julia@gmail.com**.
- **DNS:** strefa w **home.pl** (Domeny → mollien.pl → karta „Hosting DNS" → DZIAŁANIA → „Zarządzaj rekordami DNS"), NIE w Vercelu. Cztery rekordy: `TXT resend._domainkey`, `MX send` (prio 10), `TXT send` (SPF), `TXT _dmarc`. Domena w Resend = Verified. **MX na apex świadomie NIE ma** („Enable Receiving" w Resend wyłączone) — dlatego na `@mollien.pl` nie da się nic odebrać i dlatego reply-to jest na Gmailu.
- **Gdy maile nie dochodzą:** `sendMail` nigdy nie rzuca, tylko loguje. Vercel → zakładka **Logs** (Runtime, nie Build) → filtr `[mail]`. `brak RESEND_API_KEY`/`brak MAIL_FROM` = zmienna nie dojechała do wdrożenia (**po zmianie zmiennej trzeba Redeploy** — wdrożenie ma zamrożony zestaw z builda). Drugie źródło: Resend → Logs, jedyne miejsce gdzie widać nieudaną wysyłkę (kod nie zapisuje i nie ponawia).
- **ZOSTAŁO:** mail weryfikacyjny konta idzie wbudowanym mailerem Supabase (limit kilku/godzinę, domyślny szablon). Podpięcie: `docs/maile-konfiguracja.md` sekcja 3.

### Inne otwarte drobiazgi po 2026-07-29
- **Zamówienia #36 i #37** w produkcyjnej bazie to testy maili — czekają na decyzję, czy usunąć (usuwać: najpierw `order_items`, potem `orders`).
- **5 plików migracji po BaseLinkerze** (`07`, `11`, `24`, `25`, `34`) — do usunięcia ręcznie; `grep -ri baselinker` nie będzie pusty i to NIE regresja czystki. Stan spójny: `09` nie tworzy kolumny, `34` dropuje z `if exists`.
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
> Maile: `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_ADMIN_TO` są ustawione **w Vercelu (Production)**. Lokalnie NIE są potrzebne — bez `RESEND_API_KEY` kod działa w trybie no-op (loguje `[mail] brak RESEND_API_KEY` i nic nie wysyła), więc dev nie zaśmieca skrzynek. Dodaj je do `.env.local` tylko gdy chcesz testować maile z lokalnego builda.
> **Baza i storage są ZDALNE/współdzielone (Supabase).** Migracje (29–34) już wgrane, obrazy w storage. Nowy komp **nie robi setupu bazy** — wystarczy `.env.local` wskazujący na ten sam projekt Supabase. `.env.local` i `node_modules` są gitignored, więc nie przychodzą z klonem.

## Baza — migracje
**WSZYSTKIE migracje (przez 34) są ODPALONE** na produkcyjnym Supabase (29–32: 2026-06-23; 33–34: 2026-06-24). Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `sklep-meblowy/supabase/migrations/`; odpala **człowiek** w Supabase SQL Editorze (agent NIE ma dostępu DDL).

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (vitest — ~208 zielonych) · `npm run build` (Turbopack przechodzi).
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
1. **EUR go-live:** ustaw realny kurs w `/admin/ustawienia`; testowa sesja EUR (card+p24) na `/de`.
2. **Podprojekt 3 (faktury KSeF)** — czeka na odpowiedź: z jakiego programu fakturowego korzysta księgowa (przesądza drogę); potem spec → plan → wdrożenie.
3. **Reszta podprojektu 4 (wysyłka)** — termin dostawy, dane transportu, model kosztu.

## Drobne follow-upy (nieblokujące)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są **migracje**.
- Stary `.env.local` (gitignored, nie przychodzi z klonem) może mieć nieużywane już zmienne po dawnej integracji magazynowej — można wyczyścić ręcznie, aplikacja ich nie czyta.
- Migracje `07`, `11`, `24`, `25` tworzyły, a `34` usunęła strukturę dawnej integracji magazynowej. Pliki zostają jako rejestr tego, co realnie odpalono na bazie — nie kasować, bo numeracja i historia schematu przestałyby się zgadzać.
