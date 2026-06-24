-- supabase/migrations/33_eur_pricing.sql
-- Ceny w EUR na /de: tabela ustawien sklepu (kurs PLN->EUR) + waluta zamowien.

-- ── Ustawienia sklepu (pojedynczy wiersz) ───────────────────────────────────
-- eur_rate = ile EUR za 1 zl (np. 0.23). WARTOSC STARTOWA TYMCZASOWA 0.23 —
-- wlascicielka ustawia realny kurs w /admin/ustawienia PRZED startem /de.
create table if not exists public.store_settings (
  id boolean primary key default true,
  eur_rate numeric not null default 0.23 check (eur_rate > 0),
  updated_at timestamptz not null default now(),
  constraint store_settings_singleton check (id = true)
);

insert into public.store_settings (id, eur_rate)
values (true, 0.23)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

-- Odczyt publiczny — kurs jest potrzebny do renderu cen takze dla anon.
drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings
  for select using (true);

-- Zapis tylko service_role (createAdminClient ma BYPASSRLS). Klient bez write.
revoke insert, update, delete on public.store_settings from anon, authenticated;

-- ── Waluta zamowienia + snapshot kursu ──────────────────────────────────────
-- Wstecznie zgodne: istniejace zamowienia = 'pln', fx_rate NULL.
alter table public.orders
  add column if not exists currency text not null default 'pln'
    check (currency in ('pln','eur')),
  add column if not exists fx_rate numeric;
