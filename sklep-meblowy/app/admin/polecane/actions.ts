"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateFeaturedCache } from "@/app/_lib/featured";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// ============================================================
// ADD — dodaj produkt do featured (na końcu listy)
// ============================================================
export async function addFeatured(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const productId = sanitize(formData.get("product_id"));
  if (!productId) return { ok: false, error: "Brak id produktu" };

  const badge = emptyToNull(sanitize(formData.get("badge"), 50));

  const supabase = await createAdminClient();

  const { data: maxRow } = await supabase
    .from("featured_products")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("featured_products").insert({
    product_id: productId,
    badge,
    sort_order: nextOrder,
  } as never);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Ten produkt jest już w polecanych" };
    }
    return { ok: false, error: error.message };
  }

  invalidateFeaturedCache();
  revalidatePath("/admin/polecane");
  revalidatePath("/");
  return { ok: true, message: "Produkt dodany do polecanych" };
}

// ============================================================
// UPDATE — zmień badge polecanego
// ============================================================
export async function updateFeaturedBadge(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const badge = emptyToNull(sanitize(formData.get("badge"), 50));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("featured_products")
    .update({ badge } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateFeaturedCache();
  revalidatePath("/admin/polecane");
  revalidatePath("/");
  return { ok: true, message: "Badge zapisany" };
}

// ============================================================
// DELETE
// ============================================================
export async function removeFeatured(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("featured_products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFeaturedCache();
  revalidatePath("/admin/polecane");
  revalidatePath("/");
  return { ok: true, message: "Produkt usunięty z polecanych" };
}

// ============================================================
// REORDER
// ============================================================
export async function reorderFeatured(
  order: { id: string; sort_order: number }[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }

  const supabase = await createAdminClient();
  for (const { id, sort_order } of order) {
    if (!id) continue;
    const { error } = await supabase
      .from("featured_products")
      .update({ sort_order } as never)
      .eq("id", id);
    if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };
  }

  invalidateFeaturedCache();
  revalidatePath("/admin/polecane");
  revalidatePath("/");
  return { ok: true, message: "Kolejność zapisana" };
}
