# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Stripe**. Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny: **PL** (korzeń) + **DE** (`/de`, ceny w EUR).

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-07-29)
`origin/main` = `18bba5af`, **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`: `tsc` 0 · `lint` 0 błędów (4 znane warningi) · **856 testów** (vitest, 70 plików) · `build` przechodzi (Turbopack).

Wieczorem 2026-07-29 domknięta cała kolejka PR-ów: **#110** (pakiet techniczny SEO — `/og`, `/feed.xml`, JSON-LD Organization + breadcrumby), **#78** (BackToTop w adminie + wyszukiwanie odporne na spacje i kolejność słów), **#100** (licznik nowych zamówień w panelu), **#92** (filtry z parametrów produktu zamiast koloru/tkaniny), **#111** (sprzątanie migracji po BL). Zamknięte bez merge jako zdublowane dzisiejszą pracą: **#99** (ONBOARDING, zastąpiony przez #109) i **#62** (skrypt rehost, usunięty w #105/#106). Otwarty zostaje tylko **#48** (Przelewy24). **Stan na 2026-07-30:** konflikty zniknęły — gałąź scaliła `main` (`origin` = `d99fe36`), PR jest `MERGEABLE`/`CLEAN` (55 plików, +2987/−513), a **migracja 47 jest już wgrana na prodzie** (`orders.payment_provider`, `orders.payment_ref` istnieją). Do merge brakuje: transakcji w sandboxie P24 i zmiennych `P24_MERCHANT_ID/POS_ID/API_KEY/CRC/P24_BASE_URL` w Vercelu (po dodaniu — Redeploy). ⚠️ Migrację `48_drop_stripe_payment_intent` z tej gałęzi wgrywaj **po** deployu, nie przed — dropuje kolumnę, którą obecny prod jeszcze czyta.

### Maile transakcyjne — UZBROJONE i przetestowane na produkcji (2026-07-29)
Kod był gotowy od 2026-07-28, brakowało konfiguracji — zrobione i sprawdzone realnym zamówieniem na mollien.pl. Działa: potwierdzenie zamówienia, „Nowe zamówienie" do właścicielki, „w drodze" (z przewoźnikiem i trackingiem), „anulowane". Maile wychodzą TYLKO przy statusach `shipped` i `cancelled` (`NOTIFY_STATUSES` w `app/_lib/mail/status-notify.ts`) — „Dostarczone"/„W realizacji"/„Opłacone" świadomie nie mailują.

- **Adresy — jeden kontaktowy, celowo:** `MAIL_FROM` = `Mollien <zamowienia@mollien.pl>` (ten adres **nie jest skrzynką** i nie musi być — do wysyłki wystarcza zweryfikowana domena; nie „naprawiaj" tego zakładaniem skrzynki). `MAIL_REPLY_TO` = `MAIL_ADMIN_TO` = `COMPANY.email` = **mollien.julia@gmail.com**.
- **DNS:** strefa w **home.pl** (Domeny → mollien.pl → karta „Hosting DNS" → DZIAŁANIA → „Zarządzaj rekordami DNS"), NIE w Vercelu. Cztery rekordy: `TXT resend._domainkey`, `MX send` (prio 10), `TXT send` (SPF), `TXT _dmarc`. Domena w Resend = Verified. **MX na apex świadomie NIE ma** („Enable Receiving" w Resend wyłączone) — dlatego na `@mollien.pl` nie da się nic odebrać i dlatego reply-to jest na Gmailu.
- **Gdy maile nie dochodzą:** `sendMail` nigdy nie rzuca, tylko loguje. Vercel → zakładka **Logs** (Runtime, nie Build) → filtr `[mail]`. `brak RESEND_API_KEY`/`brak MAIL_FROM` = zmienna nie dojechała do wdrożenia (**po zmianie zmiennej trzeba Redeploy** — wdrożenie ma zamrożony zestaw z builda). Drugie źródło: Resend → Logs, jedyne miejsce gdzie widać nieudaną wysyłkę (kod nie zapisuje i nie ponawia).
- ~~**ZOSTAŁO:** mail weryfikacyjny konta idzie wbudowanym mailerem Supabase~~ — ZROBIONE 2026-07-30, razem z resetem hasła. Oba maile Auth idą teraz przez Resend (custom SMTP w Supabase) w brandingu sklepu, nadawca **`no-reply@mollien.pl`** (celowo inny niż `MAIL_FROM` dla zamówień — pole w Supabase jest niezależne od zmiennej w Vercelu). Szablony w repo: `AuthConfirm.tsx` i `PasswordReset.tsx` → `npm run preview:mail` → wklejka w panelu.
  - ⚠️ **Reset hasła był zepsuty od początku** i nikt tego nie zauważył: link w domyślnym szablonie Supabase (`{{ .ConfirmationURL }}`) nie dowozi `token_hash`, którego wymaga `app/auth/confirm/route.ts`, więc klient nie dostawał sesji recovery i krążył między `/zapomnialem-hasla` a mailem. Naprawione — link idzie wprost do naszej trasy. **Nie wracaj do `{{ .ConfirmationURL }}`.**
  - Testując reset, używaj **incognito** (`/reset-hasla` wymaga jakiejkolwiek sesji, więc zalogowany user maskuje awarię) i weryfikuj w **Resend → Logs** — kolumna `auth.users.recovery_sent_at` przy udanym resecie została `null`, a `auth.audit_log_entries` jest puste.
  - Pełna procedura i pułapki (Site URL bez `https://` → link relatywny; Redirect URLs bez `mollien.pl` → `requested path is invalid`): `docs/maile-konfiguracja.md` sekcje 3 i 3b.

### Logowanie Google — gdzie stoi klient OAuth (namiary, 2026-07-30)
Klienta OAuth nie ma ani w repo, ani w dokumentacji — żyje wyłącznie w Google Cloud i szukanie go zajęło pół godziny. Namiary:
- **Konto:** `miki19991@gmail.com`. Od 2026-07-30 dostęp ma też `mollien.julia@gmail.com` (wcześniej projekt wisiał na jednym prywatnym koncie).
- **Projekt:** `Sklep-meblowy`, **numer `614212632886`**, utworzony 21.04.2026, **poza organizacją** („No organization").
- **Klient:** „Sklep meblowy Web", typ *Aplikacja internetowa*. Client ID zaczyna się od numeru projektu — po tym prefiksie rozpoznasz, którego projektu szukać, patrząc na Client ID w Supabase → Authentication → Sign In / Providers → Google.
- **Authorized redirect URI:** `https://tlvgsddpiikolgdwuwmc.supabase.co/auth/v1/callback`. Google odsyła do **Supabase**, nie do sklepu — adresy sklepu żyją w Supabase → URL Configuration → Redirect URLs. Nie dodawaj tu `mollien.pl`.
- ⚠️ **Przełącznik projektów w konsoli tego projektu NIE znajduje** — filtruje po organizacji `miki19991-org`, a projekt jest poza organizacją; szukanie po numerze też nie działa (picker dopasowuje nazwę i ID). Wchodź wprost adresem: `https://console.cloud.google.com/auth/clients?project=614212632886`, albo przez **Menedżer zasobów** (`/cloud-resource-manager`), gdzie widać wszystko z numerami.
- ⚠️ **Stan publikacji — od 2026-07-30 „Wersja produkcyjna".** Do tego dnia aplikacja siedziała w **stanie testowania**, czyli Googlem logowały się WYŁĄCZNIE konta z listy „Użytkownicy testowi" (nasze), a każdy klient dostawał „Access blocked" — działające logowanie w naszych testach maskowało awarię dla wszystkich innych. Jeśli kiedyś klient zgłosi, że nie może wejść przez Google, sprawdzaj to pole pierwsze: Platforma uwierzytelniania Google → **Odbiorcy** → Stan publikacji. Publikacja nie wymaga weryfikacji Google, bo Supabase używa tylko zakresów `email`/`profile`/`openid` (niewrażliwe).
- **Adres e-mail pomocy = `mollien.julia@gmail.com`** (jedyne pole z tego ekranu widoczne publicznie dla klienta; „Dane kontaktowe dewelopera" to prywatny kanał Google → właściciel projektu). ⚠️ Ta lista rozwijana oferuje **tylko adres osoby aktualnie edytującej** albo grupę Google, którą ta osoba zarządza — nadanie komuś uprawnień w projekcie NIE dodaje jego adresu do listy. Dlatego ustawiła to Julia u siebie, po zaakceptowaniu roli **Właściciela** (konfiguracja ekranu zgody jest zarezerwowana dla właścicieli). Jeśli ten adres ma się kiedyś zmienić — musi to zrobić osoba, której adres ma tam trafić.
- **Nazwa na ekranie zgody = `Mollien.pl`. Zgłoszona do weryfikacji 2026-07-30, JESZCZE NIE WIDOCZNA dla klientów.** Po publikacji do produkcji Google wymaga **weryfikacji marki**, żeby wyświetlać nazwę/logo/linki („Elementy marki → Stan weryfikacji"). Do tego czasu klient widzi na ekranie zgody surowy host `tlvgsddpiikolgdwuwmc.supabase.co`. **To nie blokuje logowania** — zakresy `email`/`profile` są niewrażliwe, więc nikt nie dostaje ostrzeżenia o niezweryfikowanej aplikacji; wpływa wyłącznie na wygląd. Decyzja przychodzi mailem na `miki19991@gmail.com`, po kilku dniach. **W trakcie przeglądu nie edytować pól na tym ekranie** — edycja wywala zgłoszenie na koniec kolejki.
  Wymagane dane (bez nich przycisk „Zweryfikuj markę" jest wygaszony): *Strona główna* `https://www.mollien.pl`, *polityka prywatności* `/prywatnosc`, *warunki* `/regulamin`, oraz `mollien.pl` w *Autoryzowanych domenach*.
  Pierwsze zgłoszenie Google **odrzucił** z trzema powodami — warto znać, jeśli trzeba będzie podejść jeszcze raz:
  1. *„strona główna nie jest zarejestrowana na Ciebie"* — potrzebna w Search Console usługa typu **Prefiks URL** dla `https://www.mollien.pl/`; sama usługa „Domena" temu testowi nie wystarcza,
  2. *„strona główna nie wyjaśnia celu aplikacji"* — na to nie mamy realnego wpływu, sklep jest sklepem,
  3. *„nazwa aplikacji nie pasuje do nazwy na stronie głównej"* — dlatego nazwa brzmi `Mollien.pl`, znak w znak jak logo w Navbarze (`COMPANY.displayName`), a nie `Mollien` (`COMPANY.brandName`). Ten test jest dosłowny.
  **Logo pomijamy świadomie** — wymaga tej samej weryfikacji, a nic nie wnosi. Nie usuwać `tlvgsddpiikolgdwuwmc.supabase.co` z autoryzowanych domen: na niej stoi endpoint OAuth.

### Inne otwarte drobiazgi po 2026-07-29
- ~~**Zamówienia #36 i #37**~~ — ZROBIONE 2026-07-29: `#36` już nie istniało, `#37` (COD 139 zł, „Test Testowy", tracking `TEST123`) usunięte na życzenie Mikołaja — najpierw `order_items`, potem `orders`; zweryfikowane: 0 osieroconych pozycji, zostało 6 zamówień. Numeracja idzie dalej od 38 (luka po 35–37 zostaje, `order_number` to sekwencja).
- ⚠️ **Prod serwuje `www.mollien.pl`, a kod deklaruje apex.** `https://mollien.pl` → **308** → `https://www.mollien.pl`, ale canonicale, `sitemap.xml`, `og:image` i URL-e w JSON-LD wskazują apex (`metadataBase` z `NEXT_PUBLIC_APP_URL`, `COMPANY.domain`). Google podąża za 308 i skanonikalizuje do `www`, więc nie jest to awaria.
  **Search Console jest już podłączona** (2026-07-30 potwierdzone: usługa „Domena" `mollien.pl` + „Prefiks URL" `https://www.mollien.pl/`), więc raportowanie nie jest zagrożone i nic nie blokuje.
  ⚠️ **Rekomendacja ZMIENIONA 2026-07-30: dopasować KOD do `www`, a NIE przestawiać Vercela na apex.** Wcześniej w tym pliku było odwrotnie, przy założeniu, że nie ma czego chronić w indeksie. Jest: Search Console pokazuje **409 stron zindeksowanych** i kliknięcia z wyszukiwarki od 29.04.2026, czyli indeks jest ugruntowany pod `www`. Przełączenie hosta wymusiłoby migrację całego indeksu bez żadnego zysku.
  Do zrobienia: origin kanoniczny na `www.mollien.pl` + `NEXT_PUBLIC_APP_URL` w Vercelu + Redeploy. ⚠️ Nie przez samą podmianę `COMPANY.domain` — ta stała jest też **tekstem marki** (regulamin, stopka maili, etykieta na `/og`), więc potrzebna osobna stała na origin. Uwaga na Merchant Center: `<g:link>` w `/feed.xml` musi zgadzać się z domeną zaclaimowaną w panelu, więc feed i claim trzeba przestawić razem z kodem.
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

### Dostęp agenta do bazy (MCP Supabase)
Agent czyta i zmienia bazę przez serwer MCP Supabase, a ten wymaga **osobistego tokenu dostępowego** — to NIE jest żaden z kluczy z `.env.local`. Token generujesz w `https://supabase.com/dashboard/account/tokens` (pokazywany raz).

Konfiguracja siedzi w **`sklep-meblowy/.mcp.json`**, który jest **gitignorowany** (od 2026-07-30) właśnie dlatego, że zawiera ten token — nie przychodzi z klonem i trzeba go utworzyć lokalnie:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "cmd",
      "args": ["/c","npx","--yes","@supabase/mcp-server-supabase@latest",
               "--project-ref=tlvgsddpiikolgdwuwmc","--access-token=TWOJ_TOKEN"]
    }
  }
}
```
⚠️ **Nie przez zmienną `SUPABASE_ACCESS_TOKEN`.** Ta droga działa, dopóki token jest ważny, ale gdy wygaśnie w trakcie pracy, **nie da się jej naprawić bez ubicia procesu**: środowisko proces dostaje raz, przy starcie, więc ani `/mcp` → Reconnect, ani `setx` nie podmienią wartości w działającej sesji. Objaw: wszystkie narzędzia Supabase zwracają `Unauthorized. Please provide a valid access token…`, mimo że `claude mcp get supabase` pokazuje „Connected". Sprawdzenie, czy token jest w ogóle ważny (bez wypisywania go):
```
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects
```
`200` = token dobry, `401` = do wymiany. Straciliśmy na tym pół godziny 2026-07-30.

## Baza — migracje
**WSZYSTKIE migracje z `main` są ODPALONE** na produkcyjnym Supabase — sprawdzone 2026-07-30 przez `list_migrations`. Uwaga na dwa mylące wpisy: migracja `65_products_search_key` figuruje w bazie pod starą nazwą `61_products_search_key` (plik przenumerowano w repo z powodu kolizji z `61_variant_info`; jest w całości wgrana — `search_key` i `search_key_de` + dwa indeksy GIN), a `47_p24_payment_ref` jest wgrana na prodzie, choć pliku nie ma na `main` (leży na gałęzi PR #48). Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `sklep-meblowy/supabase/migrations/`; odpala **człowiek** w Supabase SQL Editorze (agent NIE ma dostępu DDL).

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
