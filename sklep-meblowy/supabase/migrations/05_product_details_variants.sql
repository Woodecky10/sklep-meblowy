-- ============================================================
-- Migracja 05: szczegóły produktu + restrukturyzacja wariantów
-- ============================================================
-- Dodaje pola: dimensions, weight, construction, delivery_time, warranty.
-- Restrukturyzuje pole `variants` z prostej tablicy [{name,value}] na obiekt:
--   {
--     "options":      [{"name":"Strona","values":["Lewa","Prawa"]}, ...],
--     "combinations": [{"values":{"Strona":"Lewa"},"stock":5,"price_modifier":0}, ...]
--   }
-- Produkty bez wariantów: variants = null, używają product.stock.
-- Produkty z wariantami: stock per kombinacja (pole product.stock = suma).

-- 1. Nowe pola
alter table public.products
  add column if not exists dimensions    jsonb,                  -- {width, depth, height} w cm
  add column if not exists weight        numeric(8, 2),          -- w kg, opcjonalne
  add column if not exists construction  text,                   -- np. "Stelaż dębowy, sprężyny bonell"
  add column if not exists delivery_time text,                   -- np. "21 dni roboczych"
  add column if not exists warranty      text;                   -- np. "5 lat"

-- order_items: zapisujemy wybrane warianty (np. {"Strona":"Lewa","Kolor":"Beżowy"})
alter table public.order_items
  add column if not exists variant_values jsonb;

-- 2. Konwersja istniejących wariantów ze starej struktury [{name,value}] na nową
-- Stary format: [{"name":"Kolor","value":"Granat"},{"name":"Kolor","value":"Szary"}]
-- Nowy format: {"options":[{"name":"Kolor","values":["Granat","Szary"]}],"combinations":[...]}
-- Kombinacje dostają domyślnie stock = product.stock / liczba_wariantów (round down), price_modifier = 0
update public.products p
set variants = sub.new_variants
from (
  select
    p2.id,
    jsonb_build_object(
      'options',
      jsonb_build_array(
        jsonb_build_object(
          'name',   v->>'name',
          'values', jsonb_agg(v->>'value' order by v->>'value')
        )
      ),
      'combinations',
      jsonb_agg(
        jsonb_build_object(
          'values',         jsonb_build_object(v->>'name', v->>'value'),
          'stock',          greatest(p2.stock / nullif(jsonb_array_length(p2.variants), 0), 0),
          'price_modifier', 0
        )
        order by v->>'value'
      )
    ) as new_variants
  from public.products p2
  cross join lateral jsonb_array_elements(p2.variants) v
  where jsonb_typeof(p2.variants) = 'array'
    and jsonb_array_length(p2.variants) > 0
  group by p2.id, p2.stock, v->>'name'
) sub
where p.id = sub.id;

-- 3. Uzupełnij szczegóły dla istniejących produktów (przykładowe wartości)
update public.products set
  dimensions    = jsonb_build_object('width', 220, 'depth', 95, 'height', 85),
  weight        = 78,
  construction  = 'Rama z litego dębu, sprężyny bonell, wypełnienie pianką HR i puchem',
  delivery_time = '21 dni roboczych',
  warranty      = '5 lat'
where name = 'Sofa Velvet Midnight';

update public.products set
  dimensions    = jsonb_build_object('width', 280, 'depth', 180, 'height', 88),
  weight        = 95,
  construction  = 'Rama drewniana, tkanina z domieszką poliestru, sprężyny falowe',
  delivery_time = '14 dni roboczych',
  warranty      = '3 lata'
where name = 'Sofa Porto Modular';

update public.products set
  dimensions    = jsonb_build_object('width', 200, 'depth', 220, 'height', 130),
  weight        = 65,
  construction  = 'Stelaż z buku, zagłówek tapicerowany, opcjonalny pojemnik',
  delivery_time = '28 dni roboczych',
  warranty      = '5 lat'
where name = 'Łóżko Aurelia 180';

update public.products set
  dimensions    = jsonb_build_object('width', 180, 'depth', 210, 'height', 30),
  weight        = 45,
  construction  = 'Lite drewno dębowe, niska bryła, bez zagłówka',
  delivery_time = '21 dni roboczych',
  warranty      = '10 lat'
where name = 'Łóżko Zen Minimalist';

update public.products set
  dimensions    = jsonb_build_object('width', 80, 'depth', 85, 'height', 95),
  weight        = 22,
  construction  = 'Tapicerka z kaszmiru, rama z giętej sklejki, podstawa obrotowa',
  delivery_time = '14 dni roboczych',
  warranty      = '5 lat'
where name = 'Fotel Cashmere';

update public.products set
  dimensions    = jsonb_build_object('width', 75, 'depth', 90, 'height', 105),
  weight        = 18,
  construction  = 'Drewno jesionowe, siedzisko z wełnianej tkaniny, bujany mechanizm',
  delivery_time = '14 dni roboczych',
  warranty      = '5 lat'
where name = 'Fotel Rocking Classic';

update public.products set
  dimensions    = jsonb_build_object('width', 80, 'depth', 80, 'height', 40),
  weight        = 9,
  construction  = 'Tkanina boucle, wewnętrzny pojemnik, pokrywa zdejmowana',
  delivery_time = '7 dni roboczych',
  warranty      = '2 lata'
where name = 'Pufa Porto Grande';

update public.products set
  dimensions    = jsonb_build_object('width', 45, 'depth', 45, 'height', 45),
  weight        = 6,
  construction  = 'Naturalna skóra bydlęca, wkład piankowy',
  delivery_time = '7 dni roboczych',
  warranty      = '2 lata'
where name = 'Pufa Cube Leather';

-- 4. Seed: 2 produkty z wieloma typami wariantów (do testów)
insert into public.products
  (name, description, price, category, images, stock, color, material,
   dimensions, weight, construction, delivery_time, warranty, variants)
values
  (
    'Narożnik Milano',
    'Elegancki narożnik z welurowym obiciem i konfigurowalną stroną. Wybierz orientację oraz kolor pasujący do Twojego salonu.',
    8499.00,
    'naroznik-l',
    array['https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800'],
    12,
    'beżowy',
    'welur',
    jsonb_build_object('width', 280, 'depth', 195, 'height', 88),
    110,
    'Stelaż drewniany, sprężyny bonell, wypełnienie pianka HR, obicie welurowe',
    '28 dni roboczych',
    '5 lat',
    jsonb_build_object(
      'options', jsonb_build_array(
        jsonb_build_object('name','Strona','values', jsonb_build_array('Lewa','Prawa')),
        jsonb_build_object('name','Kolor','values',  jsonb_build_array('Beżowy','Szary','Granatowy'))
      ),
      'combinations', jsonb_build_array(
        jsonb_build_object('values', jsonb_build_object('Strona','Lewa', 'Kolor','Beżowy'),    'stock', 3, 'price_modifier', 0),
        jsonb_build_object('values', jsonb_build_object('Strona','Lewa', 'Kolor','Szary'),     'stock', 2, 'price_modifier', 0),
        jsonb_build_object('values', jsonb_build_object('Strona','Lewa', 'Kolor','Granatowy'), 'stock', 1, 'price_modifier', 200),
        jsonb_build_object('values', jsonb_build_object('Strona','Prawa','Kolor','Beżowy'),    'stock', 3, 'price_modifier', 0),
        jsonb_build_object('values', jsonb_build_object('Strona','Prawa','Kolor','Szary'),     'stock', 2, 'price_modifier', 0),
        jsonb_build_object('values', jsonb_build_object('Strona','Prawa','Kolor','Granatowy'), 'stock', 1, 'price_modifier', 200)
      )
    )
  ),
  (
    'Łóżko kontynentalne Lisbon',
    'Łóżko kontynentalne z wbudowanym materacem kieszeniowym i topperem. Dostępne w trzech rozmiarach.',
    6299.00,
    'lozko-kontynentalne',
    array['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800'],
    9,
    'szary',
    'tkanina',
    jsonb_build_object('width', 180, 'depth', 210, 'height', 130),
    85,
    'Stelaż drewniany, materac kieszeniowy 7 stref + topper z pianki termoelastycznej',
    '35 dni roboczych',
    '10 lat',
    jsonb_build_object(
      'options', jsonb_build_array(
        jsonb_build_object('name','Rozmiar','values', jsonb_build_array('140x200','160x200','180x200'))
      ),
      'combinations', jsonb_build_array(
        jsonb_build_object('values', jsonb_build_object('Rozmiar','140x200'), 'stock', 4, 'price_modifier', -400),
        jsonb_build_object('values', jsonb_build_object('Rozmiar','160x200'), 'stock', 3, 'price_modifier', 0),
        jsonb_build_object('values', jsonb_build_object('Rozmiar','180x200'), 'stock', 2, 'price_modifier', 600)
      )
    )
  )
on conflict do nothing;
