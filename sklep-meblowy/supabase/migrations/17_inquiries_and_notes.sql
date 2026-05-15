-- ============================================================
-- Migracja 17: uwagi klienta per pozycja + zapytania o niestandardowe kolory
-- ============================================================
-- 1. order_items.notes — klient w koszyku może dopisać uwagę do każdego
--    produktu z osobna (np. "róż jak na zdjęciu 2"). Trafia do BL
--    jako część attributes per pozycja zamówienia.
--
-- 2. product_inquiries — zapytania klientów o niestandardowe kolory /
--    własne warianty. Klient klika "Zapytaj o inne kolory" na karcie
--    produktu, wypełnia modal, zapytanie ląduje w tabeli i jest
--    widoczne dla admina w /admin/zapytania.
-- ============================================================

-- ============================================================
-- 1. Notes per pozycja zamówienia
-- ============================================================
alter table public.order_items
  add column if not exists notes text;

-- ============================================================
-- 2. Tabela: product_inquiries
-- ============================================================
create table if not exists public.product_inquiries (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid references public.products(id) on delete set null,
  product_name    text not null default '',         -- snapshot nazwy w momencie zapytania
  customer_name   text not null default '',
  customer_email  text not null,
  customer_phone  text,
  message         text not null,
  status          text not null default 'new' check (status in ('new','read','replied','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_inquiries_status     on public.product_inquiries (status);
create index if not exists idx_inquiries_created_at on public.product_inquiries (created_at desc);
create index if not exists idx_inquiries_product    on public.product_inquiries (product_id);

drop trigger if exists trg_inquiries_updated on public.product_inquiries;
create trigger trg_inquiries_updated
  before update on public.product_inquiries
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. RLS — public INSERT (klient niezalogowany może zostawić zapytanie),
--    admin read/update/delete wszystkiego
-- ============================================================
alter table public.product_inquiries enable row level security;

-- Każdy może wstawić zapytanie (publiczny formularz na karcie produktu)
create policy "inquiries: public insert"
  on public.product_inquiries for insert
  to anon, authenticated
  with check (true);

-- Admin czyta i moderuje wszystko
create policy "inquiries: admin read all"
  on public.product_inquiries for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "inquiries: admin update"
  on public.product_inquiries for update
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

create policy "inquiries: admin delete"
  on public.product_inquiries for delete
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
