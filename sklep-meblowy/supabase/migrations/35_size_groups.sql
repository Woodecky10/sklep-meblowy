-- Migracja 35: grupy rozmiarów — łączą osobne produkty/aukcje tego samego
-- mebla w różnych rozmiarach. Strona produktu pokazuje selektor rozmiaru
-- pobierając produkty z tym samym size_group (mirror collection siblings).
--
-- size_group  — wspólny klucz grupy (np. 'loze-vegas'), ten sam na każdym rozmiarze.
-- size_label  — etykieta tego rozmiaru (np. '140×200 cm') pokazywana na chipie.
alter table products
  add column if not exists size_group text,
  add column if not exists size_label text;

-- Indeks częściowy pod lookup rodzeństwa (where size_group is not null).
create index if not exists products_size_group_idx
  on products (size_group)
  where size_group is not null;
