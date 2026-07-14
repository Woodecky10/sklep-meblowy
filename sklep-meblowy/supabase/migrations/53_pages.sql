-- supabase/migrations/53_pages.sql
-- Podstrony (spec 2026-07-14, krok C): strona = slug + tytuł + SEO + flaga
-- publikacji; treść to bloki w page_blocks (page_id -> pages.id). Usunięcie
-- strony kasuje jej bloki (FK on delete cascade). Szkice (published=false)
-- są niewidoczne dla klientów — egzekwowane w kodzie (odczyt idzie przez
-- service_role); RLS select-true jak w pozostałych tabelach treści.

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  title_de text,
  seo_description text,
  seo_description_de text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.pages enable row level security;

drop policy if exists pages_read on public.pages;
create policy pages_read on public.pages
  for select using (true);

revoke insert, update, delete on public.pages from anon, authenticated;

-- Bloki podstron: usunięcie strony sprząta jej bloki. Istniejące wiersze
-- page_blocks mają page_id null (home) — FK dopuszcza null.
alter table public.page_blocks
  drop constraint if exists page_blocks_page_id_fkey;
alter table public.page_blocks
  add constraint page_blocks_page_id_fkey
  foreign key (page_id) references public.pages(id) on delete cascade;
