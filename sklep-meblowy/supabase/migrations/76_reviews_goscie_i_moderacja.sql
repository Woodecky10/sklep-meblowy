-- ============================================================
-- Migracja 76: opinie gości + moderacja
-- ============================================================
-- Do 2026-08-18 opinię mógł wystawić WYŁĄCZNIE zalogowany klient
-- (user_id not null + FK do auth.users). Sprawdzone na produkcji: 6 z 10
-- zamówień jest bez konta, więc większość kupujących nie miała fizycznej
-- możliwości nic napisać — stąd zero opinii przy dziesięciu zamówieniach.
--
-- Ta migracja: (a) wpuszcza gościa, (b) wprowadza moderację przed publikacją,
-- (c) zakłada rejestr zaproszeń do wystawienia opinii.

-- --- (a) autor: konto ALBO gość -----------------------------------------
alter table public.product_reviews alter column user_id drop not null;

alter table public.product_reviews
  add column if not exists guest_name  text,
  add column if not exists guest_email text;

-- Dokładnie jeden autor: nie „niczyja", nie podwójna.
alter table public.product_reviews
  drop constraint if exists product_reviews_autor_jeden;
alter table public.product_reviews
  add constraint product_reviews_autor_jeden check (
    (user_id is not null and guest_email is null and guest_name is null)
    or
    (user_id is null and guest_email is not null and guest_name is not null)
  );

-- Stare unique (product_id, user_id) ZOSTAJE — nie zastępujemy go indeksem
-- częściowym. Gwarancja jest identyczna: Postgres traktuje każdy NULL w
-- user_id jako różny od pozostałych, więc ograniczenie i tak nigdy nie
-- odpala się dla gości (user_id is null) — chroni wyłącznie konta, czyli
-- dokładnie to, co chroniło od migracji 06. Powód, żeby go NIE ruszać, jest
-- inny: `app/api/reviews/route.ts` robi `.upsert(..., { onConflict:
-- "product_id,user_id" })`, co PostgREST tłumaczy na `ON CONFLICT
-- (product_id, user_id) DO UPDATE` BEZ predykatu WHERE. Postgres dopasowuje
-- ON CONFLICT do indeksu częściowego tylko wtedy, gdy samo zapytanie niesie
-- WHERE implikujące ten predykat — przez PostgREST tego się nie da wymusić.
-- Podmiana na `uniq_review_user ... where user_id is not null` rozbroiłaby
-- upsert zalogowanego klienta błędem 42P10 przy KAŻDEJ próbie zapisu.
-- Dla gości osobny indeks częściowy poniżej — tam nie ma upsertu z PostgREST,
-- więc predykat nie przeszkadza.
-- lower(): Jan@x.pl i jan@x.pl to ten sam człowiek.
create unique index if not exists uniq_review_guest
  on public.product_reviews (product_id, lower(guest_email))
  where guest_email is not null;

-- --- (b) moderacja -------------------------------------------------------
alter table public.product_reviews
  add column if not exists status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  add column if not exists homepage_excluded boolean not null default false;

create index if not exists idx_product_reviews_status
  on public.product_reviews (status, created_at desc);

-- Dotychczasowa reguła odczytu to `using (true)` — po wprowadzeniu moderacji
-- opinie oczekujące i ODRZUCONE byłyby publicznie czytelne przez API, mimo że
-- nigdzie ich nie pokazujemy. To jest jedyny powód, dla którego ta zmiana
-- musi wejść razem z kolumną status, a nie później.
drop policy if exists "reviews: publiczny odczyt" on public.product_reviews;

create policy "reviews: publiczny odczyt zatwierdzonych"
  on public.product_reviews for select to anon, authenticated
  using (status = 'approved');

-- Autor musi widzieć własną opinię także w oczekiwaniu — inaczej
-- getReviewStatus nie miałby czego podstawić do edycji.
drop policy if exists "reviews: autor widzi swoje" on public.product_reviews;
create policy "reviews: autor widzi swoje"
  on public.product_reviews for select to authenticated
  using (user_id = auth.uid());

-- Moderacja musi domykać się też w ZAPISIE, nie tylko w odczycie: polityki
-- insert/update odziedziczone z migracji 06 i 46 nic nie wiedzą o kolumnie
-- status. NEXT_PUBLIC_SUPABASE_ANON_KEY jest jawny w paczce przeglądarki,
-- a sesja siedzi w ciasteczkach — bez tej poprawki zalogowany kupujący mógłby
-- z konsoli wstawić albo podmienić WŁASNĄ opinię ze status: 'approved' i
-- opublikować ją z pominięciem panelu. To dokładnie ten scenariusz („napisz
-- neutralnie, doczekaj zatwierdzenia, podmień treść"), który upsert w API
-- zamyka ustawieniem status: 'pending' — zamknięty w aplikacji, ale nadal
-- otwarty w samym API bazy. Obie ścieżki aplikacji (upsert zalogowanego,
-- insert gościa) i tak wysyłają status: 'pending', więc nic w działającym
-- kodzie się nie zmienia — to domyka wyłącznie obejście przez bezpośrednie
-- wywołanie REST z ważną sesją. Warunek `exists (...)` przepisany DOSŁOWNIE
-- z migracji 46 (bramka COD) — to on rozstrzyga o „zweryfikowanym zakupie".
drop policy if exists "reviews: insert po zakupie" on public.product_reviews;
create policy "reviews: insert po zakupie"
  on public.product_reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and exists (
      select 1
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and oi.product_id = product_reviews.product_id
        and (
          (o.payment_method = 'online' and o.status in ('paid','processing','shipped','delivered'))
          or (o.payment_method = 'cod' and o.status in ('shipped','delivered'))
        )
    )
  );

drop policy if exists "reviews: update własne" on public.product_reviews;
create policy "reviews: update własne"
  on public.product_reviews for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'pending');

-- --- (c) zaproszenia -----------------------------------------------------
-- Jedno zaproszenie = jedna para (zamówienie, produkt). Token trzymamy
-- WYŁĄCZNIE jako skrót SHA-256; wartość jawna istnieje tylko w wysłanym
-- mailu. Wyciek kopii bazy nie może oddawać prawa do pisania opinii w cudzym
-- imieniu — ta sama zasada co przy resecie hasła.
create table if not exists public.review_invites (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  email       text not null,
  token_hash  text not null unique,
  sent_at     timestamptz not null default now(),
  reminded_at timestamptz,
  used_at     timestamptz,
  expires_at  timestamptz not null,
  unique (order_id, product_id)
);

create index if not exists idx_review_invites_do_przypomnienia
  on public.review_invites (sent_at) where reminded_at is null and used_at is null;

-- Tabela jest dostępna WYŁĄCZNIE przez klienta administracyjnego po stronie
-- serwera. Włączamy RLS i świadomie nie dodajemy żadnej polityki: brak
-- polityki = brak dostępu dla anon i authenticated.
alter table public.review_invites enable row level security;
