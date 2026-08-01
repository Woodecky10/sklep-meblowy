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
  -- ON DELETE RESTRICT, nie CASCADE — jak orders.user_id (schema.sql). Kasowanie
  -- konta w Studio nie może wymieść opłaconego, jeszcze niespakowanego zamówienia
  -- razem z pozycjami. Dodatkowo sample_quota.user_id jest SET NULL, więc licznik
  -- gratisów przeżyłby zamówienie, które go zużyło — i nie byłoby już z czego
  -- wywołać release_free_samples.
  user_id          uuid not null references auth.users(id) on delete restrict,
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
  -- CHECK >= 0 jak orders.total: każdy zapis w tym module idzie service_rolem,
  -- którego RLS nie ogranicza — baza jest tu jedynym hamulcem.
  amount_total     numeric(10,2) not null default 0 check (amount_total >= 0),
  payment_ref      text,
  -- Ile sztuk poszło z darmowej puli — potrzebne, żeby anulowanie wiedziało,
  -- ile miejsc zwrócić (release_free_samples).
  free_count       integer not null default 0 check (free_count >= 0),
  paid_count       integer not null default 0 check (paid_count >= 0),
  email_key        text not null,
  tracking         text check (char_length(tracking) <= 120),
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sample_orders_status     on public.sample_orders (status);
create index if not exists idx_sample_orders_created_at on public.sample_orders (created_at desc);
create index if not exists idx_sample_orders_user       on public.sample_orders (user_id);
-- Po email_key filtruje odczyt stanu puli i historii klienta (klucz tożsamości
-- jest znormalizowanym e-mailem, nie user_id — patrz sekcja 3).
create index if not exists idx_sample_orders_email_key  on public.sample_orders (email_key);

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
-- user_id jest INFORMACYJNY (spec: „user_id informacyjnie") — służy właścicielce
-- do powiązania licznika z kontem, nigdy do liczenia puli. Wypełnia go
-- claim_free_samples parametrem p_user_id; SET NULL przy kasowaniu konta, bo
-- licznik ma przeżyć konto (inaczej alias e-maila odnawiałby pulę).
create table if not exists public.sample_quota (
  email_key    text primary key,
  user_id      uuid references auth.users(id) on delete set null,
  used_count   integer not null default 0 check (used_count >= 0),
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
--
-- p_user_id jest opcjonalny i WYŁĄCZNIE informacyjny (wypełnia sample_quota.user_id).
-- Sygnatura jest domknięta TERAZ celowo: dołożenie parametru po aplikacji na prod
-- zostawiłoby wiszący overload (text,int) obok (text,int,uuid), z osobnym kompletem
-- grantów — repo przejechało się już na tym w migracji 32.
-- NIE USUWAĆ tego drop-a jako "zbędnego przy create or replace" — on NIE jest
-- zbędny. `create or replace` nie podmienia funkcji o INNEJ liczbie argumentów,
-- tylko stawia drugą obok. Gdyby na bazie wylądowała kiedyś dwuargumentowa
-- wersja (ten plik jest idempotentny i bywa odpalany ponownie), wywołanie
-- dwuargumentowe pasowałoby do obu i PostgREST oddałby 300 Multiple Choices
-- zamiast wybrać — zamawianie próbek przestaje działać, a przyczyna jest
-- nieoczywista. Precedens: 32_collections_de.sql:15.
drop function if exists public.claim_free_samples(text, int);

create or replace function public.claim_free_samples(
  p_email_key text,
  p_qty       int,
  p_user_id   uuid default null
)
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

  insert into public.sample_quota (email_key, user_id, used_count, window_start)
  values (p_email_key, p_user_id, 0, now())
  on conflict (email_key) do nothing;

  select used_count, window_start
    into v_used, v_window
    from public.sample_quota
   where email_key = p_email_key
   for update;

  -- Po `insert ... on conflict do nothing` wiersz MUSI istnieć — brak oznacza
  -- naruszenie założeń (ktoś kasuje sample_quota równolegle), nie sytuację do
  -- obsłużenia. Cichy `return 0` byłby gorszy niż wyjątek: klient zapłaciłby
  -- 45 zł za trzy próbki, które miały być darmowe, i nie zostałby po tym ślad.
  -- (GREATEST/LEAST ignorują NULL-e, więc bez tej bramki funkcja zwróciłaby 0
  -- — czyli dokładnie ten cichy błąd.)
  if v_used is null then
    raise exception 'sample_quota row missing for %', p_email_key;
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
         -- COALESCE, nie podstawienie: wywołanie bez p_user_id nie może wyczyścić
         -- powiązania zapisanego wcześniej.
         user_id      = coalesce(p_user_id, user_id),
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
revoke execute on function public.claim_free_samples(text, int, uuid) from public, anon, authenticated;
revoke execute on function public.release_free_samples(text, int)     from public, anon, authenticated;
grant  execute on function public.claim_free_samples(text, int, uuid) to service_role;
grant  execute on function public.release_free_samples(text, int)     to service_role;

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

-- Brak polityk INSERT/UPDATE/DELETE na sample_orders i sample_order_items oraz
-- brak polityki admina: całe tworzenie i mutacje idą przez service role
-- (server action po requireAdmin, createAdminClient), który omija RLS. Polityka
-- write dla roli admina byłaby martwa (REVOKE poniżej ucina GRANT jeszcze przed
-- RLS) i kłamałaby o modelu dostępu. Ten sam układ co orders — patrz schema.sql
-- i migracja 26 (utwardzenie po audycie 2026-06-11).

-- sample_order_items: RLS włączone BEZ polityk = default-deny. Historia zamówień
-- próbek w koncie klienta jest poza zakresem (spec), więc klient nie ma potrzeby
-- czytać pozycji; gdy wejdzie, dojdzie polityka „odczyt przez zamówienie"
-- w kształcie order_items ze schema.sql.

-- sample_quota: RLS włączone BEZ polityk = default-deny. Licznik gratisów czyta
-- i pisze wyłącznie service_role (przez RPC powyżej); klient nie ma tu nic do
-- roboty, a wgląd w cudzy licznik jest niepotrzebny.

-- Defense-in-depth na poziomie GRANT (wzorzec migracji 26/27): po braku polityk
-- RLS i tak blokuje, ale REVOKE jest jednoznaczne. service_role ma BYPASSRLS
-- i własne uprawnienia, więc to NIE wpływa na zapisy aplikacji.
revoke insert, update, delete on public.sample_orders      from anon, authenticated;
revoke insert, update, delete on public.sample_order_items from anon, authenticated;
revoke insert, update, delete on public.sample_quota       from anon, authenticated;
