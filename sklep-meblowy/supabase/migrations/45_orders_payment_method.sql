-- Migracja 45: metoda płatności zamówienia (online = Stripe, cod = pobranie).
-- Ortogonalna do statusu realizacji — dlatego kolumna, nie nowy status.
-- Historyczne zamówienia były wyłącznie online → default pokrywa backfill.
alter table public.orders
  add column payment_method text not null default 'online'
    check (payment_method in ('online','cod'));
