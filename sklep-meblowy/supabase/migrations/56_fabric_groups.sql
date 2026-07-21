-- Migracja 56: grupy cenowe tkanin (spec 2026-07-21).
-- fabric_groups = 3 stałe grupy (code niezmienny, nazwy/kwoty edytowalne w adminie).
-- Dopłata efektywna tkaniny = fabric_groups.surcharge + fabrics.price (korekta).
-- fabrics.slug = adres strony /tkaniny/[slug] (generowany z nazwy, stabilny).
create table if not exists public.fabric_groups (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  name        text not null,
  name_de     text,
  surcharge   numeric(10, 2) not null default 0 check (surcharge >= 0),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS jak fabrics (37): tylko admin; odczyt publiczny server-side przez service role.
alter table public.fabric_groups enable row level security;
create policy "fabric_groups: admin all"
  on public.fabric_groups for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

insert into public.fabric_groups (code, name, surcharge, sort_order) values
  ('standard',     'Standard',     0,   0),
  ('premium',      'Premium',      250, 1),
  ('premium_high', 'Premium High', 400, 2)
on conflict (code) do nothing;

-- Istniejące tkaniny → Standard (żadna nie ma dziś dopłaty — ceny bez zmian).
alter table public.fabrics
  add column if not exists group_id uuid references public.fabric_groups(id);

update public.fabrics
  set group_id = (select id from public.fabric_groups where code = 'standard')
  where group_id is null;

alter table public.fabrics alter column group_id set not null;

-- Slug: lower + polskie znaki + [^a-z0-9]+ → '-'; kolizje → sufiks -2, -3…
-- (ta sama semantyka co slugifyTitle w app/_lib/pages.ts).
alter table public.fabrics add column if not exists slug text;

with base as (
  select id,
    trim(both '-' from regexp_replace(
      translate(lower(name), 'ąćęłńóśźż', 'acelnoszz'),
      '[^a-z0-9]+', '-', 'g'
    )) as b
  from public.fabrics
), numbered as (
  select id, b, row_number() over (partition by b order by id) as rn
  from base
)
update public.fabrics f
set slug = case
  when n.b = ''    then 'tkanina-' || n.rn
  when n.rn = 1    then n.b
  else                  n.b || '-' || n.rn
end
from numbered n
where n.id = f.id and f.slug is null;

alter table public.fabrics alter column slug set not null;
create unique index if not exists fabrics_slug_key on public.fabrics (slug);

-- Opis na stronę /tkaniny/[slug] (sanityzowany HTML z RichTextEditor; DE fallback do PL).
alter table public.fabrics add column if not exists description text;
alter table public.fabrics add column if not exists description_de text;
