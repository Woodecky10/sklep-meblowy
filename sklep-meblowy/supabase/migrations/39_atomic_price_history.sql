-- ============================================================
-- Migracja 39: atomowy zapis omnibus + price_history (HIGH fix)
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- Wcześniej recordPriceHistory robił 2 osobne zapisy:
--   1. UPDATE products (zdenormalizowany omnibus_price / variants)
--   2. INSERT INTO price_history (wiersz ceny efektywnej)
-- Pad między nimi zostawiał zdenormalizowaną omnibus_price wskazującą na
-- cenę, której NIE ma w historii → wartość, której rekompilacja nigdy nie
-- odtworzy. Dla figury zgodności z dyrektywą Omnibus to ryzyko integralności.
-- Funkcja SQL = jedno wywołanie = jedna transakcja → albo wszystko, albo nic
-- (ten sam wzorzec co migracja 28 dla operacji admina).
--
-- Logika WYLICZANIA (computePriceUpdates/computeOmnibus) zostaje w JS (czysta,
-- testowana) — RPC jest tylko atomowym pisarzem gotowego planu.
--
-- security invoker (default): wykonuje się z uprawnieniami wołającego.
-- Woła go service_role (server action po requireAdmin), który ma grant + BYPASSRLS.

create or replace function public.apply_price_changes(
  p_product_id   uuid,
  p_set_omnibus  boolean,   -- czy dotykać products.omnibus_price (poziom produktu)
  p_omnibus_price numeric,  -- nowa wartość (może być null = wyczyść); ignorowana gdy p_set_omnibus=false
  p_variants     jsonb,     -- pełny obiekt variants do zapisu; null = nie dotykaj
  p_rows         jsonb      -- [{variant_key, effective_price, recorded_at}] do price_history
) returns void language plpgsql as $$
begin
  if p_set_omnibus then
    update public.products set omnibus_price = p_omnibus_price where id = p_product_id;
  end if;

  if p_variants is not null then
    update public.products set variants = p_variants where id = p_product_id;
  end if;

  if p_rows is not null and jsonb_array_length(p_rows) > 0 then
    insert into public.price_history (product_id, variant_key, effective_price, recorded_at)
    select p_product_id,
           r.value ->> 'variant_key',                  -- JSON null → SQL NULL (poziom produktu)
           (r.value ->> 'effective_price')::numeric,
           (r.value ->> 'recorded_at')::timestamptz
      from jsonb_array_elements(p_rows) as r;
  end if;
end;
$$;

-- uprawnienia: tylko service_role
-- UWAGA: samo `revoke from public` NIE wystarcza — Supabase ALTER DEFAULT PRIVILEGES
-- nadaje EXECUTE rolom anon/authenticated przy tworzeniu funkcji w schemacie public.
-- Trzeba je odebrać jawnie, inaczej anon/authenticated mogą wołać funkcję
-- (SECURITY INVOKER + RLS i tak bramkuje, ale to niezgodne z intencją).
revoke execute on function
  public.apply_price_changes(uuid, boolean, numeric, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.apply_price_changes(uuid, boolean, numeric, jsonb, jsonb)
  to service_role;
