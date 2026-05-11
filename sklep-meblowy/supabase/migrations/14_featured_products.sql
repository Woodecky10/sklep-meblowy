-- ============================================================
-- Migracja 14: polecane produkty na stronie głównej w DB
-- ============================================================
-- Po tej migracji sekcję "Polecane produkty" na home zarządzamy w admin
-- panelu (/admin/polecane): koleżanka wybiera produkty, ustawia kolejność
-- i opcjonalny badge ("Bestseller", "Nowość" itp.). Bez wybranych
-- featured strona główna pokazuje 4 najnowsze produkty jako fallback.
--
-- Każdy produkt może być featured tylko raz (unique na product_id).
-- ON DELETE CASCADE — usunięcie produktu kasuje wpis featured.
-- ============================================================

create table if not exists public.featured_products (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.products(id) on delete cascade,
  badge       text,                              -- np. "Bestseller", "Nowość", null = bez badge
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id)
);

create index if not exists idx_featured_sort on public.featured_products (sort_order);

-- Trigger updated_at (funkcja set_updated_at() z migracji 09)
drop trigger if exists trg_featured_updated on public.featured_products;
create trigger trg_featured_updated
  before update on public.featured_products
  for each row execute function public.set_updated_at();

-- RLS — public read, admin write
alter table public.featured_products enable row level security;

create policy "featured: public read"
  on public.featured_products for select
  to anon, authenticated
  using (true);

create policy "featured: admin write"
  on public.featured_products for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
