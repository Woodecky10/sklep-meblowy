-- Migracja 59: model „zdjęć z produkcji" na tkaninie zmieniony z ręcznie
-- wgrywanych zdjęć (production_photos, migr. 58) na WYBÓR PRODUKTÓW.
-- featured_product_ids = tablica id produktów pokazywanych w sekcji
-- „Meble w tej tkaninie" na /tkaniny/[slug] (kolejność = kolejność w tablicy).
-- Idempotentnie. UWAGA: drop production_photos wycofuje stary model — przed
-- zastosowaniem na prodzie sprawdzić, czy nie ma tam realnych danych (Task 3).
alter table public.fabrics
  add column if not exists featured_product_ids jsonb not null default '[]'::jsonb;

alter table public.fabrics
  drop column if exists production_photos;
