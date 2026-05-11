"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { normalizeCode } from "@/app/_lib/promo";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function parseNumber(input: unknown): number | null {
  if (typeof input === "string" && input.trim() !== "") {
    const n = Number(input.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof input === "number" && Number.isFinite(input)) return input;
  return null;
}

function parseInteger(input: unknown): number | null {
  const n = parseNumber(input);
  return n === null ? null : Math.trunc(n);
}

function parseDateTimeLocal(input: unknown): string | null {
  const v = sanitize(input);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ============================================================
// CREATE
// ============================================================
export async function createPromoCode(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const code = normalizeCode(sanitize(formData.get("code"), 50));
  if (!code) return { ok: false, error: "Kod jest wymagany" };
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return { ok: false, error: "Kod może zawierać tylko litery A-Z, cyfry, '-' i '_'" };
  }

  const discountType = sanitize(formData.get("discount_type"), 10);
  if (discountType !== "percent" && discountType !== "fixed") {
    return { ok: false, error: "Wybierz typ zniżki" };
  }

  const discountValue = parseNumber(formData.get("discount_value"));
  if (discountValue === null || discountValue <= 0) {
    return { ok: false, error: "Wartość zniżki musi być większa od 0" };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "Procent zniżki nie może przekroczyć 100" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.from("promo_codes").insert({
    code,
    discount_type: discountType,
    discount_value: discountValue,
    valid_from: parseDateTimeLocal(formData.get("valid_from")),
    valid_to: parseDateTimeLocal(formData.get("valid_to")),
    max_uses: parseInteger(formData.get("max_uses")),
    min_order_value: parseNumber(formData.get("min_order_value")),
    active: formData.get("active") === "1",
  } as never);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Kod "${code}" już istnieje` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/kody-rabatowe");
  return { ok: true, message: `Kod "${code}" utworzony` };
}

// ============================================================
// UPDATE
// ============================================================
export async function updatePromoCode(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const discountType = sanitize(formData.get("discount_type"), 10);
  if (discountType !== "percent" && discountType !== "fixed") {
    return { ok: false, error: "Wybierz typ zniżki" };
  }

  const discountValue = parseNumber(formData.get("discount_value"));
  if (discountValue === null || discountValue <= 0) {
    return { ok: false, error: "Wartość zniżki musi być większa od 0" };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "Procent zniżki nie może przekroczyć 100" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("promo_codes")
    .update({
      discount_type: discountType,
      discount_value: discountValue,
      valid_from: parseDateTimeLocal(formData.get("valid_from")),
      valid_to: parseDateTimeLocal(formData.get("valid_to")),
      max_uses: parseInteger(formData.get("max_uses")),
      min_order_value: parseNumber(formData.get("min_order_value")),
      active: formData.get("active") === "1",
    } as never)
    .eq("id", id);

  // Kod (code) niezmienny po utworzeniu — historyczne zamówienia
  // mają promo_code_id, a kod był rozdawany klientom; zmiana wartości
  // mogłaby zaskoczyć. Stwórz nowy kod jeśli potrzeba.

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/kody-rabatowe");
  return { ok: true, message: "Kod zaktualizowany" };
}

// ============================================================
// DELETE
// ============================================================
export async function deletePromoCode(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/kody-rabatowe");
  return { ok: true, message: "Kod usunięty" };
}

// ============================================================
// TOGGLE ACTIVE
// ============================================================
export async function togglePromoActive(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("promo_codes")
    .update({ active } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/kody-rabatowe");
  return { ok: true, message: active ? "Kod aktywny" : "Kod ukryty" };
}
