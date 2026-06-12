-- ============================================================
-- Migracja 28: transakcyjne RPC dla operacji admina (audyt 2026-06-11 LOW)
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- Wcześniej:
--  #17 reorder (slider/kafelki/polecane) robił N osobnych UPDATE w pętli —
--      częściowa awaria zostawiała niespójną kolejność.
--  #15 setCollectionProducts robił 2 osobne UPDATE (assign + unassign) —
--      pad między nimi = produkty przypisane, ale stare nieodpięte.
--  #14 zapis kolekcji w edytorze = updateCollection + setCollectionProducts
--      (2 server actions) — metadane zapisane, przypisania nie.
-- Funkcje SQL = jedno wywołanie = jedna transakcja → albo wszystko, albo nic.
--
-- security invoker (default): wykonują się z uprawnieniami wołającego.
-- Woła je service_role (server action po requireAdmin), który ma grant + BYPASSRLS.
-- EXECUTE odbieramy anon/authenticated (i tak nie mają write na tabelach).

-- ---- #17: reorder (sort_order = pozycja w tablicy, 0-based) ----
create or replace function public.reorder_home_slides(p_ids uuid[])
returns void language sql as $$
  update public.home_slides s
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id;
$$;

create or replace function public.reorder_home_tiles(p_ids uuid[])
returns void language sql as $$
  update public.home_tiles t
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id;
$$;

create or replace function public.reorder_featured_products(p_ids uuid[])
returns void language sql as $$
  update public.featured_products f
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where f.id = o.id;
$$;

-- ---- #15: przypisanie dokładnie tej listy produktów do kolekcji ----
-- Pusta tablica → odpina wszystko z kolekcji (assign nic nie robi).
create or replace function public.set_collection_products(
  p_collection_id uuid,
  p_product_ids uuid[]
) returns void language sql as $$
  update public.products
     set collection_id = null
   where collection_id = p_collection_id
     and not (id = any(p_product_ids));
  update public.products
     set collection_id = p_collection_id
   where id = any(p_product_ids);
$$;

-- ---- #14: zapis metadanych kolekcji + przypisań w jednej transakcji ----
create or replace function public.save_collection(
  p_id uuid,
  p_label text,
  p_description text,
  p_product_ids uuid[]
) returns void language sql as $$
  update public.collections
     set label = p_label, description = p_description
   where id = p_id;
  update public.products
     set collection_id = null
   where collection_id = p_id
     and not (id = any(p_product_ids));
  update public.products
     set collection_id = p_id
   where id = any(p_product_ids);
$$;

-- ---- uprawnienia: tylko service_role ----
revoke execute on function
  public.reorder_home_slides(uuid[]),
  public.reorder_home_tiles(uuid[]),
  public.reorder_featured_products(uuid[]),
  public.set_collection_products(uuid, uuid[]),
  public.save_collection(uuid, text, text, uuid[])
  from public;
grant execute on function
  public.reorder_home_slides(uuid[]),
  public.reorder_home_tiles(uuid[]),
  public.reorder_featured_products(uuid[]),
  public.set_collection_products(uuid, uuid[]),
  public.save_collection(uuid, text, text, uuid[])
  to service_role;
