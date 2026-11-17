"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { fabricSizeFromForm } from "@/app/_lib/fabric-sizes";
import { invalidateFabricSizesCache } from "@/app/_lib/fabric-sizes-data";
import {
  RECOMPUTE_FAILED_RETRY,
  recomputeFabricSurcharges,
} from "@/app/_lib/fabric-surcharge-recompute";
import type { ActionResult } from "./actions";

// „w 1 produkcie", „w 2/5/0 produktach" — miejscownik liczby mnogiej jest
// jeden dla wszystkich liczb poza 1.
function inProducts(n: number): string {
  return `w ${n} ${n === 1 ? "produkcie" : "produktach"}`;
}

// Kody grup cenowych (klucze map dopłat rozmiaru). Błąd odczytu = brak zapisu.
async function readGroupCodes(
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.from("fabric_groups").select("code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, codes: (data ?? []).map((g: { code: string }) => g.code) };
}

function formId(formData: FormData): string {
  const id = formData.get("id");
  return typeof id === "string" ? id.trim() : "";
}

export async function createFabricSize(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createAdminClient();
  const groups = await readGroupCodes(supabase);
  if (!groups.ok) return groups;
  const parsed = fabricSizeFromForm(formData, groups.codes);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.from("fabric_sizes").insert({
    name: parsed.name,
    sort_order: parsed.sort_order,
    surcharges: parsed.surcharges,
  });
  if (error) return { ok: false, error: error.message };

  // Nowego rozmiaru nikt jeszcze nie używa — bez przeliczania.
  invalidateFabricSizesCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Dodano rozmiar." };
}

export async function updateFabricSize(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = formId(formData);
  if (!id) return { ok: false, error: "Brak rozmiaru" };
  const supabase = await createAdminClient();
  const groups = await readGroupCodes(supabase);
  if (!groups.ok) return groups;
  const parsed = fabricSizeFromForm(formData, groups.codes);
  if (!parsed.ok) return parsed;

  const { error } = await supabase
    .from("fabric_sizes")
    .update({
      name: parsed.name,
      sort_order: parsed.sort_order,
      surcharges: parsed.surcharges,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricSizesCache();
  const recompute = await recomputeFabricSurcharges();
  revalidatePath("/admin/tkaniny");
  if (!recompute.ok) return { ok: false, error: RECOMPUTE_FAILED_RETRY };
  return { ok: true, message: `Zapisano rozmiar. Przeliczono dopłaty ${inProducts(recompute.updated)}.` };
}

export async function deleteFabricSize(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = formId(formData);
  if (!id) return { ok: false, error: "Brak rozmiaru" };
  const supabase = await createAdminClient();

  const { error } = await supabase.from("fabric_sizes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricSizesCache();
  const recompute = await recomputeFabricSurcharges();
  revalidatePath("/admin/tkaniny");
  if (!recompute.ok) {
    // Ponowne „Usuń" na nieistniejącym już wierszu nie zwraca błędu i
    // przelicza dopłaty od nowa.
    return {
      ok: false,
      error:
        "Usunięto rozmiar, ale nie udało się przeliczyć dopłat w produktach. Kliknij „Usuń” jeszcze raz.",
    };
  }
  return { ok: true, message: `Usunięto rozmiar. Przeliczono dopłaty ${inProducts(recompute.updated)}.` };
}
