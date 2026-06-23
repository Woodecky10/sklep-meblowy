"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";

export type CancelOrderResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Anulowanie zamówienia przez klienta — TYLKO gdy status === 'pending'
// (jeszcze nieopłacone). Po opłaceniu zamówieniem zarządza admin w panelu
// /admin/zamowienia — anulowanie wymaga wtedy kontaktu ze sklepem.
//
// Stock i promo_codes.used_count nie są dotykane:
// - Stock nie jest dekrementowany przy tworzeniu zamówienia w tym sklepie.
// - used_count jest inkrementowany dopiero w Stripe webhook po opłaceniu —
//   więc dla pending order kupon NIE jest jeszcze policzony jako użyty.
export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

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
    return { ok: false, error: tr("Zamówienie nie istnieje lub nie należy do Ciebie", "Bestellung existiert nicht oder gehört nicht Ihnen") };
  }
  if ((order as { status: string }).status !== "pending") {
    return {
      ok: false,
      error: tr(
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
        "Diese Bestellung kann nicht mehr storniert werden. Bitte kontaktieren Sie uns."
      ),
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
    console.error(updateErr.message);
    return {
      ok: false,
      error: tr(
        "Nie udało się anulować zamówienia. Spróbuj ponownie.",
        "Die Bestellung konnte nicht storniert werden. Bitte versuchen Sie es erneut."
      ),
    };
  }
  if (!updated || updated.length === 0) {
    // Status zmienił się między odczytem a CAS (np. webhook pending→paid).
    return {
      ok: false,
      error: tr(
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
        "Diese Bestellung kann nicht mehr storniert werden. Bitte kontaktieren Sie uns."
      ),
    };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  revalidatePath("/konto/zamowienia");

  return { ok: true, message: tr("Zamówienie zostało anulowane", "Die Bestellung wurde storniert") };
}
