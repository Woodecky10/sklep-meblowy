-- ============================================================
-- Migracja 79: zdjęcia w opiniach klientów
-- ============================================================
-- Tablica publicznych URL-i w wierszu opinii, dokładnie jak order_issues.photos.
-- Osobna tabela review_photos miałaby sens tylko przy moderacji pojedynczych
-- zdjęć, której właściciel NIE chce — dokładałaby join do każdego odczytu
-- opinii (strona główna, /opinie, karta produktu, panel) i nic nie dawała.
--
-- ⚠️ WSTECZNA ZGODNOŚĆ: kolumna ma default '{}', więc stary kod na produkcji
-- (nieznający pola) zapisuje opinie dalej. Odwrotna kolejność NIE jest
-- bezpieczna: nowy kod wysyła `photos` w każdym zapisie, a PostgREST odrzuca
-- CAŁY payload z nieznaną kolumną (PGRST204). Migracja przed mergem.
alter table public.product_reviews
  add column if not exists photos text[] not null default '{}';

-- Trzecia (ostatnia) bramka limitu — odbicie MAX_REVIEW_PHOTOS
-- z app/_lib/reviews-photos.ts. Widżet i walidacja zapisu stoją wcześniej,
-- ale klucz anon jest jawny w paczce przeglądarki, a sesja siedzi
-- w ciasteczku, więc zapis da się wywołać bezpośrednim REST-em z pominięciem
-- obu wcześniejszych bramek.
--
-- `array_length(photos, 1) is null` to PUSTA tablica: array_length pustej
-- tablicy zwraca NULL, nie 0, a NULL w warunku checka nie jest prawdą — bez
-- tego członu constraint odrzucałby każdą opinię BEZ zdjęć.
alter table public.product_reviews
  drop constraint if exists product_reviews_max_3_zdjecia;

alter table public.product_reviews
  add constraint product_reviews_max_3_zdjecia
  check (array_length(photos, 1) is null or array_length(photos, 1) <= 3);
