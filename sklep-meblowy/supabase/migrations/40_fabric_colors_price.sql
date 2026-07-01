-- Migracja 40: kolory (numery) i dopłata dla tkanin.
-- colors = lista numerów/kolorów kolekcji (np. {'02','04','09'}); puste = tkanina
--          bez kolorów (wartość wariantu = sama nazwa, jak dotąd).
-- price  = dopłata do ceny bazowej gdy wybrana ta tkanina (zł, >= 0). Propagowana
--          do value_prices opcji „Tkanina" przy dodaniu do produktu.
alter table public.fabrics
  add column if not exists colors text[] not null default '{}';

alter table public.fabrics
  add column if not exists price numeric(10, 2) not null default 0 check (price >= 0);
