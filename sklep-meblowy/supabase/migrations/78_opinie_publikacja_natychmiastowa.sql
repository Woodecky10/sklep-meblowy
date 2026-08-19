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

-- `alter column ... set default` jest z natury idempotentny (ustawienie tego
-- samego defaultu drugi raz nie jest błędem), więc nie potrzebuje `if not exists`.
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

-- Recenzja CAŁEJ gałęzi (2026-08-19) znalazła, że ta polityka NIE MOŻE być
-- zwykłym powtórzeniem insertu — z dwóch niezależnych powodów naraz:
--
-- 1) (K2, krytyczne) `using` bez warunku na status pozwalało zaktualizować
--    WŁASNĄ opinię niezależnie od jej stanu, także `rejected`. Pod starym
--    modelem (edycja zawsze wracała do `pending`, czyli niewidoczne) było to
--    nieszkodliwe. Przy publikacji natychmiastowej ten sam upsert w
--    `/api/reviews` publikuje ją z powrotem: autor, któremu Julia zdjęła
--    opinię ze strony, wchodzi na kartę produktu, widzi swój stary tekst do
--    edycji (bo `getReviewStatus` i tak mu go zwraca), klika „Zaktualizuj" —
--    i `rejected` wraca jako `approved`. To rozbraja JEDYNY mechanizm
--    kontroli właścicielki nad tym, co wisi na stronie. `status <> 'rejected'`
--    w `using` blokuje UPDATE zanim RLS w ogóle rozważy nowe wartości wiersza.
-- 2) (W2, ważne) `with check` nie miał warunku zakupu, bo dotąd nie miał
--    znaczenia — update mógł ustawić wyłącznie `pending` (niepubliczne).
--    Teraz update publikuje od razu, więc kupujący, któremu zamówienie
--    później anulowano albo zwrócono pieniądze, mógłby bezpośrednim
--    żądaniem REST (klucz anon jest jawny w paczce przeglądarki, sesja
--    w ciasteczku) podmienić treść WCIĄŻ ISTNIEJĄCEJ własnej opinii i
--    opublikować ją bez żadnej weryfikacji zakupu. Warunek zakupu poniżej
--    jest przepisany DOSŁOWNIE z polityki „reviews: insert po zakupie"
--    w tym samym pliku — nie upraszczaj go z powrotem do samego
--    `auth.uid() = user_id`, bo to właśnie ta „uproszczona" wersja jest
--    usterką W2.
create policy "reviews: update własne"
  on public.product_reviews for update
  to authenticated
  using (auth.uid() = user_id and status <> 'rejected')
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
