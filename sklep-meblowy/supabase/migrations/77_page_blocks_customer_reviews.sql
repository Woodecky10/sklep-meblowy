-- Migracja 77: sekcja „Opinie klientów" jako blok systemowy strony głównej.
--
-- Bloki systemowe z migracji 52 są wierszami page_blocks — panel zapisuje je
-- po UUID (updateSystemBlockHeadings / toggle widoczności / reorder_page_blocks).
-- Nowy typ `customer_reviews` renderuje się bez wiersza (mergeHomeBlocks
-- dokłada default z kodu), ale dopóki wiersza nie ma, panel odmawia zapisu
-- komunikatem „Sekcja nie ma jeszcze wpisu w bazie".
--
-- Na koniec listy, bo slider opinii ma stać POD dotychczasowymi sekcjami
-- (spec 2026-08-18, „Strona główna — slider"). Kolejność Julia zmieni
-- przeciąganiem w /admin/strona-glowna.
--
-- Idempotentne: NOT EXISTS na (page_id is null, block_type). Projekt aplikuje
-- migracje ręcznie i ma niepełny rejestr, więc plik bywa odpalany drugi raz —
-- drugie odpalenie nie może zdublować sekcji ani nadpisać nagłówka zmienionego
-- w panelu.
insert into public.page_blocks (page_id, block_type, sort_order, visible, content)
select
  null,
  'customer_reviews',
  coalesce((select max(sort_order) + 1 from public.page_blocks where page_id is null), 0),
  true,
  jsonb_build_object(
    'heading',       'Co mówią klienci',
    'heading_de',    'Was unsere Kunden sagen',
    'subheading',    'Opinie klientów',
    'subheading_de', 'Kundenmeinungen'
  )
where not exists (
  select 1 from public.page_blocks
   where page_id is null and block_type = 'customer_reviews'
);
