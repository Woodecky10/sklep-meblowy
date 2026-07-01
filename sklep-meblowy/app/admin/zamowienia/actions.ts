"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { canTransition } from "@/app/_lib/order-status";
import type { OrderStatus } from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function sanitizeText(input: unknown, max: number): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

// Koszt dostawy: pusty → null, liczba >= 0 → liczba (2 miejsca), inaczej null.
function parseCost(input: unknown): number | null {
  if (typeof input !== "string" || input.trim() === "") return null;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };
  if (!ALL_STATUSES.includes(newStatus as OrderStatus)) {
    return { ok: false, error: "Nieprawidłowy status" };
  }
  const to = newStatus as OrderStatus;

  const supabase = await createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Zamówienie nie znalezione" };

  const from = (row as { status: OrderStatus }).status;
  if (!canTransition(from, to)) {
    return { ok: false, error: `Niedozwolona zmiana statusu: ${from} → ${to}` };
  }

  // CAS po odczytanym statusie — nie nadpisujemy równoległej zmiany.
  const { error } = await supabase
    .from("orders")
    .update({ status: to, status_updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", from);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Status zaktualizowany" };
}

export async function updateOrderFulfillment(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const carrier = sanitizeText(formData.get("carrier"), 120);
  const trackingNumber = sanitizeText(formData.get("tracking_number"), 120);
  const deliveryCost = parseCost(formData.get("delivery_cost"));
  const deliveryPaid = formData.get("delivery_paid") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      carrier: carrier || null,
      tracking_number: trackingNumber || null,
      delivery_cost: deliveryCost,
      delivery_paid: deliveryPaid,
    } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Zapisano dane dostawy" };
}

export async function updateOrderNote(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const note = sanitizeText(formData.get("admin_note"), 2000);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ admin_note: note || null } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Notatka zapisana" };
}

// Trwale usuwa zamówienie. order_items i order_issues znikają kaskadowo
// (FK ON DELETE CASCADE). Operacja nieodwracalna — UI wymaga potwierdzenia.
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Zamówienie usunięte" };
}
