-- Migracja 63: cechy tkaniny pokazywane klientowi przy wyborze tkaniny
-- (wodoodporna / przyjazna zwierzetom / latwa w czyszczeniu).
-- Kody trzymane w kodzie aplikacji (app/_lib/fabric-properties.ts); tu leza
-- tylko zaznaczenia. Domyslnie pusto = zadna cecha sie nie pokazuje.
alter table fabrics
  add column if not exists properties text[] not null default '{}';
