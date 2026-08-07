-- supabase/migrations/71_menu_items_custom_links.sql
-- Linki własne w menu (spec 2026-08-07). Pozycja menu wskazuje ALBO podstronę
-- CMS (page_id), ALBO trasę zaszytą w kodzie (href). /tkaniny, /o-nas
-- i /kontakt to pliki w app/, nie wiersze w pages — bez tej zmiany nie da się
-- ich dodać do menu z panelu.

alter table public.menu_items alter column page_id drop not null;
alter table public.menu_items add column if not exists href text;

-- Dokładnie jedno z dwóch. Wiersz bez celu i wiersz z dwoma celami są tak samo
-- bez sensu, a XOR wyklucza oba jednym warunkiem.
alter table public.menu_items drop constraint if exists menu_items_target_xor;
alter table public.menu_items
  add constraint menu_items_target_xor
  check ((page_id is not null) <> (href is not null));

-- Link własny nie ma tytułu strony, z którego wziąłby etykietę awaryjną.
alter table public.menu_items drop constraint if exists menu_items_href_needs_label;
alter table public.menu_items
  add constraint menu_items_href_needs_label
  check (page_id is not null or (label is not null and btrim(label) <> ''));

-- Ten sam adres dwa razy w jednej lokacji to pomyłka. NULL-e są w unique index
-- wzajemnie różne, więc indeks nie przeszkadza wierszom wskazującym podstrony
-- (dokładnie ta sama własność, dzięki której menu_items_location_page_idx
-- nie przeszkadza linkom własnym).
create unique index if not exists menu_items_location_href_idx
  on public.menu_items (location, href);

-- Odczyt anonimowy: warunek „istnieje opublikowana strona" wyciąłby każdy link
-- własny, bo on żadnej strony nie ma. Aplikacja czyta service_role, więc to
-- porządek na ścieżce REST, nie zmiana zachowania sklepu.
drop policy if exists menu_items_read on public.menu_items;
create policy menu_items_read on public.menu_items
  for select using (
    visible
    and (
      href is not null
      or exists (
        select 1 from public.pages p
        where p.id = menu_items.page_id and p.published
      )
    )
  );

-- Zasiew trzech pozycji headera, o które chodziło w zgłoszeniu. Idempotentny
-- dzięki menu_items_location_href_idx. Pozycje zostają w pełni edytowalne —
-- można je przestawić, przemianować albo usunąć z panelu.
insert into public.menu_items (location, page_id, href, label, label_de, sort_order, visible)
values
  ('navbar', null, '/tkaniny', 'Tkaniny', 'Stoffe',   0, true),
  ('navbar', null, '/o-nas',   'O nas',   'Über uns', 1, true),
  ('navbar', null, '/kontakt', 'Kontakt', 'Kontakt',  2, true)
on conflict (location, href) do nothing;
