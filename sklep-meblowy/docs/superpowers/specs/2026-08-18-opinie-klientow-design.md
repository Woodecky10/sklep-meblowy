# Opinie klientów — zbieranie, moderacja i pokazywanie

Projekt z 2026-08-18. Zgłoszenie właściciela: najlepsze opinie mają trafiać na
stronę główną do slidera, z przejściem do strony wszystkich opinii; po
oznaczeniu zamówienia jako dostarczone klient ma dostać maila z prośbą
o opinię — zarówno posiadacz konta, jak i osoba, która kupiła bez konta.

## Stan wyjściowy — zmierzony, nie założony

**System opinii już istnieje i częściowo działa.** Jest tabela
`product_reviews` (migracja 06), formularz `ReviewForm` na karcie produktu,
gwiazdki, średnie ocen na kartach produktów, trasa `app/api/reviews/route.ts`
oraz reguła RLS weryfikująca zakup. Migracja 46 zamykała nawet dziurę,
w której ktoś mógł złożyć darmowe zamówienie za pobraniem i od razu wystawić
„zweryfikowaną" opinię.

Mimo to w bazie jest **zero opinii**. Stan produkcyjnej bazy 2026-08-18:

| | liczba |
|---|---|
| opinie (`product_reviews`) | **0** |
| zamówienia razem | 10 |
| **bez konta (`user_id is null`)** | **6** |
| z kontem | 4 |
| dostarczone | 1 |
| zamówienia z 1 produktem | 9 |
| zamówienia z 2 produktami | 1 |

Zero opinii nie jest przypadkiem, tylko skutkiem dwóch rzeczy:

1. **Sześciu na dziesięciu kupujących fizycznie nie ma jak nic napisać.**
   `product_reviews.user_id` jest `not null` z kluczem obcym do `auth.users`,
   a trasa API odrzuca niezalogowanych (`401`). Gość jest wykluczony na
   poziomie schematu, nie interfejsu.
2. **Pozostała czwórka nie dostaje żadnego sygnału.** Nic nie zaprasza do
   wystawienia opinii — trzeba samemu wrócić na kartę produktu i domyślić się,
   że taka możliwość istnieje. Nikt nie wrócił.

**Dziś po oznaczeniu „Dostarczone" nie wychodzi żaden mail.**
`NOTIFY_STATUSES` w `app/_lib/mail/status-notify.ts` to wyłącznie `shipped`
i `cancelled`; `delivered` jest wykluczony świadomie, z uzasadnieniem
w komentarzu: „przy meblach klient kwituje odbiór u kierowcy".

⚠️ **„Opinie" znaczą w tym sklepie dwie różne rzeczy.** Poza powyższym istnieje
blok treści `reviews` (`CONTENT_BLOCK_TYPES` w `app/_lib/blocks.ts`,
komponent `ReviewsBlock.tsx`) — to **ręcznie wpisywane cytaty**, które Julia
wklepuje w panelu, bez żadnego związku z tabelą `product_reviews`. Sprawdzone
w bazie: **nie istnieje ani jeden wiersz `page_blocks` typu `reviews`**, czyli
funkcja nigdy nie została użyta. Nie ma czego zachowywać ani z czym kolidować,
ale przy czytaniu kodu łatwo pomylić jedno z drugim.

## Decyzje właściciela (2026-08-18)

1. **Moderacja: opinia publikuje się dopiero po zatwierdzeniu w panelu.**
2. **Wybór na stronę główną: automatyczny, z możliwością wykluczenia** przez
   Julię pojedynczej opinii.
3. **Mail od razu po „Dostarczone" + przypomnienie po tygodniu**, wyłącznie
   jeśli opinia nadal nie została dodana.
4. **Wariant B — dwie osobne ścieżki zapisu.** Formularz dla zalogowanych
   zostaje taki jak dziś, goście dostają oddzielny tor z tokenem.

**Zastrzeżenie zgłoszone i odrzucone przez właściciela — zapisane, żeby nie
wracać do tematu bez powodu:** rekomendowałem wariant A (jeden link z maila dla
wszystkich, bez logowania), bo zdejmuje barierę logowania także z posiadaczy
kont — a to właśnie ona jest jedną z dwóch przyczyn zerowego wyniku. Właściciel
wybrał B. Projekt poniżej realizuje B.

**Rozstrzygnięcia podjęte przeze mnie** (drobne, alternatywa wyraźnie gorsza):

- **Opinia dotyczy pojedynczego produktu, nie całego zamówienia.** Zgadza się
  ze słowami zgłoszenia („opinię o danym produkcie") i z istniejącą tabelą,
  a przy 9 zamówieniach jednopozycyjnych na 10 różnica jest w praktyce żadna.
  Zamówienie dwupozycyjne generuje dwa zaproszenia.
- **Dwie ścieżki zapisu, ale JEDNA tabela.** Gdyby opinie gości trafiały do
  osobnej tabeli, slider, `/opinie`, karta produktu i średnie ocen musiałyby
  czytać z dwóch źródeł i scalać je w każdym z tych miejsc. Dwa wejścia, jeden
  magazyn.

## Model danych

### Zmiany w `product_reviews`

```sql
alter table public.product_reviews alter column user_id drop not null;
alter table public.product_reviews
  add column if not exists guest_name  text,
  add column if not exists guest_email text,
  add column if not exists status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  add column if not exists homepage_excluded boolean not null default false;
```

Warunek pilnujący, że autor jest dokładnie jeden — nie „niczyj", nie podwójny:

```sql
alter table public.product_reviews add constraint product_reviews_autor_jeden
  check (
    (user_id is not null and guest_email is null and guest_name is null)
    or
    (user_id is null and guest_email is not null and guest_name is not null)
  );
```

Dotychczasowe `unique (product_id, user_id)` przestaje działać jak trzeba, gdy
`user_id` bywa `null` (Postgres traktuje każdy `null` jako różny, więc gość
mógłby wystawić dowolnie wiele opinii temu samemu produktowi). Zamiast niego:

```sql
-- jedna opinia na konto na produkt
create unique index if not exists uniq_review_user
  on public.product_reviews (product_id, user_id) where user_id is not null;
-- jedna opinia na adres gościa na produkt
create unique index if not exists uniq_review_guest
  on public.product_reviews (product_id, lower(guest_email)) where guest_email is not null;
```

`lower(...)` celowo: `Jan@x.pl` i `jan@x.pl` to ten sam człowiek.

### Nowa tabela `review_invites`

Jedno zaproszenie = jedna para (zamówienie, produkt).

```sql
create table if not exists public.review_invites (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  sent_at     timestamptz not null default now(),
  reminded_at timestamptz,
  used_at     timestamptz,
  expires_at  timestamptz not null,
  unique (order_id, product_id)
);
```

**Token trzymamy wyłącznie jako skrót (hash), nigdy otwartym tekstem** — tak
jak przy resecie hasła. Wyciek kopii bazy nie może oddawać prawa do pisania
opinii w cudzym imieniu. Wartość jawna istnieje tylko w wysłanym mailu.

`unique (order_id, product_id)` jest zabezpieczeniem przed zdublowaniem
zaproszenia, gdyby admin przestawił status tam i z powrotem.

### RLS — jedna zmiana konieczna niezależnie od wariantu

Dzisiejsza reguła odczytu to `using (true)`, czyli **wszyscy widzą wszystko**.
Po wprowadzeniu moderacji opinie oczekujące i odrzucone byłyby publicznie
czytelne przez API mimo że nigdzie ich nie pokazujemy. Musi być:

```sql
drop policy if exists "reviews: publiczny odczyt" on public.product_reviews;
create policy "reviews: publiczny odczyt zatwierdzonych"
  on public.product_reviews for select to anon, authenticated
  using (status = 'approved');
```

Konsekwencja do obsłużenia w kodzie: autor przestaje widzieć własną opinię
w oczekiwaniu. `getReviewStatus` (`app/_lib/reviews.ts`) czyta ją po to, by
podstawić do edycji — musi robić to klientem administracyjnym albo dostać
osobną regułę „autor widzi swoje niezależnie od statusu". Wybieram **regułę**,
bo nie wymaga podnoszenia uprawnień w ścieżce czytania:

```sql
create policy "reviews: autor widzi swoje"
  on public.product_reviews for select to authenticated
  using (user_id = auth.uid());
```

`review_invites` **nie dostaje żadnej reguły publicznej** — tabela jest
dostępna wyłącznie przez klienta administracyjnego po stronie serwera.

## Ścieżka 1 — zalogowany (istniejąca, minimalnie ruszona)

`ReviewForm` i `app/api/reviews/route.ts` zostają. Zmiany:

- zapis nadaje `status = 'pending'`,
- po wysłaniu komunikat „Dziękujemy — opinia pojawi się po sprawdzeniu"
  zamiast natychmiastowego pokazania,
- edycja własnej opinii wraca do `pending` (zmieniona treść musi przejść
  moderację ponownie, inaczej zatwierdzenie można obejść jedną edycją),
- odczyty (`getReviewsForProduct`, `getProductRating`,
  `getRatingsForProducts`) filtrują po `status = 'approved'`.

## Ścieżka 2 — gość (nowa)

Strona **`/opinia/[token]`** (Server Component + Server Action):

1. liczy skrót tokenu z adresu i szuka go w `review_invites`,
2. odrzuca, gdy: brak wpisu, `used_at` niepuste, `expires_at` minęło,
3. pokazuje kupiony produkt (zdjęcie, nazwa) i formularz: ocena 1–5, imię,
   adres e-mail (podpowiedziany z `orders.guest_email`), treść do 2000 znaków.

   **Imię podpowiadamy z klucza `fullname` w `orders.shipping_address`**, ale
   pole jest wymagane i edytowalne, bo sprawdzone w bazie: `fullname` ma
   **8 zamówień z 10** — przy dwóch trzeba je po prostu poprosić. Edytowalność
   ma jeszcze jeden cel: `fullname` to imię i nazwisko, a pod opinią publikuje
   się to, co w polu zostanie, więc autor musi móc skrócić „Jan Kowalski" do
   „Jan". (Dla zalogowanych publikuje się dziś całe `profiles.full_name` — ta
   ścieżka zostaje bez zmian.)
4. zapis przez klienta administracyjnego (gość nie ma sesji, więc RLS go nie
   przepuści): `status = 'pending'`, `guest_name`, `guest_email`,
5. ustawia `used_at` — **token jest jednorazowy**,
6. potwierdzenie: „Dziękujemy, opinia pojawi się po sprawdzeniu".

**Ważność tokenu: 90 dni** od wysłania. Wartość arbitralna, ale musi być
skończona — token bezterminowy w skrzynce pocztowej to trwałe uprawnienie do
pisania w cudzym imieniu.

**Adres e-mail gościa nigdy nie jest publikowany.** Służy wyłącznie do
odróżniania autorów (`uniq_review_guest`) i ewentualnego kontaktu. Publicznie
widać tylko imię — tak jak dziś przy zalogowanych widać `profiles.full_name`.

## Maile

### Wyzwalacz

`app/admin/zamowienia/actions.ts:84` woła już `notifyStatusChange(orderId, to,
from)` wewnątrz `after(...)`. Obok tego wywołania staje drugie:
`requestReviews(orderId)`, odpalane przy przejściu na `delivered`.

⚠️ **Świadomie NIE dopisuję `delivered` do `NOTIFY_STATUSES`.** Komentarz
w kodzie tłumaczy, czemu tam go nie ma, i ta decyzja zostaje w mocy: to nie
jest powiadomienie o zmianie statusu, tylko osobna wiadomość o innym celu.
Zmieszanie ich zepsułoby istniejące testy semantyki statusów i zaciemniło
regułę, która była kiedyś przemyślana.

`requestReviews(orderId)`:

1. bierze pozycje zamówienia (`order_items` → `product_id`, bez duplikatów),
2. ustala adres tak jak reszta maili — `orders.guest_email`, a dla konta adres
   z profilu (`customerEmailOf` w `app/_lib/mail/notify-order.ts`),
3. **dla zamówienia gościa** zakłada wpis w `review_invites` z nowym tokenem
   i wysyła mail z linkiem `/opinia/<token>` na każdy produkt,
4. **dla zamówienia z kontem** wysyła mail z linkiem na kartę produktu
   (`/produkt/<id>#opinie`) — zgodnie z wariantem B nie ma tu tokenu,
5. jest **idempotentna**: `unique (order_id, product_id)` w `review_invites`
   i sprawdzenie istniejącej opinii sprawiają, że ponowne przestawienie statusu
   nie wysyła drugiego maila.

Nowy szablon `ReviewRequest.tsx` w `app/_lib/mail/templates/`, na istniejącym
`_Layout.tsx`, żeby branding był wspólny z resztą korespondencji.

### Przypomnienie po 7 dniach

Nowa trasa `app/api/cron/przypomnienia-opinie/route.ts` — dokładnie wzorcem
`app/api/cron/promocje/route.ts`: `CRON_SECRET`, `safeCompareSecret`, funkcja
idempotentna, logika w osobnym module w `_lib`, żeby dała się przetestować bez
bazy i bez Resenda.

Warunek wysłania przypomnienia (wszystkie muszą zachodzić):

- minęło **co najmniej 7 dni** od `sent_at`,
- `reminded_at` jest puste (**przypominamy dokładnie raz**),
- opinii nadal nie ma: dla gościa `used_at is null`, dla konta brak wiersza
  w `product_reviews` dla tej pary (produkt, autor) w **jakimkolwiek** statusie
  — także `pending` i `rejected`. Ktoś, kto napisał i czeka na moderację, nie
  może dostać ponaglenia; ktoś, komu odrzucono spam, też nie.

Po wysłaniu ustawiamy `reminded_at`.

⚠️ **Zamówienia z kontem nie mają wpisu w `review_invites`** (wariant B — brak
tokenu), więc przypomnienie potrzebuje dla nich innego źródła terminu. Zakładamy
wpis w `review_invites` **także dla nich**, z `token_hash` wyliczonym z losowej
wartości, która nigdy nie trafia do maila — tabela pełni wtedy rolę rejestru
„komu i kiedy wysłano prośbę". Alternatywa (liczenie terminu z
`orders.status_updated_at`) rozjeżdża się przy każdej kolejnej zmianie statusu.

## Panel moderacji

Nowy ekran **`/admin/opinie`**: lista oczekujących (najstarsze pierwsze), przy
każdej ocena, treść, produkt, autor i to, czy pochodzi od konta czy od gościa.
Akcje: **Zatwierdź**, **Odrzuć**, oraz ptaszek **„nie pokazuj na stronie
głównej"** (`homepage_excluded`) — dostępny również przy opiniach już
zatwierdzonych, bo wykluczenie bywa decyzją późniejszą.

Licznik oczekujących w nawigacji panelu, tym samym wzorcem co licznik nowych
zamówień.

⚠️ **W panelu, przy przycisku „Odrzuć", staje zdanie wyjaśniające, do czego on
służy: do spamu, obelg i treści niezwiązanych z produktem — NIE do usuwania
niskich ocen.** Powód niżej, w sekcji o zgodności. To ostrzeżenie musi być
w miejscu, w którym Julia klika, a nie w dokumentacji, której nie czyta.

## Co widać publicznie

### Strona główna — slider

Nowa sekcja pod istniejącymi. Bierze opinie spełniające **wszystkie** warunki:

- `status = 'approved'`,
- `rating >= 4`,
- `homepage_excluded = false`,
- **treść niepusta i dłuższa niż 30 znaków** — samo „polecam" nikogo nie
  przekonuje, a zajmuje miejsce opinii, która przekonuje,

posortowane od najnowszych, limit **12**. Karuzela na wspólnym
`ProductCarousel` (tym samym, którego używa slider kolekcji na karcie
produktu). Pod spodem przycisk **„Zobacz wszystkie opinie"** → `/opinie`.

Gdy nie ma ani jednej pasującej opinii — **sekcja się nie renderuje**. Pusty
slider z nagłówkiem „Co mówią klienci" wygląda gorzej niż jego brak, a przez
najbliższy czas taki właśnie będzie stan.

### `/opinie` — wszystkie

Wszystkie zatwierdzone opinie, **łącznie z niskimi ocenami**, najnowsze
pierwsze, z nazwą ocenianego produktu i odnośnikiem do niego. Na górze zdanie
o tym, skąd opinie pochodzą i jak są weryfikowane.

### Karta produktu

Bez zmian poza filtrem statusu.

## Zgodność z przepisami

Sklep pokazuje opinie konsumentów, więc obowiązują go wymogi wprowadzone
dyrektywą Omnibus — te same, na które powołują się komentarze w migracjach 06
i 46. Dwa wymogi dotykają tego projektu wprost:

1. **Trzeba poinformować, czy i jak sklep weryfikuje, że opinie pochodzą od
   osób, które kupiły.** Realizuje to zdanie na `/opinie` — i jest ono
   prawdziwe, bo obie ścieżki wymagają zakupu: konto przez regułę RLS, gość
   przez token przypisany do konkretnej pozycji zamówienia.
2. **Nie wolno publikować wyłącznie opinii pozytywnych ani ukrywać
   negatywnych.** Dlatego `/opinie` i karta produktu pokazują **wszystkie**
   zatwierdzone oceny, a filtr `rating >= 4` obowiązuje **wyłącznie na stronie
   głównej**, gdzie jest wyborem redakcyjnym z ograniczonego miejsca, a nie
   ukrywaniem. Dlatego też przy przycisku „Odrzuć" stoi ostrzeżenie: moderacja
   ma odsiewać spam i obelgi, nie krytykę.

To nie jest porada prawna — to przełożenie zasady, którą projekt sam sobie
narzucił w migracji 06, na nowe ekrany.

## Testy i granica weryfikacji

Vitest chodzi w `environment: "node"`, bez jsdom i bez ani jednego
`.test.tsx` — testu komponentu nie da się tu napisać. Dlatego cała logika
warta sprawdzenia idzie do czystych modułów w `_lib`:

- **wybór opinii na stronę główną** — próg oceny, próg długości treści,
  wykluczenie, limit, kolejność; w tym przypadki brzegowe: treść pusta, treść
  30 znaków, opinia wykluczona z oceną 5,
- **warunek przypomnienia** — siedem dni, `reminded_at` już ustawione, opinia
  istnieje w statusie `pending`, opinia odrzucona,
- **walidacja tokenu** — nieznany, zużyty, wygasły, poprawny,
- **budowa ładunku maila** — właściwy odbiorca dla gościa i dla konta, właściwy
  adres w linku,
- **idempotencja `requestReviews`** — dwukrotne wywołanie nie tworzy drugiego
  zaproszenia.

**Czego nie przetestuję automatem — i dlaczego:** pełnego wysłania opinii przez
gościa. Taki test **zapisuje do bazy wspólnej z produkcją** i zostawiłby śmieci
wśród prawdziwych opinii. Playwrightem sprawdzę wyłącznie rzeczy nieniszczące:
że `/opinia/<zły-token>` odmawia poprawnie i że strona główna bez zatwierdzonych
opinii nie renderuje pustej sekcji. Zapis od początku do końca przejdę **ręcznie
na jednym prawdziwym zamówieniu** i pokażę wynik właścicielowi.

Playwright odpalać **na buildzie** (`npm run build` + `npm start`), nie na
`next dev`.

## Ryzyka i rzeczy do sprawdzenia przed kodem

1. **Limit zadań cyklicznych na Vercelu.** Jedno zadanie już istnieje
   (`/api/cron/promocje`), a plan ogranicza ich liczbę. **Do sprawdzenia, nie do
   zgadnięcia.** Jeśli drugi wpis się nie zmieści — przypomnienia wywołujemy
   z istniejącego przebiegu, a nowa trasa zostaje jako osobny, testowalny moduł.
2. **Migracje nie wjeżdżają same po merge'u** (potwierdzone na 57, 58 i 75).
   Po scaleniu trzeba zaaplikować ręcznie i sprawdzić po obiektach.
3. **Zdjęcie `not null` z `user_id` to zmiana nieodwracalna w praktyce** —
   po wpuszczeniu pierwszej opinii gościa nie da się jej przywrócić bez
   usunięcia danych. Migracja idzie na żywą bazę; kolejność: najpierw kolumny
   i indeksy, dopiero potem kod, który z nich korzysta.
4. **Baza jest wspólna z produkcją także w developmencie.** Każdy ręczny test
   dotyka prawdziwych danych.

## Czego świadomie NIE robimy

- **Odpowiedzi sklepu pod opinią** — nikt o to nie prosił, a to osobny ekran
  i osobna moderacja.
- **Zdjęć w opiniach** — kolejny magazyn plików i kolejna moderacja treści.
- **Głosowania „czy ta opinia była pomocna"** — bez ruchu nie ma z czego
  liczyć.
- **Opinii o sklepie** (w odróżnieniu od opinii o produkcie) — zgłoszenie
  mówiło wprost o produkcie.
- **Usuwania ręcznego bloku cytatów** `reviews` — jest nieużywany, ale
  usuwanie go to osobna, niezwiązana zmiana.

## Kolejność wdrożenia

Najpierw zbieranie, potem pokazywanie — odwrotnie dałoby puste ekrany.

1. **Baza** — migracja: kolumny, warunek autora, indeksy, `review_invites`,
   nowe reguły RLS.
2. **Odczyty i ścieżka zalogowanego** — filtr `approved` we wszystkich
   odczytach, `pending` przy zapisie, komunikat.
3. **Panel moderacji** — bez niego pierwsza opinia nie ma jak zostać
   opublikowana.
4. **Maile + zaproszenia** — `requestReviews`, szablon, wpięcie w zmianę
   statusu.
5. **Ścieżka gościa** — `/opinia/[token]`.
6. **Cron przypomnień.**
7. **Pokazywanie** — slider na stronie głównej i `/opinie`.
