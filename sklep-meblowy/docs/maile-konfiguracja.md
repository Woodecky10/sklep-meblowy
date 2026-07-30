# Maile transakcyjne — konfiguracja (kroki po stronie człowieka)

Kod jest gotowy i działa w trybie no-op bez klucza. Żeby maile zaczęły
wychodzić, trzeba wykonać poniższe kroki. Bez nich sklep nie wysyła nic i
tylko loguje pominięcie — nic się nie psuje.

Ten dokument zakłada, że czytający nie widział wcześniej tego projektu.
Wszystkie kroki są wykonywalne bez dodatkowych pytań.

## 1. Konto Resend i weryfikacja domeny

1. Konto na resend.com (darmowy plan: 3000 maili/mies., 100/dzień).
2. Add Domain → `mollien.pl`. Resend wygeneruje rekordy DKIM/SPF.
3. Rekordy wklej w panelu **home.pl** — tam jest strefa DNS tej domeny
   (nameservery `dns.home.pl`, `dns2.home.pl`, `dns3.home.pl`).
   **Nie szukaj DNS w Vercelu** — Vercel jest tylko celem rekordów
   (`www` → CNAME na `f893d348ab904065.vercel-dns-017.com`, apex → A
   `216.198.79.1`). Sprawdzone 2026-07-28: nameservery domeny wskazują na
   home.pl, nie na Vercel — kto szuka strefy DNS w dashboardzie Vercela,
   traci czas.
4. W Resend kliknij Verify. Propagacja zwykle kilka minut.
5. API Keys → utwórz klucz do wysyłki.

## 2. Zmienne środowiskowe (Vercel → Settings → Environment Variables)

| Zmienna | Wymagane? | Przykład | Uwagi |
|---|---|---|---|
| `RESEND_API_KEY` | Tak — bez niej kod działa w trybie no-op (nic nie wysyła, tylko loguje) | `re_...` | sekret, nigdy do repo |
| `MAIL_FROM` | Tak — bez niej `sendMail` pomija wysyłkę i loguje błąd | `Mollien <zamowienia@mollien.pl>` | domena musi być zweryfikowana w Resend |
| `MAIL_REPLY_TO` | **Tak, mimo że kod zadziała bez niej** — patrz ostrzeżenie niżej | adres, który KTOŚ CZYTA | brak MX na `mollien.pl` sprawia, że każda odpowiedź klienta bez tej zmiennej odbije się |
| `MAIL_ADMIN_TO` | Nie (opcjonalna) — bez niej klient i tak dostaje mail, tylko właścicielka nie dostaje „Nowe zamówienie" | adres właścicielki | tam idzie „Nowe zamówienie" |

> ⚠️ **Na `mollien.pl` nie ma poczty.** Sprawdzone 2026-07-28: zero
> rekordów MX na domenie. Wysyłanie transakcyjnych maili to nie problem —
> SPF/DKIM dotyczą tylko wychodzących. Problem jest z **odpowiedzią klienta**:
> bez MX serwer odbierający pocztę dla domeny to (z definicji DNS) fallback
> na rekord A — a tam stoi Vercel, który nie prowadzi żadnego serwera SMTP.
> Każda odpowiedź na maila z `mollien.pl` (albo na adres z `MAIL_FROM`, jeśli
> nie ustawi się `MAIL_REPLY_TO`) po prostu odbije się do klienta.
>
> To ma realne znaczenie: mail o anulowaniu zamówienia kończy się zdaniem
> „Jeśli to pomyłka albo masz pytania — odpowiedz na tę wiadomość albo napisz
> na [adres z `COMPANY.email`]" i trafia do klienta, któremu właśnie
> anulowano zamówienie na kilka tysięcy złotych. Drugi adres w tym zdaniu
> jest zabezpieczeniem na wypadek odbitej odpowiedzi, nie zwalnia z ustawienia
> `MAIL_REPLY_TO` — odbita odpowiedź w tym momencie to wciąż najgorszy możliwy
> scenariusz — klient, który próbuje wyjaśnić sprawę, dostaje w odpowiedzi
> komunikat o błędzie dostarczenia i wrażenie, że sklep zniknął.
>
> Dlatego `MAIL_REPLY_TO` traktujemy jako **wymaganą** zmienną, nie
> opcjonalną, choć kod się bez niej nie wywali (`sendMail` po prostu nie
> doda nagłówka Reply-To).

### Decyzja właściciela (2026-07-29): jeden adres kontaktowy

`mollien.julia@gmail.com` — ten sam adres w trzech rolach:

| Gdzie | Wartość |
|---|---|
| `MAIL_REPLY_TO` | `mollien.julia@gmail.com` |
| `MAIL_ADMIN_TO` | `mollien.julia@gmail.com` |
| `COMPANY.email` (pasek kontaktu na stronie, treść maila o anulowaniu) | `mollien.julia@gmail.com` |

Powód: klient ma widzieć **jeden** adres, niezależnie czy odpisuje na maila,
czy przepisuje kontakt ze strony. Poprzednio w kodzie był
`mollien.shop@gmail.com` i przy reply-to na innej skrzynce mail o anulowaniu
podawałby klientowi dwa różne adresy.

**Jedyny inny adres, jaki widzi klient, to nadawca** — `MAIL_FROM`, czyli
`Mollien <zamowienia@mollien.pl>`. Nie da się nadawać z gmail.com: Resend
wysyła tylko z domeny, którą się zweryfikowało, a gmail.com nie jest Twoją
domeną. Adres `zamowienia@mollien.pl` nie musi istnieć jako skrzynka — do
wysyłki wystarcza zweryfikowana domena. Odpowiedzi i tak prowadzi `Reply-To`.

Alternatywa na przyszłość: skrzynka na domenie w home.pl + rekordy MX — wtedy
wszystkie trzy role mogłyby być na `@mollien.pl`. To osobne, większe zadanie
niż samo wysyłanie maili.

## 3. Mail weryfikacyjny konta (Supabase)

Ten szablon **nie żyje w repo jako to, co realnie wysyła Supabase** — Supabase
trzyma treść maila weryfikacyjnego w konfiguracji projektu (panel), nie w
kodzie tej aplikacji. `app/_lib/mail/templates/AuthConfirm.tsx` jest źródłem
prawdy do generowania tej treści (żeby dało się ją wersjonować i odtworzyć
razem z pozostałymi szablonami), ale trzeba go ręcznie „wypuścić" do panelu
Supabase po każdej zmianie.

> Ścieżki w panelu: nowszy dashboard Supabase scalił „SMTP Settings" i
> „Email Templates" w jedną pozycję **Authentication → Emails** (sekcja
> NOTIFICATIONS w menu), z zakładkami SMTP i Templates. Osobno, w sekcji
> CONFIGURATION, są **URL Configuration** i **Rate Limits**.

1. **Authentication → Emails → SMTP**: włącz custom SMTP i wpisz dane z
   Resenda — host `smtp.resend.com`, port `465`, **username `resend`**
   (dosłownie to słowo, nie adres e-mail), hasło = `RESEND_API_KEY`,
   **sender `no-reply@mollien.pl`**, sender name `Mollien`. Zdejmuje to limit
   kilku maili na godzinę wbudowanego mailera Supabase i wypuszcza wiadomość
   z waszym DKIM (czyli mail wygląda jak wysłany przez `mollien.pl`, nie
   przez Supabase). Supabase przy zapisie próbuje się połączyć, więc złe
   dane zobaczysz od razu jako błąd na tym ekranie.
   > **Nadawca maili Auth jest CELOWO inny niż `MAIL_FROM`.** To pole w panelu
   > Supabase jest niezależne od zmiennej w Vercelu: maile o zamówieniach
   > wysyła kod aplikacji z `zamowienia@mollien.pl`, a maile konta
   > (rejestracja, reset hasła) Supabase z `no-reply@mollien.pl` — decyzja
   > właściciela 2026-07-30, bo „zamówienia" przy mailu o haśle wyglądało jak
   > pomyłka systemu. Żaden z tych adresów NIE jest skrzynką i nie musi być;
   > `no-reply` jest przy tym uczciwy, bo na maile Auth faktycznie nie da się
   > odpowiedzieć — Supabase nie ma pola Reply-To.
2. **Authentication → URL Configuration** — bez tego kroku link z maila
   kończy się błędem:
   - **Site URL** = `https://www.mollien.pl`. To on podstawia się pod
     `{{ .SiteURL }}` w szablonie. Jeśli zostanie tu `http://localhost:3000`
     z czasów dewelopmentu, klient dostanie link na Twój localhost.
   - **Redirect URLs** muszą zawierać `https://www.mollien.pl/**`,
     `https://mollien.pl/**` (prod serwuje `www`, ale kod deklaruje apex —
     patrz ONBOARDING) i `http://localhost:3000/**` do dewelopmentu.
     Dotyczy to też logowania Google, które wraca na `/auth/callback`.
3. Wygeneruj HTML: z katalogu `sklep-meblowy/` uruchom
   `npm run preview:mail`. Wynik trafia do gitignorowanego
   katalogu `mail-preview/` — weź `mail-preview/auth-confirm-pl.html`.
4. **Authentication → Emails → Templates → Confirm signup**:
   - **Subject**: `Potwierdź adres e-mail` (domyślnie jest tam angielskie
     „Confirm Your Signup"; konwencja tematów w sklepie — patrz
     `notify-order.ts` — to polski tekst bez nazwy marki i bez emoji).
   - **Treść**: usuń domyślny szablon i wklej całą zawartość pliku (surowe
     HTML, nie fragment). Znaczniki `{{ .SiteURL }}` i `{{ .TokenHash }}`
     muszą zostać nietknięte — Supabase podstawia pod nie prawdziwe wartości
     w momencie wysyłki. W podglądzie panelu link pokaże się jako tekst,
     nie jako działający adres; to normalne.
   - Skrypt podglądu ma asekurację: gdyby render zakodował klamry w `href`
     (`%7B%7B`/`%20`), naprawia to przed zapisem pliku. Warto i tak zerknąć,
     czy w `href` widać dosłownie `{{ .SiteURL }}` i `{{ .TokenHash }}`.
5. Zarejestruj konto testowe i sprawdź, że mail dochodzi, wygląda jak sklep
   (branding, nie domyślny szablon Supabase), a kliknięcie linku **aktywuje
   konto i wraca na sklep** (nie na `/logowanie?error=...`).

> ⚠️ **Nie używaj `{{ .ConfirmationURL }}` w tym szablonie.** Ten znacznik
> prowadzi do endpointu `/auth/v1/verify` Supabase, który sam zużywa token i
> przekierowuje na `redirect_to` **bez** `token_hash`. Nasza trasa
> `app/auth/confirm/route.ts` czeka dokładnie na `token_hash` + `type`
> (woła `verifyOtp`), więc dostaje pusty query i odbija klienta na
> `/logowanie?error=invalid_link` — mimo że konto w tym momencie jest już
> aktywne. Tak zachowywał się domyślny szablon Supabase; sprawdzone na
> produkcji 2026-07-30 (konto testowe potwierdzone w bazie, a przeglądarka
> pokazała `{"error":"requested path is invalid"}`, bo adres powrotu nie był
> na liście Redirect URLs). Dlatego link w szablonie idzie **wprost do naszej
> trasy** z `token_hash`, a weryfikację robimy sami.
>
## 3b. Mail resetu hasła (Supabase) — ta sama procedura, drugi szablon

Źródło: `app/_lib/mail/templates/PasswordReset.tsx` → po `npm run preview:mail`
plik `mail-preview/auth-reset-pl.html`.

1. **Authentication → Emails → Templates → Reset password**:
   - **Subject**: `Ustaw nowe hasło`
   - **Treść**: usuń domyślny (angielski) szablon i wklej całość pliku.
2. Link w tym szablonie ma `type=recovery&next=/reset-hasla` — w Confirm signup
   jest `type=signup&next=/konto`. Ten sam `token_hash`, inny typ weryfikacji;
   `EmailOtpType` w `@supabase/auth-js` dopuszcza oba.
3. Test end-to-end: `/zapomnialem-hasla` → podaj adres istniejącego konta → klik
   w mail → powinno wylądować na `/reset-hasla` z formularzem i adresem konta w
   nagłówku → ustaw hasło → zaloguj się nowym.
   > Testuj **na wylogowanej przeglądarce (incognito)**. `app/reset-hasla/page.tsx`
   > wymaga JAKIEJKOLWIEK sesji, nie konkretnie recovery — zalogowany user
   > ustawi hasło nawet gdy mailowa droga jest zepsuta, więc aktywna sesja
   > maskuje dokładnie ten błąd.
   >
   > Dowód, że zadziałał właściwy flow: po kliknięciu w link **jesteś od razu
   > zalogowany** (sesję tworzy `verifyOtp` w naszej trasie). Do weryfikacji
   > używaj Resend → Logs, a **nie** kolumny `auth.users.recovery_sent_at` —
   > przy udanym resecie 2026-07-30 została `null` i doprowadziła do błędnego
   > wniosku, że maila nie było.

> ⚠️ **Bez tego kroku reset hasła NIE DZIAŁA i wygląda jak pętla.**
> `requestPasswordReset` (`app/_lib/auth-actions.ts`) kieruje link recovery na
> `/auth/confirm?next=/reset-hasla`. Przy domyślnym szablonie opartym na
> `{{ .ConfirmationURL }}` nasza trasa nie dostaje `token_hash`, więc nie tworzy
> sesji recovery — a `app/reset-hasla/page.tsx` bez usera odsyła z powrotem na
> `/zapomnialem-hasla`. Klient krąży między formularzem i mailem, nigdy nie
> ustawiając hasła. Wykryte 2026-07-30 przy uruchamianiu maila weryfikacyjnego.

Źródło szablonu: `app/_lib/mail/templates/AuthConfirm.tsx`. Po każdej zmianie
tego pliku trzeba powtórzyć kroki 2–3 — panel Supabase nie aktualizuje się
sam, treść w panelu jest statyczną kopią wygenerowanego HTML.

> **Znane ograniczenie: mail weryfikacyjny jest tylko po polsku.** Supabase
> trzyma jeden szablon na typ maila (np. jeden „Confirm signup" dla całego
> projektu) — nie jeden na język. Generujemy i wklejamy wyłącznie
> `mail-preview/auth-confirm-pl.html`, więc klient rejestrujący się na `/de`
> i tak dostaje polski mail weryfikacyjny. Nie ma tu prostego obejścia bez
> Supabase Edge Function podstawiającej szablon po locale — to osobne,
> większe zadanie. Zapisane tutaj, żeby nikt nie zgłaszał tego jako bug.

## 4. Pułapki w panelu admina (przeczytaj przed pierwszą realizacją)

1. **Wpisz przewoźnika i numer śledzenia PRZED przestawieniem statusu na
   „Wysłane".** Te pola zapisuje osobny formularz („Dane dostawy") niż
   dropdown statusu — to nie jest jeden krok. Mail „w drodze" wysyła się
   dokładnie raz, w momencie zmiany statusu, i jeśli `carrier`/
   `tracking_number` są w tym momencie puste, szablon po prostu je pomija
   (nie czeka, nie przypomina). Nie ma re-send: żeby klient dostał
   przewoźnika i numer śledzenia mailem, trzeba by anulować i odtworzyć całą
   sekwencję statusów, co nie jest realną opcją. W skrócie: najpierw
   „Dane dostawy", potem dropdown na „Wysłane" — w tej kolejności.
2. **Ręczne przestawienie opłaconego online zamówienia z `pending` w panelu
   trwale gasi jego mail „Zamówienie przyjęte".** Webhook Stripe wysyła to
   potwierdzenie tylko zwycięzcy przejścia `pending → paid` (CAS w
   `markOrderPaid`). Jeśli admin ręcznie przestawi zamówienie z `pending` na
   inny status, zanim webhook zdąży je rozliczyć, to gdy płatność faktycznie
   dojdzie, webhook już nie zastaje statusu `pending` — nie ma czego
   zaklaimować, mail się nie wysyła, i nic tego nie sygnalizuje. Klient nigdy
   nie dostaje potwierdzenia zakupu. Zamówienia online w statusie `pending`
   anuluj albo przesuwaj dalej tylko wtedy, gdy godzisz się z tym skutkiem.

## 5. Test końcowy po uzbrojeniu

Wykonaj po ustawieniu zmiennych z sekcji 2 i skonfigurowaniu SMTP z sekcji 3.

1. Złóż testowe zamówienie za pobraniem → klient dostaje „Zamówienie
   przyjęte", właścicielka „Nowe zamówienie" (jeśli ustawiono
   `MAIL_ADMIN_TO`).
2. W formularzu „Dane dostawy" wpisz przewoźnika i numer śledzenia, **potem**
   w panelu zmień status na **Wysłane** (patrz sekcja 4, punkt 1 — w tej
   kolejności) → klient dostaje „w drodze" z przewoźnikiem i numerem
   śledzenia.
3. Na innym zamówieniu ustaw **Anulowane** → klient dostaje „anulowane".
   Jeśli zamówienie było opłacone online, mail wspomina zwrot środków; nie
   obiecuje automatycznego przelewu — tylko że sklep się odezwie.
4. Ustaw status **W realizacji** → **żaden mail nie powinien wyjść**.
   To jest celowe, nie przeoczenie: „W realizacji" to status, który admin
   ustawia właśnie tym klikiem, który gasi licznik nowych zamówień w
   panelu (górna belka admina). Gdyby ten status wysyłał mail do klienta,
   właścicielka dostawałaby powiadomienie o wysyłce maila przy każdym
   zwykłym „biorę to zamówienie do realizacji" — a to nie jest zdarzenie,
   o którym trzeba mailować klienta. Jeśli w tym kroku mail mimo to
   wyjdzie, to regresja w `app/_lib/mail/status-notify.ts`
   (`NOTIFY_STATUSES`), nie coś do „naprawienia" po stronie Supabase/Resend.
5. Zarejestruj konto testowe (patrz sekcja 3, krok 4) i sprawdź mail
   weryfikacyjny end-to-end — to jedyny z pięciu maili, którego nie da się
   przetestować przez samo złożenie zamówienia.
6. Sprawdź zakładkę **Logs** w panelu Resend i potwierdź, że każdy z
   powyższych testów widnieje jako `Delivered` (nie `Bounced`/`Failed`).
   To jest **jedyne** miejsce, w którym nieudana wysyłka jest w ogóle
   widoczna — kod nic nie zapisuje do bazy, nie ma kolumny „mail wysłany",
   nie ma retry, a panel admina po zmianie statusu i tak pokaże „Status
   zaktualizowany" niezależnie od tego, czy klient faktycznie coś dostał
   (`notifyStatusChange`/`notifyOrderPlaced` nigdy nie rzucają, żeby nieudany
   mail nie zepsuł działającej zmiany statusu ani zakupu). Zerknij na Logs
   po tym teście końcowym, a potem sprawdzaj tam **od czasu do czasu** —
   to jedyny sposób, żeby zauważyć, że np. Resend wyłączył konto albo domena
   przestała być zweryfikowana.

---

## 5. Zaległości — świadomie odłożone (nie blokują uruchomienia)

Lista z końcowej recenzji gałęzi. Nic tu nie jest awarią; wszystko jest znane
i celowo zostawione na później. Kolejność wg tego, co najpewniej zaboli pierwsze.

1. **Suma w euro może się nie zgadzać o kilka euro.** Mail sumuje ceny
   jednostkowe pozycji (każda zaokrąglona w górę przy zapisie zamówienia), a
   `orders.total` powstał z jednego zaokrąglenia całości — suma sufitów nie równa
   się sufitowi sumy. Przy 3 × 1001 zł i kursie 0,23 wychodzi 693 € w mailu przy
   691 € zapisanych. Strona ukrywa tę resztę w wierszu „Dostawa"; mail takiego
   wiersza nie ma, więc niemiecki klient zobaczy `Produkte − Rabatt ≠ Bezahlt`.
   **Dotyczy tylko `/de`**, a ceny w EUR nie są jeszcze uruchomione — stąd odłożone.
   Uwaga przy naprawie: fikstura w `scripts/preview-mail.mjs` liczy `total` formułą
   **maila**, nie checkoutu, więc podgląd tego błędu nie pokaże.
2. **`getStripe()` jest wołane bezwarunkowo w `/api/checkout`**, więc zamówienie za
   pobraniem też wymaga `STRIPE_SECRET_KEY` — mimo że Stripe'a nie dotyka. Błąd
   istniał przed mailami. PR #48 (migracja na Przelewy24) i tak wycina Stripe z tej
   trasy; jeśli #48 poczeka, warto przenieść to wywołanie pod warunek `isCod`.
3. **Luka w rozpoznawaniu zapłaty przy anulowaniu.** Jeśli admin przestawi
   **nieopłacone** zamówienie online z `pending` na `processing` i anuluje je
   dopiero potem, mail powie „było opłacone". Reguła (`wasOrderPaid` w
   `app/_lib/mail/status-notify.ts`) nie ma czym tego odróżnić bez oparcia się o
   kolumnę płatności, którą PR #48 usuwa. Obejście: anuluj nieopłacone zamówienia
   wprost z `pending`.
4. **Gałąź „gość bez konta" w mailach nie ma przypadku w podglądzie.** Została
   sprawdzona jednorazowym skryptem, ale `npm run preview:mail` jej nie renderuje,
   więc regresja w tym wariancie nie zostanie zauważona wzrokowo.
5. **`getMailBranding` nie ma testu.** Czysta połowa (`brandingFromRaw`) jest pokryta
   sześcioma przypadkami; nieprzetestowane zostaje 12 linii, których jedyną gałęzią
   jest `catch → paleta domyślna`.
6. **Brak `maxDuration` dla akcji panelu.** Trasy `/api/checkout` i `/api/webhook`
   mają `maxDuration = 30`; dla Server Action ustawia się to na poziomie strony,
   więc `app/admin/zamowienia/actions.ts` nie ma tego limitu.

### Dwie decyzje produktowe (nie techniczne)

- **Na jaki adres pisać do zalogowanego klienta.** Dziś mail idzie na adres z konta
  (`profiles.email`), nie na ten wpisany w formularzu zamówienia — a te mogą się
  różnić, jeśli ktoś zamawia na cudzy adres. Adres z konta jest potwierdzony i
  pewnie działa; adres z formularza nie jest ani jednym, ani drugim, i nie ma go
  gdzie zapisać bez migracji. Rekomendacja: zostawić, a w checkoucie pokazać
  klientowi, na jaki adres poleci potwierdzenie.
- **Suma linii przy pozycji kupionej w kilku sztukach.** Mail pokazuje `2 × 1090 zł`,
  ale nie `2180 zł` — klient musi mnożyć w głowie, żeby zweryfikować kwotę końcową.
