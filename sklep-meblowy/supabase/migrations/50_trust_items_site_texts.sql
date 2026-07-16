-- supabase/migrations/50_trust_items_site_texts.sql
-- Pasek zaufania (pozycje) + teksty globalne (TopBar/stopka) edytowalne
-- w /admin/strona-glowna. Seed = dzisiejsza treść ze słowników 1:1.

-- ── trust_items ─────────────────────────────────────────────────────────
create table if not exists public.trust_items (
  id uuid primary key default gen_random_uuid(),
  icon text not null,
  label text not null,
  label_de text,
  subline text,
  subline_de text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed tylko do pustej tabeli (id losowe — nie ma jak on conflict).
insert into public.trust_items (icon, label, label_de, subline, subline_de, sort_order, active)
select * from (values
  ('medal-pl',     'Polski producent',   'Polnischer Hersteller', null::text,                null::text,       0, true),
  ('shield-check', 'Gwarancja jakości',  'Qualitätsgarantie',     null,                      null,             1, true),
  ('truck-free',   'Darmowa dostawa',    'Kostenlose Lieferung',  'na terenie całej Polski', 'in ganz Polen',  2, true),
  ('warranty-2y',  '2 lata gwarancji',   '2 Jahre Garantie',      null,                      null,             3, true)
) as seed(icon, label, label_de, subline, subline_de, sort_order, active)
where not exists (select 1 from public.trust_items);

alter table public.trust_items enable row level security;
drop policy if exists trust_items_read on public.trust_items;
create policy trust_items_read on public.trust_items
  for select using (true);
revoke insert, update, delete on public.trust_items from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28).
create or replace function public.reorder_trust_items(p_ids uuid[])
returns void language sql as $$
  update public.trust_items t
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id;
$$;
revoke execute on function public.reorder_trust_items(uuid[]) from public;
grant execute on function public.reorder_trust_items(uuid[]) to service_role;

-- ── site_texts ──────────────────────────────────────────────────────────
create table if not exists public.site_texts (
  key text primary key,
  value text,
  value_de text,
  updated_at timestamptz not null default now()
);

insert into public.site_texts (key, value, value_de) values
  ('topbar_slogan',  'Polski producent mebli tapicerowanych', 'Polnischer Hersteller von Polstermöbeln'),
  ('footer_tagline', 'Tworzymy przestrzenie, w których chce się żyć. Meble najwyższej jakości, z pasją do detalu.', 'Wir schaffen Räume, in denen man leben möchte. Möbel von höchster Qualität, mit Liebe zum Detail.')
on conflict (key) do nothing;

alter table public.site_texts enable row level security;
drop policy if exists site_texts_read on public.site_texts;
create policy site_texts_read on public.site_texts
  for select using (true);
revoke insert, update, delete on public.site_texts from anon, authenticated;
