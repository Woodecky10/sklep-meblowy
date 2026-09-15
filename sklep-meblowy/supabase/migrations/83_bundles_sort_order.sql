-- Migracja 83: kolejność zestawów ustawiana przeciąganiem w /admin/zestawy
-- (właściciel 2026-09-15: „żeby można było je układać tak jak kolekcje").
-- Wzorzec 1:1 z migracji 66 (collections.sort_order + reorder_collections).
--
-- Dotąd zestawy szły „najnowsze pierwsze" (order by created_at desc) i admin
-- nie miał na to wpływu. Kolejność steruje sliderem na home, listą /zestawy
-- i tym, które 3 zestawy trafią do boxu „W zestawie taniej" na karcie produktu.
alter table public.bundles
  add column if not exists sort_order integer not null default 0;

-- BACKFILL OBOWIĄZKOWY, zachowuje dzisiejszą kolejność (najnowsze pierwsze),
-- więc wdrożenie nie zmienia nic, co widzi klient. GUARD jak w 66: projekt
-- aplikuje migracje ręcznie i ma niepełny rejestr, więc plik bywa odpalany
-- drugi raz — bez guarda kolejne odpalenie skasowałoby układ zrobiony
-- przeciąganiem. Backfill działa tylko, gdy żaden zestaw nie ma jeszcze
-- niezerowego sort_order.
update public.bundles b
set sort_order = t.rn
from (select id, (row_number() over (order by created_at desc)) - 1 as rn
      from public.bundles) t
where b.id = t.id
  and not exists (
    select 1 from public.bundles where sort_order <> 0
  );

-- Atomowy reorder jedną instrukcją — pętla UPDATE po jednym wierszu przy
-- padzie w połowie zostawia zestawy z pomieszanymi numerami.
create or replace function public.reorder_bundles(p_ids uuid[])
returns void language sql as $$
  update public.bundles b
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where b.id = o.id;
$$;

revoke execute on function public.reorder_bundles(uuid[]) from public;
grant  execute on function public.reorder_bundles(uuid[]) to service_role;
