-- Migracja 60 (CONTRACT): usuwa starą kolumnę production_photos (migr. 58).
-- ⚠️ Stosować DOPIERO gdy nowy kod („Meble w tej tkaninie") jest już na
-- produkcji (nowy kod nie odwołuje się do production_photos, stary — tak).
-- Idempotentnie. Przed uruchomieniem: pre-check danych (patrz plan Task 4).
alter table public.fabrics
  drop column if exists production_photos;
