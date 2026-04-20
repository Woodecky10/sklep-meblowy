import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/app/_lib/stripe";
import { markOrderPaid } from "@/app/_lib/orders";
import { createAdminClient } from "@/app/_lib/supabase/server";

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

      // Zmniejsz stany magazynowe
      const supabase = await createAdminClient();
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .eq("order_id", orderId);

      type ItemRow = { product_id: string; quantity: number };
      for (const item of (items ?? []) as ItemRow[]) {
        const { data: product } = await supabase
          .from("products")
          .select("stock")
          .eq("id", item.product_id)
          .single();
        const currentStock = (product as { stock: number } | null)?.stock ?? 0;
        await supabase
          .from("products")
          .update({ stock: Math.max(0, currentStock - item.quantity) } as never)
          .eq("id", item.product_id);
      }
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
