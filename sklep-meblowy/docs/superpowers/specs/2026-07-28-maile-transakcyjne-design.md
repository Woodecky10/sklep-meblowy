# Maile transakcyjne — design

**Data:** 2026-07-28
**Status:** zaakceptowany zakres, adresy nadawcy nierozstrzygnięte (patrz „Otwarte")

## Problem

Sklep nie wysyła **żadnego** maila. Zero paczek mailowych w `package.json`, nic w kodzie nie wysyła wiadomości. Konsekwencje:

- klient po zakupie nie dostaje potwierdzenia — jedynym śladem jest strona sukcesu, którą zamknie i straci,
- nie dowie się, że przesyłka ruszyła, mimo że przewoźnik i numer śledzenia są w panelu,
- nie dowie się, że zamówienie zostało anulowane,
- właścicielka dowiaduje się o zamówieniu tylko wchodząc do panelu (licznik z PR #100 — działa, ale wymaga, żeby ktoś patrzył),
- mail weryfikacyjny rejestracji idzie wbudowanym mailerem Supabase: limit kilku wiadomości na godzinę (dokumentacja Supabase: tylko do testów) i wygląd domyślny, niezwiązany ze sklepem.

## Zakres

Cztery maile. Świadomie **nie** sześć — uzasadnienie w „Decyzje".

| # | Zdarzenie | Odbiorca | Treść |
|---|---|---|---|
| 1 | Zakup (online po opłaceniu / COD po złożeniu) | klient | „Dziękujemy za zamówienie" — numer, pozycje z wariantami, kwoty z rabatami, adres dostawy, metoda płatności, link do zamówienia |
| 2 | Status → `shipped` | klient | „Przesyłka w drodze" — przewoźnik, numer śledzenia, link do zamówienia |
| 3 | Status → `cancelled` | klient | „Zamówienie anulowane" — numer, a gdy zamówienie było opłacone: informacja, że **skontaktujemy się w sprawie zwrotu**. Nie obiecujemy automatycznego zwrotu, bo go nie ma — zwroty robi się dziś ręcznie po stronie operatora płatności |
| 4 | Zakup (te same momenty co #1) | właścicielka | „Nowe zamówienie" — numer, kwota, klient, pozycje, link do panelu |

Plus **przebranding maila weryfikacyjnego** Supabase Auth na paletę sklepu (osobna ścieżka wdrożenia — panel Supabase, nie repo).

**Poza zakresem:** maile marketingowe / newsletter (wymagają osobnej zgody RODO, brak formularza zapisu na stronie), mail na `delivered`, mail na `processing`, autoresponder na formularz zapytania o produkt, faktury.

## Decyzje i ich uzasadnienia

### Dlaczego nie mail na każdą zmianę statusu

Oś statusów to `pending → paid → processing → shipped → delivered`, plus `cancelled` jako boczny stan końcowy (`app/_lib/order-status.ts`).

- **`paid` nie dostaje osobnego maila.** Webhook ustawia `paid` sekundy po zakupie — klient dostałby dwie wiadomości pod rząd o tym samym. Mail #1 **jest** powiadomieniem o `paid`.
- **`processing` nie dostaje maila, i to jest ważne.** Po pierwsze `createOrder` nadaje ten status od razu zamówieniom COD (`app/_lib/orders.ts` — reguła `paymentMethod === "cod"`), więc kolidowałby z mailem #1. Po drugie, i groźniej: `processing` to status, który admin ustawia ręcznie, żeby **zabrać zamówienie do realizacji** — a to jest dokładnie ten klik, który gasi licznik nowych zamówień z PR #100. Mail na `processing` znaczyłby, że każde odhaczenie zamówienia w panelu strzela wiadomością do klienta.
- **`delivered` nie dostaje maila** (decyzja użytkownika 2026-07-28). Przy meblach klient kwituje odbiór u kierowcy — mail „dostarczono" informuje o tym, co odbiorca właśnie zrobił. Ewentualne zaproszenie do opinii to osobna, świadoma zmiana.

### Paleta czytana z bazy, nie zaszyta

Produkcyjny motyw **nie jest domyślny**: `store_settings` ma `theme_preset = "klasyczny"`, `font_pair = "inter-playfair"` i `theme_overrides = {"navy":"#000000","cream":"#ffffff"}`. Granat jest nadpisany na czysty czarny. Zaszycie domyślnego `#1a1a2e` dałoby mail w kolorze, którego na stronie nie ma. Motyw jest do tego edytowalny w `/admin/wyglad` (10 presetów).

Dlatego szablony biorą kolory z **tego samego źródła co strona** — `store_settings` przez istniejący `app/_lib/theme.ts`. Wysyłka i tak zachodzi w kontekście, który rozmawia z bazą, więc to jeden dodatkowy odczyt. Zmiana motywu w panelu przemalowuje maile bez deploya.

### Fonty — ograniczenie, nie wybór

Gmail wycina `@font-face`, Outlook go ignoruje. Playfair Display i Inter idą jako pierwsze w stacku, ale u większości odbiorców zadziała fallback: **Georgia** dla nagłówków (najbliższy dostępny wszędzie szeryf) i systemowy sans dla treści. Maile będą w kolorach i proporcjach sklepu, nie w jego krojach. Tego nie da się obejść.

### Język bez nowej kolumny

`orders` nie ma kolumny locale, ale ma `currency`. EUR występuje **wyłącznie** na `/de` (patrz sekcja EUR w `ONBOARDING.md`), więc `currency = 'eur'` ⟺ klient niemiecki, `'pln'` ⟺ polski. Mail #4 (do właścicielki) jest zawsze PL — panel admina też jest PL-only.

### Idempotencja bez nowej tabeli

Każdy mail wysyłamy w miejscu, które już jest chronione compare-and-swapem:

- **#1 online** — w webhooku, po `markOrderPaid`. Ta funkcja zwraca `true` tylko dla zwycięzcy CAS-a `pending→paid` (`.eq("status","pending")`), więc powtórka webhooka Stripe nie wyśle drugiego maila.
- **#1 COD** — w `/api/checkout` po utworzeniu zamówienia, pod warunkiem `isCod`. Online nie może dostać maila przed zapłatą.
- **#2, #3** — w `updateOrderStatus`, po udanym CAS-ie na statusie (`.eq("status", from)`). **Uwaga wykryta przy wdrożeniu:** dzisiejszy CAS nie sprawdzał, ile wierszy trafił, a Supabase zwraca `error: null` również przy zerze — więc przegrany wyścigu wysłałby klientowi powiadomienie o zmianie, której nie dokonał. Wymaga `.select("id")` i traktowania pustej odpowiedzi jako błędu.
- **#4** — w tych samych dwóch miejscach co #1.

Nie potrzebujemy tabeli `order_emails` ani kolumny „wysłano". Gdyby w przyszłości doszły maile bez takiej ochrony, wtedy — nie teraz.

### Pobranie NIE jest „opłacone" (poprawka po wdrożeniu Task 5)

Mail o anulowaniu wspomina zwrot środków tylko wtedy, gdy pieniądze faktycznie wpłynęły. **Nie da się tego wywnioskować z samego poprzedniego statusu.** Pierwotna wersja tego spec zakładała `wasPaid = previousStatus !== "pending"` i było to fałszywe dla pobrania: `createOrder` nadaje zamówieniom COD status `processing` od razu, a `paid` zapisuje wyłącznie `markOrderPaid`, którego COD nie dotyka. Skutek — każde anulowane zamówienie za pobraniem informowałoby klienta, że zapłacił, i obiecywało zwrot gotówki, której sklep nigdy nie wziął.

Reguła musi uwzględniać `payment_method` i mieszkać w czystej funkcji z testami (`wasOrderPaid` w `mail/status-notify.ts`). Znane, świadomie zaakceptowane ograniczenie: admin może przestawić **nieopłacone** zamówienie online z `pending` na `processing` (`canTransition` to dopuszcza) i anulować je dopiero potem — wtedy wyjdzie `wasPaid = true`. Dokładne rozstrzygnięcie wymagałoby oparcia się o kolumnę płatności, którą otwarty PR #48 (migracja na Przelewy24) usuwa, więc świadomie się z nią nie wiążemy.

### Awaria maila nie może zepsuć zakupu

Każda wysyłka w `try/catch`, błąd → `console.error`, nigdy `throw`. Webhook Stripe **musi** zwrócić 200 nawet gdy mail padnie; inaczej Stripe ponawia, a klient patrzy na zawieszony checkout. Brak `RESEND_API_KEY` to nie błąd, a tryb „nie wysyłaj" — dzięki temu kod może wjechać na produkcję i czekać uzbrojony na klucz, oraz nie strzela mailami z lokalnego deva.

## Architektura

```
app/_lib/mail/
  client.ts       — leniwy klient Resend; brak klucza => null (tryb no-op)
  send.ts         — sendMail(): try/catch, log, nigdy nie rzuca
  branding.ts     — paleta + font stack z store_settings (przez theme.ts)
  templates/
    OrderConfirmation.tsx   — #1
    OrderShipped.tsx        — #2
    OrderCancelled.tsx      — #3
    AdminNewOrder.tsx       — #4
    AuthConfirm.tsx         — źródło HTML dla panelu Supabase
    _Layout.tsx             — wspólna rama: nagłówek, stopka, kolory, dane firmy
```

Szablony to komponenty `@react-email/components`, renderowane do HTML przy wysyłce. Dane firmy do stopki są już w `app/_lib/company.ts`.

**Zależności:** `resend`, `@react-email/components`. Dwie — świadomie, bo alternatywą jest ręczne pisanie tabelek i inline CSS pod quirki Outlooka, kruche przy każdej zmianie designu.

**Zmienne środowiskowe** (do `.env.example` i Vercela):

| Zmienna | Rola |
|---|---|
| `RESEND_API_KEY` | klucz API; brak = tryb no-op |
| `MAIL_FROM` | nadawca, np. `Mollien <zamowienia@mollien.pl>` |
| `MAIL_REPLY_TO` | gdzie trafiają odpowiedzi klientów |
| `MAIL_ADMIN_TO` | adres właścicielki dla maila #4 |

`NEXT_PUBLIC_APP_URL` (już istnieje) buduje linki do zamówień.

## Ścieżka maila weryfikacyjnego

Odrębna, bo szablon **nie żyje w repo** — Supabase trzyma go w konfiguracji projektu.

1. Ustawić custom SMTP Resenda w panelu Supabase (Auth → SMTP). Zdejmuje to limit kilku maili/godzinę i wypuszcza wiadomość z waszym DKIM.
2. Wyrenderować `AuthConfirm.tsx` do HTML, podstawić zmienne Supabase (`{{ .ConfirmationURL }}`), wkleić w Auth → Email Templates.
3. Źródło zostaje w repo jako komponent — inaczej po roku nikt nie odtworzy, skąd ten mail się wziął.

Kroki 1–2 wykonuje człowiek w panelu; kod tylko dostarcza HTML.

## Testy

Czysta logika, którą warto odpytać — i tylko ona:

- **wybór języka z waluty** — `'eur'` → DE, `'pln'` → PL, wartość nieznana → PL (fallback),
- **`branding.ts`** — nadpisania z `theme_overrides` wygrywają nad presetem; brak wiersza `store_settings` → paleta domyślna, nie wyjątek,
- **`sendMail`** — brak klucza nie rzuca i nie próbuje wysyłać; błąd providera nie rzuca,
- **decyzja „czy wysyłać"** dla przejścia statusu — `shipped` i `cancelled` tak, `processing`/`paid`/`delivered` nie. Wyciągnięte do czystej funkcji, żeby regułę dało się przetestować bez bazy i bez Resenda.

Renderu szablonów nie testujemy jednostkowo — repo nie ma infrastruktury do testowania komponentów (brak `@testing-library/react` i jsdom), a dokładanie jej dla czterech maili byłoby nieproporcjonalne. Zamiast tego lokalny podgląd React Email + zrzuty do akceptacji przed wdrożeniem.

## Otwarte — czeka na użytkownika

1. **Trzy adresy** (`MAIL_FROM`, `MAIL_REPLY_TO`, `MAIL_ADMIN_TO`). Nie zakładać żadnego w kodzie.
2. **Brak MX na `mollien.pl`.** Sprawdzone DNS 2026-07-28: strefa w home.pl (`dns.home.pl`), zero MX, zero TXT/SPF. Wysyłanie to nie problem, ale **odpowiedź klienta na maila się odbije** — fallback na rekord A prowadzi do Vercela, który nie ma SMTP. Dlatego `MAIL_REPLY_TO` musi wskazywać skrzynkę, która realnie odbiera, albo trzeba założyć pocztę na domenie i dodać MX.
3. **Konto Resend + weryfikacja domeny** — po stronie użytkownika (ma dostępy do home.pl).

Punkty 1–3 blokują tylko **go-live**, nie implementację: bez klucza kod działa w trybie no-op.
