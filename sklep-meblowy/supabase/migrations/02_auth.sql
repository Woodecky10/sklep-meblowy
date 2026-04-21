-- ============================================================
-- Migracja: autentykacja + linkowanie zamówień gościa
-- Uruchom w Supabase SQL Editor
-- ============================================================

-- Zaktualizuj trigger handle_new_user — pobierz full_name z metadata
-- (Google OAuth dostarcza full_name w raw_user_meta_data)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      null
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Indeks na guest_email — szybkie wyszukiwanie przy linkowaniu
create index if not exists idx_orders_guest_email
  on public.orders (guest_email)
  where guest_email is not null;
