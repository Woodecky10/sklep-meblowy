-- supabase/migrations/56_topbar_contact_promo.sql
-- Edycja górnego paska: kontakt (telefon/email) + baner promocyjny.
-- Kolumny na istniejącej jednowierszowej store_settings (id = true).
-- RLS store_settings już ustawione (odczyt publiczny, zapis service_role)
-- — nowe kolumny dziedziczą polityki tabeli. NULL kontaktu = fallback COMPANY.

alter table public.store_settings
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists promo_enabled boolean not null default false,
  add column if not exists promo_text text,
  add column if not exists promo_text_de text,
  add column if not exists promo_link text,
  add column if not exists promo_color text not null default 'gold';

-- Walidacja koloru (idempotentnie: dodaj constraint tylko gdy go nie ma).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_promo_color_check'
  ) then
    alter table public.store_settings
      add constraint store_settings_promo_color_check
      check (promo_color in ('gold','navy','red'));
  end if;
end $$;
