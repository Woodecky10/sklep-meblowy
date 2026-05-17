"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/app/_lib/supabase/server";

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

  // RLS sam blokuje dostęp do cudzych zamówień, ale dla pewnego komunikatu
  // o błędzie weryfikujemy ownership + status zanim zaktualizujemy.
  const { data: order, error: loadErr } = await supabase
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

  const { error: updateErr } = await supabase
    .from("orders")
    .update({ status: "cancelled" } as never)
    .eq("id", orderId)
    .eq("user_id", user.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  revalidatePath("/konto/zamowienia");

  return { ok: true, message: "Zamówienie zostało anulowane" };
}
