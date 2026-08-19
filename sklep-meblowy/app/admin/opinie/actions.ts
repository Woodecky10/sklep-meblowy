"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import {
  poluDlaPrzejrzenia,
  poluDlaUsuniecia,
  poluDlaPrzywrocenia,
} from "@/app/_lib/reviews-moderation";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// Wspólny zapis + odświeżenia. revalidatePath("/") jest tu konieczne, bo
// slider opinii stoi na stronie głównej, a /sklep i karta produktu niosą
// średnią ocen. revalidatePath("/opinie") z tego samego powodu: ta strona
// listuje WSZYSTKIE zatwierdzone opinie (getAllApprovedReviews) — wymóg
// Omnibusa nie pozwala jej filtrować ocen — więc zdjęcie/przywrócenie/
// przejrzenie zmienia dokładnie to, co ona pokazuje.
async function zapisz(
  reviewId: string,
  pola: Record<string, unknown>,
  komunikat: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!reviewId) return { ok: false, error: "Brak id opinii" };

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .update(pola as never)
    .eq("id", reviewId)
    .select("product_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Opinia nie znaleziona" };

  const productId = (data[0] as { product_id: string }).product_id;
  revalidatePath("/admin/opinie");
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  return { ok: true, message: komunikat };
}

// poluDlaPrzejrzenia zapisuje TAKŻE status: 'approved', nie tylko stempel —
// zobacz komentarz przy jej definicji. Bez tego wiersz zapisany jako 'pending'
// w oknie między migracją 78 a wdrożeniem kodu ginąłby na zawsze po kliknięciu
// „Przejrzane": znika z „nowe" (moderated_at przestaje być puste), a do
// „opublikowane" i tak nie trafia (tam wymóg to status = 'approved').
export async function oznaczPrzejrzana(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaPrzejrzenia(new Date()), "Oznaczono jako przejrzaną");
}

export async function usunZWitryny(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaUsuniecia(new Date()), "Opinia zdjęta ze strony");
}

export async function przywrocNaWitryne(reviewId: string): Promise<ActionResult> {
  return zapisz(reviewId, poluDlaPrzywrocenia(), "Opinia wróciła na stronę");
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
