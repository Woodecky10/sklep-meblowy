"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type { ActionResult } from "@/app/_lib/types";

// Zapis globalnego kursu PLN->EUR. Walidacja > 0. Po zapisie revaliduje layout,
// bo ceny EUR są renderowane wszędzie (seed kursu w root layout).
export async function updateEurRate(rate: number): Promise<ActionResult> {
  await requireAdmin();
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: "Kurs musi być liczbą większą od 0" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ eur_rate: rate, updated_at: new Date().toISOString() } as never)
    .eq("id", true);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin/ustawienia");
  return { ok: true, message: "Zapisano kurs EUR" };
}
