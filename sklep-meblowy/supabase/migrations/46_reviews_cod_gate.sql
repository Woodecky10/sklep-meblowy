-- ============================================================
-- Migracja 46: zamknięcie dziury w weryfikacji zakupu dla COD
-- ============================================================
-- Zamówienia COD (payment_method='cod') dostają status 'processing' ZANIM
-- klient zapłaci (płatność za pobraniem następuje przy odbiorze) — w
-- przeciwieństwie do zamówień 'online', gdzie 'processing' oznacza już
-- opłacone. Bez tej poprawki każdy mógł złożyć darmowe zamówienie COD i od
-- razu wystawić "zweryfikowaną" opinię, mimo że nic nie zapłacił — nie jest
-- to dowód zakupu. Dla COD zweryfikowany zakup liczy się dopiero od
-- 'shipped' (towar faktycznie wysłany/wydany). Dla 'online' bez zmian.
-- Zgodność z dyrektywą Omnibus: opinie pochodzą wyłącznie od osób, które
-- rzeczywiście kupiły produkt.

drop policy if exists "reviews: insert po zakupie" on public.product_reviews;

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
        and (
          (o.payment_method = 'online' and o.status in ('paid','processing','shipped','delivered'))
          or (o.payment_method = 'cod' and o.status in ('shipped','delivered'))
        )
    )
  );
