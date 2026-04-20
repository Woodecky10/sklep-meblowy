-- ============================================================
-- Migracja: guest checkout
-- Uruchom w Supabase SQL Editor
-- ============================================================

-- user_id nullable + email gościa
alter table public.orders alter column user_id drop not null;
alter table public.orders add column if not exists guest_email text;

-- RLS: gość może tworzyć zamówienie (anon) jeśli brak user_id i podany email
drop policy if exists "orders: guest insert" on public.orders;
create policy "orders: guest insert"
  on public.orders for insert
  to anon
  with check (user_id is null and guest_email is not null);

-- RLS: order_items — pozwól anonimowi dodać pozycje do zamówienia gościa
drop policy if exists "order_items: guest insert" on public.order_items;
create policy "order_items: guest insert"
  on public.order_items for insert
  to anon
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id is null
    )
  );
