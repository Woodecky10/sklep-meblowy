-- ============================================================
-- Migracja 12: bucket "products" do uploadu zdjęć produktów
-- ============================================================
-- Po tej migracji admin może wgrywać zdjęcia produktów (globalna galeria
-- + zdjęcia per wariant) do storage bucketa 'products'. Bucket jest public
-- (zdjęcia widoczne dla wszystkich), zapis tylko dla roli admin.
--
-- URL-e zewnętrzne dalej mogą trafiać do
-- products.images / variants.combinations[].images — bez zmian.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'products: public read'
  ) then
    create policy "products: public read"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'products');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'products: admin upload'
  ) then
    create policy "products: admin upload"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'products'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'products: admin update'
  ) then
    create policy "products: admin update"
      on storage.objects for update
      to authenticated
      using (
        bucket_id = 'products'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'products: admin delete'
  ) then
    create policy "products: admin delete"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'products'
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;
end $$;
