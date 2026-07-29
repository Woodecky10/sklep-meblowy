-- 31: pola admina dla zamówień (panel zarządzania zamówieniami, etap 1a)
-- Uruchomić RĘCZNIE w Supabase SQL Editorze (DDL).

alter table public.orders add column if not exists admin_note       text;
alter table public.orders add column if not exists carrier          text;
alter table public.orders add column if not exists tracking_number  text;
alter table public.orders add column if not exists delivery_cost    numeric(10, 2);
alter table public.orders add column if not exists delivery_paid    boolean not null default false;
alter table public.orders add column if not exists status_updated_at timestamptz;

-- Czytelny, monotoniczny numer zamówienia.
create sequence if not exists public.orders_order_number_seq;
alter table public.orders add column if not exists order_number bigint;

-- Backfill istniejących wierszy wg kolejności utworzenia (tylko tam, gdzie NULL).
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.orders
  where order_number is null
)
update public.orders o
set order_number = ordered.rn
from ordered
where o.id = ordered.id;

-- Sekwencja zaczyna ponad maksymalnym istniejącym numerem.
select setval(
  'public.orders_order_number_seq',
  coalesce((select max(order_number) from public.orders), 0) + 1,
  false
);

-- Domyślna wartość + NOT NULL + unikalność dla przyszłych zamówień.
alter table public.orders alter column order_number set default nextval('public.orders_order_number_seq');
alter table public.orders alter column order_number set not null;
create unique index if not exists idx_orders_order_number on public.orders (order_number);
