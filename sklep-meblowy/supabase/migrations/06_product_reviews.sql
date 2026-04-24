-- ============================================================
-- Migracja 06: recenzje produktów (oceny + komentarze)
-- ============================================================
-- Tylko zweryfikowani klienci mogą zostawić opinię — sprawdzamy w RLS,
-- czy user ma zamówienie ze statusem paid/processing/shipped/delivered
-- zawierające dany produkt. Jedna opinia na użytkownika na produkt.
-- Zgodność z dyrektywą Omnibus: opinie pochodzą wyłącznie od osób,
-- które rzeczywiście kupiły produkt.

create table if not exists public.product_reviews (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create index if not exists idx_product_reviews_product on public.product_reviews (product_id);
create index if not exists idx_product_reviews_user    on public.product_reviews (user_id);
create index if not exists idx_product_reviews_created on public.product_reviews (created_at desc);

-- Trigger aktualizujący updated_at
create or replace function public.touch_product_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_reviews_updated_at on public.product_reviews;
create trigger trg_product_reviews_updated_at
  before update on public.product_reviews
  for each row execute function public.touch_product_reviews_updated_at();

-- ============================================================
-- RLS: publiczny odczyt, zapis tylko po zakupie
-- ============================================================
alter table public.product_reviews enable row level security;

-- Wszyscy widzą opinie (publiczne na stronie produktu)
create policy "reviews: publiczny odczyt"
  on public.product_reviews for select
  to anon, authenticated
  using (true);

-- Insert: user musi być zalogowany i mieć opłacone zamówienie zawierające ten produkt
create policy "reviews: insert po zakupie"
  on public.product_reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and oi.product_id = product_reviews.product_id
        and o.status in ('paid','processing','shipped','delivered')
    )
  );

-- Update: tylko własne opinie
create policy "reviews: update własne"
  on public.product_reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete: tylko własne
create policy "reviews: delete własne"
  on public.product_reviews for delete
  to authenticated
  using (auth.uid() = user_id);
