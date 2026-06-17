import { NextResponse } from "next/server";

// ============================================================
// POST /api/baselinker/sync-products — WYŁĄCZONY
// ============================================================
// Synchronizacja produktów z BaseLinker została wyłączona — produkty są
// zarządzane natywnie w sklepie. Endpoint zachowany jako legacy (410 Gone).
// Pełna logika syncu zostaje w app/_lib/baselinker-sync.ts (nieużywana).

export function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Synchronizacja z BaseLinker została wyłączona.",
    },
    { status: 410 }
  );
}
