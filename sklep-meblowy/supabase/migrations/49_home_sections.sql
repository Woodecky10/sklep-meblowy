-- supabase/migrations/49_home_sections.sql
-- Sekcje strony głównej: kolejność, widoczność, nagłówki PL+DE.
-- Edytowane w /admin/strona-glowna. Seed = dzisiejszy wygląd strony 1:1
-- (wartości muszą być identyczne z DEFAULT_HOME_SECTIONS w
-- app/_lib/home-sections.ts, które biorą je ze słowników).
-- UWAGA: 47/48 zarezerwowane przez PR #48 (P24) — stąd numer 49.

create table if not exists public.home_sections (
  key text primary key
    check (key in ('hero','tiles','featured','trust_bar','collections')),
  sort_order int not null,
  visible boolean not null default true,
  heading text,
  heading_de text,
  subheading text,
  subheading_de text,
  updated_at timestamptz not null default now()
);

insert into public.home_sections
  (key, sort_order, visible, heading, heading_de, subheading, subheading_de)
values
  ('hero',        0, true, null, null, null, null),
  ('tiles',       1, true, 'Znajdź swój styl', 'Finden Sie Ihren Stil', 'Kolekcje', 'Kollektionen'),
  ('featured',    2, true, 'Polecane produkty', 'Empfohlene Produkte', null, null),
  ('trust_bar',   3, true, 'Dlaczego warto kupować u nas?', 'Warum bei uns kaufen?', 'MEBLE Z CHARAKTEREM', 'MÖBEL MIT CHARAKTER'),
  ('collections', 4, true, 'Nasze kolekcje', 'Unsere Kollektionen', 'Serie mebli', 'Möbelserien')
on conflict (key) do nothing;

alter table public.home_sections enable row level security;

-- Odczyt publiczny — sekcje renderuje strona główna także dla anon.
drop policy if exists home_sections_read on public.home_sections;
create policy home_sections_read on public.home_sections
  for select using (true);

-- Zapis tylko service_role (server actions po requireAdmin).
revoke insert, update, delete on public.home_sections from anon, authenticated;

-- Atomowy reorder (wzorzec migracji 28): sort_order = pozycja w tablicy, 0-based.
create or replace function public.reorder_home_sections(p_keys text[])
returns void language sql as $$
  update public.home_sections s
     set sort_order = (o.ord - 1)::int,
         updated_at = now()
    from unnest(p_keys) with ordinality as o(key, ord)
   where s.key = o.key;
$$;

revoke execute on function public.reorder_home_sections(text[]) from public;
grant execute on function public.reorder_home_sections(text[]) to service_role;
