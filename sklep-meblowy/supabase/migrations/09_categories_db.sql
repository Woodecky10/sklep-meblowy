-- ============================================================
-- Migracja 09: kategorie zarządzane w DB (zamiast hardkodu)
-- ============================================================
-- Po tej migracji single source of truth dla kategorii to tabele
-- public.category_groups + public.categories. Plik app/_lib/categories.ts
-- staje się fallbackiem (na razie usunięty) — aplikacja czyta z DB.
--
-- Zmiana umożliwia adminowi (rola = 'admin') dodawanie/edycję kategorii
-- bez ingerencji dewelopera (admin panel `/admin/kategorie`).
-- ============================================================

-- ============================================================
-- 1. Tabela: category_groups (top-level grupy w nawigacji)
-- ============================================================
create table if not exists public.category_groups (
  id          uuid primary key default uuid_generate_v4(),
  slug        text not null unique,
  label       text not null,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_category_groups_sort
  on public.category_groups (sort_order);

-- ============================================================
-- 2. Tabela: categories (kategorie produktów)
-- ============================================================
create table if not exists public.categories (
  id                       uuid primary key default uuid_generate_v4(),
  slug                     text not null unique,
  label                    text not null,
  group_id                 uuid not null references public.category_groups(id) on delete restrict,
  sort_order               integer not null default 0,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_categories_group on public.categories (group_id);
create index if not exists idx_categories_sort  on public.categories (sort_order);

-- ============================================================
-- 3. Seed — istniejące grupy + kategorie z hardkodu app/_lib/categories.ts
-- ============================================================
insert into public.category_groups (slug, label, sort_order) values
  ('salon',     'Salon',     0),
  ('sypialnia', 'Sypialnia', 1)
on conflict (slug) do nothing;

-- Funkcja pomocnicza do seedu — wstawia kategorię w danej grupie
do $$
declare
  salon_id uuid;
  sypialnia_id uuid;
begin
  select id into salon_id     from public.category_groups where slug = 'salon';
  select id into sypialnia_id from public.category_groups where slug = 'sypialnia';

  insert into public.categories (slug, label, group_id, sort_order) values
    ('sofa-2-osobowa',      'Sofa 2-osobowa',                    salon_id,     0),
    ('sofa-3-osobowa',      'Sofa 3-osobowa',                    salon_id,     1),
    ('naroznik-l',          'Narożnik w kształcie L',            salon_id,     2),
    ('naroznik-u',          'Narożnik w kształcie U',            salon_id,     3),
    ('fotele',              'Fotele',                            salon_id,     4),
    ('pufy',                'Pufy',                              salon_id,     5),
    ('zestawy',             'Zestawy (narożnik + fotel + pufa)', salon_id,     6),
    ('lozko-kontynentalne', 'Łóżka kontynentalne',               sypialnia_id, 0),
    ('lozko-tapicerowane',  'Łóżka tapicerowane',                sypialnia_id, 1),
    ('materace',            'Materace i toppery',                sypialnia_id, 2)
  on conflict (slug) do nothing;
end $$;

-- ============================================================
-- 4. Migracja products.category — z CHECK constraint na FK
-- ============================================================
-- Stary CHECK ograniczał slug do listy hardkodowanej. Teraz mamy FK
-- na public.categories(slug) — slug może być dowolny ale musi istnieć.

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

-- FK z `on update cascade` żeby admin mógł zmienić slug kategorii
-- a istniejące produkty automatycznie się zaktualizowały.
alter table public.products
  add constraint products_category_fk
  foreign key (category) references public.categories(slug)
  on update cascade
  on delete restrict;

-- ============================================================
-- 5. RLS — public read, admin write
-- ============================================================
alter table public.category_groups enable row level security;
alter table public.categories      enable row level security;

create policy "category_groups: public read"
  on public.category_groups for select
  to anon, authenticated
  using (true);

create policy "category_groups: admin write"
  on public.category_groups for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "categories: public read"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "categories: admin write"
  on public.categories for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ============================================================
-- 6. Auto-update updated_at przy modyfikacji
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_category_groups_updated on public.category_groups;
create trigger trg_category_groups_updated
  before update on public.category_groups
  for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated
  before update on public.categories
  for each row execute function public.set_updated_at();
