-- Migracja 69: terminy promocji + ręczny napis na wstążce.
-- Podział odpowiedzialności za cenę:
--   sale_price          — cena OBOWIĄZUJĄCA TERAZ; pisze ją WYŁĄCZNIE reconciler
--                         (app/_lib/sale-schedule.ts). Formularz produktu jej nie dotyka.
--   sale_price_planned  — cena promocyjna wpisana w panelu (plan, nie stan).
--   sale_from/sale_to   — okno w dniach Europe/Warsaw, granice WŁĄCZNIE.
--                         Puste sale_from = od razu, puste sale_to = bez końca.
--   promo_badge         — ręczne nadpisanie napisu na wstążce; niezależne od ceny
--                         (patrz ostrzeżenie o Omnibusie w panelu).
alter table public.products
  add column if not exists sale_price_planned numeric(10,2) check (sale_price_planned >= 0),
  add column if not exists sale_from          date,
  add column if not exists sale_to            date,
  add column if not exists promo_badge        text;

-- Częściowy indeks pod zapytanie reconcilera: bierze tylko wiersze, które mogą
-- wymagać przełączenia, a nie całą tabelę.
create index if not exists idx_products_sale_schedule
  on public.products (sale_from, sale_to)
  where sale_price_planned is not null or sale_price is not null;
