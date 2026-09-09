-- ============================================================
-- Migracja 82: pozycja zamówienia SPOZA KATALOGU (wolny tekst).
-- Uruchom w Supabase SQL Editor (migracje NIE aplikują się automatycznie).
-- ============================================================
-- Spec: docs/superpowers/specs/2026-09-02-zamowienia-zewnetrzne-design.md
--       (sekcja „Aktualizacja 2026-09-09")
--
-- Zgłoszenie pracownicy obsługującej panel (2026-09-09): przy zamówieniu
-- z Allegro/OLX trafia się mebel, którego NIE MA w naszym katalogu (dogadany
-- indywidualnie, wycofany model, dodatek). Dziś każda pozycja wymaga
-- `product_id`, więc żeby wpisać takie zamówienie, trzeba by najpierw założyć
-- produkt-śmieć w sklepie. Decyzja właściciela: wolny tekst zamiast tworzenia
-- produktu.
--
-- ⚠️ KOLEJNOŚĆ OBOWIĄZKOWA: tę migrację aplikujemy PRZED mergem gałęzi.
-- Kod po merge wysyła do PostgREST kolumnę `custom_name`; na bazie bez niej
-- każdy zapis pozycji spoza katalogu kończy się PGRST204 (precedens: migracje
-- 78/79/80). Pozycje z katalogu przeżyją brak migracji — kod pomija wtedy pole
-- `custom_name` w insercie — ale to bezpiecznik, nie plan.

-- ============================================================
-- 1. product_id przestaje być obowiązkowe
-- ============================================================
-- FK (`references products(id) on delete restrict`) ZOSTAJE bez zmian: NULL
-- nie narusza klucza obcego i nie blokuje usuwania produktów, a licznik
-- w deleteProduct (`.eq("product_id", id)`) NULL-i nie zlicza — czyli
-- zachowuje się dokładnie tak, jak powinien.
alter table public.order_items
  alter column product_id drop not null;

-- ============================================================
-- 2. Nazwa pozycji spoza katalogu
-- ============================================================
-- Snapshot nazwy jak `sample_order_items.fabric_name` (migracja 67) —
-- zamówienie ma pozostać czytelne niezależnie od tego, co się dzieje
-- w katalogu. `not null default ''` (a nie nullable): pozycja z katalogu ma tu
-- pusty string, więc odczyty nigdy nie muszą rozróżniać NULL od ''.
alter table public.order_items
  add column if not exists custom_name text not null default '';

-- Osobne, NAZWANE constrainty zamiast inline `check` w `add column` — plik
-- bywa odpalany ponownie, a `add column if not exists` nie dokłada wtedy
-- brakującego CHECK-a. Para drop/add jest idempotentna.
alter table public.order_items
  drop constraint if exists order_items_custom_name_dlugosc;
alter table public.order_items
  add constraint order_items_custom_name_dlugosc
    check (char_length(custom_name) <= 200);

-- ============================================================
-- 3. Spójność: pozycja ma ALBO produkt z katalogu, ALBO nazwę
-- ============================================================
-- Bez tego `alter column drop not null` otwierałby drogę pozycjom-widmo: bez
-- produktu i bez nazwy, czyli kwocie znikąd na karcie zamówienia.
--
-- CHECK jest walidowany na ISTNIEJĄCYCH wierszach — i przechodzi, bo do dziś
-- `product_id` było `not null`, więc lewa strona alternatywy jest prawdziwa
-- dla każdego wiersza w tabeli. (Weryfikacja przed uruchomieniem:
--   select count(*) from public.order_items where product_id is null;  -- 0
-- Gdyby kiedykolwiek zwróciło > 0, ALTER padnie z 23514 i nic nie zepsuje.)
--
-- Warunek jest OR-em, nie XOR-em: baza dopuszcza wiersz z produktem I nazwą.
-- Zawężenie do „dokładnie jednego" siedzi w parseExternalOrderInput, bo to
-- reguła prezentacji (karta zamówienia nie ma zgadywać, którą nazwę pokazać),
-- a nie integralności danych — i nie chcemy, żeby przyszły import kiedyś
-- rozbił się o CHECK, mając komplet informacji.
alter table public.order_items
  drop constraint if exists order_items_pozycja_z_katalogu_albo_nazwa;
alter table public.order_items
  add constraint order_items_pozycja_z_katalogu_albo_nazwa
    check (product_id is not null or char_length(btrim(custom_name)) > 0);

-- ============================================================
-- 4. RLS — nic do zmiany, sprawdzone
-- ============================================================
-- - „order_items: odczyt przez zamówienie" (schema.sql) filtruje wyłącznie po
--   `order_id` — NULL w `product_id` jej nie dotyczy.
-- - Klienckie INSERT/UPDATE/DELETE nie istnieją od migracji 26 (zapisy idą
--   service_rolem), więc nowa kolumna nie poszerza niczyich uprawnień.
-- - Polityki „reviews: insert/update po zakupie" (migracja 78, wcześniej
--   06/46/76) mają w `exists (...)` warunek `oi.product_id = product_reviews
--   .product_id`. NULL nigdy nie daje `true`, więc pozycja spoza katalogu
--   NIE uprawnia do wystawienia opinii — i tak ma być: nie ma produktu,
--   pod którym ta opinia miałaby wisieć.
-- Indeks `idx_order_items_product` zostaje: btree indeksuje NULL-e, a zapytania
-- i tak filtrują przez `=`, które ich nie dotyka.
