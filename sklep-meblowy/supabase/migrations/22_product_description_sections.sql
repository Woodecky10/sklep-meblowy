-- ============================================================
-- Migracja 22: ustrukturyzowane sekcje opisu produktu
-- ============================================================
-- Karta produktu pokazuje opis jako akordeony IKEA-style: O materiale,
-- Pielęgnacja, Wymiary szczegółowe, FAQ. 5 pól BL (description +
-- description_extra1-4) automatycznie mapuje się na 5 nazwanych sekcji
-- z konwencją hardcoded — koleżanka uczy się raz: "wpisz w Opis 2
-- informacje o materiale" i tak działa dla każdego produktu.
--
-- Każda sekcja: { title: string, body: string, kind: 'text' }
-- W przyszłości można rozszerzyć o kind: 'image'/'gallery'/'spec_table'
-- bez kolejnej migracji.
--
-- Stary products.description JEST ZACHOWANY jako:
-- 1. SEO fallback (Google indeksuje plain HTML łatwiej niż jsonb)
-- 2. fallback dla starych produktów które jeszcze nie mają sections
-- ============================================================

alter table public.products
  add column if not exists description_sections jsonb not null default '[]'::jsonb;

-- GIN index do ewentualnego wyszukiwania po treści sekcji w przyszłości.
create index if not exists idx_products_description_sections
  on public.products using gin (description_sections);

comment on column public.products.description_sections is
  'Struktualne sekcje opisu produktu — array of {title, body, kind:text}. '
  'Wypełniane automatycznie przez sync BL z 5 pól text_fields '
  '(description + description_extra1-4) z hardcoded labelkami. '
  'description (text) zostaje jako legacy fallback i SEO description.';
