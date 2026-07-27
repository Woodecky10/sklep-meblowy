-- Migracja 64: edytowalny slownik cech tkanin (spec 2026-07-27).
-- Wzorzec fabric_groups (57): code niezmienny, reszta edytowalna w /admin/tkaniny.
-- Ikonka to KLUCZ z biblioteki w kodzie (app/_lib/fabric-properties.ts), nie plik.
-- fabrics.properties bez zmian - dalej trzyma kody cech.
create table if not exists public.fabric_property_defs (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  label       text not null,
  label_de    text,
  icon        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS jak fabric_groups: tylko admin; odczyt publiczny server-side przez service role.
alter table public.fabric_property_defs enable row level security;
create policy "fabric_property_defs: admin all"
  on public.fabric_property_defs for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Trzy cechy z migracji 63 - te same kody, te same podpisy, te same ikonki.
insert into public.fabric_property_defs (code, label, label_de, icon, sort_order) values
  ('waterproof',   'Wodoodporna',          'Wasserabweisend', 'drop',    0),
  ('pet_friendly', 'Przyjazna zwierzętom', 'Tierfreundlich',  'paw',     1),
  ('easy_clean',   'Łatwa w czyszczeniu',  'Pflegeleicht',    'sparkle', 2)
on conflict (code) do nothing;
