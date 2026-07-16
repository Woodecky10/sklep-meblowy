"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateBundlesCache } from "@/app/_lib/bundles-server";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Wspólna walidacja pól formularza zestawu. Zwraca błąd (string) albo dane.
function parseBundleForm(formData: FormData, productIds: string[]):
  | { ok: true; name: string; nameDe: string | null; description: string | null;
      descriptionDe: string | null; discountType: "percent" | "amount";
      discountValue: number; isActive: boolean }
  | { ok: false; error: string } {
  const name = sanitize(formData.get("name"), 200);
  if (!name) return { ok: false, error: "Nazwa zestawu jest wymagana" };
  if (productIds.length < 2)
    return { ok: false, error: "Zestaw musi zawierać co najmniej 2 produkty" };
  if (new Set(productIds).size !== productIds.length)
    return { ok: false, error: "Produkty w zestawie nie mogą się powtarzać" };

  const discountType = sanitize(formData.get("discount_type"), 10);
  if (discountType !== "percent" && discountType !== "amount")
    return { ok: false, error: "Wybierz typ rabatu (% lub zł)" };

  const discountValue = Number(formData.get("discount_value"));
  if (!Number.isFinite(discountValue) || discountValue <= 0)
    return { ok: false, error: "Wartość rabatu musi być większa od zera" };
  if (discountType === "percent" && (discountValue < 1 || discountValue > 90))
    return { ok: false, error: "Rabat procentowy musi być w zakresie 1–90%" };

  return {
    ok: true,
    name,
    nameDe: emptyToNull(sanitize(formData.get("name_de"), 200)),
    description: emptyToNull(sanitize(formData.get("description"), 2000)),
    descriptionDe: emptyToNull(sanitize(formData.get("description_de"), 2000)),
    discountType,
    discountValue,
    isActive: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

function invalidateAll() {
  invalidateBundlesCache();
  // Boxy zestawów siedzą na kartach produktów i stronach /zestaw/* — pełny
  // revalidate jak przy publikacji menu/podstron (prostota > chirurgia).
  revalidatePath("/", "layout");
  revalidatePath("/admin/zestawy");
}

export async function createBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const slugInput = sanitize(formData.get("slug"), 80);
  const slug = slugInput ? toSlug(slugInput) : toSlug(parsed.name);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować adresu (slug)" };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("bundles")
    .insert({
      slug,
      name: parsed.name,
      name_de: parsed.nameDe,
      description: parsed.description,
      description_de: parsed.descriptionDe,
      discount_type: parsed.discountType,
      discount_value: parsed.discountValue,
      is_active: parsed.isActive,
    } as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `Zestaw o adresie "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  // Skład w drugim kroku przez RPC. Gdy padnie — zestaw istnieje bez składu,
  // jest NIEWIDOCZNY dla klientów (< 2 składników) i da się naprawić edycją.
  const { error: itemsErr } = await supabase.rpc("save_bundle", {
    p_id: (data as { id: string }).id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (itemsErr)
    return { ok: false, error: `Zestaw utworzony, ale skład się nie zapisał — otwórz go i zapisz ponownie (${itemsErr.message})` };

  invalidateAll();
  return { ok: true, message: `Zestaw "${parsed.name}" utworzony` };
}

export async function saveBundle(
  formData: FormData,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const parsed = parseBundleForm(formData, productIds);
  if (!parsed.ok) return parsed;

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("save_bundle", {
    p_id: id,
    p_name: parsed.name,
    p_name_de: parsed.nameDe,
    p_description: parsed.description,
    p_description_de: parsed.descriptionDe,
    p_discount_type: parsed.discountType,
    p_discount_value: parsed.discountValue,
    p_is_active: parsed.isActive,
    p_product_ids: productIds,
  });
  if (error) return { ok: false, error: error.message };

  invalidateAll();
  return { ok: true, message: "Zestaw zapisany" };
}

export async function deleteBundle(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("bundles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateAll();
  return { ok: true, message: "Zestaw usunięty" };
}
