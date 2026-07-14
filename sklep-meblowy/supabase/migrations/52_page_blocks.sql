-- supabase/migrations/52_page_blocks.sql
-- System bloków stron (spec 2026-07-14, krok B): jedna tabela na sekcje
-- strony głównej (page_id null) i — od kroku C — podstron (FK dojdzie
-- w migracji 53). Zastępuje home_sections: 5 dotychczasowych sekcji staje
-- się blokami systemowymi; kolejność/widoczność/nagłówki przechodzą do
-- content jsonb (heading/heading_de/subheading/subheading_de).

create table if not exists public.page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid,
  block_type text not null,
  sort_order int not null default 0,
  visible boolean not null default true,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists page_blocks_page_sort_idx
  on public.page_blocks (page_id, sort_order);

-- Przeniesienie sekcji home ze starej tabeli. Idempotentne (tylko gdy
-- page_blocks nie ma jeszcze bloków home) i odporne na brak home_sections
-- (świeże środowisko po dropie).
do $$
begin
  if to_regclass('public.home_sections') is not null
     and not exists (select 1 from public.page_blocks where page_id is null) then
    insert into public.page_blocks (page_id, block_type, sort_order, visible, content)
    select null, key, sort_order, visible,
           jsonb_strip_nulls(jsonb_build_object(
             'heading', heading, 'heading_de', heading_de,
             'subheading', subheading, 'subheading_de', subheading_de))
      from public.home_sections;
  end if;
end $$;

alter table public.page_blocks enable row level security;

-- Odczyt publiczny — bloki renderuje strona główna także dla anon.
drop policy if exists page_blocks_read on public.page_blocks;
create policy page_blocks_read on public.page_blocks
  for select using (true);

-- Zapis tylko service_role (server actions po requireAdmin).
revoke insert, update, delete on public.page_blocks from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28/49/50): sort_order = pozycja, 0-based.
create or replace function public.reorder_page_blocks(p_ids uuid[])
returns void language sql as $$
  update public.page_blocks b
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where b.id = o.id;
$$;

revoke execute on function public.reorder_page_blocks(uuid[]) from public;
grant execute on function public.reorder_page_blocks(uuid[]) to service_role;

-- Sprzątanie po starym modelu (kod przełączony na page_blocks w tym samym kroku).
drop function if exists public.reorder_home_sections(text[]);
drop table if exists public.home_sections;
