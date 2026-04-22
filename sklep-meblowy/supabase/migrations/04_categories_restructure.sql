-- ============================================================
-- Migracja 04: restrukturyzacja kategorii (sekcje Salon/Sypialnia)
-- ============================================================

-- 1. Usuń stary check constraint (Postgres nazwa generowana automatycznie)
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

-- 2. Mapowanie istniejących produktów na nowe slugi kategorii
-- Stare:  kanapy, lozka, fotele, pufy
-- Nowe:   sofy, naroznik-l, naroznik-u, fotele, pufy,
--         lozko-kontynentalne, lozko-tapicerowane, materace
update public.products set category = 'sofy'              where category = 'kanapy';
update public.products set category = 'lozko-tapicerowane' where category = 'lozka';
-- 'fotele' i 'pufy' bez zmian (slugi te same, sekcja salon)

-- 3. Nowy check constraint
alter table public.products
  add constraint products_category_check
  check (category in (
    'sofy',
    'naroznik-l',
    'naroznik-u',
    'fotele',
    'pufy',
    'lozko-kontynentalne',
    'lozko-tapicerowane',
    'materace'
  ));
