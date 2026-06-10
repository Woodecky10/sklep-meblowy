import { NextResponse, type NextRequest } from "next/server";
import { pushOrderToBaseLinker } from "@/app/_lib/baselinker-orders";
import { BaseLinkerError } from "@/app/_lib/baselinker";

// ============================================================
// POST /api/baselinker/push-order?key={SECRET}&orderId={uuid}
// ============================================================
// Ręczny push istniejącego zamówienia do BaseLinker.
// Użyteczne gdy webhook Stripe nie dojdzie (np. lokalnie bez Stripe CLI)
// albo gdy chcemy retry'ować nieudany push.
// Idempotentne — jeśli order już ma baselinker_order_id, nic nie robi.

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Preferuj nagłówek x-sync-secret (sekret w query lądowałby w logach);
  // ?key= zostaje dla kompatybilności.
  const key = request.headers.get("x-sync-secret") ?? searchParams.get("key");
  const orderId = searchParams.get("orderId");

  const expected = process.env.BASELINKER_SYNC_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "BASELINKER_SYNC_SECRET nie jest ustawiony" },
      { status: 500 }
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Nieprawidłowy klucz" }, { status: 401 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "Brak parametru orderId" }, { status: 400 });
  }

  try {
    const result = await pushOrderToBaseLinker(orderId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BaseLinkerError) {
      return NextResponse.json(
        {
          ok: false,
          where: "BaseLinker API",
          method: err.method,
          code: err.errorCode,
          message: err.message,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Nieznany błąd" },
      { status: 500 }
    );
  }
}
