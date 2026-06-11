import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/app/_lib/stripe";
import { shouldSettleOrder } from "@/app/_lib/stripe-events";
import { markOrderPaid } from "@/app/_lib/orders";
import { incrementPromoUsage } from "@/app/_lib/promo";
import { pushOrderToBaseLinker } from "@/app/_lib/baselinker-orders";
import { hasCompletedBlPush } from "@/app/_lib/baselinker-orders";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { OrderStatus } from "@/app/_lib/types";

// Rozliczenie FAKTYCZNIE opłaconego zamówienia: dedup eventów Stripe,
// markOrderPaid (CAS), increment promo (zwycięzca claimu), push do BaseLinker.
// Wywoływane tylko gdy shouldSettleOrder()=true (completed+'paid' albo
// async_payment_succeeded). Zwraca NextResponse — 500 sprawia, że Stripe
// ponowi event (przejściowa awaria DB).
//
// Meble robione na zamówienie — nie dekrementujemy stock przy opłacie. Pole
// `stock` zostaje w bazie na wypadek przyszłych towarów „od ręki".
async function settlePaidOrder(
  session: Stripe.Checkout.Session
): Promise<NextResponse> {
  const orderId = session.metadata?.order_id;
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!orderId) {
    console.error("Brak order_id w metadata sesji");
    return NextResponse.json({ received: true });
  }

  // Guard statusu = deduplikacja eventów Stripe. Duplikat eventu nie może
  // podwójnie inkrementować promo, ponownie push'ować do BL ani cofać statusu
  // zamówienia (np. po tym jak admin przestawił na processing/shipped).
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
    const { error: cancelTraceErr } = await supabase
      .from("orders")
      .update({
        stripe_payment_intent: paymentIntent ?? session.id,
        baselinker_push_error:
          "płatność Stripe doszła po anulowaniu zamówienia — wymaga ręcznej obsługi",
      } as never)
      .eq("id", orderId);
    if (cancelTraceErr) {
      // Bez payment_intent nie da się zrobić zwrotu w Stripe — nie wolno
      // zgubić śladu. 500 → Stripe ponowi event (jak ścieżka odczytu wyżej).
      console.error(
        `Webhook: zapis śladu anulowanego-opłaconego ${orderId} nieudany:`,
        cancelTraceErr.message
      );
      return NextResponse.json(
        { error: "Błąd zapisu śladu zamówienia" },
        { status: 500 }
      );
    }
    return NextResponse.json({ received: true });
  }

  // Dedup vs odzyskiwanie: status != pending znaczy "markOrderPaid już
  // przeszedł", ale Stripe retry'uje też po crashu W TRAKCIE handlera
  // (markOrderPaid OK → crash przed pushem do BL). Taki retry MUSI dokończyć
  // push — inaczej opłacone zamówienie nigdy nie trafi do BL. Pomijamy
  // wyłącznie to, co faktycznie się już w pełni wydarzyło.
  if (ord.status !== "pending" && hasCompletedBlPush(ord.baselinker_order_id)) {
    // W pełni przetworzone (duplikat eventu) — idempotentny skip.
    return NextResponse.json({ received: true });
  }

  // Atomowy claim przejścia pending→paid. Przy równoległych duplikatach
  // webhooka TYLKO JEDNO wywołanie dostaje claimedFirst=true (CAS po
  // status='pending'); reszta zaktualizuje 0 wierszy. Dzięki temu increment
  // used_count leci dokładnie raz na zamówienie.
  let claimedFirst = false;
  if (ord.status === "pending") {
    try {
      claimedFirst = await markOrderPaid(orderId, paymentIntent ?? session.id);
    } catch (err) {
      console.error("Błąd przetwarzania webhooka:", err);
      return NextResponse.json(
        { error: "Błąd aktualizacji zamówienia" },
        { status: 500 }
      );
    }
  }

  // Increment used_count tylko dla zwycięzcy claimu (best-effort — nieudany
  // increment nie blokuje webhooka). CAS w markOrderPaid eliminuje podwójne
  // liczenie z duplikatów webhooka. UWAGA: to nadal NIE jest twardy limit —
  // rabat nalicza się przy płatności, a licznik po niej, więc dwa równoległe
  // checkouty tego samego kodu mogą oba go użyć. used_count = miękka
  // statystyka limitu (twardy limit wymagałby rezerwacji przy checkoucie).
  if (claimedFirst && ord.promo_code_id) {
    try {
      await incrementPromoUsage(ord.promo_code_id);
    } catch (err) {
      console.error("[promo] increment used_count nieudany:", err);
    }
  }

  // Push do BaseLinker — best-effort, nie blokuje webhooka jeśli zawiedzie.
  // Nieudany push można zsynchronizować później (cron reconcile-bl).
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

  return NextResponse.json({ received: true });
}

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

  // Rozliczamy zamówienie TYLKO gdy płatność faktycznie doszła. Dla metod
  // async (Przelewy24, część BLIK) checkout.session.completed potrafi przyjść
  // z payment_status='unpaid' ZANIM wpłyną środki — wtedy czekamy na osobny
  // event checkout.session.async_payment_succeeded. Bez tej bramki drogi mebel
  // na zamówienie ruszał do realizacji przed zapłatą.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!shouldSettleOrder(event.type, session.payment_status)) {
      console.log(
        `Webhook: sesja ${session.id} (zamówienie ${session.metadata?.order_id ?? "?"}) jeszcze nieopłacona (payment_status=${session.payment_status}) — czekam na async_payment_succeeded`
      );
      return NextResponse.json({ received: true });
    }
    return await settlePaidOrder(session);
  }

  // Async płatność (P24/BLIK) nie powiodła się — zamówienie nigdy nie zostało
  // oznaczone paid, więc zostaje pending. Zostaw głośny ślad w logach.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.error(
      `Webhook: async płatność NIEUDANA dla zamówienia ${session.metadata?.order_id ?? "?"} (sesja ${session.id}) — zamówienie zostaje pending`
    );
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
