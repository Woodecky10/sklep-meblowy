-- ============================================================
-- Migracja 29: kolumny tłumaczeń DE + flaga świeżości (i18n etap ①)
-- Uruchom w Supabase SQL Editor.
-- ============================================================
-- Kolumny _de nullable; brak/pusto = fallback do PL przy odczycie.
-- needs_translation: true = do (re)tłumaczenia przez sweep; czyszczone po zapisie DE
-- (auto lub ręczna korekta w panelu).

alter table public.products
  add column if not exists name_de text,
  add column if not exists description_de text,
  add column if not exists description_sections_de jsonb,
  add column if not exists color_de text,
  add column if not exists material_de text,
  add column if not exists needs_translation boolean not null default true,
  add column if not exists translated_at timestamptz;

alter table public.categories
  add column if not exists label_de text,
  add column if not exists needs_translation boolean not null default true,
  add column if not exists translated_at timestamptz;

alter table public.category_groups
  add column if not exists label_de text,
  add column if not exists needs_translation boolean not null default true,
  add column if not exists translated_at timestamptz;

alter table public.product_reviews
  add column if not exists comment_de text,
  add column if not exists needs_translation boolean not null default true,
  add column if not exists translated_at timestamptz;

-- Indeks częściowy — sweep szybko znajduje zaległe.
create index if not exists idx_products_needs_translation
  on public.products (needs_translation) where needs_translation = true;
create index if not exists idx_reviews_needs_translation
  on public.product_reviews (needs_translation) where needs_translation = true;

-- RLS: kolumny dziedziczą polityki tabel (odczyt publiczny products/categories,
-- write tylko service role po migracji 26). Brak nowych polityk.
