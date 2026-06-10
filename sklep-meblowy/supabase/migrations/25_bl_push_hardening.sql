-- ============================================================
-- Migracja 25: utwardzenie pushu zamówień do BL + porządki
-- ============================================================
-- Audyt 2026-06-10:
--   1. Opłacone zamówienie mogło nigdy nie trafić do BaseLinkera bez śladu
--      (webhook zwraca 200, push best-effort, jedyny ślad w console.error).
--      Dodajemy orders.baselinker_push_error — trwały zapis błędu/powodu
--      pominięcia; admin może ponowić przez /api/baselinker/push-order.
--   2. incrementPromoUsage robił read-then-update — równoległe webhooki
--      gubiły inkrementy i pozwalały przekroczyć max_uses. RPC z atomowym
--      UPDATE ... SET used_count = used_count + 1.
--   3. Polityki write na products z baseline'u schema.sql sprawdzały
--      top-level claim 'role' (w Supabase zawsze anon/authenticated/
--      service_role) zamiast app_metadata.role — nigdy nie przepuszczały.
--      Podmieniamy na konwencję pozostałych migracji (09, 23 itd.).
-- ============================================================

-- ---- 1. Trwały ślad nieudanego pushu zamówienia do BL ----
alter table public.orders
  add column if not exists baselinker_push_error text;

comment on column public.orders.baselinker_push_error is
  'Ostatni błąd lub powód pominięcia pushu zamówienia do BaseLinkera. null = push udany albo jeszcze nie próbowany. Czyść przy udanym pushu.';

-- ---- 2. Atomowy inkrement użyć kodu rabatowego ----
create or replace function public.increment_promo_usage(p_promo_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
  set used_count = used_count + 1,
      updated_at = now()
  where id = p_promo_id;
$$;

-- Wywoływana wyłącznie z service role (webhook Stripe) — odbieramy default
-- EXECUTE dla public/anon/authenticated, zostawiamy service_role.
revoke execute on function public.increment_promo_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_promo_usage(uuid) to service_role;

-- ---- 3. Naprawa martwych polityk write na products ----
drop policy if exists "products: admin insert" on public.products;
create policy "products: admin insert"
  on public.products for insert
  to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "products: admin update" on public.products;
create policy "products: admin update"
  on public.products for update
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "products: admin delete" on public.products;
create policy "products: admin delete"
  on public.products for delete
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
