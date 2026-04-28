-- ============================================================
-- Admin role — nadanie uprawnień adminowych użytkownikowi
-- ============================================================
-- Uruchom w Supabase Dashboard → SQL Editor.
-- Podmień email na właściwy. Można uruchomić wielokrotnie — idempotentne.
--
-- Po wykonaniu user musi się WYLOGOWAĆ i ZALOGOWAĆ ponownie, żeby JWT
-- z nowym claim `role: admin` został przyznany sesji.
-- ============================================================

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
where email = 'miki19991@gmail.com';

-- Weryfikacja:
select email, raw_app_meta_data ->> 'role' as role
from auth.users
where email = 'miki19991@gmail.com';

-- ============================================================
-- Cofnięcie uprawnień (gdyby trzeba):
-- ============================================================
-- update auth.users
-- set raw_app_meta_data = raw_app_meta_data - 'role'
-- where email = 'miki19991@gmail.com';
