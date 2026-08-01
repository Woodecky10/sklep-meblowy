# Zamawianie próbek tkanin — spec

Data: 2026-08-01 · Status: zaakceptowany przez właściciela, gotowy do planu wdrożenia

## Problem

Klient wybierający tkaninę na mebel za kilka tysięcy złotych nie ma dziś jak jej dotknąć. Sklep pokazuje wyłącznie zdjęcia wzornika (`FabricSwatchGrid`, `fabric-swatch-images.ts`) — fizycznej sprzedaży ani wysyłki próbek nie ma w kodzie w ogóle. Budujemy to od zera.

## Zasady biznesowe (zablokowane przez właściciela)

| Reguła | Wartość |
|---|---|
| Darmowa pula | **3 próbki** na klienta |
| Odnowienie puli | **co 12 miesięcy**, okno kroczące od pierwszej darmowej próbki |
| Cena ponad pulę | **15 zł za sztukę** |
| Dostawa | **zawsze darmowa**, niezależnie od liczby sztuk |
| Dostęp | **tylko dla zalogowanych** (cały formularz za logowaniem) |
| Dostępność tkanin | **każda tkanina z katalogu, zawsze** — zero ewidencji stanu magazynowego |
| Limit sztuk w zamówieniu | **brak** |
| Płatność | **wyłącznie Przelewy24**, bez płatności za pobraniem |

Odrzucone świadomie: zwrot 15 zł jako kredyt na meble (analiza wskazywała to jako najciekawszą opcję — właściciel zdecydował, że 15 zł to po prostu cena), stan magazynowy sztuk, limit sztuk w zamówieniu.

## Architektura

Próbki są **osobnym bytem obok zamówień mebli**, nie pozycją w istniejącym koszyku.

Powód: meble i próbki to dwa różne światy. Meble wozi firma transportowa, próbki idą listem; zamówienie mebla ma statusy związane z produkcją, próbka ma tylko „spakowane/wysłane". Pozycja za 0 zł w koszyku weszłaby w kolizję z kodami rabatowymi, zestawami i Omnibusem, a mieszane zamówienie „kanapa + 5 próbek" byłoby jednym rekordem do wysłania dwoma kanałami. Panel zamówień przestałby znaczyć „meble do wyprodukowania".

`fabrics` i `orders` **nie są zmieniane**.

### Tabele (migracja 67)

**`sample_orders`** — jedno zamówienie próbek:
- `user_id` — wymagany (próbki tylko dla zalogowanych)
- snapshot danych klienta: imię i nazwisko, e-mail, telefon (opcjonalny), adres jako `jsonb` (wzorzec `orders.shipping_address`)
- `status` ∈ `new` / `packed` / `sent` / `cancelled`
- `payment_status` ∈ `none` / `pending` / `paid`, `amount_total`, `payment_ref`
- `tracking`, `sent_at`, `created_at`, `updated_at`

⚠️ **Dwie niezależne osie stanu, celowo rozdzielone.** „Czy zapłacone" i „czy spakowane" nie mogą siedzieć w jednym polu — sklejenie ich jest dokładnie tym błędem, przez który dziś `orders.processing` przy płatności za pobraniem nie znaczy „opłacone".

**`sample_order_items`** — pozycje zamówienia:
- `sample_order_id` (kaskada), `fabric_id` (`on delete set null`), **`color`** (numer koloru, np. `"16"`)
- **snapshot nazwy tkaniny i koloru** — żeby zamówienie sprzed roku dało się przeczytać po zmianie katalogu (wzorzec `product_inquiries.product_name`)
- `is_free`, `unit_price`

⚠️ **Jednostką jest kolor tkaniny, nie tkanina.** `fabrics` trzyma `colors: string[]` (numery kolekcji) i `color_images` (zdjęcie wzornika per numer), a cały sklep operuje wartościami w formacie `„Nazwa Numer"` (np. `„Riviera 16"`). Klient wybierający próbki wybiera **konkretne kolory** — dokładnie tak, jak to sformułowałeś na początku („3 wybranych próbek/kolorów tkanin"). Gdyby pozycją była sama tkanina, zamówienie nie powiedziałoby, który wycinek wysłać.

**`sample_quota`** — licznik darmowej puli: `email_key` (klucz), `used_count`, `window_start`, `user_id` informacyjnie, unikalny indeks na `email_key`.

### Klucz puli: znormalizowany e-mail, nie `user_id`

Konto jest wymagane, ale założenie drugiego na `jan.kowalski+1@gmail.com` zajmuje trzydzieści sekund i daje kolejne trzy darmowe paczki. Normalizacja: lowercase, dla Gmaila usunięcie kropek i sufiksu `+tag`. Bez tego wymóg konta filtruje wyłącznie leniwych.

Świadomie akceptujemy, że konta na różnych skrzynkach zostają możliwe — koszt nadużycia to jedna przesyłka, a szczelniejsza obrona (SMS, mikropłatność weryfikacyjna) kosztuje więcej, niż chroni.

### RPC `claim_free_samples(email_key, qty)` — limit twardy, nie miękki

Ile sztuk jest darmowych, **liczy baza, nie przeglądarka**. Jedno atomowe zapytanie rezerwuje wolne miejsca i zwraca, ile przyznało (0–3); reszta idzie po 15 zł.

- `RETURNING` pod blokadą wiersza — dwa równoległe koszyki nie przepchną szóstej darmowej próbki.
- Okno 12 miesięcy wygasa **leniwie w tym samym zapytaniu**: gdy `window_start` jest starszy niż rok, licznik zeruje się przy okazji sprawdzania. Bez crona, którego na Vercelu nie ma (`crons: []`).
- Bliźniacze `release_free_samples` zwraca miejsca przy anulowaniu.

To ten sam wzorzec co `increment_promo_usage`, ale zrobiony poprawnie. Kody rabatowe mają tu znany, otwarty dług (limit `max_uses` jest miękki — wyścig dwóch checkoutów); ten mechanizm da się później przenieść i tamten dług zamknąć.

**Rezerwacja przy składaniu zamówienia, nie po zapłacie** — inaczej klient złożyłby trzy zamówienia naraz i w każdym dostał trzy gratisy. Konsekwencja: nieopłacone zamówienie trzyma pulę do czasu anulowania przez właścicielkę.

## Przepływ klienta

### Wejścia

1. Baner na stronie głównej — blok `banner` w `page_blocks`: nagłówek „TKANINY", treść „Zamów darmowe próbki", przycisk prowadzący dziś na `/tkaniny`. Przepięcie na stronę zamawiania to **edycja treści w panelu**, nie zmiana kodu.
2. Przycisk na `/tkaniny`.
3. Przycisk na `/tkaniny/[slug]` — tkanina zaznaczona przez parametr w adresie.

Karta produktu zostaje bez zmian: przy wyborze tkaniny do kanapy klient jest w innym trybie myślenia i nie wyprowadzamy go z konfiguratora.

Strona zamawiania stoi pod adresem **`/probki`**; strona powrotu z płatności pod `/probki/sukces`.

**Jedna sztuka na kolor w zamówieniu** — wybór jest zaznaczeniem próbki we wzorniku, więc nie da się zamówić dwóch takich samych wycinków. Klient może za to wziąć kilka kolorów tej samej tkaniny (każdy liczy się osobno do puli i do ceny).

### Bramka logowania

Niezalogowany widzi ekran wyjaśniający powód, z logowaniem Google na wierzchu — nie pusty formularz z błędem. Po zalogowaniu wraca dokładnie tam, skąd przyszedł, **z zachowaną preselekcją tkaniny**. To miejsce, w którym gubi się leady; powrót musi działać co do parametru.

### Wybór i podsumowanie

Lista tkanin pogrupowana jak katalog (grupy cenowe), z miniaturą wzornika i wyszukiwarką odporną na spacje i kolejność słów (istniejący mechanizm `search_key`). Zaznaczanie checkboxem, bez limitu.

Przyklejony pasek u dołu pokazuje na bieżąco: „Wybrano 5 próbek — 3 gratis + 2 × 15 zł = **30 zł**, dostawa 0 zł". Nad listą stan puli: „Masz jeszcze 3 darmowe próbki (odnawiają się 12 miesięcy od pierwszego zamówienia)".

⚠️ Stan puli musi być widoczny **przed** wyborem. Klient, który wykorzystał pulę, inaczej zaznaczy trzy tkaniny w przekonaniu, że są gratis, i poczuje się oszukany na ostatnim ekranie.

### Dane i finał

Imię, nazwisko i adres wypełnione z `profiles.address`, a przy pustym profilu — z ostatniego zamówienia; wszystko edytowalne. Telefon opcjonalny (koperta idzie pocztą). Żadnego wyboru dostawy — jest jedna i darmowa.

Finał rozwidla się na kwocie:
- **≤ 3 sztuki (0 zł)** — zamówienie zapisuje się od razu, klient widzi podziękowanie, bramka płatności się nie pojawia.
- **4+ sztuki** — Przelewy24 jak przy meblach. Strona powrotu **nie ufa powrotowi z bramki**, tylko czyta status z bazy (wzorzec `/checkout/success`) — P24 potrafi odesłać klienta zanim dojdzie notyfikacja.

⚠️ **Notyfikacja P24 dla próbek potrzebuje własnego endpointu.** Istniejący `/api/p24/status` zakłada wprost `sessionId == orders.id` (komentarz w kodzie: „sessionId == order.id (ustawiane w checkoucie)") i przy nieznanym identyfikatorze loguje „zamówienie nie istnieje" — czyli płatność za próbki zostałaby po cichu zgubiona. Próbki dostają `/api/p24/probki-status`, a wspólna część (walidacja podpisu, `verify`, idempotencja) idzie do współdzielonego helpera, żeby nie kopiować logiki pieniędzy.

⚠️ Adres tego endpointu trzeba sprawdzić osobno: POST na nieistniejącą ścieżkę pod `/api/` zwraca w tym frameworku **200 z HTML-em**, więc literówka w `urlStatus` daje cichą awarię — P24 uzna notyfikację za dostarczoną i nie ponowi. Skrypt `npm run p24:smoke` już to sprawdza dla mebli; trzeba dołożyć drugi adres.

## Panel właścicielki

Nowa pozycja „Próbki" w nawigacji, z licznikiem nowych — ten sam mechanizm co liczniki zamówień i zapytań.

Lista kart wzorowana na `/admin/zapytania`: data, klient, adres gotowy do skopiowania jednym kliknięciem oraz **lista tkanin z miniaturami wzornika** — właścicielka musi wiedzieć, które wycinki wyjąć, a sama nazwa „Riviera 16" nic jej nie mówi przy dwudziestu tkaninach. Przy każdej pozycji widać, czy gratis, czy płatna.

Trzy grupy: **do spakowania** (darmowe oraz opłacone), **nieopłacone** (klient nie wrócił z bramki), **wysłane** jako archiwum. Rozdzielenie chroni przed spakowaniem paczki, za którą nikt nie zapłacił.

Akcje: „Spakowane" (opcjonalne — przy jednej paczce można od razu „Wysłane"), „Wysłane" z polem na numer nadania, „Anuluj". **Anulowanie zwraca darmowe sztuki do puli klienta.**

⚠️ **Anulowanie opłaconego zamówienia nie robi zwrotu pieniędzy automatycznie.** Funkcja `refundTransaction` istnieje w `app/_lib/p24.ts`, ale nie jest wpięta w żaden endpoint ani panel — właścicielka rozlicza taki przypadek ręcznie w panelu Przelewy24. Panel musi to napisać wprost przy przycisku, żeby nie założyła, że pieniądze wróciły same.

Zapis wyłącznie przez akcje serwerowe z `requireAdmin()` i klientem administracyjnym. RLS w wariancie utwardzonym z migracji 27: brak publicznego `INSERT` (formularz i tak wymaga logowania), ograniczenia długości pól.

## Maile (Resend)

1. **Do właścicielki** — „Nowe zamówienie próbek": lista tkanin, adres, kwota, czy opłacone.
2. **Do klienta** — potwierdzenie przyjęcia. Przy zamówieniu darmowym od razu; przy płatnym **dopiero po potwierdzeniu płatności przez P24**, żeby nie potwierdzać zamówienia, które nie dojdzie do skutku.
3. **Do klienta** — „Próbki wysłane" z numerem nadania.

⚠️ To **świadome odstępstwo** od reguły „mailujemy tylko przy `shipped` i `cancelled`" (`NOTIFY_STATUSES` w `status-notify.ts`). Tamta reguła dotyczy zamówień mebli i ich statusów; próbki mają własną maszynę stanów. Musi to zostać opisane komentarzem w kodzie, żeby przy kolejnym audycie nie wyglądało na przypadkowy regres.

Wysyłka maila nigdy nie blokuje zamówienia — `sendMail` nie rzuca wyjątkiem, tylko loguje.

## Testy

Czyste funkcje, bez bazy:
- podział koszyka na gratis i płatne przy danym stanie puli
- kwota = `15 × liczba płatnych`
- normalizacja e-maila (aliasy Gmaila: kropki i `+tag`)

Dotykające bazy — te trzy są najważniejsze:
- **wyścig**: dwa równoległe zamówienia przy dwóch wykorzystanych gratisach → dokładnie jedno przechodzi (dowód, że limit jest twardy)
- **leniwe wygaśnięcie** okna 12 miesięcy
- **zwrot puli** przy anulowaniu

E2E: ścieżka bezpłatna end-to-end oraz bramka logowania (niezalogowany trafia na logowanie i wraca z zachowaną tkaniną). Ścieżka płatna — sandbox P24 na preview, narzędzia z cutoveru (`npm run p24:smoke`).

⚠️ Dev i preview chodzą na **produkcyjnej bazie** — testowe zamówienia próbek trzeba po sobie kasować.

## Ryzyka

1. **Bramka logowania wycina leady.** Ryzyko biznesowe, nie techniczne, i największe: próbka jest magnesem na zakup mebla za kilka tysięcy, więc utrata kilku procent zainteresowanych kosztuje więcej niż wszystkie darmowe przesyłki razem. Mitygacja: Google jednym kliknięciem, powód podany po ludzku, bezbłędny powrót z preselekcją.
2. **Wielokrotne konta na różnych skrzynkach** — akceptowane świadomie (patrz wyżej).
3. **Nieopłacone zamówienia trzymają pulę** do anulowania. Bez crona nie ma automatu; panel pokazuje je osobno. Follow-up, jeśli okaże się uciążliwe.
4. **Kolizja nazw.** „Próbka" w kodzie już oznacza **zdjęcie wzornika** (`FabricSwatchGrid`, `fabric-swatch-images.ts`, `getFabricSwatchMap`). Nowe moduły nazywamy `sample-*`, żeby nie powtórzyć pułapki z `promo.ts`, gdzie „promo" znaczyło naraz kody rabatowe i baner promocyjny.
5. **Migracja 67 idzie na żywą bazę** — ręcznie, przed merge'em (expand-first), za wyraźną zgodą właściciela.

## Poza zakresem (świadomie)

- Ceny w EUR — `/de` jest zamrożone flagą `DE_ENABLED`, próbki są PLN-only
- Historia zamówień próbek w koncie klienta (tracking wychodzi mailem)
- Jakikolwiek stan magazynowy próbek
- Zwrot 15 zł jako kredyt na meble
- Druk listy pakowania
- Limit sztuk w zamówieniu

## Pochodzenie

Kształt wypracowany przebiegiem skilla ADHD (5 izolowanych ram poznawczych → krytyk → pogłębienie trójki) plus decyzje właściciela. Trzy znaleziska z tego przebiegu, które trafiły wprost do speca: rozdzielenie osi „zapłacone/spakowane", twardy limit z `RETURNING` pod blokadą wiersza zamiast miękkiego licznika, oraz normalizacja e-maila jako realny klucz tożsamości.
