-- ============================================================
-- Migracja 08: rozbicie 'sofy' na 2-/3-osobowe + nowa kategoria 'zestawy'
-- ============================================================
-- Zmiany:
-- - usuwamy slug 'sofy' (każda sofa musi być teraz 2- lub 3-osobowa)
-- - dodajemy 'sofa-2-osobowa', 'sofa-3-osobowa'
-- - dodajemy 'zestawy' (np. narożnik + fotel + pufa jako jeden produkt)
-- - labels narożników w UI zmieniają się na "Narożnik w kształcie L/U"
--   (sam slug pozostaje 'naroznik-l' / 'naroznik-u' — bez migracji danych)
-- ============================================================

-- 1. Usuń stary check constraint (nazwa może być wygenerowana, znajdź dynamicznie)
do $$
declare
  cname text;
begin
  select con.conname
  into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'products'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%';

  if cname is not null then
    execute format('alter table public.products drop constraint %I', cname);
  end if;
end $$;

-- 2. Migracja istniejących produktów ze starej kategorii 'sofy'
-- Domyślnie traktujemy je jako 3-osobowe — admin może później ręcznie
-- przepiąć część na 'sofa-2-osobowa'.
update public.products
set category = 'sofa-3-osobowa'
where category = 'sofy';

-- 3. Nowy check constraint
alter table public.products
  add constraint products_category_check
  check (category in (
    'sofa-2-osobowa',
    'sofa-3-osobowa',
    'naroznik-l',
    'naroznik-u',
    'fotele',
    'pufy',
    'zestawy',
    'lozko-kontynentalne',
    'lozko-tapicerowane',
    'materace'
  ));
