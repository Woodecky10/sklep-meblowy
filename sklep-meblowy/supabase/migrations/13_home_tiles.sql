-- ============================================================
-- Migracja 13: kafelki "Znajdź swój styl" na stronie głównej w DB
-- ============================================================
-- Po tej migracji kafelki na home (linki do kolekcji ze zdjęciem,
-- etykietą i opisem) trzymamy w tabeli `home_tiles` + zdjęcia w storage
-- bucket `home-tiles`.
--
-- Admin `/admin/kafelki` pozwala koleżance dodać/edytować/usunąć/sortować
-- kafelki bez ruszania kodu. Strona główna (app/page.tsx) pobiera je
-- z DB zamiast hardkodowanej tablicy `categories`.
--
-- Każdy kafelek: zdjęcie tła + etykieta + opcjonalny opis + link.
-- ============================================================

-- ============================================================
-- 1. Tabela: home_tiles
-- ============================================================
create table if not exists public.home_tiles (
  id          uuid primary key default uuid_generate_v4(),
  image_url   text,                              -- URL zdjęcia (bucket home-tiles lub zewn.)
  image_alt   text not null default '',          -- alt do dostępności
  label       text not null default '',          -- np. "Sofy 3-osobowe"
  description text,                              -- opcjonalny podpis pod etykietą
  href        text not null default '#',         -- link np. "/sklep?kategoria=sofa-3-osobowa"
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_home_tiles_sort   on public.home_tiles (sort_order);
create index if not exists idx_home_tiles_active on public.home_tiles (active);

-- ============================================================
-- 2. Trigger updated_at (funkcja set_updated_at() z migracji 09)
-- ============================================================
drop trigger if exists trg_home_tiles_updated on public.home_tiles;
create trigger trg_home_tiles_updated
  before update on public.home_tiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. RLS — public read aktywnych, admin write wszystkiego
-- ============================================================
alter table public.home_tiles enable row level security;

create policy "home_tiles: public read active"
  on public.home_tiles for select
  to anon, authenticated
  using (active = true);

create policy "home_tiles: admin read all"
  on public.home_tiles for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "home_tiles: admin write"
  on public.home_tiles for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ============================================================
-- 4. Storage bucket: home-tiles
-- ============================================================
insert into storage.buckets (id, name, public)
values ('home-tiles', 'home-tiles', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-tiles: public read'
  ) then
    create policy "home-tiles: public read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'home-tiles');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-tiles: admin upload'
  ) then
    create policy "home-tiles: admin upload"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'home-tiles'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-tiles: admin update'
  ) then
    create policy "home-tiles: admin update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'home-tiles'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-tiles: admin delete'
  ) then
    create policy "home-tiles: admin delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'home-tiles'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;
end $$;

-- ============================================================
-- 5. Seed: 4 kafelki domyślne (odpowiadają obecnemu hardkodowi)
-- ============================================================
insert into public.home_tiles (label, description, href, sort_order, active)
values
  ('Sofy 3-osobowe',       'Komfort i elegancja w każdym salonie', '/sklep?kategoria=sofa-3-osobowa',  0, true),
  ('Łóżka tapicerowane',   'Sypialnia marzeń, sen doskonały',       '/sklep?kategoria=lozko-tapicerowane', 1, true),
  ('Fotele',               'Twój kąt relaksu i inspiracji',         '/sklep?kategoria=fotele',           2, true),
  ('Pufy',                 'Styl i wszechstronność w jednym',       '/sklep?kategoria=pufy',             3, true)
on conflict do nothing;
