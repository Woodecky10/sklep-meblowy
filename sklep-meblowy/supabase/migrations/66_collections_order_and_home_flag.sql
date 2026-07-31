-- Migracja 66: kolejność kolekcji na stronie głównej + flaga widoczności.
-- Spec: docs/superpowers/specs/2026-07-31-zwijanie-kolekcji-home-design.md
--
-- Wzorzec sort_order jest już w categories, home_tiles i fabric_groups.
-- Kolekcje były sortowane alfabetycznie po label i admin nie miał wpływu.
alter table public.collections
  add column if not exists sort_order   integer not null default 0,
  add column if not exists show_on_home boolean not null default true;

-- BACKFILL OBOWIĄZKOWY. Bez niego wszystkie kolekcje mają sort_order = 0
-- i kolejność na stronie robi się przypadkowa (zależna od tego, co baza
-- zwróci pierwsze). Numerujemy alfabetycznie, czyli zachowujemy kolejność
-- obowiązującą przed migracją — wdrożenie nie zmienia nic, co widzi klient.
update public.collections c
set sort_order = t.rn
from (select id, (row_number() over (order by label)) - 1 as rn
      from public.collections) t
where c.id = t.id;

-- Atomowy reorder jedną instrukcją — jak reorder_home_tiles z migracji 28.
-- Pętla UPDATE po jednym wierszu przy padzie w połowie zostawia kolekcje
-- z pomieszanymi numerami.
create or replace function public.reorder_collections(p_ids uuid[])
returns void language sql as $$
  update public.collections c
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id;
$$;

revoke execute on function public.reorder_collections(uuid[]) from public;
grant  execute on function public.reorder_collections(uuid[]) to service_role;
