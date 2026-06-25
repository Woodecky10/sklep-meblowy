-- Migracja 37: katalog tkanin (reużywalny zbiór nazw tkanin do wariantów).
-- name     = nazwa PL; jednocześnie wartość wariantu w combinations.values["Tkanina"].
-- name_de  = nazwa DE; null → fallback do name na /de.
-- sort_order = kolejność na liście wyboru w adminie.
create table if not exists public.fabrics (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  name_de     text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists fabrics_sort_idx on public.fabrics (sort_order, name);

-- RLS: czytane/zapisywane wyłącznie server-side przez createAdminClient
-- (service role omija RLS — wzorzec jak collections/price_history). Brak polityki
-- dla anon → żadnego publicznego dostępu poza service role.
alter table public.fabrics enable row level security;
create policy "fabrics: admin all"
  on public.fabrics for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
