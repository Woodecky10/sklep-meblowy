-- Migracja 85: własne zdjęcie zestawu (właściciel 2026-11-04: „chcę, aby można
-- było ustawić ręcznie zdjęcie zestawu, żeby wyświetlało się tutaj" — zrzut
-- sekcji „Zestawy mebli" na stronie głównej).
--
-- Puste (NULL) = kafelek jak dotąd: mozaika z pierwszych zdjęć składników
-- (bundle-tiles.ts). Ustawione = jedno zdjęcie na cały kafelek — na sliderze
-- na home i na liście /zestawy (ten sam BundleTileCard). Strona /zestaw/[slug]
-- i podgląd linku (og:image) świadomie BEZ zmian.
--
-- Plik leży w publicznym buckecie `products` pod prefiksem `zestawy/`
-- (bundle-image.ts) — bez nowego bucketa i nowych polityk storage; panel
-- wgrywa przez service role. Zapis kolumny idzie zwykłym UPDATE z akcji
-- serwerowej, więc save_bundle (migracja 55) zostaje bez zmian.
--
-- Idempotentna: projekt aplikuje migracje ręcznie i plik bywa odpalany
-- drugi raz.
alter table public.bundles
  add column if not exists image_url text;
