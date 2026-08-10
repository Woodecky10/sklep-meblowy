# Mollien — onboarding / kontynuacja projektu

Przewodnik do podjęcia pracy nad projektem na nowym komputerze / w nowej sesji.

## Co to jest
Sklep meblowy **Mollien** (meble na zamówienie). **Next.js 16** (App Router, Server Actions, Turbopack) + **Supabase** (Postgres + Auth + Storage) + **Przelewy24** (PayPro, direct REST API v1). Aplikacja jest w podfolderze `sklep-meblowy/`. Repo: `Woodecky10/sklep-meblowy`, główny branch `main`. Produkcja: Vercel (auto-deploy z `origin/main`), domena www.mollien.pl. Dwujęzyczny w kodzie: **PL** (korzeń) + **DE** (`/de`, ceny w EUR) — ale **DE jest od 2026-07-31 ZAMROŻONE** (patrz sekcja niżej), więc publicznie sklep jest jednojęzyczny.

> ⚠️ To NIE jest Next.js z treningu — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (Patrz `sklep-meblowy/AGENTS.md`.)

## Stan repo (2026-07-31)
`origin/main` = `11ebcc0`, **na produkcji** (Vercel auto-deployuje z `main`). Bramki na `main`: `tsc` 0 · `lint` 0 błędów (4 znane warningi) · **877 testów** (vitest, 74 pliki) · `build` przechodzi (Turbopack).

Wieczorem 2026-07-29 domknięta cała kolejka PR-ów: **#110** (pakiet techniczny SEO — `/og`, `/feed.xml`, JSON-LD Organization + breadcrumby), **#78** (BackToTop w adminie + wyszukiwanie odporne na spacje i kolejność słów), **#100** (licznik nowych zamówień w panelu), **#92** (filtry z parametrów produktu zamiast koloru/tkaniny), **#111** (sprzątanie migracji po BL). Zamknięte bez merge jako zdublowane dzisiejszą pracą: **#99** (ONBOARDING, zastąpiony przez #109) i **#62** (skrypt rehost, usunięty w #105/#106). **#48 (Przelewy24) — SCALONY 2026-07-31** (`0c4085f`), po testach w sandboxie i weryfikacji kluczy produkcyjnych. Szczegóły w sekcji „Płatności" niżej. **Kolejka PR-ów jest pusta.**

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
Klient na `/de` widzi i **płaci w EUR**; PL (`/`) bez zmian (PLN). Stały kurs PLN→EUR w tabeli `store_settings`, edytowalny w **`/admin/ustawienia`** (bez deploya). Konwersja `eur = ceil(pln × kurs)` tylko przy wyświetlaniu (`formatMoney`) i w checkoutcie; ceny w DB/koszyku zostają w PLN. Każde zamówienie zapisuje `orders.currency` + `fx_rate`; kwoty zamówień (konto/admin/sukces) formatowane wg **waluty zamówienia**, nie locale. Checkout DE: P24 `currency:"EUR"` (karta PL/DE), BLIK = PLN-only → wykluczony z DE. Klucz: `app/_lib/money.ts`, `getEurRate` (`store-settings.ts`, cache+fallback), `RateProvider`/`useEurRate` (seed w root layoucie), `ProductCard` z **wymaganym** propem `rate`.
> ⏸ **Ta funkcjonalność jest ZAMROŻONA od 2026-07-31** — cała mechanika i sposób odmrożenia w sekcji „Wersja niemiecka ZAMROŻONA" zaraz niżej. Kod EUR pozostaje w repo i działa; **nie usuwać**.

## ⏸ Wersja niemiecka ZAMROŻONA (2026-07-31)
Decyzja właściciela: sklep startuje ze sprzedażą **tylko w Polsce**, bo do Niemiec brakuje niemieckiego numeru podatkowego (USt-IdNr / VAT-OSS — **do potwierdzenia z księgową**). Bez niego wystawianie faktur i rozliczenie VAT dla niemieckiego klienta jest nielegalne.

**Wszystko wisi na jednej fladze: `DE_ENABLED` w `app/_lib/i18n.ts`.** `false` powoduje, że:
- `/de/*` odpowiada **redirectem 307 na odpowiednik PL z zachowaną ścieżką** (`/de/sklep` → `/sklep`), obsługa w `app/_lib/supabase/middleware.ts` przez czystą funkcję `frozenDeRedirectPath` (wydzieloną, żeby dała się przetestować bez `NextRequest`). **307, nie 301** — 301 zostałby w cache przeglądarek i w indeksie Google długo po odmrożeniu.
- przełącznik języka nie renderuje się wcale (`LanguageSwitcher` zwraca `null`, użycia w `TopBar`/`MobileMenu` zostają),
- hreflang `de` nie wychodzi z żadnej strony ani ze sitemapy — blokada siedzi **wewnątrz** `alternatesFor` (`sitemap-i18n.ts`), a nie po wywołaniach, żeby nowa strona dodana w przyszłości nie ogłosiła DE mimo zamrożenia; czysty kształt mapy został jako `buildAlternates` (kontrakt na odmrożenie, pokryty testami),
- `sitemap.xml` nie zawiera URL-i `/de/...`,
- `getLocale()` i `useClientLocale()` nie zwrócą `"de"`.

⚠️ **Najważniejsze i najmniej oczywiste:** `/api/checkout` bierze locale z **body żądania** (`body.locale`), nie z URL-a — bo `fetch` do API nie ma prefiksu `/de`. Samo ukrycie `/de` w UI **nie blokowało** więc zamówień w EUR: wystarczył POST z `locale:"de"`. Dlatego locale jest klamrowane serwerowo w route (`DE_ENABLED && body.locale === "de"`). Gdyby ktoś kiedyś dodał drugie wejście przyjmujące locale od klienta — musi przejść tę samą klamrę.

⚠️ **Kodu EUR NIE usuwać** (`money.ts`, `getEurRate`, `RateProvider`, `ProductCard` z propem `rate`, `orders.currency`/`fx_rate`, `buildProductFeedXml` z `locale:"de"`) — jest sprawny, przetestowany i ma wrócić.

**ODMROŻENIE:** `DE_ENABLED = true` i nic więcej w kodzie. Poza kodem: ustawić realny kurs EUR w `/admin/ustawienia` (jest tam seed `0.23`), zgłosić `/de` w Search Console, potwierdzić z PayPro rozliczanie EUR. Testy w `__tests__/i18n.test.ts` i `__tests__/sitemap-i18n.test.ts` asertują `DE_ENABLED === false` — po przełączeniu **wywalą się celowo**, żeby wymusić przegląd oczekiwań zamiast cichego przepuszczenia starego stanu.

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

**Migracje DB (expand-contract):** numery w planie (40/41) NIE zgadzają się z repo — `main` zdążył zająć 40–46, więc realne pliki to **47** i **48**.
- **Migracja 47** (`47_p24_payment_ref.sql`) — dodaje `payment_ref` + `payment_provider` do `orders`. ✅ **ODPALONA na prodzie** (2026-07-29).
- **Migracja 48** (`48_drop_stripe_payment_intent.sql`) — usuwa legacy kolumnę `stripe_payment_intent`. ⬜ **NIE odpalona.** Komentarz w pliku mówi „poczekaj ~30 dni na okno zwrotów Stripe", ale ten powód **nie istnieje**: sprawdzone 2026-07-31, w bazie jest **zero** zamówień z `stripe_payment_intent` i zero z `payment_provider='stripe'` — Stripe nigdy nie rozliczył ani jednego zamówienia, więc nie ma referencji do zwrotów. Można wgrać, kiedy tylko chcemy. Zostawione świadomie na **jeden commit razem z czyszczeniem kodu**, bo drop bez tego robi niespójność: `types.ts:269,331` deklaruje pole, którego nie ma w bazie, a `app/admin/zamowienia/[id]/page.tsx:185,194` czyta je jako fallback. Runtime to zniesie (`select("*")` → `undefined` → falsy → panel pokaże „brak"), ale to dług, nie stan docelowy.

**Pliki kluczowe:** `app/_lib/p24.ts` (konfiguracja, podpisy CRC, funkcje klienckie: `registerTransaction` / `verifyTransaction` / `refundTransaction`), `app/_lib/p24-events.ts` (walidacja podpisu notyfikacji), `app/api/checkout/route.ts` (rejestruje transakcję P24 w ramach tworzenia zamówienia), `app/api/p24/status/route.ts` (notyfikacja → weryfikacja → settle + idempotencja). Funkcja `refundTransaction` istnieje w `p24.ts`, ale nie jest jeszcze wpięta w żaden endpoint ani panel.

**Konto P24 (namiary, 2026-07-31):** panel produkcyjny `panel.przelewy24.pl`, **ID sprzedawcy = ID sklepu = `406297`** (jeden sklep: `MOLLIEN.PL`; widoczne w panelu → „Na skróty"). **Ten sam numer obowiązuje w sandboxie** — różnią się tylko klucze i `P24_BASE_URL`. ID nie jest sekretem: klient widzi je na bramce płatności.
- Klucze: panel → **Moje konto → Konfiguracja API → „(pokaż)"**. ⚠️ Bierz **„Klucz API"**, NIE „Klucz do zamówień" — to drugie jest do starego API `trnRegister`, a nasz kod używa REST v1 z Basic Auth (`posId` : `Klucz API`). Pomyłka objawia się dopiero błędem uwierzytelnienia przy płatności.
- **Adresy IP w Konfiguracji API zostawić na „wszyscy (%)"** — Vercel nie ma stałych adresów wyjściowych, whitelisting zablokowałby nasze wywołania.
- Aktywne metody (sprawdzone `npm run p24:methods` na produkcji): **BLIK, karta, Google Pay, Apple Pay** (26 metod na koncie).

**Dwa środowiska w Vercelu — zakresy MUSZĄ być rozdzielne:** klucze sandbox w zakresie **Preview**, produkcyjne w **Production**. Ta sama nazwa zmiennej może mieć różne wartości per zakres. ⚠️ Nigdy „All Environments" — jedna wartość `P24_BASE_URL` na oba środowiska oznacza albo produkcję strzelającą w sandbox (nikt nie zapłaci), albo testy obciążające prawdziwe karty.

**Narzędzia do diagnozy (bez klikania przez checkout):**
- `npm run p24:smoke` — `testAccess` (Basic Auth) + `register` na 1 zł (**podpis SHA-384** — najczęstsze miejsce błędu). Czyta `.env.local`, nie tworzy zamówienia.
- `npm run p24:methods` — lista metod aktywnych na koncie.

> ✅ **P24 JEST NA PRODUKCJI od 2026-07-31** (PR #48, merge `0c4085f`). Zweryfikowane:
> - **sandbox E2E na preview:** udana płatność przelewem → `status=paid`, `payment_provider=p24`, `payment_ref` zapisany; nieudana (BLIK→błąd) → zostaje `pending` bez `payment_ref`; podrobiona notyfikacja → `400 Bad signature`; powrót z bramki pokazuje „Płatność w toku" (strona **nie ufa** `urlReturn`, czeka na notyfikację).
> - **produkcja:** `p24:smoke` zielony na `secure.przelewy24.pl`, a `POST /api/checkout` zwraca URL bramki produkcyjnej → zmienne dojechały.
> - Duplikat notyfikacji sprawdzony **inspekcją kodu, nie E2E** (brak dostępu do ponowienia w panelu): wczesne wyjście przy `status != pending` + atomowy CAS `UPDATE ... WHERE status='pending'` w `markOrderPaid` → drugie wywołanie zwraca 0 wierszy, więc promo nie rośnie i drugi mail nie wychodzi.
>
> - ✅ **PRAWDZIWA TRANSAKCJA KONTROLNA, 2026-07-31** — zamówienie **#43**: 1,00 zł BLIKiem od realnego kupującego, `payment_ref 4603319576`, samo przeszło na `paid` z notyfikacji; na koncie P24 wpłynęło **0,69 zł** (31 gr prowizji — BLIK ma stawkę minimalną, przy realnych kwotach to ~1,5%). Zamówienie **zostawione w bazie celowo**, z wyjaśnieniem w `admin_note`, żeby wyciąg z P24 zgadzał się z zamówieniami. Produkt testowy `8b02b071-…718756` tylko wyłączony (`is_active=false`) — usunąć go NIE DA SIĘ, bo `order_items.product_id` ma FK `RESTRICT` (i dobrze: historia zamówień nie może tracić zawartości). Zwrotu nie robiliśmy — prowizja przy zwrocie nie wraca.
> - ⚠️ **Kupujący nie dostaje maila od Przelewy24.** Potwierdzenie płatności to **nasz** mail (+ powiadomienie z aplikacji banku przy BLIKu). Brak maila od P24 nie jest awarią — to pytanie wraca przy każdym teście.
>
> ⬜ **ZOSTAŁO:** nic po stronie płatności. Zwroty nadal robi się ręcznie w panelu P24 — `refundTransaction` istnieje w `p24.ts`, ale nie jest wpięta w żaden endpoint ani UI, więc zwrot w P24 **nie zmieni statusu zamówienia u nas**.

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
**WSZYSTKIE migracje z `main` są ODPALONE** na produkcyjnym Supabase — sprawdzone 2026-07-30 przez `list_migrations`. Z repo została **tylko `48` (P24)**. Uwaga na dwa mylące wpisy: migracja `65_products_search_key` figuruje w bazie pod starą nazwą `61_products_search_key` (plik przenumerowano w repo z powodu kolizji z `61_variant_info`; jest w całości wgrana — `search_key` i `search_key_de` + dwa indeksy GIN), a `47_p24_payment_ref` jest wgrana na prodzie, choć pliku nie ma na `main` (leży na tej gałęzi, PR #48). Wspólna baza → świeży klon nic nie re-uruchamia. Przyszłe migracje: kolejny numer w `sklep-meblowy/supabase/migrations/` (kanoniczny katalog); odpala człowiek w Supabase SQL Editorze albo agent przez Supabase MCP (model: pokaż SQL → potwierdź → wykonaj).
> Migracja **47** (`47_p24_payment_ref.sql`) jest **addytywna (expand)** — dodaje `payment_ref` + `payment_provider` i backfilluje istniejące zamówienia jako `stripe`, **nie rusza `stripe_payment_intent`**. Dlatego była bezpieczna przy żywym kodzie Stripe i odpalono ją **PRZED** merge'em tej gałęzi (2026-07-29; preview dzieli bazę z produkcją).
> Migracja **48** (`48_drop_stripe_payment_intent.sql`) — odpalać **po cutoverze**, bez 30-dniowego okna zwrotów (patrz punkt 5 w „Gdzie stanęliśmy": w bazie nie ma ani jednego zamówienia opłaconego Stripe'em). Po niej: usunąć `stripe_payment_intent` z `types.ts` i z fallbacku w panelu admina.

⚠️ **Rejestr migracji w bazie jest NIEPEŁNY i nie nadaje się do oceny stanu schematu.** Sprawdzone 2026-07-30: `supabase_migrations.schema_migrations` ma **23 wpisy**, a w repo jest **58 plików**. To NIE znaczy, że 35 brakuje — migracje `01`–`46` oraz `49`–`58` wgrywano ręcznie w SQL Editorze, a ten nie zapisuje się do rejestru. Dodatkowo nazwy w rejestrze nie zgadzają się z plikami: `62_fabric_short_info` figuruje jako `fabric_short_info`, a `65_products_search_key` jako `61_products_search_key`. Najnowsze wpisy: `47_p24_payment_ref` (2026-07-29) i grupa `fabric_*` (24–27.07).
**Wniosek: stan bazy sprawdzaj po OBIEKTACH, nie po rejestrze** — czy kolumna/indeks/RPC istnieje (`information_schema`, `pg_indexes`), a nie czy plik widnieje na liście migracji. Inaczej wyjdzie fałszywy alarm „brakuje 35 migracji".

**Jak agent może dziś sięgnąć do bazy** (gdy MCP `supabase` nie działa): tokenem z `.mcp.json` (plik jest gitignorowany, patrz `sklep-meblowy/.gitignore`) przez Management API — `POST https://api.supabase.com/v1/projects/tlvgsddpiikolgdwuwmc/database/query` z ciałem `{"query":"..."}` i nagłówkiem `Authorization: Bearer <token>`. Tą drogą da się wykonać dowolny SQL, w tym DDL migracji, bez czekania na restart narzędzia. Uwaga: zmiana `.mcp.json` wymaga **pełnego restartu** Claude Code — `/mcp → Reconnect` podnosi serwer ze konfiguracją wczytaną przy starcie, więc nowego tokena nie zobaczy.

## Bramki jakości (uruchamiać z `sklep-meblowy/`)
`npx tsc --noEmit` (0 błędów) · `npm run lint` (0) · `npm test` (vitest — **877 zielonych w 74 plikach**, stan 2026-07-31) · `npm run build` (Turbopack przechodzi).
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

## 🗄 Archiwum — jak wyglądał cutover P24 (stan na 2026-07-29 wieczór)

> **To zapis historyczny, nie lista zadań.** Cutover jest zrobiony (PR #48 zmergowany, transakcja kontrolna potwierdzona 2026-07-31 — patrz sekcja „Płatności" wyżej). Zostawione, bo opisuje pomiary i gotchy, które wrócą przy każdej zmianie w płatnościach. Gałąź `feat/platnosci-direct-p24` już nie istnieje — pracuj na `main`.

Zrobione i potwierdzone pomiarem:
- **Migracja 47 jest na prodzie** (addytywna; `stripe_payment_intent` nietknięta, żywy kod Stripe działa).
- **Pełny przepływ w sandboxie przeszedł na preview:** zamówienie → `trnRequest` → symulator „Mój bank" → Zapłać → notyfikacja → `status=paid`, `payment_ref`, `payment_provider=p24`. Mail potwierdzenia **doszedł**. Duplikat notyfikacji idempotentny; nieudana płatność zostaje `pending`; podrobiony podpis → 400; zaniżona kwota → `pending` + `admin_note`. Zamówienia testowe (#38, #39) usunięte z bazy.
- **Podpisy `register` i `verify` potwierdzone na żywym API**, podpis notyfikacji potwierdzony realną płatnością.
- Klucz API to **„Klucz do raportów"** z panelu (nie „Klucz do zamówień"). Sandbox uruchamia się jednym klikiem: panel produkcyjny → Moje konto → **Konto w SANDBOX**. Panel sandboxa: `https://sandbox.przelewy24.pl/panel` (sam korzeń hosta zwraca 400 — jako `P24_BASE_URL` jest poprawny).
- Narzędzia: **`npm run p24:smoke [-- <url-wdrożenia>]`** (klucze + podpis + czy `urlStatus` trafia w nasz handler) i **`npm run p24:methods`** (metody aktywne na koncie; Apple Pay w sandboxie = `id 252`, aktywne — na produkcji jeszcze NIESPRAWDZONE). Oba tylko do odczytu, nie ruszają pieniędzy.

Plan cutoveru (wszystkie kroki 1-6 wykonane do 2026-07-31): klucze produkcyjne w zakresie Production → weryfikacja konta w panelu → merge #48 → `p24:smoke` na produkcji → prawdziwa transakcja kontrolna → migracja 48 + wycięcie `stripe_payment_intent` z `types.ts` i panelu admina → usunięcie `STRIPE_*` z Vercela.

**Co z tej listy NIE jest zrobione:**
- ⬜ **Wyłączyć webhook w panelu Stripe i zamknąć konto Stripe** (samo konto, nie kod — kod nie ma już ani jednej referencji).
- ⬜ **Podmienić logotypy** — `public/payments/*.svg` to placeholdery (własne SVG z tekstem, w tym Visa/Mastercard/BLIK — znaków zastrzeżonych nie wolno rysować samemu). Pobrać oficjalny zestaw z panelu P24.
- ⬜ **`urlStatus` przestawić na źródło serwerowe** — patrz gotcha niżej; do zrobienia było „po cutoverze", czyli teraz.

Gotchy, które kosztowały czas i wrócą:
- ⚠️ **Vercel Deployment Protection blokuje notyfikacje P24** — przy `vercel_auth_enabled` `/api/p24/status` oddaje **401**, więc rozliczenie nigdy nie dojdzie. Na czas testów na preview trzeba ją wyłączyć (Settings → Deployment Protection) i **włączyć z powrotem po testach** (preview jest publiczny i dzieli bazę z produkcją).
- ⚠️ **POST na nieistniejącą ścieżkę pod `/api/` zwraca 200 z HTML-em** (udokumentowane zachowanie `not-found` dla odpowiedzi strumieniowanych). Literówka w `urlStatus` = cicha awaria: P24 uzna notyfikację za dostarczoną i nie ponowi. Dlatego `p24:smoke` sprawdza ten adres osobno.
- **Zamówienia z preview lecą do produkcyjnej bazy** (wspólny Supabase) — testowe trzeba usuwać. Wystarczy `delete from orders where …`: `order_items.order_id` ma FK `ON DELETE CASCADE`, więc pozycje lecą same (⚠️ wcześniejsza wersja tej notatki kazała kasować `order_items` ręcznie — niepotrzebnie). ⚠️ **Produktu użytego w zamówieniu usunąć się nie da** — `order_items.product_id` ma `RESTRICT`; produkty testowe wyłączaj (`is_active=false`), nie usuwaj.
- **`urlStatus` bierze się z nagłówka `Origin`** (fallback `NEXT_PUBLIC_APP_URL`), czyli z czegoś, co kontroluje klient. Świadomie zostawione, bo dzięki temu test na preview działa bez grzebania w env. Wpływ niski (atakujący płaci swoimi pieniędzmi, zamówienie zostaje `pending`), ale po cutoverze przestawić na źródło serwerowe.
- Poprawka regulaminu o **„płatności za pobraniem"** (§ 4 ust. 3, commit `a33a8853`) siedzi w tej gałęzi i wejdzie na produkcję razem z merge'em — nie wymaga osobnego działania.

**Na nowym komputerze:** `git pull` na `main` + `npm install`, a potem odtworzyć **`.env.local`** (gitignored, NIE przychodzi z klonem) — lista zmiennych w `docs/uruchomienie-dev.md`. Do zabawy lokalnie bierz klucze **sandboxowe** i `P24_BASE_URL=https://sandbox.przelewy24.pl`, inaczej każdy klik w checkoucie to prawdziwa płatność. Wartości sandbox: panel sandboxa → **MOJE DANE → Ustawienia** („Klucz do CRC" i „Klucz do raportów"), ID konta w nagłówku panelu.

## Następny krok
1. **Podprojekt 3 (faktury KSeF)** — czeka na odpowiedź: z jakiego programu fakturowego korzysta księgowa (przesądza drogę); potem spec → plan → wdrożenie.
3. **Reszta podprojektu 4 (wysyłka)** — termin dostawy, dane transportu, model kosztu.

## 🔑 Przekazanie obsługi — checklista zasobów (2026-08-10)

Powstała, gdy okazało się, że właściciel nie pamiętał, co w ogóle było w Google
zakładane. **Zasada nadrzędna: marketing dostaje DOSTĘP, nie własność.** Klucze do
sklepu i pieniędzy (Vercel, Supabase, P24, home.pl) zostają u właściciela.

### Google — zasoby i stan

| Zasób | Gdzie stoi | Co zrobić przy przekazaniu |
|---|---|---|
| **Google Cloud + klient OAuth** (logowanie Google w sklepie) | konto `miki19991@gmail.com`, projekt `Sklep-meblowy` nr **614212632886**, **poza organizacją** | dodać osobę w IAM jako **Właściciel**; zaproszenie wymaga akceptacji mailem |
| **Weryfikacja marki** (ekran zgody OAuth) | ten sam projekt | zgłoszona 2026-07-30; sprawdzić status, **nie edytować pól w trakcie przeglądu** |
| **Search Console** | weryfikacja **rekordem TXT w DNS w home.pl** | dodać osobę **osobno w każdej z dwóch usług** (Ustawienia → Użytkownicy i uprawnienia) |
| **Google Analytics 4** | ⚠️ usługa **na koncie zewnętrznym** (`G-GL6DBHYQYT`) | patrz niżej — jedyny zasób, którego właściciel NIE kontroluje |
| **Merchant Center** | do ustalenia — `/feed.xml` istnieje w kodzie, panel niepotwierdzony | sprawdzić, czy konto istnieje i na czyim koncie |
| **Wizytówka Google** | **brak śladu** w DNS i w repo — prawdopodobnie nigdy nie założona | jeśli zakładana: dane muszą zgadzać się z JSON-LD (niżej) |

⚠️ **Dwie usługi w Search Console to NIE duplikat.** „Domena" `mollien.pl` daje pełny
obraz, ale „Prefiks URL" `https://www.mollien.pl/` **jest wymagany przez weryfikację
marki** — pierwsze zgłoszenie odrzucono właśnie z powodem „strona główna nie jest
zarejestrowana na Ciebie". Nie kasować jej jako zbędnej.

⚠️ **Największe ryzyko całej układanki:** logowanie przez Google stoi na **prywatnym
Gmailu**, na projekcie poza organizacją. Utrata tego konta = klienci przestają się
logować przez Google i nikt nie wie dlaczego. Do rozwiązania niezależnie od tego, komu
co się oddaje. Uwaga: przełącznik projektów tego projektu **nie znajduje** (filtruje po
organizacji) — wchodzić wprost linkiem, patrz sekcja „Logowanie Google".

⚠️ **GA4 nie należy do sklepu.** Identyfikator w `NEXT_PUBLIC_GA_ID` (Vercel,
Production) wskazuje usługę założoną na koncie osoby od marketingu — świadoma decyzja
właściciela z 2026-08-10, podjęta dla szybkiego startu. Skutek: **historia danych jest
jej własnością, a GA nie eksportuje historii**, więc rozstanie = licznik od zera. Do
załatwienia, zanim uzbiera się rok danych: rola **Administratora** na koncie GA (nie
tylko na usłudze), docelowo przeniesienie usługi na konto kontrolowane przez sklep
(wymaga uprawnień po obu stronach — musi to kliknąć właścicielka usługi).

### Czego NIE oddawać razem z marketingiem
Domena i DNS (**home.pl** — na nim stoi weryfikacja Search Console i cała poczta),
Vercel, Supabase, Przelewy24, Resend, GitHub. To są klucze do sklepu i do pieniędzy.

### Zależności od kodu
Kod **nie blokuje** ani weryfikacji marki, ani wizytówki — wszystko, czego Google
wymaga, już jest: `/prywatnosc`, `/regulamin`, strona główna, Organization JSON-LD z
adresem, telefonem i NIP-em (`app/_lib/seo-jsonld.ts`).

**Co realnie daje weryfikacja marki — sprawdzone na żywo 2026-08-10.** Klient klikający
„Zaloguj przez Google" na `mollien.pl` widzi dziś ekran Google z napisem *„Przejdź do
aplikacji **tlvgsddpiikolgdwuwmc.supabase.co**"* — czyli surowy host bazy zamiast marki.
Weryfikacja podmienia ten string na `Mollien.pl`. Skoro Google nadal pokazuje hosta
Supabase, zgłoszenie z 2026-07-30 **nie przeszło** (w toku albo odrzucone) — to jest
najprostszy sposób sprawdzenia statusu bez wchodzenia do konsoli.
Zakres to `scope=email profile` (dane niewrażliwe), więc weryfikacja **niczego nie
blokuje**: logowanie działa, nie ma limitu 100 użytkowników ani ekranu „niezweryfikowana
aplikacja". To kwestia wyłącznie zaufania i wyglądu, ale przy pierwszym logowaniu
klienta cena jest realna.

Dwie rzeczy do pilnowania:
1. **Nazwa aplikacji na ekranie zgody musi zgadzać się z logo w Navbarze** — test Google
   jest dosłowny i to był jeden z trzech powodów pierwszego odrzucenia. W repo
   `COMPANY.displayName` = `MOLLIEN.PL` (wersalikami) i tak jest od 2026-05-11, czyli
   również w dniu zgłoszenia; notatka z 2026-07-30 mówi o nazwie `Mollien.pl`. Jeśli
   weryfikacja poleci drugi raz — **tu patrzeć najpierw**.
2. **Wizytówka:** adres, telefon i nazwa muszą być identyczne jak w `COMPANY`
   (`Dworzyszcze 4, 63-630 Rychtal`, `+48 570 818 226`) — rozjazd Google traktuje jako
   sygnał niespójności. Po założeniu wizytówki warto dopisać jej URL do `sameAs` w
   Organization JSON-LD; dziś tego pola **nie ma**. To jedyna realna zmiana w kodzie
   wynikająca z tej listy.

## Drobne follow-upy (nieblokujące)
- `schema.sql` jest niekompletnym baseline'em (pre-existing) — fresh-DB bootstrap z samego pliku byłby niepełny; źródłem prawdy są **migracje**.
- Stary `.env.local` (gitignored, nie przychodzi z klonem) może mieć nieużywane już zmienne po dawnej integracji magazynowej — można wyczyścić ręcznie, aplikacja ich nie czyta.
- Migracje `07`, `11`, `24`, `25` tworzyły, a `34` usunęła strukturę dawnej integracji magazynowej. Pliki zostają jako rejestr tego, co realnie odpalono na bazie — nie kasować, bo numeracja i historia schematu przestałyby się zgadzać.
