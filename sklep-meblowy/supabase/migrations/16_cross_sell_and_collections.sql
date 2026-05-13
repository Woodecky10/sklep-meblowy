-- ============================================================
-- Migracja 16: cross-sell między kategoriami + kolekcje produktów
-- ============================================================
-- 1. categories.cross_sell_categories text[] — mapowanie typu
--    "kupujesz X → polecaj produkty z kategorii Y, Z".
--    Np. lozko-tapicerowane → ['materace'].
--    Używane w sekcjach "Może Cię zainteresować" (koszyk) i
--    "Polecane materace" (karta produktu łóżka).
--
-- 2. collections — grupy produktów które pasują do siebie wizualnie
--    (np. "Kolekcja Lisbon" = narożnik + fotel + pufa).
--    products.collection_id wskazuje na collections.id.
--    Wyświetlane w sekcji "Pełna kolekcja" na karcie produktu.
-- ============================================================

-- ============================================================
-- 1. Cross-sell categories — pole array slugów
-- ============================================================
alter table public.categories
  add column if not exists cross_sell_categories text[] not null default '{}';

-- ============================================================
-- 2. Tabela: collections
-- ============================================================
create table if not exists public.collections (
  id          uuid primary key default uuid_generate_v4(),
  slug        text not null unique,
  label       text not null default '',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_collections_slug on public.collections (slug);

-- Trigger updated_at (funkcja set_updated_at() z migracji 09)
drop trigger if exists trg_collections_updated on public.collections;
create trigger trg_collections_updated
  before update on public.collections
  for each row execute function public.set_updated_at();

-- RLS — public read, admin write
alter table public.collections enable row level security;

create policy "collections: public read"
  on public.collections for select
  to anon, authenticated
  using (true);

create policy "collections: admin write"
  on public.collections for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ============================================================
-- 3. products.collection_id — opcjonalne FK do collections
-- ============================================================
-- ON DELETE SET NULL — usunięcie kolekcji nie kasuje produktów, tylko
-- odpina je od kolekcji.
alter table public.products
  add column if not exists collection_id uuid references public.collections(id) on delete set null;

create index if not exists idx_products_collection on public.products (collection_id);
