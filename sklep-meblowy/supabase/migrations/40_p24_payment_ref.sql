-- Migracja 40: bezpośrednia integracja Przelewy24 (expand-contract).
-- Addytywna i BEZPIECZNA przy żywym kodzie Stripe — nie rusza stripe_payment_intent.
-- Stara kolumna zostanie usunięta osobną migracją 41 po oknie zwrotów Stripe.
alter table public.orders add column if not exists payment_ref text;
alter table public.orders add column if not exists payment_provider text;

-- Backfill: istniejące opłacone zamówienia pochodzą ze Stripe. Spójny odczyt w panelu.
update public.orders
  set payment_provider = 'stripe',
      payment_ref = stripe_payment_intent
  where stripe_payment_intent is not null
    and payment_ref is null;
