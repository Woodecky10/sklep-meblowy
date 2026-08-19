-- ============================================================
-- Migracja 80: autor nie może usunąć opinii ZDJĘTEJ ze strony
-- ============================================================
-- Migracja 78 zamknęła ścieżkę UPDATE (`status <> 'rejected'` w `using`), ale
-- polityka DELETE pochodzi jeszcze z migracji 06 i nie zna pojęcia statusu.
-- Przy publikacji natychmiastowej to wystarczy, żeby cofnąć decyzję
-- właścicielki: autor kasuje odrzuconą opinię jednym kliknięciem w karcie
-- produktu i pisze ją od nowa, dokładając te same zdjęcia (pliki zostają
-- w Storage, więc ich URL-e nadal przechodzą walidację prefiksu). Opinia
-- `rejected` i tak NIE jest publiczna, więc zablokowanie jej usunięcia
-- niczego autorowi nie zabiera — odbiera tylko możliwość zrobienia miejsca
-- na kolejną publikację tej samej treści.
--
-- Osobna migracja, a NIE dopisek do 78: 78 może zostać zaaplikowana wcześniej
-- (obie czekają na decyzję właściciela), a wtedy dopisek nigdy by się nie wykonał.
drop policy if exists "reviews: delete własne" on public.product_reviews;

create policy "reviews: delete własne"
  on public.product_reviews for delete
  to authenticated
  using (auth.uid() = user_id and status <> 'rejected');
