"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { ReviewStatus } from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const DOZWOLONE: ReviewStatus[] = ["pending", "approved", "rejected"];

export async function setReviewStatus(
  reviewId: string,
  status: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };
  if (!DOZWOLONE.includes(status as ReviewStatus)) {
    return { ok: false, error: "Nieprawidłowy status" };
  }

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .update({ status } as never)
    .eq("id", reviewId)
    .select("product_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Opinia nie znaleziona" };

  const productId = (data[0] as { product_id: string }).product_id;
  revalidatePath("/admin/opinie");
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  // Zatwierdzenie zmienia średnią ocen widoczną na kafelkach strony głównej.
  revalidatePath("/");
  return { ok: true, message: status === "approved" ? "Opinia opublikowana" : "Zapisano" };
}

export async function setReviewHomepageExcluded(
  reviewId: string,
  excluded: boolean
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };

  const admin = await createAdminClient();
  const { error } = await admin
    .from("product_reviews")
    .update({ homepage_excluded: excluded } as never)
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/opinie");
  revalidatePath("/");
  return { ok: true, message: excluded ? "Ukryto na stronie głównej" : "Wróciło na stronę główną" };
}
