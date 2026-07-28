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
> „Jeśli to pomyłka albo masz pytania — odpowiedz na tę wiadomość" i trafia
> do klienta, któremu właśnie anulowano zamówienie na kilka tysięcy złotych.
> Odbita odpowiedź w tym momencie to najgorszy możliwy scenariusz — klient,
> który próbuje wyjaśnić sprawę, dostaje w odpowiedzi komunikat o błędzie
> dostarczenia i wrażenie, że sklep zniknął.
>
> Dlatego `MAIL_REPLY_TO` traktujemy jako **wymaganą** zmienną, nie
> opcjonalną, choć kod się bez niej nie wywali (`sendMail` po prostu nie
> doda nagłówka Reply-To). `app/_lib/company.ts` już teraz podaje
> `mollien.shop@gmail.com` jako kontaktowy adres sklepu (`COMPANY.email`) —
> to działająca skrzynka i naturalny kandydat na `MAIL_REPLY_TO`.
> Alternatywa: założyć skrzynkę na domenie w home.pl i dopiero wtedy dodać
> rekordy MX (co jest osobnym, większym zadaniem niż samo wysyłanie maili).

## 3. Mail weryfikacyjny konta (Supabase)

Ten szablon **nie żyje w repo jako to, co realnie wysyła Supabase** — Supabase
trzyma treść maila weryfikacyjnego w konfiguracji projektu (panel), nie w
kodzie tej aplikacji. `app/_lib/mail/templates/AuthConfirm.tsx` jest źródłem
prawdy do generowania tej treści (żeby dało się ją wersjonować i odtworzyć
razem z pozostałymi szablonami), ale trzeba go ręcznie „wypuścić" do panelu
Supabase po każdej zmianie.

1. Panel Supabase → **Authentication → SMTP Settings**: włącz custom SMTP i
   wpisz dane SMTP z Resenda (host, port, użytkownik, hasło/klucz API).
   Zdejmuje to limit kilku maili na godzinę wbudowanego mailera Supabase i
   wypuszcza wiadomość z waszym DKIM (czyli mail wygląda jak wysłany przez
   `mollien.pl`, nie przez Supabase).
2. Wygeneruj HTML: z katalogu `sklep-meblowy/` uruchom
   `npx tsx scripts/preview-mail.mjs`. Wynik trafia do gitignorowanego
   katalogu `mail-preview/` — weź `mail-preview/auth-confirm-pl.html`.
3. Panel Supabase → **Authentication → Email Templates → Confirm signup**:
   wklej całą zawartość pliku (surowe HTML, nie tylko fragment) w pole
   treści szablonu. Znacznik `{{ .ConfirmationURL }}` musi zostać
   nietknięty — to Supabase podstawia pod niego prawdziwy, jednorazowy link
   aktywacyjny w momencie wysyłki. Skrypt podglądu ma wbudowaną asekurację:
   jeśli render przypadkiem zakoduje ten znacznik w atrybucie `href`
   (np. na `%7B%7B .ConfirmationURL %7D%7D`), skrypt to wykrywa i naprawia
   przed zapisem pliku — ale i tak warto zerknąć w plik przed wklejeniem i
   sprawdzić, że `{{ .ConfirmationURL }}` w atrybucie `href` wygląda
   dosłownie tak (bez `%7B`/`%20`).
4. Zarejestruj konto testowe i sprawdź, że mail dochodzi, wygląda jak sklep
   (branding, nie domyślny szablon Supabase), a kliknięcie linku aktywuje
   konto.

Źródło szablonu: `app/_lib/mail/templates/AuthConfirm.tsx`. Po każdej zmianie
tego pliku trzeba powtórzyć kroki 2–3 — panel Supabase nie aktualizuje się
sam, treść w panelu jest statyczną kopią wygenerowanego HTML.

## 4. Test końcowy po uzbrojeniu

Wykonaj po ustawieniu zmiennych z sekcji 2 i skonfigurowaniu SMTP z sekcji 3.

1. Złóż testowe zamówienie za pobraniem → klient dostaje „Zamówienie
   przyjęte", właścicielka „Nowe zamówienie" (jeśli ustawiono
   `MAIL_ADMIN_TO`).
2. W panelu zmień status na **Wysłane** → klient dostaje „w drodze" z
   przewoźnikiem i numerem śledzenia.
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
