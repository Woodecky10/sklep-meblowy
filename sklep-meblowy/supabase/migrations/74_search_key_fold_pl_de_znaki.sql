-- Migracja 74: kolumna PL search_key_fold składa te same znaki co TS.
--
-- Problem: migracja 73 dała kolumnie PL translate() na 9 polskich znakach,
-- a foldDiacritics() w app/_lib/search-filter.ts składa 12 znaków + ß→ss
-- (polskie ORAZ ä ö ü). Komentarze w OBU plikach twierdziły, że mapowania są
-- identyczne — czyli kłamały o inwariancie, na którym stoi całe dopasowanie.
--
-- Dziś szkody nie ma: pomiar na produkcji 2026-08-13 pokazał 0 wierszy z ä ö ü
-- lub ß w polach PL (name, description) na 361 pozycji. Ale gdy ktoś doda
-- „Fotel Björn" albo tkaninę „Möbel" — a pola DE już mają te znaki, więc
-- dostawca tak nazywa — produkt stanie się nieznajdywalny KAŻDĄ pisownią:
-- klucz w bazie zostałby z „ö", a token z TS przyszedłby złożony do „o".
-- To byłaby regresja wobec stanu przed migracją 73, gdzie działała przynajmniej
-- pisownia dokładna.
--
-- Zapytanie kontrolne puszczone PRZED migracją (stara wartość kolumny vs nowe
-- wyrażenie): 361 wierszy, 0 różnic. Migracja jest więc no-opem na dzisiejszych
-- danych i czystym zabezpieczeniem na przyszłość — dlatego wolno ją zaaplikować
-- ręcznie na produkcji bez okna serwisowego.
--
-- Dlaczego DROP + ADD, a nie ALTER: kolumna jest generowana, a Postgres nie
-- pozwala zmienić wyrażenia generującego (ALTER COLUMN ... SET EXPRESSION jest
-- dopiero w PG 17 i nie ma go tu). Cały ten plik idzie jako JEDNA transakcja
-- (multi-statement simple query = niejawna transakcja; apply_migration i CLI
-- też owijają migrację w transakcję), więc nie ma momentu, w którym kolumny
-- brakuje. DDL bierze ACCESS EXCLUSIVE: czytający chwilę czekają i po commicie
-- widzą nowy schemat — bez okna błędu „column does not exist".
--
-- DROP COLUMN kasuje razem z kolumną zależny indeks GIN trgm
-- (products_search_key_fold_trgm), dlatego jest odtwarzany na końcu.
--
-- NIE dotyka search_key_fold_de (ma już pełny zestaw z migracji 73) ani
-- starych search_key / search_key_de.
--
-- Idempotentna: ponowne uruchomienie przelicza kolumnę na tę samą wartość.

alter table public.products
  drop column if exists search_key_fold;

-- PL: ß → ss (dwuznak, więc replace przed translate),
-- potem ä ö ü ą ć ę ł ń ó ś ź ż → a o u a c e l n o s z z.
-- Zestaw znaków MUSI być ten sam co w foldDiacritics() i w kolumnie
-- search_key_fold_de — jedyna różnica to źródłowe kolumny (PL vs DE).
alter table public.products
  add column search_key_fold text
  generated always as (
    translate(
      replace(
        regexp_replace(
          regexp_replace(
            lower(coalesce(name, '') || ' ' || coalesce(description, '')),
            '<[^>]*>', ' ', 'g'
          ),
          '\s+', '', 'g'
        ),
        'ß',
        'ss'
      ),
      'äöüąćęłńóśźż',
      'aouacelnoszz'
    )
  ) stored;

create index if not exists products_search_key_fold_trgm
  on public.products using gin (search_key_fold gin_trgm_ops);
