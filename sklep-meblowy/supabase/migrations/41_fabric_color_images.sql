-- Migracja 41: zdjęcia tkanin per kolor.
-- color_images = mapa { numer_koloru -> URL zdjęcia }, np. {"16":"https://…"}.
-- Kolumna colors (text[]) trzyma kolejność i kody numerów; color_images tylko te,
-- które mają wgrane zdjęcie. Puste = tkanina/kolor bez zdjęcia (placeholder).
alter table public.fabrics
  add column if not exists color_images jsonb not null default '{}'::jsonb;
