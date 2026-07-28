-- Migracja 65: kolumny wyszukiwania odporne na spacje na products.
-- (Numer 61 zajęty przez 61_variant_info na main; ta migracja jest już
--  zaaplikowana na produkcji 2026-07-21 jako "61_products_search_key" —
--  ponowne uruchomienie jest no-opem, cała jest idempotentna.)
-- search_key = lower(name+description) z usuniętymi tagami HTML i WSZYSTKIMI
-- spacjami → ILIKE %token% dopasowuje niezależnie od spacji/kolejności (tokeny
-- ANDowane w zapytaniu). Diakrytyki zachowane (jak dotychczasowe wyszukiwanie
-- storefrontu). Wyrażenie IMMUTABLE (lower/regexp_replace/coalesce/||) → kolumna
-- STORED GENERATED. Idempotentnie.
create extension if not exists pg_trgm;

alter table public.products
  add column if not exists search_key text
  generated always as (
    regexp_replace(
      regexp_replace(
        lower(coalesce(name, '') || ' ' || coalesce(description, '')),
        '<[^>]*>', ' ', 'g'
      ),
      '\s+', '', 'g'
    )
  ) stored;

alter table public.products
  add column if not exists search_key_de text
  generated always as (
    regexp_replace(
      regexp_replace(
        lower(coalesce(name_de, '') || ' ' || coalesce(description_de, '')),
        '<[^>]*>', ' ', 'g'
      ),
      '\s+', '', 'g'
    )
  ) stored;

create index if not exists products_search_key_trgm
  on public.products using gin (search_key gin_trgm_ops);
create index if not exists products_search_key_de_trgm
  on public.products using gin (search_key_de gin_trgm_ops);
