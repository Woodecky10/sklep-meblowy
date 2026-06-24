// Logika routingu eventów Stripe — czysta, testowalna osobno od route handlera.

// Czy dany event Stripe oznacza, że zamówienie jest FAKTYCZNIE opłacone i można
// je rozliczyć (markOrderPaid)?
//
// Pułapka: dla metod z opóźnionym powiadomieniem (Przelewy24, część BLIK)
// `checkout.session.completed` przychodzi JUŻ po potwierdzeniu w bramce, ale z
// `payment_status='unpaid'` — środki jeszcze NIE wpłynęły. Autorytatywne
// potwierdzenie async to osobny event `checkout.session.async_payment_succeeded`.
// Bez tej bramki drogi mebel na zamówienie ruszał do realizacji przed zapłatą.
export function shouldSettleOrder(
  eventType: string,
  paymentStatus: string | null | undefined
): boolean {
  // Async sukces jest autorytatywny — Stripe wysyła go tylko po wpłacie środków.
  if (eventType === "checkout.session.async_payment_succeeded") return true;
  // Sync (np. karta): completed jest wiarygodne tylko gdy payment_status='paid'.
  if (eventType === "checkout.session.completed") return paymentStatus === "paid";
  return false;
}
