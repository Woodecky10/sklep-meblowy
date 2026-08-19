# Opinie klientów: zdjęcia od klienta + publikacja natychmiastowa (spec)

**Data:** 2026-08-19
**Poprzednie części:** `2026-08-18-opinie-klientow-design.md` (zbieranie i moderacja,
wdrożone PR #160), plan 2/2 slidera (wdrożony PR #162).

## 1. Czego chce właściciel

Rozmowa z 2026-08-19. Dwie rzeczy, w tej kolejności zgłoszone:

1. **Klient ma móc dodać zdjęcie do opinii** — zarówno zalogowany, jak i gość,
   który wchodzi z linku w mailu.
2. **Opinia ze zdjęciami ma się pokazywać na stronie głównej** — w istniejącym
   sliderze „Co mówią klienci".

W trakcie rozmowy zapadła trzecia decyzja, która nie była w pierwotnym zgłoszeniu,
a waży najwięcej:

3. **Opinia publikuje się NATYCHMIAST, bez zatwierdzania.** Julia usuwa ją
   z panelu, jeśli coś jest nie tak. Uzasadnienie właściciela: opinię może
   wystawić wyłącznie osoba, która kupiła dany produkt.

### Rozstrzygnięcia właściciela — nie wracać bez powodu

| Pytanie | Decyzja |
|---|---|
| Kto dodaje zdjęcia | Zalogowany **i gość z linku** |
| Ile zdjęć | **3** (reklamacje mają 5 — tam zdjęcie jest dowodem) |
| Rozmiar | **8 MB sufit serwerowy**, wysyłka po przeskalowaniu w przeglądarce |
| Formaty | JPG / PNG / WebP / AVIF, **SVG zablokowany** (jak dziś) |
| Moderacja | **Po publikacji** (wariant A), nie przed |
| Usuwanie pojedynczych zdjęć | **Nie trzeba** — Julii wystarczy usunięcie całej opinii |
| Skąd Julia wie o nowej opinii | **Plakietka w panelu I mail** |
| Gdzie widać zdjęcia | Wszędzie, gdzie opinię: home, `/opinie`, karta produktu |

**Ryzyko wariantu A zostało właścicielowi przedstawione i świadomie przyjęte:**
zdjęcie od nieznanej osoby trafia na stronę główną, zanim ktokolwiek je obejrzy,
a link z zaproszenia bywa przekazywany dalej. Nie wracamy do tego tematu —
zapisane, żeby nie wyglądało na przeoczenie.

## 2. Co ta zmiana wywraca w tym, co już działa

To nie jest doklejenie kolumny. Model „moderacja przed publikacją" jest scalony
tydzień temu i siedzi w czterech miejscach naraz:

| Dziś | Po zmianie |
|---|---|
| `status` domyślnie `pending` | domyślnie `approved` |
| RLS insert wymusza `status = 'pending'` | dopuszcza `pending` i `approved` (patrz §3.1) |
| Każda edycja wraca do kolejki (`status: 'pending'` w `/api/reviews`) | edycja zostaje opublikowana, ale **czyści `moderated_at`** |
| Panel: Oczekujące / Zatwierdzone / Odrzucone | Nowe do przejrzenia / Opublikowane / Usunięte |
| Plakietka = liczba `pending` | plakietka = liczba `approved` z pustym `moderated_at` |
| Teksty mówią „opinia pojawi się po sprawdzeniu" | teksty muszą mówić prawdę (§3.4) |

## 3. Część 1 — publikacja natychmiastowa

### 3.1 Migracja 78

```sql
alter table public.product_reviews alter column status set default 'approved';
alter table public.product_reviews add column if not exists moderated_at timestamptz;
create index if not exists idx_product_reviews_do_przejrzenia
  on public.product_reviews (created_at desc) where moderated_at is null;
```

Polityki zapisu z migracji 76 wymuszają `status = 'pending'` — trzeba je
przepisać tak, by **dopuszczały `pending` I `approved`**:

```sql
with check ( ... and status in ('pending','approved') and exists (...zakup...) )
```

**Dlaczego oba, a nie samo `approved`:** to rozbraja kolejność wdrożenia.
Migracja i kod trafiają na produkcję osobno (migracje idą ręcznie), więc przy
`status = 'approved'` powstałoby okno, w którym stary kod wysyła `pending`
i RLS odrzuca **każdy** zapis opinii. Przy `in (...)` kolejność przestaje mieć
znaczenie. Dopuszczenie `pending` niczego nie otwiera: pod wariantem A
samodzielne opublikowanie własnej opinii jest zamierzone, a `pending` oznacza
tylko „niewidoczna" — czyli stan gorszy dla piszącego, nie lepszy.

`rejected` w `with check` NIE wchodzi: autor nie może sam sobie ustawić stanu,
którego znaczenie należy do panelu.

**Backfill:** niepotrzebny — w bazie jest **0 opinii** (sprawdzone 2026-08-19).
Gdyby między napisaniem specyfikacji a aplikacją migracji ktoś zdążył coś
wystawić, przed zmianą defaultu: `update public.product_reviews set status =
'approved' where status = 'pending';`.

### 3.2 Panel — trzy sekcje o nowym znaczeniu

- **Nowe — do przejrzenia**: `status='approved' and moderated_at is null`.
  Akcje: „Przejrzane" (ustawia `status='approved'` + stempluje `moderated_at` —
  druga część chroni wiersze pending zapisane w oknie wdrożenia, które panel
  musi wyświetlić, żeby mogły być opublikowane), „Usuń z witryny"
  (`status='rejected'` + stempel).
- **Opublikowane**: `approved` z wypełnionym `moderated_at`. Zostaje istniejący
  przełącznik „wyklucz ze strony głównej".
- **Usunięte**: `rejected`, z możliwością przywrócenia.

**Dwie ścieżki zapisu hardkodują dziś `status: 'pending'`** i obie trzeba ruszyć:
`app/api/reviews/route.ts` (upsert zalogowanego — dodatkowo ma tam komentarz
uzasadniający powrót do kolejki przy edycji, więc uzasadnienie też się
dezaktualizuje) oraz `app/opinia/[token]/actions.ts` (insert gościa). Zamiast
`pending` wstawiają `approved` i **zerują `moderated_at`** — dzięki temu edycja
opublikowanej opinii wraca Julii przed oczy, nie znikając z witryny.

`getPendingReviewsCount` → `getUnreviewedReviewsCount` (nazwa musi mówić, co
liczy — plakietka przestaje oznaczać kolejkę). Wzorzec liczenia „nikt tego
jeszcze nie dotknął" istnieje w projekcie: `getNewOrdersCount` w
`app/_lib/orders.ts:207` liczy zamówienia z `status_updated_at is null`.

### 3.3 Mail do Julii

Przy każdej nowej opinii, przez Resend (działa od 2026-07-29). Adres odbiorcy:
**`MAIL_ADMIN_TO`** — ta sama zmienna, na którą idzie powiadomienie o nowym
zamówieniu próbek (`sample-notify.ts:59`). NIE `COMPANY.email`: tamten adres jest
tekstem marki w stopce, a nie skrzynką powiadomień. Temat niesie ocenę i produkt, żeby
dało się ustawić priorytet bez otwierania: `Nowa opinia: 5★ — Element prosty Nube`.
Treść: ocena, autor, pełny tekst i link do `/admin/opinie`. Zdjęcia dochodzą
do maila razem z częścią 2 — część 1 wdraża się wcześniej i nie ma czego pokazać.

Wysyłka przez `after()`, tak jak `notifyStatusChange` w
`app/admin/zamowienia/actions.ts:85` — **awaria Resendu nie może wywalić zapisu
opinii ani pokazać klientowi błędu przy poprawnie zapisanej opinii**.

Budowanie treści maila idzie do czystej funkcji (bez Supabase i `next/headers`),
żeby dało się ją przetestować w vitest — projekt ma `environment: "node"`.

### 3.4 Teksty, które po tej zmianie stają się nieprawdziwe

Wariant A czyni z nich fałszywą obietnicę wobec klienta — do przepisania
w `pl.ts` i `de.ts`:

1. `/opinie`: „Każda opinia przechodzi moderację, która odsiewa spam
   i wypowiedzi obraźliwe" → moderacja jest po publikacji, nie przed.
2. Podziękowanie gościa (`app/opinia/[token]/actions.ts`): „Opinia pojawi się
   po sprawdzeniu" → „Twoja opinia jest już na stronie".
3. `ReviewForm` (klucz `moderacja`): to samo.

Zdanie o **weryfikacji zakupu** zostaje bez zmian — jest wymogiem dyrektywy
Omnibus i po zmianie nadal prawdziwe. Zdanie „nie usuwamy opinii krytycznych
i nie zmieniamy ich treści" również zostaje: to nadal obowiązuje Julię.

## 4. Część 2 — zdjęcia

### 4.1 Schemat: kolumna, nie tabela

```sql
alter table public.product_reviews
  add column if not exists photos text[] not null default '{}';
alter table public.product_reviews
  add constraint product_reviews_max_3_zdjecia check (array_length(photos, 1) is null or array_length(photos, 1) <= 3);
```

Dokładnie ten wzorzec, co `order_issues.photos` (`app/_lib/order-issues.ts:22`) —
tablica publicznych URL-i. Osobna tabela `review_photos` miałaby sens tylko przy
moderacji pojedynczych zdjęć, a właściciel jej **nie chce**; bez tego dokłada
join do każdego odczytu opinii i nic nie daje.

### 4.2 Ścieżka wgrywania — wzorzec z reklamacji, nie nowy wynalazek

Projekt ma już komplet klocków na klientowską wysyłkę zdjęć (modal reklamacji,
`OrderIssueModal.tsx`):

1. **Przeglądarka kompresuje** — `compressIfNeeded` (`app/_lib/image-compress.ts`),
   `browser-image-compression`, bez web workera (CSP `strict-dynamic`).
2. **Akcja serwerowa wgrywa jeden plik** i zwraca publiczny URL —
   `uploadIssuePhoto` (`app/konto/zamowienia/actions.ts:100`) jako wzór:
   `validateImageUpload` → bucket `products` → `getPublicUrl`.
3. **Formularz trzyma listę URL-i** i wysyła ją przy zapisie.
4. **Zapis waliduje**: liczba ≤ 3 i **każdy URL musi zaczynać się naszym
   prefiksem** — odpowiednik `isOwnIssuePhotoUrl` (`order-issues.ts:70`), inaczej
   ktoś wstawi do opinii dowolny obrazek z internetu.

Prefiks w storage: `opinie/` w istniejącym buckecie `products` (reklamacje
używają `order-issues/`). Nazwa pliku `${Date.now()}-${randomUUID()}.jpg` — nigdy
nazwa od klienta.

**Jedna świadoma różnica wobec reklamacji:** `compressIfNeeded` przepuszcza plik
poniżej 800 KB **bez przekodowania**, a przy opiniach przekodowanie musi być
BEZWARUNKOWE, z dwóch powodów:

- **EXIF z GPS-em.** Zdjęcie z telefonu niesie współrzędne. W reklamacji ląduje
  w panelu Julii; w opinii ląduje **na stronie głównej sklepu**, czyli publikujemy
  adres domowy klientki. Przekodowanie przez canvas metadane usuwa.
- **HEIC z iPhone'a.** `validateImageUpload` go nie przyjmuje (dozwolone tylko
  JPG/PNG/WebP/AVIF), więc bez konwersji klientka z iPhonem zobaczy „nieprawidłowy
  format" i nie doda nic. To ten sam problem, przez który „zdjęcia się nie dodają"
  w panelu admina.

Czyli: nowa funkcja `prepareReviewPhoto(file)` obok `compressIfNeeded` — zawsze
`fileType: "image/jpeg"`, `maxWidthOrHeight: 1600`, `initialQuality: 0.82`.
Gdy przekodowanie się nie powiedzie — **odrzucamy plik z komunikatem**, nie
wysyłamy oryginału (fallback „zwróć oryginał" z `compressIfNeeded` przepuściłby
zarówno EXIF, jak i HEIC).

### 4.3 Kto ma prawo wgrać plik

Storage nie zna reguł RLS z tabeli opinii, więc uprawnienie sprawdza akcja:

- **Zalogowany**: sesja + ten sam warunek zakupu co w polityce insertu
  (migracja 46/76). Bez tego każdy zalogowany dostaje darmowy hosting obrazków.
- **Gość**: token z zaproszenia — `findInviteByToken` + `inviteState(...) === "ok"`
  (`app/_lib/review-tokens.ts`). Token jest **zużywany dopiero po zapisie opinii**
  (`markInviteUsed`), więc trzy uploady na jednym tokenie działają, a po wysłaniu
  opinii link przestaje otwierać cokolwiek.
- Limit **3 pliki na zapis** egzekwowany dwa razy: w akcji i w checku bazy.

`serverActions.bodySizeLimit` to dziś 10 MB (`next.config.ts:35`) — mieści się.

### 4.4 Jak zdjęcia wyglądają

- **Strona główna (`ReviewCard`)**: pasek do 3 miniatur pod cytatem, kwadraty
  ~72 px, `object-cover`. Bez lightboxa i bez klikania — karta w sliderze prowadzi
  do produktu, a druga akcja w tym samym kafelku to pułapka na dotyku.
  ⚠️ Karta ma świeżo naprawione obcinanie cytatu (`flex-1` na opakowaniu,
  `line-clamp-6` na cytacie — gałąź `fix/opinie-karta-clamp`); miniatury wchodzą
  POD cytat jako osobny rząd, żeby tej równowagi nie zepsuć.
- **`/opinie` i karta produktu**: zdjęcia większe, w siatce, pełna treść opinii.
- `next/image` — host Supabase jest już w `remotePatterns` (`next.config.ts:27`).
- `alt`: „Zdjęcie od klienta do opinii o <nazwa produktu>" (PL) / odpowiednik DE.

**Wybór na stronę główną zostaje bez zmian** (`selectHomepageReviews`): ocena ≥ 4,
treść > 30 znaków, bez `homepage_excluded`. Zdjęcie **nie jest** warunkiem wejścia
na home ani nie podbija opinii w kolejce — inaczej opinie bez zdjęć zniknęłyby
z witryny, a przy dziesięciu zamówieniach to znaczy „pusta strona główna".

## 5. Testy

Projekt nie ma testów komponentów (`environment: "node"`, zero jsdom), więc:

- **vitest** dla czystej logiki: limit i walidacja listy URL-i,
  `isOwnReviewPhotoUrl` (URL z obcego hosta, z innego bucketu, z prefiksu
  reklamacji), budowanie treści maila do Julii, przejścia statusów w panelu.
- **Playwright** na buildzie (`npm run build` + `npm start`, nigdy `next dev`),
  spec **niezapisujący** — baza jest wspólna z produkcją.
- **Weryfikacja wizualna** karty z 1, 2 i 3 zdjęciami: build + tymczasowa flaga
  z danymi podglądowymi (wzorzec sprawdzony 2026-08-19: `PODGLAD_OPINII=1`
  wstrzykiwane w `getHomepageReviews`, łatka NIE wchodzi do commita).

## 6. Kolejność wdrożenia

1. **Migracja 78** — ręcznie przez MCP `apply_migration` (auto-apply w tym
   projekcie nie działa: 57, 58, 75, 76, 77). Jest wstecznie zgodna (§3.1) —
   dopuszcza jednocześnie `pending` i `approved`, więc stary kod na produkcji
   nadal może zapisywać opinie, dopóki nowy kod nie zostanie wdrożony. **To
   dotyczy wyłącznie tego, że migracja może wejść, zanim wejdzie kod — NIE
   znaczy to, że kolejność jest dowolna w drugą stronę.**

   **WYMÓG (nie sugestia):** scalenie PR-a z tą zmianą, czyli deploy kodu na
   Vercelu, może nastąpić WYŁĄCZNIE PO (a) zaaplikowaniu migracji 78 przez
   `apply_migration` **i** (b) potwierdzeniu zapytaniem do
   `information_schema`, że kolumna `moderated_at` istnieje w tabeli
   `product_reviews`. Obie ścieżki zapisu opinii wysyłają `moderated_at`
   w każdym zapisie (nowa opinia i edycja) — dopóki kolumny nie ma w bazie,
   PostgREST odrzuca CAŁY payload i żaden klient, ani zalogowany, ani gość,
   nie zapisze opinii, widząc komunikat, który nie mówi prawdy o przyczynie
   (wygląda jak błąd weryfikacji zakupu, a jest brakującą kolumną). Kolejność
   jest jednokierunkowa: **migracja → potwierdzenie w `information_schema` →
   dopiero wtedy merge PR-a.** Nigdy odwrotnie i nigdy „w tej samej chwili co"
   migrację.

   **Cache schematu PostgREST:** potwierdzenie zapytaniem do
   `information_schema` dowodzi wyłącznie, że kolumna istnieje W BAZIE — nie
   dowodzi, że PostgREST już ją widzi. PostgREST trzyma podręczną kopię
   schematu, którą odświeża z opóźnieniem po zmianach zastosowanych poza jego
   standardową ścieżką migracji (tak jak `apply_migration` przez MCP). Nie
   scalaj PR-a „sekundę po" potwierdzeniu w `information_schema` — odczekaj
   chwilę po migracji, zanim uruchomisz deploy.
2. **Część 1** — publikacja natychmiastowa: polityki, panel, plakietka, mail,
   teksty. Wdrażana i sprawdzona osobno.
3. **Część 2** — zdjęcia: kolumna, upload, walidacja, wyświetlanie.
4. Weryfikacja na żywym zamówieniu (pierwsze prawdziwe zaproszenie).

## 7. Ryzyka i punkty otwarte

- **HEIC na desktopie.** `browser-image-compression` dekoduje przez canvas.
  iPhone i Safari HEIC odczytają (kodek systemowy), ale plik HEIC przeniesiony na
  desktopowego Chrome'a — nie. Do sprawdzenia na żywym telefonie; jeśli padnie,
  komunikat musi mówić, co zrobić, a nie „nieprawidłowy format".
- **Osierocone pliki.** Ktoś wgra trzy zdjęcia i nie wyśle opinii — pliki zostają
  w storage bez wiersza. Reklamacje mają dziś ten sam dług. Świadomie nie
  sprzątamy w tej iteracji; jeśli urośnie, cron kasujący pliki z prefiksu
  `opinie/` starsze niż dobę i niewystępujące w `photos`.
- **Zdjęcie na stronie głównej bez sprawdzenia** — konsekwencja wariantu A,
  przyjęta świadomie (§1).
- **Plakietka a mail** — jeśli Julia czyta maila i nie wchodzi do panelu,
  `moderated_at` zostaje puste i plakietka rośnie. To zamierzone: plakietka
  gaśnie od kliknięcia w panelu, nie od przeczytania maila.
- **Dwie opinie tego samego człowieka** (raz jako gość, raz z konta) nadal są
  możliwe — konsekwencja wariantu B z poprzedniej specyfikacji, bez zmian.
