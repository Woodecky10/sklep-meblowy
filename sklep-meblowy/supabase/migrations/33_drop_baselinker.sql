-- supabase/migrations/33_drop_baselinker.sql
-- Pelne wyciecie BaseLinkera: usuniecie kolumn i tabeli logu BL.
-- DESTRUKCYJNE: traci historyczne odniesienia baselinker_* na zamowieniach/produktach.
-- Uruchomic PO deployu kodu bez BL (kod juz nie czyta tych kolumn).
alter table public.products   drop column if exists baselinker_id;
alter table public.orders     drop column if exists baselinker_order_id;
alter table public.orders     drop column if exists baselinker_push_error;
alter table public.categories drop column if exists baselinker_category_id;
drop table if exists public.baselinker_sync_log;
-- Indeksy na powyzszych kolumnach/tabeli znikaja automatycznie.
