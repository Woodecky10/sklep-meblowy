"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";

export type CancelOrderResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Anulowanie zamówienia przez klienta — TYLKO gdy status === 'pending'
// (jeszcze nieopłacone). Po opłaceniu BL już dostał order, anulowanie
// musi iść przez admin/BL panel.
//
// Stock i promo_codes.used_count nie są dotykane:
// - Stock nie jest dekrementowany przy tworzeniu zamówienia w tym sklepie.
// - used_count jest inkrementowany dopiero w Stripe webhook po opłaceniu —
//   więc dla pending order kupon NIE jest jeszcze policzony jako użyty.
export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Musisz być zalogowany" };

  // Service-role: po utwardzeniu RLS (migracja 26) klient nie ma prawa UPDATE
  // na orders — mutacja idzie service-rolem, a ownership i dozwolone przejście
  // wymuszamy TU. Ładujemy WŁASNE zamówienie (filtr user_id z sesji), a sama
  // zmiana to CAS pending→cancelled scoped po user_id (atomowo blokuje wyścig
  // z webhookiem pending→paid i cudze zamówienia).
  const admin = await createAdminClient();
  const { data: order, error: loadErr } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (loadErr || !order) {
    return { ok: false, error: "Zamówienie nie istnieje lub nie należy do Ciebie" };
  }
  if ((order as { status: string }).status !== "pending") {
    return {
      ok: false,
      error:
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
    };
  }

  const { data: updated, error: updateErr } = await admin
    .from("orders")
    .update({ status: "cancelled" } as never)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }
  if (!updated || updated.length === 0) {
    // Status zmienił się między odczytem a CAS (np. webhook pending→paid).
    return {
      ok: false,
      error:
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
    };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  revalidatePath("/konto/zamowienia");

  return { ok: true, message: "Zamówienie zostało anulowane" };
}
