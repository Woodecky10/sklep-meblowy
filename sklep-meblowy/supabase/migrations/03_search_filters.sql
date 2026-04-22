-- ============================================================
-- Migracja 03: filtry koloru i materiału + indeksy dla wyszukiwarki
-- ============================================================

alter table public.products add column if not exists color    text;
alter table public.products add column if not exists material text;

-- Indeksy dla filtrowania po kolorze/materiale
create index if not exists idx_products_color    on public.products (color)    where color is not null;
create index if not exists idx_products_material on public.products (material) where material is not null;

-- Trigram index dla szybszego ilike po nazwie/opisie (pg_trgm)
create extension if not exists pg_trgm;
create index if not exists idx_products_name_trgm on public.products using gin (name        gin_trgm_ops);
create index if not exists idx_products_desc_trgm on public.products using gin (description gin_trgm_ops);

-- Uzupełnienie istniejących produktów (z seedu)
update public.products set color = 'granat',    material = 'welur'   where name = 'Sofa Velvet Midnight';
update public.products set color = 'szary',     material = 'tkanina' where name = 'Sofa Porto Modular';
update public.products set color = 'beżowy',    material = 'tkanina' where name = 'Łóżko Aurelia 180';
update public.products set color = 'naturalny', material = 'drewno'  where name = 'Łóżko Zen Minimalist';
update public.products set color = 'camel',     material = 'kaszmir' where name = 'Fotel Cashmere';
update public.products set color = 'naturalny', material = 'drewno'  where name = 'Fotel Rocking Classic';
update public.products set color = 'ecru',      material = 'boucle'  where name = 'Pufa Porto Grande';
update public.products set color = 'czarny',    material = 'skóra'   where name = 'Pufa Cube Leather';
