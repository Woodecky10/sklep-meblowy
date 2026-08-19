-- ============================================================
-- Migracja 78: opinie publikują się natychmiast
-- ============================================================
-- Decyzja właściciela z 2026-08-19: opinię może wystawić wyłącznie osoba,
-- która kupiła produkt (bramka z migracji 46/76), więc czekanie na
-- zatwierdzenie tylko opóźnia publikację. Moderacja przenosi się PRZED -> PO:
-- opinia jest widoczna od razu, a panel służy do jej usunięcia.
--
-- „Nieprzejrzana" to NIE jest osobny status, tylko puste moderated_at przy
-- statusie approved. Ten sam wzorzec, co „nowe zamówienie" w orders
-- (status_updated_at is null, patrz getNewOrdersCount).

alter table public.product_reviews alter column status set default 'approved';

alter table public.product_reviews
  add column if not exists moderated_at timestamptz;

-- Plakietka panelu pyta wyłącznie o nieprzejrzane — indeks częściowy trzyma
-- ten odczyt tani niezależnie od tego, ile opinii uzbiera się z czasem.
create index if not exists idx_product_reviews_do_przejrzenia
  on public.product_reviews (created_at desc)
  where moderated_at is null;

-- Polityki z migracji 76 WYMUSZAJĄ status = 'pending' — po tej zmianie
-- odrzucałyby każdy zapis. Dopuszczamy 'pending' I 'approved', a NIE samo
-- 'approved', bo migracja i kod trafiają na produkcję osobno (migracje idą
-- ręcznie): przy samym 'approved' powstałoby okno, w którym stary kod nie
-- może zapisać ANI JEDNEJ opinii. Dopuszczenie 'pending' niczego nie otwiera —
-- pod nowym modelem samodzielna publikacja własnej opinii jest zamierzona,
-- a 'pending' oznacza „niewidoczna", czyli stan gorszy dla piszącego.
-- 'rejected' świadomie POZA listą: to stan, którego znaczenie należy do panelu.
-- Warunek zakupu przepisany DOSŁOWNIE z migracji 76 (bramka COD z 46).
drop policy if exists "reviews: insert po zakupie" on public.product_reviews;

create policy "reviews: insert po zakupie"
  on public.product_reviews for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status in ('pending','approved')
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
  with check (auth.uid() = user_id and status in ('pending','approved'));
