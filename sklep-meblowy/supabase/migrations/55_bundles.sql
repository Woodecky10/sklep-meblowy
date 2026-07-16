-- supabase/migrations/55_bundles.sql
-- Zestawy mebli (spec 2026-07-16): admin łączy 2+ produktów w zestaw z rabatem
-- (% lub kwota od sumy cen efektywnych). Składniki pozostają zwykłymi
-- produktami; rabat liczony i weryfikowany serwerowo w /api/checkout.

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_de text,
  description text,
  description_de text,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value numeric not null check (discount_value > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint bundles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Skład zestawu (M2M): usunięcie produktu usuwa wpis (zestaw z < 2 aktywnymi
-- składnikami jest ukrywany w warstwie odczytu), usunięcie zestawu czyści skład.
create table if not exists public.bundle_items (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  position int not null default 0,
  primary key (bundle_id, product_id)
);

alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;

-- Odczyt publiczny TYLKO aktywnych (wzorzec pages.published, migr. 53).
drop policy if exists bundles_read on public.bundles;
create policy bundles_read on public.bundles
  for select using (is_active);

drop policy if exists bundle_items_read on public.bundle_items;
create policy bundle_items_read on public.bundle_items
  for select using (
    exists (
      select 1 from public.bundles b
      where b.id = bundle_items.bundle_id and b.is_active
    )
  );

revoke insert, update, delete on public.bundles from anon, authenticated;
revoke insert, update, delete on public.bundle_items from anon, authenticated;

-- Ślad zestawu na zamówieniu: FK SET NULL (usunięcie zestawu nie rusza
-- historii) + zdenormalizowana nazwa z chwili zakupu do widoków zamówień.
alter table public.order_items
  add column if not exists bundle_id uuid references public.bundles(id) on delete set null;
alter table public.order_items
  add column if not exists bundle_label text;
alter table public.orders
  add column if not exists bundle_discount numeric not null default 0;

-- Atomowy zapis metadanych + składu (wzorzec save_collection, migr. 32).
create or replace function public.save_bundle(
  p_id uuid,
  p_name text,
  p_name_de text,
  p_description text,
  p_description_de text,
  p_discount_type text,
  p_discount_value numeric,
  p_is_active boolean,
  p_product_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bundles set
    name = p_name,
    name_de = p_name_de,
    description = p_description,
    description_de = p_description_de,
    discount_type = p_discount_type,
    discount_value = p_discount_value,
    is_active = p_is_active
  where id = p_id;

  delete from public.bundle_items where bundle_id = p_id;
  insert into public.bundle_items (bundle_id, product_id, position)
  select p_id, pid, ord - 1
  from unnest(p_product_ids) with ordinality as t(pid, ord);
end;
$$;

revoke execute on function public.save_bundle(uuid, text, text, text, text, text, numeric, boolean, uuid[])
  from public, anon, authenticated;
