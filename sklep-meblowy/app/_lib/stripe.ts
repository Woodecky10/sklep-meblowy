import Stripe from "stripe";

// Lazy-init: klient powstaje przy pierwszym użyciu, NIE przy imporcie modułu.
// `next build` (collecting page data) importuje route'y — instancja na
// poziomie modułu wywalała build bez STRIPE_SECRET_KEY w env.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY nie jest ustawiony w env");
    }
    _stripe = new Stripe(key, { typescript: true });
  }
  return _stripe;
}
