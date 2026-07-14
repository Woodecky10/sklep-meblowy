-- supabase/migrations/51_theme_settings.sql
-- Wybór motywu wyglądu (/admin/wyglad). Palety i fonty w kodzie
-- (app/_lib/theme.ts); tu tylko wybór. Defaulty = dzisiejszy wygląd.
-- RLS store_settings już ustawione w migracji 33 (odczyt publiczny,
-- zapis service_role) — nowe kolumny dziedziczą polityki tabeli.

alter table public.store_settings
  add column if not exists theme_preset text not null default 'klasyczny',
  add column if not exists theme_overrides jsonb not null default '{}'::jsonb,
  add column if not exists font_pair text not null default 'inter-playfair';
