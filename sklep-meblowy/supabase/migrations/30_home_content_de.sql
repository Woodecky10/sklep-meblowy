-- Migracja 30: kolumny _de dla treści strony głównej (slajdy hero + kafelki).
-- Dwujęzyczność PL/DE — admin wpisuje tłumaczenia DE w panelach /admin/slider
-- i /admin/kafelki. Odczyt (slides.ts / home-tiles.ts): wartość _de z fallbackiem
-- do PL (a dla treści sprzed tej migracji — do statycznej mapy HOME_TEXT_DE).
-- Wszystkie kolumny NULLable: puste = brak tłumaczenia → fallback do PL.

alter table public.home_slides
  add column if not exists eyebrow_de text,
  add column if not exists title_de text,
  add column if not exists highlighted_word_de text,
  add column if not exists subtitle_de text,
  add column if not exists image_alt_de text,
  add column if not exists cta_primary_label_de text,
  add column if not exists cta_secondary_label_de text;

alter table public.home_tiles
  add column if not exists label_de text,
  add column if not exists description_de text,
  add column if not exists image_alt_de text;
