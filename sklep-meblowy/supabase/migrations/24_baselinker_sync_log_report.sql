-- ============================================================
-- Migracja 24: raport run-level w logu sync (ukrycia/przywrócenia/kategorie)
-- ============================================================
-- Raport run-level (deactivated/reactivated/hide_skipped_reason/
-- unmapped_categories) w osobnej kolumnie jsonb, żeby panel pokazał banner
-- „produkt zniknął — brak mapowania kategorii" także po przeładowaniu strony.
-- null dla starych logów.
-- ============================================================

alter table public.baselinker_sync_log
  add column if not exists report jsonb;

comment on column public.baselinker_sync_log.report is
  'Raport run-level sync: {deactivated:[{id,name}], reactivated:[{id,name}], hide_skipped_reason:string|null, unmapped_categories:[{bl_category_id,sample_product_name,count}]}. null dla logów sprzed utwardzenia.';
