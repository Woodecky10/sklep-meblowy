-- Migracja 75: kolejność produktów WEWNĄTRZ kolekcji.
--
-- Wzorzec sort_order jest już w categories, home_tiles, fabric_groups
-- i collections (migracja 66) — ta migracja robi to samo piętro niżej.
-- Produkty w kolekcji szły dotąd alfabetycznie po nazwie i admin nie miał
-- na to wpływu ani w sliderze, ani na liście, ani w sekcji „Pełna kolekcja".
--
-- Kolumna siedzi na products, a nie w tabeli łączącej, bo przynależność do
-- kolekcji to pojedyncze products.collection_id — produkt należy najwyżej do
-- jednej kolekcji, więc jedna pozycja na produkt wystarcza.
alter table public.products
  add column if not exists collection_sort_order integer not null default 0;

-- BACKFILL OBOWIĄZKOWY. Bez niego wszystkie produkty mają 0 i kolejność
-- w kolekcji robi się przypadkowa (zależna od tego, co baza zwróci pierwsze).
-- Numerujemy alfabetycznie W OBRĘBIE KAŻDEJ KOLEKCJI, czyli zachowujemy
-- kolejność obowiązującą przed migracją — wdrożenie nie zmienia niczego, co
-- widzi klient.
--
-- GUARD od pierwszego dnia, nie dopisany po fakcie jak w migracji 66. Ta
-- lekcja jest już zapłacona: projekt aplikuje migracje RĘCZNIE i ma niepełny
-- rejestr, więc plik bywa odpalany drugi raz. Bez guarda kolejne odpalenie
-- bezwarunkowo nadpisałoby kolejność z powrotem na alfabetyczną, kasując bez
-- ostrzeżenia ustawienia admina zrobione przeciąganiem w /admin/kolekcje.
-- Guard: backfill działa tylko, gdy ŻADEN produkt nie ma jeszcze niezerowej
-- pozycji, czyli wyłącznie przy pierwszym uruchomieniu.
update public.products p
set collection_sort_order = t.rn
from (
  select id,
         (row_number() over (partition by collection_id order by name, created_at)) - 1 as rn
  from public.products
  where collection_id is not null
) t
where p.id = t.id
  -- GUARD: tylko gdy kolejność nie jest jeszcze ustawiona
  and not exists (
    select 1 from public.products where collection_sort_order <> 0
  );

-- Atomowy reorder jedną instrukcją — jak reorder_collections z migracji 66
-- i reorder_home_tiles z 28. Pętla UPDATE po jednym wierszu przy padzie
-- w połowie zostawia kolekcję z pomieszanymi numerami.
--
-- Funkcja NIE sprawdza, czy wszystkie id należą do tej samej kolekcji:
-- przypisanie i kolejność zapisuje ta sama akcja panelu, w tej samej
-- transakcji, więc walidacja tutaj dublowałaby regułę bez dodania pewności.
create or replace function public.reorder_collection_products(p_ids uuid[])
returns void language sql as $$
  update public.products p
     set collection_sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where p.id = o.id;
$$;

revoke execute on function public.reorder_collection_products(uuid[]) from public;
grant  execute on function public.reorder_collection_products(uuid[]) to service_role;

-- Indeks pod czytanie kolekcji po kolejności. Katalog ma dziś ~350 produktów,
-- więc zysk jest pomijalny — ale ten sam wzorzec zapytania (filtr po
-- collection_id + sort po pozycji) obsługuje slider, listę, sekcję „Pełna
-- kolekcja" i mozaikę na stronie głównej, czyli cztery ścieżki naraz.
create index if not exists products_collection_order_idx
  on public.products (collection_id, collection_sort_order);
