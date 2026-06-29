-- Migracja 40: usunięcie legacy kolumny Stripe. ODPALIĆ DOPIERO po oknie
-- zwrotów/reklamacji ostatniego zamówienia opłaconego Stripe (~30 days after cutover).
-- Do tego czasu kolumna jest źródłem referencji do zwrotów w panelu Stripe.
--
-- Po odpaleniu migracji 40: usunąć stripe_payment_intent z types.ts
-- (Order i OrderInsert) oraz z fallbacku w panelu admina — osobny, późniejszy commit.
--
-- NIE ODPALAĆ TERAZ — poczekaj ~30 dni od daty przełączenia na Przelewy24.
alter table public.orders drop column if exists stripe_payment_intent;
