"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type { OrderIssueStatus } from "@/app/_lib/order-issues";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ALLOWED_STATUSES: OrderIssueStatus[] = ["new", "read", "replied", "closed"];

export async function setOrderIssueStatus(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as OrderIssueStatus;
  if (!id) return { ok: false, error: "Brak id" };
  if (!ALLOWED_STATUSES.includes(status)) return { ok: false, error: "Nieprawidłowy status" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("order_issues").update({ status } as never).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reklamacje");
  return { ok: true, message: `Status zmieniony na "${status}"` };
}

export async function deleteOrderIssue(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("order_issues").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/reklamacje");
  return { ok: true, message: "Zgłoszenie usunięte" };
}
