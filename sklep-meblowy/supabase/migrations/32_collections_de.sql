-- ============================================================
-- Migracja 32: kolumny DE dla kolekcji + RPC save_collection z polami DE
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- collections.label_de / description_de: nullable, puste = fallback do PL przy
-- odczycie (localizeCollection). Spójne z products/categories (migracja 29).

alter table public.collections
  add column if not exists label_de text,
  add column if not exists description_de text;

-- save_collection zyskuje p_label_de / p_description_de. Liczba argumentów się
-- zmienia (4 → 6), więc DROP starej sygnatury + CREATE nowej — inaczej zostałby
-- wiszący overload. revoke/grant przeniesione na nową sygnaturę.
drop function if exists public.save_collection(uuid, text, text, uuid[]);

create or replace function public.save_collection(
  p_id uuid,
  p_label text,
  p_label_de text,
  p_description text,
  p_description_de text,
  p_product_ids uuid[]
) returns void language sql as $$
  update public.collections
     set label = p_label,
         label_de = p_label_de,
         description = p_description,
         description_de = p_description_de
   where id = p_id;
  update public.products
     set collection_id = null
   where collection_id = p_id
     and not (id = any(p_product_ids));
  update public.products
     set collection_id = p_id
   where id = any(p_product_ids);
$$;

-- ---- uprawnienia: tylko service_role (jak migracja 28) ----
revoke execute on function
  public.save_collection(uuid, text, text, text, text, uuid[])
  from public;
grant execute on function
  public.save_collection(uuid, text, text, text, text, uuid[])
  to service_role;
