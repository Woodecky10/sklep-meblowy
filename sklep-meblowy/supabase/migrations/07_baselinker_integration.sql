-- ============================================================
-- Migracja 07: integracja z BaseLinker
-- ============================================================
-- Dodaje pola łączące encje Supabase z BaseLinker:
--   - products.baselinker_id  – id produktu w BL (UNIQUE)
--   - orders.baselinker_order_id – id zamówienia po wypchnięciu do BL
-- BL = source of truth dla produktów. Sync tylko jednokierunkowy
-- (BL → Supabase). Zamówienia w drugą stronę (Supabase → BL).

alter table public.products
  add column if not exists baselinker_id text unique;

create index if not exists idx_products_baselinker
  on public.products (baselinker_id);

alter table public.orders
  add column if not exists baselinker_order_id text;

create index if not exists idx_orders_baselinker
  on public.orders (baselinker_order_id);
