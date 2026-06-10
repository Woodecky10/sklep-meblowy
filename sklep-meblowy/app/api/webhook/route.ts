import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/app/_lib/stripe";
import { markOrderPaid } from "@/app/_lib/orders";
import { incrementPromoUsage } from "@/app/_lib/promo";
import { pushOrderToBaseLinker } from "@/app/_lib/baselinker-orders";
import { hasCompletedBlPush } from "@/app/_lib/baselinker-orders";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { OrderStatus } from "@/app/_lib/types";

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
    event = getStripe().webhooks.constructEvent(
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

    // Guard statusu = deduplikacja eventów Stripe. Duplikat
    // checkout.session.completed nie może podwójnie inkrementować promo,
    // ponownie push'ować do BL ani cofać statusu zamówienia (np. po tym
    // jak admin przestawił na processing/shipped).
    const supabase = await createAdminClient();
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, promo_code_id, baselinker_order_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("Błąd odczytu zamówienia w webhooku:", orderErr.message);
      // 500 → Stripe ponowi event (przejściowa awaria DB).
      return NextResponse.json(
        { error: "Błąd odczytu zamówienia" },
        { status: 500 }
      );
    }
    if (!orderRow) {
      console.error(`Webhook: zamówienie ${orderId} nie istnieje`);
      return NextResponse.json({ received: true });
    }

    const ord = orderRow as unknown as {
      status: OrderStatus;
      promo_code_id: string | null;
      baselinker_order_id: string | null;
    };

    if (ord.status === "cancelled") {
      // Klient anulował, a płatność i tak doszła — wymaga ręcznej obsługi
      // (zwrot albo przywrócenie zamówienia). Zostawiamy trwały ślad +
      // payment_intent, bez którego nie da się łatwo zrobić zwrotu w Stripe.
      console.error(
        `Webhook: płatność za ANULOWANE zamówienie ${orderId} — wymaga ręcznej obsługi (zwrot/przywrócenie)`
      );
      await supabase
        .from("orders")
        .update({
          stripe_payment_intent: paymentIntent ?? session.id,
          baselinker_push_error:
            "płatność Stripe doszła po anulowaniu zamówienia — wymaga ręcznej obsługi",
        } as never)
        .eq("id", orderId);
      return NextResponse.json({ received: true });
    }

    // Dedup vs odzyskiwanie: status != pending znaczy "markOrderPaid już
    // przeszedł", ale Stripe retry'uje też po crashu W TRAKCIE handlera
    // (markOrderPaid OK → crash przed pushem do BL). Taki retry MUSI dokończyć
    // push — inaczej opłacone zamówienie nigdy nie trafi do BL. Pomijamy
    // wyłącznie to, co faktycznie się już wydarzyło.
    const isFirstProcessing = ord.status === "pending";
    if (!isFirstProcessing && hasCompletedBlPush(ord.baselinker_order_id)) {
      // W pełni przetworzone (duplikat eventu) — idempotentny skip.
      return NextResponse.json({ received: true });
    }

    if (isFirstProcessing) {
      try {
        await markOrderPaid(orderId, paymentIntent ?? session.id);
      } catch (err) {
        console.error("Błąd przetwarzania webhooka:", err);
        return NextResponse.json(
          { error: "Błąd aktualizacji zamówienia" },
          { status: 500 }
        );
      }

      // Increment used_count dla kodu rabatowego, jeśli zamówienie go używało.
      // Best-effort — nieudany increment nie blokuje webhooka. Tylko przy
      // pierwszym przetworzeniu (retry po częściowym crashu nie może
      // inkrementować drugi raz; ewentualna strata inkrementu przy crashu
      // dokładnie między markOrderPaid a tym wywołaniem jest akceptowalna —
      // used_count to statystyka limitu, nie księgowość).
      try {
        if (ord.promo_code_id) {
          await incrementPromoUsage(ord.promo_code_id);
        }
      } catch (err) {
        console.error("[promo] increment used_count nieudany:", err);
      }
    }

    // Push do BaseLinker — best-effort, nie blokuje webhooka jeśli zawiedzie.
    // Nieudany push można zsynchronizować później (cron w kroku sync statusów).
    try {
      const result = await pushOrderToBaseLinker(orderId);
      if (result.baselinker_order_id) {
        console.log(
          `[BL] order ${orderId} → BaseLinker order_id=${result.baselinker_order_id}`
        );
      } else {
        console.warn(`[BL] push pominięty: ${result.reason}`);
      }
    } catch (err) {
      console.error("[BL] push do BaseLinker nieudany:", err);
    }
  }

  return NextResponse.json({ received: true });
}
