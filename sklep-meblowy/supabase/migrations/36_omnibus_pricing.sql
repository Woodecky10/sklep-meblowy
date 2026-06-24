-- Migracja 36: Omnibus — przeceny per produkt/wariant + historia cen.
-- sale_price: cena promocyjna produktu (dla produktów BEZ wariantów; przy
--   wariantach promocja jest per kombinacja w JSON variants).
-- omnibus_price: zdenormalizowana najniższa cena z 30 dni (liczona przy zapisie).
alter table public.products
  add column if not exists sale_price    numeric(10,2) check (sale_price >= 0),
  add column if not exists omnibus_price numeric(10,2) check (omnibus_price >= 0);

-- Historia cen efektywnych — źródło do liczenia najniższej-z-30-dni.
create table if not exists public.price_history (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_key     text,                       -- null = poziom produktu
  effective_price numeric(10,2) not null check (effective_price >= 0),
  recorded_at     timestamptz not null default now()
);
create index if not exists idx_price_history_unit
  on public.price_history (product_id, variant_key, recorded_at);

-- RLS: tabela dotykana wyłącznie server-side przez createAdminClient (omija RLS).
-- Front czyta zdenormalizowane products.omnibus_price, NIE tę tabelę → brak public read.
alter table public.price_history enable row level security;
create policy "price_history: admin all"
  on public.price_history for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Seed: bieżąca cena każdego istniejącego produktu (poziom produktu) jako
-- punkt startowy historii — pierwsza obniżka dostanie referencję = cena regularna.
insert into public.price_history (product_id, variant_key, effective_price, recorded_at)
select id, null, price, created_at from public.products;
