-- ============================================================
-- Migracja 27: utwardzenie product_inquiries
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- Audyt 2026-06-11 (LOW): publiczny INSERT (migracja 17) bez ograniczeń.
--
-- (1) Zapytania idą przez server action submitInquiry (SERVICE ROLE —
--     app/produkt/actions.ts), więc anon/authenticated NIE potrzebują prawa
--     INSERT. Z otwartą polityką anon mógł przez REST zaśmiecać kolejkę
--     moderacji dowolnymi/gigantycznymi wartościami, omijając walidację
--     server action. Usuwamy politykę + REVOKE (wzorzec jak migracja 26).
-- (2) CHECK na długości — defense-in-depth na poziomie DB (gdyby kiedyś
--     wróciła jakaś polityka INSERT). Limity spójne z submitInquiry/formularzem.
--
-- WERYFIKACJA PO ZAAPLIKOWANIU:
--   1. Formularz „Zapytaj o inne kolory" na karcie produktu — musi działać
--      (submitInquiry = service role, omija RLS).
--   2. Bezpośredni anon/JWT REST INSERT do product_inquiries → odrzucony.

-- (1) usuń publiczny INSERT + odbierz grant
drop policy if exists "inquiries: public insert" on public.product_inquiries;
revoke insert on public.product_inquiries from anon, authenticated;

-- (2) limity długości (defense-in-depth, spójne z formularzem i submitInquiry)
alter table public.product_inquiries
  drop constraint if exists chk_inquiry_lengths;
alter table public.product_inquiries
  add constraint chk_inquiry_lengths check (
    char_length(product_name) <= 300
    and char_length(customer_name) <= 200
    and char_length(customer_email) between 3 and 200
    and position('@' in customer_email) > 1
    and (customer_phone is null or char_length(customer_phone) <= 50)
    and char_length(message) between 5 and 2000
  );
