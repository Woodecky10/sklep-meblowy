-- Migracja 82: sekcja „Zestawy mebli" jako blok systemowy strony głównej
-- (typ `bundles`, kod z 2026-09-15: lista /zestawy + kafelki na home).
--
-- Jak w migracji 77: nowy typ renderuje się bez wiersza (mergeHomeBlocks
-- dokłada default z kodu — tu WIDOCZNY od startu, bo sekcję zamówił właściciel
-- wprost), ale panel zapisuje bloki po UUID — bez realnego wiersza toggle,
-- nagłówki i reorder odmawiają komunikatem „Sekcja nie ma jeszcze wpisu w bazie".
--
-- Pozycja: TUŻ POD „Nasze kolekcje" (właściciel: „na głównej pokazać podobnie
-- jak kolekcje"). Sąsiadów poniżej przesuwamy o 1 — indeks (page_id, sort_order)
-- z migracji 52 NIE jest unikalny, więc jeden UPDATE wystarczy. Gdyby wiersza
-- kolekcji nie było, sekcja ląduje na końcu listy.
--
-- Idempotentne: NOT EXISTS na (page_id is null, block_type) — projekt aplikuje
-- migracje ręcznie i ma niepełny rejestr, więc plik bywa odpalany drugi raz;
-- drugie odpalenie nie zdubluje sekcji ani nie przesunie sąsiadów ponownie.
do $$
declare
  after_pos int;
begin
  if exists (
    select 1 from public.page_blocks
     where page_id is null and block_type = 'bundles'
  ) then
    return;
  end if;

  select sort_order into after_pos
    from public.page_blocks
   where page_id is null and block_type = 'collections'
   order by sort_order
   limit 1;

  if after_pos is null then
    after_pos := coalesce(
      (select max(sort_order) from public.page_blocks where page_id is null),
      -1
    );
  else
    update public.page_blocks
       set sort_order = sort_order + 1
     where page_id is null and sort_order > after_pos;
  end if;

  insert into public.page_blocks (page_id, block_type, sort_order, visible, content)
  values (
    null,
    'bundles',
    after_pos + 1,
    true,
    jsonb_build_object(
      'heading',       'Zestawy mebli',
      'heading_de',    'Möbel-Sets',
      'subheading',    'W zestawie taniej',
      'subheading_de', 'Im Set günstiger'
    )
  );
end
$$;
