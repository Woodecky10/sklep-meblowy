-- 81: Zamówienia spoza sklepu (Allegro, OLX, …) wpisywane ręcznie w panelu.
-- Spec: docs/superpowers/specs/2026-09-02-zamowienia-zewnetrzne-design.md
--
-- `source` = nazwa źródła pokazywana klientowi w mailu „Dziękujemy za
-- zamówienie" (idzie 1:1, więc to tekst dla człowieka, nie klucz).
-- NULL = zamówienie złożone przez stronę — istniejących wierszy nie ruszamy,
-- a cała dotychczasowa logika (checkout, P24, maile) nie zna tej kolumny.
alter table public.orders
  add column if not exists source text
    check (source is null or char_length(source) between 1 and 60);

-- Filtr „Zewnętrzne" na liście zamówień. Częściowy: sklepowe (null) nie
-- wchodzą do indeksu, a to one stanowią ogromną większość wierszy.
create index if not exists idx_orders_source
  on public.orders (source)
  where source is not null;
