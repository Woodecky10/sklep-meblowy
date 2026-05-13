-- ============================================================
-- Migracja 15: kody promocyjne / rabatowe
-- ============================================================
-- Po tej migracji admin (/admin/kody-rabatowe) tworzy kody rabatowe,
-- a klient wpisuje je w koszyku/checkout. Server action validatePromoCode
-- sprawdza wszystkie warunki (active, daty, max użyć, min wartość),
-- liczy discount i zapisuje do orders.promo_code_id + promo_discount.
-- Stripe webhook po opłaceniu incrementuje used_count.
--
-- Wszystkie kody są zawsze trzymane w UPPER CASE (sanitize w server actions).
-- ============================================================

create table if not exists public.promo_codes (
  id              uuid primary key default uuid_generate_v4(),
  code            text not null unique,                          -- zawsze UPPER, np. "MOLLIEN10"
  discount_type   text not null check (discount_type in ('percent','fixed')),
  discount_value  numeric(10,2) not null check (discount_value > 0),  -- procent (1-100) albo zł
  valid_from      timestamptz,                                   -- null = od razu
  valid_to        timestamptz,                                   -- null = bez końca
  max_uses        integer,                                       -- null = unlimited
  used_count      integer not null default 0,
  min_order_value numeric(10,2),                                 -- null = bez minimum
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_promo_codes_code   on public.promo_codes (code);
create index if not exists idx_promo_codes_active on public.promo_codes (active);

-- Trigger updated_at (funkcja set_updated_at() z migracji 09)
drop trigger if exists trg_promo_codes_updated on public.promo_codes;
create trigger trg_promo_codes_updated
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- RLS — public READ aktywnych (do walidacji z server actions),
-- admin write wszystkiego. Server actions używają createAdminClient()
-- bypassując RLS, więc walidacja działa nawet jeśli klient nie ma
-- bezpośredniego dostępu.
alter table public.promo_codes enable row level security;

create policy "promo_codes: admin read all"
  on public.promo_codes for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "promo_codes: admin write"
  on public.promo_codes for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- ============================================================
-- ALTER TABLE orders — dodaj powiązanie z użytym kodem promo
-- ============================================================
-- promo_code_id: który kod został użyty (null = brak)
-- promo_discount: kwota zniżki w zł zastosowana do tego zamówienia
--   (zachowujemy dla audytu — jeśli admin zmieni wartość kodu później,
--   nie zmienia to historycznych zamówień).
alter table public.orders
  add column if not exists promo_code_id  uuid references public.promo_codes(id) on delete set null,
  add column if not exists promo_discount numeric(10,2) not null default 0;

create index if not exists idx_orders_promo on public.orders (promo_code_id);
