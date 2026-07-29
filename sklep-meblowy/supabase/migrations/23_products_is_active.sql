-- ============================================================
-- Migracja 23: widoczność produktu (is_active) + auto/ręczne ukrywanie
-- ============================================================
-- Produkt wycofany z oferty ma być ukrywany automatycznie i ODWRACALNIE.
-- Admin może też ukryć/przywrócić ręcznie. Widoczność egzekwowana W RLS —
-- jeden punkt prawdy. Sync używa service_role (omija RLS), więc dalej widzi
-- i zapisuje wszystko, łącznie z ukrytymi (potrzebne do reaktywacji).
-- ============================================================

alter table public.products
  add column if not exists is_active boolean not null default true;

-- null = aktywny; 'auto' = ukryty przez sync (znikł z BL → auto-reaktywacja gdy
-- wróci); 'manual' = ukryty ręcznie przez admina (sync NIE reaktywuje).
alter table public.products
  add column if not exists deactivation_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_deactivation_source_check'
  ) then
    alter table public.products
      add constraint products_deactivation_source_check
      check (deactivation_source in ('auto','manual') or deactivation_source is null);
  end if;
end $$;

create index if not exists idx_products_inactive
  on public.products (is_active) where is_active = false;

-- ---- RLS: rozdzielenie publicznej polityki SELECT ----
-- Podmieniamy istniejącą politykę (a nie tworzymy drugiej równoległej) i
-- dokładamy osobną admin-SELECT. Polityki permissive są OR-owane:
--   anon          → publiczna → is_active = true
--   authenticated → publiczna OR admin → (is_active = true) OR (role=admin)
drop policy if exists "products: publiczny odczyt" on public.products;

create policy "products: publiczny odczyt"
  on public.products for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "products: admin odczyt wszystkich" on public.products;

create policy "products: admin odczyt wszystkich"
  on public.products for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

comment on column public.products.is_active is
  'Widoczność w sklepie. false = ukryty (RLS pomija dla publiczności; sitemap/listingi/wyszukiwarka automatycznie). Domyślnie true.';
comment on column public.products.deactivation_source is
  'Kto ukrył: null=aktywny, auto=sync (znikł z BL, auto-reaktywacja gdy wróci), manual=admin (sync respektuje, NIE reaktywuje).';
