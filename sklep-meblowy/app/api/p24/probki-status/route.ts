import { NextResponse, after, type NextRequest } from "next/server";
import {
  notifyAdminNewSampleOrder,
  notifyCustomerSampleOrder,
} from "@/app/_lib/mail/sample-notify";
import { getP24Config, verifyTransaction } from "@/app/_lib/p24";
import { isValidNotification, type P24Notification } from "@/app/_lib/p24-events";
import { markSampleOrderPaid } from "@/app/_lib/samples";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { SampleOrderStatus, SamplePaymentStatus } from "@/app/_lib/types";

// ⚠️ OSOBNA TRASA, a nie gałąź w /api/p24/status. Tamten handler ma wprost
// zaszyte założenie „sessionId == orders.id" i szuka wiersza w `orders` —
// notyfikacja za próbki wpadłaby tam, nie znalazła zamówienia, zalogowała
// „zamówienie nie istnieje" i odpowiedziała 200. Klient zapłaciłby, a zamówienie
// zostałoby `pending` na zawsze. Adres tej trasy MUSI się zgadzać co do znaku
// z `urlStatus` z app/_lib/sample-p24.ts — literówka daje CICHĄ awarię (POST na
// nieistniejącą ścieżkę pod /api/ oddaje w tym Next-cie stronę not-found jako
// odpowiedź strumieniowaną, czyli HTTP 200; P24 uzna notyfikację za dostarczoną
// i NIE ponowi). Pilnuje tego `npm run p24:smoke -- <adres wdrożenia>`.
//
// Kolejność kroków i komunikaty logów są celowo bliźniacze z /api/p24/status:
// podpis → istnienie zamówienia → dedup → kwota i waluta → verify → rozliczenie.
export const maxDuration = 30;

// Oczekiwana kwota notyfikacji w GROSZACH. `sample_orders.amount_total` jest
// w ZŁOTYCH (numeric(10,2), migracja 67), a P24 przysyła grosze — bez tego
// przeliczenia „15 zł" zderzyłoby się z „1500" i żadna płatność nigdy by się
// nie rozliczyła. Wydzielone do testu; NIE importujemy odpowiednika z trasy
// mebli, bo pociągnęłoby to za sobą orders/promo/maile przy każdej notyfikacji.
export function expectedSampleAmount(amountTotal: number): number {
  return Math.round(amountTotal * 100);
}

export async function POST(request: NextRequest) {
  const cfg = getP24Config();

  let n: P24Notification;
  try {
    n = (await request.json()) as P24Notification;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  // `null` i `"tekst"` też są poprawnym JSON-em — bez tej bramki poleciałby
  // TypeError z wnętrza podpisu, czyli 500 i pętla ponowień P24 po śmieciach.
  if (!n || typeof n !== "object") {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // BRAMKA 1: podpis notyfikacji (endpoint publiczny — odrzucamy obce POST-y).
  if (!isValidNotification(n, cfg.crc)) {
    console.error(`P24 probki: niezgodny podpis notyfikacji (sessionId=${n.sessionId})`);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  // sessionId == sample_orders.id (ustawiane w buildSampleP24Params).
  const orderId = n.sessionId;

  // ⚠️ WIERSZ CZYTAMY WPROST, tak jak /api/p24/status czyta `orders` — a NIE
  // przez getSampleOrderById. Helper połyka błąd odczytu i zwraca `null`
  // identycznie jak przy nieistniejącym zamówieniu, a te dwie sytuacje muszą dać
  // RÓŻNE odpowiedzi: awaria bazy → 500 (P24 ponowi), brak wiersza → 200 (nie ma
  // czego ponawiać). Sklejenie ich znaczyłoby, że chwilowy błąd Supabase kasuje
  // ponowienie i wpłata przepada bez rozliczenia. Przy okazji nie ciągniemy
  // joinu z pozycjami, którego rozliczenie nie używa.
  const supabase = await createAdminClient();
  const { data: orderRow, error: orderErr } = await supabase
    .from("sample_orders")
    .select("status, payment_status, amount_total")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr) {
    console.error(
      `P24 probki: błąd odczytu zamówienia ${orderId} (transakcja P24 orderId=${n.orderId}):`,
      orderErr.message
    );
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }
  if (!orderRow) {
    console.error(
      `P24 probki: zamówienie ${orderId} nie istnieje (transakcja P24 orderId=${n.orderId})`
    );
    return NextResponse.json({ received: true });
  }

  const order = orderRow as unknown as {
    status: SampleOrderStatus;
    payment_status: SamplePaymentStatus;
    amount_total: number;
  };

  // Płatność za ANULOWANE zamówienie — pieniądze przyszły za coś, czego nie
  // wyślemy. `sample_orders` nie ma admin_note (migracja 67), więc JEDYNYM
  // trwałym śladem transakcji jest payment_ref: dlatego nie wychodzimy tutaj,
  // tylko rozliczamy dalej normalnie i zapisujemy referencję, po której
  // właścicielka zrobi zwrot. Anulowanie zwróciło już darmową pulę.
  const cancelled = order.status === "cancelled";
  if (cancelled) {
    console.error(
      `P24 probki: płatność za ANULOWANE zamówienie ${orderId} (transakcja P24 orderId=${n.orderId}) — ręczna obsługa (zwrot)`
    );
  }

  // Dedup: już rozliczone → idempotentnie OK. Ta sama bramka co status !== "pending"
  // przy meblach; markSampleOrderPaid i tak nie zapłaci dwa razy, ale tu
  // oszczędzamy zbędny verify.
  if (order.payment_status === "paid") {
    return NextResponse.json({ received: true });
  }

  // BRAMKA 2 (autorytatywna): asercja kwoty i waluty przed verify. Próbki są
  // PLN-only (buildSampleP24Params, /de zamrożone) — nie ma gałęzi EUR.
  // Zamówienie w całości darmowe ma amount_total = 0 i payment_status "none",
  // więc każda notyfikacja z prawdziwą kwotą odbije się właśnie tutaj.
  const expectedAmount = expectedSampleAmount(Number(order.amount_total));
  if (n.amount !== expectedAmount || n.currency !== "PLN") {
    console.error(
      `P24 probki: NIEZGODNA kwota/waluta dla ${orderId} (transakcja P24 orderId=${n.orderId}, notif ${n.amount}/${n.currency} vs oczek. ${expectedAmount}/PLN) — NIE rozliczam`
    );
    return NextResponse.json({ received: true });
  }

  const verified = await verifyTransaction({
    sessionId: orderId,
    orderId: n.orderId,
    amount: expectedAmount,
    currency: "PLN",
  });
  if (!verified) {
    console.error(
      `P24 probki: verify nieudany dla ${orderId} (transakcja P24 orderId=${n.orderId}) — zostaje pending`
    );
    return NextResponse.json({ received: true });
  }

  // Idempotentny claim pending→paid. Zwraca true TYLKO przy pierwszym
  // rozliczeniu — logiki dedupu nie duplikujemy tutaj.
  let claimedFirst = false;
  try {
    claimedFirst = await markSampleOrderPaid(orderId, String(n.orderId));
  } catch (err) {
    console.error(
      `P24 probki: błąd markSampleOrderPaid dla ${orderId} (transakcja P24 orderId=${n.orderId}):`,
      err
    );
    return NextResponse.json({ error: "DB error" }, { status: 500 }); // P24 ponowi
  }

  if (claimedFirst && !cancelled) {
    // ⟵ TASK 7 (maile) WPINA SIĘ TUTAJ i tylko tutaj.
    //
    // Warunek jest już policzony poprawnie i nie wolno go rozluźnić:
    //   `claimedFirst` — ponowiona notyfikacja P24 nie wyśle drugiego
    //                    potwierdzenia (CAS pending→paid ma jednego zwycięzcę),
    //   `!cancelled`   — za anulowane zamówienie nie dziękujemy klientowi
    //                    za zakup; tu potrzebny jest sygnał do zwrotu, nie mail.
    //
    // Wysyłkę odpalić przez `after(() => ...)` z "next/server" (jak
    // /api/p24/status): zawieszone `await` trzyma połączenie notyfikacji
    // otwarte, a P24 ponawia, dopóki nie dostanie 200 — wolny mail wyglądałby
    // jak nieudana notyfikacja mimo rozliczonego zamówienia. Funkcja wysyłająca
    // nie może rzucać, żeby nieudany mail nie zamienił się w 500.
    after(async () => {
      await notifyCustomerSampleOrder(orderId);
      await notifyAdminNewSampleOrder(orderId);
    });
  }

  return NextResponse.json({ received: true });
}
