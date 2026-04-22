import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/app/_lib/stripe";
import { markOrderPaid } from "@/app/_lib/orders";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { ProductVariants } from "@/app/_lib/types";

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

      const supabase = await createAdminClient();
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, quantity, variant_values")
        .eq("order_id", orderId);

      type ItemRow = {
        product_id: string;
        quantity: number;
        variant_values: Record<string, string> | null;
      };

      // Dekrement stocku — dla wariantów: stock w konkretnej kombinacji w jsonb +
      // równolegle product.stock (które trzymamy jako sumę). Dla produktów bez
      // wariantów: tylko product.stock.
      for (const item of (items ?? []) as ItemRow[]) {
        const { data: product } = await supabase
          .from("products")
          .select("stock, variants")
          .eq("id", item.product_id)
          .single();

        if (!product) continue;
        const row = product as {
          stock: number;
          variants: ProductVariants | null;
        };

        const newStock = Math.max(0, row.stock - item.quantity);

        if (row.variants && item.variant_values) {
          const optionNames = row.variants.options.map((o) => o.name);
          const updatedCombinations = row.variants.combinations.map((c) => {
            const matches = optionNames.every(
              (n) => c.values[n] === item.variant_values![n]
            );
            return matches
              ? { ...c, stock: Math.max(0, c.stock - item.quantity) }
              : c;
          });

          await supabase
            .from("products")
            .update({
              stock: newStock,
              variants: { ...row.variants, combinations: updatedCombinations },
            } as never)
            .eq("id", item.product_id);
        } else {
          await supabase
            .from("products")
            .update({ stock: newStock } as never)
            .eq("id", item.product_id);
        }
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
