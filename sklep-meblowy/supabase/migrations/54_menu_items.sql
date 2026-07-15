-- supabase/migrations/54_menu_items.sql
-- Pozycje menu (spec 2026-07-14, krok D): linki do podstron w Navbarze
-- (location='navbar') i stopce ('footer'). Etykieta opcjonalna (pusta →
-- tytuł strony). Usunięcie strony kasuje jej pozycje (FK cascade).

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('navbar', 'footer')),
  page_id uuid not null references public.pages(id) on delete cascade,
  label text,
  label_de text,
  sort_order int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_items_location_sort_idx
  on public.menu_items (location, sort_order);

alter table public.menu_items enable row level security;

-- Odczyt anonimowy tylko pozycji widocznych, wskazujących OPUBLIKOWANE
-- strony (zacieśnienie jak w migracji 53 — aplikacja czyta service_role,
-- więc zero wpływu na jej ścieżki; REST nie zdradza pozycji szkiców).
drop policy if exists menu_items_read on public.menu_items;
create policy menu_items_read on public.menu_items
  for select using (
    visible
    and exists (
      select 1 from public.pages p
      where p.id = menu_items.page_id and p.published
    )
  );

revoke insert, update, delete on public.menu_items from anon, authenticated;

-- Atomowy reorder (wzorzec 50/52): sort_order = pozycja w tablicy, 0-based.
-- Wołany per lokacja (kontroler przekazuje id tylko jednej listy).
create or replace function public.reorder_menu_items(p_ids uuid[])
returns void language sql as $$
  update public.menu_items m
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where m.id = o.id;
$$;

revoke execute on function public.reorder_menu_items(uuid[]) from public;
grant execute on function public.reorder_menu_items(uuid[]) to service_role;
