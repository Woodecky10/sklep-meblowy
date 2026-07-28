-- Migracja 58: zdjęcia z produkcji na tkaninie (spec 2026-07-21-zdjecia-produkcji-tkanin).
-- production_photos = tablica {url, product_id|null}; kolejność = kolejność w tablicy.
-- JSONB jak color_images (bez FK) — martwe product_id (produkt usunięty) obsługiwane
-- przy renderze (zdjęcie bez linku).
alter table public.fabrics
  add column if not exists production_photos jsonb not null default '[]'::jsonb;
