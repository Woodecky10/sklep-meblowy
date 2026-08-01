-- ============================================================
-- Migracja 67: zamawianie próbek tkanin.
-- Uruchom w Supabase SQL Editor (migracje NIE aplikują się automatycznie).
-- ============================================================
-- Spec: docs/superpowers/specs/2026-08-01-probki-tkanin-design.md
--
-- Próbki są OSOBNYM bytem obok zamówień mebli: inny kanał wysyłki (list, nie
-- firma transportowa), inna maszyna stanów, inna definicja "gotowe".
-- `orders` i `fabrics` NIE są ruszane.

-- ============================================================
-- 1. Zamówienia próbek
-- ============================================================
create table if not exists public.sample_orders (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  -- Snapshot danych klienta: profil może się zmienić, zamówienie ma zostać czytelne.
  customer_name    text not null default '' check (char_length(customer_name) <= 200),
  customer_email   text not null check (char_length(customer_email) <= 200),
  customer_phone   text check (char_length(customer_phone) <= 40),
  shipping_address jsonb not null default '{}'::jsonb,
  -- DWIE NIEZALEŻNE OSIE STANU. Sklejenie ich w jedno pole jest tym samym
  -- błędem, przez który orders.processing przy pobraniu nie znaczy "opłacone".
  status           text not null default 'new'
                     check (status in ('new','packed','sent','cancelled')),
  payment_status   text not null default 'none'
                     check (payment_status in ('none','pending','paid')),
  amount_total     numeric(10,2) not null default 0,
  payment_ref      text,
  -- Ile sztuk poszło z darmowej puli — potrzebne, żeby anulowanie wiedziało,
  -- ile miejsc zwrócić (release_free_samples).
  free_count       integer not null default 0,
  paid_count       integer not null default 0,
  email_key        text not null,
  tracking         text check (char_length(tracking) <= 120),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sample_orders_status     on public.sample_orders (status);
create index if not exists idx_sample_orders_created_at on public.sample_orders (created_at desc);
create index if not exists idx_sample_orders_user       on public.sample_orders (user_id);

-- Funkcja set_updated_at() już istnieje (z migracji 09).
drop trigger if exists trg_sample_orders_updated on public.sample_orders;
create trigger trg_sample_orders_updated
  before update on public.sample_orders
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Pozycje = KOLORY tkanin, nie tkaniny
-- ============================================================
create table if not exists public.sample_order_items (
  id               uuid primary key default uuid_generate_v4(),
  sample_order_id  uuid not null references public.sample_orders(id) on delete cascade,
  fabric_id        uuid references public.fabrics(id) on delete set null,
  color            text not null default '' check (char_length(color) <= 40),
  -- Snapshot: katalog tkanin się zmienia, a zamówienie sprzed roku ma dalej
  -- mówić, co wysłano (ten sam wzorzec co product_inquiries.product_name).
  fabric_name      text not null default '',
  is_free          boolean not null default false,
  unit_price       numeric(10,2) not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists idx_sample_items_order on public.sample_order_items (sample_order_id);

-- ============================================================
-- 3. Licznik darmowej puli
-- ============================================================
-- KLUCZEM JEST ZNORMALIZOWANY E-MAIL, nie user_id: założenie drugiego konta na
-- jan+1@gmail.com zajmuje 30 sekund i dałoby kolejne trzy darmowe paczki.
create table if not exists public.sample_quota (
  email_key    text primary key,
  user_id      uuid references auth.users(id) on delete set null,
  used_count   integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- 4. RPC: atomowa rezerwacja darmowych sztuk
-- ============================================================
-- Limit MUSI być twardy. Odpowiednik przy kodach rabatowych
-- (increment_promo_usage) ma znany dług: dwa równoległe checkouty potrafią
-- przepchnąć nadmiarowe użycie. Tutaj blokada wiersza (for update) plus
-- policzenie przyznanych sztuk w tej samej transakcji zamyka ten wyścig.
--
-- Okno 12 miesięcy wygasa LENIWIE w tym samym wywołaniu — na Vercelu nie ma
-- crona (crons: [] w vercel.json), więc nic nie mogłoby go wyczyścić w tle.
--
-- Liczba 3 = SAMPLE_FREE_LIMIT po stronie aplikacji. Zmiana limitu wymaga
-- zmiany w OBU miejscach (baza jest tu ostatecznym sędzią).
create or replace function public.claim_free_samples(p_email_key text, p_qty int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used   int;
  v_window timestamptz;
  v_grant  int;
begin
  if p_qty is null or p_qty <= 0 then
    return 0;
  end if;

  insert into public.sample_quota (email_key, used_count, window_start)
  values (p_email_key, 0, now())
  on conflict (email_key) do nothing;

  select used_count, window_start
    into v_used, v_window
    from public.sample_quota
   where email_key = p_email_key
   for update;

  -- Bez wiersza nie ma czego rezerwować. Bez tej bramki NULL-owa arytmetyka
  -- zwróciłaby NULL zamiast liczby — cicha awaria po stronie JS. Kierunek
  -- bezpieczny: zero gratisów, nigdy nadmiar.
  if v_used is null then
    return 0;
  end if;

  if v_window < now() - interval '12 months' then
    v_used := 0;
    v_window := now();
  end if;

  v_grant := least(p_qty, greatest(0, 3 - v_used));

  update public.sample_quota
     set used_count   = v_used + v_grant,
         -- Okno startuje od PIERWSZEJ darmowej próbki, nie od założenia konta.
         window_start = case when v_used = 0 and v_grant > 0 then now() else v_window end,
         updated_at   = now()
   where email_key = p_email_key;

  return v_grant;
end;
$$;

-- Zwrot miejsc przy anulowaniu zamówienia. Bez tego porzucone, nieopłacone
-- zamówienie zabrałoby klientowi darmową pulę na rok.
create or replace function public.release_free_samples(p_email_key text, p_qty int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_qty is null or p_qty <= 0 then
    return;
  end if;

  update public.sample_quota
     set used_count = greatest(0, used_count - p_qty),
         updated_at = now()
   where email_key = p_email_key;
end;
$$;

-- Uprawnienia: tylko service_role (wzorzec migracji 39).
-- UWAGA: samo `revoke from public` NIE wystarcza — Supabase ALTER DEFAULT
-- PRIVILEGES nadaje EXECUTE rolom anon/authenticated przy tworzeniu funkcji
-- w schemacie public. Trzeba je odebrać jawnie; te funkcje są SECURITY DEFINER,
-- więc otwarty EXECUTE oddałby klientowi sterowanie licznikiem gratisów.
revoke execute on function public.claim_free_samples(text, int)   from public, anon, authenticated;
revoke execute on function public.release_free_samples(text, int) from public, anon, authenticated;
grant  execute on function public.claim_free_samples(text, int)   to service_role;
grant  execute on function public.release_free_samples(text, int) to service_role;

-- ============================================================
-- 5. RLS — wariant utwardzony (jak migracje 26/27)
-- ============================================================
-- Formularz wymaga logowania i tak, a zapis idzie wyłącznie przez server action
-- na service_role — dlatego NIE ma polityki INSERT dla anon/authenticated.
alter table public.sample_orders      enable row level security;
alter table public.sample_order_items enable row level security;
alter table public.sample_quota       enable row level security;

drop policy if exists "sample_orders: owner read" on public.sample_orders;
create policy "sample_orders: owner read"
  on public.sample_orders for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "sample_orders: admin all" on public.sample_orders;
create policy "sample_orders: admin all"
  on public.sample_orders for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "sample_items: admin all" on public.sample_order_items;
create policy "sample_items: admin all"
  on public.sample_order_items for all
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- sample_quota: RLS włączone BEZ polityk = default-deny. Licznik gratisów czyta
-- i pisze wyłącznie service_role (przez RPC powyżej); klient nie ma tu nic do
-- roboty, a wgląd w cudzy licznik jest niepotrzebny.

-- Defense-in-depth na poziomie GRANT (wzorzec migracji 26/27): po usunięciu
-- polityk RLS i tak blokuje, ale REVOKE jest jednoznaczne. service_role ma
-- BYPASSRLS i własne uprawnienia, więc to NIE wpływa na zapisy aplikacji —
-- cały panel admina czyta i pisze przez createAdminClient.
revoke insert, update, delete on public.sample_orders      from anon, authenticated;
revoke insert, update, delete on public.sample_order_items from anon, authenticated;
revoke insert, update, delete on public.sample_quota       from anon, authenticated;
