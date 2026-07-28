-- Migracja 59 (EXPAND): dodaje kolumnę featured_product_ids na tkaninie.
-- Model „zdjęć z produkcji" zmieniony na WYBÓR PRODUKTÓW: featured_product_ids
-- = tablica id produktów pokazywanych w sekcji „Meble w tej tkaninie" na
-- /tkaniny/[slug] (kolejność = kolejność w tablicy). Idempotentnie.
-- Kolumna production_photos (migr. 58) NIE jest tu usuwana — jej DROP jest w
-- migr. 60 (CONTRACT), stosowanej dopiero PO wdrożeniu nowego kodu na prod,
-- żeby uniknąć okna, w którym zapisy admina trafiają w nieistniejącą kolumnę.
alter table public.fabrics
  add column if not exists featured_product_ids jsonb not null default '[]'::jsonb;
