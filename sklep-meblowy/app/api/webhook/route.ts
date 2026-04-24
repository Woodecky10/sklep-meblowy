import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/app/_lib/stripe";
import { markOrderPaid } from "@/app/_lib/orders";

// Meble robione na zamówienie — nie dekrementujemy stock przy opłacie.
// Pole `stock` w produktach zostaje w bazie na wypadek przyszłych towarów
// „od ręki", ale obecnie nie jest używane w żadnym flow.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Brak podpisu" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Nieprawidłowy podpis";
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

    if (!orderId) {
      console.error("Brak order_id w metadata sesji");
      return NextResponse.json({ received: true });
    }

    try {
      await markOrderPaid(orderId, paymentIntent ?? session.id);
    } catch (err) {
      console.error("Błąd przetwarzania webhooka:", err);
      return NextResponse.json(
        { error: "Błąd aktualizacji zamówienia" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
