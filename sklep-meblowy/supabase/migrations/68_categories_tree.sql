-- Migracja 68: kategorie jako jedno drzewo bez limitu głębokości.
-- Spec: docs/superpowers/specs/2026-08-04-podkategorie-drzewo-design.md
--
-- Dwa poziomy były zaszyte w schemacie: category_groups (pasek) + categories
-- (rozwijana lista). Po tej migracji jest JEDNO drzewo w categories z parent_id,
-- a produkt może wisieć na dowolnym węźle.
--
-- MODEL EXPAND-FIRST (jak migracja 67): group_id i tabela category_groups
-- ZOSTAJĄ nietknięte jako martwy balast. Kod przestaje je czytać, ale cofnięcie
-- deployu nie wywala sklepu. Sprzątanie = osobna migracja 69, dopiero gdy nowa
-- wersja posiedzi na produkcji.

-- ============================================================
-- 1. Pole rodzica
-- ============================================================
-- on delete restrict jak products_category_fk: usunięcie węzła z dziećmi ma
-- blokować baza, nie tylko UI panelu.
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete restrict;

create index if not exists idx_categories_parent on public.categories (parent_id);

-- Węzeł najwyższego poziomu nie należy do żadnej grupy.
alter table public.categories alter column group_id drop not null;

-- ============================================================
-- 2. Kolizje slugów — PRZED wstawieniem grup
-- ============================================================
-- slug jest unikalny w całej tabeli, a trzy grupy mają dziś slug identyczny ze
-- slugiem istniejącej kategorii: materace, pufy, schodki-dla-pupila.
--
-- materace  → kategoria „Materace kieszeniowe" (slug rozjechany z etykietą)
-- pufy      → kategoria „Narożnik w kształcie U" (slug z migracji 09 to naroznik-u)
-- schodki-dla-pupila → grupa i kategoria mają tę SAMĄ nazwę (nagłówek-atrapa)
--                      → grupa nie tworzy węzła, patrz krok 3.
--
-- products.category jedzie samo: products_category_fk ma on update cascade.
-- Warunek `where slug = ...` jest sam z siebie idempotentny.
update public.categories set slug = 'materace-kieszeniowe' where slug = 'materace';
update public.categories set slug = 'naroznik-u'           where slug = 'pufy';

-- cross_sell_categories to TABLICA slugów (text[] not null default '{}',
-- migracja 16) i żaden FK jej nie pilnuje. Bez tego dobór materaca do łóżka
-- przestaje proponować kieszeniowe i NIE zgłasza błędu — sekcja „Polecane
-- materace" po prostu robi się pusta.
update public.categories
   set cross_sell_categories = array_replace(cross_sell_categories, 'materace', 'materace-kieszeniowe')
 where 'materace' = any(cross_sell_categories);

update public.categories
   set cross_sell_categories = array_replace(cross_sell_categories, 'pufy', 'naroznik-u')
 where 'pufy' = any(cross_sell_categories);

-- ============================================================
-- 3. Grupy → węzły najwyższego poziomu
-- ============================================================
-- GUARD wzorem migracji 66: projekt aplikuje migracje ręcznie i ma niepełny
-- rejestr, więc plik może zostać odpalony ponownie. Bez guarda drugie odpalenie
-- przestawiłoby układ zrobiony przeciąganiem w panelu z powrotem na ten sprzed
-- migracji.
do $$
begin
  if exists (select 1 from public.categories where parent_id is not null) then
    raise notice 'Drzewo kategorii jest juz zbudowane - backfill pominiety';
    return;
  end if;

  -- Grupa, której slug pokrywa się ze slugiem istniejącej kategorii, NIE tworzy
  -- węzła (dziś: schodki-dla-pupila). Kategoria zostaje na najwyższym poziomie.
  -- needs_translation/translated_at jadą razem (obie tabele mają te kolumny od
  -- migracji 29) — inaczej przetłumaczona grupa wraca jako „do tłumaczenia".
  insert into public.categories
    (slug, label, label_de, parent_id, sort_order, active, needs_translation, translated_at)
  select g.slug, g.label, g.label_de, null, g.sort_order, g.active,
         g.needs_translation, g.translated_at
    from public.category_groups g
   where not exists (select 1 from public.categories c where c.slug = g.slug);

  -- Kategoria, której grupa nie dostała węzła, zostaje z parent_id = null.
  update public.categories c
     set parent_id = p.id
    from public.category_groups g
    join public.categories p on p.slug = g.slug and p.parent_id is null
   where c.group_id = g.id
     and c.id <> p.id;
end $$;

-- ============================================================
-- 4. Brak cykli
-- ============================================================
-- Bez tego pole „Rodzic" w panelu jednym zapisem odcina gałąź od drzewa,
-- a każdy przebieg po ścieżce w górę (okruszki, efektywna widoczność) wisi.
create or replace function public.categories_no_cycle()
returns trigger language plpgsql as $$
declare
  cur  uuid := new.parent_id;
  hops int  := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Kategoria nie moze byc swoim wlasnym rodzicem';
  end if;

  while cur is not null loop
    if cur = new.id then
      raise exception 'Cykl w drzewie kategorii';
    end if;
    select parent_id into cur from public.categories where id = cur;
    hops := hops + 1;
    if hops > 50 then
      raise exception 'Drzewo kategorii zbyt glebokie (mozliwy cykl)';
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_categories_no_cycle on public.categories;
create trigger trg_categories_no_cycle
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_no_cycle();

-- ============================================================
-- 5. Atomowy reorder wśród rodzeństwa
-- ============================================================
-- 1:1 wzorem reorder_collections (migracja 66). Pętla UPDATE po jednym wierszu
-- przy padzie w połowie zostawia rodzeństwo z pomieszanymi numerami.
--
-- `is not distinct from` jest nośne: dla najwyższego poziomu p_parent jest null,
-- a `c.parent_id = null` nigdy nie jest prawdą — bez tego przeciąganie na
-- najwyższym poziomie zapisywałoby ciszę. Klauzula jest jednocześnie
-- zabezpieczeniem: żądanie z id z innej gałęzi nie przestawi niczego.
create or replace function public.reorder_categories(p_parent uuid, p_ids uuid[])
returns void language sql as $$
  update public.categories c
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id
     and c.parent_id is not distinct from p_parent;
$$;

revoke execute on function public.reorder_categories(uuid, uuid[]) from public;
grant  execute on function public.reorder_categories(uuid, uuid[]) to service_role;
