import { NextResponse, type NextRequest } from "next/server";
import { safeCompareSecret } from "@/app/_lib/secure-compare";
import { translatePendingProducts } from "@/app/_lib/translation-service";

// ============================================================
// GET /api/cron/translate
// ============================================================
// Tłumaczy partię produktów z needs_translation=true (PL→DE przez DeepL).
// Wołane przez Vercel Cron (vercel.json) — Vercel dokleja
// Authorization: Bearer $CRON_SECRET.
// Ręczny test: nagłówek `x-sync-secret: $BASELINKER_SYNC_SECRET`.
//
// Next 16: route handlery NIE są cache'owane domyślnie, a ten czyta nagłówki +
// pyta DB (API request-time) → zawsze leci świeżo. Żaden `dynamic` nie trzeba.

function isAuthorized(request: NextRequest, cronSecret?: string, syncSecret?: string): boolean {
  if (cronSecret && safeCompareSecret(request.headers.get("authorization"), `Bearer ${cronSecret}`)) return true;
  if (syncSecret && safeCompareSecret(request.headers.get("x-sync-secret"), syncSecret)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.BASELINKER_SYNC_SECRET;
  if (!cronSecret && !syncSecret) {
    return NextResponse.json({ error: "Brak CRON_SECRET i BASELINKER_SYNC_SECRET" }, { status: 500 });
  }
  if (!isAuthorized(request, cronSecret, syncSecret)) {
    return NextResponse.json({ error: "Nieautoryzowany" }, { status: 401 });
  }
  if (!process.env.DEEPL_API_KEY) {
    return NextResponse.json({ error: "Brak DEEPL_API_KEY" }, { status: 500 });
  }
  try {
    const products = await translatePendingProducts();
    console.log(`[translate] produkty: ${JSON.stringify(products)}`);
    if (products.scanned > 0 && products.failed === products.scanned) {
      return NextResponse.json(
        { error: "Wszystkie tłumaczenia w tej partii nieudane", products },
        { status: 500 }
      );
    }
    return NextResponse.json({ products });
  } catch (e) {
    console.error("[translate] błąd sweepa:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Nieznany błąd" },
      { status: 500 }
    );
  }
}
