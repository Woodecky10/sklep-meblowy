-- ============================================================
-- MeblePremium — schemat bazy danych
-- Uruchom w Supabase SQL Editor: supabase.com > SQL Editor
-- ============================================================

-- Włącz rozszerzenie UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELA: profiles
-- Rozszerza auth.users o dane profilu
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  address     jsonb,
  created_at  timestamptz not null default now()
);

-- Automatyczne tworzenie profilu po rejestracji
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TABELA: products
-- ============================================================
create table if not exists public.products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text not null default '',
  price       numeric(10, 2) not null check (price >= 0),
  category    text not null check (category in (
    'sofa-2-osobowa', 'sofa-3-osobowa',
    'naroznik-l', 'naroznik-u', 'fotele', 'pufy', 'zestawy',
    'lozko-kontynentalne', 'lozko-tapicerowane', 'materace'
  )),
  images      text[] not null default '{}',
  stock       integer not null default 0 check (stock >= 0),
  variants    jsonb,
  created_at  timestamptz not null default now()
);

-- Indeksy dla filtrowania i sortowania
create index if not exists idx_products_category on public.products (category);
create index if not exists idx_products_price    on public.products (price);
create index if not exists idx_products_created  on public.products (created_at desc);

-- ============================================================
-- TABELA: orders
-- ============================================================
create table if not exists public.orders (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references auth.users(id) on delete restrict,
  status                 text not null default 'pending'
                           check (status in ('pending','paid','processing','shipped','delivered','cancelled')),
  total                  numeric(10, 2) not null check (total >= 0),
  shipping_address       jsonb not null,
  stripe_payment_intent  text,
  created_at             timestamptz not null default now()
);

create index if not exists idx_orders_user_id   on public.orders (user_id);
create index if not exists idx_orders_status     on public.orders (status);
create index if not exists idx_orders_created    on public.orders (created_at desc);

-- ============================================================
-- TABELA: order_items
-- ============================================================
create table if not exists public.order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  price       numeric(10, 2) not null check (price >= 0)
);

create index if not exists idx_order_items_order   on public.order_items (order_id);
create index if not exists idx_order_items_product on public.order_items (product_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles   enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Profiles: każdy widzi tylko swój profil
create policy "profiles: własny odczyt"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: własna aktualizacja"
  on public.profiles for update
  using (auth.uid() = id);

-- Products: publiczny odczyt, tylko admin może modyfikować
create policy "products: publiczny odczyt"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "products: admin insert"
  on public.products for insert
  to authenticated
  with check (auth.jwt() ->> 'role' = 'admin');

create policy "products: admin update"
  on public.products for update
  to authenticated
  using (auth.jwt() ->> 'role' = 'admin');

create policy "products: admin delete"
  on public.products for delete
  to authenticated
  using (auth.jwt() ->> 'role' = 'admin');

-- Orders: własne zamówienia
create policy "orders: własny odczyt"
  on public.orders for select
  using (auth.uid() = user_id);

-- Brak klienckich polityk INSERT/UPDATE/DELETE na orders: całe tworzenie i
-- mutacje idą przez service role (createOrder/markOrderPaid/applyBlStatus/
-- cancelOrder). Patrz migracja 26 (utwardzenie RLS po audycie 2026-06-11) —
-- otwarte polityki write pozwalały klientowi fałszować status/total/promo
-- i fabrykować zamówienia 'paid'.

-- Order items: przez zamówienie
create policy "order_items: odczyt przez zamówienie"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );

-- Brak klienckiej polityki INSERT na order_items: pozycje dodaje wyłącznie
-- service role (createOrder). Patrz migracja 26.

-- ============================================================
-- DANE PRZYKŁADOWE (opcjonalne — usuń w produkcji)
-- ============================================================
insert into public.products (name, description, price, category, images, stock, variants) values
  (
    'Sofa Velvet Midnight',
    'Luksusowa sofa tapicerowana aksamitem w kolorze głębokiego granatu. Rama z litego dębu, poduszki wypełnione puchem. Idealna do eleganckich salonów.',
    4299.00, 'sofa-3-osobowa',
    array['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800'],
    8,
    '[{"name":"Kolor","value":"Granat"},{"name":"Kolor","value":"Szary"},{"name":"Kolor","value":"Beż"}]'::jsonb
  ),
  (
    'Sofa Porto Modular',
    'Modułowa sofa narożna z możliwością konfiguracji. Tkanina odporna na zabrudzenia, idealna dla rodzin z dziećmi.',
    6799.00, 'naroznik-l',
    array['https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800'],
    4, null
  ),
  (
    'Łóżko Aurelia 180',
    'Majestatyczne łóżko z tapicerowanym zagłówkiem w jodełkę. Stelaż z buk, opcjonalne pojemniki na pościel.',
    5899.00, 'lozko-tapicerowane',
    array['https://images.unsplash.com/photo-1505693314120-0d443867891c?w=800'],
    6,
    '[{"name":"Rozmiar","value":"160x200"},{"name":"Rozmiar","value":"180x200"},{"name":"Rozmiar","value":"200x200"}]'::jsonb
  ),
  (
    'Łóżko Zen Minimalist',
    'Nowoczesne łóżko o niskiej bryle, inspirowane japońskim minimalizmem. Naturalne drewno dębowe.',
    4199.00, 'lozko-tapicerowane',
    array['https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800'],
    10, null
  ),
  (
    'Fotel Cashmere',
    'Fotel wypoczynkowy tapicerowany kaszmirem. Ergonomiczny kształt, idealne wsparcie lędźwi. Obrotowa podstawa.',
    2199.00, 'fotele',
    array['https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800'],
    12,
    '[{"name":"Kolor","value":"Camel"},{"name":"Kolor","value":"Kremowy"},{"name":"Kolor","value":"Terrakota"}]'::jsonb
  ),
  (
    'Fotel Rocking Classic',
    'Bujany fotel w stylu skandynawskim. Drewno jesionowe, siedzisko z wełnianej tkaniny.',
    1799.00, 'fotele',
    array['https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=800'],
    7, null
  ),
  (
    'Pufa Porto Grande',
    'Okrągła pufa XXL tapicerowana boucle. Pojemnik wewnętrzny na przechowywanie. Śr. 80 cm.',
    899.00, 'pufy',
    array['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800'],
    20,
    '[{"name":"Kolor","value":"Ecru"},{"name":"Kolor","value":"Szary"},{"name":"Kolor","value":"Rdzawy"}]'::jsonb
  ),
  (
    'Pufa Cube Leather',
    'Pufa w kształcie sześcianu pokryta naturalną skórą. Wyjątkowo trwała i łatwa w czyszczeniu.',
    649.00, 'pufy',
    array['https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800'],
    15, null
  )
on conflict do nothing;
