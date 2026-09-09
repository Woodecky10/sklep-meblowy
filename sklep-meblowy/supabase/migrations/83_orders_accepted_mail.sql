-- ============================================================
-- Migracja 83: ręczna wysyłka maila „Dziękujemy za zamówienie".
-- Uruchom w Supabase SQL Editor (migracje NIE aplikują się automatycznie).
-- ============================================================
-- Spec: docs/superpowers/specs/2026-09-02-zamowienia-zewnetrzne-design.md
--       (sekcja „Aktualizacja 2026-09-09 (wieczór) — ręczna wysyłka")
--
-- Zgłoszenie pracownicy obsługującej panel (2026-09-09): mail „Dziękujemy za
-- zamówienie" wychodził do klienta AUTOMATYCZNIE (przy przejściu na
-- „W realizacji", a dla pobrania od razu przy zapisie). Pracownica go nie
-- widziała, nie mogła zmienić treści (czas realizacji „do 21 dni roboczych"
-- był wpisany na sztywno w szablonie) i — jej słowami — „nawet nie wiem, czy
-- ją wysyłałam".
--
-- Decyzja właściciela: automat ZNIKA, mail idzie wyłącznie z przycisku na
-- karcie zamówienia, a treść jest w pełni edytowalna. Te dwie kolumny są
-- odpowiedzią na „nie wiem, czy wysłałam": KIEDY poszedł i CO dokładnie
-- zobaczył klient.
--
-- ⚠️ KOLEJNOŚĆ OBOWIĄZKOWA: tę migrację aplikujemy PRZED mergem gałęzi
-- (jak 78/79/80/82). Po merge akcja `sendExternalOrderMail` zapisuje obie
-- kolumny; na bazie bez nich PostgREST odpowiada PGRST204 — a wtedy mail już
-- POSZEDŁ do klienta, tylko panel pokaże błąd zapisu i status wysyłki zostanie
-- na „Jeszcze nie wysłano". ODCZYT jest bezpieczny w obie strony: wszystkie
-- selecty zamówień idą przez `select("*")`, a typ `Order` ma te pola
-- opcjonalne — brak kolumn nie wywraca karty zamówienia.

-- ============================================================
-- 1. Kiedy wysłano
-- ============================================================
-- NULL = jeszcze nie wysłano; karta zamówienia woła wtedy głośno (bursztynowo)
-- „Jeszcze nie wysłano". Osobna kolumna, a nie odczyt z logów Resenda: panel
-- ma odpowiadać na to pytanie bez wychodzenia poza naszą bazę.
alter table public.orders
  add column if not exists accepted_mail_sent_at timestamptz null;

comment on column public.orders.accepted_mail_sent_at is
  'Kiedy pracownica wysłała z panelu maila „Dziękujemy za zamówienie" (migracja 83). NULL = jeszcze nie wysłano.';

-- ============================================================
-- 2. Co dokładnie wysłano
-- ============================================================
-- Snapshot TREŚCI (plain text, bez ramki brandingowej — ta jest w szablonie
-- ExternalOrderAccepted). Trzy powody, dla których trzymamy ją w bazie zamiast
-- generować na nowo:
-- 1) pracownica edytuje tekst przed wysyłką — wygenerowana propozycja nie jest
--    tym, co zobaczył klient;
-- 2) po wysyłce karta pokazuje DOKŁADNIE wysłaną treść (a nie propozycję),
--    więc rozmowa z klientem opiera się na faktach;
-- 3) przy „Wyślij ponownie" jest od czego zacząć.
-- Bez limitu długości w bazie — górna granica (ACCEPTED_MAIL_MAX_LENGTH)
-- siedzi w kodzie akcji, bo jest regułą UI, nie integralności danych.
alter table public.orders
  add column if not exists accepted_mail_body text null;

comment on column public.orders.accepted_mail_body is
  'Snapshot treści ostatniej wysłanej wiadomości „Dziękujemy za zamówienie" (zwykły tekst, migracja 83). NULL = nigdy nie wysłano.';

-- ============================================================
-- 3. RLS — nic do zmiany, sprawdzone
-- ============================================================
-- Polityka „orders: właściciel czyta swoje" zostaje bez zmian, więc zalogowany
-- klient może odczytać te pola przy SWOIM zamówieniu. To nie jest wyciek:
-- treść tej wiadomości klient i tak dostał na skrzynkę, a data wysyłki nie mówi
-- nic ponad to. Zapisy do `orders` idą wyłącznie service_rolem (migracja 26),
-- więc nikt z zewnątrz nie podrobi „wysłano".
-- Zamówienia zewnętrzne są dziś zamówieniami gościa (`user_id is null`), ale po
-- rejestracji na ten sam e-mail `linkGuestOrders` podpina je do konta — dlatego
-- ten akapit dotyczy ich realnie, a nie hipotetycznie.
