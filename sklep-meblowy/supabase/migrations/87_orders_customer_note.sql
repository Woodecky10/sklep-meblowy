-- Migracja 87: uwagi klienta do całego zamówienia (spec 2026-11-18).
alter table public.orders add column if not exists customer_note text;
