-- Migracja 44: normalizacja pól delivery_time i warranty produktów.
-- Import z BaseLinkera zostawił niespójne/surowe wartości ("21", "2", "2 lat",
-- "21 dni"), które renderowały się dosłownie na karcie produktu zamiast
-- "21 dni roboczych" / "2 lata" i nie tłumaczyły się poprawnie na /de.
--
-- Kanonizujemy do formatu obsługiwanego przez mapy DE (de-content-maps) i
-- WYPEŁNIAMY też puste pola (decyzja: każdy produkt ma jawne wartości).
-- Odtąd auto-normalizacja w admin/produkty/actions pilnuje formatu przy zapisie.
-- Idempotentna — ponowne uruchomienie niczego nie zmieni.

-- delivery_time → "28 dni roboczych" (zachowujemy dłuższy czas tam gdzie ustawiony)
update public.products
set delivery_time = '28 dni roboczych'
where delivery_time in ('28', '28 dni', '28 dni roboczych');

-- delivery_time → "21 dni roboczych" (puste + warianty "21")
update public.products
set delivery_time = '21 dni roboczych'
where delivery_time is null
   or delivery_time in ('21', '21 dni', '21 dni roboczych');

-- warranty → "2 lata" (puste + warianty "2"/"2 lat", poprawna polska odmiana)
update public.products
set warranty = '2 lata'
where warranty is null
   or warranty in ('2', '2 lat', '2 lata');
