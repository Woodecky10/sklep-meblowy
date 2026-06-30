-- Migracja 38: zgłoszenia problemów z zamówieniem (reklamacje). Podpięte pod
-- orders (CASCADE) i opcjonalnie konkretną pozycję order_items (SET NULL).
create table if not exists public.order_issues (
  id             uuid primary key default uuid_generate_v4(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  order_item_id  uuid references public.order_items(id) on delete set null,
  category       text not null check (category in ('damage','missing','wrong','delivery','other')),
  message        text not null,
  photos         text[] not null default '{}',
  status         text not null default 'new' check (status in ('new','read','replied','closed')),
  customer_name  text,
  customer_email text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists order_issues_status_idx on public.order_issues (status, created_at desc);
create index if not exists order_issues_order_idx  on public.order_issues (order_id);

-- RLS: czytane/zapisywane wyłącznie server-side (service role omija RLS — wzorzec
-- jak fabrics/price_history). Brak polityki anon → żaden klient nie pisze wprost.
alter table public.order_issues enable row level security;
create policy "order_issues: admin all"
  on public.order_issues for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
