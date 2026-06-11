-- ============================================================
-- Migracja 26: utwardzenie RLS orders / order_items
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- Audyt 2026-06-11 (HIGH#2 + HIGH#3): klienckie polityki write pozwalały
-- przez anon key + REST z przeglądarki:
--   (a) UPDATE bez WITH CHECK ("orders: własna aktualizacja") → klient mógł
--       zmienić status/total/promo_discount WŁASNEGO zamówienia
--       (np. update({status:'paid', total:0, promo_discount:9999})).
--   (b) INSERT ("orders: własne tworzenie" + guest) → klient mógł sfabrykować
--       kompletne zamówienie 'paid' bez płatności → łańcuch do fałszywych
--       "verified purchase" recenzji (ryzyko Omnibus).
--
-- Całe tworzenie i mutacje zamówień idą przez SERVICE ROLE (createAdminClient:
-- createOrder, markOrderPaid, applyBlStatus oraz cancelOrder po refaktorze).
-- Klient nie potrzebuje żadnego prawa INSERT/UPDATE/DELETE na orders/order_items.
-- Polityki SELECT (własny odczyt) ZOSTAJĄ.
--
-- WERYFIKACJA PO ZAAPLIKOWANIU (ręcznie):
--   1. Zalogowany użytkownik: anuluj własne PENDING zamówienie w /konto/zamowienia
--      — musi działać (cancelOrder idzie service-rolem).
--   2. Przez REST z anon/JWT: update orders set status='paid' → musi zostać
--      odrzucone (brak polityki UPDATE), insert into orders → odrzucone.
--   3. Checkout (gość i zalogowany) tworzy zamówienie — musi działać
--      (createOrder = service role).

-- orders: usuń klienckie INSERT/UPDATE (authenticated + anon gość)
drop policy if exists "orders: własne tworzenie" on public.orders;
drop policy if exists "orders: własna aktualizacja" on public.orders;
drop policy if exists "orders: guest insert" on public.orders;

-- order_items: usuń klienckie INSERT (authenticated + anon gość)
drop policy if exists "order_items: tworzenie przez zamówienie" on public.order_items;
drop policy if exists "order_items: guest insert" on public.order_items;

-- Defense-in-depth: odbierz prawa write na poziomie GRANT. Po usunięciu polityk
-- RLS i tak by blokował (default-deny), ale REVOKE jest jednoznaczne. service_role
-- ma BYPASSRLS i własne uprawnienia, więc to NIE wpływa na zapisy aplikacji.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
