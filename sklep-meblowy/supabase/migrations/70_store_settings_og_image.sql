-- Migracja 70: zdjęcie kafelka udostępnień (og:image) wskazywane jawnie w panelu.
--
-- DLACZEGO OSOBNA KOLUMNA, A NIE „bierz pierwszy slajd hero":
-- kadr og:image to 1200×630 (1.905:1), a slajdy hero mają dowolne proporcje.
-- Z czterech slajdów na 2026-08-06 dwa wypadają w tym kadrze źle (fragment
-- poduszki na białym tle; pasy tkanin ze slajdu promocyjnego). Slajdy promocyjne
-- z natury wskakują na pierwsze miejsce podczas kampanii, więc automat psułby
-- wizytówkę na Facebooku niewidocznie — na samej stronie slider wygląda dobrze.
-- Pierwszy slajd zostaje wyłącznie jako fallback, gdy kolumna jest pusta.
--
-- NULL = brak wyboru → app/og/route.tsx schodzi na slajd, a potem na kartę
-- brandową. Kafelek nigdy nie idzie pusty.
--
-- UWAGA dla wgrywających ręcznie: Satori (renderer og:image) rasteryzuje TYLKO
-- JPEG i PNG — WebP i AVIF wysypują route. Panel pilnuje tego przy uploadzie,
-- a route dodatkowo sniffuje magic bytes, bo rozszerzenia plików w tym storage
-- bywają mylące (są tam pliki .png z zawartością JPEG).
alter table public.store_settings
  add column if not exists og_image_url text;

comment on column public.store_settings.og_image_url is
  'Zdjęcie kafelka udostępnień (og:image), kadr 1200x630. Tylko JPEG/PNG. NULL = fallback na pierwszy slajd hero, potem karta brandowa.';
