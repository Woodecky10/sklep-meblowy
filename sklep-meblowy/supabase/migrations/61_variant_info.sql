-- Migracja 61: globalny slownik "info o wariancie" (tooltip na karcie produktu).
-- Klucz = para (option_name, value); tresc reuzywana miedzy produktami.
-- RLS jak fabrics (37): tylko admin; odczyt publiczny server-side przez createAdminClient.
create table if not exists public.variant_info (
  id          uuid primary key default uuid_generate_v4(),
  option_name text not null,
  value       text not null,
  info        text,
  info_de     text,
  updated_at  timestamptz not null default now(),
  unique (option_name, value)
);

create index if not exists variant_info_pair_idx on public.variant_info (option_name, value);

alter table public.variant_info enable row level security;
create policy "variant_info: admin all"
  on public.variant_info for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
