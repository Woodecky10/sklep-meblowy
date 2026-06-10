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

-- 3. (historycznie) nowy check constraint — USUNIĘTY z pliku.
-- Constraint był przejściowy: migracja 09 dropuje go na rzecz FK do
-- categories. schema.sql (baseline po migracji 08) seeduje nowsze slugi
-- ('sofa-3-osobowa', 'zestawy' itd.), więc każdy CHECK z tej listy —
-- nawet NOT VALID — wywalałby świeży setup: NOT VALID nie waliduje
-- istniejących wierszy, ale waliduje KAŻDY ich UPDATE, a migracja 05
-- update'uje seedowe produkty. Na środowiskach historycznych constraint
-- zdążył istnieć i został zdjęty w 09 — pominięcie go tutaj niczego nie
-- zmienia w stanie końcowym.
