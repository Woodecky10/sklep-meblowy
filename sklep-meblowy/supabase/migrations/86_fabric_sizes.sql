-- Migracja 86: rozmiary mebli do dopłat za tkaninę (spec 2026-11-17).
-- surcharges = { "<fabric_groups.code>": kwota }. Brak klucza = globalna dopłata grupy.
create table if not exists public.fabric_sizes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  surcharges  jsonb not null default '{}'::jsonb,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.fabric_sizes enable row level security;
create policy "fabric_sizes: admin all"
  on public.fabric_sizes for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

alter table public.categories
  add column if not exists default_fabric_size_id uuid
  references public.fabric_sizes(id) on delete set null;

alter table public.products
  add column if not exists fabric_size_id uuid
  references public.fabric_sizes(id) on delete set null;
alter table public.products
  add column if not exists fabric_surcharges jsonb;
