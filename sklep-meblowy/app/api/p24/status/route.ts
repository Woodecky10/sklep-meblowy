import { NextResponse, type NextRequest } from "next/server";
import { getP24Config, verifyTransaction } from "@/app/_lib/p24";
import { isValidNotification, type P24Notification } from "@/app/_lib/p24-events";
import { markOrderPaid } from "@/app/_lib/orders";
import { incrementPromoUsage } from "@/app/_lib/promo";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { OrderStatus } from "@/app/_lib/types";

// Oczekiwana kwota transakcji w groszach/eurocentach z total zamówienia
// (jednostki główne). Wydzielone do testu.
export function expectedVerifyAmount(orderTotal: number): number {
  return Math.round(orderTotal * 100);
}

export async function POST(request: NextRequest) {
  const cfg = getP24Config();

  let n: P24Notification;
  try {
    n = (await request.json()) as P24Notification;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // BRAMKA 1: podpis notyfikacji (endpoint publiczny — odrzucamy obce POST-y).
  if (!isValidNotification(n, cfg.crc)) {
    console.error(`P24 status: niezgodny podpis notyfikacji (sessionId=${n.sessionId})`);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  // sessionId == order.id (ustawiane w checkoucie).
  const orderId = n.sessionId;
  const supabase = await createAdminClient();
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("id, status, promo_code_id, total, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    console.error("P24 status: błąd odczytu zamówienia:", orderErr.message);
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }
  if (!orderRow) {
    console.error(`P24 status: zamówienie ${orderId} nie istnieje`);
    return NextResponse.json({ received: true });
  }

  const ord = orderRow as unknown as {
    status: OrderStatus;
    promo_code_id: string | null;
    total: number;
    currency: "pln" | "eur";
  };

  // Anulowane, a płatność doszła — ślad do ręcznej obsługi (jak w Stripe).
  if (ord.status === "cancelled") {
    console.error(`P24 status: płatność za ANULOWANE zamówienie ${orderId} — ręczna obsługa`);
    const { error: cancelTraceErr } = await supabase
      .from("orders")
      .update({
        payment_ref: String(n.orderId),
        payment_provider: "p24",
        admin_note: "płatność P24 doszła po anulowaniu — wymaga ręcznej obsługi (zwrot/przywrócenie)",
      } as never)
      .eq("id", orderId);
    if (cancelTraceErr) {
      // Bez payment_ref nie da się zidentyfikować transakcji do zwrotu — nie wolno
      // zgubić śladu. 500 → P24 ponowi notyfikację (parytet z webhookiem Stripe).
      console.error(
        `P24 status: zapis śladu anulowanego-opłaconego ${orderId} nieudany:`,
        cancelTraceErr.message
      );
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  // Dedup: już rozliczone → idempotentnie OK.
  if (ord.status !== "pending") {
    return NextResponse.json({ received: true });
  }

  // BRAMKA 2 (autorytatywna): asercja kwoty i waluty przed verify.
  const expectedAmount = expectedVerifyAmount(Number(ord.total));
  const expectedCurrency = ord.currency.toUpperCase() as "PLN" | "EUR";
  if (n.amount !== expectedAmount || n.currency !== expectedCurrency) {
    console.error(
      `P24 status: NIEZGODNA kwota/waluta dla ${orderId} (notif ${n.amount}/${n.currency} vs oczek. ${expectedAmount}/${expectedCurrency}) — NIE rozliczam`
    );
    await supabase
      .from("orders")
      .update({ admin_note: `P24: niezgodna kwota/waluta (${n.amount}/${n.currency}) — weryfikacja ręczna` } as never)
      .eq("id", orderId);
    return NextResponse.json({ received: true });
  }

  const verified = await verifyTransaction({
    sessionId: orderId,
    orderId: n.orderId,
    amount: expectedAmount,
    currency: expectedCurrency,
  });
  if (!verified) {
    console.error(`P24 status: verify nieudany dla ${orderId} — zostaje pending`);
    return NextResponse.json({ received: true });
  }

  // Atomowy claim pending→paid (zwycięzca incrementuje promo).
  let claimedFirst = false;
  try {
    claimedFirst = await markOrderPaid(orderId, String(n.orderId));
  } catch (err) {
    console.error("P24 status: błąd markOrderPaid:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }

  if (claimedFirst && ord.promo_code_id) {
    try {
      await incrementPromoUsage(ord.promo_code_id);
    } catch (err) {
      console.error("[promo] increment used_count nieudany:", err);
    }
  }

  return NextResponse.json({ received: true });
}
