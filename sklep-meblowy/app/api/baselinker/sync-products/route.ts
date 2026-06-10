import { NextResponse, type NextRequest } from "next/server";
import {
  syncProductsFromBaseLinker,
  logSyncOutcome,
} from "@/app/_lib/baselinker-sync";

// ============================================================
// POST /api/baselinker/sync-products
// ============================================================
// Pełna logika sync siedzi w app/_lib/baselinker-sync.ts żeby admin panel
// mógł reusować przez server action. Ten endpoint jest tylko dla cron'a /
// external triggera (zabezpieczony sekretem).

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Preferuj nagłówek x-sync-secret — sekret w query stringu ląduje
  // w logach dostępowych. ?key= zostaje dla kompatybilności z istniejącą
  // konfiguracją crona.
  const key = request.headers.get("x-sync-secret") ?? searchParams.get("key");
  const expected = process.env.BASELINKER_SYNC_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "BASELINKER_SYNC_SECRET nie jest ustawiony w env" },
      { status: 500 }
    );
  }
  if (key !== expected) {
    return NextResponse.json({ error: "Nieprawidłowy klucz" }, { status: 401 });
  }

  const startedAt = Date.now();
  const outcome = await syncProductsFromBaseLinker();
  const durationMs = Date.now() - startedAt;

  // Best-effort log — nie blokujemy odpowiedzi jak log padnie
  await logSyncOutcome(outcome, durationMs, null).catch((err) => {
    console.error("[BL sync] zapis logu nieudany:", err);
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        where: outcome.where,
        code: outcome.code,
        message: outcome.error,
      },
      { status: outcome.where === "BaseLinker API" ? 502 : 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    duration_ms: durationMs,
    totals: outcome.totals,
    results: outcome.results,
    warning: outcome.warning,
  });
}
