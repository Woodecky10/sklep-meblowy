import { NextResponse, type NextRequest } from "next/server";
import { getP24Config, verifyTransaction } from "@/app/_lib/p24";
import { isValidNotification, type P24Notification } from "@/app/_lib/p24-events";
import { getSampleOrderById, markSampleOrderPaid } from "@/app/_lib/samples";

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
  const order = await getSampleOrderById(orderId);
  if (!order) {
    // 200, bo P24 nie ma czego ponawiać — takiego zamówienia po prostu nie ma.
    // ⚠️ ZNANE OGRANICZENIE: getSampleOrderById połyka błąd odczytu i też zwraca
    // null, więc chwilowa awaria bazy jest tu NIE DO ODRÓŻNIENIA od nieistnieją-
    // cego zamówienia — a wtedy 200 kasuje ponowienie. Warstwa danych jest
    // zamknięta w tym tasku; ślad zostaje w logu razem z numerem transakcji P24,
    // po którym da się rozliczyć ręcznie. Docelowo: getSampleOrderById powinno
    // rozróżniać „brak wiersza" od „błąd" (wtedy tu 500).
    console.error(
      `P24 probki: zamówienie ${orderId} nie istnieje (transakcja P24 orderId=${n.orderId})`
    );
    return NextResponse.json({ received: true });
  }

  // Płatność za ANULOWANE zamówienie — pieniądze przyszły za coś, czego nie
  // wyślemy. `sample_orders` nie ma admin_note (migracja 67), więc JEDYNYM
  // trwałym śladem transakcji jest payment_ref: dlatego nie wychodzimy tutaj,
  // tylko rozliczamy dalej normalnie i zapisujemy referencję, po której
  // właścicielka zrobi zwrot. Anulowanie zwróciło już darmową pulę.
  const cancelled = order.status === "cancelled";
  if (cancelled) {
    console.error(
      `P24 probki: płatność za ANULOWANE zamówienie ${orderId} — ręczna obsługa (zwrot)`
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
      `P24 probki: NIEZGODNA kwota/waluta dla ${orderId} (notif ${n.amount}/${n.currency} vs oczek. ${expectedAmount}/PLN) — NIE rozliczam`
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
    console.error(`P24 probki: verify nieudany dla ${orderId} — zostaje pending`);
    return NextResponse.json({ received: true });
  }

  // Idempotentny claim pending→paid. Zwraca true TYLKO przy pierwszym
  // rozliczeniu — logiki dedupu nie duplikujemy tutaj.
  let claimedFirst = false;
  try {
    claimedFirst = await markSampleOrderPaid(orderId, String(n.orderId));
  } catch (err) {
    console.error("P24 probki: błąd markSampleOrderPaid:", err);
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
  }

  return NextResponse.json({ received: true });
}
