-- ============================================================
-- Migracja 10: slider hero na stronie głównej zarządzany w DB
-- ============================================================
-- Po tej migracji slajdy hero (które dotychczas były w hardkodzie
-- w app/page.tsx) trzymamy w tabeli public.home_slides + zdjęcia
-- w storage bucket 'home-slides'.
--
-- Admin panel `/admin/slider` pozwala koleżance (rola = 'admin'):
--   - dodawać/edytować/usuwać slajdy
--   - uploadować zdjęcia drag-and-dropem
--   - ustawiać daty od-do (auto-ukrywanie poza zakresem)
--   - drag-and-drop reorder
--
-- Slajd ma osobne pola: eyebrow, title, highlighted_word, subtitle, CTA1, CTA2.
-- Zero HTML w danych (bez XSS) — frontend renderuje highlighted_word jako <em>
-- przez split tytułu, nie przez dangerouslySetInnerHTML.
-- ============================================================

-- ============================================================
-- 1. Tabela: home_slides
-- ============================================================
create table if not exists public.home_slides (
  id                    uuid primary key default uuid_generate_v4(),
  image_url             text,                       -- URL zdjęcia w Supabase Storage (bucket home-slides)
  image_alt             text not null default '',   -- alt do dostępności
  eyebrow               text,                       -- mała etykieta nad tytułem ("Kolekcja 2026")
  title                 text not null default '',   -- główny tytuł (plain text)
  highlighted_word      text,                       -- słowo z tytułu do podświetlenia złotem (opcjonalne)
  subtitle              text,                       -- podpis pod tytułem
  cta_primary_label     text,                       -- napis na głównym przycisku ("Przeglądaj kolekcję")
  cta_primary_href      text,                       -- link ("/sklep" albo "/sklep?kategoria=sofy")
  cta_secondary_label   text,                       -- opcjonalny drugi przycisk
  cta_secondary_href    text,
  starts_at             timestamptz,                -- od kiedy pokazywać (null = od razu)
  ends_at               timestamptz,                -- do kiedy pokazywać (null = bez ograniczeń)
  sort_order            integer not null default 0, -- kolejność (mniejsze pierwsze)
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_home_slides_sort   on public.home_slides (sort_order);
create index if not exists idx_home_slides_active on public.home_slides (active);
create index if not exists idx_home_slides_dates  on public.home_slides (starts_at, ends_at);

-- ============================================================
-- 2. Trigger updated_at
-- ============================================================
-- Funkcja set_updated_at() już istnieje (z migracji 09).
drop trigger if exists trg_home_slides_updated on public.home_slides;
create trigger trg_home_slides_updated
  before update on public.home_slides
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. RLS — public read tylko aktywnych w zakresie dat, admin write wszystkiego
-- ============================================================
alter table public.home_slides enable row level security;

-- Public czyta tylko slajdy które są:
--   - active = true
--   - obecne w zakresie dat (lub bez ograniczenia czasowego)
create policy "home_slides: public read active and in date range"
  on public.home_slides for select
  to anon, authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >  now())
  );

-- Admin widzi wszystko (do edycji w panelu — w tym ukryte i przeterminowane)
create policy "home_slides: admin read all"
  on public.home_slides for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "home_slides: admin write"
  on public.home_slides for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ============================================================
-- 4. Storage bucket: home-slides
-- ============================================================
-- Bucket trzyma zdjęcia tła slajdów. Public read (zdjęcia są publicznie
-- pokazywane w hero), admin write.

insert into storage.buckets (id, name, public)
values ('home-slides', 'home-slides', true)
on conflict (id) do nothing;

-- Storage policies — RLS na storage.objects
do $$
begin
  -- Public read
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-slides: public read'
  ) then
    create policy "home-slides: public read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'home-slides');
  end if;

  -- Admin upload
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-slides: admin upload'
  ) then
    create policy "home-slides: admin upload"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'home-slides'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  -- Admin update
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-slides: admin update'
  ) then
    create policy "home-slides: admin update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'home-slides'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  -- Admin delete
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'home-slides: admin delete'
  ) then
    create policy "home-slides: admin delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'home-slides'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;
end $$;

-- ============================================================
-- 5. Whitelist hosta storage w next.config.ts
-- ============================================================
-- UWAGA: Po wykonaniu tej migracji upewnij się że w `next.config.ts`
-- masz wpis `*.supabase.co` w `images.remotePatterns` — bez tego
-- next/image z bucketu storage zwróci 400.
-- (Twój host Supabase: tlvgsddpiikolgdwuwmc.supabase.co — już jest whitelisted.)
