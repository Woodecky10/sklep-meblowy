"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken, markInviteUsed } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";
import { poluDlaNowegoZapisu } from "@/app/_lib/reviews-moderation";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function submitGuestReview(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const invite = await findInviteByToken(token);
  // Ten sam komunikat dla „nie ma takiego" i „nieważny": nie podpowiadamy
  // zgadującemu, czy trafił w istniejący token.
  if (!invite || inviteState(invite, new Date()) !== "ok") {
    return { ok: false, error: "Link jest nieprawidłowy lub stracił ważność" };
  }

  const rating = Math.round(Number(formData.get("rating")));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Wybierz ocenę od 1 do 5 gwiazdek" };
  }
  const imie = String(formData.get("imie") ?? "").trim().slice(0, 80);
  if (imie.length < 2) return { ok: false, error: "Podaj imię" };
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  if (!email.includes("@")) return { ok: false, error: "Podaj poprawny adres e-mail" };
  const tresc = String(formData.get("tresc") ?? "").trim().slice(0, 2000);

  const admin = await createAdminClient();
  const { error } = await admin.from("product_reviews").insert({
    product_id: invite.product_id,
    user_id: null,
    guest_name: imie,
    guest_email: email,
    rating,
    comment: tresc || null,
    ...poluDlaNowegoZapisu(),
  } as never);

  if (error) {
    // Najczęstszy przypadek: uniq_review_guest — ten adres już ocenił ten
    // produkt. Treść błędu z bazy nie idzie do klienta (wyciek schematu).
    // Logujemy WYŁĄCZNIE code+message — error.details od PostgREST dla tego
    // konfliktu brzmi „Key (product_id, lower(guest_email))=(…, jan@x.pl)
    // already exists.” i wsadziłby adres gościa do logów Vercela, mimo że
    // adres ma służyć wyłącznie do odróżniania autorów.
    console.error("[opinie] zapis opinii gościa nieudany:", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "Nie udało się zapisać opinii. Możliwe, że już ją wystawiłeś." };
  }

  // Token jednorazowy — zużywamy DOPIERO po udanym zapisie, żeby błąd
  // walidacji nie spalił linku.
  await markInviteUsed(invite.id);
  // Opinia publikuje się od razu — odśwież wszystkie ścieżki jej widoczności.
  // Karta produktu i /sklep biorą ją do średniej; / ma slider opinii; /opinie
  // listuje wszystkie zatwierdzone (Omnibus). /admin/opinie to panel admina.
  revalidatePath(`/produkt/${invite.product_id}`);
  revalidatePath("/sklep");
  revalidatePath("/opinie");
  revalidatePath("/");
  revalidatePath("/admin/opinie");
  return { ok: true, message: "Dziękujemy! Opinia pojawi się po sprawdzeniu." };
}
