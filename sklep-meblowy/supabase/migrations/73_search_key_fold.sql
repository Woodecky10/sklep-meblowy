-- Migracja 73: kolumny wyszukiwania ze ZŁOŻONYMI znakami diakrytycznymi.
--
-- Problem: search_key (migracja 65) zachowuje polskie znaki, więc klient
-- piszący bez ogonków dostawał ZERO wyników. Pomiar na produkcji 2026-08-13:
-- „lozko" 0 trafień przy 177 pasujących produktach, „naroznik" 0 przy 40.
--
-- DODAJE kolumny obok search_key/search_key_de, NIE podmienia ich. Powód jest
-- wdrożeniowy: dopasowanie wymaga złożenia znaków po OBU stronach, więc gdyby
-- istniejąca kolumna zmieniła znaczenie pod działającym kodem, wyszukiwanie
-- zwracałoby zero na WSZYSTKO do momentu deployu — a migracje na tym projekcie
-- idą ręcznie, więc okno liczyłoby się w minutach żywego sklepu. Wariant
-- dodatkowy jest neutralny dla starego kodu i można go puścić w dowolnej
-- kolejności względem deployu. Stare kolumny sprząta osobna migracja, po
-- potwierdzeniu nowych na produkcji.
--
-- ⚠️ MAPOWANIE ZNAKÓW MUSI ODPOWIADAĆ funkcji foldDiacritics()
-- w app/_lib/search-filter.ts (12 znaków + ß→ss). Rozjazd nie wywala błędu —
-- cicho zeruje wyszukiwanie. Zmieniasz tu → zmieniasz tam.
--
-- UWAGA HISTORYCZNA: kolumna PL poniżej NIE spełniała tego warunku — składała
-- tylko 9 polskich znaków, bez ä ö ü ß, mimo że komentarz twierdził inaczej.
-- Naprawia to migracja 74_search_key_fold_pl_de_znaki.sql (DROP + ADD, bo
-- wyrażenia generującego nie da się zmienić). Definicja PL obowiązująca dziś
-- jest w 74, nie tutaj. Kolumna DE była poprawna od początku.
--
-- translate() i replace() są IMMUTABLE, więc wolno ich użyć w kolumnie
-- generowanej. unaccent() NIE jest immutable i dlatego nie wchodzi w grę bez
-- opakowywania we własną funkcję — translate załatwia sprawę bez tego długu.
--
-- W pełni idempotentna, bez drop.

create extension if not exists pg_trgm;

-- PL: ą ć ę ł ń ó ś ź ż → a c e l n o s z z
-- (NIEPEŁNE — brakuje ä ö ü ß; pełny zestaw dopina migracja 74.)
alter table public.products
  add column if not exists search_key_fold text
  generated always as (
    translate(
      regexp_replace(
        regexp_replace(
          lower(coalesce(name, '') || ' ' || coalesce(description, '')),
          '<[^>]*>', ' ', 'g'
        ),
        '\s+', '', 'g'
      ),
      'ąćęłńóśźż',
      'acelnoszz'
    )
  ) stored;

-- DE: ä ö ü → a o u oraz ß → ss (dwuznak, więc replace przed translate).
-- Polskie znaki składane też — nazwy DE bywają nieprzetłumaczone.
alter table public.products
  add column if not exists search_key_fold_de text
  generated always as (
    translate(
      replace(
        regexp_replace(
          regexp_replace(
            lower(coalesce(name_de, '') || ' ' || coalesce(description_de, '')),
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
create index if not exists products_search_key_fold_de_trgm
  on public.products using gin (search_key_fold_de gin_trgm_ops);
