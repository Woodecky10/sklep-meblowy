-- ============================================================
-- Migracja 19: uniwersalna kolekcja cech produktu (features) z BL
-- ============================================================
-- BL `features` to obiekt {key: value} — np. {"Kolor":"Beżowy", "Wymiary":"280x200 cm",
-- "Materiał obicia":"welur"}. Trzymamy jako jsonb array of {key, value} żeby zachować
-- kolejność z BL (admin ustawia kolejność cech w panelu).
--
-- Dedykowane kolumny (color, material, dimensions, construction, delivery_time,
-- warranty) zostają — używane do FILTRÓW w /sklep i mają stały format. Features
-- to "wszystko inne" co admin może dodać + duplikaty kolumn dedykowanych dla
-- czytelności na karcie produktu.
-- ============================================================

alter table public.products
  add column if not exists features jsonb not null default '[]'::jsonb;

-- GIN index na wypadek wyszukiwania po cechach (np. "produkty z 'Wymiary' 280x200")
create index if not exists idx_products_features
  on public.products using gin (features);
