-- ============================================================
-- Migracja 18: lista ulubionych produktów (wishlist) per użytkownik
-- ============================================================
-- Tylko dla zalogowanych — niezalogowani widzą serca jako "puste"
-- i klik przekierowuje do /logowanie.
--
-- Primary key = (user_id, product_id) → naturalna deduplikacja, nie da się
-- dodać tego samego produktu dwa razy. Toggle add/remove poprzez upsert/delete.
-- ============================================================

create table if not exists public.wishlists (
  user_id     uuid not null references auth.users(id)        on delete cascade,
  product_id  uuid not null references public.products(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists idx_wishlists_user
  on public.wishlists (user_id, created_at desc);

-- RLS: każdy user widzi/edytuje TYLKO swoje wpisy.
alter table public.wishlists enable row level security;

create policy "wishlists: own read"
  on public.wishlists for select
  to authenticated
  using (user_id = auth.uid());

create policy "wishlists: own insert"
  on public.wishlists for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "wishlists: own delete"
  on public.wishlists for delete
  to authenticated
  using (user_id = auth.uid());
