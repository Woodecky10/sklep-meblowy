-- Migracja 84: produkt w kilku kategoriach (spec
-- docs/superpowers/specs/2026-10-15-produkt-w-wielu-kategoriach-design.md).
--
-- `products.category` zostaje kategorią GŁÓWNĄ (okruszki, feed Google,
-- podobne, cross-sell). `extra_categories` mówi tylko, na których listach
-- produkt pojawia się DODATKOWO. Prośba właściciela 2026-10-15: pracownik
-- założył zakładkę „Szybka dostawa" i nie mógł do niej dopiąć produktów, bo
-- każdy ma już swoją kategorię.
--
-- Tablica nie może mieć klucza obcego, więc trzy jego zachowania odtwarzają
-- triggery: sprawdzenie istnienia (zamiast FK), zmiana sluga (zamiast
-- ON UPDATE CASCADE) i usunięcie kategorii — dodatkowa NIE blokuje, slug
-- znika z tablic; główna nadal blokuje przez products_category_fk RESTRICT.
--
-- Idempotentna: projekt aplikuje migracje ręcznie i plik bywa odpalany
-- drugi raz.

alter table public.products
  add column if not exists extra_categories text[] not null default '{}';

-- Filtr listingu: extra_categories && array[...] (operator `ov` w PostgREST).
create index if not exists idx_products_extra_categories
  on public.products using gin (extra_categories);

-- ============================================================
-- 1. Istnienie slugów (zamiast klucza obcego)
-- ============================================================
create or replace function public.products_extra_categories_check()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1
      from unnest(new.extra_categories) as s
     where s is null
        or not exists (select 1 from public.categories c where c.slug = s)
  ) then
    raise exception 'Nieznana kategoria dodatkowa w %', new.extra_categories;
  end if;
  return new;
end $$;

drop trigger if exists trg_products_extra_categories_check on public.products;
create trigger trg_products_extra_categories_check
  before insert or update of extra_categories on public.products
  for each row execute function public.products_extra_categories_check();

-- ============================================================
-- 2. Zmiana sluga kategorii (zamiast ON UPDATE CASCADE)
-- ============================================================
-- Aplikacja nie zmienia slugów (updateCategory nie rusza `slug`), ale zmiana
-- zrobiona w SQL kaskaduje po FK na `products.category` — tablica ma iść
-- za nią, inaczej trigger z punktu 1 zablokowałby każdy kolejny zapis
-- produktu z „osieroconym" slugiem.
create or replace function public.categories_slug_to_extra()
returns trigger language plpgsql as $$
begin
  update public.products
     set extra_categories = array_replace(extra_categories, old.slug, new.slug)
   where extra_categories @> array[old.slug];
  return null;
end $$;

drop trigger if exists trg_categories_slug_to_extra on public.categories;
create trigger trg_categories_slug_to_extra
  after update of slug on public.categories
  for each row when (old.slug is distinct from new.slug)
  execute function public.categories_slug_to_extra();

-- ============================================================
-- 3. Usunięcie kategorii: dodatkowa nie blokuje
-- ============================================================
-- BEFORE DELETE: jeśli usunięcie i tak padnie (dzieci, produkty z tą
-- kategorią jako główną → FK RESTRICT), transakcja cofa też array_remove.
create or replace function public.categories_delete_from_extra()
returns trigger language plpgsql as $$
begin
  update public.products
     set extra_categories = array_remove(extra_categories, old.slug)
   where extra_categories @> array[old.slug];
  return old;
end $$;

drop trigger if exists trg_categories_delete_from_extra on public.categories;
create trigger trg_categories_delete_from_extra
  before delete on public.categories
  for each row execute function public.categories_delete_from_extra();
